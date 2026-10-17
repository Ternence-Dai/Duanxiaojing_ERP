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
