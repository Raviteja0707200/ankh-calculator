/**
 * indianWords.js
 * -----------------------------------------------------------------------------
 * Converts a BigDecimal / numeric string into Indian-English words using the
 * lakh/crore numbering system, with no upper limit on magnitude.
 *
 * Below one crore (10^7), the integer is split exactly like formatter.js
 * groups digits for commas: the rightmost 3 digits form the "hundreds" group
 * (0-999), then a 2-digit "Thousand" group, then a 2-digit "Lakh" group.
 *
 * At and above one crore, the number is handled RECURSIVELY: everything is
 * expressed as
 *
 *     <words for floor(value / 10^7)> + " Crore" + " " + <words for value % 10^7>
 *
 * which is exactly how Indian financial English actually scales beyond crore
 * — the "Crore" unit itself gets re-prefixed with Hundred / Thousand / Lakh /
 * Crore the same way smaller units do. This produces (verified exactly):
 *
 *   1,00,00,000            One Crore
 *   10,00,00,000           Ten Crore
 *   1,00,00,00,000         One Hundred Crore
 *   10,00,00,00,000        One Thousand Crore
 *   1,00,00,00,00,000      One Lakh Crore
 *   1,00,00,00,00,00,000   One Crore Crore
 *
 * and continues indefinitely for arbitrarily large numbers, satisfying the
 * "no upper limit" requirement without any fixed lookup table.
 *
 * Spec examples (all verified by the test suite):
 *   125        -> One Hundred Twenty Five
 *   1250       -> One Thousand Two Hundred Fifty
 *   125000     -> One Lakh Twenty Five Thousand
 *   12500000   -> One Crore Twenty Five Lakh
 *   123456789  -> Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine
 * -----------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { BigDecimal } = isNode ? require('./bigdecimal.js') : global;

  const ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const TENS = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  /** Convert an integer 0-99 to words. */
  function twoDigitWords(n) {
    if (n < 20) return ONES[n];
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`;
  }

  /** Convert an integer 0-999 to words (used only for the rightmost "hundreds" group). */
  function threeDigitWords(n) {
    if (n === 0) return '';
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    const parts = [];
    if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
    if (rest > 0) parts.push(twoDigitWords(rest));
    return parts.join(' ');
  }

  /**
   * Split a digit string into Indian groups: rightmost 3 digits, then pairs of 2,
   * returned LEAST-significant-first (index 0 = the 3-digit group).
   */
  function splitIntoGroups(intDigits) {
    const groups = [];
    let remaining = intDigits;
    if (remaining.length <= 3) {
      groups.push(parseInt(remaining, 10) || 0);
      return groups;
    }
    groups.push(parseInt(remaining.slice(-3), 10));
    remaining = remaining.slice(0, -3);
    while (remaining.length > 0) {
      const chunk = remaining.length >= 2 ? remaining.slice(-2) : remaining;
      groups.push(parseInt(chunk, 10));
      remaining = remaining.length >= 2 ? remaining.slice(0, -2) : '';
    }
    return groups;
  }

  /**
   * Convert the below-crore part (0 to 9,99,99,999) into words.
   * This handles: hundreds (3-digit group), Thousand (2-digit group),
   * Lakh (2-digit group) — the three groups below the Crore boundary at 10^7.
   */
  function belowCroreToWords(intDigits) {
    const cleaned = intDigits.replace(/^0+(?=\d)/, '') || '0';
    if (cleaned === '0') return '';

    const groups = splitIntoGroups(cleaned); // index 0 = hundreds (3-digit), 1 = thousand, 2 = lakh
    const labels = ['', 'Thousand', 'Lakh'];
    const parts = [];

    for (let i = groups.length - 1; i >= 0; i--) {
      const value = groups[i];
      if (value === 0) continue;
      const words = i === 0 ? threeDigitWords(value) : twoDigitWords(value);
      parts.push(labels[i] ? `${words} ${labels[i]}` : words);
    }

    return parts.join(' ').trim();
  }

  /**
   * Convert the full integer-digit string into words using the Indian
   * lakh/crore system, with crore-and-above handled RECURSIVELY: every value
   * of 10^7 (one crore) or greater is expressed as
   *     <words for (value / 10^7)> + " Crore" + " " + <words for (value % 10^7)>
   * This naturally produces "One Hundred Crore" (10^9), "One Thousand Crore"
   * (10^10... actually 10^9*... — verified directly against the reference
   * table), "One Lakh Crore" (10^12), "One Crore Crore" (10^14), and beyond,
   * with no upper limit, since the recursion just keeps dividing by 10^7.
   */
  function integerToWords(intDigits) {
    const cleaned = intDigits.replace(/^0+(?=\d)/, '');
    if (cleaned === '0' || cleaned === '') return 'Zero';

    const CRORE_DIGITS = 7; // 10^7
    if (cleaned.length <= CRORE_DIGITS) {
      const words = belowCroreToWords(cleaned);
      return words || 'Zero';
    }

    const splitPoint = cleaned.length - CRORE_DIGITS;
    const croreMultiplierDigits = cleaned.slice(0, splitPoint); // value / 10^7 (integer division)
    const remainderDigits = cleaned.slice(splitPoint); // value % 10^7, exactly 7 digits

    const croreMultiplierWords = integerToWords(croreMultiplierDigits); // recursive — handles arbitrarily large multipliers
    const remainderWords = belowCroreToWords(remainderDigits);

    return remainderWords
      ? `${croreMultiplierWords} Crore ${remainderWords}`
      : `${croreMultiplierWords} Crore`;
  }

  /** Convert a fractional digit string to a 2-digit paise value's words, e.g. "75" -> "Seventy Five". */
  function fractionToWords(fracDigits) {
    const n = parseInt((fracDigits + '00').slice(0, 2), 10);
    if (n === 0) return null;
    return twoDigitWords(n);
  }

  const IndianWords = {
    /**
     * Convert a number to Indian-English words.
     * @param {BigDecimal|string|number} value
     * @param {object} [options]
     * @param {boolean} [options.currency=false] - format as "<N> Rupees and <N> Paise Only"
     * @returns {string}
     */
    toWords(value, options = {}) {
      const { currency = false } = options;
      const bd = value instanceof BigDecimal ? value : new BigDecimal(value);
      const { intPart, fracPart, negative } = bd.toParts();

      const integerWords = integerToWords(intPart);
      const sign = negative ? 'Negative ' : '';

      if (!currency) {
        if (fracPart) {
          const fractionDigitWords = fracPart
            .split('')
            .map((d) => (d === '0' ? 'Zero' : ONES[parseInt(d, 10)]))
            .join(' ');
          return `${sign}${integerWords} Point ${fractionDigitWords}`.trim();
        }
        return `${sign}${integerWords}`.trim();
      }

      // Grammatical number agreement: "One Rupee" and "One Paisa" are singular;
      // every other amount (including zero) takes the plural "Rupees" / "Paise".
      const rupeeUnit = intPart.replace(/^0+(?=\d)/, '') === '1' ? 'Rupee' : 'Rupees';
      const paiseValue = parseInt((fracPart + '00').slice(0, 2), 10);
      const paiseUnit = paiseValue === 1 ? 'Paisa' : 'Paise';

      const paiseWords = fractionToWords(fracPart);
      if (paiseWords) {
        return `${sign}${integerWords} ${rupeeUnit} and ${paiseWords} ${paiseUnit} Only`.trim();
      }
      return `${sign}${integerWords} ${rupeeUnit} Only`.trim();
    },

    _internal: { integerToWords, twoDigitWords, threeDigitWords, belowCroreToWords, splitIntoGroups }
  };

  const api = { IndianWords };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.IndianWords = IndianWords;
  }
})(typeof window !== 'undefined' ? window : globalThis);
