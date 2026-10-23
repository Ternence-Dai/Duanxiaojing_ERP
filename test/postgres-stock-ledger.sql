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


-- Prove that an ordinary non-owner application role cannot bypass the posting
-- function with a direct INSERT, even if a broad INSERT grant is accidentally
-- present, while the SECURITY DEFINER entry point still works.
DO $role_setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app_test') THEN
    CREATE ROLE erp_app_test NOLOGIN;
  END IF;
END
$role_setup$;
GRANT USAGE ON SCHEMA erp TO erp_app_test;
GRANT SELECT, INSERT ON erp.inventory_item, erp.stock_movement TO erp_app_test;
GRANT EXECUTE ON FUNCTION erp.post_stock_movement(text,numeric,text,text,timestamptz) TO erp_app_test;

SET ROLE erp_app_test;
DO $app_role_test$
DECLARE v_direct_insert_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO erp.stock_movement(
      sku, quantity_delta, reference, source_type, occurred_at, previous_balance, next_balance
    ) VALUES (
      'TEST-FABRIC', 1, 'APP-DIRECT-BYPASS', 'test',
      clock_timestamp(), 11, 12
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_direct_insert_rejected := true;
  END;
  IF NOT v_direct_insert_rejected THEN
    RAISE EXCEPTION 'non-owner application role bypassed the stock posting function';
  END IF;

  PERFORM erp.post_stock_movement('TEST-FABRIC', 1, 'APP-POSTING-1', 'test');
END
$app_role_test$;
RESET ROLE;

DO $app_role_balance$
BEGIN
  IF (SELECT on_hand FROM erp.inventory_item WHERE sku='TEST-FABRIC') <> 12.000 THEN
    RAISE EXCEPTION 'security-definer posting did not update the stock balance';
  END IF;
  IF EXISTS (SELECT 1 FROM erp.stock_movement WHERE reference='APP-DIRECT-BYPASS') THEN
    RAISE EXCEPTION 'direct application insert unexpectedly created a stock movement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM erp.stock_movement WHERE reference='APP-POSTING-1') THEN
    RAISE EXCEPTION 'application posting function did not append its movement';
  END IF;
END
$app_role_balance$;

-- Reject PostgreSQL's special NaN numeric value before ledger arithmetic.
DO $$ BEGIN
  BEGIN
    PERFORM erp.post_stock_movement('TEST-FABRIC', 'NaN'::numeric, 'NAN-QUANTITY', 'test');
    RAISE EXCEPTION 'NaN quantity was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT on_hand FROM erp.inventory_item WHERE sku='TEST-FABRIC') <> 12.000 THEN
    RAISE EXCEPTION 'rejected NaN posting changed inventory balance';
  END IF;
END $$;
