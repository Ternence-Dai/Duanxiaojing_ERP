# 织云 ERP — Deep Redesign Roadmap

> Status: discovery and architecture baseline. Existing workflows must be mapped before replacing any screen or business rule.

## Product vision
Transform the current textile-oriented ERP interface into a reliable operations platform connecting orders, materials, production, quality, inventory, delivery, and financial visibility—with AI as a supervised assistant, not an unchecked decision-maker.

## Product pillars
1. **Order-to-delivery** — order lifecycle, BOM, routing, milestones, delivery commitments.
2. **Materials and inventory** — stock ledger, lot/batch traceability, reservations, replenishment signals.
3. **Production execution** — work orders, capacity, shift reporting, bottleneck visibility.
4. **Quality management** — inspection plans, defects, rework, traceability, corrective actions.
5. **AI operations copilot** — natural-language queries, exception summaries, draft plans, and explanations grounded in authorized ERP records.

## Proposed architecture
- Frontend: TypeScript + React/Vite, role-aware navigation, reusable data grids and forms.
- Backend: modular API with domain boundaries for Sales, Planning, Inventory, Production, Quality, and Finance.
- Persistence: relational database with migrations, transaction boundaries, audit history, and tenant/company scoping if required.
- Security: RBAC, least privilege, server-side authorization, validated imports, immutable audit events.
- Integration: versioned APIs and asynchronous jobs for imports/exports and notifications.

## Redesign workstreams
### P0 — business process discovery
- Map every existing page, form, field, status transition, calculation, import/export, and local-storage behavior.
- Identify master data and source-of-truth ownership.
- Record textile-specific terms, units, process variants, and approval rules with the business owner.
- Remove unnecessary personal contact metadata from public pages.

### P1 — transaction-safe foundation
- Define entities: Customer, Supplier, Product, Material, BOM, Order, WorkOrder, InventoryLot, Inspection, Shipment.
- Establish unique identifiers, referential integrity, validation, and transactional stock movements.
- Add role and permission matrix plus audit trail for sensitive changes.
- Design import preview, duplicate detection, and rollback-safe processing.

### P2 — redesigned operator experience
- Role-based workspaces: Management / Sales / Planning / Warehouse / Production / Quality / Finance.
- Exception-first dashboards with actionable queues rather than decorative KPI cards.
- Fast search, saved filters, batch actions with confirmation, and responsive tables.
- Clear status history and ownership for every operational item.

### P3 — supervised AI capabilities
- Natural-language read-only queries constrained by the user's permissions.
- Explainable demand/stock/late-order alerts based on transparent rules.
- AI may draft purchase/production plans; authorized humans approve all writes.
- Evaluate suggestions against historical outcomes before presenting them as forecasts.

## Acceptance criteria
- Core order, stock, production, and quality flows have integration tests.
- Inventory movements are transaction-safe and auditable.
- Every role is tested for allowed and denied actions.
- AI cannot bypass server authorization or write transactions without explicit approval.
- Existing data is migrated with reconciliation reports and rollback plan.
- CI, migration tests, and critical Playwright flows pass before merge.

## Non-goals / safeguards
- No invented textile business rules.
- No direct AI mutation of inventory, orders, payments, or production schedules.
- No migration that silently drops existing records.
