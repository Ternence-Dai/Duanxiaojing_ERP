export function applyStockMovement(balance, movement) {
  if (!Number.isSafeInteger(balance) || balance < 0) throw new RangeError("balance must be a non-negative safe integer");
  if (!movement || typeof movement !== "object") throw new TypeError("movement is required");
  const { sku, quantityDelta, reference, occurredAt } = movement;
  if (typeof sku !== "string" || !sku.trim()) throw new TypeError("sku is required");
  if (!Number.isSafeInteger(quantityDelta) || quantityDelta === 0) throw new RangeError("quantityDelta must be a non-zero safe integer");
  if (typeof reference !== "string" || !reference.trim()) throw new TypeError("reference is required for traceability");
  if (!Number.isFinite(Date.parse(occurredAt))) throw new TypeError("occurredAt must be a valid date");
  const nextBalance = balance + quantityDelta;
  if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) throw new RangeError("movement would create an invalid or negative stock balance");
  return Object.freeze({ sku:sku.trim(), quantityDelta, reference:reference.trim(), occurredAt:new Date(occurredAt).toISOString(), previousBalance:balance, nextBalance });
}
