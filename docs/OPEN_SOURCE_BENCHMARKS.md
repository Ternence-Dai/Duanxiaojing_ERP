# 开源项目深度对标：织云纺织 ERP

> 对标日期：2026-10-19。目标是借鉴成熟 ERP/MES 的流程和数据语义，而不是只增加管理看板上的图表。

## 1. 上游项目与可借鉴点

### ERPNext — 订单、生产、库存与资产闭环
- 仓库：[frappe/erpnext](https://github.com/frappe/erpnext)
- 关键实现：[Work Order](https://github.com/frappe/erpnext/blob/develop/erpnext/manufacturing/doctype/work_order/work_order.py)、[Job Card](https://github.com/frappe/erpnext/blob/develop/erpnext/manufacturing/doctype/job_card/job_card.py)、[Item Dashboard](https://github.com/frappe/erpnext/blob/develop/erpnext/stock/dashboard/item_dashboard.js)。
- 借鉴：工单有明确状态生命周期；物料需要区分实际库存、预留库存、生产预留和预计库存；快捷加料/移库等操作必须检查数量和仓库约束；列表支持上下文操作而不是让用户在模块间反复寻找入口。
- 不照搬：ERPNext 运行在完整 Frappe 服务端框架上，包含权限、数据库事务和后台校验。本项目是浏览器本地应用，不能声称具备等同的多人并发、权限或账务能力。

### 纺织制造业务
- 参考 ERPNext 制造模块的工单、工序、物料预留和 Job Card 分层；结合本项目的坯布订单、织造工序、验布等级和采购收货流程，维持纺织业务术语。

## 2. 对本项目的产品映射

| 模块 | 借鉴模式 | 验收点 |
|---|---|---|
| 经营看板 | 订单、在产工单、库存、质量四组指标 | KPI 可以追溯到业务记录 |
| 销售订单 | 客户、产品、数量、价格、状态 | 订单状态与生产/发货流转一致 |
| 生产工单 | 计划/已完成数量、工序、交期 | 交期按当前日期计算；完工状态不再预警 |
| 物料库存 | 实际量、安全库存、预留量、流水 | 库存总数与流水闭合 |
| 采购 | 采购单、收货、入库、供应商 | 收货数量受订单剩余量约束 |
| 质量 | 验布结果、等级、批次 | “优等品率”等指标分子分母明确 |

## 3. 本轮实际落地
- 经营看板增加订单、工单、库存和采购快捷操作。
- 交期预警计算移除历史固定日期基准，改为按当前日期计算并忽略无效日期。
- KPI 文案“准时率”更正为“订单完成率”：现有数据只支持已完成订单占有效订单比例，并不能证明按期交付。
- 将内置固定产量序列标注为“示例值 · 非实时生产数据”，避免把静态示例趋势误读为现场数据。

## 4. 后续重构要求
1. 库存展示至少分为实际可用量、预留量、在途量和预计可用量；每种数量要有明确计算口径。
2. 订单、采购、生产、质检通过稳定 ID 关联，避免仅靠名称或显示文本关联。
3. 工单状态只能通过允许的状态转换推进，关键动作写入流水。
4. 任何经营趋势要么由真实业务记录聚合，要么明确标注为样例数据。
5. 关键保存动作需要事务/回滚设计；当前 localStorage 方案应明确单机、单浏览器限制。

## 5. 参考链接
- [ERPNext 仓库](https://github.com/frappe/erpnext)
- [Work Order 状态与业务字段](https://github.com/frappe/erpnext/blob/develop/erpnext/manufacturing/doctype/work_order/work_order.py)
- [Job Card 生产工序记录](https://github.com/frappe/erpnext/blob/develop/erpnext/manufacturing/doctype/job_card/job_card.py)
- [ERPNext 库存仪表盘](https://github.com/frappe/erpnext/blob/develop/erpnext/stock/dashboard/item_dashboard.js)

## 6. 2026-10-19 实施补充：采购在途与预计库存

- `src/domain/index.js` 新增 `calculateStockPosition`，使用整数 milliunits 计算现存数量、采购在途、预计库存、安全库存和补货缺口，避免累计小数漂移。
- `assets/js/legacy-app.js` 在物料库存表新增“采购在途”和“预计库存”列。采购在途仅纳入物料、供应商、单位一致且能够唯一分配到库存 SKU 的未到货采购；拆分到多个批次、无法唯一分配的订单不重复计入。
- `test/domain.test.js` 覆盖库存充足、低于安全库存、精度超限、负数和整数范围溢出。
- 当前“预计库存”口径为现存库存 + 可唯一关联的未到货采购，不扣减销售订单占用、生产预留或其他承诺量，因此不应称为“可承诺库存”。


## 7. 扩展开源对标：ERP / 制造执行 / 库存流转

> 覆盖说明：纺织 ERP 的专用开源前端样本较少，因此以通用制造 ERP 与生产模块为主，映射到纺织订单、工序、收货和质检语义，不照搬其他行业字段。

| 上游项目 | 可核查入口 | 可迁移模式 | 本项目采用时的约束 |
|---|---|---|---|
| [ERPNext](https://github.com/frappe/erpnext) | [Work Order](https://github.com/frappe/erpnext/blob/develop/erpnext/manufacturing/doctype/work_order/work_order.py)、[Job Card](https://github.com/frappe/erpnext/blob/develop/erpnext/manufacturing/doctype/job_card/job_card.py)、[Item Dashboard](https://github.com/frappe/erpnext/blob/develop/erpnext/stock/dashboard/item_dashboard.js) | 工单生命周期、工序级作业卡、物料需求/库存看板、业务记录追溯 | 不虚构当前单机应用具备 Frappe 事务、权限、后台作业或并发锁 |
| [Odoo](https://github.com/odoo/odoo) | [制造模块源码](https://github.com/odoo/odoo/tree/18.0/addons/mrp)、[库存模块源码](https://github.com/odoo/odoo/tree/18.0/addons/stock) | 制造订单与库存移动关联，按业务对象组织模块；工作流状态与记录操作结合 | 不能只复制 UI；服务端约束、库存预留与会计集成在本项目尚未实现 |
| [Tryton Production](https://docs.tryton.org/latest/modules-production/) | [生产模块设计](https://docs.tryton.org/latest/modules-production/design.html)、[BOM 源码镜像](https://github.com/tryton/production/blob/develop/bom.py) | BOM 输入/输出、生产位置、输入输出移动、生产状态生命周期 | GitHub 镜像已归档；以官方 Tryton 文档当前版本为准，不把旧镜像当作活跃主仓库 |

### 对本项目的实现映射
- 首页已增加“销售订单 → 生产工单 → 物料库存 → 采购协同”业务顺序入口。
- 下一阶段按稳定 ID 贯通订单—工单—采购单—收货—库存流水；名称匹配只用于兼容导入，不能作为永久关联键。
- 库存至少区分现存、采购在途、生产/销售预留和预计可用；当前预计库存不扣减所有需求，不能称作 ATP/可承诺量。
- 质量结果需关联批次和订单/工单，KPI 的分母、过滤状态和日期窗口都应回溯到明细。
