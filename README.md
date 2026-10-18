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

The modernization work is being applied directly to `main`. The verified inventory slice posts stock changes through a pure ledger transition with a SKU, signed quantity delta, business reference, timestamp, before/after balances, three-decimal milliunit precision, and negative-stock rejection. The UI prevents in-place SKU identity changes, writes ledger and master-balance changes together, and rolls back failed persistence. Referential-integrity, storage-recovery, import and workflow regression checks are in CI; the current build, tests, and Pages deployment pass.

Remaining delivery work includes broader purchase-to-receipt and production material-consumption workflows, role/permission enforcement, database-backed concurrent transactions, finance integration and reconciliation, and migration verification using real business backups. The current browser persistence is not a substitute for a transactional production database.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).
