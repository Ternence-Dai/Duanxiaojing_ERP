import test from "node:test";
import assert from "node:assert/strict";
import { applyStockMovement } from "../src/domain/index.js";
const movement={sku:"FABRIC-001",quantityDelta:-3,reference:"ISSUE-0001",occurredAt:"2026-02-01T08:00:00Z"};
test("records a traceable stock ledger transition",()=>{
 const row=applyStockMovement(10,movement);
 assert.equal(row.previousBalance,10); assert.equal(row.nextBalance,7);
});
test("prevents negative stock",()=>assert.throws(()=>applyStockMovement(2,movement),RangeError));
test("requires reference and integer quantities",()=>{
 assert.throws(()=>applyStockMovement(2,{...movement,reference:""}),TypeError);
 assert.throws(()=>applyStockMovement(2,{...movement,quantityDelta:0.5}),RangeError);
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
