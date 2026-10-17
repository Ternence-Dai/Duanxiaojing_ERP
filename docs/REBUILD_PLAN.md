# Rebuild plan — 智能纺织制造 ERP

## Product intent

A modular ERP for textile and apparel operations, connecting master data, procurement, inventory, production, quality, sales, finance hand-offs, and traceability through auditable workflows.

## Target capabilities

1. Organization, roles, permissions, and master data
2. Sales orders, quotations, and customer management
3. Procurement, suppliers, and purchase receiving
4. Inventory, lots, warehouses, and stock movements
5. Production planning, work orders, and material consumption
6. Quality inspection, non-conformance, and traceability
7. Finance integration points, reporting, and audit logs

## Non-negotiable correctness and safety gates

Use transactional data integrity, explicit workflow states, immutable stock movement history, role-based authorization, migration tests, and auditability. Financial posting must be reconciled and never simulated as real accounting.

## Delivery sequence

1. Inventory current behavior, assets, data formats, and dependencies.
2. Define domain model, API contracts, permissions, and migration/import strategy.
3. Implement the smallest end-to-end vertical slice with typed interfaces.
4. Add unit, integration, and browser-level tests for critical workflows.
5. Add CI, security/dependency scanning, and reproducible build instructions.
6. Validate with reference datasets and document known limitations.
7. Review deployment, backup, recovery, and release process before production use.

## Open-source adoption policy

For each dependency or reference project, record its repository URL, license, maintenance activity, security posture, exact component being reused or adapted, and attribution obligations. Prefer stable standards and small interoperable components over copying whole applications.

## Status

- [ ] Existing repository and data audit complete
- [ ] Domain model and architecture approved
- [ ] Core vertical slice implemented
- [ ] Critical workflows tested
- [ ] CI and security checks passing
- [ ] Deployment and backup procedure verified
- [ ] Release candidate reviewed
