'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const start = html.indexOf('function saveForm(){');
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
    SCHEMAS:{orders:{key:'orders',idKey:'no',fields}},
    DB:{orders:initialRows},
    $:id=>elements[id] || null,
    toast:m=>messages.push(m),
    saveDB:()=>true,closeModal:()=>{},render:()=>{},initNav:()=>{},
    genId:()=> 'SO-TEST'
  };
  vm.runInNewContext(source, context);
  context.saveForm();
  return {rows:context.DB.orders,messages};
}
const assert = require('node:assert/strict');
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
assert.ok(html.includes('storageRecoveryRequired = false;\n      const localSaved = saveDB();'),
  'valid JSON import must release the recovery lock before saving');
assert.ok(html.includes('storageRecoveryRequired = false;\n  saveDB();'),
  'explicitly confirmed demo reset must release the recovery lock');

console.log('ERP form validation regression checks passed.');
