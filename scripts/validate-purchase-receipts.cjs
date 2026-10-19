'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('assets/css/product-system.css', 'utf8');
const seed = fs.readFileSync('assets/js/demo-seed-data.js', 'utf8');
const domain = fs.readFileSync('src/domain/index.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/validate.yml', 'utf8');

assert.ok(html.includes('product-system.css?v=20261019-v6'),
  'ERP must load the receipt-enabled product V6 workflow stylesheet revision');

for (const id of [
  'purchase-receipt-form', 'receipt-purchase-order', 'receipt-sku',
  'receipt-quantity', 'receipt-batch', 'receipt-location', 'receipt-time',
  'receipt-receiver', 'receipt-inspector', 'receipt-inspection',
  'receipt-remaining', 'receipt-match-message', 'receipt-submit'
]) assert.ok(app.includes('id="' + id + '"'),
  'purchase receiving form must expose ' + id);

assert.ok(app.includes('function renderPurchaseReceiptWorkspace()') &&
          app.includes('function renderPurchaseReceiptSkuOptions()') &&
          app.includes('async function postPurchaseReceipt()'),
  'purchase receiving UI, SKU mapping and posting handler must exist');
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
          domain.includes('export function validatePurchaseReceiptRecord('),
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
          app.includes("if(!Array.isArray(DB.stockMovements)) DB.stockMovements = [];"),
  'legacy app data must migrate missing receipt/movement tables to empty lists');

const importStart = app.indexOf('function importAll(input)');
const importEnd = app.indexOf('function resetAll()', importStart);
const importSource = app.slice(importStart, importEnd);
const fileStart = app.indexOf('function readFromFile()');
const fileEnd = app.indexOf('async function bindLocalFile()', fileStart);
const fileSource = app.slice(fileStart, fileEnd);
assert.ok(importSource.includes('isValidDBShape(d)') &&
          importSource.includes('DB.purchaseReceipts = []') &&
          fileSource.includes('isValidDBShape(d)') &&
          fileSource.includes('DB.purchaseReceipts = []'),
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
  previousBalance:0,nextBalance:10
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

console.log('ERP purchase receiving integration and legacy/current backup checks passed.');
