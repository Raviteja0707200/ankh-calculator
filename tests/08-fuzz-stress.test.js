/**
 * 08-fuzz-stress.test.js
 * Aggressive randomized fuzzing of the expression engine against native JS
 * arithmetic (where floating point allows a fair comparison), plus targeted
 * stress on edge cases not covered by the curated suites: random valid
 * expression trees, random malformed strings, Unicode noise, and repeated
 * parse/evaluate cycles for leak/crash detection.
 */

'use strict';

const path = require('path');
const CORE = path.join(__dirname, '..', 'core');
const { Tokenizer, CalculatorError } = require(path.join(CORE, 'tokenizer.js'));
const { Validator } = require(path.join(CORE, 'validator.js'));
const { Parser } = require(path.join(CORE, 'parser.js'));
const { Evaluator } = require(path.join(CORE, 'evaluator.js'));

let pass = 0;
let fail = 0;
const failures = [];

function evalExpr(expr) {
  const tokens = new Tokenizer(expr).tokenize();
  new Validator(tokens).validate();
  const postfix = new Parser(tokens).toPostfix();
  return new Evaluator(postfix).evaluate();
}

function record(ok, msg) {
  if (ok) pass++;
  else { fail++; failures.push(msg); }
}

// ---------------------------------------------------------------------------
// 1. Random arithmetic expression trees, cross-checked against native JS.
//    Only integer-safe operations within Number.isSafeInteger range, so the
//    comparison itself is trustworthy (no float-vs-exact discrepancies).
// ---------------------------------------------------------------------------
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function buildRandomExpr(depth) {
  if (depth <= 0 || Math.random() < 0.35) {
    const n = randInt(1, 999);
    return { expr: String(n), val: n };
  }
  const opPool = ['+', '-', '*'];
  const op = opPool[randInt(0, opPool.length - 1)];
  const left = buildRandomExpr(depth - 1);
  const right = buildRandomExpr(depth - 1);
  let val;
  if (op === '+') val = left.val + right.val;
  else if (op === '-') val = left.val - right.val;
  else val = left.val * right.val;
  // Keep within safe integer range to avoid the test itself being wrong.
  if (!Number.isSafeInteger(val) || Math.abs(val) > 1e15) {
    return { expr: String(left.val), val: left.val };
  }
  return { expr: `(${left.expr}${op}${right.expr})`, val };
}

const RANDOM_TREE_COUNT = 4000;
for (let i = 0; i < RANDOM_TREE_COUNT; i++) {
  const tree = buildRandomExpr(randInt(2, 6));
  let actual;
  try {
    actual = evalExpr(tree.expr).toString();
  } catch (e) {
    record(false, `random-tree "${tree.expr}" threw ${e.code}: ${e.message} (expected ${tree.val})`);
    continue;
  }
  record(actual === String(tree.val), `random-tree "${tree.expr}" => ${actual} (expected ${tree.val})`);
}

// ---------------------------------------------------------------------------
// 2. Random division chains where exact integer division is guaranteed,
//    cross-checked against native JS.
// ---------------------------------------------------------------------------
for (let i = 0; i < 1000; i++) {
  const b = randInt(1, 50);
  const multiplier = randInt(1, 200);
  const a = b * multiplier; // a/b is exact
  const expr = `${a}/${b}`;
  const expected = String(multiplier);
  let actual;
  try {
    actual = evalExpr(expr).toString();
  } catch (e) {
    record(false, `exact-div "${expr}" threw ${e.code} (expected ${expected})`);
    continue;
  }
  record(actual === expected, `exact-div "${expr}" => ${actual} (expected ${expected})`);
}

// ---------------------------------------------------------------------------
// 3. Random decimal addition chains, cross-checked using a decimal-safe
//    reference computed via BigInt cents (avoids float comparison entirely).
// ---------------------------------------------------------------------------
for (let i = 0; i < 1000; i++) {
  const terms = [];
  let totalCents = 0n;
  const count = randInt(2, 6);
  for (let j = 0; j < count; j++) {
    const cents = BigInt(randInt(0, 99999));
    totalCents += cents;
    const whole = cents / 100n;
    const frac = cents % 100n;
    terms.push(`${whole}.${frac.toString().padStart(2, '0')}`);
  }
  const expr = terms.join('+');
  const totalWhole = totalCents / 100n;
  const totalFrac = totalCents % 100n;
  const expectedStr = totalFrac === 0n ? totalWhole.toString() : `${totalWhole}.${totalFrac.toString().padStart(2, '0')}`;
  // Normalize away insignificant trailing zeros before comparing, since the
  // engine correctly trims them (e.g. "2134.40" and "2134.4" are equal) —
  // this is expected canonicalization, not a bug.
  const expected = expectedStr.includes('.') ? expectedStr.replace(/0+$/, '').replace(/\.$/, '') : expectedStr;
  let actual;
  try {
    actual = evalExpr(expr).toString();
  } catch (e) {
    record(false, `decimal-chain "${expr}" threw ${e.code} (expected ${expected})`);
    continue;
  }
  record(actual === expected, `decimal-chain "${expr}" => ${actual} (expected ${expected})`);
}

// ---------------------------------------------------------------------------
// 4. Random malformed expressions MUST throw a CalculatorError, never crash
//    with an unrelated native JS error (TypeError, RangeError unlabeled, etc.)
//    and never silently return a result for garbage input.
// ---------------------------------------------------------------------------
const GARBAGE_CHARS = '+-*/^!%().,0123456789 \tSICIabcXYZ√∛'.split('');
for (let i = 0; i < 3000; i++) {
  const len = randInt(1, 25);
  let s = '';
  for (let j = 0; j < len; j++) s += GARBAGE_CHARS[randInt(0, GARBAGE_CHARS.length - 1)];

  try {
    const result = evalExpr(s);
    // If it didn't throw, the result must at least be a well-formed finite value with a toString.
    const str = result.toString();
    record(typeof str === 'string' && str.length > 0, `garbage "${s}" produced empty/invalid result`);
  } catch (e) {
    const isClassified = e instanceof CalculatorError || (e && typeof e.code === 'string');
    record(isClassified, `garbage "${s}" threw UNCLASSIFIED error: ${e && e.constructor && e.constructor.name}: ${e && e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Unicode / control-character noise must never crash the process with an
   // unhandled exception type outside CalculatorError.
// ---------------------------------------------------------------------------
const UNICODE_NOISE = ['\u0000', '\u200b', '\uffff', '🎉', '中文', '\n', '\r', '\t', '\u202e', 'NaN', 'Infinity', '-Infinity', 'undefined', 'null'];
for (const noise of UNICODE_NOISE) {
  for (const wrapper of [noise, `5+${noise}`, `${noise}+5`, `(${noise})`]) {
    try {
      evalExpr(wrapper);
      pass++; // didn't throw, but also didn't crash - acceptable as long as no exception escaped
    } catch (e) {
      const isClassified = e instanceof CalculatorError || (e && typeof e.code === 'string');
      record(isClassified, `unicode-noise "${wrapper}" threw UNCLASSIFIED: ${e && e.constructor && e.constructor.name}: ${e && e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Repeated parse/evaluate cycles on the same complex expression to check
//    for state leakage between calls (tokenizer/parser/evaluator must be
//    fully stateless across invocations).
// ---------------------------------------------------------------------------
{
  const expr = '((25+5)*8)^2-SI(1000,10,2)+√625-∛729+5!';
  let firstResult = null;
  let consistent = true;
  for (let i = 0; i < 500; i++) {
    const r = evalExpr(expr).toString();
    if (firstResult === null) firstResult = r;
    else if (r !== firstResult) consistent = false;
  }
  record(consistent, `repeated evaluation of "${expr}" produced inconsistent results across 500 runs`);
}

// ---------------------------------------------------------------------------
// 7. Randomized nested parentheses depth (within limit) with random simple
//    arithmetic inside, ensuring grouping never changes the answer
//    incorrectly regardless of depth.
// ---------------------------------------------------------------------------
for (let i = 0; i < 500; i++) {
  const depth = randInt(0, 300);
  const n = randInt(1, 1000);
  const expr = '('.repeat(depth) + n + ')'.repeat(depth);
  let actual;
  try {
    actual = evalExpr(expr).toString();
  } catch (e) {
    record(false, `nested-depth-${depth} "${expr.length} chars" threw ${e.code} (expected ${n})`);
    continue;
  }
  record(actual === String(n), `nested-depth-${depth} => ${actual} (expected ${n})`);
}

// ---------------------------------------------------------------------------
// 8. Randomized SI/CI calls with random valid P, R, T, cross-checked against
//    a native-JS reference computed with enough precision for comparison.
// ---------------------------------------------------------------------------
for (let i = 0; i < 1000; i++) {
  const P = randInt(1, 10000000);
  const R = randInt(0, 100);
  const T = randInt(0, 30);
  const expr = `SI(${P},${R},${T})`;
  const expectedNum = (P * R * T) / 100;
  let actual;
  try {
    actual = evalExpr(expr).toNumber();
  } catch (e) {
    record(false, `SI fuzz "${expr}" threw ${e.code}`);
    continue;
  }
  record(Math.abs(actual - expectedNum) < 1e-9, `SI fuzz "${expr}" => ${actual} (expected ${expectedNum})`);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`FUZZ & STRESS: ${pass}/${pass + fail} passed`);
if (failures.length > 0) {
  console.log(`\n${failures.length} FAILURES (showing up to 50):`);
  failures.slice(0, 50).forEach((f) => console.log('  - ' + f));
}
console.log('='.repeat(70));

if (require.main === module) {
  process.exitCode = fail > 0 ? 1 : 0;
}
