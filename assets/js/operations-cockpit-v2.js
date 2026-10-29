/* Zhiyun ERP operations cockpit v2 · exception-first product workspace.
   Uses existing local ledger/domain calculations. Demo-seed values stay disclosed as synthetic. */
(function () {
  'use strict';
  function text(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
    });
  }
  function metric(label,value,note,tone,page) {
    const navAttrs = page ?
      ' role="button" tabindex="0" onclick="go(' + jsArg(page) + ')" ' +
      'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();go(' + jsArg(page) + ');}"' : '';
    return '<article class="kpi erp-op-metric erp-op-metric--' + tone + (page ? ' is-clickable' : '') + '"' + navAttrs + '>' +
      '<div class="kpi-label">' + label + '</div><div class="kpi-value">' + value +
      '</div><div class="kpi-foot">' + note + '</div></article>';
  }
  window.renderOperationsCockpit = function () {
    const validOrders = DB.orders.filter(row => row.status !== '已取消');
    const pendingOrders = DB.orders.filter(row => row.status === '待确认');
    const totalAmount = validOrders.reduce((sum,row) => sum + (Number(row.qty)||0)*(Number(row.price)||0),0);
    const inProduction = DB.workorders.filter(row => row.status === '进行中');
    const stockValue = DB.inventory.reduce((sum,row) => sum + (typeof inventoryValueCents === 'function'
      ? inventoryValueCents(row)
      : Math.round((Number(row.qty) || 0) * (Number(row.price) || 0) * 100)), 0) / 100;
    const lowStock = DB.inventory.filter(row => DB.settings.lowStockWarn && Number(row.safe)>0 && Number(row.qty)<Number(row.safe));
    const doneOrders = DB.orders.filter(row => row.status === '已完成').length;
    const completionRate = validOrders.length ? (doneOrders / validOrders.length * 100).toFixed(1) : '0.0';
    const qcTotal = DB.quality.length;
    const qcFirst = DB.quality.filter(row => row.grade === '特级品' || row.grade === '一等品').length;
    const firstRate = qcTotal ? (qcFirst / qcTotal * 100).toFixed(1) : '0.0';
    const configuredWarnDays = Number(DB.settings.dueWarnDays);
    const warnDays = Number.isSafeInteger(configuredWarnDays) && configuredWarnDays >= 0 ? configuredWarnDays : 3;
    const today = new Date();
    const assessed = DB.workorders.map(workOrder => ({workOrder:workOrder,due:getWorkOrderDueStatus(workOrder,today,warnDays)}));
    const overdue = assessed.filter(row => row.due.status === 'overdue').sort((a,b)=>b.due.daysLate-a.due.daysLate);
    const dueSoon = assessed.filter(row => row.due.status === 'due-soon').sort((a,b)=>a.due.daysUntil-b.due.daysUntil);
    const invalidDue = assessed.filter(row => row.due.status === 'invalid');
    const provenance = DB.settings && DB.settings.dataProvenance;
    const isDemo = provenance === 'demo-seed';
    const isEmpty = provenance === 'empty-ledger';
    const dataBadge = isDemo ? '<span class="erp-op-data-badge is-demo">示例账本 · 非真实企业数据</span>' :
      isEmpty ? '<span class="erp-op-data-badge is-demo">空白演示账本 · 尚未录入真实企业数据</span>' :
      '<span class="erp-op-data-badge is-local">本机账本 · 待业务核验</span>';

    const attention = [];
    overdue.slice(0,4).forEach(row => attention.push({level:'danger',kind:'交期逾期',title:'工单 '+row.workOrder.no+' 已逾期 '+row.due.daysLate+' 天',
      detail:'计划交期 '+row.workOrder.due+' · '+row.workOrder.product+' · 完成 '+fmtN(row.workOrder.done)+' / '+fmtN(row.workOrder.plan)+' '+row.workOrder.unit,page:'workorders',id:row.workOrder.no}));
    invalidDue.slice(0,3).forEach(row => attention.push({level:'warning',kind:'数据待核验',title:'工单 '+row.workOrder.no+' 交期日期异常',
      detail:'当前值：'+String(row.workOrder.due||'未填写')+' · 请在生产工单中核对',page:'workorders',id:row.workOrder.no}));
    dueSoon.slice(0,3).forEach(row => attention.push({level:'warning',kind:'交期临近',title:'工单 '+row.workOrder.no+(row.due.daysUntil===0?' 今天到期':' '+row.due.daysUntil+' 天后到期'),
      detail:'计划交期 '+row.workOrder.due+' · '+row.workOrder.product,page:'workorders',id:row.workOrder.no}));
    pendingOrders.slice(0,3).forEach(row => attention.push({level:'info',kind:'待订单确认',title:'订单 '+row.no+' 待确认',
      detail:(row.cust||'未关联客户')+' · '+row.product+' · '+fmtN(row.qty)+' '+row.unit,page:'orders',id:row.no}));
    lowStock.slice(0,4).forEach(row => attention.push({level:'danger',kind:'安全库存',title:(row.name||row.code)+' 低于安全库存',
      detail:'现存 '+fmtN(row.qty)+' '+row.unit+' · 安全线 '+fmtN(row.safe)+' '+row.unit+' · '+(row.loc||'库位未填'),page:'inventory',id:row.code}));
    const attentionHtml = attention.length ? attention.slice(0,10).map(item =>
      '<button type="button" class="erp-op-queue-item is-'+item.level+'" onclick="'+(item.id ? 'jumpTo('+jsArg(item.page)+','+jsArg(item.id)+')' : 'go('+jsArg(item.page)+')')+'">' +
      '<span class="erp-op-queue-level">'+item.kind+'</span><strong>'+text(item.title)+'</strong><small>'+text(item.detail)+'</small><i>进入处理 ↗</i></button>'
    ).join('') : '<div class="erp-op-empty"><strong>当前没有识别到待办异常</strong><span>这不等于现场状态已核实；请持续维护交期、库存与质检记录。</span></div>';

    const processCounts = {};
    DB.workorders.forEach(row => { const key = row.process || '未分配工序'; processCounts[key] = (processCounts[key]||0)+1; });
    const processTotal = DB.workorders.length;
    const processHtml = Object.entries(processCounts).sort((a,b)=>b[1]-a[1]).slice(0,8).map((entry,index) => {
      const percent = processTotal ? entry[1]/processTotal*100 : 0;
      return '<div class="erp-op-process-row"><span>'+text(entry[0])+'</span><div><i style="width:'+percent.toFixed(1)+'%"></i></div><b>'+entry[1]+' 单</b></div>';
    }).join('') || '<div class="erp-op-empty">尚无生产工单分布</div>';

    const activeHtml = inProduction.slice(0,6).map(row => {
      const percent = Math.max(0,Math.min(100,Math.round((Number(row.done)||0)/Math.max(Number(row.plan)||1,1)*100)));
      return '<article class="erp-op-workorder is-clickable" role="button" tabindex="0" onclick="jumpTo('+jsArg('workorders')+','+jsArg(row.no)+')" ' +
        'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();jumpTo('+jsArg('workorders')+','+jsArg(row.no)+');}"><div><strong>'+text(row.no)+' · '+text(row.product)+'</strong><small>'+text(row.process||'工序未分配')+' · 交期 '+text(row.due||'未设置')+'</small></div>' +
        '<div class="erp-op-progress"><i style="width:'+percent+'%"></i></div><b>'+percent+'%</b></article>';
    }).join('') || '<div class="erp-op-empty">当前没有标记为进行中的工单。请在生产工单台账维护执行状态。</div>';

    const trend = buildOrderDateTrend(validOrders,7);
    const peak = Math.max(1,...trend.map(row=>Number(row.totalAmount)||0));
    const trendHtml = trend.map(row => {
      const height = Math.max(3,Math.round((Number(row.totalAmount)||0)/peak*100));
      return '<div class="erp-op-trend-bar" title="'+text(row.date)+' · '+fmtM0(row.totalAmount)+' · '+row.orderCount+' 张订单">' +
        '<span>'+((row.totalAmount||0)>=1000?(row.totalAmount/1000).toFixed(1)+'k':fmtN(Math.round(row.totalAmount||0)))+'</span>' +
        '<i style="height:'+height+'%"></i><small>'+text(row.label)+'</small></div>';
    }).join('') || '<div class="erp-op-empty">暂无可绘制的订单日期数据</div>';

    return '<section class="erp-operations-cockpit" aria-label="企业经营与订单履约驾驶舱">' +
      '<header class="erp-op-header"><div><span class="eyebrow">OPERATIONS / CONTROL TOWER</span>' +
      '<h2>运营驾驶舱</h2><p>'+text(DB.settings.company||'企业账本')+' · 从订单、生产、库存到质量的履约状态与例外处理</p></div>' +
      '<div class="erp-op-header-side">'+dataBadge+'<small>汇总自当前本机账本 · 非外部实时数据</small></div></header>' +
      '<div class="erp-op-shell"><div class="erp-op-main">' +

      '<div class="erp-op-command"><div><span class="eyebrow">QUICK ACTIONS</span><strong>新建业务 / 更新台账</strong><small>操作写入本机账本；导出与本地文件绑定由顶部工具栏管理。</small></div>' +
      '<nav><button class="btn btn-primary" onclick="go(&#39;orders&#39;);setTimeout(()=>openForm(&#39;orders&#39;),80)">＋ 新建订单</button>' +
      '<button class="btn" onclick="go(&#39;workorders&#39;)">生产工单</button><button class="btn" onclick="go(&#39;inventory&#39;)">物料库存</button>' +
      '<button class="btn" onclick="go(&#39;purchase&#39;)">采购协同</button></nav></div>' +

      '<div class="erp-op-workspace-grid"><section class="erp-op-panel erp-op-attention"><div class="erp-op-panel-head"><div>' +
      '<span class="eyebrow">ACTION QUEUE</span><h3>异常与待办队列</h3><p>优先处理逾期交期、库存风险、待确认订单与数据异常。</p></div>' +
      '<span class="erp-op-count">'+attention.length+' 项</span></div><div class="erp-op-queue">'+attentionHtml+'</div></section>' +

      '<section class="erp-op-panel erp-op-production"><div class="erp-op-panel-head"><div><span class="eyebrow">SHOPFLOOR EXECUTION</span>' +
      '<h3>生产执行进度</h3><p>在产工单进度来自当前工单计划量和完成量。</p></div><button onclick="go(&#39;workorders&#39;)">全部工单 ↗</button></div>' +
      '<div class="erp-op-workorders">'+activeHtml+'</div><div class="erp-op-subhead"><span>工序分布</span><button onclick="go(&#39;workorders&#39;)">打开工单台账</button></div>' +
      '<div class="erp-op-process">'+processHtml+'</div></section></div>' +

      '<section class="erp-op-metrics kpi-grid" aria-label="经营指标">' +
      metric('订单金额汇总',fmtM2(totalAmount),'有效订单 · '+validOrders.length+' 张 · '+(isDemo?'示例数据':'本机数据'),'blue','orders') +
      metric('在产工单',inProduction.length,'逾期 '+overdue.length+' · 临期 '+dueSoon.length,'violet','workorders') +
      metric('库存账面价值',fmtM2(stockValue),'低于安全库存 '+lowStock.length+' 项','amber','inventory') +
      metric('优等品率',firstRate+'%','检验 '+qcTotal+' 条 · 订单完成率 '+completionRate+'%','green','quality') +
      '</section>' +

      '<div class="erp-op-analytics"><section class="erp-op-panel"><div class="erp-op-panel-head"><div><span class="eyebrow">SALES ORDER VALUE</span>' +
      '<h3>订单金额趋势</h3><p>最近 7 个有订单日期 · 排除已取消订单</p></div><span class="erp-op-count">本机账本</span></div>' +
      '<div class="erp-op-trend">'+(trend.length?trendHtml:'<div class="erp-op-empty">无有效订单日期</div>')+'</div></section>' +
      '<section class="erp-op-panel erp-op-guard"><div class="eyebrow">DATA GOVERNANCE</div><h3>账本边界与数据完整性</h3>' +
      '<ul><li>'+(isDemo?'当前仍使用程序内置演示样本；订单、客户、供应商、库存、费用均非真实企业记录。':'当前使用本机账本；导入数据仍需业务人员确认来源与口径。')+'</li>' +
      '<li>指标由销售订单、生产工单、库存和质检台账计算；未接入外部实时 ERP 数据。</li>' +
      '<li>库存账面金额不等于财务总账，未经核验不得用于结算或对外报表。</li></ul>' +
      '<div class="erp-op-guard-actions"><button onclick="go(&#39;settings&#39;)">数据 / 公司设置</button><button onclick="go(&#39;report&#39;)">经营报表 ↗</button></div></section></div>' +
      '</div>' +
      '<aside class="erp-op-inspector" aria-label="业务上下文与快捷操作">' +
        '<section class="erp-op-inspector-card"><span class="eyebrow">WORKSPACE CONTEXT</span><h3>当前业务上下文</h3>' +
          '<div class="erp-op-inspector-status">'+dataBadge+'</div>' +
          '<p>'+(isDemo?'当前为内置示例账本。所有业务金额、客户、物料和库存仅供功能演示。':isEmpty?'当前为空白账本；尚未录入经核验的企业订单、客户、库存或生产记录。':'当前为本机账本；请核对原始凭证、业务责任人与更新时间。')+'</p>' +
          '<div class="erp-op-inspector-stats"><div><small>待确认订单</small><strong>'+pendingOrders.length+'</strong></div><div><small>逾期工单</small><strong>'+overdue.length+'</strong></div><div><small>库存预警</small><strong>'+lowStock.length+'</strong></div><div><small>质检记录</small><strong>'+qcTotal+'</strong></div></div>' +
        '</section>' +
        '<section class="erp-op-inspector-card"><span class="eyebrow">QUICK ACTIONS</span><h3>快速发起业务</h3>' +
          '<button type="button" class="erp-op-inspector-action" onclick="go(\'orders\');setTimeout(()=>openForm(\'orders\'),80)">＋ 新建销售订单 <b>↗</b></button>' +
          '<button type="button" class="erp-op-inspector-action" onclick="go(\'workorders\')">生产工单 <b>↗</b></button>' +
          '<button type="button" class="erp-op-inspector-action" onclick="go(\'inventory\')">物料与库存 <b>↗</b></button>' +
          '<button type="button" class="erp-op-inspector-action" onclick="go(\'quality\')">质量检验 <b>↗</b></button>' +
          '<button type="button" class="erp-op-inspector-action" onclick="go(\'purchase\')">采购协同 <b>↗</b></button>' +
        '</section>' +
        '<section class="erp-op-inspector-card erp-op-inspector-card--note"><span class="eyebrow">DATA GUARD</span><h3>经营数据边界</h3>' +
          '<ul><li>汇总只读取当前本机账本。</li><li>空白字段不推断为零或正常。</li><li>库存账面金额不等于财务总账。</li><li>示例账本不得用于实际经营决策。</li></ul>' +
          '<button type="button" class="erp-op-inspector-link" onclick="go(\'settings\')">查看数据来源与备份 ↗</button>' +
        '</section>' +
      '</aside></div>' +
      '</section>';
  };

  if (typeof window.go === 'function') window.go('dashboard');
})();