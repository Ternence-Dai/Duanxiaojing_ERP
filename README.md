# Textile Manufacturing ERP

> 智能纺织制造 ERP

A modular ERP for textile and apparel operations, connecting master data, procurement, inventory, production, quality, sales, finance hand-offs, and traceability through auditable workflows.

## Product modules

- Organization, roles, permissions, and master data
- Sales orders, quotations, and customer management
- Procurement, suppliers, and purchase receiving
- Inventory, lots, warehouses, and stock movements
- Production planning, work orders, and material consumption
- Quality inspection, non-conformance, and traceability
- Finance integration points, reporting, and audit logs

## Engineering principles

Use transactional data integrity, explicit workflow states, immutable stock movement history, role-based authorization, migration tests, and auditability. Financial posting must be reconciled and never simulated as real accounting.

- Modular, typed, documented code; no monolithic application entry point.
- Reproducible setup, deterministic tests, and automated quality checks.
- Secure configuration: secrets belong in environment variables or managed secret stores, never in source control.
- Accessible, responsive interface with clear loading, empty, error, and offline states.
- Open-source components are evaluated for maintenance, license compatibility, security, and fit before adoption.

## Delivery status

The modernization work is being applied directly to `main`. The verified inventory slice posts stock changes through a pure ledger transition with a SKU, signed quantity delta, business reference, timestamp, before/after balances, three-decimal milliunit precision, and negative-stock rejection. The purchase workspace now supports partial receipts against eligible purchase orders: it requires an exact existing SKU/material/supplier/unit, matching batch and location, a recorded receiver and inspector, and an incoming-inspection result of `合格`. Each receipt is appended with its own stock movement; order status is derived from cumulative accepted quantity, and the receipt, inventory balance and PO status are saved or rolled back together. Backup validation cross-checks receipt records against POs, SKUs and ledger arithmetic; legacy backups migrate without fabricated receipts. The V3 interface now presents a modern textile operations workspace with a dark-blue navigation rail, consolidated global search, refreshed KPI/alert/chart cards, clearer tables and forms, and responsive mobile navigation. The dashboard and enterprise records remain explicitly marked as demonstration data until verified business records are imported. CI includes the new receipt/backup regression checks.

Remaining delivery work includes broader purchase-to-receipt and production material-consumption workflows, role/permission enforcement, database-backed concurrent transactions, finance integration and reconciliation, and migration verification using real business backups. The current browser persistence is not a substitute for a transactional production database.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).
