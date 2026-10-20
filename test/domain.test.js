import test from "node:test";
import assert from "node:assert/strict";
import { applyStockMovement, normalizeStockBalance, calculateStockPosition, createPurchaseReceipt, validatePurchaseReceiptRecord, createPurchaseReceiptReversal, validatePurchaseReceiptReversalRecord } from "../src/domain/index.js";
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

test("refuses receipt reversal when purchase-order commercial identity has drifted",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const base={
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  receipt:first.receipt,existingReceipts:[first.receipt],
  existingReversals:[],existingMovementReferences:["GRN-TEST-001"],
  reversalNo:"REV-GRN-DRIFT",
  reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Master-data reconciliation test"
 };
 for (const patch of [
  {mat:"Different material"},
  {sup:"Different supplier"},
  {unit:"吨"}
 ]) {
  assert.throws(()=>createPurchaseReceiptReversal({
   ...base,purchaseOrder:{...base.purchaseOrder,...patch}
  }),/purchase order material, supplier and unit no longer match/);
 }
});

test("reverses a posted purchase receipt through an append-only negative stock movement",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const result=createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  receipt:first.receipt,existingReceipts:[first.receipt],
  existingReversals:[],existingMovementReferences:["GRN-TEST-001"],
  reversalNo:"REV-GRN-TEST-001",
  reversedAt:"2026-10-19T10:00:00+08:00",
  reversedBy:"warehouse-supervisor",
  reason:"Duplicate receiving posting; physical stock recounted"
 });
 assert.equal(result.reversal.receiptNo,"GRN-TEST-001");
 assert.equal(result.reversal.quantity,35);
 assert.equal(result.reversal.originalStockMovementReference,"GRN-TEST-001");
 assert.equal(result.stockMovement.quantityDelta,-35);
 assert.equal(result.stockMovement.previousBalance,45);
 assert.equal(result.stockMovement.nextBalance,10);
 assert.equal(result.stockMovement.sourceType,"purchase-receipt-reversal");
 assert.equal(result.stockMovement.reversesReference,"GRN-TEST-001");
 assert.equal(result.purchaseStatus,"在途");
 assert.equal(result.totalReceived,0);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.reversal));
 assert.ok(Object.isFrozen(result.stockMovement));
 assert.equal(validatePurchaseReceiptReversalRecord(result.reversal).reversalNo,"REV-GRN-TEST-001");
});

test("restores the original PO status only after every remaining receipt is reversed",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const second=createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-002",quantity:65,
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  purchaseOrder:{...purchaseOrder,status:first.purchaseStatus},
  existingReceipts:[first.receipt],
  existingMovementReferences:["GRN-TEST-001"],
  receivedAt:"2026-10-18T10:00:00+08:00"
 });
 const reverseSecond=createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"已入库"},
  inventoryItem:{...inventoryItem,qty:second.stockMovement.nextBalance},
  receipt:second.receipt,existingReceipts:[second.receipt,first.receipt],
  existingReversals:[],existingMovementReferences:["GRN-TEST-001","GRN-TEST-002"],
  reversalNo:"REV-GRN-TEST-002",reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Supplier return"
 });
 assert.equal(reverseSecond.totalReceived,35);
 assert.equal(reverseSecond.purchaseStatus,"部分到货");
 const reverseFirst=createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:reverseSecond.stockMovement.nextBalance},
  receipt:first.receipt,existingReceipts:[second.receipt,first.receipt],
  existingReversals:[reverseSecond.reversal],
  existingMovementReferences:["GRN-TEST-001","GRN-TEST-002","REV-GRN-TEST-002"],
  reversalNo:"REV-GRN-TEST-001",reversedAt:"2026-10-19T11:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Full PO receipt rollback"
 });
 assert.equal(reverseFirst.totalReceived,0);
 assert.equal(reverseFirst.purchaseStatus,"在途");
 assert.equal(reverseFirst.stockMovement.nextBalance,10);
});

test("receipt posting rejects prior reversals linked to a different movement reference",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const second=createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-LINK-002",quantity:65,
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  purchaseOrder:{...purchaseOrder,status:first.purchaseStatus},
  existingReceipts:[first.receipt],
  existingMovementReferences:["GRN-TEST-001"],
  receivedAt:"2026-10-18T10:00:00+08:00"
 });
 const prior=createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"已入库"},
  inventoryItem:{...inventoryItem,qty:second.stockMovement.nextBalance},
  receipt:second.receipt,
  existingReceipts:[first.receipt,second.receipt],
  existingMovementReferences:["GRN-TEST-001","GRN-TEST-LINK-002"],
  reversalNo:"REV-GRN-LINK-002",
  reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",
  reason:"Supplier return"
 });
 const tamperedReversal={
  ...prior.reversal,
  originalStockMovementReference:"ANOTHER-MOVEMENT"
 };
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-LINK-003",quantity:1,
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:prior.stockMovement.nextBalance},
  existingReceipts:[first.receipt,second.receipt],
  existingReversals:[tamperedReversal],
  existingMovementReferences:[
   "GRN-TEST-001","GRN-TEST-LINK-002","REV-GRN-LINK-002","ANOTHER-MOVEMENT"
  ],
  receivedAt:"2026-10-20T10:00:00+08:00"
 }),/purchase receipt reversal must link both original and reversal stock movements/);
});

test("rejects prior reversals whose unit or original movement link no longer matches the receipt",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const second=createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-002",quantity:65,
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  purchaseOrder:{...purchaseOrder,status:first.purchaseStatus},
  existingReceipts:[first.receipt],
  existingMovementReferences:["GRN-TEST-001"],
  receivedAt:"2026-10-18T10:00:00+08:00"
 });
 const prior=createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"已入库"},
  inventoryItem:{...inventoryItem,qty:second.stockMovement.nextBalance},
  receipt:second.receipt,
  existingReceipts:[first.receipt,second.receipt],
  existingMovementReferences:["GRN-TEST-001","GRN-TEST-002"],
  reversalNo:"REV-GRN-TEST-002",
  reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",
  reason:"Supplier return"
 });
 const baseArgs={
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:prior.stockMovement.nextBalance},
  receipt:first.receipt,
  existingReceipts:[first.receipt,second.receipt],
  existingMovementReferences:["GRN-TEST-001","GRN-TEST-002","REV-GRN-TEST-002"],
  reversalNo:"REV-GRN-TEST-001",
  reversedAt:"2026-10-19T11:00:00Z",
  reversedBy:"warehouse-supervisor",
  reason:"Full PO receipt rollback"
 };
 assert.throws(()=>createPurchaseReceiptReversal({
  ...baseArgs,existingReversals:[{...prior.reversal,unit:"箱"}]
 }),/existing reversal history does not match the receipt ledger/);
 assert.throws(()=>createPurchaseReceiptReversal({
  ...baseArgs,existingReversals:[{
    ...prior.reversal,originalStockMovementReference:"ANOTHER-MOVEMENT"
  }],
  existingMovementReferences:[
   "GRN-TEST-001","GRN-TEST-002","REV-GRN-TEST-002","ANOTHER-MOVEMENT"
  ]
 }),/purchase receipt reversal must link both original and reversal stock movements/);
});
test("rejects a modified receipt snapshot before reversing stock",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const modifiedReceipt={...first.receipt,receivedBy:"forged-operator"};
 assert.throws(()=>createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  receipt:modifiedReceipt,existingReceipts:[first.receipt],
  existingReversals:[],existingMovementReferences:["GRN-TEST-001"],
  reversalNo:"REV-GRN-FORGED-001",reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Attempted reversal with altered receipt data"
 }),/does not exactly match the saved receipt ledger/);
});

test("rejects duplicate receipt reversal and prevents a negative stock balance",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const args={
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  receipt:first.receipt,existingReceipts:[first.receipt],
  existingReversals:[],existingMovementReferences:["GRN-TEST-001"],
  reversalNo:"REV-GRN-TEST-001",reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Correct a duplicate posting"
 };
 const reversed=createPurchaseReceiptReversal(args);
 assert.throws(()=>createPurchaseReceiptReversal({
  ...args,existingReversals:[reversed.reversal],
  existingMovementReferences:["GRN-TEST-001","REV-GRN-TEST-001"],
  reversalNo:"REV-GRN-TEST-002"
 }),/already been reversed/);
 assert.throws(()=>createPurchaseReceiptReversal({
  ...args,inventoryItem:{...inventoryItem,qty:30}
 }),/negative stock balance/);
});

test("legacy receipts without a pre-receipt PO status cannot be fully reversed automatically",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const {purchaseStatusBefore,...legacyReceipt}=first.receipt;
 assert.throws(()=>createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  receipt:legacyReceipt,existingReceipts:[legacyReceipt],
  existingReversals:[],existingMovementReferences:["GRN-TEST-001"],
  reversalNo:"REV-LEGACY-001",reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Legacy reconciliation attempt"
 }),/manual reconciliation is required/);
});

test("new receipts calculate outstanding quantities after prior append-only reversals",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const reversal=createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  receipt:first.receipt,existingReceipts:[first.receipt],
  reversalNo:"REV-GRN-TEST-001",reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Reconcile stock count",
  existingMovementReferences:["GRN-TEST-001"]
 });
 const repost=createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-003",quantity:100,
  purchaseOrder:{...purchaseOrder,status:"在途"},
  inventoryItem:{...inventoryItem,qty:reversal.stockMovement.nextBalance},
  existingReceipts:[first.receipt],existingReversals:[reversal.reversal],
  existingMovementReferences:["GRN-TEST-001","REV-GRN-TEST-001"]
 });
 assert.equal(repost.totalReceived,100);
 assert.equal(repost.purchaseStatus,"已入库");
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


test("calculates on-hand, inbound and projected stock using exact milliunits",()=>{
 const position=calculateStockPosition({onHand:12.125,incomingQuantity:8.375,safetyStock:15});
 assert.equal(position.onHand,12.125);
 assert.equal(position.incomingQuantity,8.375);
 assert.equal(position.projectedQuantity,20.5);
 assert.equal(position.replenishmentQuantity,0);
 assert.equal(position.status,"sufficient");
 assert.ok(Object.isFrozen(position));
});
test("reports the exact replenishment gap when projected stock is below safety stock",()=>{
 const position=calculateStockPosition({onHand:3.25,incomingQuantity:2.5,safetyStock:10});
 assert.equal(position.projectedQuantity,5.75);
 assert.equal(position.replenishmentQuantity,4.25);
 assert.equal(position.status,"below-safety");
});
test("rejects negative, over-precise and overflowing projected stock positions",()=>{
 assert.throws(()=>calculateStockPosition({onHand:-1}),RangeError);
 assert.throws(()=>calculateStockPosition({onHand:1,incomingQuantity:-0.001}),RangeError);
 assert.throws(()=>calculateStockPosition({onHand:1,safetyStock:-1}),RangeError);
 assert.throws(()=>calculateStockPosition({onHand:1.0001}),RangeError);
 assert.throws(()=>calculateStockPosition({onHand:Number.MAX_SAFE_INTEGER,incomingQuantity:1}),RangeError);
});


test("rejects a receipt reversal timestamp earlier than the posted receipt",()=>{
 const first=createPurchaseReceipt(receiptBase);
 assert.throws(()=>createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  receipt:first.receipt,existingReceipts:[first.receipt],
  existingReversals:[],existingMovementReferences:["GRN-TEST-001"],
  reversalNo:"REV-GRN-BACKDATED",
  reversedAt:"2026-10-18T00:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Backdated reversal regression"
 }),/cannot precede the original receipt/);
});


test("rejects imported receipt reversals dated before the original receipt",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const validReversal=createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  receipt:first.receipt,existingReceipts:[first.receipt],
  existingReversals:[],existingMovementReferences:["GRN-TEST-001"],
  reversalNo:"REV-GRN-IMPORTED-BACKDATE",
  reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Valid reversal before import mutation"
 });
 const imported={...validReversal.reversal,reversedAt:"2026-10-18T00:00:00Z"};
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,purchaseOrder:{...purchaseOrder,status:"在途"},
  existingReceipts:[first.receipt],existingReversals:[imported],
  existingMovementReferences:["GRN-TEST-001","REV-GRN-IMPORTED-BACKDATE"],
  receiptNo:"GRN-TEST-002"
 }),/must uniquely match their original receipt/);
});


test("rejects imported reversal history backdated before its original receipt during a later reversal",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const second=createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-002",quantity:65,
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  existingReceipts:[first.receipt],
  existingMovementReferences:["GRN-TEST-001"],
  receivedAt:"2026-10-18T10:00:00+08:00"
 });
 const validReversal=createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"部分到货"},
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  receipt:first.receipt,existingReceipts:[first.receipt],
  existingReversals:[],existingMovementReferences:["GRN-TEST-001"],
  reversalNo:"REV-GRN-CHRONOLOGY-001",reversedAt:"2026-10-19T10:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Chronology fixture"
 });
 const imported={...validReversal.reversal,reversedAt:"2026-10-18T00:00:00Z"};
 assert.throws(()=>createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"已入库"},
  inventoryItem:{...inventoryItem,qty:second.stockMovement.nextBalance},
  receipt:second.receipt,existingReceipts:[first.receipt,second.receipt],
  existingReversals:[imported],
  existingMovementReferences:["GRN-TEST-001","GRN-TEST-002","REV-GRN-CHRONOLOGY-001"],
  reversalNo:"REV-GRN-CHRONOLOGY-002",reversedAt:"2026-10-20T10:00:00Z",
  reversedBy:"warehouse-supervisor",reason:"Second receipt reversal"
 }),/existing reversal history does not match the receipt ledger/);
});

test("rejects duplicate reversal identifiers in imported history before posting another reversal",()=>{
 const first=createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-DUP-001",quantity:30
 });
 const second=createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-DUP-002",quantity:30,
  inventoryItem:{...inventoryItem,qty:first.stockMovement.nextBalance},
  purchaseOrder:{...purchaseOrder,status:first.purchaseStatus},
  existingReceipts:[first.receipt],
  existingMovementReferences:["GRN-DUP-001"],
  receivedAt:"2026-10-18T10:00:00+08:00"
 });
 const third=createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-DUP-003",quantity:40,
  inventoryItem:{...inventoryItem,qty:second.stockMovement.nextBalance},
  purchaseOrder:{...purchaseOrder,status:second.purchaseStatus},
  existingReceipts:[first.receipt,second.receipt],
  existingMovementReferences:["GRN-DUP-001","GRN-DUP-002"],
  receivedAt:"2026-10-18T11:00:00+08:00"
 });
 const makeImportedReversal=(receipt,previousBalance)=>validatePurchaseReceiptReversalRecord({
  reversalNo:"REV-DUPLICATE-ID",
  receiptNo:receipt.receiptNo,
  purchaseNo:receipt.purchaseNo,
  sku:receipt.sku,
  quantity:receipt.quantity,
  unit:receipt.unit,
  reason:"Imported history collision fixture",
  reversedBy:"warehouse-supervisor",
  reversedAt:"2026-10-19T10:00:00Z",
  stockMovementReference:"REV-DUPLICATE-ID",
  originalStockMovementReference:receipt.stockMovementReference,
  previousBalance,
  nextBalance:previousBalance-receipt.quantity
 });
 const duplicateHistory=[
  makeImportedReversal(first.receipt,110),
  makeImportedReversal(second.receipt,80)
 ];
 assert.throws(()=>createPurchaseReceiptReversal({
  purchaseOrder:{...purchaseOrder,status:"已入库"},
  inventoryItem:{...inventoryItem,qty:50},
  receipt:third.receipt,
  existingReceipts:[first.receipt,second.receipt,third.receipt],
  existingReversals:duplicateHistory,
  existingMovementReferences:["GRN-DUP-001","GRN-DUP-002","GRN-DUP-003","REV-DUPLICATE-ID"],
  reversalNo:"REV-GRN-DUP-003",
  reversedAt:"2026-10-20T10:00:00Z",
  reversedBy:"warehouse-supervisor",
  reason:"Validate imported reversal history"
 }),/existing reversal numbers must be unique/);
});

test("purchase receipt creation rejects duplicate reversal identifiers in supplied history",()=>{
 const first=createPurchaseReceipt(receiptBase);
 const original=first.receipt;
 const movementRefs=[original.stockMovementReference,"REV-DUP-1"];
 const reversal=createPurchaseReceiptReversal({
  purchaseOrder,inventoryItem:{...inventoryItem,qty:45},receipt:original,
  existingReceipts:[original],existingReversals:[],existingMovementReferences:movementRefs,
  reversalNo:"REV-DUP-1",reversedAt:"2026-10-19T10:00:00+08:00",
  reversedBy:"operator",reason:"duplicate identifier fixture"
 }).reversal;
 assert.throws(()=>createPurchaseReceipt({
  ...receiptBase,receiptNo:"GRN-TEST-002",
  existingReceipts:[original],
  existingReversals:[reversal,{...reversal,receiptNo:"GRN-OTHER"}],
  existingMovementReferences:movementRefs
 }),/unique/);
});
