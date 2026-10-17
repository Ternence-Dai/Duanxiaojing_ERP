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

## Rebuild status

The rebuild/platform-v2 branch is the new implementation track. The existing main branch remains unchanged during development. This repository is not considered rebuilt until the implementation, tests, documentation, and deployment path have been verified.

See [the rebuild plan](docs/REBUILD_PLAN.md).
