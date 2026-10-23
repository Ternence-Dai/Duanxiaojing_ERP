'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = [
  fs.readFileSync('assets/css/workspace-v5.css', 'utf8'),
  fs.readFileSync('assets/css/operations-cockpit-v2.css', 'utf8')
].join('\n');
const seed = fs.readFileSync('assets/js/demo-seed-data.js', 'utf8');
const domain = fs.readFileSync('src/domain/index.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/validate.yml', 'utf8');
const purchaseWorkspace = fs.readFileSync('assets/js/workspace-v5-purchase.js', 'utf8');
const workspaceCss = fs.readFileSync('assets/css/workspace-v5.css', 'utf8') + '\n' + fs.readFileSync('assets/css/purchase-receiving-queue-v1.css', 'utf8');

assert.ok(html.includes('workspace-v5-purchase.js?v=20261019-v53') &&
          html.includes('workspace-v5.css?v=20261019-v53'),
  'ERP page must load the current receiving and reversal workspace assets');
assert.doesNotThrow(() => new Function(purchaseWorkspace),
  'purchase receiving workspace enhancement must parse as valid JavaScript');
for (const token of [
  'w5-receipt-dashboard', 'w5-receipt-metrics', 'w5-receipt-progress',
  'w5-receipt-steps', 'w5-receipt-history-tools',
  'w5-receipt-queue', 'w5-receipt-queue__filter', 'data-receipt-open-order',
  'data-reverse-receipt', '收货待办队列', '检索流水'
]) assert.ok(purchaseWorkspace.includes(token),
  'purchase receiving workspace must include the operating surface: ' + token);
for (const id of [
  'receipt-purchase-order', 'receipt-sku', 'receipt-quantity',
  'receipt-batch', 'receipt-location', 'receipt-time',
  'receipt-receiver', 'receipt-inspector', 'receipt-inspection'
]) assert.ok(purchaseWorkspace.includes(id),
  'purchase receiving UI must retain the required form field: ' + id);
assert.ok(purchaseWorkspace.includes('各物料计量单位独立显示') &&
          purchaseWorkspace.includes('item.received / item.ordered * 100') &&
          purchaseWorkspace.includes('data-purchase-order') &&
          purchaseWorkspace.includes('data-due-state') &&
          purchaseWorkspace.includes('item.matches.length ? "ready" : "blocked"') &&
          purchaseWorkspace.includes('action.disabled = true'),
  'receiving queue must calculate progress per order, prioritize recorded due dates and block unmatched inventory SKUs');
assert.ok(!purchaseWorkspace.includes('.innerHTML'),
  'workspace enhancement must create text nodes safely instead of injecting data HTML');
for (const selector of [
  '.w5-receipt-dashboard', '.w5-receipt-metric',
  '.w5-receipt-progress__row', '.w5-receipt-step',
  '.w5-receipt-history-tools', '.w5-receipt-reverse',
  '.w5-receipt-reversal-log', '.w5-receipt-queue__row',
  '.w5-receipt-queue__due', '.w5-receipt-queue__action'
]) assert.ok(workspaceCss.includes(selector),
  'ERP V5.2 stylesheet must style the purchase workspace: ' + selector);


for (const id of [
  'purchase-receipt-form', 'receipt-purchase-order', 'receipt-sku',
  'receipt-quantity', 'receipt-batch', 'receipt-location', 'receipt-time',
  'receipt-receiver', 'receipt-inspector', 'receipt-inspection',
  'receipt-remaining', 'receipt-match-message', 'receipt-submit'
]) assert.ok(app.includes('id="' + id + '"'),
  'purchase receiving form must expose ' + id);

assert.ok(app.includes('function renderPurchaseReceiptWorkspace()') &&
          app.includes('function renderPurchaseReceiptSkuOptions()') &&
          app.includes('async function postPurchaseReceipt()') &&
          app.includes('async function reversePurchaseReceipt(receiptNo)'),
  'purchase receiving UI, SKU mapping, posting and reversal handlers must exist');
assert.ok(app.includes('w5-receipt-reversal-log') &&
          app.includes('data-reverse-receipt=') &&
          app.includes('purchaseReceiptReversals.unshift(result.reversal)'),
  'receipt history must show append-only reversal status and audit history');
assert.ok(app.includes("key === 'purchase' ? renderPurchaseReceiptWorkspace() : ''"),
  'purchase receipt workflow must be visible in the purchase module');
assert.ok(app.includes("domain.createPurchaseReceipt({") &&
          app.includes('DB.purchaseReceipts.unshift(result.receipt)') &&
          app.includes('DB.stockMovements.unshift(result.stockMovement)') &&
          app.includes('DB.inventory[inventoryIndex].qty = result.stockMovement.nextBalance') &&
          app.includes('DB.purchase[purchaseIndex].status = result.purchaseStatus') &&
          app.includes('commitDBMutation(previousDB)'),
  'receipt, stock balance, stock movement and purchase status must persist as one rollback-safe mutation');
assert.ok(app.includes('domain.validatePurchaseReceiptRecord') === false,
  'application should not claim it calls a validator it does not actually use');
assert.ok(domain.includes('export function createPurchaseReceipt(') &&
          domain.includes('export function validatePurchaseReceiptRecord(') &&
          domain.includes('export function createPurchaseReceiptReversal(') &&
          domain.includes('export function validatePurchaseReceiptReversalRecord('),
  'domain core must expose receipt creation and immutable receipt validation');
assert.ok(domain.includes('purchase order material, unit and supplier must exactly match') &&
          domain.includes('receipt batch must match the selected SKU') &&
          domain.includes('incoming inspection must be recorded as 合格') &&
          domain.includes('receipt quantity exceeds the outstanding purchase order quantity'),
  'domain core must enforce SKU, lot, inspection and outstanding-order boundaries');

const referenceStart = app.indexOf('const ENTITY_REFERENCE_RULES =');
const referenceEnd = app.indexOf('// Customer, supplier and order labels', referenceStart);
const referenceRules = app.slice(referenceStart, referenceEnd);
assert.ok(referenceRules.includes("table:'purchaseReceipts', field:'purchaseNo'") &&
          referenceRules.includes("table:'purchaseReceipts', field:'sku'"),
  'posted receipts must prevent deletion or identity changes of their PO and SKU');
assert.ok(app.includes("const derivedStatuses = new Set(['部分到货','已到货','检验中','已入库'])") &&
          app.includes('purchaseReceipts || []).filter(row => String(row.purchaseNo)') &&
          app.includes("const immutableFields = ['name','supplier','unit','batch','loc']"),
  'receipt-derived status and source material/lot identity must not be edited around the ledger');
assert.ok(app.includes("if(!Array.isArray(DB.purchaseReceipts)) DB.purchaseReceipts = [];") &&
          app.includes("if(!Array.isArray(DB.purchaseReceiptReversals)) DB.purchaseReceiptReversals = [];") &&
          app.includes("if(!Array.isArray(DB.stockMovements)) DB.stockMovements = [];"),
  'legacy app data must migrate missing receipt/reversal/movement tables to empty lists');
assert.ok(app.includes('DB.purchaseReceiptReversals.unshift(result.reversal)') &&
          app.includes('DB.stockMovements.unshift(result.stockMovement)') &&
          app.includes('getPurchaseReceivedMilliunits(purchaseNo)'),
  'reversal posting must preserve the original receipt and append a movement and reversal record');

const importStart = app.indexOf('function importAll(input)');
const importEnd = app.indexOf('function resetAll()', importStart);
const importSource = app.slice(importStart, importEnd);
const fileStart = app.indexOf('async function readFromFile()');
const fileEnd = app.indexOf('async function bindLocalFile()', fileStart);
const fileSource = app.slice(fileStart, fileEnd);
assert.ok(importSource.includes('isValidDBShape(d)') &&
          importSource.includes('DB.purchaseReceipts = []') &&
          importSource.includes('DB.purchaseReceiptReversals = []') &&
          fileSource.includes('isValidDBShape(candidate)') &&
          fileSource.includes('candidate.purchaseReceipts = []') &&
          fileSource.includes('candidate.purchaseReceiptReversals = []'),
  'JSON and bound-file restore must support legacy backups without fabricated receipt records');
assert.ok(seed.includes('purchaseReceipts: []') &&
          seed.includes('stockMovements: []'),
  'demo seed must not fabricate historical receipt or stock movement evidence');
assert.ok(workflow.includes('node scripts/validate-purchase-receipts.cjs'),
  'CI must run the purchase receiving integration validator');

for (const selector of [
  '.purchase-receipt-workspace', '.purchase-receipt-head',
  '.receipt-form-grid', '.receipt-warning', '.purchase-receipt-history',
  '.receipt-match-message'
]) assert.ok(css.includes(selector),
  'receipt workspace style must exist: ' + selector);

// Execute the real application backup validator in an isolated VM.
const validatorStart = app.indexOf('function isValidDBShape(d){');
const validatorEnd = app.indexOf('\nfunction preserveInvalidDB', validatorStart);
assert.ok(validatorStart >= 0 && validatorEnd > validatorStart,
  'cannot find the application backup validator');
const validatorSource = app.slice(validatorStart, validatorEnd);
const context = {
  SCHEMAS: {
    purchase: {idKey:'no'},
    inventory: {idKey:'code'}
  }
};
vm.createContext(context);
vm.runInContext(validatorSource + '\nthis.validateDB = isValidDBShape;', context);
const isValid = value => context.validateDB(JSON.parse(JSON.stringify(value)));

const legacy = {
  settings:{}, dict:{units:[]},
  purchase:[{no:'PO-1',sup:'Supplier A',mat:'Material A',qty:100,unit:'公斤',status:'在途'}],
  inventory:[{code:'SKU-1',name:'Material A',supplier:'Supplier A',qty:0,unit:'公斤',batch:'LOT-1',loc:'A-01-01'}]
};
assert.equal(isValid(legacy), true,
  'a legacy backup without receipt/movement tables must remain importable');

const receipt = {
  receiptNo:'GRN-1',purchaseNo:'PO-1',sku:'SKU-1',
  material:'Material A',supplier:'Supplier A',quantity:10,unit:'公斤',
  batch:'LOT-1',location:'A-01-01',receivedAt:'2026-10-18T01:00:00.000Z',
  receivedBy:'warehouse-1',inspectedBy:'qc-1',inspectionResult:'合格',
  note:'incoming inspection passed',stockMovementReference:'GRN-1',
  previousBalance:0,nextBalance:10,purchaseStatusBefore:'在途'
};
const movement = {
  sku:'SKU-1',quantityDelta:10,reference:'GRN-1',
  occurredAt:'2026-10-18T01:00:00.000Z',
  previousBalance:0,nextBalance:10,
  sourceType:'purchase-receipt',sourceNo:'PO-1',
  batch:'LOT-1',location:'A-01-01'
};
const posted = {
  ...legacy,
  purchase:[{...legacy.purchase[0],status:'部分到货'}],
  inventory:[{...legacy.inventory[0],qty:10}],
  purchaseReceipts:[receipt],
  stockMovements:[movement]
};
assert.equal(isValid(posted), true,
  'a complete PO → receipt → inventory movement backup must be accepted');
assert.equal(isValid({...posted,purchaseReceipts:undefined}), false,
  'a receipt-tagged stock movement without its receipt record must be rejected');
assert.equal(isValid({...posted,stockMovements:[]}), false,
  'receipt records without corresponding stock ledger movements must be rejected');
assert.equal(isValid({...posted,purchase:[{...posted.purchase[0],status:'在途'}]}), false,
  'purchase status must agree with cumulative receipt quantity');
assert.equal(isValid({...posted,purchase:[{...posted.purchase[0],mat:'Different material'}]}), false,
  'receipt material must retain its purchase-order identity');
assert.equal(isValid({...posted,purchaseReceipts:[{...receipt,quantity:101}]}), false,
  'receipt quantity cannot exceed the purchase order quantity');
assert.equal(isValid({...posted,purchaseReceipts:[{...receipt,inspectionResult:'待检'}]}), false,
  'unqualified material must never be accepted as available inventory');
assert.equal(isValid({...posted,purchaseReceipts:[{...receipt,stockMovementReference:'OTHER'}]}), false,
  'receipt reference must match a stock movement reference');
assert.equal(isValid({...posted,purchaseReceipts:[receipt,{...receipt,receiptNo:'GRN-2'}]}), false,
  'duplicate movement references cannot be reused for separate receipt records');
assert.equal(isValid({...posted,purchaseReceipts:[{...receipt,receiptNo:' GRN-1'}]}), false,
  'imported receipt identifiers must already be canonical and trimmed');
assert.equal(isValid({...posted,purchaseReceipts:[{...receipt,note:'x'.repeat(2001)}]}), false,
  'imported receipt notes must respect the 2000-character domain limit');
assert.equal(isValid({...posted,purchaseReceipts:[{...receipt,note:'bad\u0000note'}]}), false,
  'imported receipt notes must reject control characters');
assert.equal(isValid({...posted,purchaseReceipts:[{...receipt,inspectedBy:' qc-1'}]}), false,
  'imported receipt actors must not contain hidden leading or trailing whitespace');
assert.equal(isValid({...posted,stockMovements:[{...movement,reference:' GRN-1'}]}), false,
  'imported stock movement references must be canonical and trimmed');
assert.equal(isValid({...posted,stockMovements:[{...movement,sku:'S'.repeat(81)}]}), false,
  'imported stock movement SKUs must respect the domain length limit');

const reversal = {
  reversalNo:'REV-GRN-1',receiptNo:'GRN-1',purchaseNo:'PO-1',sku:'SKU-1',
  quantity:10,unit:'公斤',reason:'Duplicate receipt posting',
  reversedBy:'warehouse-supervisor',reversedAt:'2026-10-19T10:00:00.000Z',
  stockMovementReference:'REV-GRN-1',originalStockMovementReference:'GRN-1',
  previousBalance:10,nextBalance:0
};
const reversalMovement = {
  sku:'SKU-1',quantityDelta:-10,reference:'REV-GRN-1',
  occurredAt:'2026-10-19T10:00:00.000Z',
  previousBalance:10,nextBalance:0,
  sourceType:'purchase-receipt-reversal',sourceNo:'GRN-1',
  purchaseNo:'PO-1',reversesReference:'GRN-1'
};
const postedReversed = {
  ...posted,
  purchase:[{...legacy.purchase[0],status:'在途'}],
  inventory:[{...legacy.inventory[0],qty:0}],
  purchaseReceipts:[receipt],
  purchaseReceiptReversals:[reversal],
  stockMovements:[reversalMovement,movement]
};
assert.equal(isValid(postedReversed), true,
  'a receipt reversal must retain the original receipt and append a linked negative stock movement');
assert.equal(isValid({...postedReversed,purchaseReceiptReversals:[]}), false,
  'a reversal-tagged movement without a reversal audit record must be rejected');
assert.equal(isValid({...postedReversed,purchase:[{...postedReversed.purchase[0],status:'部分到货'}]}), false,
  'fully reversed receipt quantities must restore the pre-receipt purchase status');
assert.equal(isValid({...postedReversed,purchaseReceipts:[{...receipt,purchaseStatusBefore:undefined}]}), false,
  'a full reversal without a trustworthy PO status snapshot must be rejected');
assert.equal(isValid({...postedReversed,purchaseReceiptReversals:[{...reversal,reason:' ' }]}), false,
  'reversal reason must be present and canonical');
assert.equal(isValid({...postedReversed,purchaseReceiptReversals:[{...reversal,quantity:9}]}), false,
  'reversal quantity must exactly match the original receipt');
assert.equal(isValid({...postedReversed,stockMovements:[{...reversalMovement,reversesReference:'OTHER'},movement]}), false,
  'reversal stock movement must link to its exact original movement');
assert.equal(isValid({...postedReversed,purchaseReceiptReversals:[reversal,{...reversal,reversalNo:'REV-GRN-2'}]}), false,
  'one receipt cannot be reversed more than once');

const saveStart = app.indexOf('async function saveForm(){');
const saveEnd = app.indexOf('\nfunction genId', saveStart);
const saveHandler = app.slice(saveStart, saveEnd);
assert.ok(saveHandler.includes('typeof purchaseReceiptPending !== \'undefined\'') &&
          saveHandler.includes('typeof purchaseReceiptReversalPending !== \'undefined\''),
  'ordinary record edits must be blocked while receipt or reversal posting is awaiting its commit');

const postHandlerStart = app.indexOf('function postPurchaseReceipt(){');
const postHandlerEnd = app.indexOf('let purchaseReceiptReversalPending', postHandlerStart);
const postHandler = app.slice(postHandlerStart, postHandlerEnd);
assert.ok(postHandler.includes('if(inventorySavePending)'),
  'receipt posting must wait for an in-flight inventory master/ledger save');

const reversalHandlerStart = app.indexOf('async function reversePurchaseReceipt(');
const reversalHandlerEnd = app.indexOf('function renderPurchaseReceiptWorkspace', reversalHandlerStart);
const reversalHandler = app.slice(reversalHandlerStart, reversalHandlerEnd);
assert.ok(reversalHandler.includes('if(inventorySavePending)'),
  'receipt reversal must wait for an in-flight inventory master/ledger save');

const receiptPostStart = app.indexOf('function postPurchaseReceipt()');
const reversalStateStart = app.indexOf('let purchaseReceiptReversalPending = false;');
assert.ok(receiptPostStart >= 0 && reversalStateStart > receiptPostStart,
  'receipt and reversal handlers must remain discoverable');
const receiptPostHandler = app.slice(receiptPostStart, reversalStateStart);
assert.ok(receiptPostHandler.includes('if(purchaseReceiptPending || purchaseReceiptReversalPending) return;'),
  'receipt posting must not start while a reversal is awaiting its commit');

console.log('ERP purchase receiving and append-only reversal integration and backup checks passed.');


const reversalPostStart = app.indexOf('async function reversePurchaseReceipt(');
assert.ok(reversalPostStart >= 0, 'receipt reversal handler must remain discoverable');
const reversalPostSource = app.slice(reversalPostStart, reversalPostStart + 5000);
assert.ok(reversalPostSource.includes('if(purchaseReceiptPending || purchaseReceiptReversalPending) return;'),
  'reversal posting must not start while a receipt is awaiting its commit');
assert.ok(reversalPostSource.includes('if(storageRecoveryRequired)'),
  'reversal posting must remain blocked while storage recovery is required');


assert.ok(reversalPostSource.indexOf('purchaseReceiptReversalPending=true') <
          reversalPostSource.indexOf('await import('),
  'reversal lock must be acquired before yielding to asynchronous module loading');
assert.ok(reversalPostSource.includes('finally{\n    purchaseReceiptReversalPending=false;'),
  'reversal lock must be released in a finally block after success or failure');
