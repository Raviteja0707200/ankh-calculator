/**
 * functions.js
 * -----------------------------------------------------------------------------
 * Implements the named functions available in expressions: SI, CI, SQRT, CBRT.
 * All operate on and return BigDecimal values for exact arithmetic.
 *
 *   SI(P, R, T)  = (P * R * T) / 100                     — Simple Interest
 *   CI(P, R, T)  = P * (1 + R/100)^T  -  P                — Compound Interest
 *
 * Note: the brief's formula "P × (1 + R/100)^T" describes the MATURITY VALUE,
 * not the interest earned. To stay consistent with SI (which returns the
 * interest amount, not P+SI), CI here returns the compound INTEREST earned
 * (maturity value minus principal). This mirrors how SI/CI are taught and
 * compared side-by-side in Indian finance coursework. The maturity value can
 * be derived by the caller as P + CI(...) if needed.
 * -----------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { BigDecimal } = isNode ? require('./bigdecimal.js') : global;
  const { ErrorCode } = isNode ? require('./constants.js') : global;
  const { CalculatorError } = isNode ? require('./tokenizer.js') : global;

  const HUNDRED = new BigDecimal('100');
  const ONE = new BigDecimal('1');

  function assertNonNegative(value, label, position) {
    if (value.isNegative()) {
      throw new CalculatorError(
        ErrorCode.INVALID_ARGUMENT,
        `${label} must not be negative`,
        position
      );
    }
  }

  const CalcFunctions = {
    /** Simple Interest: (P * R * T) / 100 */
    SI(args, position) {
      const [P, R, T] = args;
      assertNonNegative(P, 'Principal (P)', position);
      assertNonNegative(T, 'Time (T)', position);
      return P.multiply(R).multiply(T).divide(HUNDRED);
    },

    /** Compound Interest earned: P * (1 + R/100)^T - P */
    CI(args, position) {
      const [P, R, T] = args;
      assertNonNegative(P, 'Principal (P)', position);
      assertNonNegative(T, 'Time (T)', position);
      const rateFactor = ONE.add(R.divide(HUNDRED));
      const maturity = P.multiply(rateFactor.pow(T));
      return maturity.subtract(P);
    },

    /** Square root. */
    SQRT(args, position) {
      const [x] = args;
      try {
        return x.nthRoot(2);
      } catch (e) {
        if (e.message === 'NEGATIVE_SQRT') {
          throw new CalculatorError(
            ErrorCode.NEGATIVE_SQRT,
            'Cannot take the square root of a negative number',
            position
          );
        }
        throw e;
      }
    },

    /** Cube root. */
    CBRT(args, position) {
      const [x] = args;
      return x.nthRoot(3);
    }
  };

  const api = { CalcFunctions };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.CalcFunctions = CalcFunctions;
  }
})(typeof window !== 'undefined' ? window : globalThis);
