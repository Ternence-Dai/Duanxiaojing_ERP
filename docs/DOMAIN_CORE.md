# ERP stock movement domain core

`normalizeStockBalance(balance)` validates a non-negative master balance and returns its canonical three-decimal quantity. `applyStockMovement(balance, movement)` is the pure domain boundary for one auditable stock-ledger transition.

## Units and input contract

- `balance` is the current non-negative stock balance for one SKU, expressed in that SKU's base unit.
- `movement.sku` is a required non-empty SKU identity.
- `movement.quantityDelta` is a signed quantity change in the same base unit as `balance`; positive values represent stock-in and negative values stock-out.
- `movement.reference` is a required business reference (for example, a receipt, issue, or adjustment number).
- `movement.occurredAt` must be an ISO timestamp with an explicit timezone and no more than millisecond precision.

Master balances and movement quantities are accepted only when representable to at most three decimal places and when their milliunit integer representation remains a safe JavaScript integer. The UI validates both opening and closing balances before recording a changed quantity; an unchanged legacy balance is retained while unrelated fields are edited, rather than silently rounded. A zero movement is rejected. The resulting balance must remain non-negative.

## Output and invariants

The function returns an immutable record containing the trimmed SKU and reference, canonical UTC timestamp, quantity delta, previous balance, and next balance.

The core invariant is:

`nextBalance = previousBalance + quantityDelta`

The transition is rejected if the integer-milliunit result is unsafe or negative. Callers should persist the returned ledger row and corresponding master-balance update in one transaction; a failed persistence operation must roll both back.

## Time handling

The input timestamp must contain an explicit timezone. Invalid calendar dates, invalid timezone offsets, missing offsets, and excess fractional-second precision are rejected. Accepted timestamps are normalized to UTC. The resulting UTC year must remain within the supported four-digit year range.

## Purchase receipts and qualified stock-in

`createPurchaseReceipt(input)` creates one immutable receiving record and its corresponding positive stock movement. The business contract is deliberately narrow:

- The purchase line must be eligible for receiving (`已下单`, `在途`, or a `部分到货` order that already has a validated receipt ledger). Old `已到货`, `检验中`, or `部分到货` statuses without receipt history are quarantined for reconciliation; reposting them could double-count legacy stock.
- The selected inventory SKU must exactly match the purchase material name, supplier, and base unit. Its batch and warehouse location must also match the existing stock master. Different lots or locations require separate inventory SKUs; the current master-data model does not combine lots into one SKU.
- The received quantity must be positive, exactly representable to three decimals, and no greater than the purchase order's unreceived balance.
- A non-empty receiver and incoming inspector are required. This posting route accepts only an explicit `合格` inspection result; pending, failed, or rejected material must not be included in available stock.
- The receipt number is also the stock-movement reference. The receipt stores the purchase order, SKU, supplier, material, unit, batch, location, receiver, inspector, inspection outcome, timestamp, and before/after stock balances.
- The purchase status is derived from the cumulative receipt ledger: `部分到货` until the ordered quantity is received, then `已入库`. It is not a free-form status edit after receipts exist.

The application appends the receipt and movement, increases the inventory balance, and updates the purchase status in one snapshot/commit/rollback operation. Backup validation checks the PO/SKU identities, inspection result, receipt/movement reference, before/after arithmetic, cumulative quantity, and derived PO status. Deleting a referenced PO or SKU, or editing the material/supplier/unit/batch/location identity, is blocked.

Legacy databases and backups without receipt tables migrate to empty arrays. Existing demo purchase statuses are not converted into invented receipts. A legacy `部分到货` order with no traceable receipt history is blocked from further posting until its original documents are reconciled.

The receiver and inspector fields are self-entered attribution, not authenticated identity or role-based authorization. This slice posts only passed inspection quantities; it does not implement quarantine, rejected-material return, supplier claims, multi-warehouse allocation for one SKU, or a durable multi-user inventory transaction.

## Application-level controls

This domain function validates one movement; it does not itself check user permissions, SKU existence, duplicate business references, or database concurrency. Those remain application/persistence responsibilities. The UI and import validator must retain historical stock movements and must not allow direct stock edits to bypass the ledger.

## Verification boundary

`test/domain.test.js` covers ledger arithmetic, negative-stock rejection, reference requirements, three-decimal precision, timezone normalization, and safe-integer limits. Repository validators separately exercise application-level reference integrity, rollback, and backup shape checks. These checks do not replace a production database transaction or authorization layer.

## Open-source ERP references

- [ERPNext](https://github.com/frappe/erpnext) is the principal architecture benchmark for connected sales, procurement, inventory, manufacturing, quality, and accounting workflows. Its document/workflow organization is a reference for module boundaries and traceability, not a source of textile-specific master data.
- The stock-ledger approach is intentionally append-oriented: receipts and issues should be represented as business-referenced movements, not silent edits to an on-hand quantity. Purchase receipts must reconcile with the purchase order, SKU, unit, lot, location, inspection, and resulting balance.
- ERPNext's role and permission model is a reference for the future authorization layer. The current static browser application does not provide production-grade server-side authorization, concurrent transactions, or accounting posting.
