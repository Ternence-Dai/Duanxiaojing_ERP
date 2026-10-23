\set ON_ERROR_STOP on
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
 -- Verify that the sole supported posting entry point is security-definer
 -- and that the direct-insert guard is installed on the ledger.
 IF NOT (SELECT p.prosecdef FROM pg_proc p
         WHERE p.oid = 'erp.post_stock_movement(text,numeric,text,text,timestamp with time zone)'::regprocedure) THEN
  RAISE EXCEPTION 'stock posting entry point must execute with its controlled owner privileges';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgrelid='erp.stock_movement'::regclass
                  AND tgname='stock_movement_insert_only_via_posting'
                  AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'direct stock movement insert guard is missing';
 END IF;
 -- A posted movement is immutable, including bulk table clearing. Corrections
 -- must use a separately referenced compensating movement.
 BEGIN
  UPDATE erp.stock_movement SET reference='MUTATED' WHERE reference='GRN-TEST-1';
  RAISE EXCEPTION 'stock movement update was accepted';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 BEGIN
  DELETE FROM erp.stock_movement WHERE reference='GRN-TEST-1';
  RAISE EXCEPTION 'stock movement delete was accepted';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 BEGIN
  EXECUTE 'TRUNCATE erp.stock_movement';
  RAISE EXCEPTION 'stock movement truncate was accepted';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 IF (SELECT count(*) FROM erp.stock_movement WHERE sku='TEST-FABRIC') <> 2 THEN
  RAISE EXCEPTION 'immutable ledger rows were changed by a rejected mutation';
 END IF;
END $$;
