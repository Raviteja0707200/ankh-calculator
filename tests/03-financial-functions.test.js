/**
 * 03-financial-functions.test.js
 * Simple Interest SI(P,R,T) and Compound Interest CI(P,R,T).
 */

'use strict';

const { test, testError, section, printSummary } = require('./test-harness.js');

// ---------------------------------------------------------------------------
section('SI: basic cases — (P*R*T)/100');
// ---------------------------------------------------------------------------
test('SI(100,5,2)', '10');
test('SI(1000,10,1)', '100');
test('SI(1000,10,2)', '200');
test('SI(1000,10,3)', '300');
test('SI(5000,8,2)', '800');
test('SI(10000,12,5)', '6000');
test('SI(100,100,1)', '100');
test('SI(100,0,5)', '0');
test('SI(0,10,5)', '0');
test('SI(100,10,0)', '0');
test('SI(1,1,1)', '0.01');
test('SI(2500,7.5,4)', '750');
test('SI(150000,9.25,3)', '41625');
test('SI(1250000,8.5,3)', '318750');
test('SI(100000,6,1)', '6000');
test('SI(100000,6,0.5)', '3000');

// SI manual cross-checks (P*R*T/100)
for (const [P, R, T] of [[1000, 5, 2], [2000, 7, 3], [50000, 9, 4], [123456, 3.5, 2], [999, 11, 6]]) {
  const expected = (P * R * T) / 100;
  test(`SI(${P},${R},${T})`, String(expected));
}

// ---------------------------------------------------------------------------
section('CI: basic cases — P*(1+R/100)^T - P');
// ---------------------------------------------------------------------------
test('CI(1000,10,2)', '210');           // 1000*1.1^2=1210, interest=210
test('CI(1000,10,1)', '100');           // 1000*1.1=1100, interest=100
test('CI(1000,10,0)', '0');             // T=0 -> no growth
test('CI(1000,0,5)', '0');              // R=0 -> no growth
test('CI(0,10,5)', '0');                // P=0 -> no growth
test('CI(100,100,1)', '100');           // 100*2=200, interest=100
test('CI(100,100,2)', '300');           // 100*4=400, interest=300
test('CI(10000,5,2)', '1025');          // 10000*1.05^2=11025
test('CI(20000,10,3)', '6620');         // 20000*1.1^3=26620
test('CI(1250000,8.5,3)', '346611.40625');

// ---------------------------------------------------------------------------
section('SI / CI combined with other operators');
// ---------------------------------------------------------------------------
test('SI(1000,10,2)+100', '300');
test('CI(1000,10,2)-10', '200');
test('SI(1000,10,2)+CI(1000,10,2)', '410');
test('SI(1000,10,2)*2', '400');
test('(SI(1000,10,2))', '200');

// ---------------------------------------------------------------------------
section('SI / CI: argument count errors');
// ---------------------------------------------------------------------------
testError('SI(100,5)', 'ARGUMENT_COUNT');
testError('SI(100,5,2,9)', 'ARGUMENT_COUNT');
testError('SI(100)', 'ARGUMENT_COUNT');
testError('SI()', 'INVALID_EXPRESSION'); // empty parentheses caught before arity check
testError('CI(100,5)', 'ARGUMENT_COUNT');
testError('CI(100,5,2,9)', 'ARGUMENT_COUNT');
testError('CI()', 'INVALID_EXPRESSION'); // empty parentheses caught before arity check

// ---------------------------------------------------------------------------
section('SI / CI: negative principal/time rejected');
// ---------------------------------------------------------------------------
testError('SI(-100,5,2)', 'INVALID_ARGUMENT');
testError('SI(100,5,-2)', 'INVALID_ARGUMENT');
testError('CI(-100,5,2)', 'INVALID_ARGUMENT');
testError('CI(100,5,-2)', 'INVALID_ARGUMENT');

// ---------------------------------------------------------------------------
section('SI / CI: negative rate is permitted (depreciation-style)');
// ---------------------------------------------------------------------------
test('SI(1000,-10,2)', '-200');
test('CI(1000,-50,1)', '-500'); // 1000*0.5 - 1000 = -500

// ---------------------------------------------------------------------------
section('SI / CI: nested inside larger expressions');
// ---------------------------------------------------------------------------
test('SI(1000,10,1)+SI(1000,10,1)', '200');
test('CI(SI(1000,10,1)*10,5,1)', '50'); // SI(...)=100, *10=1000, CI(1000,5,1)=1000*1.05-1000=50

if (require.main === module) {
  const { failCount } = printSummary('FINANCIAL FUNCTIONS (SI / CI)');
  process.exitCode = failCount > 0 ? 1 : 0;
}
