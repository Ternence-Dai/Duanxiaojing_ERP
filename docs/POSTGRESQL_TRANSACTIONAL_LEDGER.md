# PostgreSQL transactional stock ledger foundation

## Scope

This migration adds a database-side stock posting primitive. It is a foundation for replacing the browser-only inventory write path; it does **not** yet connect the published static UI to a hosted database, migrate localStorage business data, or provide user authentication/authorization.

## Data model

- `erp.inventory_item`: one canonical SKU balance, stored as `numeric(18,3)`.
- `erp.stock_movement`: append-only, business-referenced movements with previous/next balances.
- Unique `(source_type, reference)` prevents the same business posting from being applied twice.
- Foreign keys prevent deleting a SKU that has stock history.
- A check constraint keeps every movement's balance equation auditable.

## Atomic posting contract

Call `erp.post_stock_movement(sku, quantity_delta, reference, source_type, occurred_at)` inside a database transaction. The function locks the SKU row using `SELECT ... FOR UPDATE`, calculates the next balance, rejects negative stock and invalid precision, inserts the movement and updates the balance in the same transaction. Concurrent writers to one SKU serialize at the database row lock; writes to different SKUs can proceed independently.

## Verification

The GitHub Actions PostgreSQL integration job starts a disposable PostgreSQL 17 service and:
1. Applies the migration to an empty database.
2. Checks sequential receipt/issue arithmetic, duplicate-reference rejection, negative-stock rejection and three-decimal precision.
3. Starts two independent database sessions that each attempt to issue the final unit. Exactly one must commit; the other must be rejected, leaving zero stock and one ledger row.

## Rollout boundary and remaining work

- Existing localStorage and bound JSON files remain untouched. No automatic destructive conversion is performed.
- The frontend still uses the current browser persistence path. Do not advertise multi-user ERP behavior until an authenticated API is deployed and the UI writes through it.
- Before production use: add authenticated API endpoints and server-side role/tenant authorization; add purchase-order/receipt tables and one atomic PO + receipt + stock transaction; implement audited, idempotent migrations/import with reconciliation reports; configure managed PostgreSQL backups, TLS, secret rotation, monitoring and recovery drills.
- The integration workflow proves the database primitive under concurrent sessions, not production deployment, identity security, or the entire purchase workflow.
