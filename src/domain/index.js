function parseOccurredAt(value) {
  if (typeof value !== "string") throw new TypeError("occurredAt must be an ISO-8601 timestamp with an explicit timezone");
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  if (!match) throw new TypeError("occurredAt must be an ISO-8601 timestamp with an explicit timezone and millisecond precision or less");
  const [, yearText, monthText, dayText, , , , , zone] = match;
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

function toMilliunits(value, name, { allowZero = true } = {}) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite quantity`);
  if (Number(value.toFixed(3)) !== value) {
    throw new RangeError(`${name} must be an exactly representable quantity with at most 3 decimals`);
  }
  const scaled = Math.round(value * 1000);
  if (!Number.isSafeInteger(scaled) || (!allowZero && scaled === 0)) {
    throw new RangeError(`${name} must be an exactly representable quantity with at most 3 decimals`);
  }
  return scaled;
}

export function applyStockMovement(balance, movement) {
  const balanceMilliunits = toMilliunits(balance, "balance");
  if (balanceMilliunits < 0) throw new RangeError("balance must be non-negative");
  if (!movement || typeof movement !== "object") throw new TypeError("movement is required");
  const { sku, quantityDelta, reference, occurredAt } = movement;
  if (typeof sku !== "string" || !sku.trim()) throw new TypeError("sku is required");
  const deltaMilliunits = toMilliunits(quantityDelta, "quantityDelta", { allowZero: false });
  if (typeof reference !== "string" || !reference.trim()) throw new TypeError("reference is required for traceability");
  const normalizedOccurredAt = parseOccurredAt(occurredAt);
  const nextMilliunits = balanceMilliunits + deltaMilliunits;
  if (!Number.isSafeInteger(nextMilliunits) || nextMilliunits < 0) {
    throw new RangeError("movement would create an invalid or negative stock balance");
  }
  return Object.freeze({
    sku: sku.trim(),
    quantityDelta: deltaMilliunits / 1000,
    reference: reference.trim(),
    occurredAt: normalizedOccurredAt,
    previousBalance: balanceMilliunits / 1000,
    nextBalance: nextMilliunits / 1000
  });
}
