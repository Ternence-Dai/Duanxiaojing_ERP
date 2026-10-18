function parseOccurredAt(value) {
  if (typeof value !== "string") throw new TypeError("occurredAt must be an ISO-8601 timestamp with an explicit timezone");
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})T([01]\\d|2[0-3]):([0-5]\\d):([0-5]\\d)(?:\\.\\d+)?(Z|[+-](?:0\\d|1[0-4]):[0-5]\\d)$/.exec(value);
  if (!match) throw new TypeError("occurredAt must be an ISO-8601 timestamp with an explicit timezone");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  calendarDate.setUTCHours(0, 0, 0, 0);
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) {
    throw new TypeError("occurredAt contains an invalid calendar date");
  }
  if (zone !== "Z" && zone.slice(1, 3) === "14" && zone.slice(4, 6) !== "00") {
    throw new TypeError("occurredAt contains an invalid timezone offset");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError("occurredAt must be a valid date");
  return new Date(timestamp).toISOString();
}

export function applyStockMovement(balance, movement) {
  if (!Number.isFinite(balance) || balance < 0 || Number(balance.toFixed(3)) !== balance) throw new RangeError("balance must be a non-negative quantity with at most 3 decimals");
  if (!movement || typeof movement !== "object") throw new TypeError("movement is required");
  const { sku, quantityDelta, reference, occurredAt } = movement;
  if (typeof sku !== "string" || !sku.trim()) throw new TypeError("sku is required");
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0 || Number(quantityDelta.toFixed(3)) !== quantityDelta) throw new RangeError("quantityDelta must be non-zero with at most 3 decimals");
  if (typeof reference !== "string" || !reference.trim()) throw new TypeError("reference is required for traceability");
  const normalizedOccurredAt = parseOccurredAt(occurredAt);
  const nextBalance = Number((balance + quantityDelta).toFixed(3));
  if (!Number.isFinite(nextBalance) || nextBalance < 0) throw new RangeError("movement would create an invalid or negative stock balance");
  return Object.freeze({ sku:sku.trim(), quantityDelta, reference:reference.trim(), occurredAt:normalizedOccurredAt, previousBalance:balance, nextBalance });
}
