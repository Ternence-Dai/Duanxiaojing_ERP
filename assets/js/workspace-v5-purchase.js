/* Workspace V5.2 — purchase receiving operations cockpit */
(function () {
  "use strict";
  function db() { return typeof DB !== "undefined" && DB ? DB : null; }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function milli(value) {
    return Math.round(number(value) * 1000);
  }
  function eligibleOrders(data) {
    const receipts = Array.isArray(data.purchaseReceipts) ? data.purchaseReceipts : [];
    const reversed = new Set((Array.isArray(data.purchaseReceiptReversals) ? data.purchaseReceiptReversals : [])
      .map(row => String(row.receiptNo)));
    const eligible = new Set(["已下单", "在途", "部分到货"]);
    return (Array.isArray(data.purchase) ? data.purchase : [])
      .map(order => {
        const ordered = milli(order.qty);
        const received = receipts
          .filter(row => String(row.purchaseNo) === String(order.no) && !reversed.has(String(row.receiptNo)))
          .reduce((sum, row) => sum + milli(row.quantity), 0);
        return { order, ordered, received, remaining: Math.max(0, ordered - received) };
      })
      .filter(item => eligible.has(item.order.status) && item.remaining > 0 && item.ordered > 0);
  }
  function metric(label, value, note, tone) {
    const card = node("article", "w5-receipt-metric" + (tone ? " " + tone : ""));
    card.append(node("span", "w5-receipt-metric__label", label));
    card.append(node("strong", "w5-receipt-metric__value", value));
    card.append(node("small", "w5-receipt-metric__note", note));
    return card;
  }
  function buildSummary(data) {
    const receipts = Array.isArray(data.purchaseReceipts) ? data.purchaseReceipts : [];
    const open = eligibleOrders(data);
    const today = new Date();
    const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
    const reversals = Array.isArray(data.purchaseReceiptReversals) ? data.purchaseReceiptReversals : [];
    const todayCount = receipts.filter(row => {
      const date = new Date(row.receivedAt);
      if (!Number.isFinite(date.getTime())) return false;
      const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
      return key === todayKey;
    }).length;
    const legacyCount = (Array.isArray(data.purchase) ? data.purchase : []).filter(order =>
      ["部分到货", "已到货", "检验中"].includes(order.status) &&
      !receipts.some(row => String(row.purchaseNo) === String(order.no))
    ).length;

    const panel = node("section", "w5-receipt-dashboard");
    panel.setAttribute("aria-label", "采购收货运营概况");
    const title = node("div", "w5-receipt-dashboard__heading");
    const copy = node("div");
    copy.append(node("span", "w5-receipt-kicker", "RECEIVING OPERATIONS"));
    copy.append(node("h4", "", "收货运营概况"));
    copy.append(node("p", "", "按订单分别查看到货进度；不同物料单位不合并计算。"));
    title.append(copy);
    title.append(node("span", "w5-receipt-dashboard__scope", "本机业务数据 · 即时汇总"));
    panel.append(title);

    const grid = node("div", "w5-receipt-metrics");
    grid.append(metric("待收货采购单", open.length, "按已冲销记录重新计算未收数量", "accent"));
    grid.append(metric("收货原始记录", receipts.length, "保留完整原始入库凭证", ""));
    grid.append(metric("已冲销记录", reversals.length, "采用独立负向库存流水", reversals.length ? "warning" : ""));
    grid.append(metric("今日收货单", todayCount, "按收货时间统计", ""));
    grid.append(metric("历史待核对", legacyCount, "旧状态缺少可追溯收货记录", legacyCount ? "warning" : ""));
    panel.append(grid);

    const progress = node("section", "w5-receipt-progress");
    const progressHead = node("div", "w5-receipt-progress__head");
    progressHead.append(node("strong", "", "采购订单到货进度"));
    progressHead.append(node("small", "", "按订单与单位独立计算"));
    progress.append(progressHead);
    if (!open.length) {
      progress.append(node("div", "w5-receipt-progress__empty", "目前没有可继续收货的采购订单。"));
    } else {
      const list = node("div", "w5-receipt-progress__list");
      open.slice(0, 6).forEach(item => {
        const order = item.order;
        const percent = Math.max(0, Math.min(100, item.received / item.ordered * 100));
        const row = node("article", "w5-receipt-progress__row");
        const info = node("div", "w5-receipt-progress__info");
        const identity = node("div", "w5-receipt-progress__identity");
        identity.append(node("strong", "", order.no || "未编号订单"));
        identity.append(node("span", "", order.mat || "物料未命名"));
        info.append(identity);
        const amount = node("div", "w5-receipt-progress__amount",
          (item.received / 1000).toFixed(3) + " / " + (item.ordered / 1000).toFixed(3) + " " + (order.unit || ""));
        info.append(amount);
        const track = node("div", "w5-receipt-progress__track");
        const bar = node("span", "w5-receipt-progress__bar");
        bar.style.width = percent.toFixed(1) + "%";
        track.append(bar);
        row.append(info, track);
        const rest = node("span", "w5-receipt-progress__remaining",
          "剩余 " + (item.remaining / 1000).toFixed(3) + " " + (order.unit || ""));
        row.append(rest);
        list.append(row);
      });
      if (open.length > 6) list.append(node("small", "w5-receipt-progress__more", "另有 " + (open.length - 6) + " 张待收货订单"));
      progress.append(list);
    }
    panel.append(progress);
    return panel;
  }

  function groupForm(root) {
    const form = root.querySelector("#purchase-receipt-form");
    const grid = form && form.querySelector(".receipt-form-grid");
    if (!grid || grid.dataset.w5Grouped === "true") return;
    const groups = [
      {
        title: "建立收货单据",
        description: "先选择采购订单和对应 SKU，再填写本次实收数量。",
        fields: ["receipt-purchase-order", "receipt-sku", "receipt-quantity"]
      },
      {
        title: "核验实物与质量",
        description: "批次、库位来自库存主档；经办人和检验人请填写实际责任人。",
        fields: ["receipt-batch", "receipt-location", "receipt-time", "receipt-receiver", "receipt-inspector", "receipt-inspection"]
      }
    ];
    const wrapper = node("div", "w5-receipt-steps");
    groups.forEach((group, index) => {
      const card = node("section", "w5-receipt-step");
      const heading = node("div", "w5-receipt-step__heading");
      heading.append(node("span", "w5-receipt-step__number", String(index + 1).padStart(2, "0")));
      const title = node("div");
      title.append(node("strong", "", group.title));
      title.append(node("small", "", group.description));
      heading.append(title);
      card.append(heading);
      const fields = node("div", "w5-receipt-step__fields");
      group.fields.forEach(id => {
        const input = form.querySelector("#" + id);
        const label = input && input.closest("label");
        if (label) fields.append(label);
      });
      card.append(fields);
      wrapper.append(card);
    });
    const note = form.querySelector(".receipt-note-label");
    const submit = form.querySelector(".receipt-submit-row");
    if (note || submit) {
      const card = node("section", "w5-receipt-step w5-receipt-step--post");
      const heading = node("div", "w5-receipt-step__heading");
      heading.append(node("span", "w5-receipt-step__number", "03"));
      const title = node("div");
      title.append(node("strong", "", "复核并过账"));
      title.append(node("small", "", "提交前再次核对数量、质检结论和单据备注。"));
      heading.append(title);
      card.append(heading);
      if (note) card.append(note);
      if (submit) card.append(submit);
      wrapper.append(card);
    }
    grid.replaceWith(wrapper);
    grid.dataset.w5Grouped = "true";
  }

  function buildHistoryToolbar(root) {
    const history = root.querySelector(".purchase-receipt-history");
    const table = history && history.querySelector("table");
    const head = history && history.querySelector(".card-head");
    if (!history || !table || !head) return;
    if (table.dataset.w5ReverseBound !== "true") {
      table.dataset.w5ReverseBound = "true";
      table.addEventListener("click", event => {
        const button = event.target.closest("[data-reverse-receipt]");
        if (!button || button.disabled) return;
        event.preventDefault();
        const handler = window.reversePurchaseReceipt;
        if (typeof handler === "function") handler(button.getAttribute("data-reverse-receipt"));
      });
    }
    if (history.querySelector(".w5-receipt-history-tools")) return;
    const data = db();
    const receipts = data && Array.isArray(data.purchaseReceipts) ? data.purchaseReceipts : [];
    Array.from(table.querySelectorAll("tbody tr")).forEach((row, index) => {
      row.dataset.receivedAt = receipts[index] ? receipts[index].receivedAt : "";
    });

    const tools = node("div", "w5-receipt-history-tools");
    const searchWrap = node("label", "w5-receipt-history-search");
    searchWrap.append(node("span", "", "检索流水"));
    const search = node("input");
    search.type = "search";
    search.placeholder = "收货单号、采购单、物料、SKU、批次…";
    search.setAttribute("aria-label", "搜索采购收货流水");
    searchWrap.append(search);
    const filterWrap = node("label", "w5-receipt-history-filter");
    filterWrap.append(node("span", "", "时间范围"));
    const filter = node("select");
    filter.setAttribute("aria-label", "筛选收货时间");
    [["all", "全部时间"], ["today", "今天"], ["7d", "最近 7 天"]].forEach(([value, label]) => {
      const option = node("option", "", label);
      option.value = value;
      filter.append(option);
    });
    filterWrap.append(filter);
    const count = node("span", "w5-receipt-history-count", "");
    tools.append(searchWrap, filterWrap, count);
    head.insertAdjacentElement("afterend", tools);

    function apply() {
      const query = search.value.trim().toLocaleLowerCase();
      const mode = filter.value;
      const now = Date.now();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const todayStart = start.getTime();
      let visible = 0;
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      rows.forEach(row => {
        const matchesText = !query || row.textContent.toLocaleLowerCase().includes(query);
        const time = Date.parse(row.dataset.receivedAt || "");
        const validTime = Number.isFinite(time);
        const matchesTime = mode === "all" ||
          (mode === "today" && validTime && time >= todayStart && time <= now) ||
          (mode === "7d" && validTime && time >= now - 7 * 86400000 && time <= now);
        row.hidden = !(matchesText && matchesTime);
        if (!row.hidden) visible++;
      });
      count.textContent = "显示 " + visible + " / " + rows.length + " 条";
    }
    search.addEventListener("input", apply);
    filter.addEventListener("change", apply);
    apply();
  }

  function enhance(root) {
    if (!root || root.dataset.w5ReceiptEnhanced === "true") return;
    const data = db();
    if (!data) return;
    root.dataset.w5ReceiptEnhanced = "true";
    const summary = buildSummary(data);
    const form = root.querySelector("#purchase-receipt-form");
    if (form) root.insertBefore(summary, form);
    groupForm(root);
    buildHistoryToolbar(root);
  }

  function scan() {
    const root = document.querySelector(".purchase-receipt-workspace");
    if (root) enhance(root);
  }
  function start() {
    scan();
    const target = document.getElementById("content") || document.querySelector(".main");
    if (!target) return;
    const observer = new MutationObserver(scan);
    observer.observe(target, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();