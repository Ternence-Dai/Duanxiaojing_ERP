
/* ==================================================================
   0. 工具
   ================================================================== */
const $ = id => document.getElementById(id);
const jsArg = value => JSON.stringify(String(value == null ? '' : value)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtN  = n => Number(n || 0).toLocaleString('zh-CN');
const CUR   = () => (DB.settings.currency || '¥');
const fmtM0 = n => CUR() + Number(n || 0).toLocaleString('zh-CN', {maximumFractionDigits:0});
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

const AUTHOR = {
  name: '段小静',
  email: '18662613315@163.com',
  version: 'v4.1.0',
  updated: '2024-06'
};

function toast(msg){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toastRoot').appendChild(t);
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=> t.remove(), 260); }, 2200);
}

/* ==================================================================
   1. 默认数据
   ================================================================== */
/* ==================================================================
   2. 存储：localStorage 缓存 + 本地文件自动写入
   ================================================================== */
const STORE_KEY = 'textile_erp_v4_enterprise';
const IDB_NAME  = 'erp_file_handles';
let DB = null;
// A malformed or unreadable cache must never be silently replaced by demo defaults.
let storageRecoveryRequired = false;
let fileHandle = null;
let fileReady = false;

function isValidDBShape(d){
  if(!d || typeof d !== 'object' || !d.settings || typeof d.settings !== 'object' ||
     !d.dict || typeof d.dict !== 'object') return false;
  return Object.keys(SCHEMAS).every(key => Array.isArray(d[key]));
}
function preserveInvalidDB(raw){
  if(!raw) return false;
  try{
    const key = STORE_KEY + '_recovery_' + Date.now();
    localStorage.setItem(key, raw);
    console.warn('已将无法识别的 ERP 缓存原文保存在恢复项：' + key);
    return true;
  }catch(e){
    console.error('无法创建 ERP 缓存恢复副本。', e);
    return false;
  }
}
function loadDB(){
  let raw = null;
  try{
    raw = localStorage.getItem(STORE_KEY);
    if(raw){
      const d = JSON.parse(raw);
      if(isValidDBShape(d)) return d;
      storageRecoveryRequired = true;
      preserveInvalidDB(raw);
      console.warn('ERP 缓存结构不完整，已保留恢复副本；在恢复前禁止自动覆盖原缓存。');
    }
  }catch(e){
    storageRecoveryRequired = true;
    if(raw) preserveInvalidDB(raw);
    console.error('ERP 缓存读取或解析失败；在确认恢复前禁止自动覆盖原缓存。', e);
  }
  return defaultDB();
}

let saveTimer = null;
function saveDB(){
  if(storageRecoveryRequired){
    toast('检测到原 ERP 缓存异常，已阻止演示数据覆盖；请先导入有效备份，或在确认后重置演示数据');
    return false;
  }
  let localSaved = true;
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  }catch(e){
    localSaved = false;
    console.error('浏览器缓存保存失败', e);
    toast('浏览器存储空间不足或不可用；请立即导出 JSON 备份');
  }
  if(fileHandle && fileReady){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeToFile, 300);
  }
  return localSaved;
}

async function writeToFile(){
  if(storageRecoveryRequired){
    console.warn('ERP 缓存仍待恢复，已阻止向绑定文件写入默认演示数据。');
    return;
  }
  if(!fileHandle || !fileReady) return;
  try{
    const w = await fileHandle.createWritable();
    await w.write(JSON.stringify(DB, null, 2));
    await w.close();
    updateFileStatus();
  }catch(e){
    console.error('写入本地文件失败', e);
    toast('写入本地文件失败，请重新绑定');
  }
}

async function readFromFile(){
  if(!fileHandle) return false;
  try{
    const file = await fileHandle.getFile();
    const text = await file.text();
    if(!text.trim()) return false;
    const d = JSON.parse(text);
    if(isValidDBShape(d)){
      DB = d;
      try{
        localStorage.setItem(STORE_KEY, JSON.stringify(DB));
        storageRecoveryRequired = false;
      }catch(e){
        console.error('文件数据已载入内存，但浏览器缓存写入失败。', e);
        toast('文件已读取，但浏览器缓存写入失败；请检查存储并保留原文件备份');
      }
      render(); initNav();
      return true;
    }
  }catch(e){
    console.error('读取本地文件失败', e);
  }
  return false;
}

async function bindLocalFile(){
  if(!window.showOpenFilePicker){
    toast('当前浏览器不支持文件访问，请使用 Chrome / Edge');
    return;
  }
  try{
    const [handle] = await window.showOpenFilePicker({
      types: [{ description:'ERP 数据文件', accept:{'application/json':['.json']} }],
      multiple: false
    });
    fileHandle = handle;
    fileReady = true;
    await persistHandle(handle);
    await writeToFile();
    toast('已绑定：' + handle.name + ' · 之后编辑将自动保存');
    render();
  }catch(e){
    if(e.name !== 'AbortError') toast('绑定失败：' + e.message);
  }
}

async function createLocalFile(){
  if(!window.showSaveFilePicker){
    toast('当前浏览器不支持文件访问，请使用 Chrome / Edge');
    return;
  }
  try{
    const handle = await window.showSaveFilePicker({
      suggestedName: `织云ERP_${DB.settings.companyShort||'数据'}_${today()}.json`,
      types: [{ description:'ERP 数据文件', accept:{'application/json':['.json']} }]
    });
    fileHandle = handle;
    fileReady = true;
    await persistHandle(handle);
    await writeToFile();
    toast('已新建并绑定：' + handle.name);
    render();
  }catch(e){
    if(e.name !== 'AbortError') toast('创建失败：' + e.message);
  }
}

async function unbindLocalFile(){
  if(!confirm('解除本地文件绑定？\n解除后编辑将只保存到浏览器。')) return;
  fileHandle = null;
  fileReady = false;
  try{
    const db = await openHandleDB();
    db.transaction('handles','readwrite').objectStore('handles').delete('erpFile');
  }catch(e){}
  toast('已解除绑定');
  render();
}

async function restoreHandle(){
  if(!window.showOpenFilePicker) return;
  try{
    const db = await openHandleDB();
    const req = db.transaction('handles','readonly').objectStore('handles').get('erpFile');
    const handle = await new Promise(res => {
      req.onsuccess = () => res(req.result);
      req.onerror  = () => res(null);
    });
    if(!handle) return;
    let perm = 'prompt';
    try{ perm = await handle.queryPermission({ mode:'readwrite' }); }catch(e){}
    if(perm !== 'granted'){
      fileHandle = handle;
      fileReady = false;
      updateFileStatus();
      return;
    }
    fileHandle = handle;
    fileReady = true;
    await readFromFile();
    await writeToFile();
    updateFileStatus();
  }catch(e){
    console.error('恢复句柄失败', e);
  }
}

async function reRequestPermission(){
  if(!fileHandle) return;
  try{
    const perm = await fileHandle.requestPermission({ mode:'readwrite' });
    if(perm === 'granted'){
      fileReady = true;
      await readFromFile();
      await writeToFile();
      toast('授权成功，已恢复自动保存');
      render();
    } else {
      toast('未授予权限，编辑不会自动保存');
    }
  }catch(e){
    toast('授权失败：' + e.message);
  }
}

function openHandleDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if(!req.result.objectStoreNames.contains('handles')){
        req.result.createObjectStore('handles');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}
async function persistHandle(handle){
  try{
    const db = await openHandleDB();
    db.transaction('handles','readwrite').objectStore('handles').put(handle, 'erpFile');
  }catch(e){ console.error(e); }
}

function updateFileStatus(){
  const el = document.getElementById('fileStatus');
  if(el) el.textContent = fileHandle
    ? `已绑定本地文件：${fileHandle.name}${fileReady ? ' · 自动保存中' : ' · 需要重新授权'}`
    : '未绑定本地文件（编辑仅保存在浏览器）';
}

/* ==================================================================
   3. Schema 表结构
   ================================================================== */
const SCHEMAS = {
  orders: {
    key:'orders', title:'销售订单', idKey:'no', idPrefix:'SO',
    filterField:'status', filterDict:'orderStatus',
    fields:[
      {k:'no',        l:'订单号',    t:'text',   mono:true, req:true, w:'106px', ph:'例：SO2406021'},
      {k:'cust',      l:'客户',      t:'ref',    ref:'customers', refLabel:'name', req:true, w:'176px', fill:['payment']},
      {k:'product',   l:'产品',      t:'ref',    ref:'dict.products', refLabel:'name', req:true, w:'140px', fill:['spec','unit','price']},
      {k:'spec',      l:'规格',      t:'ref',    ref:'dict.specs', refLabel:'name', w:'230px'},
      {k:'color',     l:'颜色/色号',  t:'color',  w:'126px'},
      {k:'qty',       l:'数量',      t:'number', req:true, align:'right', w:'96px'},
      {k:'unit',      l:'单位',      t:'select', opts:'units', w:'70px'},
      {k:'price',     l:'单价',      t:'number', align:'right', step:'0.01', w:'84px'},
      {k:'orderDate', l:'下单日期',   t:'date',   w:'104px'},
      {k:'delivery',  l:'交货日期',   t:'date',   req:true, w:'104px'},
      {k:'salesman',  l:'业务员',    t:'select', opts:'salesmen', w:'92px'},
      {k:'priority',  l:'优先级',    t:'select', opts:'priorities', badge:true, w:'78px'},
      {k:'payment',   l:'付款方式',   t:'select', opts:'paymentTerms', w:'140px'},
      {k:'status',    l:'状态',      t:'select', opts:'orderStatus', badge:true, w:'88px'},
      {k:'note',      l:'备注',      t:'text',   w:'180px'},
    ],
    calc:{l:'金额', fn:r => (Number(r.qty)||0)*(Number(r.price)||0), money:true}
  },

  workorders: {
    key:'workorders', title:'生产工单', idKey:'no', idPrefix:'WO',
    filterField:'status', filterDict:'workStatus',
    fields:[
      {k:'no',      l:'工单号',  t:'text',   mono:true, req:true, w:'106px', ph:'例：WO2406015'},
      {k:'so',      l:'关联订单', t:'ref',   ref:'orders', refLabel:'no', w:'106px'},
      {k:'product', l:'产品',    t:'ref',    ref:'dict.products', refLabel:'name', req:true, w:'140px', fill:['unit']},
      {k:'process', l:'当前工序', t:'ref',    ref:'dict.processes', refLabel:'name', req:true, w:'96px'},
      {k:'machine', l:'机台 / 产线', t:'text', w:'150px'},
      {k:'plan',    l:'计划量',  t:'number', req:true, align:'right', w:'92px'},
      {k:'done',    l:'完成量',  t:'number', align:'right', w:'92px'},
      {k:'unit',    l:'单位',    t:'select', opts:'units', w:'70px'},
      {k:'start',   l:'开工日',  t:'date',   w:'104px'},
      {k:'due',     l:'交期',    t:'date',   w:'104px'},
      {k:'eff',     l:'直通率%', t:'number', align:'right', step:'0.1', w:'88px'},
      {k:'priority',l:'优先级',  t:'select', opts:'priorities', badge:true, w:'78px'},
      {k:'owner',   l:'负责人',  t:'select', opts:'salesmen', w:'92px'},
      {k:'status',  l:'状态',    t:'select', opts:'workStatus', badge:true, w:'88px'},
      {k:'note',    l:'备注',    t:'text',   w:'160px'},
    ],
    calc:{l:'进度', fn:r => Math.round((Number(r.done)||0)/Math.max(Number(r.plan)||1,1)*100), prog:true}
  },

  inventory: {
    key:'inventory', title:'物料库存', idKey:'code', idPrefix:'M',
    filterField:'cat', filterDict:'categories',
    fields:[
      {k:'code',  l:'物料编码', t:'text',   mono:true, req:true, w:'110px', ph:'例：Y-C42S'},
      {k:'name',  l:'物料名称', t:'text',   req:true, w:'190px'},
      {k:'cat',   l:'类别',    t:'ref',    ref:'dict.categories', refLabel:'name', req:true, w:'90px'},
      {k:'batch', l:'批次/缸号', t:'text',  w:'140px'},
      {k:'loc',   l:'库位',    t:'ref',    ref:'dict.warehouses', refLabel:'name', w:'96px'},
      {k:'qty',   l:'库存量',   t:'number', req:true, align:'right', step:'0.001', w:'96px'},
      {k:'unit',  l:'单位',    t:'select', opts:'units', w:'70px'},
      {k:'safe',  l:'安全库存', t:'number', align:'right', w:'92px'},
      {k:'price', l:'单价',    t:'number', align:'right', step:'0.01', w:'88px'},
      {k:'supplier',l:'供应商', t:'ref',   ref:'suppliers', refLabel:'name', w:'150px'},
      {k:'inDate',l:'入库日期', t:'date',   w:'104px'},
    ],
    calc:{l:'库存金额', fn:r => (Number(r.qty)||0)*(Number(r.price)||0), money:true}
  },

  purchase: {
    key:'purchase', title:'采购管理', idKey:'no', idPrefix:'PO',
    filterField:'status', filterDict:'purchaseStatus',
    fields:[
      {k:'no',     l:'采购单号', t:'text',  mono:true, req:true, w:'106px', ph:'例：PO2406013'},
      {k:'sup',    l:'供应商',   t:'ref',   ref:'suppliers', refLabel:'name', req:true, w:'176px'},
      {k:'mat',    l:'采购物料', t:'text',  req:true, w:'190px'},
      {k:'qty',    l:'数量',    t:'number', req:true, align:'right', w:'92px'},
      {k:'unit',   l:'单位',    t:'select', opts:'units', w:'70px'},
      {k:'price',  l:'单价',    t:'number', align:'right', step:'0.01', w:'88px'},
      {k:'date',   l:'下单日期', t:'date',  w:'104px'},
      {k:'eta',    l:'预计到货', t:'date',  w:'104px'},
      {k:'buyer',  l:'采购员',   t:'select', opts:'salesmen', w:'92px'},
      {k:'payment',l:'付款方式', t:'select', opts:'paymentTerms', w:'140px'},
      {k:'status', l:'状态',    t:'select', opts:'purchaseStatus', badge:true, w:'92px'},
      {k:'note',   l:'备注',    t:'text',   w:'160px'},
    ],
    calc:{l:'金额', fn:r => (Number(r.qty)||0)*(Number(r.price)||0), money:true}
  },

  quality: {
    key:'quality', title:'质量管理', idKey:'no', idPrefix:'QC',
    filterField:'grade', filterDict:'grades',
    fields:[
      {k:'no',    l:'检验单号', t:'text',  mono:true, req:true, w:'106px', ph:'例：QC2406025'},
      {k:'so',    l:'关联订单', t:'ref',   ref:'orders', refLabel:'no', w:'106px'},
      {k:'roll',  l:'匹号',    t:'text',  mono:true, w:'120px'},
      {k:'len',   l:'匹长(m)', t:'number', align:'right', step:'0.1', w:'86px'},
      {k:'width', l:'门幅(cm)',t:'number', align:'right', step:'0.1', w:'90px'},
      {k:'gsm',   l:'克重(g/㎡)',t:'number',align:'right', step:'0.1', w:'96px'},
      {k:'defect',l:'疵点描述', t:'text',  w:'150px'},
      {k:'grade', l:'等级',    t:'select', opts:'grades', badge:true, w:'86px'},
      {k:'method',l:'检验方式', t:'select', opts:'methods', w:'92px'},
      {k:'by',    l:'检验员',   t:'select', opts:'inspectors', w:'92px'},
      {k:'date',  l:'检验日期', t:'date',  w:'104px'},
      {k:'note',  l:'备注',    t:'text',   w:'140px'},
    ]
  },

  customers: {
    key:'customers', title:'客户档案', idKey:'id', idPrefix:'C',
    filterField:'level', filterDict:'custLevels',
    fields:[
      {k:'id',       l:'客户编码', t:'text', mono:true, req:true, w:'92px', ph:'例：C011'},
      {k:'name',     l:'客户名称', t:'text', req:true, w:'210px'},
      {k:'contact',  l:'联系人',   t:'text', w:'92px'},
      {k:'phone',    l:'联系电话', t:'text', mono:true, w:'140px'},
      {k:'region',   l:'所在地区', t:'text', w:'130px'},
      {k:'type',     l:'客户类型', t:'select', opts:'custTypes', w:'110px'},
      {k:'level',    l:'信用等级', t:'select', opts:'custLevels', badge:true, w:'110px'},
      {k:'payment',  l:'付款方式', t:'select', opts:'paymentTerms', w:'140px'},
      {k:'taxNo',    l:'税号',    t:'text', w:'170px'},
      {k:'salesman', l:'业务员',  t:'select', opts:'salesmen', w:'92px'},
      {k:'receivable',l:'应收账款', t:'number', align:'right', step:'0.01', w:'110px'},
      {k:'address',  l:'地址',    t:'text', w:'240px'},
    ],
    calc:{l:'订单数', fn:r => DB.orders.filter(o => o.cust === r.name).length, plain:true}
  },

  suppliers: {
    key:'suppliers', title:'供应商档案', idKey:'id', idPrefix:'S',
    filterField:'type', filterDict:'supTypes',
    fields:[
      {k:'id',       l:'供应商编码', t:'text', mono:true, req:true, w:'100px', ph:'例：S009'},
      {k:'name',     l:'供应商名称', t:'text', req:true, w:'200px'},
      {k:'material', l:'主营物料',   t:'text', w:'190px'},
      {k:'type',     l:'供应商类型', t:'select', opts:'supTypes', w:'130px'},
      {k:'contact',  l:'联系人',    t:'text', w:'92px'},
      {k:'phone',    l:'联系电话',   t:'text', mono:true, w:'140px'},
      {k:'payment',  l:'付款方式',   t:'select', opts:'paymentTerms', w:'140px'},
      {k:'lead',     l:'交货周期(天)',t:'number', align:'right', w:'110px'},
      {k:'rate',     l:'准时率(%)', t:'number', align:'right', step:'0.1', w:'100px'},
      {k:'address',  l:'地址',      t:'text', w:'240px'},
    ]
  },
};

DB = loadDB();

/* ==================================================================
   4. 字典 / 引用
   ================================================================== */
function getDict(name){
  const d = DB.dict[name];
  if(!Array.isArray(d)) return [];
  return d.map(x => typeof x === 'string' ? {name:x} : x);
}
function dictNames(name){ return getDict(name).map(x => x.name); }
function refList(ref){
  if(ref.startsWith('dict.')) return getDict(ref.slice(5));
  return DB[ref] || [];
}
function refLabelOf(f, item){
  if(f.refLabel === 'name+code') return item.name + ' ' + item.code;
  return item[f.refLabel || 'name'];
}
function refValues(f){ return refList(f.ref).map(it => refLabelOf(f, it)); }
function colorHex(v){
  if(!v) return '#cbd5e1';
  const hit = getDict('colors').find(c => (c.name + ' ' + c.code) === v || c.name === v);
  return hit && hit.hex ? hit.hex : '#cbd5e1';
}
function autoFillFromRef(tableKey, fieldKey, value){
  const S = SCHEMAS[tableKey];
  const f = S.fields.find(x => x.k === fieldKey);
  if(!f || !f.fill || !value) return;
  const list = refList(f.ref);
  const hit = list.find(it => refLabelOf(f, it) === value);
  if(!hit) return;
  f.fill.forEach(target => {
    const el = $('ff_' + target);
    if(el && (!el.value || el.value === '' || el.dataset.autofilled === '1')){
      if(hit[target] != null){
        el.value = hit[target];
        el.dataset.autofilled = '1';
        el.style.transition = 'background .3s';
        el.style.background = '#e8f2ff';
        setTimeout(()=> el.style.background = '', 700);
      }
    }
  });
}

/* ==================================================================
   5. 页面元信息 & 导航
   ================================================================== */
const PAGES = {
  dashboard:{ title:'经营看板', sub:'' },
  orders:    { title:'销售订单', sub:'' },
  workorders:{ title:'生产工单', sub:'' },
  inventory: { title:'物料库存', sub:'' },
  purchase:  { title:'采购管理', sub:'' },
  quality:   { title:'质量管理', sub:'' },
  customers: { title:'客户档案', sub:'' },
  suppliers: { title:'供应商档案', sub:'' },
  report:    { title:'报表分析', sub:'' },
  settings:  { title:'系统设置', sub:'所有参数、字典、字段均可配置' },
};

const ICONS = {
  dashboard:'<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
  orders:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  workorders:'<path d="M3 21V10l5.5 3.5V10L14 13.5V10l7 4.5V21z"/><path d="M3 21h18"/><path d="M7 6.5V4h3v2.5"/>',
  inventory:'<path d="M3 7.2 12 3l9 4.2-9 4.2z"/><path d="M3 7.2v9.6L12 21l9-4.2V7.2"/><path d="M12 11.4V21"/>',
  purchase:'<circle cx="9.5" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.8l2.3 11.6h11L21.5 7H6.2"/>',
  quality:'<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.6 2.6L16 9.6"/>',
  customers:'<circle cx="12" cy="8" r="3.8"/><path d="M4.2 20.5c0-3.8 3.5-5.8 7.8-5.8s7.8 2 7.8 5.8"/>',
  suppliers:'<path d="M3 21V8l6-3 6 3v13"/><path d="M15 21V11l6 3v7"/><path d="M3 21h18"/>',
  report:'<path d="M3 20.5h18"/><rect x="4.8" y="11" width="3.2" height="7"/><rect x="10.4" y="6.5" width="3.2" height="11.5"/><rect x="16" y="13.5" width="3.2" height="4.5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
};

const NAV = [
  { group:'业务流程', items:[
    {key:'dashboard',  label:'经营看板', icon:ICONS.dashboard},
    {key:'orders',     label:'销售订单', icon:ICONS.orders},
    {key:'workorders', label:'生产工单', icon:ICONS.workorders},
    {key:'inventory',  label:'物料库存', icon:ICONS.inventory},
    {key:'purchase',   label:'采购管理', icon:ICONS.purchase},
    {key:'quality',    label:'质量管理', icon:ICONS.quality},
  ]},
  { group:'基础档案', items:[
    {key:'customers',  label:'客户档案', icon:ICONS.customers},
    {key:'suppliers',  label:'供应商档案', icon:ICONS.suppliers},
  ]},
  { group:'系统', items:[
    {key:'report',     label:'报表分析', icon:ICONS.report},
    {key:'settings',   label:'系统设置', icon:ICONS.settings},
  ]},
];

const svgWrap = p => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

function initNav(){
  let html = '';
  NAV.forEach(g => {
    html += `<div class="nav-label">${g.group}</div>`;
    g.items.forEach(n => {
      const dot = navDot(n.key);
      html += `<button class="nav-item" data-page="${n.key}" onclick="go(${jsArg(n.key)})">
        ${svgWrap(n.icon)}<span>${n.label}</span>${dot ? `<span class="dot">${dot}</span>` : ''}
      </button>`;
    });
  });
  $('navGroup').innerHTML = html;
}
function navDot(key){
  if(key === 'inventory' && DB.settings.lowStockWarn){
    const n = DB.inventory.filter(i => Number(i.safe) > 0 && Number(i.qty) < Number(i.safe)).length;
    return n || '';
  }
  if(key === 'orders'){
    const n = DB.orders.filter(o => o.status === '待确认').length;
    return n || '';
  }
  return '';
}

/* ==================================================================
   6. 列表引擎
   ================================================================== */
const listState = {};
function getState(key){
  if(!listState[key]) listState[key] = { kw:'', filter:'全部' };
  return listState[key];
}
function visibleFields(key){
  const S = SCHEMAS[key];
  const hidden = (DB.settings.hiddenCols && DB.settings.hiddenCols[key]) || [];
  return S.fields.filter(f => hidden.indexOf(f.k) === -1);
}
function filteredRows(key){
  const S = SCHEMAS[key], st = getState(key);
  let rows = (DB[S.key] || []).slice();
  if(S.filterField && st.filter && st.filter !== '全部'){
    rows = rows.filter(r => String(r[S.filterField]) === st.filter);
  }
  const kw = (st.kw || '').trim().toLowerCase();
  if(kw){
    rows = rows.filter(r =>
      S.fields.some(f => {
        const v = r[f.k];
        return v != null && String(v).toLowerCase().includes(kw);
      })
    );
  }
  return rows;
}
function cellHtml(f, r){
  const v = r[f.k];
  if(f.t === 'select' && f.badge){
    return `<span class="badge ${badgeClass(v)}">${esc(v || '—')}</span>`;
  }
  if(f.t === 'color'){
    if(!v) return '—';
    return `<span class="color-dot" style="background:${colorHex(v)}"></span>${esc(v)}`;
  }
  if(f.t === 'number'){
    const s = f.step === '0.1' ? Number(v||0).toFixed(1)
            : f.step === '0.01' ? Number(v||0).toFixed(2)
            : fmtN(v);
    return esc(s);
  }
  if(v == null || v === '') return '<span style="color:#c3ccd9">—</span>';
  return esc(v);
}
const BADGE_MAP = {
  '草稿':'gray','待确认':'gray','已确认':'blue','备料中':'cyan','生产中':'amber',
  '质检中':'purple','待发货':'purple','已发货':'cyan','已完成':'green',
  '已暂停':'amber','已取消':'red','退货中':'pink',
  '待排产':'gray','待领料':'cyan','进行中':'amber','待检验':'purple',
  '待入库':'purple','已入库':'cyan','已完工':'green','暂停':'amber','异常':'red','返工':'pink',
  '待审批':'gray','待下单':'gray','已下单':'blue','在途':'amber','部分到货':'purple',
  '已到货':'green','检验中':'purple','退货':'pink',
  '特级品':'cyan','一等品':'green','二等品':'amber','三等品':'purple','等外品':'red','返修品':'pink','报废品':'red',
  'A':'green','B':'blue','C':'gray','战略客户':'purple','潜在客户':'cyan','已流失':'red',
  '纱线':'blue','坯布':'amber','成品':'green','染化料':'purple','辅料':'cyan','包装':'pink','助剂':'purple','设备备件':'gray',
  '普通':'gray','加急':'amber','特急':'red','暂缓':'gray',
  '品牌商':'purple','贸易商':'blue','加工厂':'green','终端用户':'cyan','代理商':'amber',
  '原料供应商':'blue','辅料供应商':'cyan','设备供应商':'gray','服务供应商':'pink','染料助剂':'purple',
};
function badgeClass(v){ return BADGE_MAP[v] || 'gray'; }

function renderTableHead(key){
  const S = SCHEMAS[key];
  const cols = visibleFields(key);
  let h = cols.map(f => `<th style="${f.w ? 'width:'+f.w : ''}">${f.l}</th>`).join('');
  if(S.calc) h += `<th style="text-align:right">${S.calc.l}</th>`;
  h += `<th class="row-actions">操作</th>`;
  return h;
}
function renderTableBody(key){
  const S = SCHEMAS[key];
  const cols = visibleFields(key);
  const rows = filteredRows(key);
  if(!rows.length){
    return `<tr><td colspan="${cols.length + (S.calc?1:0) + 1}" class="empty">
      没有匹配的记录 · 点击右上角「新增」添加第一条</td></tr>`;
  }
  return rows.map(r => {
    const id = r[S.idKey];
    let tds = cols.map(f => {
      let extra = '';
      if(f.t === 'number') extra = 'num';
      if(f.mono) extra += ' mono';
      return `<td class="${extra.trim()}">${cellHtml(f, r)}</td>`;
    }).join('');

    let calcTd = '';
    if(S.calc){
      if(S.calc.prog){
        const pct = Math.min(S.calc.fn(r), 100);
        const cls = pct >= 100 ? 'done' : (pct < 60 ? 'warn' : '');
        calcTd = `<td style="min-width:118px">
          <div class="prog"><div class="prog-bar ${cls}" style="width:${pct}%"></div></div>
          <div class="prog-txt">${pct}%</div></td>`;
      } else if(S.calc.money){
        calcTd = `<td class="num strong">${fmtM0(S.calc.fn(r))}</td>`;
      } else {
        calcTd = `<td class="num">${fmtN(S.calc.fn(r))}</td>`;
      }
    }

    return `<tr>${tds}${calcTd}
      <td class="row-actions">
        <button class="icon-btn" title="编辑" onclick="openForm(${jsArg(key)},${jsArg(id)})">✎</button>
        <button class="icon-btn danger" title="删除" onclick="delRow(${jsArg(key)},${jsArg(id)})">✕</button>
      </td></tr>`;
  }).join('');
}
function refreshTable(key){
  const th = $('th_' + key), tb = $('tb_' + key), cnt = $('cnt_' + key);
  if(th) th.innerHTML = renderTableHead(key);
  if(tb) tb.innerHTML = renderTableBody(key);
  if(cnt){
    const n = filteredRows(key).length;
    cnt.textContent = `显示 ${n} / ${(DB[SCHEMAS[key].key]||[]).length} 条`;
  }
  if($('chips_' + key)) $('chips_' + key).innerHTML = renderChips(key);
}
function renderChips(key){
  const S = SCHEMAS[key];
  if(!S.filterField) return '';
  const st = getState(key);
  const opts = ['全部'].concat(dictNames(S.filterDict));
  return opts.map(o => {
    const total = DB[S.key].length;
    const n = o === '全部' ? total : DB[S.key].filter(r => String(r[S.filterField]) === o).length;
    return `<button class="chip ${st.filter === o ? 'active' : ''}"
      onclick="setFilter(${jsArg(key)},${jsArg(o)})">${esc(o)} <b>${n}</b></button>`;
  }).join('');
}
function setFilter(key, v){
  getState(key).filter = v;
  refreshTable(key);
}
function onSearchInput(key, val){
  const st = getState(key);
  st.kw = val;
  const clr = $('clr_' + key);
  if(clr) clr.classList.toggle('show', !!val);
  refreshTable(key);
  showSuggest(key, val);
}
function clearSearch(key){
  const el = $('kw_' + key);
  if(el) el.value = '';
  onSearchInput(key, '');
  el && el.focus();
}
function showSuggest(key, val){
  const box = $('sg_' + key);
  if(!box) return;
  const kw = (val || '').trim().toLowerCase();
  if(kw.length < 1){ box.classList.remove('show'); return; }
  const S = SCHEMAS[key];
  const pool = new Set();
  (DB[S.key] || []).forEach(r => {
    S.fields.forEach(f => {
      const v = r[f.k];
      if(v != null && String(v).toLowerCase().includes(kw) && String(v).length < 40){
        pool.add(String(v));
      }
    });
  });
  const arr = Array.from(pool).slice(0, 8);
  if(!arr.length){ box.classList.remove('show'); return; }
  box.innerHTML = arr.map(v => {
    const i = v.toLowerCase().indexOf(kw);
    const hl = esc(v.slice(0, i)) + '<b>' + esc(v.slice(i, i + kw.length)) + '</b>' + esc(v.slice(i + kw.length));
    return `<div class="suggest-item" onclick="pickSuggest(${jsArg(key)},${jsArg(v)})">${hl}</div>`;
  }).join('');
  box.classList.add('show');
}
function pickSuggest(key, v){
  const el = $('kw_' + key);
  if(el) el.value = v;
  const box = $('sg_' + key);
  if(box) box.classList.remove('show');
  onSearchInput(key, v);
}
document.addEventListener('click', e => {
  document.querySelectorAll('.suggest').forEach(s => {
    if(!s.parentElement.contains(e.target)) s.classList.remove('show');
  });
  const gp = $('gsPanel');
  if(gp && !gp.contains(e.target) && e.target.id !== 'globalInput') gp.classList.remove('show');
});

function renderListPage(key){
  const S = SCHEMAS[key];
  const st = getState(key);
  let tip = '';
  if(DB.settings.showStorageTip){
    if(fileHandle && fileReady){
      tip = `<div class="storage-tip" style="background:#e6f7ed;color:#166534;border-color:#bbf7d0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span>已绑定本地文件：<b>${esc(fileHandle.name)}</b> · 编辑自动写入该文件</span>
      </div>`;
    } else if(fileHandle && !fileReady){
      tip = `<div class="storage-tip" style="background:#fff4e0;color:#92400e;border-color:#fde68a">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <span>已绑定 <b>${esc(fileHandle.name)}</b>，需重新授权。
        <a href="#" onclick="event.preventDefault();reRequestPermission()" style="color:#2f6fed;text-decoration:underline">立即授权</a></span>
      </div>`;
    } else {
      tip = `<div class="storage-tip" style="background:#e7efff;color:#1e40af;border-color:#c7d9fb">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <span>编辑内容自动保存在浏览器中。如需保存到本地文件，请前往「系统设置 → 数据管理」绑定本地文件</span>
      </div>`;
    }
  }
  return `${tip}
  <div class="toolbar">
    <div class="search-box">
      <span class="si"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg></span>
      <input type="text" id="kw_${key}" placeholder="搜索${S.title}…（支持任意字段模糊匹配）"
        value="${esc(st.kw)}" autocomplete="off"
        oninput="onSearchInput(${jsArg(key)}, this.value)"
        onfocus="if(this.value)showSuggest(${jsArg(key)}, this.value)">
      <button class="clr ${st.kw ? 'show' : ''}" id="clr_${key}" onclick="clearSearch(${jsArg(key)})">✕</button>
      <div class="suggest" id="sg_${key}"></div>
    </div>
    ${S.filterField ? `<div class="chips" id="chips_${key}">${renderChips(key)}</div>` : ''}
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
      <span style="font-size:11.5px;color:var(--muted)" id="cnt_${key}"></span>
      <button class="btn btn-sm" onclick="openColSettings(${jsArg(key)})">列设置</button>
      <button class="btn btn-sm" onclick="exportTable(${jsArg(key)})">导出</button>
      <button class="btn btn-primary btn-sm" onclick="openForm(${jsArg(key)})">＋ 新增</button>
    </div>
  </div>

  <div class="table-wrap">
    <div class="table-scroll">
      <table>
        <thead><tr id="th_${key}">${renderTableHead(key)}</tr></thead>
        <tbody id="tb_${key}">${renderTableBody(key)}</tbody>
      </table>
    </div>
  </div>`;
}

/* ==================================================================
   7. 表单
   ================================================================== */
let formState = { key:null, editingId:null };

function openForm(key, id){
  const S = SCHEMAS[key];
  const editing = id != null && id !== '';
  const record = editing ? (DB[S.key] || []).find(r => String(r[S.idKey]) === String(id)) : null;
  if(editing && !record){ toast('未找到该记录'); return; }

  formState = { key, editingId: editing ? String(id) : null };

  const fieldsHtml = S.fields.map(f => renderField(f, record)).join('');

  const html = `
  <div class="modal-mask" onclick="if(event.target===this)closeModal()">
    <div class="modal wide">
      <div class="modal-head">
        <h3>${editing ? '编辑' : '新增'}${S.title}</h3>
        <button class="x" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid cols-3">${fieldsHtml}</div>
      </div>
      <div class="modal-foot">
        ${editing ? `<button class="btn btn-sm" style="margin-right:auto;color:#dc2626"
            onclick="delRow(${jsArg(key)},${jsArg(id)},true)">删除此记录</button>` : ''}
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="saveForm()">${editing ? '保存修改' : '确认新增'}</button>
      </div>
    </div>
  </div>`;
  $('modalRoot').innerHTML = html;
}

function renderField(f, record){
  const val = record ? (record[f.k] != null ? record[f.k] : '') : defaultValFor(f);
  const full = (f.t === 'text' && !f.w) || f.w === '230px' || f.w === '240px' ? ' full' : '';

  if(f.ro){
    const show = record ? esc(val) : '<span style="color:#a9b4c4">保存后自动生成</span>';
    return `<div class="field${full}">
      <label>${f.l}</label>
      <div class="ro-field">${show === '' ? '<span style="color:#a9b4c4">—</span>' : show}</div>
    </div>`;
  }

  let ctrl = '';
  const ph = f.ph ? `placeholder="${esc(f.ph)}"` : '';
  if(f.t === 'select'){
    const opts = dictNames(f.opts);
    ctrl = `<select id="ff_${f.k}">${opts.map(o =>
      `<option value="${esc(o)}" ${String(val) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  else if(f.t === 'ref' || f.t === 'color'){
    const vals = f.t === 'color'
      ? getDict('colors').map(c => c.name + ' ' + c.code)
      : refValues(f);
    const dlId = 'dl_' + f.k;
    const handler = f.fill
      ? `oninput="autoFillFromRef(${jsArg(formState.key)},${jsArg(f.k)}, this.value)"`
      : '';
    ctrl = `<input type="text" id="ff_${f.k}" list="${dlId}" value="${esc(val)}"
        placeholder="可输入或下拉选择" autocomplete="off" ${handler}>
      <datalist id="${dlId}">${vals.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
  }
  else if(f.t === 'number'){
    ctrl = `<input type="number" id="ff_${f.k}" value="${val === '' ? '' : val}"
        step="${f.step || '1'}" ${f.step === '0.01' ? 'min="0"' : ''} ${ph}>`;
  }
  else if(f.t === 'date'){
    ctrl = `<input type="date" id="ff_${f.k}" value="${esc(val)}">`;
  }
  else if(f.t === 'textarea'){
    ctrl = `<textarea id="ff_${f.k}" ${ph}>${esc(val)}</textarea>`;
  }
  else {
    ctrl = `<input type="text" id="ff_${f.k}" value="${esc(val)}" autocomplete="off" ${ph}>`;
  }

  return `<div class="field${full}">
    <label>${f.l}${f.req ? '<span class="req">*</span>' : ''}</label>
    ${ctrl}
  </div>`;
}

function defaultValFor(f){
  if(f.t === 'date') return today();
  if(f.t === 'number') return '';
  if(f.t === 'select'){
    const opts = dictNames(f.opts);
    return opts.length ? opts[0] : '';
  }
  return '';
}
function closeModal(){ $('modalRoot').innerHTML = ''; formState = { key:null, editingId:null }; }

async function saveForm(){
  const key = formState.key;
  if(!key) return;
  const S = SCHEMAS[key];
  const list = DB[S.key];
  const editingId = formState.editingId;

  const obj = {};
  let err = null;

  S.fields.forEach(f => {
    if(f.ro) return;
    const el = $('ff_' + f.k);
    if(!el) return;
    const raw = el.value;
    let v = raw;
    if(f.req && (raw === '' || raw == null)){
      if(!err) err = `「${f.l}」为必填项`;
    }
    if(f.t === 'number'){
      if(raw === '' || raw == null) v = 0;
      else {
        v = Number(raw);
        if(!Number.isFinite(v) && !err) err = `「${f.l}」必须是有效数字`;
      }
    }
    obj[f.k] = v;
  });

  // Domain constraints: reject impossible values instead of silently coercing
  // malformed numeric input to zero and persisting it.
  const nonNegative = ['qty','safe','price','done','lead','len','width','gsm'];
  const strictlyPositive = key === 'orders' || key === 'purchase'
    ? ['qty'] : key === 'workorders' ? ['plan'] : [];
  const percentageFields = key === 'workorders' ? ['eff']
    : key === 'suppliers' ? ['rate'] : [];
  S.fields.filter(f => f.t === 'number').forEach(f => {
    const raw = $('ff_' + f.k)?.value;
    if(raw === '' || raw == null) return;
    const value = Number(raw);
    if(!Number.isFinite(value)) return;
    if(nonNegative.includes(f.k) && value < 0 && !err)
      err = `「${f.l}」不能小于 0`;
    if(strictlyPositive.includes(f.k) && value <= 0 && !err)
      err = `「${f.l}」必须大于 0`;
    if(percentageFields.includes(f.k) && (value < 0 || value > 100) && !err)
      err = `「${f.l}」必须在 0–100 之间`;
  });

  const validDate = value => !value || ( /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value );
  S.fields.filter(f => f.t === 'date').forEach(f => {
    const value = obj[f.k];
    if(value && !validDate(value) && !err) err = `「${f.l}」日期格式无效`;
  });
  const datePairs = key === 'orders' ? [['orderDate','delivery','交货日期不能早于下单日期']]
    : key === 'purchase' ? [['date','eta','预计到货日期不能早于下单日期']]
    : key === 'workorders' ? [['start','due','工单交期不能早于开工日期']] : [];
  datePairs.forEach(([from,to,message]) => {
    if(obj[from] && obj[to] && validDate(obj[from]) && validDate(obj[to]) &&
       obj[to] < obj[from] && !err) err = message;
  });

  if(err){ toast(err); return; }

  // Inventory edits are posted through the domain ledger before the master
  // record is changed. Failed validation leaves both untouched.
  let stockMovement = null;
  if(key === 'inventory'){
    const previous = editingId ? list.find(r => String(r[S.idKey]) === editingId) : null;
    const previousQty = previous ? Number(previous.qty) : 0;
    const nextQty = Number(obj.qty);
    const delta = Number((nextQty - previousQty).toFixed(3));
    if(delta !== 0){
      try{
        const domain = await import('../../src/domain/index.js');
        stockMovement = domain.applyStockMovement(previousQty, {
          sku: obj.code,
          quantityDelta: delta,
          reference: (editingId ? 'INV-ADJUST-' : 'INV-OPEN-') + obj.code + '-' + Date.now(),
          occurredAt: new Date().toISOString()
        });
      }catch(e){
        toast('库存变更未保存：' + (e && e.message ? e.message : '领域校验失败'));
        return;
      }
    }
  }

  const candidateId = obj[S.idKey];
  if(candidateId && list.some(r => String(r[S.idKey]) === String(candidateId) &&
      (!editingId || String(r[S.idKey]) !== String(editingId)))){
    toast(`「${candidateId}」已存在，请修改编号`);
    return;
  }

  if(editingId){
    const i = list.findIndex(r => String(r[S.idKey]) === editingId);
    if(i > -1) list[i] = Object.assign({}, list[i], obj);
    else { toast('原记录已不存在，请刷新后重试'); return; }
    toast('已保存修改');
  } else {
    const newId = obj[S.idKey];
    if(newId && list.some(r => String(r[S.idKey]) === String(newId))){
      toast(`「${newId}」已存在，请修改编号`);
      return;
    }
    if(!newId){
      obj[S.idKey] = genId(key);
    }
    list.unshift(obj);
    toast(`新增成功 · ${obj[S.idKey]}`);
  }

  if(stockMovement){
    if(!Array.isArray(DB.stockMovements)) DB.stockMovements = [];
    DB.stockMovements.unshift(stockMovement);
  }
  saveDB();
  closeModal();
  render();
  initNav();
}

function genId(key){
  const S = SCHEMAS[key];
  const list = DB[S.key] || [];
  const d = new Date();
  const ym = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
  const prefix = S.idPrefix + ym;
  let max = 0;
  list.forEach(r => {
    const v = String(r[S.idKey] || '');
    if(v.indexOf(prefix) === 0){
      const n = parseInt(v.slice(prefix.length), 10);
      if(!isNaN(n) && n > max) max = n;
    }
  });
  return prefix + String(max + 1).padStart(3, '0');
}

function delRow(key, id, fromModal){
  const S = SCHEMAS[key];
  const rec = (DB[S.key] || []).find(r => String(r[S.idKey]) === String(id));
  if(!rec){ toast('记录不存在'); return; }
  if(!confirm(`确定删除「${id}」吗？此操作不可撤销。`)) return;
  DB[S.key] = DB[S.key].filter(r => String(r[S.idKey]) !== String(id));
  saveDB();
  if(fromModal) closeModal();
  render();
  initNav();
  toast('已删除 ' + id);
}

function openColSettings(key){
  const S = SCHEMAS[key];
  const hidden = (DB.settings.hiddenCols && DB.settings.hiddenCols[key]) || [];
  const html = `
  <div class="modal-mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" style="max-width:420px">
      <div class="modal-head">
        <h3>${S.title} · 列显示设置</h3>
        <button class="x" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="col-list">
          ${S.fields.map(f => `
            <label class="col-item">
              <input type="checkbox" data-colkey="${f.k}" ${hidden.indexOf(f.k) === -1 ? 'checked' : ''}>
              <span>${f.l}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="applyColSettings(${jsArg(key)})">应用</button>
      </div>
    </div>
  </div>`;
  $('modalRoot').innerHTML = html;
}
function applyColSettings(key){
  const boxes = document.querySelectorAll('[data-colkey]');
  const hidden = [];
  boxes.forEach(b => { if(!b.checked) hidden.push(b.dataset.colkey); });
  if(!DB.settings.hiddenCols) DB.settings.hiddenCols = {};
  DB.settings.hiddenCols[key] = hidden;
  saveDB();
  closeModal();
  refreshTable(key);
  toast('列设置已保存');
}

function exportTable(key){
  const S = SCHEMAS[key];
  const rows = filteredRows(key);
  if(!rows.length){ toast('没有可导出的数据'); return; }
  const cols = visibleFields(key);
  const header = cols.map(f => f.l).join(',');
  const body = rows.map(r =>
    cols.map(f => {
      const v = r[f.k] == null ? '' : String(r[f.k]);
      return '"' + v.replace(/"/g, '""') + '"';
    }).join(',')
  ).join('\n');
  const csv = '\uFEFF' + header + '\n' + body;
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `织云ERP_${AUTHOR.name}_${S.title}_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`已导出 ${rows.length} 条记录`);
}

/* ==================================================================
   8. 全局搜索
   ================================================================== */
function globalSearch(kw){
  const panel = $('gsPanel');
  kw = (kw || '').trim();
  if(kw.length < 1){ panel.classList.remove('show'); return; }
  const lower = kw.toLowerCase();
  const results = [];

  Object.keys(SCHEMAS).forEach(key => {
    const S = SCHEMAS[key];
    (DB[S.key] || []).forEach(r => {
      const hit = S.fields.some(f => {
        const v = r[f.k];
        return v != null && String(v).toLowerCase().includes(lower);
      });
      if(hit){
        const main = String(r[S.fields[1] ? S.fields[1].k : S.idKey] || r[S.idKey]);
        const subParts = S.fields.slice(2, 5).map(f => r[f.k]).filter(Boolean).map(String);
        results.push({
          key, title: S.title,
          id: r[S.idKey],
          main: main,
          sub: subParts.join(' · ')
        });
      }
    });
  });

  const list = results.slice(0, 14);
  if(!list.length){
    panel.innerHTML = `<div class="gs-empty">未找到与「${esc(kw)}」相关的内容</div>`;
  } else {
    panel.innerHTML = list.map(x => `
      <div class="gs-item" onclick="jumpTo(${jsArg(x.key)},${jsArg(x.id)})">
        <span class="gs-tag">${x.title}</span>
        <div style="min-width:0;flex:1">
          <div class="gs-main">${esc(x.main)}</div>
          ${x.sub ? `<div class="gs-sub">${esc(x.sub)}</div>` : ''}
        </div>
        <span style="font-size:11px;color:#9aa8bd;font-family:monospace;flex-shrink:0">${esc(x.id)}</span>
      </div>`).join('');
  }
  panel.classList.add('show');
}
function jumpTo(key, id){
  $('gsPanel').classList.remove('show');
  $('globalInput').value = '';
  go(key);
  setTimeout(()=> openForm(key, id), 120);
}

/* ==================================================================
   9. 经营看板
   ================================================================== */
function renderDashboard(){
  const validOrders = DB.orders.filter(o => o.status !== '已取消');
  const totalAmount = validOrders.reduce((s,o) => s + (Number(o.qty)||0)*(Number(o.price)||0), 0);
  const inProd = DB.workorders.filter(w => w.status === '进行中').length;
  const stockValue = DB.inventory.reduce((s,i) => s + (Number(i.qty)||0)*(Number(i.price)||0), 0);
  const doneOrders = DB.orders.filter(o => o.status === '已完成').length;
  const onTime = validOrders.length ? (doneOrders / validOrders.length * 100).toFixed(1) : '0.0';
  const qcTotal = DB.quality.length;
  const qcFirst = DB.quality.filter(q => q.grade === '特级品' || q.grade === '一等品').length;
  const firstRate = qcTotal ? (qcFirst / qcTotal * 100).toFixed(1) : '0.0';

  const lowStock = DB.inventory.filter(i => DB.settings.lowStockWarn && Number(i.safe) > 0 && Number(i.qty) < Number(i.safe));
  const pendingOrders = DB.orders.filter(o => o.status === '待确认');
  const warnDays = Number(DB.settings.dueWarnDays) || 3;
  const dueSoon = DB.workorders.filter(w => {
    if(w.status === '已完工' || w.status === '已入库' || !w.due) return false;
    const diff = (new Date(w.due) - new Date('2024-06-20')) / 86400000;
    return diff >= 0 && diff <= warnDays;
  });

  const procCount = {};
  DB.workorders.forEach(w => { procCount[w.process] = (procCount[w.process]||0)+1; });
  const procTotal = DB.workorders.length || 1;
  const palette = ['#2f6fed','#0ea5a5','#7c3aed','#d98800','#16a34a','#dc2626','#0891b2','#9333ea'];
  const procHtml = Object.entries(procCount)
    .sort((a,b) => b[1]-a[1])
    .map(([nm, n], i) => {
      const pct = Math.round(n / procTotal * 100);
      return `<div class="dist-row">
        <div class="dist-top"><span class="nm">${esc(nm)}</span><span class="vl">${n} 张 · ${pct}%</span></div>
        <div class="dist-bar"><div class="dist-fill" style="width:${pct}%;background:${palette[i%palette.length]}"></div></div>
      </div>`;
    }).join('') || '<div class="empty" style="padding:26px 0!important">暂无工单数据</div>';

  const trend = [
    {label:'06-14', v:8200}, {label:'06-15', v:9400}, {label:'06-16', v:7800},
    {label:'06-17', v:10600},{label:'06-18', v:11200},{label:'06-19', v:9800},
    {label:'06-20', v:12400},
  ];
  const maxTrend = Math.max(...trend.map(t => t.v));
  const barsHtml = trend.map((t, i) => {
    const h = Math.round(t.v / maxTrend * 132);
    const hi = i === trend.length - 1;
    return `<div class="bar-col">
      <div class="bar-v">${(t.v/1000).toFixed(1)}k</div>
      <div class="bar-track"><div class="bar-fill ${hi?'hi':''}" style="height:${h}px"></div></div>
      <div class="bar-x">${t.label}</div>
    </div>`;
  }).join('');

  const alerts = [];
  pendingOrders.slice(0,2).forEach(o => alerts.push({
    c:'blue', i:'!', t:`订单 ${o.no} 待确认`,
    d:`${o.cust} · ${o.product} · ${fmtN(o.qty)} ${o.unit}`
  }));
  dueSoon.slice(0,2).forEach(w => alerts.push({
    c:'amber', i:'!', t:`工单 ${w.no} 交期临近`,
    d:`交期 ${w.due} · ${w.product} · 完成 ${fmtN(w.done)}/${fmtN(w.plan)} ${w.unit}`
  }));
  lowStock.slice(0,3).forEach(i => alerts.push({
    c:'red', i:'!', t:`${i.name} 低于安全库存`,
    d:`当前 ${fmtN(i.qty)} ${i.unit} · 安全线 ${fmtN(i.safe)} ${i.unit} · 库位 ${i.loc}`
  }));
  if(!alerts.length) alerts.push({c:'green', i:'✓', t:'暂无预警事项', d:'所有指标运行正常'});

  const alertsHtml = alerts.map(a => `
    <div class="alert-item">
      <div class="alert-ico ${a.c}">${a.i}</div>
      <div class="alert-txt"><div class="t">${esc(a.t)}</div><div class="d">${esc(a.d)}</div></div>
    </div>`).join('');

  const activeWOs = DB.workorders.filter(w => w.status === '进行中').slice(0, 5);
  const woHtml = activeWOs.length ? activeWOs.map(w => {
    const pct = Math.min(Math.round((Number(w.done)||0)/Math.max(Number(w.plan)||1,1)*100), 100);
    const grad = pct < 60 ? 'linear-gradient(90deg,#fbbf24,#d98800)' : 'linear-gradient(90deg,#5b96f8,#2f6fed)';
    return `<div class="dist-row">
      <div class="dist-top"><span class="nm">${esc(w.no)} · ${esc(w.product)}</span><span class="vl">${pct}%</span></div>
      <div class="dist-bar"><div class="dist-fill" style="width:${pct}%;background:${grad}"></div></div>
      <div class="prog-txt" style="margin-top:6px">交期 ${w.due} · ${esc(w.process)} · ${fmtN(w.done)}/${fmtN(w.plan)} ${w.unit}</div>
    </div>`;
  }).join('') : '<div class="empty" style="padding:26px 0!important">暂无在产工单</div>';

  return `
  <div class="kpi-grid">
    <div class="kpi c1">
      <div class="kpi-label">订单总金额</div>
      <div class="kpi-value">${fmtM0(totalAmount)}</div>
      <div class="kpi-foot">共 ${validOrders.length} 张有效订单 · 含税 ${DB.settings.taxRate}%</div>
    </div>
    <div class="kpi c2">
      <div class="kpi-label">在产工单</div>
      <div class="kpi-value">${inProd} <span style="font-size:13px;font-weight:400;color:var(--muted)">张</span></div>
      <div class="kpi-foot">${dueSoon.length} 张临近交期</div>
    </div>
    <div class="kpi c3">
      <div class="kpi-label">库存总金额</div>
      <div class="kpi-value">${fmtM0(stockValue)}</div>
      <div class="kpi-foot">${lowStock.length} 项低于安全线</div>
    </div>
    <div class="kpi c4">
      <div class="kpi-label">一等品率</div>
      <div class="kpi-value">${firstRate}<span style="font-size:15px">%</span></div>
      <div class="kpi-foot">本期验布 ${qcTotal} 匹 · 准时率 ${onTime}%</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-head">
        <div class="card-title">近 7 日坯布产量</div>
        <div class="card-sub">单位：米</div>
      </div>
      <div class="bars">${barsHtml}</div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">在制工序分布</div>
        <div class="card-sub">按工单数量</div>
      </div>
      ${procHtml}
    </div>
  </div>

  <div class="grid-2b">
    <div class="card">
      <div class="card-head">
        <div class="card-title">预警与待办</div>
        <div class="card-sub">${alerts.length} 项</div>
      </div>
      ${alertsHtml}
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">重点工单进度</div>
        <div class="card-sub">在产工单 Top 5</div>
      </div>
      ${woHtml}
    </div>
  </div>`;
}

/* ==================================================================
   10. 报表分析
   ================================================================== */
function renderReport(){
  const validOrders = DB.orders.filter(o => o.status !== '已取消');

  const custMap = {};
  validOrders.forEach(o => {
    const v = (Number(o.qty)||0) * (Number(o.price)||0);
    custMap[o.cust] = (custMap[o.cust] || 0) + v;
  });
  const custRank = Object.entries(custMap).sort((a,b) => b[1]-a[1]);
  const maxCust = custRank.length ? custRank[0][1] : 1;
  const custHtml = custRank.length ? custRank.slice(0,10).map(([name, amt], i) => `
    <div class="dist-row">
      <div class="dist-top">
        <span class="nm">${i+1}. ${esc(name)}</span>
        <span class="vl">${fmtM0(amt)}</span>
      </div>
      <div class="dist-bar"><div class="dist-fill" style="width:${amt/maxCust*100}%;background:linear-gradient(90deg,#5b96f8,#2f6fed)"></div></div>
    </div>`).join('') : '<div class="empty" style="padding:26px 0!important">暂无数据</div>';

  const prodMap = {};
  validOrders.forEach(o => {
    const v = (Number(o.qty)||0) * (Number(o.price)||0);
    prodMap[o.product] = (prodMap[o.product] || 0) + v;
  });
  const prodTotal = Object.values(prodMap).reduce((s,v) => s+v, 0) || 1;
  const prodRank = Object.entries(prodMap).sort((a,b) => b[1]-a[1]);
  const prodHtml = prodRank.length ? prodRank.map(([name, amt]) => `
    <tr>
      <td>${esc(name)}</td>
      <td class="num strong">${fmtM0(amt)}</td>
      <td class="num">${(amt/prodTotal*100).toFixed(1)}%</td>
    </tr>`).join('') : '<tr><td colspan="3" class="empty">暂无数据</td></tr>';

  const monthMap = {};
  validOrders.forEach(o => {
    const m = (o.orderDate || '').slice(0, 7);
    if(!m) return;
    monthMap[m] = (monthMap[m] || 0) + (Number(o.qty)||0) * (Number(o.price)||0);
  });
  const months = Object.entries(monthMap).sort((a,b) => a[0].localeCompare(b[0])).slice(-6);
  const maxM = months.length ? Math.max(...months.map(m => m[1])) : 1;
  const monthBars = months.length ? months.map(([m, v], i) => {
    const h = Math.max(Math.round(v / maxM * 130), 4);
    const hi = i === months.length - 1;
    return `<div class="bar-col">
      <div class="bar-v">${(v/10000).toFixed(1)}w</div>
      <div class="bar-track"><div class="bar-fill ${hi?'hi':''}" style="height:${h}px"></div></div>
      <div class="bar-x">${m.slice(5)}月</div>
    </div>`;
  }).join('') : '<div class="empty" style="width:100%">暂无数据</div>';

  const palette = ['#2f6fed','#0ea5a5','#7c3aed','#d98800','#16a34a','#dc2626','#0891b2','#9333ea'];
  const procHtml = dictNames('processes').map((nm, i) => {
    const n = DB.workorders.filter(w => w.process === nm).length;
    const pct = DB.workorders.length ? Math.round(n / DB.workorders.length * 100) : 0;
    return `<div class="dist-row">
      <div class="dist-top"><span class="nm">${esc(nm)}</span><span class="vl">${n} 张</span></div>
      <div class="dist-bar"><div class="dist-fill" style="width:${pct}%;background:${palette[i%palette.length]}"></div></div>
    </div>`;
  }).join('');

  const gradeMap = {};
  DB.quality.forEach(q => { gradeMap[q.grade] = (gradeMap[q.grade]||0)+1; });
  const gradeTotal = DB.quality.length || 1;
  const gradeHtml = Object.entries(gradeMap).map(([g, n], i) => {
    const pct = Math.round(n/gradeTotal*100);
    return `<div class="dist-row">
      <div class="dist-top"><span class="nm">${esc(g)}</span><span class="vl">${n} 匹 · ${pct}%</span></div>
      <div class="dist-bar"><div class="dist-fill" style="width:${pct}%;background:${palette[i%palette.length]}"></div></div>
    </div>`;
  }).join('') || '<div class="empty" style="padding:26px 0!important">暂无数据</div>';

  const salesmanMap = {};
  validOrders.forEach(o => {
    const v = (Number(o.qty)||0) * (Number(o.price)||0);
    const s = o.salesman || '未分配';
    salesmanMap[s] = (salesmanMap[s] || 0) + v;
  });
  const salesmanRank = Object.entries(salesmanMap).sort((a,b) => b[1]-a[1]);
  const maxSales = salesmanRank.length ? salesmanRank[0][1] : 1;
  const salesmanHtml = salesmanRank.length ? salesmanRank.map(([name, amt], i) => `
    <div class="dist-row">
      <div class="dist-top">
        <span class="nm">${i+1}. ${esc(name)}</span>
        <span class="vl">${fmtM0(amt)}</span>
      </div>
      <div class="dist-bar"><div class="dist-fill" style="width:${amt/maxSales*100}%;background:linear-gradient(90deg,#22d3ee,#0ea5a5)"></div></div>
    </div>`).join('') : '<div class="empty" style="padding:26px 0!important">暂无数据</div>';

  const supMap = {};
  DB.purchase.forEach(p => {
    const v = (Number(p.qty)||0)*(Number(p.price)||0);
    supMap[p.sup] = (supMap[p.sup] || 0) + v;
  });
  const supRank = Object.entries(supMap).sort((a,b) => b[1]-a[1]);
  const maxSup = supRank.length ? supRank[0][1] : 1;
  const supHtml = supRank.length ? supRank.slice(0,8).map(([name, amt], i) => `
    <div class="dist-row">
      <div class="dist-top">
        <span class="nm">${i+1}. ${esc(name)}</span>
        <span class="vl">${fmtM0(amt)}</span>
      </div>
      <div class="dist-bar"><div class="dist-fill" style="width:${amt/maxSup*100}%;background:linear-gradient(90deg,#c084fc,#7c3aed)"></div></div>
    </div>`).join('') : '<div class="empty" style="padding:26px 0!important">暂无数据</div>';

  const custDebt = DB.customers.filter(c => c.receivable > 0).sort((a,b) => b.receivable - a.receivable).slice(0,8);
  const maxDebt = custDebt.length ? custDebt[0].receivable : 1;
  const debtHtml = custDebt.length ? custDebt.map((c, i) => `
    <div class="dist-row">
      <div class="dist-top">
        <span class="nm">${i+1}. ${esc(c.name)}</span>
        <span class="vl">${fmtM0(c.receivable)}</span>
      </div>
      <div class="dist-bar"><div class="dist-fill" style="width:${c.receivable/maxDebt*100}%;background:linear-gradient(90deg,#fbbf24,#d98800)"></div></div>
    </div>`).join('') : '<div class="empty" style="padding:26px 0!important">暂无应收账款</div>';

  const catMap = {};
  DB.inventory.forEach(i => {
    const v = (Number(i.qty)||0)*(Number(i.price)||0);
    catMap[i.cat] = (catMap[i.cat] || 0) + v;
  });
  const catRank = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
  const catTotal = catRank.reduce((s,x)=>s+x[1],0) || 1;
  const catHtml = catRank.map(([name, amt]) => `
    <tr>
      <td>${esc(name)}</td>
      <td class="num strong">${fmtM0(amt)}</td>
      <td class="num">${(amt/catTotal*100).toFixed(1)}%</td>
    </tr>`).join('') || '<tr><td colspan="3" class="empty">暂无数据</td></tr>';

  const priMap = {};
  validOrders.forEach(o => { priMap[o.priority||'普通'] = (priMap[o.priority||'普通']||0)+1; });
  const priHtml = Object.entries(priMap).map(([p, n]) => {
    const cls = {'特急':'red','加急':'amber','普通':'gray','暂缓':'blue'}[p] || 'gray';
    return `<span class="badge ${cls}" style="margin-right:6px;margin-bottom:6px;display:inline-block">${esc(p)} · ${n} 单</span>`;
  }).join('');

  return `
  <div class="grid-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-head">
        <div class="card-title">月度销售额趋势</div>
        <div class="card-sub">按订单日期聚合 · 单位：万元</div>
      </div>
      <div class="bars">${monthBars}</div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">客户销售排行</div>
        <div class="card-sub">按订单金额 Top 10</div>
      </div>
      ${custHtml}
    </div>
  </div>

  <div class="grid-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-head">
        <div class="card-title">业务员业绩排行</div>
        <div class="card-sub">按订单金额</div>
      </div>
      ${salesmanHtml}
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">应收账款 TOP 8</div>
        <div class="card-sub">按客户应收余额</div>
      </div>
      ${debtHtml}
    </div>
  </div>

  <div class="grid-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-head">
        <div class="card-title">供应商采购金额</div>
        <div class="card-sub">按采购订单金额</div>
      </div>
      ${supHtml}
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">质量等级分布</div>
        <div class="card-sub">按检验匹数</div>
      </div>
      ${gradeHtml}
    </div>
  </div>

  <div class="grid-2b" style="margin-bottom:16px">
    <div class="card">
      <div class="card-head">
        <div class="card-title">产品结构分析</div>
        <div class="card-sub">按订单金额占比</div>
      </div>
      <div class="table-scroll">
        <table style="min-width:auto">
          <thead><tr><th>产品名称</th><th style="text-align:right">销售额</th><th style="text-align:right">占比</th></tr></thead>
          <tbody>${prodHtml}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">库存分类金额</div>
        <div class="card-sub">按物料类别</div>
      </div>
      <div class="table-scroll">
        <table style="min-width:auto">
          <thead><tr><th>类别</th><th style="text-align:right">金额</th><th style="text-align:right">占比</th></tr></thead>
          <tbody>${catHtml}</tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-head">
        <div class="card-title">工单工序分布</div>
        <div class="card-sub">按字典「工序」统计</div>
      </div>
      ${procHtml}
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">订单优先级分布</div>
        <div class="card-sub">按有效订单</div>
      </div>
      <div style="padding:8px 0">${priHtml || '<span style="color:var(--muted);font-size:12.5px">暂无数据</span>'}</div>
      <div style="margin-top:16px;padding-top:14px;border-top:1px dashed #edf1f7;font-size:11.5px;color:var(--muted);line-height:1.8">
        <b style="color:#54637a">报表说明</b><br>
        · 本报表基于当前全部业务数据实时聚合<br>
        · 编辑任意记录后，本页会自动重新计算<br>
        · 数据保存在本机浏览器与本地文件中<br>
        · ${esc(DB.settings.reportFooter || '')}
      </div>
    </div>
  </div>`;
}

/* ==================================================================
   11. 系统设置
   ================================================================== */
let settingsTab = 'params';
let editingDict = 'products';

function renderSettings(){
  return `
  <div class="tabs">
    <button class="tab ${settingsTab==='params'?'active':''}" onclick="setSettingsTab('params')">企业参数</button>
    <button class="tab ${settingsTab==='dict'?'active':''}" onclick="setSettingsTab('dict')">数据字典</button>
    <button class="tab ${settingsTab==='data'?'active':''}" onclick="setSettingsTab('data')">数据管理</button>
    <button class="tab ${settingsTab==='fields'?'active':''}" onclick="setSettingsTab('fields')">字段配置</button>
    <button class="tab ${settingsTab==='about'?'active':''}" onclick="setSettingsTab('about')">关于系统</button>
  </div>
  <div id="settingsBody">${renderSettingsBody()}</div>`;
}
function setSettingsTab(t){ settingsTab = t; render(); }

function renderSettingsBody(){
  if(settingsTab === 'params') return renderParams();
  if(settingsTab === 'dict')   return renderDictManager();
  if(settingsTab === 'data')   return renderDataManager();
  if(settingsTab === 'fields') return renderFieldsConfig();
  if(settingsTab === 'about')  return renderAbout();
  return '';
}

function renderParams(){
  const s = DB.settings;
  return `
  <div class="card" style="margin-bottom:16px">
    <div class="card-head">
      <div class="card-title">企业信息</div>
      <div class="card-sub">显示于单据抬头、导出文件与报表页脚</div>
    </div>
    <div class="set-row">
      <div><div class="sl">企业全称</div><div class="sd">用于所有单据与报表抬头</div></div>
      <input type="text" value="${esc(s.company)}" onchange="setSetting('company', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">企业简称</div><div class="sd">用于页面副标题等短文案</div></div>
      <input type="text" value="${esc(s.companyShort||'')}" onchange="setSetting('companyShort', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">企业地址</div><div class="sd">用于单据与报表</div></div>
      <input type="text" value="${esc(s.companyAddress||'')}" onchange="setSetting('companyAddress', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">联系电话</div><div class="sd">用于单据与报表</div></div>
      <input type="text" value="${esc(s.companyPhone||'')}" onchange="setSetting('companyPhone', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">企业邮箱</div><div class="sd">用于单据与报表</div></div>
      <input type="text" value="${esc(s.companyEmail||'')}" onchange="setSetting('companyEmail', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">税号</div><div class="sd">用于发票与合同</div></div>
      <input type="text" value="${esc(s.companyTaxNo||'')}" onchange="setSetting('companyTaxNo', this.value)">
    </div>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="card-head">
      <div class="card-title">业务参数</div>
      <div class="card-sub">修改后立即生效，并自动保存到本机</div>
    </div>
    <div class="set-row">
      <div><div class="sl">货币符号</div><div class="sd">用于所有金额字段的前缀显示</div></div>
      <input type="text" value="${esc(s.currency)}" maxlength="3" onchange="setSetting('currency', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">默认税率 (%)</div><div class="sd">用于订单金额的税额估算</div></div>
      <input type="number" value="${s.taxRate}" step="0.1" onchange="setSetting('taxRate', Number(this.value))">
    </div>
    <div class="set-row">
      <div><div class="sl">交期预警天数</div><div class="sd">工单距交期小于该天数时在看板中提示</div></div>
      <input type="number" value="${s.dueWarnDays}" min="0" onchange="setSetting('dueWarnDays', Number(this.value))">
    </div>
    <div class="set-row">
      <div><div class="sl">质量执行标准</div><div class="sd">用于质量管理默认判定标准</div></div>
      <input type="text" value="${esc(s.qualityStandard||'')}" onchange="setSetting('qualityStandard', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">每日工作时长（小时）</div><div class="sd">用于产能与工时估算</div></div>
      <input type="number" value="${s.workHoursPerDay}" min="1" max="24" onchange="setSetting('workHoursPerDay', Number(this.value))">
    </div>
    <div class="set-row">
      <div><div class="sl">每日班次数</div><div class="sd">用于产能估算</div></div>
      <input type="number" value="${s.shiftsPerDay}" min="1" max="5" onchange="setSetting('shiftsPerDay', Number(this.value))">
    </div>
    <div class="set-row">
      <div><div class="sl">设备总数（台）</div><div class="sd">用于产能利用率计算</div></div>
      <input type="number" value="${s.equipCount}" min="0" onchange="setSetting('equipCount', Number(this.value))">
    </div>
    <div class="set-row">
      <div><div class="sl">年产能目标（米）</div><div class="sd">用于产能完成率计算</div></div>
      <input type="number" value="${s.annualCapacity}" min="0" onchange="setSetting('annualCapacity', Number(this.value))">
    </div>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="card-head">
      <div class="card-title">使用与协作</div>
      <div class="card-sub">支持绑定本地文件，编辑自动写入磁盘</div>
    </div>
    <div class="set-row">
      <div><div class="sl">当前操作人</div><div class="sd">记录在导出文件名与报表页脚中</div></div>
      <input type="text" value="${esc(s.currentUser||'')}" onchange="setSetting('currentUser', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">所属部门</div><div class="sd">用于工作台展示</div></div>
      <input type="text" value="${esc(s.currentDept||'')}" onchange="setSetting('currentDept', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">存储模式说明</div><div class="sd">此参数仅展示，无法修改</div></div>
      <input type="text" value="${esc(s.storageMode||'')}" readonly style="background:#f6f8fc;color:#7a879b">
    </div>
    <div class="set-row">
      <div><div class="sl">报表页脚</div><div class="sd">显示在报表分析页底部</div></div>
      <input type="text" value="${esc(s.reportFooter||'')}" onchange="setSetting('reportFooter', this.value)">
    </div>
    <div class="set-row">
      <div><div class="sl">显示存储提示条</div><div class="sd">在各列表页顶部显示数据存储说明</div></div>
      <label class="switch">
        <input type="checkbox" ${s.showStorageTip ? 'checked' : ''}
          onchange="setSetting('showStorageTip', this.checked)">
        <span class="sl2"></span>
      </label>
    </div>
    <div class="set-row">
      <div><div class="sl">库存预警</div><div class="sd">开启后，库存低于安全线的物料会在侧栏与看板中提示</div></div>
      <label class="switch">
        <input type="checkbox" ${s.lowStockWarn ? 'checked' : ''}
          onchange="setSetting('lowStockWarn', this.checked)">
        <span class="sl2"></span>
      </label>
    </div>
    <div class="set-row">
      <div><div class="sl">启用审批流</div><div class="sd">预留参数，暂不参与逻辑</div></div>
      <label class="switch">
        <input type="checkbox" ${s.enableApproval ? 'checked' : ''}
          onchange="setSetting('enableApproval', this.checked)">
        <span class="sl2"></span>
      </label>
    </div>
  </div>`;
}
function setSetting(k, v){
  DB.settings[k] = v;
  saveDB();
  initNav();
  render();
  toast('参数已更新');
}

/* ---------- 数据字典 ---------- */
function renderDictManager(){
  const names = {
    products:'产品', specs:'规格', colors:'颜色色号', units:'计量单位', categories:'物料类别',
    processes:'工序', orderStatus:'订单状态', workStatus:'工单状态',
    purchaseStatus:'采购状态', grades:'质量等级', custLevels:'客户等级', custTypes:'客户类型',
    supTypes:'供应商类型', warehouses:'库位', paymentTerms:'付款方式',
    priorities:'优先级', salesmen:'业务员', inspectors:'检验员', departments:'部门',
    methods:'检验方式',
  };
  const dictKeys = Object.keys(DB.dict).filter(k => /^[A-Za-z][A-Za-z0-9_]*$/.test(k) && Array.isArray(DB.dict[k]));
  const items = getDict(editingDict);
  const colKeys = [];
  items.forEach(it => Object.keys(it).forEach(k => { if(colKeys.indexOf(k) === -1) colKeys.push(k); }));

  const rows = items.map((it, idx) => `
    <tr>
      ${colKeys.map(k => {
        const val = it[k] == null ? '' : it[k];
        if(k === 'hex'){
          return `<td><span class="color-dot" style="background:${esc(val)}"></span>${esc(val)}</td>`;
        }
        return `<td class="${k === 'price' || k === 'rate' ? 'num' : ''}">${esc(val)}</td>`;
      }).join('')}
      <td class="row-actions">
        <button class="icon-btn" title="编辑" onclick="openDictItem(${jsArg(editingDict)}, ${idx})">✎</button>
        <button class="icon-btn danger" title="删除" onclick="delDictItem(${jsArg(editingDict)}, ${idx})">✕</button>
      </td>
    </tr>`).join('');

  return `
  <div class="card" style="margin-bottom:16px">
    <div class="card-head">
      <div class="card-title">数据字典</div>
      <div class="card-sub">所有下拉选项均来自此处，修改后全局生效 · 共 ${dictKeys.length} 类</div>
    </div>
    <div class="dict-grid">
      ${dictKeys.map(k => `
        <button class="dict-btn ${editingDict===k?'active':''}" onclick="pickDict(${jsArg(k)})">
          <div class="dn">${esc(names[k] || k)}</div>
          <div class="dc">${getDict(k).length} 项</div>
        </button>`).join('')}
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title">${esc(names[editingDict] || editingDict)} · 选项列表</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" onclick="clearDict(${jsArg(editingDict)})">清空本类</button>
        <button class="btn btn-primary btn-sm" onclick="openDictItem(${jsArg(editingDict)}, -1)">＋ 新增选项</button>
      </div>
    </div>
    <div class="table-scroll">
      <table style="min-width:auto">
        <thead>
          <tr>
            ${colKeys.map(k => `<th>${esc(k === 'name' ? '名称' : k === 'code' ? '编码' : k === 'hex' ? '色值' : k === 'spec' ? '规格' : k === 'unit' ? '单位' : k === 'price' ? '参考单价' : k === 'cat' ? '分类' : k)}</th>`).join('')}
            <th class="row-actions">操作</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${colKeys.length+1}" class="empty">该字典暂无选项 · 点击「新增选项」添加第一条</td></tr>`}</tbody>
      </table>
    </div>
  </div>`;
}
function pickDict(k){ if(!Object.prototype.hasOwnProperty.call(DB.dict,k) || !Array.isArray(DB.dict[k])) return; editingDict = k; render(); }

function clearDict(k){
  if(!Object.prototype.hasOwnProperty.call(DB.dict,k) || !Array.isArray(DB.dict[k])){ toast('字典不存在'); return; }
  if(!confirm(`确定清空「${k}」字典中的所有选项吗？\n此操作不可撤销。`)) return;
  DB.dict[k] = [];
  saveDB();
  render();
  toast('已清空');
}

function openDictItem(dictKey, idx){
  const items = DB.dict[dictKey];
  if(!Array.isArray(items)){ toast('字典不存在'); return; }
  const editing = idx >= 0;
  const item = editing ? items[idx] : {};
  const colKeys = [];
  items.forEach(it => Object.keys(it).forEach(k => { if(colKeys.indexOf(k) === -1) colKeys.push(k); }));
  if(editing) Object.keys(item).forEach(k => { if(colKeys.indexOf(k) === -1) colKeys.push(k); });
  if(!colKeys.length) colKeys.push('name');

  const labelOf = k => k === 'name' ? '名称' : k === 'code' ? '编码' : k === 'hex' ? '色值(HEX)' : k === 'spec' ? '规格' : k === 'unit' ? '单位' : k === 'price' ? '参考单价' : k === 'cat' ? '分类' : k;

  const html = `
  <div class="modal-mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" style="max-width:520px">
      <div class="modal-head">
        <h3>${editing ? '编辑' : '新增'}字典选项 · ${esc(dictKey)}</h3>
        <button class="x" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid" style="grid-template-columns:1fr">
          ${colKeys.map(k => `
            <div class="field">
              <label>${esc(labelOf(k))}${k === 'name' ? '<span class="req">*</span>' : ''}</label>
              <input type="text" id="dk_${esc(k)}" value="${esc(item[k] == null ? '' : item[k])}"
                ${k === 'hex' ? 'placeholder="#1e3a5f"' : ''}>
            </div>`).join('')}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" onclick="saveDictItem(${jsArg(dictKey)}, ${idx})">保存</button>
      </div>
    </div>
  </div>`;
  $('modalRoot').innerHTML = html;
}

function saveDictItem(dictKey, idx){
  const items = DB.dict[dictKey];
  if(!Array.isArray(items)){ toast('字典不存在'); return; }
  const colKeys = [];
  items.forEach(it => Object.keys(it).forEach(k => { if(colKeys.indexOf(k) === -1) colKeys.push(k); }));
  if(idx >= 0) Object.keys(items[idx]).forEach(k => { if(colKeys.indexOf(k) === -1) colKeys.push(k); });
  if(!colKeys.length) colKeys.push('name');

  const obj = {};
  colKeys.forEach(k => {
    const el = $('dk_' + k);
    if(el) obj[k] = el.value.trim();
  });
  if(!obj.name){ toast('「名称」不能为空'); return; }

  const dup = items.findIndex((it, i) => it.name === obj.name && i !== idx);
  if(dup > -1){ toast('已存在同名选项'); return; }

  if(idx >= 0) items[idx] = obj;
  else items.push(obj);

  saveDB();
  closeModal();
  render();
  toast(idx >= 0 ? '已保存' : '已新增');
}

function delDictItem(dictKey, idx){
  const items = DB.dict[dictKey];
  if(!Array.isArray(items) || !items[idx]){ toast('字典项不存在'); return; }
  const it = items[idx];
  if(!confirm(`确定删除字典项「${it.name}」吗？\n已使用该值的记录不会被自动修改。`)) return;
  items.splice(idx, 1);
  saveDB();
  render();
  toast('已删除');
}

/* ---------- 数据管理（含本地文件绑定） ---------- */
function renderDataManager(){
  const size = (() => {
    try{ return (JSON.stringify(DB).length / 1024).toFixed(1) + ' KB'; }
    catch(e){ return '—'; }
  })();
  const counts = Object.keys(SCHEMAS).map(k => {
    const S = SCHEMAS[k];
    return `<div class="set-row">
      <div><div class="sl">${S.title}</div><div class="sd">表名：${S.key}</div></div>
      <span class="badge blue">${(DB[S.key]||[]).length} 条</span>
    </div>`;
  }).join('');

  const supported = !!window.showOpenFilePicker;
  const bound = !!fileHandle;
  const ready = fileReady;

  let bindTip = '';
  if(!supported){
    bindTip = `<div style="background:#fff4e0;color:#92400e;padding:10px 14px;border-radius:8px;font-size:12px;line-height:1.7;margin-bottom:12px;border:1px solid #fde68a">
      ⚠️ 当前浏览器不支持直接绑定本地文件。请使用 <b>Chrome / Edge 86+</b>，或使用下方「导出 JSON」手动备份。
    </div>`;
  } else if(!bound){
    bindTip = `<div style="background:#e7efff;color:#1e40af;padding:10px 14px;border-radius:8px;font-size:12px;line-height:1.7;margin-bottom:12px;border:1px solid #c7d9fb">
       绑定本地文件后，所有编辑会<b>自动写入该文件</b>，换电脑时把文件带过去即可。
    </div>`;
  } else if(!ready){
    bindTip = `<div style="background:#fff4e0;color:#92400e;padding:10px 14px;border-radius:8px;font-size:12px;line-height:1.7;margin-bottom:12px;border:1px solid #fde68a">
       上次绑定的文件 <b>${esc(fileHandle.name)}</b> 需要重新授权才能自动保存。
      <button class="btn btn-sm btn-primary" style="margin-left:8px" onclick="reRequestPermission()">立即授权</button>
    </div>`;
  } else {
    bindTip = `<div style="background:#e6f7ed;color:#166534;padding:10px 14px;border-radius:8px;font-size:12px;line-height:1.7;margin-bottom:12px;border:1px solid #bbf7d0">
      ✅ 已绑定本地文件：<b>${esc(fileHandle.name)}</b> · 每次编辑自动写入。
    </div>`;
  }

  return `
  <div class="card" style="margin-bottom:16px">
    <div class="card-head">
      <div class="card-title">数据概览</div>
      <div class="card-sub">当前数据体积约 ${size}</div>
    </div>
    ${counts}
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="card-head">
      <div class="card-title">本地文件存储（推荐）</div>
      <div class="card-sub" id="fileStatus">${bound ? '已绑定：'+esc(fileHandle.name)+(ready?' · 自动保存中':' · 需重新授权') : '未绑定'}</div>
    </div>
    ${bindTip}
    <div class="set-row">
      <div><div class="sl">绑定已有 JSON 文件</div><div class="sd">选择一个已存在的文件，之后自动写入</div></div>
      <button class="btn btn-primary" onclick="bindLocalFile()" ${supported?'':'disabled style="opacity:.5;cursor:not-allowed"'}>绑定本地文件</button>
    </div>
    <div class="set-row">
      <div><div class="sl">新建 JSON 文件</div><div class="sd">在本地新建一个文件并立即写入当前数据</div></div>
      <button class="btn" onclick="createLocalFile()" ${supported?'':'disabled style="opacity:.5;cursor:not-allowed"'}>新建本地文件</button>
    </div>
    ${bound ? `
    <div class="set-row">
      <div><div class="sl">解除绑定</div><div class="sd">解除后编辑仅保存在浏览器，不再写入该文件</div></div>
      <button class="btn" style="color:#dc2626" onclick="unbindLocalFile()">解除绑定</button>
    </div>` : ''}
  </div>

  <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg,#f0f6ff,#f7fbfb);border-color:#d8e6fb">
    <div style="font-size:12.5px;color:#3c4a5f;line-height:1.9">
      <b style="color:#2f6fed">存储机制说明</b><br>
      · <b>浏览器缓存</b>：无论是否绑定文件，编辑都会写入浏览器 localStorage，页面刷新不丢<br>
      · <b>本地文件</b>：绑定后，编辑会<b>自动覆盖</b>您指定的 JSON 文件<br>
      · <b>多员工协作</b>：每人绑定自己的文件即可独立使用；如需共享，把 JSON 文件发给同事导入<br>
      · <b>文件位置</b>：绑定后可直接用记事本打开该文件查看所有数据
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title">手动备份与恢复</div>
      <div class="card-sub">不依赖绑定文件，随时可导出 / 导入</div>
    </div>
    <div class="set-row">
      <div><div class="sl">导出全部数据</div><div class="sd">下载 JSON 文件，可用于分享或迁移</div></div>
      <button class="btn" onclick="exportAll()">导出 JSON</button>
    </div>
    <div class="set-row">
      <div><div class="sl">导入数据</div><div class="sd">从 JSON 文件恢复，将覆盖当前所有数据</div></div>
      <label class="btn" style="cursor:pointer">
        选择文件
        <input type="file" accept=".json" style="display:none" onchange="importAll(this)">
      </label>
    </div>
    <div class="set-row">
      <div><div class="sl">恢复演示数据</div><div class="sd">清空当前修改，还原为内置示例数据</div></div>
      <button class="btn" style="color:#dc2626" onclick="resetAll()">恢复默认</button>
    </div>
  </div>`;
}
function exportAll(){
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `织云ERP_${AUTHOR.name}_${DB.settings.company||''}_备份_${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出备份文件');
}
function importAll(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try{
      const d = JSON.parse(e.target.result);
      if(!isValidDBShape(d)) throw new Error('数据结构不完整或版本不兼容');
      DB = d;
      storageRecoveryRequired = false;
      const localSaved = saveDB();
      initNav();
      render();
      toast(localSaved ? '数据导入成功' : '数据已载入当前页面，但本地缓存保存失败；请立即导出备份');
    }catch(err){
      console.error('ERP 数据导入失败：', err);
      toast('导入失败：文件格式不正确或数据结构不完整，原数据未更改');
    }
    input.value = '';
  };
  reader.readAsText(file);
}
function resetAll(){
  if(!confirm('确定恢复默认演示数据吗？当前所有修改将丢失。')) return;
  DB = defaultDB();
  storageRecoveryRequired = false;
  saveDB();
  initNav();
  render();
  toast('已恢复演示数据');
}

/* ---------- 字段配置 ---------- */
function renderFieldsConfig(){
  const cards = Object.keys(SCHEMAS).map(key => {
    const S = SCHEMAS[key];
    const hidden = (DB.settings.hiddenCols && DB.settings.hiddenCols[key]) || [];
    return `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <div class="card-title">${S.title}</div>
        <div class="card-sub">共 ${S.fields.length} 个字段 · 已隐藏 ${hidden.length} 个</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:7px">
        ${S.fields.map(f => {
          const off = hidden.indexOf(f.k) > -1;
          return `<button class="chip ${off ? '' : 'active'}"
            onclick="toggleField(${jsArg(key)},${jsArg(f.k)})"
            style="${off ? 'opacity:.5' : ''}">${off ? '○' : '●'} ${esc(f.l)}</button>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="card" style="margin-bottom:14px;background:#f8fbff;border-color:#d8e6fb">
    <div style="font-size:12.5px;color:#3c4a5f;line-height:1.7">
      <b>字段显示配置</b>：点击标签可切换该字段在各列表中的显示/隐藏状态，配置自动保存并立即生效。
    </div>
  </div>
  ${cards}`;
}
function toggleField(key, fieldKey){
  if(!DB.settings.hiddenCols) DB.settings.hiddenCols = {};
  const arr = DB.settings.hiddenCols[key] || [];
  const i = arr.indexOf(fieldKey);
  if(i > -1) arr.splice(i, 1);
  else arr.push(fieldKey);
  DB.settings.hiddenCols[key] = arr;
  saveDB();
  render();
  toast(arr.indexOf(fieldKey) > -1 ? '已隐藏该字段' : '已显示该字段');
}

/* ---------- 关于系统 ---------- */
function renderAbout(){
  return `
  <div class="card">
    <div class="about-hero">
      <div class="about-logo">织</div>
      <div>
        <div class="about-name">织云 ERP · 企业级纺织行业管理系统</div>
        <div class="about-desc">面向纺织行业全流程管理的企业级解决方案</div>
      </div>
    </div>

    <div class="set-row">
      <div><div class="sl">设计与开发</div><div class="sd">系统架构 / 交互设计 / 前端实现</div></div>
      <div class="about-person">${esc(AUTHOR.name)}</div>
    </div>

    <div class="set-row">
      <div><div class="sl">联系方式</div><div class="sd">如需定制开发或技术咨询，欢迎联系</div></div>
      <a class="about-link" href="mailto:${esc(AUTHOR.email)}">${esc(AUTHOR.email)}</a>
    </div>

    <div class="set-row">
      <div><div class="sl">技术栈</div><div class="sd">本地存储 · 本地文件 · 零依赖 · 单文件部署</div></div>
      <span class="badge blue">HTML5 + 原生 JS</span>
    </div>

    <div class="set-row">
      <div><div class="sl">版本信息</div><div class="sd">最近更新：${esc(AUTHOR.updated)}</div></div>
      <span class="badge cyan">${esc(AUTHOR.version)}</span>
    </div>

    <div class="set-row">
      <div><div class="sl">数据存储</div><div class="sd">浏览器 localStorage + 可选本地文件实时写入</div></div>
      <span class="badge green">双保险</span>
    </div>

    <div class="set-row">
      <div><div class="sl">功能范围</div><div class="sd">订单 / 工单 / 库存 / 采购 / 质量 / 报表 / 档案 / 配置</div></div>
      <span class="badge purple">全流程覆盖</span>
    </div>

    <div class="set-row">
      <div><div class="sl">当前版本容量</div><div class="sd">约 ${(JSON.stringify(DB).length/1024).toFixed(1)} KB</div></div>
      <span class="badge amber">已用 ${(JSON.stringify(DB).length/1024/1024*100).toFixed(2)}%</span>
    </div>
  </div>

  <div class="card" style="margin-top:16px;background:linear-gradient(135deg,#f0f6ff,#f7fbfb);border-color:#d8e6fb">
    <div style="font-size:12.5px;color:#3c4a5f;line-height:1.9">
      <b style="color:#2f6fed">使用提示</b><br>
      · 所有列表均支持 <b>任意字段模糊搜索</b>，输入关键词会实时过滤并给出建议<br>
      · 每张表格右上角可进行 <b>列设置 / 导出 CSV / 新增记录</b><br>
      · 编辑任意行数据后，看板与报表会 <b>自动重新聚合</b><br>
      · 在「数据字典」中可增删产品、颜色、工序、库位等所有下拉选项<br>
      · 所有编号（订单号 / 工单号 / 采购单号 / 检验单号 / 客户编码 / 供应商编码）<b>均可手动输入或修改</b><br>
      · 在「数据管理」中可 <b>绑定本地文件</b>，编辑自动写入磁盘；也可导出 JSON 分享给同事
    </div>
  </div>`;
}

/* ==================================================================
   12. 路由 & 渲染
   ================================================================== */
let currentPage = 'dashboard';

function go(page){
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  render();
  $('sidebar').classList.remove('open');
  window.scrollTo({top:0, behavior:'smooth'});
}

function render(){
  const meta = PAGES[currentPage] || {title:'', sub:''};
  $('pageTitle').textContent = meta.title;

  let sub = meta.sub || '';
  if(SCHEMAS[currentPage]){
    const S = SCHEMAS[currentPage];
    const n = filteredRows(currentPage).length;
    const total = (DB[S.key] || []).length;
    sub = `共 ${total} 条记录 · 当前显示 ${n} 条 · 支持搜索 / 筛选 / 编辑 / 新增`;
  } else if(currentPage === 'dashboard'){
    sub = `${DB.settings.company} · 实时汇总各业务模块数据`;
  } else if(currentPage === 'report'){
    sub = `基于当前全部业务数据实时聚合 · 导出文件将自动署名 ${AUTHOR.name}`;
  } else if(currentPage === 'settings'){
    sub = '所有参数、字典、字段均可配置 · 修改实时保存到本机';
  }
  $('pageSub').textContent = sub;

  let html = '';
  if(currentPage === 'dashboard')      html = renderDashboard();
  else if(currentPage === 'report')    html = renderReport();
  else if(currentPage === 'settings')  html = renderSettings();
  else if(SCHEMAS[currentPage])        html = renderListPage(currentPage);
  else html = '<div class="card">页面不存在</div>';

  $('content').innerHTML = html;
  updateFileStatus();
}

/* ==================================================================
   13. 启动
   ================================================================== */
function tickClock(){
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  $('clock').textContent = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

initNav();
go('dashboard');
tickClock();
setInterval(tickClock, 30000);
restoreHandle();
