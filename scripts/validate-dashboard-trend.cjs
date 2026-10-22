'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const app = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const start = app.indexOf('function buildOrderDateTrend(');
const end = app.indexOf('function renderDashboard()', start);
assert.ok(start >= 0 && end > start, 'ERP must expose a pure order-date trend aggregator');
const context = vm.createContext({});
vm.runInContext(app.slice(start, end) + '\nthis.buildOrderDateTrend = buildOrderDateTrend;', context);

const orders = [
  { no:'A', orderDate:'2024-06-17', qty:10, price:10, status:'待确认' },
  { no:'B', orderDate:'2024-06-19', qty:100, price:18.5, status:'待确认' },
  { no:'C', orderDate:'2024-06-19', qty:50, price:20, status:'已完成' },
  { no:'D', orderDate:'2024-06-20', qty:5, price:12, status:'已取消' },
  { no:'E', orderDate:'2024-06-20', qty:4, price:25, status:'生产中' },
  { no:'F', orderDate:'2024-02-30', qty:500, price:100, status:'待确认' },
  { no:'G', orderDate:'2024-06-21', qty:Infinity, price:100, status:'待确认' }
];
const trend = JSON.parse(JSON.stringify(context.buildOrderDateTrend(orders, 7)));
assert.deepEqual(trend, [
  { date:'2024-06-17', totalAmount:100, orderCount:1, label:'06-17' },
  { date:'2024-06-19', totalAmount:2850, orderCount:2, label:'06-19' },
  { date:'2024-06-20', totalAmount:100, orderCount:1, label:'06-20' }
], 'trend must group actual order amounts by orderDate, exclude cancelled orders and reject invalid dates/numbers');
assert.equal(context.buildOrderDateTrend(orders, 2).length, 2,
  'dashboard should display only the latest seven (or requested limit) order dates');
assert.deepEqual(JSON.parse(JSON.stringify(context.buildOrderDateTrend([]))), [],
  'an empty order ledger must produce an honest empty chart, not fabricated bars');
assert.ok(app.includes('buildOrderDateTrend(validOrders, 7)') &&
          app.includes('暂无有效订单日期数据') &&
          !app.includes("{label:'06-14', v:8200}"),
  'dashboard must render the order-ledger aggregation and an explicit empty state');
assert.ok(index.includes('legacy-app.js?v=20261022-reference-v7'),
  'ERP entry point must load the new trend logic without stale browser cache');
assert.ok(app.includes('title="${t.date} · ${fmtM0(t.totalAmount)} · ${t.orderCount} 张订单"'),
  'each trend bar must expose its date, total amount and order count on hover');
assert.throws(() => context.buildOrderDateTrend(orders, 0), error => error && error.name === 'RangeError',
  'trend window must reject zero and invalid limits');
console.log('ERP order-date dashboard trend checks passed.');
