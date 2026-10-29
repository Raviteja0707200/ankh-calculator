/**
 * 07-boundary-performance.test.js
 * Boundary conditions and performance requirements: 1000 nested parentheses,
 * 50,000-character expressions, 1000-digit numbers, large financial
 * calculations, and O(n) timing sanity checks.
 */

'use strict';

const path = require('path');
const { test, testError, assertTrue, section, printSummary } = require('./test-harness.js');
const CORE = path.join(__dirname, '..', 'core');
const { Tokenizer } = require(path.join(CORE, 'tokenizer.js'));
const { Validator } = require(path.join(CORE, 'validator.js'));
const { Parser } = require(path.join(CORE, 'parser.js'));
const { Evaluator } = require(path.join(CORE, 'evaluator.js'));

function timedEval(expr) {
  const start = Date.now();
  const tokens = new Tokenizer(expr).tokenize();
  new Validator(tokens).validate();
  const postfix = new Parser(tokens).toPostfix();
  const result = new Evaluator(postfix).evaluate();
  return { result, ms: Date.now() - start };
}

// ---------------------------------------------------------------------------
section('boundary: exactly at MAX_PAREN_DEPTH (1000) should succeed');
// ---------------------------------------------------------------------------
{
  const expr = '('.repeat(999) + '5' + ')'.repeat(999);
  test(expr, '5');
}
{
  const expr = '('.repeat(1001) + '5' + ')'.repeat(1001);
  testError(expr, 'TOO_DEEP');
}

// ---------------------------------------------------------------------------
section('boundary: expression length at/near MAX_EXPRESSION_LENGTH (50000)');
// ---------------------------------------------------------------------------
{
  // Build a long valid chain just under the limit using array join (avoid O(n^2) string concat).
  const parts = ['1'];
  let len = 1;
  while (len < 49990) {
    parts.push('+1');
    len += 2;
  }
  const expr = parts.join('');
  assertTrue(expr.length <= 50000, `expression under length limit (actual ${expr.length})`);
  const { result, ms } = timedEval(expr);
  assertTrue(result.toString() === String(parts.length), `long chain evaluates correctly (${parts.length} ones)`);
  assertTrue(ms < 5000, `long chain evaluates in reasonable time (${ms}ms)`);
}
{
  const tooLong = '1'.repeat(50001);
  testError(tooLong, 'TOO_LONG');
}

// ---------------------------------------------------------------------------
section('boundary: 1000-digit numbers');
// ---------------------------------------------------------------------------
{
  const bigNum = '7'.repeat(1000);
  test(bigNum, bigNum);
}
{
  const bigNum = '9'.repeat(1000);
  test(`${bigNum}+1`, '1' + '0'.repeat(1000));
}
{
  const tooManyDigits = '1'.repeat(1001);
  testError(tooManyDigits, 'OVERFLOW');
}

// ---------------------------------------------------------------------------
section('boundary: large financial calculations');
// ---------------------------------------------------------------------------
test('SI(100000000,15,30)', '450000000');
test('CI(100000000,10,10)', '159374246.01'); // exact: 1.1=11/10, so 1.1^10=11^10/10^10 has a terminating decimal expansion

// ---------------------------------------------------------------------------
section('performance: O(n) sanity checks (should complete well under a few seconds)');
// ---------------------------------------------------------------------------
{
  const parts = ['2'];
  for (let i = 0; i < 5000; i++) parts.push('*1');
  const expr = parts.join('');
  const { result, ms } = timedEval(expr);
  assertTrue(result.toString() === '2', `5000-term multiplication chain correct (${ms}ms)`);
  assertTrue(ms < 3000, `5000-term chain fast enough (${ms}ms)`);
}
{
  const expr = '('.repeat(999) + '1+1' + ')'.repeat(999);
  const { result, ms } = timedEval(expr);
  assertTrue(result.toString() === '2', `999-deep nested parens correct (${ms}ms)`);
  assertTrue(ms < 2000, `999-deep nested parens fast enough (${ms}ms)`);
}

// ---------------------------------------------------------------------------
section('boundary: smallest / largest representable decimals in this engine');
// ---------------------------------------------------------------------------
test('0.00025', '0.00025');
test('0.' + '0'.repeat(20) + '1', '0.' + '0'.repeat(20) + '1');
test('1' + '0'.repeat(50), '1' + '0'.repeat(50));

// ---------------------------------------------------------------------------
section('boundary: factorial cap (100000)');
// ---------------------------------------------------------------------------
testError('100001!', 'OVERFLOW');
{
  // 100000! is permitted by the cap but extremely expensive to compute exactly;
  // we instead verify a moderately large factorial completes quickly and correctly.
  const { result, ms } = timedEval('100!');
  assertTrue(ms < 1000, `100! computes quickly (${ms}ms)`);
  assertTrue(result.toString().length === 158, '100! has the correct digit count (158)');
}

if (require.main === module) {
  const { failCount } = printSummary('BOUNDARY CONDITIONS & PERFORMANCE');
  process.exitCode = failCount > 0 ? 1 : 0;
}
