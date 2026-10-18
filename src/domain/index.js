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

export function applyStockMovement(balance, movement) {
  const balanceMilliunits = toMilliunits(balance, "balance");
  if (balanceMilliunits < 0) throw new RangeError("balance must be non-negative");
  if (!movement || typeof movement !== "object" || Array.isArray(movement)) throw new TypeError("movement must be an object");
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


const PURCHASE_RECEIVABLE_STATUSES = new Set(["已下单", "在途", "部分到货"]);
function requiredPurchaseText(value, field, maxLength = 160) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`purchase receipt ${field} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new RangeError(`purchase receipt ${field} exceeds ${maxLength} characters`);
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
    "nextBalance"
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
  return Object.freeze({
    receiptNo, purchaseNo, sku, material, supplier,
    quantity: quantity / 1000, unit, batch, location, receivedAt,
    receivedBy, inspectedBy, inspectionResult: "合格",
    note: entry.note.trim(), stockMovementReference: receiptNo,
    previousBalance: previous / 1000, nextBalance: next / 1000
  });
}

export function createPurchaseReceipt({
  purchaseOrder, inventoryItem, existingReceipts = [],
  existingMovementReferences = [], receiptNo, quantity, batch, location,
  receivedAt, receivedBy, inspectedBy, inspectionResult, note = ""
} = {}) {
  if (!purchaseOrder || typeof purchaseOrder !== "object" || Array.isArray(purchaseOrder)) {
    throw new TypeError("purchase order is required");
  }
  if (!inventoryItem || typeof inventoryItem !== "object" || Array.isArray(inventoryItem)) {
    throw new TypeError("an existing inventory SKU must be selected");
  }
  if (!Array.isArray(existingReceipts) || !Array.isArray(existingMovementReferences)) {
    throw new TypeError("existing receipt and movement references must be arrays");
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
  const allReceiptIds = new Set();
  let previouslyReceived = 0;
  for (const row of existingReceipts) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError("existing purchase receipt records are malformed");
    }
    const id = requiredPurchaseText(row.receiptNo, "existing receipt number", 80);
    if (allReceiptIds.has(id)) throw new RangeError("existing purchase receipt numbers must be unique");
    allReceiptIds.add(id);
    if (row.purchaseNo === purchaseNo) {
      if (row.unit !== unit) throw new RangeError("existing receipts use a different purchase unit");
      previouslyReceived += toMilliunits(row.quantity, "existing receipt quantity", { allowZero: false });
      if (!Number.isSafeInteger(previouslyReceived)) throw new RangeError("cumulative received quantity is unsafe");
    }
  }
  const normalizedReceiptNo = requiredPurchaseText(receiptNo, "number", 80);
  if (allReceiptIds.has(normalizedReceiptNo) ||
      existingMovementReferences.some(reference => String(reference) === normalizedReceiptNo)) {
    throw new RangeError("receipt number already exists in the stock movement ledger");
  }
  if (previouslyReceived + received > ordered) {
    throw new RangeError("receipt quantity exceeds the outstanding purchase order quantity");
  }
  if (purchaseOrder.status === "部分到货" && previouslyReceived === 0) {
    throw new RangeError("legacy partial-delivery status has no traceable receipt history; reconcile it before adding receipts");
  }

  const normalizedReceivedAt = parseOccurredAt(receivedAt);
  const normalizedReceiver = requiredPurchaseText(receivedBy, "receiver", 120);
  const normalizedInspector = requiredPurchaseText(inspectedBy, "inspector", 120);
  if (inspectionResult !== "合格") {
    throw new RangeError("incoming inspection must be recorded as 合格 before stock is posted");
  }
  const movement = applyStockMovement(inventoryItem.qty, {
    sku, quantityDelta: received / 1000, reference: normalizedReceiptNo,
    occurredAt: normalizedReceivedAt
  });
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
    nextBalance: movement.nextBalance
  });
  const stockMovement = Object.freeze({
    ...movement,
    sourceType: "purchase-receipt",
    sourceNo: purchaseNo,
    batch: normalizedBatch,
    location: normalizedLocation
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
