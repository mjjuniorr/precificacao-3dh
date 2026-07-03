import assert from "node:assert/strict";
import test from "node:test";
import { parseNfeXml } from "./nfe.js";

const xml = `<?xml version="1.0"?>
<NFe><infNFe Id="NFe123">
  <ide><nNF>42</nNF><dhEmi>2026-01-02T10:00:00-04:00</dhEmi></ide>
  <emit><CNPJ>12345678000199</CNPJ><xNome>Fornecedor Teste</xNome></emit>
  <det><prod><cProd>A</cProd><xProd>Produto A</xProd><NCM>1</NCM><qCom>2</qCom><vUnCom>25</vUnCom><vProd>50</vProd></prod></det>
  <det><prod><cProd>B</cProd><xProd>Produto B</xProd><NCM>2</NCM><qCom>1</qCom><vUnCom>50</vUnCom><vProd>50</vProd></prod></det>
  <total><ICMSTot><vNF>150</vNF></ICMSTot></total>
</infNFe></NFe>`;

test("NF-e usa vNF proporcional e divide frete pela quantidade", () => {
  const parsed = parseNfeXml(xml, {
    freight: 30,
    freightMode: "total",
    otherCosts: 0,
    otherCostsMode: "total",
    icmsPercent: 16,
    salesTaxPercent: 9,
    marginPercent: 15
  });
  assert.equal(parsed.accessKey, "123");
  assert.equal(parsed.products[0].unitValue, 37.5);
  assert.equal(parsed.products[1].unitValue, 75);
  assert.equal(parsed.products[0].freightUnit, 10);
  assert.equal(parsed.products[1].freightUnit, 10);
});
