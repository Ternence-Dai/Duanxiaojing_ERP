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
  const normalizedDate = new Date(timestamp);
  const normalizedYear = normalizedDate.getUTCFullYear();
  if (normalizedYear < 0 || normalizedYear > 9999) {
    throw new RangeError("occurredAt timezone normalization must remain within four-digit UTC years");
  }
  return normalizedDate.toISOString();
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

export function normalizeStockBalance(balance) {
  const milliunits = toMilliunits(balance, "balance");
  if (milliunits < 0) throw new RangeError("balance must be non-negative");
  return milliunits / 1000;
}

export function calculateStockPosition({ onHand, incomingQuantity = 0, safetyStock = 0 } = {}) {
  const onHandMilliunits = toMilliunits(onHand, "onHand");
  const incomingMilliunits = toMilliunits(incomingQuantity, "incomingQuantity");
  const safetyMilliunits = toMilliunits(safetyStock, "safetyStock");
  if (onHandMilliunits < 0 || incomingMilliunits < 0 || safetyMilliunits < 0) {
    throw new RangeError("on-hand, incoming and safety-stock quantities must be non-negative");
  }
  const projectedMilliunits = onHandMilliunits + incomingMilliunits;
  if (!Number.isSafeInteger(projectedMilliunits)) {
    throw new RangeError("projected stock position exceeds the safe milliunit range");
  }
  const replenishmentMilliunits = Math.max(0, safetyMilliunits - projectedMilliunits);
  return Object.freeze({
    onHand:onHandMilliunits / 1000,
    incomingQuantity:incomingMilliunits / 1000,
    projectedQuantity:projectedMilliunits / 1000,
    safetyStock:safetyMilliunits / 1000,
    replenishmentQuantity:replenishmentMilliunits / 1000,
    status:projectedMilliunits < safetyMilliunits ? "below-safety" : "sufficient"
  });
}

export function applyStockMovement(balance, movement) {
  const balanceMilliunits = toMilliunits(balance, "balance");
  if (balanceMilliunits < 0) throw new RangeError("balance must be non-negative");
  if (!movement || typeof movement !== "object" || Array.isArray(movement)) throw new TypeError("movement must be an object");
  const { sku, quantityDelta, reference, occurredAt } = movement;
  if (typeof sku !== "string" || !sku.trim()) throw new TypeError("sku is required");
  if (sku.trim().length > 80 || /[\x00-\x1F\x7F]/.test(sku)) throw new RangeError("sku must be at most 80 characters and contain no control characters");
  const deltaMilliunits = toMilliunits(quantityDelta, "quantityDelta", { allowZero: false });
  if (typeof reference !== "string" || !reference.trim()) throw new TypeError("reference is required for traceability");
  if (reference.trim().length > 120 || /[\x00-\x1F\x7F]/.test(reference)) throw new RangeError("reference must be at most 120 characters and contain no control characters");
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

/* ---------- 金额账本（移动加权平均） ----------
   Quantities are tracked in milliunits and money in integer cents; unit
   costs are integer milli-yuan (0.001 yuan). No floating-point money math:
   every amount below is derived with integer multiplication and a single
   rounding division. The value ledger runs parallel to the quantity
   ledger: inbound movements revalue at the incoming unit cost, outbound
   movements settle at the current moving average, and emptying a balance
   sweeps any rounding residue so value returns exactly to zero. */
const VALUE_MOVEMENT_FIELDS = Object.freeze([
  "unitCostMilliYuan",
  "amountDeltaCents",
  "previousValueCents",
  "nextValueCents",
  "avgCostAfterMilliYuan",
]);

function assertValueCents(value, name) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be an integer number of cents`);
  }
  if (value < 0) {
    throw new RangeError(`${name} must not be negative`);
  }
  return value;
}

// Tolerant opening-balance derivation used for rows that predate the value
// ledger (the load-time migration in the app uses the same rule):
// quantity × static reference price, rounded to cents. Non-numeric or
// non-positive inputs value the opening balance at zero rather than
// failing the load.
export function openingValueCents(quantity, unitPrice) {
  const qty = Number(quantity);
  const price = Number(unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price <= 0) {
    return 0;
  }
  const product = Math.round(qty * 1000) * Math.round(price * 1000);
  if (!Number.isSafeInteger(product)) return 0;
  return Math.round(product / 10000);
}

function currentValueCents(item) {
  if (Number.isSafeInteger(item.valueCents) && item.valueCents >= 0) {
    return item.valueCents;
  }
  return openingValueCents(item.qty, item.price);
}

export function applyValueMovement(balance, movement) {
  if (!balance || typeof balance !== "object" || Array.isArray(balance)) {
    throw new TypeError("value balance must be an object");
  }
  if (!movement || typeof movement !== "object" || Array.isArray(movement)) {
    throw new TypeError("value movement must be an object");
  }

  const quantityMilli = toMilliunits(balance.quantity, "balance quantity");
  if (quantityMilli < 0) {
    throw new RangeError("balance quantity must not be negative");
  }
  const previousValueCents = assertValueCents(balance.valueCents, "balance valueCents");
  const deltaMilli = toMilliunits(movement.quantityDelta, "quantityDelta", { allowZero: false });
  const nextQuantityMilli = quantityMilli + deltaMilli;
  if (!Number.isSafeInteger(nextQuantityMilli) || nextQuantityMilli < 0) {
    throw new RangeError("value movement would create an invalid quantity balance");
  }

  let unitCostMilliYuan;
  if (movement.unitCostMilliYuan !== undefined) {
    if (!Number.isSafeInteger(movement.unitCostMilliYuan)) {
      throw new TypeError("unitCostMilliYuan must be an integer number of milli-yuan");
    }
    if (movement.unitCostMilliYuan < 0) {
      throw new RangeError("unit cost must not be negative");
    }
    unitCostMilliYuan = movement.unitCostMilliYuan;
  } else if (movement.unitCost !== undefined) {
    unitCostMilliYuan = toMilliunits(movement.unitCost, "unit cost");
    if (unitCostMilliYuan < 0) {
      throw new RangeError("unit cost must not be negative");
    }
  }

  let amountDeltaCents;
  if (movement.amountDeltaCents !== undefined) {
    // Exact mode (a reversal negating its original receipt): the amount
    // is authoritative and the unit cost is only a snapshot.
    if (!Number.isSafeInteger(movement.amountDeltaCents)) {
      throw new TypeError("amountDeltaCents must be an integer number of cents");
    }
    amountDeltaCents = movement.amountDeltaCents;
    if ((deltaMilli > 0 && amountDeltaCents < 0) || (deltaMilli < 0 && amountDeltaCents > 0)) {
      throw new RangeError("value movement amount sign does not match its quantity direction");
    }
    if (unitCostMilliYuan !== undefined) {
      const expected = Math.abs(deltaMilli) * unitCostMilliYuan;
      if (!Number.isSafeInteger(expected) ||
          Math.round(expected / 10000) !== Math.abs(amountDeltaCents)) {
        throw new RangeError("value movement amount does not match its unit cost");
      }
    } else {
      unitCostMilliYuan = Math.round(Math.abs(amountDeltaCents) * 10000 / Math.abs(deltaMilli));
    }
  } else if (deltaMilli > 0) {
    if (unitCostMilliYuan === undefined) {
      throw new RangeError("unit cost is required for an inbound value movement");
    }
    const product = deltaMilli * unitCostMilliYuan;
    if (!Number.isSafeInteger(product)) {
      throw new RangeError("value movement amount exceeds the safe integer range");
    }
    amountDeltaCents = Math.round(product / 10000);
  } else {
    if (unitCostMilliYuan === undefined) {
      unitCostMilliYuan = quantityMilli > 0
        ? Math.round(previousValueCents * 10000 / quantityMilli)
        : 0;
    }
    if (nextQuantityMilli === 0) {
      amountDeltaCents = -previousValueCents;
    } else {
      const settled = -deltaMilli * previousValueCents;
      if (!Number.isSafeInteger(settled)) {
        throw new RangeError("value movement amount exceeds the safe integer range");
      }
      amountDeltaCents = -Math.round(settled / quantityMilli);
    }
  }

  const nextValueCents = previousValueCents + amountDeltaCents;
  if (!Number.isSafeInteger(nextValueCents) || nextValueCents < 0) {
    throw new RangeError("value movement would create an invalid inventory value");
  }
  const avgCostAfterMilliYuan = nextQuantityMilli > 0
    ? Math.round(nextValueCents * 10000 / nextQuantityMilli)
    : 0;

  return Object.freeze({
    quantityDelta: deltaMilli / 1000,
    unitCostMilliYuan,
    amountDeltaCents,
    previousValueCents,
    nextValueCents,
    avgCostAfterMilliYuan,
  });
}

// Validates the optional five-field value snapshot carried by receipt and
// reversal records. Legacy records without any value field stay valid;
// a partial set is always an error.
function validateOptionalValueFields(entry, label) {
  const present = VALUE_MOVEMENT_FIELDS.filter((field) => entry[field] !== undefined);
  if (!present.length) return undefined;
  if (present.length !== VALUE_MOVEMENT_FIELDS.length) {
    throw new TypeError(`${label} value fields must be provided as a complete set`);
  }
  const value = {};
  for (const field of VALUE_MOVEMENT_FIELDS) {
    if (!Number.isSafeInteger(entry[field])) {
      throw new TypeError(`${label} ${field} must be an integer`);
    }
    value[field] = entry[field];
  }
  if (value.unitCostMilliYuan < 0 || value.previousValueCents < 0 || value.nextValueCents < 0) {
    throw new RangeError(`${label} value fields must not be negative`);
  }
  if (value.previousValueCents + value.amountDeltaCents !== value.nextValueCents) {
    throw new RangeError(`${label} value balances are inconsistent`);
  }
  return value;
}

function expectedAvgCostMilliYuan(valueCents, balanceMilli) {
  return balanceMilli > 0 ? Math.round(valueCents * 10000 / balanceMilli) : 0;
}

function withoutValueFields(record) {
  const copy = { ...record };
  for (const field of VALUE_MOVEMENT_FIELDS) delete copy[field];
  return copy;
}


const PURCHASE_RECEIVABLE_STATUSES = new Set(["已下单", "在途", "部分到货"]);
function requiredPurchaseText(value, field, maxLength = 160) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`purchase receipt ${field} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new RangeError(`purchase receipt ${field} exceeds ${maxLength} characters`);
  }
  if (/[\x00-\x1F\x7F]/.test(normalized)) {
    throw new TypeError(`purchase receipt ${field} must not contain control characters`);
  }
  return normalized;
}

export function validatePurchaseReceiptRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("purchase receipt must be an object");
  }
  const allowed = new Set([
    "receiptNo", "purchaseNo", "sku", "material", "supplier", "quantity",
    "unit", "batch", "location", "receivedAt", "receivedBy", "inspectedBy",
    "inspectionResult", "note", "stockMovementReference", "previousBalance",
    "nextBalance", "purchaseStatusBefore", ...VALUE_MOVEMENT_FIELDS
  ]);
  if (Object.keys(entry).some(key => !allowed.has(key))) {
    throw new TypeError("purchase receipt contains unsupported fields");
  }
  const receiptNo = requiredPurchaseText(entry.receiptNo, "number", 80);
  const purchaseNo = requiredPurchaseText(entry.purchaseNo, "purchase order number", 80);
  const sku = requiredPurchaseText(entry.sku, "SKU", 80);
  const material = requiredPurchaseText(entry.material, "material", 180);
  const supplier = requiredPurchaseText(entry.supplier, "supplier", 180);
  const unit = requiredPurchaseText(entry.unit, "unit", 24);
  const batch = requiredPurchaseText(entry.batch, "batch", 100);
  const location = requiredPurchaseText(entry.location, "location", 80);
  const receivedBy = requiredPurchaseText(entry.receivedBy, "receiver", 120);
  const inspectedBy = requiredPurchaseText(entry.inspectedBy, "inspector", 120);
  const receivedAt = parseOccurredAt(entry.receivedAt);
  if (entry.inspectionResult !== "合格") {
    throw new RangeError("only a recorded qualified incoming inspection can be posted into available stock");
  }
  if (typeof entry.note !== "string") throw new TypeError("purchase receipt note must be text");
  if (entry.note.trim().length > 2000) throw new RangeError("purchase receipt note exceeds 2000 characters");
  if (/[\x00-\x1F\x7F]/.test(entry.note)) throw new TypeError("purchase receipt note must not contain control characters");
  if (entry.stockMovementReference !== receiptNo) {
    throw new RangeError("purchase receipt must reference its own stock movement");
  }
  const quantity = toMilliunits(entry.quantity, "receipt quantity", { allowZero: false });
  const previous = toMilliunits(entry.previousBalance, "previous stock balance");
  const next = toMilliunits(entry.nextBalance, "next stock balance");
  if (previous < 0 || next < 0 || previous + quantity !== next ||
      !Number.isSafeInteger(previous + quantity)) {
    throw new RangeError("purchase receipt stock balances are inconsistent");
  }
  let purchaseStatusBefore;
  if (entry.purchaseStatusBefore !== undefined) {
    if (!["已下单", "在途"].includes(entry.purchaseStatusBefore)) {
      throw new RangeError("purchase receipt status snapshot must be 已下单 or 在途");
    }
    purchaseStatusBefore = entry.purchaseStatusBefore;
  }
  // Optional value-ledger snapshot: new receipts always carry one; records
  // posted before the value ledger existed carry none and stay valid.
  const value = validateOptionalValueFields(entry, "purchase receipt");
  if (value) {
    if (value.amountDeltaCents < 0 ||
        value.amountDeltaCents !== Math.round(quantity * value.unitCostMilliYuan / 10000) ||
        value.avgCostAfterMilliYuan !== expectedAvgCostMilliYuan(value.nextValueCents, next)) {
      throw new RangeError("purchase receipt value snapshot is inconsistent");
    }
  }
  return Object.freeze({
    receiptNo, purchaseNo, sku, material, supplier,
    quantity: quantity / 1000, unit, batch, location, receivedAt,
    receivedBy, inspectedBy, inspectionResult: "合格",
    note: entry.note.trim(), stockMovementReference: receiptNo,
    previousBalance: previous / 1000, nextBalance: next / 1000,
    purchaseStatusBefore,
    ...(value ? {
      unitCostMilliYuan: value.unitCostMilliYuan,
      amountDeltaCents: value.amountDeltaCents,
      previousValueCents: value.previousValueCents,
      nextValueCents: value.nextValueCents,
      avgCostAfterMilliYuan: value.avgCostAfterMilliYuan
    } : {})
  });
}

export function validatePurchaseReceiptReversalRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("purchase receipt reversal must be an object");
  }
  const allowed = new Set([
    "reversalNo", "receiptNo", "purchaseNo", "sku", "quantity", "unit",
    "reason", "reversedBy", "reversedAt", "stockMovementReference",
    "originalStockMovementReference", "previousBalance", "nextBalance",
    ...VALUE_MOVEMENT_FIELDS
  ]);
  if (Object.keys(entry).some(key => !allowed.has(key))) {
    throw new TypeError("purchase receipt reversal contains unsupported fields");
  }
  const reversalNo = requiredPurchaseText(entry.reversalNo, "reversal number", 80);
  const receiptNo = requiredPurchaseText(entry.receiptNo, "original receipt number", 80);
  const purchaseNo = requiredPurchaseText(entry.purchaseNo, "purchase order number", 80);
  const sku = requiredPurchaseText(entry.sku, "SKU", 80);
  const unit = requiredPurchaseText(entry.unit, "unit", 24);
  const reason = requiredPurchaseText(entry.reason, "reversal reason", 1000);
  const reversedBy = requiredPurchaseText(entry.reversedBy, "reversal actor", 120);
  const reversedAt = parseOccurredAt(entry.reversedAt);
  if (entry.stockMovementReference !== reversalNo ||
      typeof entry.originalStockMovementReference !== "string" ||
      entry.originalStockMovementReference.trim() !== receiptNo) {
    throw new RangeError("purchase receipt reversal must link both original and reversal stock movements");
  }
  const quantity = toMilliunits(entry.quantity, "reversal quantity", { allowZero: false });
  const previous = toMilliunits(entry.previousBalance, "previous stock balance");
  const next = toMilliunits(entry.nextBalance, "next stock balance");
  if (previous < quantity || next < 0 || previous - quantity !== next ||
      !Number.isSafeInteger(previous - quantity)) {
    throw new RangeError("purchase receipt reversal stock balances are inconsistent");
  }
  // Optional value-ledger snapshot (see validatePurchaseReceiptRecord).
  // The amount is not recomputed from the unit cost here: a reversal of a
  // legacy receipt without a snapshot settles at the moving average, whose
  // rounded amount need not equal quantity × unit cost exactly.
  const value = validateOptionalValueFields(entry, "purchase receipt reversal");
  if (value) {
    if (value.amountDeltaCents > 0 ||
        value.avgCostAfterMilliYuan !== expectedAvgCostMilliYuan(value.nextValueCents, next)) {
      throw new RangeError("purchase receipt reversal value snapshot is inconsistent");
    }
  }
  return Object.freeze({
    reversalNo, receiptNo, purchaseNo, sku, quantity: quantity / 1000, unit,
    reason, reversedBy, reversedAt, stockMovementReference: reversalNo,
    originalStockMovementReference: receiptNo,
    previousBalance: previous / 1000, nextBalance: next / 1000,
    ...(value ? {
      unitCostMilliYuan: value.unitCostMilliYuan,
      amountDeltaCents: value.amountDeltaCents,
      previousValueCents: value.previousValueCents,
      nextValueCents: value.nextValueCents,
      avgCostAfterMilliYuan: value.avgCostAfterMilliYuan
    } : {})
  });
}

export function createPurchaseReceipt({
  purchaseOrder, inventoryItem, existingReceipts = [], existingReversals = [],
  existingMovementReferences = [], receiptNo, quantity, batch, location,
  receivedAt, receivedBy, inspectedBy, inspectionResult, note = "", asOf = new Date(),
  unitCost
} = {}) {
  if (!purchaseOrder || typeof purchaseOrder !== "object" || Array.isArray(purchaseOrder)) {
    throw new TypeError("purchase order is required");
  }
  if (!inventoryItem || typeof inventoryItem !== "object" || Array.isArray(inventoryItem)) {
    throw new TypeError("an existing inventory SKU must be selected");
  }
  if (!Array.isArray(existingReceipts) || !Array.isArray(existingReversals) ||
      !Array.isArray(existingMovementReferences)) {
    throw new TypeError("existing receipt, reversal and movement references must be arrays");
  }
  if (existingReceipts.length > 50000 || existingReversals.length > 50000 ||
      existingMovementReferences.length > 100000) {
    throw new RangeError("purchase receipt history exceeds the supported validation limit");
  }
  const purchaseNo = requiredPurchaseText(purchaseOrder.no, "purchase order number", 80);
  const supplier = requiredPurchaseText(purchaseOrder.sup, "supplier", 180);
  const material = requiredPurchaseText(purchaseOrder.mat, "material", 180);
  const unit = requiredPurchaseText(purchaseOrder.unit, "purchase unit", 24);
  const sku = requiredPurchaseText(inventoryItem.code, "inventory SKU", 80);
  const inventoryName = requiredPurchaseText(inventoryItem.name, "inventory material", 180);
  const inventoryUnit = requiredPurchaseText(inventoryItem.unit, "inventory unit", 24);
  const inventorySupplier = requiredPurchaseText(inventoryItem.supplier, "inventory supplier", 180);

  if (!PURCHASE_RECEIVABLE_STATUSES.has(purchaseOrder.status)) {
    throw new RangeError("purchase order status is not eligible for receiving");
  }
  if (material !== inventoryName || unit !== inventoryUnit || supplier !== inventorySupplier) {
    throw new RangeError("purchase order material, unit and supplier must exactly match the selected inventory SKU");
  }
  const normalizedBatch = requiredPurchaseText(batch, "batch", 100);
  const normalizedLocation = requiredPurchaseText(location, "location", 80);
  if (typeof inventoryItem.batch !== "string" || normalizedBatch !== inventoryItem.batch.trim()) {
    throw new RangeError("receipt batch must match the selected SKU batch; maintain separate SKUs for separate lots");
  }
  if (typeof inventoryItem.loc !== "string" || normalizedLocation !== inventoryItem.loc.trim()) {
    throw new RangeError("receipt location must match the selected SKU warehouse location");
  }
  if (typeof note !== "string") throw new TypeError("purchase receipt note must be text");

  const ordered = toMilliunits(purchaseOrder.qty, "purchase order quantity", { allowZero: false });
  const received = toMilliunits(quantity, "receipt quantity", { allowZero: false });
  const normalizedReceiptNo = requiredPurchaseText(receiptNo, "number", 80);
  const allReceiptIds = new Set();
  const movementReferenceSet = new Set();
  for (const reference of existingMovementReferences) {
    if (typeof reference !== "string" || !reference.trim()) {
      throw new TypeError("existing stock movement references must be non-empty and unique");
    }
    const normalizedReference = reference.trim();
    if (normalizedReference.length > 120 || [...reference].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
      throw new TypeError("existing stock movement references must be at most 120 characters and contain no control characters");
    }
    if (movementReferenceSet.has(normalizedReference)) {
      throw new TypeError("existing stock movement references must be non-empty and unique");
    }
    movementReferenceSet.add(normalizedReference);
  }
  let previouslyReceived = 0;
  const existingReceiptById = new Map();
  for (const row of existingReceipts) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError("existing purchase receipt records are malformed");
    }
    const id = requiredPurchaseText(row.receiptNo, "existing receipt number", 80);
    if (allReceiptIds.has(id)) throw new RangeError("existing purchase receipt numbers must be unique");
    allReceiptIds.add(id);
    if (id === normalizedReceiptNo) throw new RangeError("receipt number already exists in the stock movement ledger");
    const validated = validatePurchaseReceiptRecord(row);
    existingReceiptById.set(validated.receiptNo, validated);
    if (!movementReferenceSet.has(validated.stockMovementReference)) {
      throw new RangeError("existing purchase receipt has no matching stock movement reference");
    }
    if (validated.purchaseNo === purchaseNo) {
      if (validated.sku !== sku || validated.material !== material ||
          validated.supplier !== supplier || validated.unit !== unit ||
          validated.batch !== normalizedBatch || validated.location !== normalizedLocation) {
        throw new RangeError("existing receipts for this purchase order must match the selected SKU, supplier, unit, batch and location");
      }
      previouslyReceived += toMilliunits(validated.quantity, "existing receipt quantity", { allowZero: false });
      if (!Number.isSafeInteger(previouslyReceived)) throw new RangeError("cumulative received quantity is unsafe");
    }
  }
  const reversedReceiptIds = new Set();
  const reversalNumbers = new Set();
  for (const row of existingReversals) {
    const reversal = validatePurchaseReceiptReversalRecord(row);
    const original = existingReceiptById.get(reversal.receiptNo);
    if (!original || original.purchaseNo !== reversal.purchaseNo ||
        original.sku !== reversal.sku || original.quantity !== reversal.quantity ||
        original.unit !== reversal.unit ||
        (original.amountDeltaCents !== undefined && reversal.amountDeltaCents !== undefined &&
         reversal.amountDeltaCents !== -original.amountDeltaCents) ||
        Date.parse(reversal.reversedAt) < Date.parse(original.receivedAt) ||
        !movementReferenceSet.has(reversal.stockMovementReference) ||
        !movementReferenceSet.has(reversal.originalStockMovementReference) ||
        reversedReceiptIds.has(reversal.receiptNo) ||
        reversalNumbers.has(reversal.reversalNo)) {
      throw new RangeError("existing purchase receipt reversals must uniquely match their original receipt and stock movements");
    }
    reversedReceiptIds.add(reversal.receiptNo);
    reversalNumbers.add(reversal.reversalNo);
    if (reversal.purchaseNo === purchaseNo) {
      previouslyReceived -= toMilliunits(reversal.quantity, "reversed receipt quantity", { allowZero: false });
    }
  }
  if (previouslyReceived < 0 || !Number.isSafeInteger(previouslyReceived)) {
    throw new RangeError("effective received quantity is invalid after reversals");
  }
  if (allReceiptIds.has(normalizedReceiptNo) ||
      movementReferenceSet.has(normalizedReceiptNo)) {
    throw new RangeError("receipt number already exists in the stock movement ledger");
  }
  if (previouslyReceived + received > ordered) {
    throw new RangeError("receipt quantity exceeds the outstanding purchase order quantity");
  }
  if (purchaseOrder.status === "部分到货" && previouslyReceived === 0) {
    throw new RangeError("legacy partial-delivery status has no traceable receipt history; reconcile it before adding receipts");
  }

  const normalizedReceivedAt = parseOccurredAt(receivedAt);
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new TypeError("purchase receipt reference time must be a valid Date");
  }
  if (Date.parse(normalizedReceivedAt) > asOf.getTime()) {
    throw new RangeError("future-dated purchase receipt cannot be posted to current stock");
  }
  const normalizedReceiver = requiredPurchaseText(receivedBy, "receiver", 120);
  const normalizedInspector = requiredPurchaseText(inspectedBy, "inspector", 120);
  if (inspectionResult !== "合格") {
    throw new RangeError("incoming inspection must be recorded as 合格 before stock is posted");
  }
  const movement = applyStockMovement(inventoryItem.qty, {
    sku, quantityDelta: received / 1000, reference: normalizedReceiptNo,
    occurredAt: normalizedReceivedAt
  });
  // 金额账本：收货单价快照。优先用调用方传入的单价（表单可改），其次采购
  // 订单单价；两者都没有时按当前移动均价入账，库存为空则记 0，保证历史
  // 无价数据仍可过账。PO 单价用容忍取整（历史订单可能超过三位小数），
  // 显式传入的单价则走严格的毫单位校验。
  const previousValueCents = currentValueCents(inventoryItem);
  let unitCostMilliYuan;
  if (unitCost !== undefined && unitCost !== null) {
    unitCostMilliYuan = toMilliunits(unitCost, "unit cost");
    if (unitCostMilliYuan < 0) throw new RangeError("unit cost must not be negative");
  } else if (Number.isFinite(purchaseOrder.price) && Number(purchaseOrder.price) >= 0) {
    unitCostMilliYuan = Math.round(Number(purchaseOrder.price) * 1000);
  } else {
    const currentQuantityMilli = toMilliunits(inventoryItem.qty, "inventory quantity");
    unitCostMilliYuan = currentQuantityMilli > 0
      ? Math.round(previousValueCents * 10000 / currentQuantityMilli)
      : 0;
  }
  const valueMovement = applyValueMovement(
    { quantity: inventoryItem.qty, valueCents: previousValueCents },
    { quantityDelta: received / 1000, unitCostMilliYuan }
  );
  const orderReceipts = [...existingReceiptById.values()]
    .filter(row => row.purchaseNo === purchaseNo)
    .sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
  const purchaseStatusBefore = orderReceipts.length
    ? orderReceipts[0].purchaseStatusBefore
    : purchaseOrder.status;
  const receipt = validatePurchaseReceiptRecord({
    receiptNo: normalizedReceiptNo,
    purchaseNo,
    sku,
    material,
    supplier,
    quantity: received / 1000,
    unit,
    batch: normalizedBatch,
    location: normalizedLocation,
    receivedAt: normalizedReceivedAt,
    receivedBy: normalizedReceiver,
    inspectedBy: normalizedInspector,
    inspectionResult: "合格",
    note: note.trim(),
    stockMovementReference: normalizedReceiptNo,
    previousBalance: movement.previousBalance,
    nextBalance: movement.nextBalance,
    purchaseStatusBefore,
    unitCostMilliYuan: valueMovement.unitCostMilliYuan,
    amountDeltaCents: valueMovement.amountDeltaCents,
    previousValueCents: valueMovement.previousValueCents,
    nextValueCents: valueMovement.nextValueCents,
    avgCostAfterMilliYuan: valueMovement.avgCostAfterMilliYuan
  });
  const stockMovement = Object.freeze({
    ...movement,
    sourceType: "purchase-receipt",
    sourceNo: purchaseNo,
    batch: normalizedBatch,
    location: normalizedLocation,
    unitCostMilliYuan: valueMovement.unitCostMilliYuan,
    amountDeltaCents: valueMovement.amountDeltaCents,
    previousValueCents: valueMovement.previousValueCents,
    nextValueCents: valueMovement.nextValueCents,
    avgCostAfterMilliYuan: valueMovement.avgCostAfterMilliYuan
  });
  const totalReceived = previouslyReceived + received;
  return Object.freeze({
    receipt,
    stockMovement,
    totalReceived: totalReceived / 1000,
    remainingQuantity: (ordered - totalReceived) / 1000,
    purchaseStatus: totalReceived === ordered ? "已入库" : "部分到货"
  });
}


export function createPurchaseReceiptReversal({
  purchaseOrder, inventoryItem, receipt, existingReceipts = [],
  existingReversals = [], existingMovementReferences = [],
  reversalNo, reversedAt, reversedBy, reason, asOf = new Date()
} = {}) {
  if (!purchaseOrder || typeof purchaseOrder !== "object" || Array.isArray(purchaseOrder)) {
    throw new TypeError("purchase order is required for receipt reversal");
  }
  if (!inventoryItem || typeof inventoryItem !== "object" || Array.isArray(inventoryItem)) {
    throw new TypeError("the original inventory SKU is required for receipt reversal");
  }
  if (!Array.isArray(existingReceipts) || !Array.isArray(existingReversals) ||
      !Array.isArray(existingMovementReferences)) {
    throw new TypeError("receipt reversal history and movement references must be arrays");
  }
  if (existingReceipts.length > 50000 || existingReversals.length > 50000 ||
      existingMovementReferences.length > 100000) {
    throw new RangeError("receipt reversal history exceeds the supported validation limit");
  }
  const target = validatePurchaseReceiptRecord(receipt);
  const normalizedReversedAt = parseOccurredAt(reversedAt);
  if (Date.parse(normalizedReversedAt) < Date.parse(target.receivedAt)) {
    throw new RangeError("receipt reversal timestamp cannot precede the original receipt");
  }
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new TypeError("receipt reversal reference time must be a valid Date");
  }
  if (Date.parse(normalizedReversedAt) > asOf.getTime()) {
    throw new RangeError("future-dated purchase receipt reversal cannot be posted to current stock");
  }
  const purchaseNo = requiredPurchaseText(purchaseOrder.no, "purchase order number", 80);
  if (target.purchaseNo !== purchaseNo) {
    throw new RangeError("receipt and purchase order do not match");
  }
  const orderMaterial = requiredPurchaseText(purchaseOrder.mat, "purchase order material", 180);
  const orderSupplier = requiredPurchaseText(purchaseOrder.sup, "purchase order supplier", 180);
  const orderUnit = requiredPurchaseText(purchaseOrder.unit, "purchase order unit", 24);
  if (orderMaterial !== target.material || orderSupplier !== target.supplier ||
      orderUnit !== target.unit) {
    throw new RangeError("current purchase order material, supplier and unit no longer match the original receipt; reconcile before reversal");
  }
  if (String(inventoryItem.code || "").trim() !== target.sku) {
    throw new RangeError("receipt reversal must use its original inventory SKU");
  }
  if (inventoryItem.name !== target.material || inventoryItem.supplier !== target.supplier ||
      inventoryItem.unit !== target.unit || inventoryItem.batch !== target.batch ||
      inventoryItem.loc !== target.location) {
    throw new RangeError("current inventory master data no longer matches the original receipt; reconcile before reversal");
  }
  const storedReceipts = new Map();
  for (const row of existingReceipts) {
    const validated = validatePurchaseReceiptRecord(row);
    if (storedReceipts.has(validated.receiptNo)) throw new RangeError("stored purchase receipt numbers must be unique");
    storedReceipts.set(validated.receiptNo, validated);
  }
  const storedTarget = storedReceipts.get(target.receiptNo);
  // A reversal must use the exact saved receipt snapshot, not a caller-edited
  // object that happens to retain the same receipt number and quantity.
  // Both values have already passed the same canonical validator, so their
  // serialized field order and normalized values are deterministic.
  if (!storedTarget || JSON.stringify(storedTarget) !== JSON.stringify(target)) {
    throw new RangeError("original receipt does not exactly match the saved receipt ledger");
  }
  const referenceSet = new Set();
  for (const reference of existingMovementReferences) {
    const value = requiredPurchaseText(reference, "existing stock movement reference", 120);
    if (referenceSet.has(value)) throw new RangeError("existing stock movement references must be unique");
    referenceSet.add(value);
  }
  if (!referenceSet.has(target.stockMovementReference)) {
    throw new RangeError("original receipt has no matching stock movement");
  }
  const normalizedReversalNo = requiredPurchaseText(reversalNo, "reversal number", 80);
  if (referenceSet.has(normalizedReversalNo)) {
    throw new RangeError("reversal number already exists in the stock movement ledger");
  }
  const priorReversals = existingReversals.map(validatePurchaseReceiptReversalRecord);
  const priorReversalNumbers = new Set();
  const priorReversedReceipts = new Set();
  for (const row of priorReversals) {
    if (priorReversalNumbers.has(row.reversalNo)) {
      throw new RangeError("existing reversal numbers must be unique");
    }
    if (priorReversedReceipts.has(row.receiptNo)) {
      throw new RangeError("existing receipt reversal links must be unique");
    }
    priorReversalNumbers.add(row.reversalNo);
    priorReversedReceipts.add(row.receiptNo);
  }
  if (priorReversals.some(row => row.receiptNo === target.receiptNo)) {
    throw new RangeError("purchase receipt has already been reversed");
  }
  if (priorReversals.some(row => row.reversalNo === normalizedReversalNo)) {
    throw new RangeError("reversal number already exists");
  }
  if (priorReversals.some(row => row.purchaseNo === purchaseNo &&
      Date.parse(row.reversedAt) > Date.parse(normalizedReversedAt))) {
    throw new RangeError("new reversal timestamp cannot precede an existing reversal for this purchase order");
  }
  for (const row of priorReversals) {
    const original = storedReceipts.get(row.receiptNo);
    if (!original || original.purchaseNo !== row.purchaseNo ||
        original.sku !== row.sku || original.quantity !== row.quantity ||
        original.unit !== row.unit ||
        (original.amountDeltaCents !== undefined && row.amountDeltaCents !== undefined &&
         row.amountDeltaCents !== -original.amountDeltaCents) ||
        original.stockMovementReference !== row.originalStockMovementReference ||
        Date.parse(row.reversedAt) < Date.parse(original.receivedAt) ||
        !referenceSet.has(row.stockMovementReference) ||
        !referenceSet.has(row.originalStockMovementReference)) {
      throw new RangeError("existing reversal history does not match the receipt ledger");
    }
  }
  const ordered = toMilliunits(purchaseOrder.qty, "purchase order quantity", { allowZero: false });
  let effectiveReceived = 0;
  for (const row of storedReceipts.values()) {
    if (row.purchaseNo === purchaseNo) {
      effectiveReceived += toMilliunits(row.quantity, "receipt quantity", { allowZero: false });
      if (!Number.isSafeInteger(effectiveReceived)) throw new RangeError("cumulative received quantity is unsafe");
    }
  }
  for (const row of priorReversals) {
    if (row.purchaseNo === purchaseNo) {
      effectiveReceived -= toMilliunits(row.quantity, "reversed receipt quantity", { allowZero: false });
      if (!Number.isSafeInteger(effectiveReceived)) throw new RangeError("effective received quantity is unsafe after reversals");
    }
  }
  const targetQuantity = toMilliunits(target.quantity, "receipt quantity", { allowZero: false });
  const remaining = effectiveReceived - targetQuantity;
  if (remaining < 0 || remaining > ordered || !Number.isSafeInteger(remaining)) {
    throw new RangeError("effective received quantity is inconsistent; reconcile the purchase order before reversal");
  }
  const movement = applyStockMovement(inventoryItem.qty, {
    sku: target.sku,
    quantityDelta: -targetQuantity / 1000,
    reference: normalizedReversalNo,
    occurredAt: reversedAt
  });
  // 金额账本：原收货带单价快照时按原金额精确取反冲销；历史收货没有快照
  // 时按当前移动均价结转（与出库同一口径），冲销记录注明所用单价。
  const previousValueCents = currentValueCents(inventoryItem);
  const valueMovement = target.amountDeltaCents !== undefined
    ? applyValueMovement(
        { quantity: inventoryItem.qty, valueCents: previousValueCents },
        {
          quantityDelta: -targetQuantity / 1000,
          amountDeltaCents: -target.amountDeltaCents,
          unitCostMilliYuan: target.unitCostMilliYuan
        })
    : applyValueMovement(
        { quantity: inventoryItem.qty, valueCents: previousValueCents },
        { quantityDelta: -targetQuantity / 1000 });
  const reversal = validatePurchaseReceiptReversalRecord({
    reversalNo: normalizedReversalNo,
    receiptNo: target.receiptNo,
    purchaseNo,
    sku: target.sku,
    quantity: target.quantity,
    unit: target.unit,
    reason,
    reversedBy,
    reversedAt: movement.occurredAt,
    stockMovementReference: normalizedReversalNo,
    originalStockMovementReference: target.stockMovementReference,
    previousBalance: movement.previousBalance,
    nextBalance: movement.nextBalance,
    unitCostMilliYuan: valueMovement.unitCostMilliYuan,
    amountDeltaCents: valueMovement.amountDeltaCents,
    previousValueCents: valueMovement.previousValueCents,
    nextValueCents: valueMovement.nextValueCents,
    avgCostAfterMilliYuan: valueMovement.avgCostAfterMilliYuan
  });
  const stockMovement = Object.freeze({
    ...movement,
    sourceType: "purchase-receipt-reversal",
    sourceNo: target.receiptNo,
    purchaseNo,
    reversesReference: target.stockMovementReference,
    unitCostMilliYuan: valueMovement.unitCostMilliYuan,
    amountDeltaCents: valueMovement.amountDeltaCents,
    previousValueCents: valueMovement.previousValueCents,
    nextValueCents: valueMovement.nextValueCents,
    avgCostAfterMilliYuan: valueMovement.avgCostAfterMilliYuan
  });
  let purchaseStatus;
  if (remaining === 0) {
    const earliest = [...storedReceipts.values()]
      .filter(row => row.purchaseNo === purchaseNo)
      .sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt))[0];
    const baseline = earliest && earliest.purchaseStatusBefore;
    if (!["已下单", "在途"].includes(baseline)) {
      throw new RangeError("legacy receipt has no pre-receipt purchase status snapshot; manual reconciliation is required");
    }
    purchaseStatus = baseline;
  } else {
    purchaseStatus = remaining === ordered ? "已入库" : "部分到货";
  }
  return Object.freeze({
    reversal,
    stockMovement,
    totalReceived: remaining / 1000,
    remainingQuantity: (ordered - remaining) / 1000,
    purchaseStatus
  });
}
