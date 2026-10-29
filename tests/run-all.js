/**
 * run-all.js
 * -----------------------------------------------------------------------------
 * Master test runner. Executes every *.test.js file in this directory in
 * order and prints a final combined pass/fail tally. Each individual test
 * file can also be run standalone (e.g. `node tests/01-arithmetic.test.js`)
 * for faster iteration during development.
 *
 * Usage:  node tests/run-all.js
 * Exit code is 0 if every suite passes, 1 otherwise (suitable for CI).
 * -----------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');

const testFiles = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

let grandPass = 0;
let grandFail = 0;
const suiteResults = [];

for (const file of testFiles) {
  // Each test file mutates the shared harness module-level counters, so we
  // run each one in a fresh child process to get an isolated, accurate count.
  const { execFileSync } = require('child_process');
  const fullPath = path.join(__dirname, file);
  let output = '';
  let exitCode = 0;
  try {
    output = execFileSync(process.execPath, [fullPath], { encoding: 'utf8' });
  } catch (e) {
    output = (e.stdout || '') + (e.stderr || '');
    exitCode = 1;
  }

  const match = output.match(/(\d+)\/(\d+) passed/);
  const passed = match ? parseInt(match[1], 10) : 0;
  const total = match ? parseInt(match[2], 10) : 0;
  const failed = total - passed;

  grandPass += passed;
  grandFail += failed;
  suiteResults.push({ file, passed, total, failed, exitCode });

  console.log(output.trim());
  console.log('');
}

console.log('#'.repeat(72));
console.log('GRAND TOTAL ACROSS ALL SUITES');
console.log('#'.repeat(72));
for (const r of suiteResults) {
  const status = r.failed === 0 ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${r.file}: ${r.passed}/${r.total}`);
}
console.log('-'.repeat(72));
console.log(`TOTAL: ${grandPass}/${grandPass + grandFail} passed across ${testFiles.length} suites`);
console.log('#'.repeat(72));

process.exitCode = grandFail > 0 ? 1 : 0;
