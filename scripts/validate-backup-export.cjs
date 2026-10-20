const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "assets/js/legacy-app.js"), "utf8");
const seed = fs.readFileSync(path.join(root, "assets/js/demo-seed-data.js"), "utf8");
const exportStart = app.indexOf("function exportAll(){");
const exportEnd = app.indexOf("\nfunction importAll(", exportStart);
assert.ok(exportStart >= 0 && exportEnd > exportStart, "exportAll must remain present");
const exportCode = app.slice(exportStart, exportEnd);
assert.match(seed, /dataProvenance:\s*'demo-seed'/);
assert.match(exportCode, /if\(storageRecoveryRequired\)[\s\S]*?return;/);
assert.match(exportCode, /if\(!isValidDBShape\(DB\)\)[\s\S]*?return;/);
assert.match(app, /function isDemoSeedData\(data\)/);
assert.match(exportCode, /演示样例_非真实备份/);
assert.match(exportCode, /不得作为企业业务备份使用/);

const readStart = app.indexOf("async function readFromFile(){");
const readEnd = app.indexOf("\nasync function bindLocalFile()", readStart);
assert.ok(readStart >= 0 && readEnd > readStart, "readFromFile must remain present");
const readCode = app.slice(readStart, readEnd);
assert.match(readCode, /const candidate = JSON.parse\(text\)/);
assert.match(readCode, /if\(!isValidDBShape\(candidate\)\) return false/);
assert.ok(readCode.indexOf("localStorage.setItem(STORE_KEY, JSON.stringify(candidate))") < readCode.indexOf("DB = candidate"),
  "in-memory data must only switch after browser cache commit");
assert.match(readCode, /浏览器缓存提交失败[\s\S]*?return false/);
assert.ok(readCode.indexOf("DB = candidate") < readCode.indexOf("storageRecoveryRequired = false"),
  "recovery lock must only clear after the candidate is committed");
console.log("ERP backup export and atomic file-restore safety checks passed.");
