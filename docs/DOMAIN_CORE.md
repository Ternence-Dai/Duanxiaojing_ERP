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

## Application-level controls

This domain function validates one movement; it does not itself check user permissions, SKU existence, duplicate business references, or database concurrency. Those remain application/persistence responsibilities. The UI and import validator must retain historical stock movements and must not allow direct stock edits to bypass the ledger.

## Verification boundary

`test/domain.test.js` covers ledger arithmetic, negative-stock rejection, reference requirements, three-decimal precision, timezone normalization, and safe-integer limits. Repository validators separately exercise application-level reference integrity, rollback, and backup shape checks. These checks do not replace a production database transaction or authorization layer.
