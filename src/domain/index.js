export function applyStockMovement(balance, movement) {
  if (!Number.isFinite(balance) || balance < 0 || Number(balance.toFixed(3)) !== balance) throw new RangeError("balance must be a non-negative quantity with at most 3 decimals");
  if (!movement || typeof movement !== "object") throw new TypeError("movement is required");
  const { sku, quantityDelta, reference, occurredAt } = movement;
  if (typeof sku !== "string" || !sku.trim()) throw new TypeError("sku is required");
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0 || Number(quantityDelta.toFixed(3)) !== quantityDelta) throw new RangeError("quantityDelta must be non-zero with at most 3 decimals");
  if (typeof reference !== "string" || !reference.trim()) throw new TypeError("reference is required for traceability");
  if (!Number.isFinite(Date.parse(occurredAt))) throw new TypeError("occurredAt must be a valid date");
  const nextBalance = Number((balance + quantityDelta).toFixed(3));
  if (!Number.isFinite(nextBalance) || nextBalance < 0) throw new RangeError("movement would create an invalid or negative stock balance");
  return Object.freeze({ sku:sku.trim(), quantityDelta, reference:reference.trim(), occurredAt:new Date(occurredAt).toISOString(), previousBalance:balance, nextBalance });
}
