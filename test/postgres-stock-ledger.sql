\set ON_ERROR_STOP on
TRUNCATE erp.stock_movement RESTART IDENTITY;
DELETE FROM erp.inventory_item WHERE sku IN ('TEST-FABRIC','RACE-FABRIC');
INSERT INTO erp.inventory_item(sku,on_hand) VALUES ('TEST-FABRIC',10.000),('RACE-FABRIC',1.000);
SELECT (erp.post_stock_movement('TEST-FABRIC',2.125,'GRN-TEST-1','purchase-receipt')).next_balance;
SELECT (erp.post_stock_movement('TEST-FABRIC',-1.125,'ISSUE-TEST-1','material-issue')).next_balance;
DO $$
BEGIN
 IF (SELECT on_hand FROM erp.inventory_item WHERE sku='TEST-FABRIC') <> 11.000 THEN
  RAISE EXCEPTION 'unexpected sequential stock balance';
 END IF;
 IF (SELECT count(*) FROM erp.stock_movement WHERE sku='TEST-FABRIC') <> 2 THEN
  RAISE EXCEPTION 'stock movement count mismatch';
 END IF;
 BEGIN
  PERFORM erp.post_stock_movement('TEST-FABRIC',1,'GRN-TEST-1','purchase-receipt');
  RAISE EXCEPTION 'duplicate reference was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  PERFORM erp.post_stock_movement('TEST-FABRIC',-999,'ISSUE-TOO-LARGE','material-issue');
  RAISE EXCEPTION 'negative stock was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  PERFORM erp.post_stock_movement('TEST-FABRIC',0.0001,'ISSUE-PRECISION','material-issue');
  RAISE EXCEPTION 'over-precision quantity was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $$;
