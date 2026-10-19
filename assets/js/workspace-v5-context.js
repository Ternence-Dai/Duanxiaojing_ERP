/* Workspace V5.1 — contextual module headers and return navigation */
(function () {
  "use strict";
  const theme = document.body && document.body.dataset.workspace;
  if (!theme) return;

  const settings = {
    fuelcell: {
      title: "HYHUB ENGINEERING",
      root: () => document.getElementById("content"),
      key: () => document.querySelector("#sideNav .nav-item.active")?.dataset.id || "",
      label: () => document.querySelector("#sideNav .nav-item.active")?.innerText?.trim() || "",
      homeKey: "dashboard",
      home: () => document.querySelector('#sideNav .nav-item[data-id="dashboard"]'),
      descriptions: {
        model: "模型参数、训练状态与电堆特性分析集中在此工作区。",
        sim: "配置运行条件，比较稳态与动态仿真结果。",
        calc: "执行电化学、热管理与系统辅机工程计算。",
        lib: "检索、筛选并调用电堆模型参数与参考数据。",
        monitor: "区分模型输出、导入数据与真实台架测量状态。",
        data: "管理工况数据、结果对比与可导出的分析记录。",
        kb: "查阅燃料电池工程知识与模型说明。"
      }
    },
    health: {
      title: "HEALTH DATA SPACE",
      root: () => document.querySelector("#pages .page.active"),
      key: () => document.querySelector("#navList .nav-item.active")?.dataset.nav || "",
      label: () => document.querySelector("#navList .nav-item.active")?.innerText?.trim() || "",
      homeKey: "home",
      home: () => document.querySelector('#navList .nav-item[data-nav="home"]'),
      descriptions: {
        body: "以教育示意方式浏览人体结构，不作为医学影像或诊断依据。",
        organ: "查看器官系统知识与关联数据说明。",
        vessel: "审阅循环相关数据、单位、来源和记录时间。",
        meridian: "浏览经络知识图谱与教育内容。",
        acupoint: "按位置和名称检索穴位知识资料。",
        ai: "基于当前本地知识内容进行辅助查询与解释。",
        records: "新增、核对和追溯观察值及其数据来源。",
        report: "检查记录覆盖范围、数据质量和时间趋势。",
        me: "管理当前浏览器中的个人资料与偏好设置。"
      }
    },
    erp: {
      title: "ZHIYUN BUSINESS",
      root: () => document.getElementById("content"),
      key: () => document.querySelector("#navGroup .nav-item.active[data-page]")?.dataset.page || "",
      label: () => document.querySelector("#navGroup .nav-item.active[data-page]")?.innerText?.trim() || "",
      homeKey: "dashboard",
      home: () => document.querySelector('#navGroup .nav-item[data-page="dashboard"]'),
      descriptions: {
        orders: "围绕客户需求、订单状态、交付日期和订单明细进行管理。",
        workorders: "跟踪生产工单、工序进度和生产执行信息。",
        inventory: "核对物料、SKU、批次、库位与库存流水。",
        purchase: "维护采购需求、采购单和收货业务记录。",
        quality: "记录质量检验结果并关联业务单据。",
        customers: "维护客户档案和销售协同所需的基础信息。",
        suppliers: "维护供应商档案及采购协作资料。",
        report: "从当前业务数据汇总经营指标和趋势。",
        settings: "配置业务参数、字段、字典和数据维护选项。"
      }
    },
    study: {
      title: "ASTRONOMY LEARNING",
      root: () => document.getElementById("view"),
      key: () => window.state?.page || "",
      label: () => document.getElementById("navTitle")?.textContent?.trim() || "",
      homeKey: "home",
      home: () => document.querySelector('#tabbar button[data-tab="home"]'),
      descriptions: {
        learn: "按知识体系浏览天文学概念、对象与基础规律。",
        learnDetail: "围绕当前知识点进行阅读、互动探索和理解检查。",
        practice: "进行专项练习，记录作答过程并检查解析。",
        exam: "在限时模拟竞赛中完成题目并评估答题表现。",
        result: "复盘本次作答结果、得分分布和知识薄弱点。",
        wrong: "集中复习错题，识别反复出现的知识问题。",
        ai: "使用本地知识库辅助理解概念，重要事实需核对可靠资料。",
        news: "浏览天文知识读报与主题内容。",
        profile: "查看本机保存的学习进度和个人学习设置。"
      }
    },
    physchem: {
      title: "PHYSICAL CHEMISTRY LAB",
      root: () => document.querySelector(".mn"),
      key: () => "experiment",
      label: () => document.getElementById("et")?.textContent?.trim() || "当前实验",
      homeKey: "",
      home: () => null,
      descriptions: {}
    },
    ekpo: {
      title: "EKPO LAB OPERATIONS",
      root: () => {
        const key = keyForEkpo();
        return key ? document.getElementById("page-" + key) : null;
      },
      key: keyForEkpo,
      label: () => document.querySelector(".sidebar .nav-item.active")?.innerText?.trim()
        || document.querySelector('#mobileNav button.active')?.innerText?.trim() || "",
      homeKey: "dashboard",
      home: () => document.querySelector('#mobileNav [data-tab="dashboard"]')
        || document.querySelector('.sidebar .nav-item[data-tab="dashboard"]'),
      descriptions: {
        gases: "登记气体使用、批次和相关资源记录，保持使用信息可追溯。",
        maintenance: "维护设备保养、维修、校准及相关操作记录。",
        spareParts: "核对备件库存、出入库流水和安全库存状态。",
        testDiary: "记录测试台运行区间、操作人员和测试结果。",
        experiments: "管理实验计划、任务状态与执行记录。",
        yearly: "按年度汇总资源、设备和实验室运营数据。",
        system: "维护实验室基础配置和数据管理选项。"
      }
    }
  };

  function keyForEkpo() {
    const active = document.querySelector(".content-body > section:not(.hidden)");
    return active && active.id && active.id.startsWith("page-") ? active.id.slice(5) : "";
  }

  function addModuleHeader(root, config, key, label) {
    if (!root || root.querySelector(":scope > .w5-module-context")) return;
    if (root.querySelector(":scope > .health-intro")) return;

    const shell = document.createElement("div");
    shell.className = "w5-module-context";
    const copy = document.createElement("div");
    copy.className = "w5-module-context__copy";
    const eyebrow = document.createElement("div");
    eyebrow.className = "w5-module-context__eyebrow";
    eyebrow.textContent = config.title + " / MODULE";
    const heading = document.createElement("h2");
    heading.className = "w5-module-context__title";
    heading.textContent = label || key;
    const description = document.createElement("p");
    description.className = "w5-module-context__description";
    description.textContent = config.descriptions[key] || "当前模块的业务操作、数据查看与结果管理工作区。";
    copy.append(eyebrow, heading, description);

    const actions = document.createElement("div");
    actions.className = "w5-module-context__actions";
    const state = document.createElement("span");
    state.className = "w5-module-context__state";
    state.textContent = "当前模块";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "w5-module-context__home";
    back.textContent = "返回总览";
    back.addEventListener("click", () => {
      const target = config.home();
      if (target) target.click();
    });
    actions.append(state, back);
    shell.append(copy, actions);
    root.insertBefore(shell, root.firstChild);
  }

  function update() {
    const config = settings[theme];
    if (!config) return;
    if (theme === "physchem") {
      updateExperimentContext();
      return;
    }
    const key = config.key();
    if (!key || key === config.homeKey) return;
    const root = config.root();
    if (!root) return;
    const label = config.label() || key;
    addModuleHeader(root, config, key, label);
  }

  function updateExperimentContext() {
    const workflow = document.querySelector(".product-workflow");
    const canvas = document.getElementById("sw");
    if (!workflow || !canvas || document.querySelector(".w5-experiment-context")) return;
    const strip = document.createElement("div");
    strip.className = "w5-experiment-context";
    const text = document.createElement("div");
    text.className = "w5-experiment-context__text";
    const title = document.createElement("strong");
    title.id = "w5ExperimentTitle";
    title.textContent = document.getElementById("et")?.textContent || "当前实验";
    const brief = document.createElement("span");
    brief.id = "w5ExperimentBrief";
    brief.textContent = document.getElementById("eb2")?.textContent || "选择实验后显示实验说明";
    text.append(title, brief);
    const tags = document.createElement("div");
    tags.className = "w5-experiment-context__tags";
    const mode = document.createElement("span");
    mode.textContent = "本地交互模拟";
    const status = document.createElement("span");
    status.id = "w5ExperimentStatus";
    status.textContent = document.getElementById("bp")?.textContent?.includes("继续") ? "已暂停" : "正在运行";
    tags.append(mode, status);
    strip.append(text, tags);
    workflow.insertAdjacentElement("afterend", strip);

    const observer = new MutationObserver(() => {
      title.textContent = document.getElementById("et")?.textContent || "当前实验";
      brief.textContent = document.getElementById("eb2")?.textContent || "";
      const control = document.getElementById("bp");
      status.textContent = control?.textContent?.includes("继续") ? "已暂停" : "正在运行";
    });
    ["et", "eb2", "bp"].forEach(id => {
      const node = document.getElementById(id);
      if (node) observer.observe(node, { childList: true, characterData: true, subtree: true });
    });
  }

  function observe() {
    const config = settings[theme];
    if (!config) return;
    const watchRoot = theme === "health" ? document.getElementById("pages")
      : theme === "ekpo" ? document.querySelector(".content-body")
      : theme === "physchem" ? document.querySelector(".mn")
      : config.root();
    update();
    if (!watchRoot) return;
    const observer = new MutationObserver(() => update());
    observer.observe(watchRoot, {
      childList: true,
      subtree: true,
      attributes: theme === "health" || theme === "ekpo",
      attributeFilter: ["class"]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observe, { once: true });
  } else {
    observe();
  }
})();