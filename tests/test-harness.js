/**
 * test-harness.js
 * -----------------------------------------------------------------------------
 * Minimal, dependency-free test harness shared by every test file in this
 * directory. Provides `test()`, `section()`, and a final summary printer.
 * Run any test file directly with Node: `node tests/01-arithmetic.test.js`
 * or run the whole suite via `node tests/run-all.js`.
 * -----------------------------------------------------------------------------
 */

'use strict';

const path = require('path');

const CORE = path.join(__dirname, '..', 'core');
const { Tokenizer, CalculatorError } = require(path.join(CORE, 'tokenizer.js'));
const { Validator } = require(path.join(CORE, 'validator.js'));
const { Parser } = require(path.join(CORE, 'parser.js'));
const { Evaluator } = require(path.join(CORE, 'evaluator.js'));
const { BigDecimal } = require(path.join(CORE, 'bigdecimal.js'));
const { Formatter } = require(path.join(CORE, 'formatter.js'));
const { IndianWords } = require(path.join(CORE, 'indianWords.js'));

let passCount = 0;
let failCount = 0;
const failures = [];
let currentSection = '';

function section(name) {
  currentSection = name;
}

/** Evaluate a full expression through the real engine pipeline. Returns the result string, or throws CalculatorError. */
function evalExpr(expr) {
  const tokens = new Tokenizer(expr).tokenize();
  new Validator(tokens).validate();
  const postfix = new Parser(tokens).toPostfix();
  return new Evaluator(postfix).evaluate();
}

/** Assert evalExpr(expr) === expected (string comparison of the BigDecimal's toString()). */
function test(expr, expected) {
  let actual;
  try {
    actual = evalExpr(expr).toString();
  } catch (e) {
    failCount++;
    failures.push(`[${currentSection}] "${expr}" threw ${e.code || e.name}: ${e.message} (expected "${expected}")`);
    return;
  }
  if (actual === expected) {
    passCount++;
  } else {
    failCount++;
    failures.push(`[${currentSection}] "${expr}" => "${actual}" (expected "${expected}")`);
  }
}

/** Assert evalExpr(expr) throws a CalculatorError with the given code. */
function testError(expr, expectedCode) {
  try {
    const result = evalExpr(expr);
    failCount++;
    failures.push(`[${currentSection}] "${expr}" did not throw (got "${result.toString()}", expected error ${expectedCode})`);
  } catch (e) {
    if (e.code === expectedCode) {
      passCount++;
    } else {
      failCount++;
      failures.push(`[${currentSection}] "${expr}" threw ${e.code} (expected ${expectedCode})`);
    }
  }
}

/** Assert an arbitrary boolean condition, for cases that don't fit the expr/expected pattern. */
function assertTrue(condition, description) {
  if (condition) {
    passCount++;
  } else {
    failCount++;
    failures.push(`[${currentSection}] ${description}`);
  }
}

/** Assert Formatter.toIndianFormat(value) === expected. */
function testFormat(value, expected) {
  const actual = Formatter.toIndianFormat(value);
  if (actual === expected) {
    passCount++;
  } else {
    failCount++;
    failures.push(`[${currentSection}] format("${value}") => "${actual}" (expected "${expected}")`);
  }
}

/** Assert IndianWords.toWords(value, opts) === expected. */
function testWords(value, expected, opts) {
  const actual = IndianWords.toWords(value, opts);
  if (actual === expected) {
    passCount++;
  } else {
    failCount++;
    failures.push(`[${currentSection}] words("${value}") => "${actual}" (expected "${expected}")`);
  }
}

function printSummary(label) {
  const total = passCount + failCount;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label || 'TEST SUMMARY'}: ${passCount}/${total} passed`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} FAILURES:`);
    failures.slice(0, 50).forEach((f) => console.log('  - ' + f));
    if (failures.length > 50) console.log(`  ... and ${failures.length - 50} more`);
  }
  console.log('='.repeat(70));
  return { passCount, failCount, total };
}

module.exports = {
  test, testError, assertTrue, testFormat, testWords, section, printSummary,
  evalExpr, BigDecimal, Formatter, IndianWords,
  getCounts: () => ({ passCount, failCount })
};
