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
    console.log('Zhiyun ERP browser acceptance passed: dashboard and nine business modules rendered, contextual module headers appeared, and mobile sidebar navigation passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
