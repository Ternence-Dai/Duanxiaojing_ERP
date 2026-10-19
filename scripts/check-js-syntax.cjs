#!/usr/bin/env node
"use strict";

// Cross-platform syntax gate for browser code and Node-side project code.
// This parses files without executing browser-dependent scripts.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const roots = ["assets/js", "src", "test", "tests", "scripts"];
const extensions = new Set([".js", ".cjs", ".mjs"]);
const files = [];

function walk(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(child);
  }
}

for (const directory of roots) walk(directory);
const uniqueFiles = [...new Set(files)].sort();
if (uniqueFiles.length === 0) {
  console.error("No JavaScript files found in the configured project directories.");
  process.exit(1);
}

let failed = 0;
for (const file of uniqueFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root, encoding: "utf8", windowsHide: true
  });
  if (result.status !== 0) {
    failed += 1;
    console.error("\n[SYNTAX ERROR] " + file);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

if (failed > 0) {
  console.error("\nJavaScript syntax validation failed: " + failed + " of " + uniqueFiles.length + " file(s).");
  process.exit(1);
}
console.log("JavaScript syntax validation passed: " + uniqueFiles.length + " file(s) across " + roots.join(", ") + ".");
