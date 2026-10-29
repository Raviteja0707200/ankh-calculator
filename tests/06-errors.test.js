/**
 * 06-errors.test.js
 * Invalid expressions and error classification: division by zero, malformed
 * syntax, missing parens, unknown functions/operators, invalid decimals,
 * invalid factorials, negative square roots, unexpected tokens, overflow.
 */

'use strict';

const { testError, section, printSummary } = require('./test-harness.js');

// ---------------------------------------------------------------------------
section('division by zero');
// ---------------------------------------------------------------------------
testError('5/0', 'DIVISION_BY_ZERO');
testError('0/0', 'DIVISION_BY_ZERO');
testError('-5/0', 'DIVISION_BY_ZERO');
testError('100/(5-5)', 'DIVISION_BY_ZERO');
testError('1/0', 'DIVISION_BY_ZERO');
testError('(1+2)/(3-3)', 'DIVISION_BY_ZERO');
testError('5/0.0', 'DIVISION_BY_ZERO');
testError('5%/0%', 'DIVISION_BY_ZERO'); // 5%=0.05, 0%=0 -> divide by zero
testError('0^-1', 'DIVISION_BY_ZERO');
testError('0^-5', 'DIVISION_BY_ZERO');

// ---------------------------------------------------------------------------
section('empty / whitespace-only expressions');
// ---------------------------------------------------------------------------
testError('', 'EMPTY_EXPRESSION');
testError('   ', 'EMPTY_EXPRESSION');

// ---------------------------------------------------------------------------
section('missing / unmatched parentheses');
// ---------------------------------------------------------------------------
testError('(5+3', 'MISSING_PARENTHESIS');
testError('5+3)', 'MISSING_PARENTHESIS');
testError('((5+3)', 'MISSING_PARENTHESIS');
testError('(5+3))', 'MISSING_PARENTHESIS');
testError('(((1+2))', 'MISSING_PARENTHESIS');
testError('(1+2)))', 'MISSING_PARENTHESIS');
testError(')', 'MISSING_PARENTHESIS');
testError('(', 'MISSING_PARENTHESIS');
testError('SI(100,5,2', 'MISSING_PARENTHESIS');
testError('((((((1+1', 'MISSING_PARENTHESIS');

// ---------------------------------------------------------------------------
section('empty parentheses');
// ---------------------------------------------------------------------------
testError('()', 'INVALID_EXPRESSION');
testError('5+()', 'INVALID_EXPRESSION');
testError('()+5', 'INVALID_EXPRESSION');
testError('(())', 'INVALID_EXPRESSION');

// ---------------------------------------------------------------------------
section('unknown functions');
// ---------------------------------------------------------------------------
testError('XYZ(5)', 'UNKNOWN_FUNCTION');
testError('FOO(1,2,3)', 'UNKNOWN_FUNCTION');
testError('sin(5)', 'UNKNOWN_FUNCTION');
testError('cos(5)', 'UNKNOWN_FUNCTION');
testError('LOG(5)', 'UNKNOWN_FUNCTION');
testError('ABC(1,2)', 'UNKNOWN_FUNCTION');

// ---------------------------------------------------------------------------
section('unexpected / illegal characters');
// ---------------------------------------------------------------------------
testError('5@3', 'UNEXPECTED_TOKEN');
testError('5#3', 'UNEXPECTED_TOKEN');
testError('5$3', 'UNEXPECTED_TOKEN');
testError('5&3', 'UNEXPECTED_TOKEN');
testError('abc', 'UNKNOWN_FUNCTION'); // letters route through identifier reading -> unknown function
testError('5_3', 'UNEXPECTED_TOKEN');
testError('5~3', 'UNEXPECTED_TOKEN');

// ---------------------------------------------------------------------------
section('invalid decimals');
// ---------------------------------------------------------------------------
testError('5.5.5', 'INVALID_DECIMAL');
testError('1.2.3.4', 'INVALID_DECIMAL');
testError('.', 'UNEXPECTED_TOKEN');
testError('5..5', 'INVALID_DECIMAL');

// ---------------------------------------------------------------------------
section('invalid factorials');
// ---------------------------------------------------------------------------
testError('(-1)!', 'INVALID_FACTORIAL');
testError('(-100)!', 'INVALID_FACTORIAL');
testError('5.5!', 'INVALID_FACTORIAL');
testError('0.1!', 'INVALID_FACTORIAL');
testError('(-0.5)!', 'INVALID_FACTORIAL');
testError('(1.1+1.1)!', 'INVALID_FACTORIAL'); // 2.2 is not an integer

// ---------------------------------------------------------------------------
section('negative square root');
// ---------------------------------------------------------------------------
testError('√-1', 'NEGATIVE_SQRT');
testError('√-4', 'NEGATIVE_SQRT');
testError('√(-100)', 'NEGATIVE_SQRT');
testError('√(0-25)', 'NEGATIVE_SQRT');

// ---------------------------------------------------------------------------
section('malformed operator sequences');
// ---------------------------------------------------------------------------
testError('5+*3', 'INVALID_EXPRESSION');
testError('5*/3', 'INVALID_EXPRESSION');
testError('5//3', 'INVALID_EXPRESSION');
testError('5^^3', 'INVALID_EXPRESSION');
testError('*5', 'INVALID_EXPRESSION');
testError('/5', 'INVALID_EXPRESSION');
testError('^5', 'INVALID_EXPRESSION');
testError('5*', 'INVALID_EXPRESSION');
testError('5/', 'INVALID_EXPRESSION');
testError('5^', 'INVALID_EXPRESSION');
testError('5+', 'INVALID_EXPRESSION');

// ---------------------------------------------------------------------------
section('missing operators between operands');
// ---------------------------------------------------------------------------
testError('5 5', 'INVALID_EXPRESSION');
testError('5(3)', 'INVALID_EXPRESSION');
testError('(3)5', 'INVALID_EXPRESSION');
testError('5SI(1,2,3)', 'INVALID_EXPRESSION');

// ---------------------------------------------------------------------------
section('comma misuse');
// ---------------------------------------------------------------------------
testError('5,3', 'INVALID_EXPRESSION');
testError('(5,3)', 'INVALID_EXPRESSION');
testError(',5', 'INVALID_EXPRESSION');
testError('5,', 'INVALID_EXPRESSION');

// ---------------------------------------------------------------------------
section('wrong function arity');
// ---------------------------------------------------------------------------
testError('SI(1,2)', 'ARGUMENT_COUNT');
testError('SI(1,2,3,4)', 'ARGUMENT_COUNT');
testError('CI(1,2)', 'ARGUMENT_COUNT');
testError('CI(1,2,3,4)', 'ARGUMENT_COUNT');
testError('CI(1)', 'ARGUMENT_COUNT');

// ---------------------------------------------------------------------------
section('overflow conditions');
// ---------------------------------------------------------------------------
testError('100001!', 'OVERFLOW');
testError('200000!', 'OVERFLOW');

// ---------------------------------------------------------------------------
section('length / depth limits');
// ---------------------------------------------------------------------------
{
  const tooLong = '1'.repeat(50001);
  testError(tooLong, 'TOO_LONG');
}
{
  const tooManyDigits = '1'.repeat(1001);
  testError(tooManyDigits, 'OVERFLOW');
}
{
  let tooDeep = '';
  for (let i = 0; i < 1001; i++) tooDeep += '(';
  tooDeep += '1';
  for (let i = 0; i < 1001; i++) tooDeep += ')';
  testError(tooDeep, 'TOO_DEEP');
}

if (require.main === module) {
  const { failCount } = printSummary('ERROR HANDLING');
  process.exitCode = failCount > 0 ? 1 : 0;
}
