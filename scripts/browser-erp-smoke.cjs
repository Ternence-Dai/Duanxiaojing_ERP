'use strict';

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 });
    const contextScript = await page.locator('script[src*="workspace-v5-context.js"]').getAttribute('src');
    if (!contextScript || !contextScript.includes('v=20261021-mutationobserver-fix-v1')) {
      throw new Error('Workspace observer fix cache-busting URL is missing: ' + contextScript);
    }
    await page.waitForSelector('#navGroup .nav-item[data-page="dashboard"]');
    if (!(await page.locator('#content').innerText()).trim()) {
      throw new Error('ERP dashboard did not render its initial content');
    }
    const pages = ['orders', 'workorders', 'inventory', 'purchase', 'quality', 'customers', 'suppliers', 'report', 'settings'];
    for (const id of pages) {
      await page.locator('#navGroup .nav-item[data-page="' + id + '"]').click();
      await page.waitForFunction(expected => {
        const active = document.querySelector('#navGroup .nav-item.active');
        return active && active.dataset.page === expected &&
          document.querySelector('#content')?.textContent.trim().length > 20;
      }, id);
      const content = await page.locator('#content').innerText();
      if (!content.trim() || content.includes('页面不存在')) {
        throw new Error('ERP module failed to render: ' + id);
      }
      if (id !== 'dashboard' && !(await page.locator('#content > .w5-module-context').count())) {
        throw new Error('ERP module context header did not appear for: ' + id);
      }
    }

    // Exercise the real inventory form and append-only opening-balance ledger using a synthetic SKU.
    await page.locator('#navGroup .nav-item[data-page="inventory"]').click();
    await page.locator('#content .toolbar button.btn-primary').click();
    const inventoryModal = page.locator('#modalRoot .modal');
    await inventoryModal.waitFor();
    const testSku = 'PW-ERP-20261021-001';
    await inventoryModal.locator('#ff_code').fill(testSku);
    await inventoryModal.locator('#ff_name').fill('Playwright synthetic stock item');
    await inventoryModal.locator('#ff_cat').fill('纱线');
    await inventoryModal.locator('#ff_qty').fill('-1');
    await inventoryModal.locator('#ff_unit').selectOption('公斤');
    await inventoryModal.locator('#ff_loc').fill('A-01-01');
    await inventoryModal.locator('.modal-foot .btn-primary').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#toastRoot .toast')].some(el => el.textContent.includes('不能小于 0')));
    let erpCache = await page.evaluate(() => JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}'));
    if ((erpCache.inventory || []).some(row => row.code === testSku) ||
        (erpCache.stockMovements || []).some(row => row.sku === testSku)) {
      throw new Error('Negative opening stock was persisted or added to the stock ledger');
    }

    await inventoryModal.locator('#ff_qty').fill('100.125');
    await inventoryModal.locator('.modal-foot .btn-primary').click();
    await page.waitForFunction(code => {
      const db = JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}');
      const item = (db.inventory || []).find(row => row.code === code);
      const movement = (db.stockMovements || []).find(row => row.sku === code);
      return !!item && item.qty === 100.125 && !!movement &&
        movement.quantityDelta === 100.125 && movement.previousBalance === 0 &&
        movement.nextBalance === 100.125;
    }, testSku, { timeout: 10000 });
    erpCache = await page.evaluate(() => JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}'));
    const openingMovements = (erpCache.stockMovements || []).filter(row => row.sku === testSku);
    if (openingMovements.length !== 1 || !String(openingMovements[0].reference).startsWith('INV-OPEN-')) {
      throw new Error('Opening inventory quantity did not create exactly one ledger movement');
    }
    if (!(await page.locator('#tb_inventory').innerText()).includes(testSku)) {
      throw new Error('New inventory item was not rendered in the stock table after save');
    }

    // Reusing a SKU must fail without producing a second opening movement.
    await page.locator('#content .toolbar button.btn-primary').click();
    const duplicateModal = page.locator('#modalRoot .modal');
    await duplicateModal.locator('#ff_code').fill(testSku);
    await duplicateModal.locator('#ff_name').fill('Duplicate synthetic item');
    await duplicateModal.locator('#ff_cat').fill('纱线');
    await duplicateModal.locator('#ff_qty').fill('20');
    await duplicateModal.locator('#ff_unit').selectOption('公斤');
    await duplicateModal.locator('#ff_loc').fill('A-01-01');
    await duplicateModal.locator('.modal-foot .btn-primary').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#toastRoot .toast')].some(el => el.textContent.includes('已存在')));
    erpCache = await page.evaluate(() => JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}'));
    if ((erpCache.inventory || []).filter(row => row.code === testSku).length !== 1 ||
        (erpCache.stockMovements || []).filter(row => row.sku === testSku).length !== 1) {
      throw new Error('Duplicate SKU created a duplicate stock record or stock movement');
    }
    await page.locator('#modalRoot .modal-foot .btn').filter({ hasText: '取消' }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    const hamburger = page.locator('.hamburger');
    await hamburger.click();
    if (!(await page.locator('#sidebar').evaluate(el => el.classList.contains('open')))) {
      throw new Error('Mobile ERP sidebar did not open');
    }
    await page.locator('#navGroup .nav-item[data-page="inventory"]').click();
    if (await page.locator('#sidebar').evaluate(el => el.classList.contains('open'))) {
      throw new Error('Mobile ERP sidebar did not close after navigation');
    }
    if (!(await page.locator('#pageTitle').textContent()).includes('库存')) {
      throw new Error('Mobile navigation did not switch to inventory');
    }
    if (pageErrors.length) throw new Error('ERP browser runtime errors: ' + pageErrors.join(' | '));
    console.log('Zhiyun ERP browser acceptance passed: dashboard and nine business modules, contextual headers, synthetic inventory form validation, one opening stock-ledger movement, duplicate-SKU rejection, and mobile navigation passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
