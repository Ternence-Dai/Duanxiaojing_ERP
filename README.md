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

The modernization work is being applied directly to `main`. The current baseline includes a domain-core module, automated domain tests, standalone-app validation, and a GitHub Pages deployment workflow. These checks passing confirms the current baseline is buildable; it does **not** mean the full product rebuild is complete.

Remaining delivery work includes validating the existing application workflows and data, extracting maintainable modules from the legacy entry point, adding migration-safe persistence and import/export checks, and documenting verified domain rules. Existing user data and the legacy application must be preserved while these changes are introduced.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).
