#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT erp.post_stock_movement('RACE-FABRIC',-1,'RACE-ISSUE-A','material-issue');" >/tmp/erp-race-a.log 2>&1 &
pid_a=$!
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT erp.post_stock_movement('RACE-FABRIC',-1,'RACE-ISSUE-B','material-issue');" >/tmp/erp-race-b.log 2>&1 &
pid_b=$!
set +e
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e
successes=0
[[ $status_a -eq 0 ]] && successes=$((successes+1))
[[ $status_b -eq 0 ]] && successes=$((successes+1))
if [[ $successes -ne 1 ]]; then
 cat /tmp/erp-race-a.log /tmp/erp-race-b.log
 echo "Expected one concurrent issue to succeed; got $successes" >&2
 exit 1
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "SELECT i.on_hand || ':' || count(*) FROM erp.inventory_item i JOIN erp.stock_movement m USING (sku) WHERE i.sku='RACE-FABRIC' GROUP BY i.on_hand;" | grep -qx '0.000:1'
echo "Concurrent stock posting passed: one writer committed, one was rejected, balance remained zero."
