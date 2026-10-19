import test from "node:test";
import assert from "node:assert/strict";
import { applyStockMovement, normalizeStockBalance, createPurchaseReceipt, validatePurchaseReceiptRecord } from "../src/domain/index.js";
const movement={sku:"FABRIC-001",quantityDelta:-3,reference:"ISSUE-0001",occurredAt:"2026-02-01T08:00:00Z"};
test("records a traceable stock ledger transition",()=>{
 const row=applyStockMovement(10,movement);
 assert.equal(row.previousBalance,10); assert.equal(row.nextBalance,7);
});
test("normalizes only safe non-negative stock balances to three decimal places",()=>{
 assert.equal(normalizeStockBalance(1.125),1.125);
 assert.equal(normalizeStockBalance(0),0);
 assert.equal(normalizeStockBalance(1000000),1000000);
 assert.throws(()=>normalizeStockBalance(-0.001),RangeError);
 assert.throws(()=>normalizeStockBalance(1.0001),RangeError);
 assert.throws(()=>normalizeStockBalance(Number.MAX_VALUE),RangeError);
 assert.throws(()=>normalizeStockBalance(Infinity),RangeError);
});
test("prevents negative stock",()=>assert.throws(()=>applyStockMovement(2,movement),RangeError));
test("requires a traceable reference and non-zero quantity",()=>{
 assert.throws(()=>applyStockMovement(2,{...movement,reference:""}),TypeError);
 assert.throws(()=>applyStockMovement(2,{...movement,quantityDelta:0}),RangeError);
});
test("rejects array-shaped movement containers even when custom fields are attached",()=>{
 const malformed=[];
 Object.assign(malformed,movement);
 assert.throws(()=>applyStockMovement(10,malformed),TypeError);
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
test("normalized decimal balance differences remain exact ledger quantities",()=>{
 const opening=normalizeStockBalance(0.2);
 const closing=normalizeStockBalance(0.3);
 const delta=Number((closing-opening).toFixed(3));
 const row=applyStockMovement(opening,{...movement,quantityDelta:delta});
 assert.equal(delta,0.1);
 assert.equal(row.nextBalance,closing);
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
test("rejects timezone normalization outside the four-digit UTC year range",()=>{
 assert.throws(()=>applyStockMovement(1,{...movement,occurredAt:"0000-01-01T00:00:00+14:00"}),RangeError);
 assert.throws(()=>applyStockMovement(1,{...movement,occurredAt:"9999-12-31T23:59:59-14:00"}),RangeError);
});


const purchaseOrder={
 no:"PO-TEST-001",sup:"Supplier A",mat:"Combed cotton yarn 40S",
 qty:100,unit:"公斤",status:"在途"
};
const inventoryItem={
 code:"Y-TEST-40S",name:"Combed cotton yarn 40S",supplier:"Supplier A",
 qty:10,unit:"公斤",batch:"LOT-20261018",loc:"A-01-01"
};
const receiptBase={
 purchaseOrder,inventoryItem,receiptNo:"GRN-TEST-001",quantity:35,
 batch:"LOT-20261018",location:"A-01-01",
 receivedAt:"2026-10-18T09:00:00+08:00",
 receivedBy:"warehouse-1",inspectedBy:"qc-1",
 inspectionResult:"合格",note:"Counted and passed incoming inspection"
};
test("posts a qualified purchase receipt to stock with order and lot traceability",()=>{
 const result=createPurchaseReceipt(receiptBase);
 assert.equal(result.receipt.receiptNo,"GRN-TEST-001");
 assert.equal(result.receipt.purchaseNo,"PO-TEST-001");
 assert.equal(result.receipt.sku,"Y-TEST-40S");
 assert.equal(result.receipt.quantity,35);
 assert.equal(result.receipt.receivedAt,"2026-10-18T01:00:00.000Z");
 assert.equal(result.receipt.stockMovementReference,"GRN-TEST-001");
 assert.equal(result.stockMovement.quantityDelta,35);
 assert.equal(result.stockMovement.previousBalance,10);
 assert.equal(result.stockMovement.nextBalance,45);
 assert.equal(result.stockMovement.sourceType,"purchase-receipt");
 assert.equal(result.stockMovement.sourceNo,"PO-TEST-001");
 assert.equal(result.totalReceived,35);
 assert.equal(result.remainingQuantity,65);
 assert.equal(result.purchaseStatus,"部分到货");
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.receipt));
 assert.ok(Object.isFrozen(result.stockMovement));
});
test("supports multiple receipts but never exceeds ordered quantity",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const second=createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-002",quantity:65,
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  existingReceipts:[first.receipt],
  existingMovementReferences:["GRN-TEST-001"],
  receivedAt:"2026-10-18T10:00:00+08:00"
 });
 assert.equal(second.totalReceived,100);
 assert.equal(second.remainingQuantity,0);
 assert.equal(second.purchaseStatus,"已入库");
 assert.equal(second.stockMovement.previousBalance,45);
 assert.equal(second.stockMovement.nextBalance,110);
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-003",quantity:1,
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  existingReceipts:[first.receipt,second.receipt],
  existingMovementReferences:["GRN-TEST-001","GRN-TEST-002"],
  inventoryItem:{...inventoryItem,qty:second.stockMovement.nextBalance}
 }),/exceeds the outstanding/);
});
test("rejects historical receipts that do not match the selected purchase SKU and lot",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const wrongLot={...first.receipt,batch:"LOT-OTHER"};
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-LOT-002",
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  existingReceipts:[wrongLot],
  existingMovementReferences:["GRN-TEST-001"]
 }),/existing receipts for this purchase order must match/);
 const wrongSku={...first.receipt,sku:"Y-OTHER"};
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-SKU-002",
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  existingReceipts:[wrongSku],
  existingMovementReferences:["GRN-TEST-001"]
 }),/existing receipts for this purchase order must match/);
});
test("normalizes stock movement references before duplicate checks",()=>{
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,existingMovementReferences:[" GRN-TEST-001 "]
 }),/already exists/);
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,existingMovementReferences:["GRN-TEST-009"," GRN-TEST-009 "]
 }),/references must be non-empty and unique/);
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,existingMovementReferences:["MOVE"+String.fromCharCode(10)+"FORGED"]
 }),/contain no control characters/);
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,existingMovementReferences:["M".repeat(121)]
 }),/at most 120 characters/);
});
test("requires every historical receipt to have a unique matching stock movement reference",()=>{
 const first=createPurchaseReceipt(receiptBase);
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-MISSING-002",
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  existingReceipts:[first.receipt],
  existingMovementReferences:[]
 }),/no matching stock movement reference/);
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,existingMovementReferences:["MOVE-1","MOVE-1"]
 }),/references must be non-empty and unique/);
});
test("requires exact material, supplier, unit, batch and warehouse mapping",()=>{
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,inventoryItem:{...inventoryItem,name:"Different material"}
 }),/material, unit and supplier must exactly match/);
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,inventoryItem:{...inventoryItem,supplier:"Supplier B"}
 }),/material, unit and supplier must exactly match/);
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,inventoryItem:{...inventoryItem,unit:"米"}
 }),/material, unit and supplier must exactly match/);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,batch:"OTHER-LOT"}),/batch must match/);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,location:"B-01-01"}),/location must match/);
});
test("requires completed incoming inspection and attributable receiving staff",()=>{
 assert.throws(()=>createPurchaseReceipt({...receiptBase,inspectionResult:"待检"}),/must be recorded as 合格/);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,receivedBy:" "}),/receiver is required/);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,inspectedBy:" "}),/inspector is required/);
});
test("rejects receipt from unsubmitted, cancelled, already-in-stock or ambiguous legacy orders",()=>{
 for(const status of ["草稿","待审批","待下单","已取消","已到货","已入库","检验中","退货"]){
  assert.throws(()=>createPurchaseReceipt({
   ...receiptBase,purchaseOrder:{...purchaseOrder,status}
  }),/not eligible for receiving/);
 }
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,purchaseOrder:{...purchaseOrder,status:"部分到货"}
 }),/legacy partial-delivery/);
});
test("rejects duplicate receipt references, malformed dates and quantities",()=>{
 const existing=[{receiptNo:"GRN-TEST-001",purchaseNo:"PO-OTHER",quantity:1,unit:"公斤"}];
 assert.throws(()=>createPurchaseReceipt({...receiptBase,existingReceipts:existing}),/already exists/);
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,existingMovementReferences:["GRN-TEST-001"]
 }),/already exists/);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,receivedAt:"2026-10-18T09:00:00"}),/explicit timezone/);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,quantity:0}),/receipt quantity/);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,quantity:0.0001}),/at most 3 decimals/);
});
test("rejects control characters and oversized inventory traceability text",()=>{
 assert.throws(()=>applyStockMovement(1,{...movement,sku:"FABRIC\n001"}),RangeError);
 assert.throws(()=>applyStockMovement(1,{...movement,reference:"ISSUE-\u0000001"}),RangeError);
 assert.throws(()=>applyStockMovement(1,{...movement,sku:"S".repeat(81)}),RangeError);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,receivedBy:"warehouse\n1"}),TypeError);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,note:"x".repeat(2001)}),RangeError);
 assert.throws(()=>createPurchaseReceipt({...receiptBase,note:"bad\u0000note"}),TypeError);
});
test("validates immutable receipt records and stock balance arithmetic",()=>{
 const result=createPurchaseReceipt(receiptBase);
 assert.equal(validatePurchaseReceiptRecord(result.receipt).nextBalance,45);
 assert.throws(()=>validatePurchaseReceiptRecord({...result.receipt,unexpected:"payload"}),/unsupported fields/);
 assert.throws(()=>validatePurchaseReceiptRecord({...result.receipt,nextBalance:46}),/balances are inconsistent/);
 assert.throws(()=>validatePurchaseReceiptRecord({...result.receipt,inspectionResult:"待检"}),/only a recorded qualified/);
});
