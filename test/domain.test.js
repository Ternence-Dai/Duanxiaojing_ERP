import test from "node:test";
import assert from "node:assert/strict";
import { applyStockMovement } from "../src/domain/index.js";
const movement={sku:"FABRIC-001",quantityDelta:-3,reference:"ISSUE-0001",occurredAt:"2026-02-01T08:00:00Z"};
test("records a traceable stock ledger transition",()=>{
 const row=applyStockMovement(10,movement);
 assert.equal(row.previousBalance,10); assert.equal(row.nextBalance,7);
});
test("prevents negative stock",()=>assert.throws(()=>applyStockMovement(2,movement),RangeError));
test("requires a traceable reference and non-zero quantity",()=>{
 assert.throws(()=>applyStockMovement(2,{...movement,reference:""}),TypeError);
 assert.throws(()=>applyStockMovement(2,{...movement,quantityDelta:0}),RangeError);
});
test("supports textile stock quantities to three decimal places",()=>{
 const row=applyStockMovement(1.25,{...movement,quantityDelta:-0.125});
 assert.equal(row.nextBalance,1.125);
});
test("rejects precision beyond three decimal places",()=>{
 assert.throws(()=>applyStockMovement(1,{...movement,quantityDelta:0.0001}),RangeError);
});
test("rejects malformed dates and negative balances",()=>{
 assert.throws(()=>applyStockMovement(1,{...movement,occurredAt:"not-a-date"}),TypeError);
 assert.throws(()=>applyStockMovement(-1,movement),RangeError);
});
test("uses integer milliunits to avoid floating-point drift across movements",()=>{
 const first=applyStockMovement(0.1,{...movement,quantityDelta:0.2});
 assert.equal(first.nextBalance,0.3);
 const second=applyStockMovement(first.nextBalance,{...movement,quantityDelta:0.1});
 assert.equal(second.nextBalance,0.4);
});
test("rejects quantities whose milliunit representation is unsafe",()=>{
 assert.throws(()=>applyStockMovement(Number.MAX_SAFE_INTEGER,{...movement,quantityDelta:1}),RangeError);
 assert.throws(()=>applyStockMovement(1,{...movement,quantityDelta:0.0001}),RangeError);
});
test("rejects timestamps with sub-millisecond precision instead of silently truncating",()=>{
 assert.throws(()=>applyStockMovement(1,{...movement,occurredAt:"2026-02-01T08:00:00.1234Z"}),TypeError);
});
test("normalizes millisecond timestamps and timezone offsets",()=>{
 const row=applyStockMovement(1,{...movement,quantityDelta:0.25,occurredAt:"2026-02-01T16:00:00.125+08:00"});
 assert.equal(row.nextBalance,1.25); assert.equal(row.occurredAt,"2026-02-01T08:00:00.125Z");
});
