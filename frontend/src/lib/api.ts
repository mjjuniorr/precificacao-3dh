export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
let accessToken = "";

export function setAccessToken(token: string) {
  accessToken = token;
}

export type PricingItem = {
  id: string;
  sku: string;
  description: string;
  ncm: string;
  category: string;
  quantity: number;
  purchaseUnit: number;
  freightUnit: number;
  otherUnit: number;
  icmsPercent: number;
  salesTaxPercent: number;
  marginPercent: number;
  acquisitionCost: number;
  costBeforeSale: number;
  suggestedPrice: number;
  marketPrice: number;
  totalUnitCost: number;
  salePrice: number;
  icmsValue: number;
  salesTaxValue: number;
  profitValue: number;
  profitPercent: number;
};

export type Summary = {
  totalSkus: number;
  totalQuantity: number;
  stockCost: number;
  saleTotal: number;
  profit: number;
  averageMargin: number;
};

export type ImportBatch = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  parent_batch_id: string | null;
  version_no: number;
  file_count: number;
  summary: Summary;
  supplier: string;
  supplier_tax_id: string;
  note_number: string;
  access_key: string;
  issue_date: string | null;
};

export type SessionUser = {
  sub: string;
  name: string;
  email: string;
  permissions: string[];
};

export class ApiError extends Error {
  status: number;
  body: Record<string, any>;

  constructor(status: number, body: Record<string, any>) {
    super(body.error || "Erro na requisicao");
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body);
  }
  return response.json();
}

export function exportUrl(batchId: string, format: "csv" | "xlsx") {
  return `${API_URL}/api/imports/${batchId}/export.${format}`;
}

export async function downloadExport(batchId: string, format: "csv" | "xlsx") {
  const response = await fetch(exportUrl(batchId, format), {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
  if (!response.ok) throw new Error("Nao foi possivel exportar o arquivo");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `precificacao.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
