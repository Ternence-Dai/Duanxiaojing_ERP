CREATE SCHEMA IF NOT EXISTS erp;
CREATE TABLE IF NOT EXISTS erp.inventory_item (
  sku text PRIMARY KEY CHECK (length(btrim(sku)) > 0),
  on_hand numeric(18,3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS erp.stock_movement (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku text NOT NULL REFERENCES erp.inventory_item(sku) ON UPDATE RESTRICT ON DELETE RESTRICT,
  quantity_delta numeric(18,3) NOT NULL CHECK (quantity_delta <> 0),
  reference text NOT NULL CHECK (length(btrim(reference)) > 0),
  source_type text NOT NULL CHECK (length(btrim(source_type)) > 0),
  occurred_at timestamptz NOT NULL,
  previous_balance numeric(18,3) NOT NULL CHECK (previous_balance >= 0),
  next_balance numeric(18,3) NOT NULL CHECK (next_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT stock_movement_reference_once UNIQUE (source_type, reference),
  CONSTRAINT stock_movement_balance_equation CHECK (next_balance = previous_balance + quantity_delta)
);
CREATE INDEX IF NOT EXISTS stock_movement_sku_occurred_idx
  ON erp.stock_movement (sku, occurred_at DESC, id DESC);

CREATE OR REPLACE FUNCTION erp.post_stock_movement(
  p_sku text, p_quantity_delta numeric, p_reference text,
  p_source_type text, p_occurred_at timestamptz DEFAULT clock_timestamp()
) RETURNS erp.stock_movement
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, erp
AS $$
DECLARE v_previous numeric(18,3); v_next numeric(18,3); v_row erp.stock_movement;
BEGIN
  IF p_sku IS NULL OR length(btrim(p_sku))=0 OR p_reference IS NULL OR length(btrim(p_reference))=0
     OR p_source_type IS NULL OR length(btrim(p_source_type))=0 OR p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'SKU, business reference, source type and timestamp are required' USING ERRCODE='22023';
  END IF;
  IF p_quantity_delta IS NULL OR p_quantity_delta=0 OR p_quantity_delta<>trunc(p_quantity_delta,3) THEN
    RAISE EXCEPTION 'Quantity delta must be non-zero and precise to at most three decimals' USING ERRCODE='22023';
  END IF;
  -- Serializes concurrent writers for this SKU across independent DB sessions.
  SELECT on_hand INTO v_previous FROM erp.inventory_item WHERE sku=p_sku FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown inventory SKU: %',p_sku USING ERRCODE='23503'; END IF;
  v_next := v_previous + p_quantity_delta;
  IF v_next < 0 THEN RAISE EXCEPTION 'Stock cannot become negative for SKU %',p_sku USING ERRCODE='23514'; END IF;
  INSERT INTO erp.stock_movement(sku,quantity_delta,reference,source_type,occurred_at,previous_balance,next_balance)
  VALUES(p_sku,p_quantity_delta,btrim(p_reference),btrim(p_source_type),p_occurred_at,v_previous,v_next)
  RETURNING * INTO v_row;
  UPDATE erp.inventory_item SET on_hand=v_next,updated_at=clock_timestamp() WHERE sku=p_sku;
  RETURN v_row;
END $$;
COMMENT ON FUNCTION erp.post_stock_movement(text,numeric,text,text,timestamptz) IS
'Atomically appends a referenced stock movement and updates the SKU balance under a row lock.';

 
-- The ledger is an audit record, not a mutable balance cache. Corrections must
-- be represented by a new compensating movement through post_stock_movement.
-- Application connections must use a non-owner database role. The posting
-- function runs as the table owner; direct INSERTs by application roles are
-- rejected even if an overly broad INSERT grant is accidentally added.
CREATE OR REPLACE FUNCTION erp.reject_stock_movement_direct_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, erp
AS $
DECLARE v_owner name;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO v_owner
    FROM pg_class c
    WHERE c.oid = 'erp.stock_movement'::regclass;
  IF current_user <> v_owner THEN
    RAISE EXCEPTION 'Stock movements must be posted through erp.post_stock_movement'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$;

DROP TRIGGER IF EXISTS stock_movement_insert_only_via_posting ON erp.stock_movement;
CREATE TRIGGER stock_movement_insert_only_via_posting
  BEFORE INSERT ON erp.stock_movement
  FOR EACH ROW EXECUTE FUNCTION erp.reject_stock_movement_direct_insert();

REVOKE INSERT ON erp.stock_movement FROM PUBLIC;
COMMENT ON FUNCTION erp.post_stock_movement(text,numeric,text,text,timestamptz) IS
'Security-definer entry point: atomically appends a referenced stock movement and updates the SKU balance under a row lock. Application roles must not own the ledger table.';

CREATE OR REPLACE FUNCTION erp.reject_stock_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, erp
AS $$
BEGIN
  RAISE EXCEPTION 'Stock movement history is immutable; post a compensating movement instead'
    USING ERRCODE = '55000';
END
$$;

DROP TRIGGER IF EXISTS stock_movement_no_row_mutation ON erp.stock_movement;
CREATE TRIGGER stock_movement_no_row_mutation
  BEFORE UPDATE OR DELETE ON erp.stock_movement
  FOR EACH ROW EXECUTE FUNCTION erp.reject_stock_movement_mutation();

DROP TRIGGER IF EXISTS stock_movement_no_truncate ON erp.stock_movement;
CREATE TRIGGER stock_movement_no_truncate
  BEFORE TRUNCATE ON erp.stock_movement
  FOR EACH STATEMENT EXECUTE FUNCTION erp.reject_stock_movement_mutation();
