import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../assets/js/legacy-app.js", import.meta.url), "utf8");

test("ERP cache records the value observed when a tab loads", () => {
  assert.match(source, /let lastKnownStorageValue = null/);
  assert.match(source, /raw = localStorage\.getItem\(STORE_KEY\);\s*lastKnownStorageValue = raw;/);
});

test("ERP cache refuses to overwrite a value changed since this tab loaded", () => {
  assert.match(source, /currentStorageValue !== lastKnownStorageValue/);
  assert.match(source, /storageConflictDetected = true/);
  assert.match(source, /if\(storageConflictDetected\)\s*\{/);
});

test("ERP listens for other-tab cache changes and warns that detection is not atomic", () => {
  assert.match(source, /window\.addEventListener\('storage'/);
  assert.match(source, /event\.key !== STORE_KEY/);
  assert.match(source, /localStorage has no atomic compare-and-swap/);
});
