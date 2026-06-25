export type PricingInput = {
  purchaseUnit: number;
  freightUnit: number;
  otherUnit: number;
  icmsPercent: number;
  salesTaxPercent: number;
  marginPercent: number;
  marketPrice: number;
};

export function calculatePricing(input: PricingInput) {
  const acquisitionCost = input.purchaseUnit + input.freightUnit + input.otherUnit;
  const icmsValue = input.purchaseUnit * (input.icmsPercent / 100);
  const costBeforeSale = acquisitionCost + icmsValue;
  const deductions = (input.salesTaxPercent + input.marginPercent) / 100;
  const rawSuggestedPrice = deductions >= 1 ? 0 : costBeforeSale / (1 - deductions);
  const suggestedPrice = Math.round((rawSuggestedPrice + Number.EPSILON) * 100) / 100;
  const marketPrice = input.marketPrice > 0 ? input.marketPrice : suggestedPrice;
  const salesTaxValue = marketPrice * (input.salesTaxPercent / 100);
  const totalUnitCost = costBeforeSale + salesTaxValue;
  const profitValue = marketPrice - totalUnitCost;
  const profitPercent = marketPrice > 0 ? (profitValue / marketPrice) * 100 : 0;

  return {
    acquisitionCost,
    costBeforeSale,
    suggestedPrice,
    marketPrice,
    totalUnitCost,
    salePrice: marketPrice,
    icmsValue,
    salesTaxValue,
    profitValue,
    profitPercent
  };
}

export function mapItem(row: any) {
  const pricing = calculatePricing({
    purchaseUnit: Number(row.purchase_unit),
    freightUnit: Number(row.freight_unit),
    otherUnit: Number(row.other_unit),
    icmsPercent: Number(row.icms_percent),
    salesTaxPercent: Number(row.sales_tax_percent),
    marginPercent: Number(row.margin_percent),
    marketPrice: Number(row.market_price)
  });

  return {
    id: row.id,
    batchId: row.batch_id,
    sku: row.sku,
    description: row.description,
    ncm: row.ncm || "",
    category: row.category || "",
    quantity: Number(row.quantity),
    purchaseUnit: Number(row.purchase_unit),
    freightUnit: Number(row.freight_unit),
    otherUnit: Number(row.other_unit),
    icmsPercent: Number(row.icms_percent),
    salesTaxPercent: Number(row.sales_tax_percent),
    marginPercent: Number(row.margin_percent),
    ...pricing
  };
}
