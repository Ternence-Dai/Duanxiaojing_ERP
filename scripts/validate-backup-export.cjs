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

const writeStart = app.indexOf("async function writeToFile(){");
const writeEnd = app.indexOf("\nasync function readFromFile()", writeStart);
assert.ok(writeStart >= 0 && writeEnd > writeStart, "writeToFile must remain present");
const writeCode = app.slice(writeStart, writeEnd);
assert.ok(writeCode.indexOf("localStorage.setItem(FILE_SYNC_PENDING_KEY, fileSyncFingerprint(") <
          writeCode.indexOf("fileHandle.createWritable()"),
  "a cache fingerprint marker must be written before modifying the bound file");
assert.match(app, /function hasMatchingPendingFileSync\(\)/);
assert.match(app, /fileSyncFingerprint\(cached\) !== marker/);
assert.match(app, /if\(fileSyncPending === null\)[\s\S]*?拒绝自动导入或覆盖本地文件/);
assert.match(writeCode, /await fileHandle.getFile\(\)/);
assert.match(writeCode, /JSON\.stringify\(verified\) !== JSON\.stringify\(JSON\.parse\(snapshot\)\)/);
assert.match(writeCode, /localStorage.removeItem\(FILE_SYNC_PENDING_KEY\)/);
assert.match(writeCode, /fileReady = false/);
assert.match(app, /if\(fileSyncPending\)[\s\S]*?以浏览器缓存覆盖同步文件|if\(fileSyncPending\)[\s\S]*?writeToFile\(\)/);
const permissionStart = app.indexOf("async function reRequestPermission()");
const permissionEnd = app.indexOf("\nfunction openHandleDB()", permissionStart);
const permissionCode = app.slice(permissionStart, permissionEnd);
assert.ok(permissionCode.indexOf("if(fileSyncPending)") < permissionCode.indexOf("readFromFile()"),
  "permission recovery must push the browser copy before considering a file import");
console.log("ERP backup export, atomic restore, and file-sync recovery checks passed.");
