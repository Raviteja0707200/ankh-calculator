/**
 * formatter.js
 * -----------------------------------------------------------------------------
 * Formats a BigDecimal (or numeric string) using the Indian numbering system's
 * comma placement: the last 3 digits are grouped together, and every group
 * before that is 2 digits (thousand, lakh, crore, ...).
 *
 *   1234567   ->  12,34,567
 *   12345678  ->  1,23,45,678
 *
 * This module operates purely on strings/BigInt-like digit manipulation so it
 * has no precision limit — it works identically for a 5-digit number and a
 * 50-digit number.
 * -----------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { BigDecimal } = isNode ? require('./bigdecimal.js') : global;

  /**
   * Group a plain (unsigned, no-leading-zero, except "0" itself) digit string
   * using the Indian comma convention: rightmost 3 digits as one group, then
   * groups of 2 thereafter.
   * @param {string} intDigits
   * @returns {string}
   */
  function groupIndian(intDigits) {
    if (intDigits.length <= 3) return intDigits;
    const lastThree = intDigits.slice(-3);
    let remaining = intDigits.slice(0, -3);
    const groups = [];
    while (remaining.length > 2) {
      groups.unshift(remaining.slice(-2));
      remaining = remaining.slice(0, -2);
    }
    if (remaining.length > 0) groups.unshift(remaining);
    return groups.join(',') + ',' + lastThree;
  }

  const Formatter = {
    /**
     * Format a BigDecimal/numeric-string/number into Indian comma-grouped form.
     * Preserves the fractional part unchanged (no grouping applied there).
     * @param {BigDecimal|string|number} value
     * @returns {string}
     */
    toIndianFormat(value) {
      const bd = value instanceof BigDecimal ? value : new BigDecimal(value);
      const { intPart, fracPart, negative } = bd.toParts();
      const grouped = groupIndian(intPart);
      const sign = negative ? '-' : '';
      return fracPart ? `${sign}${grouped}.${fracPart}` : `${sign}${grouped}`;
    },

    /** Expose the raw grouping helper for reuse (e.g. by indianWords.js). */
    groupIndian
  };

  const api = { Formatter };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.Formatter = Formatter;
  }
})(typeof window !== 'undefined' ? window : globalThis);
