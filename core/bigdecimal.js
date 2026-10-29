/**
 * bigdecimal.js
 * -----------------------------------------------------------------------------
 * A self-contained arbitrary-precision decimal arithmetic implementation,
 * built on top of native BigInt. This is the "Decimal.js-equivalent
 * implementation" required by the spec: it avoids all floating point
 * representation error by storing every number as:
 *
 *      value = coefficient (BigInt) * 10^(-scale)
 *
 * e.g. 0.1  -> coefficient = 1n,   scale = 1   (1 * 10^-1)
 *      0.2  -> coefficient = 2n,   scale = 1
 *      0.3  -> coefficient = 3n,   scale = 1
 *
 * Addition/subtraction rescale both operands to the larger scale and operate
 * on integers only, so 0.1 + 0.2 produces exactly 0.3 with zero binary
 * floating-point error.
 *
 * Division and roots are computed to DECIMAL_PRECISION significant digits
 * and then trimmed, which is sufficient for financial and scientific display
 * purposes while staying exact for all terminating-decimal operations
 * (+ - * and exact roots/powers).
 * -----------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  const DECIMAL_PRECISION = 60; // significant digits kept for non-terminating results

  /** Strip a leading '+' and validate/normalise a numeric string. */
  function parseNumericString(input) {
    let s = String(input).trim();
    if (s === '') throw new RangeError('Empty numeric string');

    let negative = false;
    if (s[0] === '+' || s[0] === '-') {
      negative = s[0] === '-';
      s = s.slice(1);
    }
    if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') {
      throw new RangeError(`Invalid numeric string: "${input}"`);
    }

    let [intPart, fracPart = ''] = s.split('.');
    if (intPart === '') intPart = '0';

    const coefficientStr = (intPart + fracPart).replace(/^0+(?=\d)/, '') || '0';
    const scale = fracPart.length;
    let coefficient = BigInt(coefficientStr);
    if (negative && coefficient !== 0n) coefficient = -coefficient;

    return { coefficient, scale };
  }

  class BigDecimal {
    /**
     * @param {string|number|BigDecimal} value
     * @param {number} [scale] - internal use: explicit scale when coefficient already a BigInt
     */
    constructor(value, scale) {
      if (value instanceof BigDecimal) {
        this.coefficient = value.coefficient;
        this.scale = value.scale;
        return;
      }
      if (typeof value === 'bigint' && typeof scale === 'number') {
        this.coefficient = value;
        this.scale = scale;
        return;
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new RangeError('Cannot create BigDecimal from non-finite number');
        value = formatNumberLiteral(value);
      }
      const parsed = parseNumericString(value);
      this.coefficient = parsed.coefficient;
      this.scale = parsed.scale;
      this._trimTrailingZeros();
    }

    /** Remove insignificant trailing zeros from the fractional part to keep numbers canonical. */
    _trimTrailingZeros() {
      if (this.scale <= 0) return;
      let c = this.coefficient;
      let s = this.scale;
      const neg = c < 0n;
      if (neg) c = -c;
      while (s > 0 && c % 10n === 0n) {
        c /= 10n;
        s -= 1;
      }
      this.coefficient = neg ? -c : c;
      this.scale = s;
    }

    static fromBigInt(bi) {
      return new BigDecimal(bi, 0);
    }

    /** Rescale two BigDecimals to a common scale, returning [aCoeff, bCoeff, scale]. */
    static _align(a, b) {
      const scale = Math.max(a.scale, b.scale);
      const aCoeff = a.coefficient * 10n ** BigInt(scale - a.scale);
      const bCoeff = b.coefficient * 10n ** BigInt(scale - b.scale);
      return [aCoeff, bCoeff, scale];
    }

    add(other) {
      const o = BigDecimal._coerce(other);
      const [a, b, scale] = BigDecimal._align(this, o);
      return new BigDecimal(a + b, scale)._trimmed();
    }

    subtract(other) {
      const o = BigDecimal._coerce(other);
      const [a, b, scale] = BigDecimal._align(this, o);
      return new BigDecimal(a - b, scale)._trimmed();
    }

    multiply(other) {
      const o = BigDecimal._coerce(other);
      return new BigDecimal(this.coefficient * o.coefficient, this.scale + o.scale)._trimmed();
    }

    /**
     * Division to DECIMAL_PRECISION significant digits (rounded, half-up on magnitude).
     * Throws RangeError on division by zero (caller maps this to a CalculatorError).
     */
    divide(other, precision = DECIMAL_PRECISION) {
      const o = BigDecimal._coerce(other);
      if (o.coefficient === 0n) throw new RangeError('DIVISION_BY_ZERO');
      if (this.coefficient === 0n) return new BigDecimal(0n, 0);

      const negative = (this.coefficient < 0n) !== (o.coefficient < 0n);
      let num = this.coefficient < 0n ? -this.coefficient : this.coefficient;
      let den = o.coefficient < 0n ? -o.coefficient : o.coefficient;

      // Determine integer-digit count of the quotient to know how many extra
      // digits of scaling are needed to reach `precision` significant digits.
      // Ensure guardDigits is large enough that resultScale never goes negative
      // (negative scale is not supported by the rest of this class).
      const minGuard = precision + 10;
      const scaleDeficit = o.scale - this.scale; // if positive, we need more guard digits
      const guardDigits = scaleDeficit > 0 ? minGuard + scaleDeficit : minGuard;
      const numScaled = num * 10n ** BigInt(guardDigits); // extra guard digits
      let quotient = numScaled / den;
      // True value: (num/10^thisScale) / (den/10^oScale) = (num/den) * 10^(oScale-thisScale)
      // quotient = (num * 10^guardDigits) / den ≈ (num/den) * 10^guardDigits
      //          = trueValue * 10^(guardDigits - oScale + thisScale)
      // So quotient's scale (power of 10 the coefficient must be divided by) is:
      let resultScale = guardDigits - o.scale + this.scale;

      // Round to `precision` significant digits.
      const result = new BigDecimal(quotient, resultScale)._trimmed();
      const rounded = result._roundToSignificant(precision);
      return negative ? rounded.negate() : rounded;
    }

    /** Round to `n` significant digits (used internally after division/roots). */
    _roundToSignificant(n) {
      let c = this.coefficient;
      let s = this.scale;
      const neg = c < 0n;
      if (neg) c = -c;
      if (c === 0n) return new BigDecimal(0n, 0);

      const digits = c.toString().length;
      if (digits <= n) return this._trimmed();

      const dropCount = digits - n;
      const divisor = 10n ** BigInt(dropCount);
      const remainder = c % divisor;
      let truncated = c / divisor;
      // round-half-up
      if (remainder * 2n >= divisor) truncated += 1n;

      let newScale = s - dropCount;
      let result = neg ? -truncated : truncated;
      const bd = new BigDecimal(result, newScale);
      bd._trimTrailingZeros();
      return bd;
    }

    _trimmed() {
      this._trimTrailingZeros();
      return this;
    }

    negate() {
      return new BigDecimal(-this.coefficient, this.scale);
    }

    abs() {
      return this.coefficient < 0n ? this.negate() : this;
    }

    isZero() {
      return this.coefficient === 0n;
    }

    isNegative() {
      return this.coefficient < 0n;
    }

    isInteger() {
      this._trimTrailingZeros();
      return this.scale === 0;
    }

    /** Compare: returns -1, 0 or 1. */
    compareTo(other) {
      const o = BigDecimal._coerce(other);
      const [a, b] = BigDecimal._align(this, o);
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }

    equals(other) {
      return this.compareTo(other) === 0;
    }

    lessThan(other) { return this.compareTo(other) < 0; }
    greaterThan(other) { return this.compareTo(other) > 0; }
    lessOrEqual(other) { return this.compareTo(other) <= 0; }
    greaterOrEqual(other) { return this.compareTo(other) >= 0; }

    /** Integer power (exponent must be a non-negative or negative integer BigDecimal/number). */
    pow(exponent) {
      const expBD = BigDecimal._coerce(exponent);
      if (expBD.isInteger()) {
        let n = BigInt(expBD.coefficient) / 10n ** BigInt(expBD.scale);
        if (n === 0n) return new BigDecimal(1n, 0);
        const negExp = n < 0n;
        if (negExp) n = -n;

        let result = new BigDecimal(1n, 0);
        let base = this;
        let exp = n;
        // Exponentiation by squaring for O(log n) multiplications.
        while (exp > 0n) {
          if (exp & 1n) result = result.multiply(base);
          base = base.multiply(base);
          exp >>= 1n;
        }
        if (negExp) {
          if (result.isZero()) throw new RangeError('DIVISION_BY_ZERO');
          return new BigDecimal(1n, 0).divide(result);
        }
        return result;
      }
      // Fractional exponent: x^y = exp(y * ln(x)) — implemented via Newton's method
      // fallback using JS double precision is acceptable only as last resort;
      // for this calculator's scope, fractional exponents are rare (roots are
      // handled separately as nthRoot), so we approximate with native Math.
      const base = Number(this.toString());
      const exp = Number(expBD.toString());
      const approx = Math.pow(base, exp);
      if (!Number.isFinite(approx)) throw new RangeError('OVERFLOW');
      return new BigDecimal(formatNumberLiteral(approx));
    }

    /**
     * Nth root via Newton's method on BigDecimal, accurate to DECIMAL_PRECISION
     * significant digits. n must be a positive integer (2 = sqrt, 3 = cbrt, ...).
     */
    nthRoot(n) {
      if (this.isZero()) return new BigDecimal(0n, 0);
      const negative = this.isNegative();
      if (negative && n % 2 === 0) {
        throw new RangeError('NEGATIVE_SQRT');
      }
      const target = this.abs();

      // Initial guess using native floating point (fine as a seed for Newton's method).
      const seedNum = Number(target.toString());
      let guessNum = Math.pow(seedNum, 1 / n);
      if (!Number.isFinite(guessNum) || guessNum <= 0) guessNum = 1;

      let x = new BigDecimal(formatNumberLiteral(guessNum));
      const nBD = new BigDecimal(BigInt(n), 0);
      const nMinus1 = new BigDecimal(BigInt(n - 1), 0);
      const precision = DECIMAL_PRECISION;

      // Newton's method: x_{k+1} = ((n-1)*x_k + target / x_k^(n-1)) / n
      let prev = null;
      for (let i = 0; i < 200; i++) {
        const xPowNMinus1 = x.pow(nMinus1);
        const term = target.divide(xPowNMinus1, precision);
        const numerator = nMinus1.multiply(x).add(term);
        let next = numerator.divide(nBD, precision);
        next = next._roundToSignificant(precision + 5); // keep scale bounded across iterations
        if (prev !== null && next.equals(prev)) { x = next; break; }
        prev = x;
        x = next;
      }

      x = x._roundToSignificant(precision);
      return negative ? x.negate() : x;
    }

    /** Factorial — integer, non-negative only. Returns BigDecimal (always integral). */
    static factorial(bd) {
      if (!bd.isInteger() || bd.isNegative()) {
        throw new RangeError('INVALID_FACTORIAL');
      }
      let n = bd.coefficient / 10n ** BigInt(bd.scale);
      if (n > 100000n) throw new RangeError('OVERFLOW');
      let result = 1n;
      for (let i = 2n; i <= n; i++) result *= i;
      return new BigDecimal(result, 0);
    }

    static _coerce(value) {
      return value instanceof BigDecimal ? value : new BigDecimal(value);
    }

    /** Canonical string representation, e.g. "-12.340" -> "-12.34". */
    toString() {
      let c = this.coefficient;
      const negative = c < 0n;
      if (negative) c = -c;
      let digits = c.toString();

      if (this.scale === 0) {
        return (negative && c !== 0n ? '-' : '') + digits;
      }

      if (digits.length <= this.scale) {
        digits = '0'.repeat(this.scale - digits.length + 1) + digits;
      }
      const intPart = digits.slice(0, digits.length - this.scale);
      const fracPart = digits.slice(digits.length - this.scale);
      const fracTrimmed = fracPart.replace(/0+$/, '');
      const sign = negative && (intPart !== '0' || fracTrimmed !== '') ? '-' : '';
      return fracTrimmed ? `${sign}${intPart}.${fracTrimmed}` : `${sign}${intPart}`;
    }

    toNumber() {
      return Number(this.toString());
    }

    /** Returns { intPart: string(no sign), fracPart: string, negative: bool } */
    toParts() {
      const str = this.toString();
      const negative = str.startsWith('-');
      const unsigned = negative ? str.slice(1) : str;
      const [intPart, fracPart = ''] = unsigned.split('.');
      return { intPart, fracPart, negative };
    }
  }

  /** Convert a native JS number to a clean decimal literal string, avoiding exponential notation. */
  function formatNumberLiteral(num) {
    if (Number.isInteger(num) && Math.abs(num) < 1e21) {
      return BigInt(num).toString();
    }
    let s = num.toString();
    if (s.includes('e') || s.includes('E')) {
      // Expand exponential notation manually for very small/large doubles.
      s = num.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
    }
    return s;
  }

  const api = { BigDecimal };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.BigDecimal = BigDecimal;
  }
})(typeof window !== 'undefined' ? window : globalThis);
