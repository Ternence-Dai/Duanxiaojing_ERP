'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const refsStart = app.indexOf('const ENTITY_REFERENCE_RULES =');
const refsEnd = app.indexOf('\nfunction colorHex', refsStart);
if (refsStart < 0 || refsEnd <= refsStart) throw new Error('entity reference rules not found');
const refsSource = app.slice(refsStart, refsEnd);

function extract(startToken, endToken) {
  const start = app.indexOf(startToken);
  const end = app.indexOf(endToken, start);
  if (start < 0 || end <= start) throw new Error('Cannot extract ' + startToken);
  return app.slice(start, end);
}
const saveSource = extract('async function saveForm(){', '\nfunction genId');
const deleteSource = extract('function delRow(key, id, fromModal){', '\nfunction openColSettings');

function referenceContext(db) {
  const context = {
    DB: db,
    toastMessages: [],
    toast(message) { this.toastMessages.push(message); }
  };
  vm.createContext(context);
  vm.runInContext(refsSource + '\nthis.findEntityReferences = findEntityReferences;', context);
  return context;
}

{
  const db = {
    orders: [{no:'SO-1',cust:'Acme'}],
    workorders: [{no:'WO-1',so:'SO-1'}],
    quality: [{no:'QC-1',so:'SO-1'}],
    inventory: [{code:'M-1',supplier:'Supplier A'}],
    purchase: [{no:'PO-1',sup:'Supplier A'}]
  };
  const context = referenceContext(db);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.findEntityReferences('customers',{name:'Acme'}).map(x=>x.table))),
    ['orders'],
    'customer identity must be traced to sales orders'
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.findEntityReferences('suppliers',{name:'Supplier A'}).map(x=>x.table))),
    ['inventory','purchase'],
    'supplier identity must be traced to stock and purchase records'
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.findEntityReferences('orders',{no:'SO-1'}).map(x=>x.table))),
    ['workorders','quality'],
    'order number must be traced to production and quality records'
  );
  assert.equal(context.findEntityReferences('customers',{name:'Ac'}).length,0,
    'reference checks must use exact identities, not substring matches');
}

function runSave({table, primaryKey, record, rows, fields, values}) {
  const db = {...rows, [table]:[record]};
  const context = referenceContext(db);
  Object.assign(context, {
    formState:{key:table,editingId:String(record[primaryKey])},
    storageRecoveryRequired:false,
    inventorySavePending:false,
    SCHEMAS:{[table]:{key:table,idKey:primaryKey,fields}},
    $:id=>({value:values[id] ?? ''}),
    snapshotDB:()=>JSON.parse(JSON.stringify(context.DB)),
    commitDBMutation:()=>{context.saved=true;return true;},
    render:()=>{},initNav:()=>{},closeModal:()=>{},
    toast:message=>context.toastMessages.push(message)
  });
  vm.runInContext(saveSource + '\nthis.__saveForm=saveForm;',context);
  context.__saveForm();
  return context;
}

{
  const fields=[{k:'id',t:'text'},{k:'name',t:'text'},{k:'phone',t:'text'}];
  const rows={orders:[{no:'SO-1',cust:'Acme'}]};
  let context=runSave({
    table:'customers',primaryKey:'id',
    record:{id:'C-1',name:'Acme',phone:'111'},
    rows,fields,values:{ff_id:'C-1',ff_name:'Acme Ltd',ff_phone:'222'}
  });
  assert.equal(context.DB.customers[0].name,'Acme',
    'customer identity rename must not orphan an existing order');
  assert.equal(context.saved,undefined);
  assert.ok(context.toastMessages.some(message=>message.includes('销售订单')),
    'customer rename rejection must explain the linked sales-order dependency');

  context=runSave({
    table:'customers',primaryKey:'id',
    record:{id:'C-1',name:'Acme',phone:'111'},
    rows,fields,values:{ff_id:'C-1',ff_name:'Acme',ff_phone:'222'}
  });
  assert.equal(context.saved,true,
    'editing non-identity fields or retaining the current identity must remain possible');
  assert.equal(context.DB.customers[0].phone,'222',
    'non-identity customer data must remain editable when references exist');
}

{
  const supplierFields=[{k:'id',t:'text'},{k:'name',t:'text'},{k:'phone',t:'text'}];
  const supplierContext=runSave({
    table:'suppliers',primaryKey:'id',
    record:{id:'S-1',name:'Supplier A',phone:'111'},
    rows:{inventory:[{code:'M-1',supplier:'Supplier A'}],purchase:[{no:'PO-1',sup:'Supplier A'}]},
    fields:supplierFields,
    values:{ff_id:'S-1',ff_name:'Supplier A Ltd',ff_phone:'222'}
  });
  assert.equal(supplierContext.DB.suppliers[0].name,'Supplier A',
    'supplier identity rename must not orphan inventory or purchase records');
  assert.equal(supplierContext.saved,undefined);
  assert.ok(supplierContext.toastMessages.some(message=>
    message.includes('物料库存台账') && message.includes('采购单')),
    'supplier rename rejection must list each linked business area');

  const orderContext=runSave({
    table:'orders',primaryKey:'no',
    record:{no:'SO-1',cust:'Acme'},
    rows:{workorders:[{no:'WO-1',so:'SO-1'}],quality:[{no:'QC-1',so:'SO-1'}]},
    fields:[{k:'no',t:'text'},{k:'cust',t:'text'}],
    values:{ff_no:'SO-2',ff_cust:'Acme'}
  });
  assert.equal(orderContext.DB.orders[0].no,'SO-1',
    'order number rename must not orphan production and quality records');
  assert.equal(orderContext.saved,undefined);
  assert.ok(orderContext.toastMessages.some(message=>
    message.includes('生产工单') && message.includes('质量检验单')),
    'order rename rejection must explain production and quality dependencies');
}

{
  const db={customers:[{id:'C-1',name:'Acme'}],orders:[{no:'SO-1',cust:'Acme'}]};
  const context=referenceContext(db);
  Object.assign(context,{
    storageRecoveryRequired:false,
    SCHEMAS:{customers:{key:'customers',idKey:'id'}},
    confirm:()=>true,
    snapshotDB:()=>JSON.parse(JSON.stringify(context.DB)),
    commitDBMutation:()=>{context.saved=true;return true;},
    render:()=>{},initNav:()=>{},closeModal:()=>{},
    toast:message=>context.toastMessages.push(message)
  });
  vm.runInContext(deleteSource+'\nthis.__delRow=delRow;',context);
  context.__delRow('customers','C-1',false);
  assert.equal(context.DB.customers.length,1,
    'customer records referenced by orders must not be deleted');
  assert.equal(context.saved,undefined);
  assert.ok(context.toastMessages.some(message=>message.includes('不能直接删除')),
    'blocked master deletion must explain the required relationship handling');
}
{
  const cases=[
    {
      table:'suppliers',id:'S-1',schema:{key:'suppliers',idKey:'id'},
      db:{suppliers:[{id:'S-1',name:'Supplier A'}],inventory:[{code:'M-1',supplier:'Supplier A'}],purchase:[]},
      expected:'物料库存台账'
    },
    {
      table:'orders',id:'SO-1',schema:{key:'orders',idKey:'no'},
      db:{orders:[{no:'SO-1',cust:'Acme'}],workorders:[{no:'WO-1',so:'SO-1'}],quality:[]},
      expected:'生产工单'
    }
  ];
  for(const item of cases){
    const ctx=referenceContext(item.db);
    Object.assign(ctx,{
      storageRecoveryRequired:false,
      SCHEMAS:{[item.table]:item.schema},
      confirm:()=>true,
      snapshotDB:()=>JSON.parse(JSON.stringify(ctx.DB)),
      commitDBMutation:()=>{ctx.saved=true;return true;},
      render:()=>{},initNav:()=>{},closeModal:()=>{},
      toast:message=>ctx.toastMessages.push(message)
    });
    vm.runInNewContext(deleteSource+'\\nthis.__delRow=delRow;',ctx);
    ctx.__delRow(item.table,item.id,false);
    assert.equal(ctx.DB[item.table].length,1,
      item.table+' referenced master records must not be deleted');
    assert.equal(ctx.saved,undefined);
    assert.ok(ctx.toastMessages.some(message=>message.includes(item.expected)),
      item.table+' delete rejection must list its dependency');
  }
}
console.log('ERP entity reference integrity regression checks passed (rename guards, delete guards, valid edits).');
