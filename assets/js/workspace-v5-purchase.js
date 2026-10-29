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
      .filter(item => {
        const order = item.order;
        const hasReceiptEvidence = receipts.some(row => String(row.purchaseNo) === String(order.no));
        return eligible.has(order.status) &&
          (order.status !== "部分到货" || hasReceiptEvidence) &&
          item.remaining > 0 && item.ordered > 0;
      });
  }

  function metric(label, value, note, tone) {
    const card = node("article", "w5-receipt-metric" + (tone ? " " + tone : ""));
    card.append(node("span", "w5-receipt-metric__label", label));
    card.append(node("strong", "w5-receipt-metric__value", value));
    card.append(node("small", "w5-receipt-metric__note", note));
    return card;
  }

  function dueMetadata(order) {
    const raw = typeof order.eta === "string" ? order.eta.trim().slice(0, 10) : "";
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return { state: "unknown", delta: null, label: raw ? "交期需核对" : "未设置交期", date: "" };
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const due = new Date(Date.UTC(year, month - 1, day));
    if (due.getUTCFullYear() !== year || due.getUTCMonth() !== month - 1 || due.getUTCDate() !== day) {
      return { state: "unknown", delta: null, label: "交期需核对", date: raw };
    }
    const current = typeof today === "function" ? today() : new Date().toISOString().slice(0, 10);
    const nowMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(current);
    const todayUtc = nowMatch
      ? Date.UTC(Number(nowMatch[1]), Number(nowMatch[2]) - 1, Number(nowMatch[3]))
      : Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const delta = Math.round((due.getTime() - todayUtc) / 86400000);
    if (delta < 0) return { state: "overdue", delta, label: "逾期 " + Math.abs(delta) + " 天", date: raw };
    if (delta === 0) return { state: "today", delta, label: "今天到期", date: raw };
    if (delta <= 7) return { state: "soon", delta, label: delta + " 天后到期", date: raw };
    return { state: "scheduled", delta, label: "交期 " + raw, date: raw };
  }

  function buildSummary(data) {
    const receipts = Array.isArray(data.purchaseReceipts) ? data.purchaseReceipts : [];
    const reversals = Array.isArray(data.purchaseReceiptReversals) ? data.purchaseReceiptReversals : [];
    const open = eligibleOrders(data).map(item => {
      const matches = typeof window.getPurchaseReceiptMatches === "function"
        ? window.getPurchaseReceiptMatches(item.order) : [];
      return { ...item, matches, due: dueMetadata(item.order) };
    }).sort((a, b) => {
      const priority = item => item.due.state === "overdue" ? 0 :
        item.due.state === "today" ? 1 : item.due.state === "soon" ? 2 :
        item.due.state === "scheduled" ? 3 : 4;
      return priority(a) - priority(b) ||
        (a.due.delta == null ? Infinity : a.due.delta) - (b.due.delta == null ? Infinity : b.due.delta) ||
        String(a.order.no || "").localeCompare(String(b.order.no || ""), "zh-CN");
    });
    const todayKey = typeof today === "function" ? today() : new Date().toISOString().slice(0, 10);
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
    const blockedCount = open.filter(item => item.matches.length === 0).length;
    const overdueCount = open.filter(item => item.due.state === "overdue").length;
    const actionableCount = open.filter(item => item.matches.length > 0).length;

    const panel = node("section", "w5-receipt-dashboard");
    panel.setAttribute("aria-label", "采购收货运营概况");
    const title = node("div", "w5-receipt-dashboard__heading");
    const copy = node("div");
    copy.append(node("span", "w5-receipt-kicker", "RECEIVING OPERATIONS"));
    copy.append(node("h4", "", "收货运营概况"));
    copy.append(node("p", "", "从待收订单进入实物清点、质量核验和库存过账；各物料计量单位独立显示。"));
    title.append(copy);
    title.append(node("span", "w5-receipt-dashboard__scope", "本机业务数据 · 即时汇总"));
    panel.append(title);

    const grid = node("div", "w5-receipt-metrics");
    grid.append(metric("待收货采购单", open.length, "仅纳入可追溯的未完成订单", "accent"));
    grid.append(metric("可直接开始收货", actionableCount, "已有精确匹配库存 SKU", ""));
    grid.append(metric("交期已逾期", overdueCount, "按采购单交期与当前日期计算", overdueCount ? "warning" : ""));
    grid.append(metric("SKU 待核对", blockedCount, "无精确物料 / 供应商 / 单位匹配", blockedCount ? "warning" : ""));
    grid.append(metric("已冲销记录", reversals.length, "保留原始收货并追加反向库存流水", reversals.length ? "warning" : ""));
    panel.append(grid);

    const progress = node("section", "w5-receipt-progress w5-receipt-queue");
    const progressHead = node("div", "w5-receipt-progress__head");
    progressHead.append(node("strong", "", "收货待办队列"));
    progressHead.append(node("small", "", "优先展示逾期订单；按 SKU 精确匹配结果分流"));
    progress.append(progressHead);

    if (!open.length) {
      progress.append(node("div", "w5-receipt-progress__empty", "目前没有可继续收货的采购订单。"));
    } else {
      const controls = node("div", "w5-receipt-queue__tools");
      const filterLabel = node("label", "w5-receipt-queue__filter");
      filterLabel.append(node("span", "", "筛选待办"));
      const filter = node("select");
      filter.setAttribute("aria-label", "筛选采购收货待办");
      [
        ["all", "全部待办"],
        ["ready", "可直接收货"],
        ["blocked", "SKU 待核对"],
        ["overdue", "已逾期"]
      ].forEach(([value, label]) => {
        const option = node("option", "", label);
        option.value = value;
        filter.append(option);
      });
      filterLabel.append(filter);
      const count = node("span", "w5-receipt-queue__count", "");
      controls.append(filterLabel, count);
      progress.append(controls);

      const list = node("div", "w5-receipt-progress__list w5-receipt-queue__list");
      open.forEach(item => {
        const order = item.order;
        const percent = Math.max(0, Math.min(100, item.received / item.ordered * 100));
        const state = item.matches.length ? "ready" : "blocked";
        const row = node("article", "w5-receipt-progress__row w5-receipt-queue__row" +
          (item.due.state === "overdue" ? " is-overdue" : "") +
          (state === "blocked" ? " is-blocked" : ""));
        row.setAttribute("data-purchase-order", String(order.no || ""));
        row.setAttribute("data-queue-state", state);
        row.setAttribute("data-due-state", item.due.state);

        const info = node("div", "w5-receipt-queue__details");
        const identity = node("div", "w5-receipt-queue__identity");
        identity.append(node("strong", "", order.no || "未编号订单"));
        identity.append(node("span", "", order.mat || "物料未命名"));
        identity.append(node("small", "", "供应商 · " + (order.sup || "未填写")));
        info.append(identity);
        const amount = node("div", "w5-receipt-progress__amount",
          (item.received / 1000).toFixed(3) + " / " + (item.ordered / 1000).toFixed(3) + " " + (order.unit || ""));
        info.append(amount);

        const meta = node("div", "w5-receipt-queue__meta");
        meta.append(node("span", "w5-receipt-queue__due " + item.due.state,
          item.due.label + (item.due.date ? " · " + item.due.date : "")));
        meta.append(node("span", "w5-receipt-queue__sku " + state,
          item.matches.length ? "精确匹配 SKU " + item.matches.length + " 个" : "无精确 SKU 匹配 · 暂停收货"));
        info.append(meta);

        const track = node("div", "w5-receipt-progress__track");
        const bar = node("span", "w5-receipt-progress__bar");
        bar.style.width = percent.toFixed(1) + "%";
        track.append(bar);

        const action = node("button", "w5-receipt-queue__action",
          item.matches.length ? "开始收货" : "先核对 SKU");
        action.type = "button";
        if (item.matches.length) {
          action.setAttribute("data-receipt-open-order", String(order.no || ""));
          action.setAttribute("aria-label", "从订单 " + String(order.no || "") + " 开始收货");
        } else {
          action.disabled = true;
        }
        row.append(info, action, track);
        const rest = node("span", "w5-receipt-progress__remaining",
          "尚余 " + (item.remaining / 1000).toFixed(3) + " " + (order.unit || ""));
        row.append(rest);
        list.append(row);
      });
      if (open.length > 12) list.append(node("small", "w5-receipt-progress__more", "另有 " + (open.length - 12) + " 张待收货订单"));
      progress.append(list);

      function applyQueueFilter() {
        const mode = filter.value;
        const rows = Array.from(list.querySelectorAll("[data-purchase-order]"));
        let visible = 0;
        rows.forEach(row => {
          const state = row.getAttribute("data-queue-state");
          const dueState = row.getAttribute("data-due-state");
          const show = mode === "all" ||
            (mode === "ready" && state === "ready") ||
            (mode === "blocked" && state === "blocked") ||
            (mode === "overdue" && dueState === "overdue");
          row.hidden = !show;
          if (show) visible++;
        });
        count.textContent = "显示 " + visible + " / " + rows.length + " 张";
      }
      filter.addEventListener("change", applyQueueFilter);
      applyQueueFilter();

      progress.addEventListener("click", event => {
        const button = event.target.closest("[data-receipt-open-order]");
        if (!button || button.disabled) return;
        const form = document.getElementById("purchase-receipt-form");
        const orderSelect = document.getElementById("receipt-purchase-order");
        if (!form || !orderSelect) return;
        const orderNo = button.getAttribute("data-receipt-open-order");
        const option = Array.from(orderSelect.options).find(row => row.value === orderNo && !row.disabled);
        if (!option) {
          if (typeof toast === "function") toast("该订单当前没有可用的精确库存 SKU，请先核对物料主档。");
          return;
        }
        orderSelect.value = orderNo;
        orderSelect.dispatchEvent(new Event("change", { bubbles: true }));
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => {
          const quantity = document.getElementById("receipt-quantity");
          if (quantity && !quantity.disabled) quantity.focus({ preventScroll: true });
        }, 120);
      });
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
    const receivedAtByNo = new Map(receipts.map(receipt => [String(receipt.receiptNo), receipt.receivedAt]));
    Array.from(table.querySelectorAll("tbody tr")).forEach(row => {
      const reverseButton = row.querySelector("[data-reverse-receipt]");
      const receiptNo = reverseButton
        ? reverseButton.getAttribute("data-reverse-receipt")
        : (row.cells && row.cells[0] ? row.cells[0].textContent.trim() : "");
      row.dataset.receivedAt = receivedAtByNo.get(String(receiptNo)) || "";
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