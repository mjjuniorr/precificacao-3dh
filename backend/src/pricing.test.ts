import assert from "node:assert/strict";
import test from "node:test";
import { calculatePricing } from "./pricing.js";

test("calculo reverso considera imposto de venda sobre o preco", () => {
  const result = calculatePricing({
    purchaseUnit: 80,
    freightUnit: 3,
    otherUnit: 0,
    icmsPercent: 16,
    salesTaxPercent: 9,
    marginPercent: 15,
    marketPrice: 135
  });
  assert.equal(result.icmsValue, 12.8);
  assert.equal(result.salesTaxValue, 12.15);
  assert.equal(result.totalUnitCost, 107.95);
  assert.ok(Math.abs(result.profitValue - 27.05) < 0.001);
  assert.equal(result.suggestedPrice, 126.05);
});
