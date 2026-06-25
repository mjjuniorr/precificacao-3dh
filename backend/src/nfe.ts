import { XMLParser } from "fast-xml-parser";

type ImportParams = {
  freight: number;
  freightMode: "total" | "unit";
  otherCosts: number;
  otherCostsMode: "total" | "unit";
  icmsPercent: number;
  salesTaxPercent: number;
  marginPercent: number;
};

export type ParsedNfe = {
  accessKey: string;
  number: string;
  issueDate: string | null;
  supplier: string;
  supplierTaxId: string;
  total: number;
  products: Array<{
    sku: string;
    description: string;
    ncm: string;
    quantity: number;
    unitValue: number;
    totalValue: number;
    freightUnit: number;
    otherUnit: number;
    icmsPercent: number;
    salesTaxPercent: number;
    marginPercent: number;
  }>;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
  trimValues: true
});

function arr<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseNfeXml(xml: string, params: ImportParams): ParsedNfe {
  const doc = parser.parse(xml);
  const nfe = doc?.nfeProc?.NFe || doc?.NFe;
  const inf = nfe?.infNFe;
  if (!inf?.ide || !inf?.emit || !inf?.det) {
    throw new Error("XML invalido: estrutura de NF-e nao encontrada");
  }

  const details = arr(inf.det);
  if (details.length === 0) throw new Error("NF-e sem produtos");

  const rawProducts = details.map((det: any) => {
    const prod = det.prod;
    const quantity = num(prod.qCom);
    const totalValue = num(prod.vProd);
    return {
      sku: String(prod.cProd || "").trim(),
      description: String(prod.xProd || "").trim(),
      ncm: String(prod.NCM || "").trim(),
      quantity,
      unitValue: num(prod.vUnCom) || (quantity > 0 ? totalValue / quantity : 0),
      totalValue
    };
  });

  const baseTotal = rawProducts.reduce((sum, item) => sum + item.totalValue, 0);
  const baseQuantity = rawProducts.reduce((sum, item) => sum + item.quantity, 0);
  const noteTotal = num(inf.total?.ICMSTot?.vNF) || baseTotal;

  const products = rawProducts.map((item) => {
    const proportional = baseTotal > 0 ? item.totalValue / baseTotal : 0;
    const netTotalValue = noteTotal * proportional;
    const freightUnit =
      params.freightMode === "total"
        ? baseQuantity > 0
          ? params.freight / baseQuantity
          : 0
        : params.freight;
    const otherUnit =
      params.otherCostsMode === "total"
        ? baseQuantity > 0
          ? params.otherCosts / baseQuantity
          : 0
        : params.otherCosts;

    return {
      ...item,
      unitValue: item.quantity > 0 ? netTotalValue / item.quantity : 0,
      totalValue: netTotalValue,
      freightUnit,
      otherUnit,
      icmsPercent: params.icmsPercent,
      salesTaxPercent: params.salesTaxPercent,
      marginPercent: params.marginPercent
    };
  });

  return {
    accessKey: String(inf["@_Id"] || "").replace(/^NFe/, ""),
    number: String(inf.ide.nNF || ""),
    issueDate: inf.ide.dhEmi || inf.ide.dEmi || null,
    supplier: String(inf.emit.xNome || ""),
    supplierTaxId: String(inf.emit.CNPJ || inf.emit.CPF || ""),
    total: noteTotal,
    products
  };
}
