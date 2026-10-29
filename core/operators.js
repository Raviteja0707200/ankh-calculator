/**
 * operators.js
 * -----------------------------------------------------------------------------
 * Implements the semantics of every operator the calculator supports, working
 * purely on BigDecimal values (never native floats) to guarantee exact
 * arithmetic. This module is intentionally free of any parsing concerns — it
 * is given already-evaluated operand values and asked to combine them.
 *
 * ---------------------------------------------------------------------------
 * PERCENTAGE SEMANTICS (the one genuinely context-sensitive piece of this
 * calculator, matching how a Casio scientific calculator behaves):
 *
 *   25%             -> 0.25                      (standalone: divide by 100)
 *   500 + 10%       -> 500 + (500 * 10/100) = 550  (% of the OTHER operand, for + / -)
 *   500 - 10%       -> 500 - (500 * 10/100) = 450
 *   500 * 10%       -> 500 * (10/100)       = 50    (% is just /100, for * / /)
 *   500 / 10%       -> 500 / (10/100)       = 5000
 *
 * To support this without a lookahead grammar, the Evaluator does not resolve
 * "%" to a plain number immediately. Instead it wraps the operand in a
 * `PercentValue` marker carrying the *underlying* BigDecimal percentage
 * figure (e.g. 10 for "10%"). When a binary operator is later applied and one
 * operand is a PercentValue:
 *   - '+' or '-': the percent operand is resolved relative to the OTHER
 *      (non-percent) operand: other * (percentFigure / 100).
 *   - '*' or '/' or anything else (or if BOTH operands are percent / neither
 *     context applies): the percent operand resolves to percentFigure / 100,
 *     i.e. plain percent-as-fraction.
 * If a PercentValue reaches the end of evaluation unresolved (e.g. "25%"
 * alone), the Evaluator resolves it the same way: percentFigure / 100.
 * ---------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { BigDecimal } = isNode ? require('./bigdecimal.js') : global;
  const { ErrorCode } = isNode ? require('./constants.js') : global;
  const { CalculatorError } = isNode ? require('./tokenizer.js') : global;

  const HUNDRED = new BigDecimal('100');

  /** Wrapper marking a value as "still a raw percent figure", e.g. the 10 in "10%". */
  class PercentValue {
    constructor(figure) {
      this.figure = figure; // BigDecimal, e.g. 10 for "10%"
    }
    /** Resolve to a plain fraction (10% -> 0.1), used outside +/- context. */
    toFraction() {
      return this.figure.divide(HUNDRED);
    }
  }

  /** Unwrap a value to a plain BigDecimal, given the "other" operand for +/- percent context. */
  function resolvePercentAgainst(value, otherValue) {
    if (value instanceof PercentValue) {
      if (otherValue !== undefined) {
        return otherValue.multiply(value.toFraction());
      }
      return value.toFraction();
    }
    return value;
  }

  /** Final resolution for any value that may still be a PercentValue with no context (e.g. "25%" alone). */
  function resolveStandalone(value) {
    if (value instanceof PercentValue) return value.toFraction();
    return value;
  }

  const Operators = {
    /**
     * Apply a binary operator. `a` and `b` may be BigDecimal or PercentValue;
     * `op` is one of '+', '-', '*', '/', '^'.
     */
    applyBinary(op, a, b, position) {
      const aIsPercent = a instanceof PercentValue;
      const bIsPercent = b instanceof PercentValue;

      switch (op) {
        case '+': {
          if (bIsPercent && !aIsPercent) return a.add(resolvePercentAgainst(b, a));
          if (aIsPercent && !bIsPercent) return b.add(resolvePercentAgainst(a, b));
          return resolveStandalone(a).add(resolveStandalone(b));
        }
        case '-': {
          if (bIsPercent && !aIsPercent) return a.subtract(resolvePercentAgainst(b, a));
          if (aIsPercent && !bIsPercent) {
            // "10% - 500" is unusual but defined as: resolve 10% as a plain fraction (no other-operand context
            // applies on the left side of a subtraction the way it does on the right), then subtract.
            return resolveStandalone(a).subtract(b);
          }
          return resolveStandalone(a).subtract(resolveStandalone(b));
        }
        case '*': {
          return resolveStandalone(a).multiply(resolveStandalone(b));
        }
        case '/': {
          const denom = resolveStandalone(b);
          if (denom.isZero()) {
            throw new CalculatorError(ErrorCode.DIVISION_BY_ZERO, 'Division by zero', position);
          }
          try {
            return resolveStandalone(a).divide(denom);
          } catch (e) {
            if (e.message === 'DIVISION_BY_ZERO') {
              throw new CalculatorError(ErrorCode.DIVISION_BY_ZERO, 'Division by zero', position);
            }
            throw e;
          }
        }
        case '^': {
          const base = resolveStandalone(a);
          const exp = resolveStandalone(b);
          try {
            return base.pow(exp);
          } catch (e) {
            if (e.message === 'DIVISION_BY_ZERO') {
              throw new CalculatorError(ErrorCode.DIVISION_BY_ZERO, 'Zero cannot be raised to a negative power', position);
            }
            if (e.message === 'OVERFLOW') {
              throw new CalculatorError(ErrorCode.OVERFLOW, 'Result is too large to represent', position);
            }
            throw e;
          }
        }
        default:
          throw new CalculatorError(ErrorCode.UNKNOWN_OPERATOR, `Unknown operator "${op}"`, position);
      }
    },

    /** Apply a prefix unary operator ('u-' or 'u+') to a single operand. */
    applyUnary(op, value, position) {
      const v = resolveStandalone(value);
      switch (op) {
        case 'u-':
          return v.negate();
        case 'u+':
          return v;
        default:
          throw new CalculatorError(ErrorCode.UNKNOWN_OPERATOR, `Unknown unary operator "${op}"`, position);
      }
    },

    /** Apply a postfix unary operator ('!' or '%') to a single operand. */
    applyPostfix(op, value, position) {
      const v = resolveStandalone(value);
      switch (op) {
        case '!': {
          try {
            return BigDecimal.factorial(v);
          } catch (e) {
            if (e.message === 'INVALID_FACTORIAL') {
              throw new CalculatorError(
                ErrorCode.INVALID_FACTORIAL,
                'Factorial requires a non-negative integer',
                position
              );
            }
            if (e.message === 'OVERFLOW') {
              throw new CalculatorError(ErrorCode.OVERFLOW, 'Factorial result is too large to represent', position);
            }
            throw e;
          }
        }
        case '%':
          // Defer resolution: wrap as PercentValue so the enclosing binary operator
          // (if any) can apply Casio-style contextual percentage semantics.
          return new PercentValue(v);
        default:
          throw new CalculatorError(ErrorCode.UNKNOWN_OPERATOR, `Unknown postfix operator "${op}"`, position);
      }
    },

    resolveStandalone
  };

  const api = { Operators, PercentValue };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.Operators = Operators;
    global.PercentValue = PercentValue;
  }
})(typeof window !== 'undefined' ? window : globalThis);
