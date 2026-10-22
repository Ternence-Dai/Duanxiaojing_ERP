'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const app = fs.readFileSync('assets/js/legacy-app.js','utf8');
const html = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('assets/css/operations-cockpit-v2.css','utf8');

const start = app.indexOf('function getWorkOrderDueStatus(');
const end = app.indexOf('function renderDashboard()',start);
assert.ok(start>=0 && end>start,'work-order due classifier must be isolated before the dashboard renderer');
const context = vm.createContext({Date,Number,String,Math});
vm.runInContext(app.slice(start,end)+'\nthis.classify=getWorkOrderDueStatus;',context);
const classify = context.classify;
const today = new Date(2026,9,20,16,30,0);

assert.deepEqual(JSON.parse(JSON.stringify(classify({status:'进行中',due:'2026-10-19'},today,3))),
  {status:'overdue',daysUntil:-1,daysLate:1},
  'a work order due yesterday must be identified as one day overdue');
assert.equal(classify({status:'进行中',due:'2026-10-20'},today,3).status,'due-soon',
  'a work order due today must be actionable, not overdue or omitted');
assert.equal(classify({status:'进行中',due:'2026-10-23'},today,3).daysUntil,3,
  'the configured warning window must include its final calendar day');
assert.equal(classify({status:'进行中',due:'2026-10-24'},today,3).status,'scheduled',
  'work outside the warning window must remain scheduled');
assert.equal(classify({status:'已完工',due:'2026-10-01'},today,3).status,'closed',
  'completed work orders must not create overdue alerts');
assert.equal(classify({status:'已入库',due:'2026-10-01'},today,3).status,'closed',
  'warehoused work orders must not create overdue alerts');
assert.equal(classify({status:'进行中',due:''},today,3).status,'unscheduled',
  'missing due dates must remain explicit and not be treated as healthy');
assert.equal(classify({status:'进行中',due:'2026-02-29'},today,3).status,'invalid',
  'impossible calendar dates must be flagged for correction');
assert.equal(classify({status:'进行中',due:'2024-02-29'},today,3).status,'overdue',
  'valid leap-day due dates must be parsed as calendar dates');
assert.equal(classify({status:'进行中',due:'2026-10-21'},today,0).status,'scheduled',
  'a zero-day warning window must be respected rather than replaced by the default');
assert.throws(()=>classify({status:'进行中',due:'2026-10-20'},new Date(NaN),3), error => error && error.name === 'TypeError');

const dashboardStart = app.indexOf('function renderDashboard()');
const dashboardEnd = app.indexOf('\nfunction renderReport',dashboardStart);
const dashboard = app.slice(dashboardStart,dashboardEnd);
assert.ok(dashboard.includes('const overdue = dueAssessments') &&
          dashboard.includes('const invalidDue = dueAssessments') &&
          dashboard.includes('due.daysLate') &&
          dashboard.includes('due.daysUntil'),
  'dashboard must display separate overdue, upcoming, and invalid due-date queues');
assert.ok(dashboard.includes("page:'workorders'") &&
          dashboard.includes("page:'orders'") &&
          dashboard.includes("page:'inventory'") &&
          dashboard.includes('role="link" tabindex="0"'),
  'each alert must route to its relevant work-order, order or inventory ledger');
assert.ok(dashboard.includes('${overdue.length} 张逾期 · ${dueSoon.length} 张临近交期'),
  'production KPI must expose overdue count separately from upcoming due work');
assert.ok(css.includes('.erp-operations-cockpit :where(button,a,input,select,textarea):focus-visible'),
  'actionable cockpit stages and exception queue controls must have visible keyboard focus states');
assert.ok(html.includes('legacy-app.js?v=20261022-demo-migration-v2'),
  'dashboard due-alert logic must be cache-busted in the served page');
console.log('ERP work-order due-date and actionable dashboard alert checks passed.');
