'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/demo-seed-data.js', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = html.indexOf('async function saveForm(){');
const end = html.indexOf('\nfunction genId', start);
if (start < 0 || end < 0) throw new Error('saveForm source not found');
const source = html.slice(start, end);
function run(values, initialRows = [], editingId = null) {
  const fields = [
    {k:'no',l:'订单号',t:'text',req:true},
    {k:'qty',l:'数量',t:'number',req:true},
    {k:'price',l:'单价',t:'number'},
    {k:'orderDate',l:'下单日期',t:'date'},
    {k:'delivery',l:'交货日期',t:'date',req:true}
  ];
  const elements = Object.fromEntries(Object.entries(values).map(([k,value]) => ['ff_'+k,{value:String(value)}]));
  const messages = [];
  const context = {
    formState:{key:'orders',editingId},
    storageRecoveryRequired:false,
    inventorySavePending:false,
    SCHEMAS:{orders:{key:'orders',idKey:'no',fields}},
    ENTITY_REFERENCE_RULES:{orders:null},
    findEntityReferences:()=>[],
    DB:{orders:initialRows},
    $:id=>elements[id] || null,
    toast:m=>messages.push(m),
    saveDB:()=>true, snapshotDB:()=>JSON.parse(JSON.stringify(context.DB)), commitDBMutation:()=>true, closeModal:()=>{},render:()=>{},initNav:()=>{},
    genId:()=> 'SO-TEST'
  };
  vm.runInNewContext(source, context);
  context.saveForm();
  return {rows:context.DB.orders,messages};
}
const assert = require('node:assert/strict');
const productCss = fs.readFileSync('assets/css/product-system.css', 'utf8');
assert.ok(html.includes('product-system.css?v=20261019-v8'),
  'ERP page must load the visible V8 product stylesheet');
assert.ok(productCss.includes('Textile ERP operations workspace'),
  'ERP visual system must expose its current product redesign layer');
for (const selector of [
  '.sidebar{', '.topbar{', '.erp-intro{', '.kpi-grid{',
  '.kpi{', '.grid-2{', '.table-wrap{', 'thead th{', '.modal{'
]) assert.ok(productCss.includes(selector),
  'ERP product system must style the key operating surface: ' + selector);
assert.ok(productCss.includes('@media(max-width:900px)') &&
          productCss.includes('@media(max-width:520px)'),
  'ERP redesign must preserve tablet and phone layout rules');

assert.ok(productCss.includes('V4 · ZhiYun ERP operations command center') &&
          productCss.includes('.erp-intro:after{') &&
          productCss.includes('.product-workflow__grid{') &&
          productCss.includes('.content .kpi:after{'),
  'ERP V4 must implement the refreshed operations masthead, workflow cards and KPI treatment');
assert.ok(productCss.includes('@media(max-width:900px)') &&
          productCss.includes('@media(max-width:520px)') &&
          productCss.includes('.product-workflow__item:hover'),
  'ERP V4 must provide responsive business workflow cards and interactive states');

assert.ok(productCss.includes('prefers-reduced-motion:reduce'),
  'ERP redesign must respect reduced motion preferences');

assert.ok(html.includes("const today = () => { const d = new Date();"),
  'ERP date helper must use the browser local calendar');
for (const token of ["d.getFullYear()", "d.getMonth()+1", "d.getDate()"])
  assert.ok(html.includes(token), 'local date helper must include ' + token);
assert.ok(!html.includes("const today = () => new Date().toISOString()"),
  'ERP default date must not use the UTC calendar day');

let result = run({no:'SO-1',qty:'0',price:'12.5',orderDate:'2026-10-17',delivery:'2026-10-18'});
assert.equal(result.rows.length,0,'zero order quantity must not be saved');
assert.match(result.messages[0],/必须大于 0/);
result = run({no:'SO-2',qty:'2',price:'12.5',orderDate:'2026-10-19',delivery:'2026-10-18'});
assert.equal(result.rows.length,0,'delivery before order date must be rejected');
assert.match(result.messages[0],/不能早于/);
result = run({no:'SO-3',qty:'2',price:'12.5',orderDate:'2026-02-30',delivery:'2026-10-18'});
assert.equal(result.rows.length,0,'invalid calendar date must be rejected');
assert.match(result.messages[0],/日期格式无效/);
result = run({no:'SO-4',qty:'2',price:'12.5',orderDate:'2026-10-17',delivery:'2026-10-18'});
assert.equal(result.rows.length,1,'valid order should be saved');
assert.equal(result.rows[0].qty,2);
assert.equal(result.rows[0].price,12.5);
result = run({no:'SO-2',qty:'3',price:'12.5',orderDate:'2026-10-17',delivery:'2026-10-18'}, [
  {no:'SO-1',qty:2,price:10,orderDate:'2026-10-16',delivery:'2026-10-20'},
  {no:'SO-2',qty:4,price:11,orderDate:'2026-10-16',delivery:'2026-10-21'}
], 'SO-1');
assert.equal(result.rows[0].no, 'SO-1', 'editing must not overwrite another record with a duplicate primary key');
assert.equal(result.rows[0].qty, 2);
assert.match(result.messages[0], /已存在/);
result = run({no:'SO-1',qty:'3',price:'12.5',orderDate:'2026-10-17',delivery:'2026-10-18'}, [
  {no:'SO-1',qty:2,price:10,orderDate:'2026-10-16',delivery:'2026-10-20'}
], 'SO-1');
assert.equal(result.rows[0].qty, 3, 'editing must allow retaining the current record primary key');

assert.ok(html.includes('const jsArg = value => JSON.stringify('),
  'dynamic handler arguments must use JavaScript-string plus HTML-attribute encoding');
for (const token of [
  'openForm(${jsArg(key)},${jsArg(id)})',
  'delRow(${jsArg(key)},${jsArg(id)})',
  'jumpTo(${jsArg(x.key)},${jsArg(x.id)})',
  'pickSuggest(${jsArg(key)},${jsArg(v)})'
]) assert.ok(html.includes(token), 'dynamic inline handler must encode its arguments: ' + token);
assert.ok(html.includes("onclick=\"delRow(${jsArg(key)},${jsArg(id)},true)\""), 'delete action arguments must use JS-safe attribute encoding');
assert.ok(html.includes("const show = record ? esc(val) :"), 'read-only fields must escape imported record values');
assert.ok(html.includes("onclick=\"pickDict(${jsArg(k)})\""), 'dictionary keys must use JS-safe handler encoding');
assert.ok(html.includes("onclick=\"saveDictItem(${jsArg(dictKey)}, ${idx})\""), 'dictionary save handler must encode its key');
assert.ok(html.includes('onclick="setFilter(${jsArg(key)},${jsArg(o)})"'),
  'filter options must use JS-safe encoding rather than HTML escaping alone');
assert.ok(html.includes('<div class="dn">${esc(names[k] || k)}</div>'), 'dictionary labels must be HTML escaped');


function testStorageRecovery(initialRaw, readThrows = false) {
  let writes = 0;
  let preserved = 0;
  const storage = {
    getItem() { if (readThrows) throw new Error('storage unavailable'); return initialRaw; },
    setItem() { writes++; },
  };
  const context = {
    STORE_KEY:'erp_test',
    storageRecoveryRequired:false,
    SCHEMAS:{orders:{}},
    localStorage:storage,
    window:{addEventListener(){}},
    lastKnownStorageValue:null,
    storageConflictDetected:false,
    isValidDBShape:d=>!!(d && d.settings && d.dict && Array.isArray(d.orders)),
    preserveInvalidDB:raw=>{ if(raw) preserved++; return true; },
    defaultDB:()=>({settings:{demo:true},dict:{},orders:[]}),
    DB:{settings:{demo:true},dict:{},orders:[]},
    toast:()=>{},
    fileHandle:null,
    fileReady:false,
    saveTimer:null,
    writeToFile:()=>{},
  };
  vm.createContext(context);
  const loadStart=html.indexOf('function loadDB(){');
  const loadEnd=html.indexOf('\n\nlet saveTimer',loadStart);
  assert.ok(loadStart>=0 && loadEnd>loadStart,'loadDB source must be available');
  vm.runInContext(html.slice(loadStart,loadEnd),context);
  const loaded=context.loadDB();
  const locked=vm.runInContext('storageRecoveryRequired',context);
  const saveStart=html.indexOf('function saveDB(){');
  const saveEnd=html.indexOf('\n\nasync function writeToFile',saveStart);
  assert.ok(saveStart>=0 && saveEnd>saveStart,'saveDB source must be available');
  vm.runInContext(html.slice(saveStart,saveEnd),context);
  const saved=context.saveDB();
  return {loaded,locked,saved,writes,preserved};
}
let recovery=testStorageRecovery('{broken-json');
assert.equal(recovery.locked,true,'malformed persisted data must activate recovery lock');
assert.equal(recovery.saved,false,'automatic save must be blocked while recovery is required');
assert.equal(recovery.writes,0,'demo defaults must never overwrite malformed persisted data');
assert.equal(recovery.preserved,1,'malformed raw data must be preserved for recovery');
recovery=testStorageRecovery(null,true);
assert.equal(recovery.locked,true,'an unreadable storage backend must activate recovery lock');
assert.equal(recovery.saved,false,'automatic save must be blocked when storage cannot be read');
assert.equal(recovery.writes,0,'no writes are allowed after a storage read failure');
recovery=testStorageRecovery(JSON.stringify({settings:{},dict:{},orders:[]}));
assert.equal(recovery.locked,false,'valid persisted data must not activate recovery lock');
assert.equal(recovery.saved,true,'valid persisted data may be saved normally');
assert.equal(recovery.writes,1,'normal save must persist valid data exactly once');
const importAllStart = html.indexOf('function importAll(input){');
assert.ok(importAllStart >= 0, 'ERP JSON import handler must exist');
// Keep this focused assertion independent from later UI helper boundaries.
const importAllSource = html.slice(importAllStart, importAllStart + 1800);
assert.ok(importAllSource.includes('const previousRecoveryRequired = storageRecoveryRequired;'),
  'ERP import must snapshot the pre-import recovery lock');
assert.ok(importAllSource.indexOf('const previousRecoveryRequired = storageRecoveryRequired;') <
          importAllSource.indexOf('storageRecoveryRequired = false;'),
  'ERP import must capture recovery state before attempting to unlock');
assert.ok(importAllSource.includes('storageRecoveryRequired = previousRecoveryRequired || storageRecoveryRequired;'),
  'a failed ERP import write must retain either the original or newly raised recovery lock');

const resetAllStart = html.indexOf('function resetAll(){');
const resetAllEnd = html.indexOf('/* ---------- 字段配置', resetAllStart);
assert.ok(resetAllStart >= 0 && resetAllEnd > resetAllStart, 'ERP reset handler must exist');
const resetAllSource = html.slice(resetAllStart, resetAllEnd);
assert.ok(resetAllSource.includes('const previousRecoveryRequired = storageRecoveryRequired;'),
  'explicit reset must snapshot the pre-reset recovery lock');
assert.ok(resetAllSource.indexOf('const previousRecoveryRequired = storageRecoveryRequired;') <
          resetAllSource.indexOf('storageRecoveryRequired = false;'),
  'explicit reset must capture recovery state before attempting to unlock');
assert.ok(resetAllSource.includes('storageRecoveryRequired = previousRecoveryRequired || storageRecoveryRequired;'),
  'a failed reset write must not clear the original or newly raised recovery lock');

assert.ok(html.includes("if(previous && String(previous.code).trim() !== String(obj.code).trim())"), 'inventory SKU identity must not be renamed in-place');
const inventorySaveStart = html.indexOf("if(key === 'inventory'){");
const inventorySaveEnd = html.indexOf("if(editingId && ENTITY_REFERENCE_RULES[key])", inventorySaveStart);
assert.ok(inventorySaveStart >= 0 && inventorySaveEnd > inventorySaveStart,
  'inventory quantity save boundary must be available');
const inventorySaveSource = html.slice(inventorySaveStart, inventorySaveEnd);
assert.ok(inventorySaveSource.includes('domain.normalizeStockBalance(previousQty)') &&
  inventorySaveSource.includes('domain.normalizeStockBalance(nextQty)'),
  'changed inventory quantities must validate both the previous and next three-decimal balances');
assert.ok(inventorySaveSource.includes('Number((normalizedNext - normalizedPrevious).toFixed(3))'),
  'the difference between normalized milliunit balances must be canonicalized before domain validation');
assert.ok(inventorySaveSource.includes('const quantityChanged = !previous || nextQty !== previousQty'),
  'unchanged legacy quantities may be retained while unrelated inventory fields are edited');
assert.ok(inventorySaveSource.includes('while(references.has(reference))'),
  'new stock movement references must be unique even when multiple changes share a millisecond');
assert.ok(html.includes("库存编码不可直接修改"), 'SKU rename protection must explain the safe retirement workflow');
assert.ok(html.includes("if(key === 'inventory' && Number(rec.qty) !== 0)"), 'non-zero inventory must not be deleted outside the stock ledger');
assert.ok(html.includes("请先通过库存调整完成出库"), 'blocked stock deletion must direct users to a traceable adjustment');

const bindStart=html.indexOf('async function bindLocalFile(){');
const bindEnd=html.indexOf('\nasync function createLocalFile()',bindStart);
const bindSource=html.slice(bindStart,bindEnd);
assert.ok(bindStart>=0 && bindEnd>bindStart,'file binding source must be available');
assert.ok(bindSource.includes('const imported = await readFromFile();'),
  'binding an existing file must import and validate it before enabling writes');
assert.ok(bindSource.includes('if(!imported){'),
  'invalid or empty files must be rejected');
assert.ok(!bindSource.includes('await writeToFile();'),
  'binding an existing file must never overwrite it immediately');

const restoreStart=html.indexOf('async function restoreHandle(){');
const restoreEnd=html.indexOf('\nasync function reRequestPermission()',restoreStart);
const restoreSource=html.slice(restoreStart,restoreEnd);
assert.ok(restoreSource.includes('const imported = await readFromFile();'),
  'restoring a file handle must validate the existing file first');
assert.ok(restoreSource.includes('if(!imported){'),
  'failed handle restoration must stop without writing');
assert.ok(restoreSource.includes('if(fileSyncPending)') &&
          restoreSource.includes('if(fileSyncPending === null)') &&
          restoreSource.includes('const synced = await writeToFile();'),
  'handle restoration may only write browser data when a matching pending-sync marker proves it is newer');

const permissionStart=html.indexOf('async function reRequestPermission(){');
const permissionEnd=html.indexOf('\nfunction openHandleDB()',permissionStart);
const permissionSource=html.slice(permissionStart,permissionEnd);
assert.ok(permissionSource.includes('const imported = await readFromFile();'),
  'permission renewal must reload and validate the selected file');
assert.ok(permissionSource.includes('if(!imported){'),
  'permission renewal must stop when the file cannot be validated');
assert.ok(permissionSource.includes('if(fileSyncPending)') &&
          permissionSource.includes('if(fileSyncPending === null)') &&
          permissionSource.includes('const synced = await writeToFile();') &&
          permissionSource.includes('const imported = await readFromFile();'),
  'permission renewal must only replay a fingerprint-matched browser snapshot, otherwise validate the file before import');


const createStart=html.indexOf('async function createLocalFile(){');
const createEnd=html.indexOf('\nasync function unbindLocalFile()',createStart);
const createSource=html.slice(createStart,createEnd);
assert.ok(createStart>=0 && createEnd>createStart,'new-file creation source must be available');
assert.ok(createSource.includes('if(storageRecoveryRequired){'),
  'new ERP files must not be created from untrusted demo defaults while recovery is pending');


const persistenceStart=html.indexOf('function snapshotDB(){');
const persistenceEnd=html.indexOf('\n\nasync function writeToFile',persistenceStart);
assert.ok(persistenceStart>=0 && persistenceEnd>persistenceStart,'ERP persistence transaction helpers must be available');
const persistenceSource=html.slice(persistenceStart,persistenceEnd);
const persistenceContext={
  DB:{settings:{company:'before'},orders:[{no:'SO-1'}]},
  saveDB:()=>false,
  clearTimeout:()=>{},
  saveTimer:null,
  initNav:()=>{},
  render:()=>{},
  toast:()=>{}
};
vm.createContext(persistenceContext);
vm.runInContext(persistenceSource,persistenceContext);
const before=persistenceContext.snapshotDB();
persistenceContext.DB.settings.company='unsaved-change';
persistenceContext.DB.orders.push({no:'SO-2'});
assert.equal(persistenceContext.commitDBMutation(before),false,'failed persistence must report failure');
assert.equal(persistenceContext.DB.settings.company,'before','failed persistence must roll back settings');
assert.equal(persistenceContext.DB.orders.length,1,'failed persistence must roll back added business rows');

assert.match(html,/storageRecoveryRequired = true;\n    console\.error\('浏览器缓存保存失败'/,
  'browser persistence failure must activate a write-protection lock');
assert.match(html,/if\(localSaved && fileHandle && fileReady\)/,
  'failed local persistence must not queue an external-file write of uncommitted data');
for(const token of [
  'if(!commitDBMutation(previousDB)) return;',
  'const previousDB = snapshotDB();'
]) assert.ok(html.includes(token),'mutating operations must use rollback-safe persistence: '+token);


assert.ok(html.includes('function renderStockMovementHistory(){'),
  'inventory page must expose the saved stock movement ledger');
for (const token of ['m.occurredAt','m.sku','m.quantityDelta','m.previousBalance','m.nextBalance','m.reference']) {
  assert.ok(html.includes(token), 'stock ledger must display traceable movement field: ' + token);
}
assert.ok(html.includes("暂无库存流水。历史库存不会自动补造流水"),
  'legacy inventory without a ledger must be clearly distinguished from recorded movement history');
assert.ok(html.includes("key === 'inventory' ? renderStockMovementHistory() : ''"),
  'stock movement history must appear on the inventory page only');

console.log('ERP form validation and persistence rollback regression checks passed.');

assert.ok(html.includes("async function saveForm(){\n  if(inventorySavePending){ toast('库存保存正在处理中，请勿重复提交'); return; }\n  if(storageRecoveryRequired){\n    toast('检测到原 ERP 缓存异常"), 'record editing must stop before mutating memory when cache recovery is required');
assert.ok(html.includes("function delRow(key, id, fromModal){\n  if(storageRecoveryRequired){\n    toast('检测到原 ERP 缓存异常"), 'record deletion must stop before mutating memory when cache recovery is required');


// Deletion must preserve the audit trail. Non-zero stock is not deletable;
// zero-balance retirement removes only the master row, never historical moves.
const deleteStart=html.indexOf('function delRow(key, id, fromModal){');
const deleteEnd=html.indexOf('function openColSettings',deleteStart);
assert.ok(deleteStart>=0 && deleteEnd>deleteStart,'inventory deletion source must be available');
const deleteSource=html.slice(deleteStart,deleteEnd);
function runDelete(quantity, confirmResult=true){
  const db={
    inventory:[{code:'SKU-1',qty:quantity,name:'Test item'}],
    stockMovements:[
      {sku:'SKU-1',quantityDelta:5,previousBalance:0,nextBalance:5,reference:'OPEN-1'},
      {sku:'SKU-1',quantityDelta:-5,previousBalance:5,nextBalance:0,reference:'OUT-1'}
    ],
    settings:{},dict:{}
  };
  const messages=[];
  let confirms=0;
  const context={
    storageRecoveryRequired:false,
    SCHEMAS:{inventory:{key:'inventory',idKey:'code'}},
    ENTITY_REFERENCE_RULES:{},
    findEntityReferences:()=>[],
    DB:db,
    snapshotDB:()=>JSON.parse(JSON.stringify(db)),
    commitDBMutation:()=>true,
    confirm:()=>{confirms++;return confirmResult;},
    toast:m=>messages.push(m),
    closeModal:()=>{},
    render:()=>{},
    initNav:()=>{}
  };
  vm.createContext(context);
  vm.runInContext(deleteSource,context);
  context.delRow('inventory','SKU-1',false);
  return {db,messages,confirms};
}
let deletion=runDelete(2);
assert.equal(deletion.db.inventory.length,1,'non-zero stock deletion must leave the master record intact');
assert.equal(deletion.confirms,0,'non-zero stock deletion must stop before confirmation');
assert.equal(deletion.db.stockMovements.length,2,'blocked deletion must leave ledger history intact');
deletion=runDelete(0);
assert.equal(deletion.db.inventory.length,0,'zero-balance inventory may be retired');
assert.equal(deletion.db.stockMovements.length,2,'retiring a zero-balance SKU must retain its full audit trail');
assert.equal(deletion.db.stockMovements[1].nextBalance,0,'retained ledger must preserve the closing zero balance');
deletion=runDelete(0,false);
assert.equal(deletion.db.inventory.length,1,'cancelled deletion must preserve the master record');
assert.equal(deletion.db.stockMovements.length,2,'cancelled deletion must preserve the ledger');

assert.match(html, /let inventorySavePending = false/, 'inventory async save must have a duplicate-submit guard');
assert.match(html, /if\(inventorySavePending\)/, 'concurrent inventory submissions must be rejected');
assert.match(html, /库存校验与保存正在进行/, 'modal must not close while inventory validation is pending');
assert.match(html, /inventorySavePending = false;\s*\}catch\(e\)/, 'inventory save guard must reset after domain validation failure');

const seedSource = fs.readFileSync('assets/js/demo-seed-data.js', 'utf8');
const appSource = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const schemaStart = appSource.indexOf('const SCHEMAS = {');
const schemaEnd = appSource.indexOf('\n};', schemaStart) + 3;
const shapeStart = appSource.indexOf('function isValidDBShape(d){');
const shapeEnd = appSource.indexOf('\nfunction preserveInvalidDB', shapeStart);
assert.ok(schemaStart >= 0 && schemaEnd > schemaStart, 'ERP table schemas must be available');
assert.ok(shapeStart >= 0 && shapeEnd > shapeStart, 'deep ERP backup validator must be available');
const schemaSource = appSource.slice(schemaStart, schemaEnd);
const shapeSource = appSource.slice(shapeStart, shapeEnd);
const shapeContext = {};
vm.runInNewContext(seedSource + '\n' + schemaSource + '\n' + shapeSource +
  '\nthis.api={defaultDB,isValidDBShape,SCHEMAS};', shapeContext);
const demoDB = shapeContext.api.defaultDB();
assert.equal(shapeContext.api.isValidDBShape(demoDB), true, 'the shipped demo dataset must pass its own backup validator');
for (const [table, schema] of Object.entries(shapeContext.api.SCHEMAS)) {
  const malformed = JSON.parse(JSON.stringify(demoDB));
  malformed[schema.key || table][0] = null;
  assert.equal(shapeContext.api.isValidDBShape(malformed), false, table + ' must reject null rows');
  const duplicate = JSON.parse(JSON.stringify(demoDB));
  if (duplicate[schema.key || table].length > 1) {
    duplicate[schema.key || table][1][schema.idKey] = duplicate[schema.key || table][0][schema.idKey];
    assert.equal(shapeContext.api.isValidDBShape(duplicate), false, table + ' must reject duplicate primary keys');
  }
}
const badDict = JSON.parse(JSON.stringify(demoDB));
badDict.dict.broken = {not:'an array'};
assert.equal(shapeContext.api.isValidDBShape(badDict), false, 'dictionary collections must be arrays');
const badMovement = JSON.parse(JSON.stringify(demoDB));
badMovement.stockMovements = [{sku:'SKU-1',quantityDelta:1,reference:'DUP',occurredAt:'2026-10-17T09:00:00Z',previousBalance:0,nextBalance:1}];
badMovement.stockMovements.push({...badMovement.stockMovements[0]});
assert.equal(shapeContext.api.isValidDBShape(badMovement), false, 'duplicate stock movement references must be rejected');

{
  const ledgerDB = JSON.parse(JSON.stringify(demoDB));
  const inventory = ledgerDB.inventory[0];
  const originalBalance = inventory.qty;
  inventory.qty = originalBalance - 50;
  ledgerDB.stockMovements = [
    {sku:inventory.code,quantityDelta:-50,reference:'TEST-NEW',occurredAt:'2026-10-18T08:00:02Z',
      previousBalance:originalBalance,nextBalance:originalBalance-50},
    {sku:inventory.code,quantityDelta:200,reference:'TEST-OLD',occurredAt:'2026-10-18T08:00:01Z',
      previousBalance:originalBalance-200,nextBalance:originalBalance}
  ];
  assert.equal(shapeContext.api.isValidDBShape(ledgerDB),true,
    'newest-first movements with continuous balances must agree with current inventory');

  const mismatchedMaster = JSON.parse(JSON.stringify(ledgerDB));
  mismatchedMaster.inventory[0].qty += 0.001;
  assert.equal(shapeContext.api.isValidDBShape(mismatchedMaster),false,
    'latest stock ledger balance must equal the inventory master quantity');

  const brokenChain = JSON.parse(JSON.stringify(ledgerDB));
  brokenChain.stockMovements[0].previousBalance += 0.001;
  brokenChain.stockMovements[0].nextBalance += 0.001;
  assert.equal(shapeContext.api.isValidDBShape(brokenChain),false,
    'adjacent stock movements must reconcile exactly');

  const reversed = JSON.parse(JSON.stringify(ledgerDB));
  reversed.stockMovements.reverse();
  assert.equal(shapeContext.api.isValidDBShape(reversed),false,
    'stock movements must retain their newest-first chain order');

  const duplicateReference = JSON.parse(JSON.stringify(ledgerDB));
  duplicateReference.stockMovements[0].reference = duplicateReference.stockMovements[1].reference;
  assert.equal(shapeContext.api.isValidDBShape(duplicateReference),false,
    'stock movement references must be unique');

  const orphanedNonzero = JSON.parse(JSON.stringify(ledgerDB));
  orphanedNonzero.inventory = orphanedNonzero.inventory.filter(row => row.code !== inventory.code);
  assert.equal(shapeContext.api.isValidDBShape(orphanedNonzero),false,
    'a retired SKU must have a zero closing ledger balance');

  const retired = JSON.parse(JSON.stringify(demoDB));
  const retiredInventory = retired.inventory[0];
  retired.inventory = retired.inventory.filter(row => row.code !== retiredInventory.code);
  retired.stockMovements = [{
    sku:retiredInventory.code,quantityDelta:-retiredInventory.qty,reference:'TEST-RETIRE',
    occurredAt:'2026-10-18T08:00:03Z',previousBalance:retiredInventory.qty,nextBalance:0
  }];
  assert.equal(shapeContext.api.isValidDBShape(retired),true,
    'zero-balance retired SKUs may keep immutable ledger history');

  const invalidDate = JSON.parse(JSON.stringify(ledgerDB));
  invalidDate.stockMovements[0].occurredAt = '2026-02-30T08:00:02Z';
  assert.equal(shapeContext.api.isValidDBShape(invalidDate),false,
    'stock movement timestamps must contain real calendar dates');
}
