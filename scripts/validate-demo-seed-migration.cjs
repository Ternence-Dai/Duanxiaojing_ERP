'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const seedSource = fs.readFileSync('assets/js/demo-seed-data.js', 'utf8');
const appSource = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const seedContext = {};
vm.createContext(seedContext);
vm.runInContext(seedSource + '\nthis.__defaultDB = defaultDB; this.__createEmptyDB = createEmptyDB;', seedContext);
const fixture = JSON.parse(JSON.stringify(seedContext.__defaultDB()));
const emptyFixture = JSON.parse(JSON.stringify(seedContext.__createEmptyDB()));

const start = appSource.indexOf('function migrateUnmodifiedDemoLedger(data, raw){');
const end = appSource.indexOf('\nfunction loadDB(){', start);
assert.ok(start >= 0 && end > start, 'ERP demo-seed migration helper must exist');
const helperSource = appSource.slice(start, end);

function run(initial, options = {}) {
  const raw = JSON.stringify(initial);
  const marker = options.pendingFile ? 'pending-file-sync' : null;
  const values = new Map([[ 'textile_erp_v4_enterprise', raw ]]);
  if(marker) values.set('textile_erp_v4_enterprise_file_sync_pending', marker);
  const current = options.currentRaw === undefined ? raw : options.currentRaw;
  values.set('textile_erp_v4_enterprise', current);
  const context = {
    STORE_KEY:'textile_erp_v4_enterprise',
    FILE_SYNC_PENDING_KEY:'textile_erp_v4_enterprise_file_sync_pending',
    storageRecoveryRequired:false,
    storageConflictDetected:false,
    lastKnownStorageValue:raw,
    defaultDB:()=>JSON.parse(JSON.stringify(fixture)),
    Date, JSON,
    console:{info(){},warn(){},error(){}},
    localStorage:{
      getItem(key){return values.has(key)?values.get(key):null;},
      setItem(key,value){values.set(key,String(value));}
    }
  };
  vm.createContext(context);
  vm.runInContext(helperSource + '\nthis.__migrate = migrateUnmodifiedDemoLedger; this.__notice = () => demoSeedMigrationNotice;', context);
  const result = context.__migrate(context.__clone ? context.__clone(initial) : JSON.parse(raw), raw);
  return {result:JSON.parse(JSON.stringify(result)),values,raw,context,notice:context.__notice()};
}

{
  for (const key of ['products','specs','salesmen','inspectors','departments','warehouses']) {
    assert.deepEqual(emptyFixture.dict[key], [], 'new ERP ledger must not preload invented ' + key);
  }
  for (const key of ['customers','suppliers','orders','workorders','inventory','purchase','quality',
    'stockMovements','purchaseReceipts','purchaseReceiptReversals']) {
    assert.deepEqual(emptyFixture[key], [], 'new ERP ledger must start without sample ' + key);
  }
  assert.equal(emptyFixture.settings.dataProvenance,'empty-ledger');
}

{
  const result = run(fixture);
  const migrated = result.result;
  const archiveKeys = [...result.values.keys()].filter(key => key.startsWith('textile_erp_v4_enterprise_demo_archive_'));
  assert.equal(archiveKeys.length,1,'the original demo ledger must be archived before cleanup');
  assert.equal(result.values.get(archiveKeys[0]),result.raw,'archive must preserve the exact original ledger');
  for (const key of ['customers','suppliers','orders','workorders','inventory','purchase','quality',
    'stockMovements','purchaseReceipts','purchaseReceiptReversals']) {
    assert.deepEqual(migrated[key],[],key + ' must not retain unchanged synthetic operational records');
  }
  for (const key of ['products','specs','salesmen','inspectors','departments','warehouses']) {
    assert.deepEqual(migrated.dict[key],[],key + ' must not retain unchanged synthetic master records');
  }
  assert.equal(migrated.settings.dataProvenance,'empty-ledger');
  assert.ok(result.notice,'a successful migration must disclose its archive');
}

{
  const edited = JSON.parse(JSON.stringify(fixture));
  edited.orders[0].qty = Number(edited.orders[0].qty) + 1;
  edited.orders.push({ ...edited.orders[0], no:'USER-ADDED-ORDER-001' });
  edited.dict.products[0].price = Number(edited.dict.products[0].price) + 1;
  edited.dict.products.push({name:'用户自定义产品',spec:'用户规格',unit:'米',price:0,cat:'自定义'});
  edited.settings.company = '用户配置企业';
  const result = run(edited);
  const migrated = result.result;
  assert.equal(migrated.orders.length,2,'modified and user-added business rows must be retained');
  assert.equal(migrated.orders[0].qty,edited.orders[0].qty,'modified seed-like orders must never be deleted');
  assert.equal(migrated.dict.products.length,2,'modified and custom master rows must be retained');
  assert.equal(migrated.settings.company,'用户配置企业','customized company identity must never be overwritten');
  assert.equal(migrated.settings.dataProvenance,'demo-seed','mixed or edited demo-origin ledgers must stay disclosed as unverified');
}

{
  const imported = JSON.parse(JSON.stringify(fixture));
  imported.settings.dataProvenance = 'imported-ledger';
  const result = run(imported);
  assert.deepEqual(result.result,imported,'imported ledgers must never be migrated as built-in demo data');
  assert.equal([...result.values.keys()].filter(key => key.includes('_demo_archive_')).length,0);
}

{
  const result = run(fixture,{pendingFile:true});
  assert.deepEqual(result.result,fixture,'a pending browser-to-file sync must block demo cleanup');
  assert.equal([...result.values.keys()].filter(key => key.includes('_demo_archive_')).length,0);
}

{
  const result = run(fixture,{currentRaw:'changed-in-another-tab'});
  assert.deepEqual(result.result,fixture,'a changed cache must never be overwritten by a stale startup tab');
  assert.equal(result.context.storageConflictDetected,true);
  assert.equal([...result.values.keys()].filter(key => key.includes('_demo_archive_')).length,0);
}
console.log('ERP exact demo-seed migration checks passed.');
