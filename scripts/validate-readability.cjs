'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('assets/css/readability-accessibility-v10.css', 'utf8');
assert.match(html, /readability-accessibility-v10\.css/, 'readability baseline must load on the app shell');
assert.match(html, /readability-accessibility-v10\.css[^"']*["'][^>]*>\s*<\/head>/s,
  'readability baseline must be the final stylesheet so legacy rules cannot shrink text afterward');
assert.match(css, /body\s*\{[^}]*font-size:\s*16px\s*!important/s, 'body copy must start at 16px');
assert.match(css, /font-size:\s*max\(14px,\s*1em\)\s*!important/, 'supporting text must not fall below 14px');
assert.match(css, /input, select, textarea, button\)\s*\{[^}]*font-size:\s*16px/s, 'interactive controls must use readable 16px text');
assert.match(css, /:focus-visible[^}]*outline:\s*3px/s, 'keyboard focus must remain clearly visible');
assert.match(css, /prefers-reduced-motion:\s*reduce/, 'reduced-motion preference must be respected');
console.log('Readability baseline checks passed.');
