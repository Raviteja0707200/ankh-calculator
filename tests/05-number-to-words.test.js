/**
 * 05-number-to-words.test.js
 * Indian-English number-to-words conversion (lakh/crore system, no upper limit).
 */

'use strict';

const { testWords, section, printSummary } = require('./test-harness.js');

// ---------------------------------------------------------------------------
section('words: spec examples');
// ---------------------------------------------------------------------------
testWords('125', 'One Hundred Twenty Five');
testWords('1250', 'One Thousand Two Hundred Fifty');
testWords('125000', 'One Lakh Twenty Five Thousand');
testWords('12500000', 'One Crore Twenty Five Lakh');
testWords('123456789', 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine');

// ---------------------------------------------------------------------------
section('words: user reference table (crore-of-crore scale)');
// ---------------------------------------------------------------------------
testWords('1', 'One');
testWords('10', 'Ten');
testWords('100', 'One Hundred');
testWords('1000', 'One Thousand');
testWords('10000', 'Ten Thousand');
testWords('100000', 'One Lakh');
testWords('1000000', 'Ten Lakh');
testWords('10000000', 'One Crore');
testWords('100000000', 'Ten Crore');
testWords('250000000', 'Twenty Five Crore');
testWords('500000000', 'Fifty Crore');
testWords('750000000', 'Seventy Five Crore');
testWords('999999999', 'Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine');
testWords('1000000000', 'One Hundred Crore');
testWords('10000000000', 'One Thousand Crore');
testWords('100000000000', 'Ten Thousand Crore');
testWords('1000000000000', 'One Lakh Crore');
testWords('10000000000000', 'Ten Lakh Crore');
testWords('100000000000000', 'One Crore Crore');

// ---------------------------------------------------------------------------
section('words: zero through ninety-nine (every value)');
// ---------------------------------------------------------------------------
const ONES_WORDS = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS_WORDS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function smallNumberWords(n) {
  if (n < 20) return ONES_WORDS[n];
  const t = Math.floor(n / 10), o = n % 10;
  return o === 0 ? TENS_WORDS[t] : `${TENS_WORDS[t]} ${ONES_WORDS[o]}`;
}
for (let i = 0; i <= 99; i++) {
  testWords(String(i), smallNumberWords(i));
}

// ---------------------------------------------------------------------------
section('words: hundreds (every multiple of 100, plus a sample of each block)');
// ---------------------------------------------------------------------------
for (let h = 1; h <= 9; h++) {
  testWords(String(h * 100), `${ONES_WORDS[h]} Hundred`);
  for (let r = 1; r <= 99; r += 13) {
    testWords(String(h * 100 + r), `${ONES_WORDS[h]} Hundred ${smallNumberWords(r)}`);
  }
}

// ---------------------------------------------------------------------------
section('words: thousands');
// ---------------------------------------------------------------------------
testWords('1000', 'One Thousand');
testWords('2000', 'Two Thousand');
testWords('5000', 'Five Thousand');
testWords('9000', 'Nine Thousand');
testWords('11000', 'Eleven Thousand');
testWords('99000', 'Ninety Nine Thousand');
testWords('1001', 'One Thousand One');
testWords('1100', 'One Thousand One Hundred');
testWords('1234', 'One Thousand Two Hundred Thirty Four');
testWords('9999', 'Nine Thousand Nine Hundred Ninety Nine');
testWords('10001', 'Ten Thousand One');
testWords('99999', 'Ninety Nine Thousand Nine Hundred Ninety Nine');

// ---------------------------------------------------------------------------
section('words: lakhs');
// ---------------------------------------------------------------------------
testWords('100000', 'One Lakh');
testWords('200000', 'Two Lakh');
testWords('150000', 'One Lakh Fifty Thousand');
testWords('999999', 'Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine');
testWords('1000000', 'Ten Lakh');
testWords('5000000', 'Fifty Lakh');
testWords('9999999', 'Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine');
testWords('1234567', 'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven');

// ---------------------------------------------------------------------------
section('words: crores');
// ---------------------------------------------------------------------------
testWords('10000000', 'One Crore');
testWords('20000000', 'Two Crore');
testWords('15000000', 'One Crore Fifty Lakh');
testWords('99999999', 'Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine');
testWords('123456789', 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine');

// ---------------------------------------------------------------------------
section('words: zero and negative numbers');
// ---------------------------------------------------------------------------
testWords('0', 'Zero');
testWords('-1', 'Negative One');
testWords('-125', 'Negative One Hundred Twenty Five');
testWords('-100000', 'Negative One Lakh');
testWords('-10000000', 'Negative One Crore');

// ---------------------------------------------------------------------------
section('words: decimal (non-currency mode, "Point" + digit words)');
// ---------------------------------------------------------------------------
testWords('5.5', 'Five Point Five');
testWords('0.5', 'Zero Point Five');
testWords('10.25', 'Ten Point Two Five');
testWords('100.01', 'One Hundred Point Zero One');

// ---------------------------------------------------------------------------
section('words: currency mode — "Rupees ... and ... Paise Only"');
// ---------------------------------------------------------------------------
testWords('1234.75', 'One Thousand Two Hundred Thirty Four Rupees and Seventy Five Paise Only', { currency: true });
testWords('1234', 'One Thousand Two Hundred Thirty Four Rupees Only', { currency: true });
testWords('1234.00', 'One Thousand Two Hundred Thirty Four Rupees Only', { currency: true });
testWords('1234.7', 'One Thousand Two Hundred Thirty Four Rupees and Seventy Paise Only', { currency: true });
testWords('0.5', 'Zero Rupees and Fifty Paise Only', { currency: true });
testWords('0', 'Zero Rupees Only', { currency: true });
testWords('100000', 'One Lakh Rupees Only', { currency: true });
testWords('-1234.75', 'Negative One Thousand Two Hundred Thirty Four Rupees and Seventy Five Paise Only', { currency: true });
testWords('99.99', 'Ninety Nine Rupees and Ninety Nine Paise Only', { currency: true });

// ---------------------------------------------------------------------------
section('words: singular vs plural grammar — "One Rupee" / "One Paisa" (not "Rupees"/"Paise")');
// ---------------------------------------------------------------------------
testWords('1', 'One Rupee Only', { currency: true });
testWords('-1', 'Negative One Rupee Only', { currency: true });
testWords('2', 'Two Rupees Only', { currency: true });
testWords('0', 'Zero Rupees Only', { currency: true });
testWords('1.01', 'One Rupee and One Paisa Only', { currency: true });
testWords('-1.01', 'Negative One Rupee and One Paisa Only', { currency: true });
testWords('1.50', 'One Rupee and Fifty Paise Only', { currency: true });
testWords('100.01', 'One Hundred Rupees and One Paisa Only', { currency: true });
testWords('100.10', 'One Hundred Rupees and Ten Paise Only', { currency: true });
testWords('10001', 'Ten Thousand One Rupees Only', { currency: true }); // 10001 != 1, plural correctly applies
testWords('0.01', 'Zero Rupees and One Paisa Only', { currency: true });

// ---------------------------------------------------------------------------
section('words: large random cross-checks against independent reference implementation');
// ---------------------------------------------------------------------------
function independentWords(nStr) {
  function two(n) { if (n < 20) return ONES_WORDS[n]; const t = Math.floor(n / 10), o = n % 10; return o === 0 ? TENS_WORDS[t] : TENS_WORDS[t] + ' ' + ONES_WORDS[o]; }
  function three(n) { if (n === 0) return ''; const h = Math.floor(n / 100), r = n % 100; const p = []; if (h > 0) p.push(ONES_WORDS[h] + ' Hundred'); if (r > 0) p.push(two(r)); return p.join(' '); }
  function rec(n) {
    if (n === 0n) return 'Zero';
    if (n < 10000000n) {
      const lakh = n / 100000n, rem1 = n % 100000n, thousand = rem1 / 1000n, rem2 = rem1 % 1000n;
      const parts = [];
      if (lakh > 0n) parts.push(two(Number(lakh)) + ' Lakh');
      if (thousand > 0n) parts.push(two(Number(thousand)) + ' Thousand');
      if (rem2 > 0n) parts.push(three(Number(rem2)));
      return parts.join(' ').trim() || 'Zero';
    }
    const multiplier = n / 10000000n, remainder = n % 10000000n;
    const multWords = rec(multiplier);
    const remWords = remainder > 0n ? rec(remainder) : '';
    return remWords ? multWords + ' Crore ' + remWords : multWords + ' Crore';
  }
  return rec(BigInt(nStr));
}

for (let i = 0; i < 800; i++) {
  const len = 1 + Math.floor(Math.random() * 28);
  let digits = '';
  for (let j = 0; j < len; j++) digits += Math.floor(Math.random() * 10);
  digits = digits.replace(/^0+/, '') || '0';
  testWords(digits, independentWords(digits));
}

if (require.main === module) {
  const { failCount } = printSummary('NUMBER TO WORDS');
  process.exitCode = failCount > 0 ? 1 : 0;
}
