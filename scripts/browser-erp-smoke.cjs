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
    const seedResponse = await page.request.get('http://127.0.0.1:4173/assets/js/demo-seed-data.js?v=20261022-demo-provenance-v2');
    const seedSource = await seedResponse.text();
    if (!seedResponse.ok() || !seedSource.includes("dataProvenance: 'demo-seed'") ||
        !seedSource.includes('示例企业账本（实际名称待配置）') ||
        seedSource.includes('兴华织带有限公司') || seedSource.includes('xinghua-textile.com') ||
        seedSource.includes('0512-8888 6666') || seedSource.includes('91320509MA1')) {
      throw new Error('ERP seed ledger still contains invented company identity or tax/contact details');
    }

    const referenceStylesheet = page.locator('link[rel="stylesheet"][href*="reference-platform-v4.css"]');
    if (await referenceStylesheet.count() !== 1) throw new Error('ERPNext operations desk stylesheet is not linked');
    const referenceCssResponse = await page.request.get(await referenceStylesheet.evaluate(node => node.href));
    const referenceCssText = await referenceCssResponse.text();
    const erpLayout = await page.locator('.app').evaluate(node => ({
      display: getComputedStyle(node).display,
      columns: getComputedStyle(node).gridTemplateColumns
    }));
    if (!referenceCssResponse.ok() || !referenceCssText.includes('--erp-ref-bg:#f0f4f6') ||
        erpLayout.display !== 'grid' || !erpLayout.columns.startsWith('252px')) {
      throw new Error('Reference ERP operations layout was not loaded/applied: ' + JSON.stringify(erpLayout));
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    const wideErp = await page.evaluate(() => {
      const main = document.querySelector('.main');
      const content = document.querySelector('#content');
      const sidebar = document.querySelector('.sidebar');
      const rect = node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      return {
        main: rect(main), content: rect(content), sidebar: rect(sidebar),
        mainMarginLeft: getComputedStyle(main).marginLeft
      };
    });
    if (wideErp.mainMarginLeft !== '0px' ||
        wideErp.main.left < wideErp.sidebar.right - 1 ||
        wideErp.main.left > wideErp.sidebar.right + 2 ||
        wideErp.content.width < wideErp.main.width * 0.88) {
      throw new Error('ERP legacy sidebar offset or narrow content width remains: ' + JSON.stringify(wideErp));
    }

    const dashboardStructure = await page.evaluate(() => {
      const root = document.querySelector('#content .erp-operations-cockpit');
      const queue = root?.querySelector('.erp-op-attention');
      const metrics = root?.querySelector('.erp-op-metrics');
      const production = root?.querySelector('.erp-op-production');
      return {
        hasDuplicateProcessBoard: !!root?.querySelector('.erp-process-board'),
        queueBeforeMetrics: !!queue && !!metrics && !!(queue.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING),
        productionPanel: !!production,
        kpiCount: root?.querySelectorAll('.erp-op-metric').length || 0
      };
    });
    if (dashboardStructure.hasDuplicateProcessBoard ||
        !dashboardStructure.queueBeforeMetrics ||
        !dashboardStructure.productionPanel ||
        dashboardStructure.kpiCount !== 4) {
      throw new Error('ERP home must lead with exception handling and production execution rather than duplicated stage cards: ' +
        JSON.stringify(dashboardStructure));
    }

    const operationsCockpit = await page.evaluate(() => {
      const root = document.querySelector('#content .erp-operations-cockpit');
      return {
        present: !!root,
        demoDisclosure: !!root?.querySelector('.erp-op-data-badge.is-demo'),
        actionQueue: root?.querySelectorAll('.erp-op-queue-item').length || 0,
        metricCount: root?.querySelectorAll('.erp-op-metric').length || 0,
        workorderPanel: !!root?.querySelector('.erp-op-production'),
        dataGovernance: !!root?.querySelector('.erp-op-guard')
      };
    });
    if (!operationsCockpit.present || !operationsCockpit.demoDisclosure ||
        operationsCockpit.metricCount !== 4 || !operationsCockpit.workorderPanel ||
        !operationsCockpit.dataGovernance) {
      throw new Error('ERP exception-first operations cockpit or synthetic-ledger disclosure is missing: ' +
        JSON.stringify(operationsCockpit));
    }

    await page.waitForSelector('.erp-operations-cockpit');
    const referenceOperationsCockpitCount = await page.locator('.erp-operations-cockpit').count();
    if (referenceOperationsCockpitCount !== 1 || !(await page.locator('.erp-op-workspace-grid').count())) {
      throw new Error('ERP reference operations cockpit is not mounted as dashboard');
    }

    const skipLink = page.locator('a.skip-link[href="#main-content"]');
    if (await skipLink.count() !== 1) throw new Error('Keyboard skip-navigation link is missing');
    await page.keyboard.press('Tab');
    const firstKeyboardTarget = await page.evaluate(() => document.activeElement?.classList.contains('skip-link'));
    if (!firstKeyboardTarget) throw new Error('Skip navigation is not the first keyboard focus target');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.getAttribute('id') === 'main-content');
    await page.waitForSelector('#navGroup .nav-item[data-page="dashboard"]');
    if (!(await page.locator('#content').innerText()).trim()) {
      throw new Error('ERP dashboard did not render its initial content');
    }
    const firstActionableException = page.locator('#content .erp-op-queue-item').first();
    if (await firstActionableException.count()) {
      await firstActionableException.click();
      await page.waitForFunction(() => {
        const active = document.querySelector('#navGroup .nav-item.active');
        return active && active.dataset.page !== 'dashboard';
      });
      if (await page.locator('.w5-module-context').count() !== 0) {
        throw new Error('Generic module-header overlay must remain removed; module hierarchy is native to the product');
      }
      await page.locator('#navGroup .nav-item[data-page="dashboard"]').click();
      await page.waitForSelector('#content .erp-op-attention');
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
      const nativeModuleHeader = page.locator('#content > .erp-native-module-context');
      if (id !== 'dashboard' && !(await nativeModuleHeader.count())) {
        throw new Error('ERP native module context header did not appear for: ' + id);
      }
      if (id !== 'dashboard' && !(await nativeModuleHeader.innerText()).includes(id === 'workorders' ? '生产工单' : ({orders:'销售订单',inventory:'物料库存',purchase:'采购管理',quality:'质量管理',customers:'客户档案',suppliers:'供应商档案',report:'报表分析',settings:'系统设置'}[id] || ''))) {
        throw new Error('ERP native module header title does not match the active ledger: ' + id);
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

    // Seed an isolated synthetic purchase order only inside this Playwright browser context.
    // Production installs remain empty until a user imports/creates real business records.
    const syntheticPurchaseNo = await page.evaluate(code => {
      const db = JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}');
      db.purchase = Array.isArray(db.purchase) ? db.purchase : [];
      const no = 'PW-PO-20261022-001';
      if (!db.purchase.some(row => row.no === no)) {
        const item = (db.inventory || []).find(row => row.code === code);
        if (item) {
          item.supplier = 'Playwright synthetic supplier';
          item.batch = 'PW-BATCH-001';
          item.loc = item.loc || 'A-01-01';
          item.inDate = item.inDate || '2026-10-22';
        }
        db.purchase.push({
          no,
          sup: item?.supplier || 'Playwright synthetic supplier',
          mat: item?.name || 'Playwright synthetic stock item',
          qty: 25,
          unit: item?.unit || '公斤',
          price: 10,
          date: '2026-10-22',
          eta: '2026-10-23',
          status: '已下单',
          buyer: 'Playwright',
          payment: '测试环境',
          note: 'Synthetic browser fixture; isolated to test localStorage.'
        });
        localStorage.setItem('textile_erp_v4_enterprise', JSON.stringify(db));
      }
      return no;
    }, testSku);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#navGroup .nav-item[data-page="dashboard"]');
    
    // Exercise the complete PO -> qualified receipt -> stock movement -> append-only reversal flow.
    await page.locator('#navGroup .nav-item[data-page="purchase"]').click();

    await page.waitForSelector('#purchase-receipt-form');
    const receivableOrders = await page.locator('#receipt-purchase-order option').evaluateAll(options =>
      options.filter(option => option.value && !option.disabled).map(option => option.value)
    );
    if (!receivableOrders.length) {
      throw new Error('No purchase order with an exact inventory SKU mapping is available for receipt acceptance');
    }
    const targetPurchaseNo = receivableOrders[0];
    await page.locator('#receipt-purchase-order').selectOption(targetPurchaseNo);
    const selectedSku = await page.locator('#receipt-sku').inputValue();
    if (!selectedSku) throw new Error('Purchase order did not resolve an exact inventory SKU');
    const beforeReceipt = await page.evaluate(({ purchaseNo, sku }) => {
      const db = JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}');
      const order = (db.purchase || []).find(row => row.no === purchaseNo);
      const item = (db.inventory || []).find(row => row.code === sku);
      return {
        order: order && { no: order.no, qty: order.qty, unit: order.unit, status: order.status,
          material: order.mat, supplier: order.sup },
        item: item && { code: item.code, qty: item.qty, name: item.name, supplier: item.supplier,
          unit: item.unit, batch: item.batch, location: item.loc }
      };
    }, { purchaseNo: targetPurchaseNo, sku: selectedSku });
    if (!beforeReceipt.order || !beforeReceipt.item ||
        beforeReceipt.order.material !== beforeReceipt.item.name ||
        beforeReceipt.order.supplier !== beforeReceipt.item.supplier ||
        beforeReceipt.order.unit !== beforeReceipt.item.unit) {
      throw new Error('Purchase receipt fixture does not satisfy exact material, supplier and unit identity');
    }
    const receiptQty = 1.125;
    const outstanding = Number(beforeReceipt.order.qty);
    if (!(receiptQty > 0 && receiptQty < outstanding)) {
      throw new Error('Synthetic receipt quantity must be positive and less than the outstanding order quantity');
    }

    // An over-receipt must be rejected before creating any receipt, stock movement or balance change.
    const beforeOverReceipt = await page.evaluate(({ purchaseNo, sku }) => {
      const db = JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}');
      return {
        receiptCount: (db.purchaseReceipts || []).length,
        movementCount: (db.stockMovements || []).length,
        stock: (db.inventory || []).find(row => row.code === sku)?.qty,
        status: (db.purchase || []).find(row => row.no === purchaseNo)?.status
      };
    }, { purchaseNo: targetPurchaseNo, sku: selectedSku });
    const quantityInput = page.locator('#receipt-quantity');
    const clientMaximum = Number(await quantityInput.getAttribute('max'));
    if (clientMaximum !== outstanding) {
      throw new Error('Receipt form must expose the exact outstanding purchase quantity as its client-side maximum: ' +
        JSON.stringify({ clientMaximum, outstanding }));
    }
    // Bypass the UI guard deliberately so the domain layer is also tested as the authoritative boundary.
    await quantityInput.evaluate(el => el.removeAttribute('max'));
    await quantityInput.fill((outstanding + 0.001).toFixed(3));
    await page.locator('#receipt-receiver').fill('Playwright rejected over-receipt operator');
    await page.locator('#receipt-inspector').fill('Playwright rejected over-receipt inspector');
    await page.locator('#receipt-inspection').selectOption('合格');
    await page.locator('#receipt-note').fill('Synthetic over-receipt rejection; no real stock movement');
    await page.locator('#receipt-submit').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#toastRoot .toast')].some(el =>
        el.textContent.includes('receipt quantity exceeds the outstanding purchase order quantity')));
    const afterOverReceipt = await page.evaluate(({ purchaseNo, sku }) => {
      const db = JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}');
      return {
        receiptCount: (db.purchaseReceipts || []).length,
        movementCount: (db.stockMovements || []).length,
        stock: (db.inventory || []).find(row => row.code === sku)?.qty,
        status: (db.purchase || []).find(row => row.no === purchaseNo)?.status
      };
    }, { purchaseNo: targetPurchaseNo, sku: selectedSku });
    if (JSON.stringify(afterOverReceipt) !== JSON.stringify(beforeOverReceipt)) {
      throw new Error('Rejected over-receipt changed the receipt ledger, stock movements, inventory balance or purchase status: ' +
        JSON.stringify({ before: beforeOverReceipt, after: afterOverReceipt }));
    }

    // Continue with a qualified partial receipt after the rejected attempt.
    await page.locator('#receipt-quantity').fill(String(receiptQty));
    await page.locator('#receipt-receiver').fill('Playwright receiving operator');
    await page.locator('#receipt-inspector').fill('Playwright quality inspector');
    await page.locator('#receipt-inspection').selectOption('合格');
    await page.locator('#receipt-note').fill('Synthetic browser acceptance; not a real-world receipt');
    await page.locator('#receipt-submit').click();
    await page.waitForFunction(({ purchaseNo, sku, quantity, priorBalance }) => {
      const db = JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}');
      const receipt = (db.purchaseReceipts || []).find(row =>
        row.purchaseNo === purchaseNo && row.receivedBy === 'Playwright receiving operator');
      const item = (db.inventory || []).find(row => row.code === sku);
      const order = (db.purchase || []).find(row => row.no === purchaseNo);
      const movement = receipt && (db.stockMovements || []).find(row =>
        row.reference === receipt.stockMovementReference);
      return !!receipt && !!item && !!order && !!movement &&
        receipt.quantity === quantity && receipt.inspectionResult === '合格' &&
        movement.quantityDelta === quantity && movement.previousBalance === priorBalance &&
        movement.nextBalance === priorBalance + quantity && item.qty === priorBalance + quantity &&
        order.status === '部分到货';
    }, {
      purchaseNo: targetPurchaseNo, sku: selectedSku, quantity: receiptQty,
      priorBalance: Number(beforeReceipt.item.qty)
    }, { timeout: 15000 });
    let receiptState = await page.evaluate(({ purchaseNo, sku }) => {
      const db = JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}');
      const receipt = (db.purchaseReceipts || []).find(row =>
        row.purchaseNo === purchaseNo && row.sku === sku &&
        row.receivedBy === 'Playwright receiving operator');
      const item = (db.inventory || []).find(row => row.code === sku);
      return { receipt, stock: item?.qty };
    }, { purchaseNo: targetPurchaseNo, sku: selectedSku });
    if (!receiptState.receipt || receiptState.receipt.quantity !== receiptQty ||
        receiptState.stock !== Number(beforeReceipt.item.qty) + receiptQty) {
      throw new Error('Qualified receipt did not commit the receipt record and inventory ledger as one operation');
    }
    const receiptNo = receiptState.receipt.receiptNo;
    const reversalButton = page.locator('[data-reverse-receipt="' + receiptNo + '"]');
    await reversalButton.waitFor({ state: 'visible', timeout: 10000 });
    let dialogStep = 0;
    page.on('dialog', async dialog => {
      dialogStep += 1;
      if (dialog.type() === 'prompt' && dialogStep === 1) {
        await dialog.accept('Synthetic browser acceptance reversal');
      } else if (dialog.type() === 'prompt' && dialogStep === 2) {
        await dialog.accept('Playwright warehouse supervisor');
      } else if (dialog.type() === 'confirm') {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
    await reversalButton.click();
    await page.waitForFunction(({ purchaseNo, sku, receiptNo, priorBalance, quantity }) => {
      const db = JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}');
      const receipt = (db.purchaseReceipts || []).find(row => row.receiptNo === receiptNo);
      const reversal = (db.purchaseReceiptReversals || []).find(row => row.receiptNo === receiptNo);
      const item = (db.inventory || []).find(row => row.code === sku);
      const order = (db.purchase || []).find(row => row.no === purchaseNo);
      const movement = reversal && (db.stockMovements || []).find(row =>
        row.reference === reversal.stockMovementReference);
      return !!receipt && !!reversal && !!item && !!order && !!movement &&
        reversal.quantity === quantity && movement.quantityDelta === -quantity &&
        movement.previousBalance === priorBalance + quantity && movement.nextBalance === priorBalance &&
        item.qty === priorBalance && order.status === receipt.purchaseStatusBefore;
    }, {
      purchaseNo: targetPurchaseNo, sku: selectedSku, receiptNo,
      priorBalance: Number(beforeReceipt.item.qty), quantity: receiptQty
    }, { timeout: 15000 });
    receiptState = await page.evaluate(({ receiptNo, sku }) => {
      const db = JSON.parse(localStorage.getItem('textile_erp_v4_enterprise') || '{}');
      const reversal = (db.purchaseReceiptReversals || []).find(row => row.receiptNo === receiptNo);
      return {
        receipt: (db.purchaseReceipts || []).find(row => row.receiptNo === receiptNo),
        reversal,
        movements: (db.stockMovements || []).filter(row =>
          row.reference === receiptNo || row.reference === reversal?.stockMovementReference),
        stock: (db.inventory || []).find(row => row.code === sku)?.qty
      };
    }, { receiptNo, sku: selectedSku });
    if (!receiptState.receipt || !receiptState.reversal ||
        receiptState.movements.length !== 2 ||
        receiptState.stock !== Number(beforeReceipt.item.qty)) {
      throw new Error('Receipt reversal must append one negative stock movement and preserve the original receipt');
    }
    if (await page.locator('[data-reverse-receipt="' + receiptNo + '"]').count() !== 0 ||
        !(await page.locator('.w5-receipt-reversal-log').innerText()).includes('Synthetic browser acceptance reversal')) {
      throw new Error('Reversed receipt must be immutable in history and visible in the reversal audit log');
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
    console.log('Zhiyun ERP browser acceptance passed: dashboard and nine business modules, contextual headers, opening inventory ledger and duplicate-SKU rejection, purchase order to qualified receipt to stock movement to append-only reversal with full identity and balance restoration, and mobile navigation passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
