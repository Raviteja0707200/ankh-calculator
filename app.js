/**
 * app.js
 * -----------------------------------------------------------------------------
 * Application controller. Wires the DOM (index.html / style.css) to the
 * calculator engine (core/*.js, loaded as globals via <script> tags). Owns:
 *   - expression state and live evaluation
 *   - keypad + keyboard input handling
 *   - history (persisted to localStorage, capped at 100 entries)
 *   - copy-to-clipboard
 *   - the finance-function insertion modal
 *
 * No build step / bundler is used: every core/*.js file attaches its exports
 * to `window` (see the IIFE wrapper at the bottom of each core module), so
 * this file simply reads them off the global scope.
 * -----------------------------------------------------------------------------
 */

'use strict';

(function () {
  const HISTORY_KEY = 'ankhCalculator.history.v1';
  const MAX_HISTORY = 100;

  // ---- DOM references -------------------------------------------------------
  const expressionEl = document.getElementById('expressionDisplay');
  const resultEl = document.getElementById('resultDisplay');
  const indianFormatEl = document.getElementById('indianFormatDisplay');
  const wordsEl = document.getElementById('wordsDisplay');
  const inputValueBox = document.getElementById('inputValueBox');
  const inputValueDisplay = document.getElementById('inputValueDisplay');
  const inputValueEl = document.getElementById('inputValue');
  const inputValueWords = document.getElementById('inputValueWords');
  const runningTotalEl = document.getElementById('runningTotal');
  const totalEl = document.getElementById('total');
  const totalDisplayEl = document.getElementById('totalDisplay');
  const errorRowEl = document.getElementById('errorRow');
  const historyListEl = document.getElementById('historyList');
  const historyEmptyEl = document.getElementById('historyEmpty');
  const toastEl = document.getElementById('toast');
  const keypadEl = document.getElementById('keypad');
  const copyBtn = document.getElementById('copyBtn');
  const clearExprBtn = document.getElementById('clearExprBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const howToBtn = document.getElementById('howToBtn');
  const howtoPanel = document.getElementById('howtoPanel');
  const historyToggle = document.getElementById('historyToggle');
  const ledgerColumn = document.getElementById('ledgerColumn');
  const ledgerCloseBtn = document.getElementById('ledgerCloseBtn');
  const ledgerBackdrop = document.getElementById('ledgerBackdrop');
  // Tabs
  const tabCalculator = document.getElementById('tabCalculator');
  const tabInterest = document.getElementById('tabInterest');
  const panelCalculator = document.getElementById('panelCalculator');
  const panelInterest = document.getElementById('panelInterest');

  // Interest calculator DOM elements
  const icBtnSimple = document.getElementById('icBtnSimple');
  const icBtnCompound = document.getElementById('icBtnCompound');
  const intPrincipalEl = document.getElementById('intPrincipal');
  const intPrincipalPreview = document.getElementById('intPrincipalPreview');
  const icTypeRupees = document.getElementById('icTypeRupees');
  const icTypePercent = document.getElementById('icTypePercent');
  const intRateLabel = document.getElementById('intRateLabel');
  const intRateLabelText = document.getElementById('intRateLabelText');
  const intRateEl = document.getElementById('intRate');
  const intRatePreview = document.getElementById('intRatePreview');
  const intCompoundFreqGroup = document.getElementById('intCompoundFreqGroup');
  const intCompoundFreqEl = document.getElementById('intCompoundFreq');
  const icModeDates = document.getElementById('icModeDates');
  const icModeDuration = document.getElementById('icModeDuration');
  const icDatesContainer = document.getElementById('icDatesContainer');
  const icDurationContainer = document.getElementById('icDurationContainer');
  const intFromDateEl = document.getElementById('intFromDate');
  const intFromDatePicker = document.getElementById('intFromDatePicker');
  const btnFromDateCal = document.getElementById('btnFromDateCal');
  const intToDateEl = document.getElementById('intToDate');
  const intToDatePicker = document.getElementById('intToDatePicker');
  const btnToDateCal = document.getElementById('btnToDateCal');
  const icDateDurationPreview = document.getElementById('icDateDurationPreview');
  const intYearsEl = document.getElementById('intYears');
  const intMonthsEl = document.getElementById('intMonths');
  const intDaysEl = document.getElementById('intDays');
  const icDurationPreview = document.getElementById('icDurationPreview');
  const intErrorBanner = document.getElementById('intErrorBanner');
  const intClearBtn = document.getElementById('intClearBtn');
  const intCalcBtn = document.getElementById('intCalcBtn');
  const intBookmarkBtn = document.getElementById('intBookmarkBtn');
  const icResultsCard = document.getElementById('icResultsCard');
  const resTypeBadge = document.getElementById('resTypeBadge');
  const icCopyResultBtn = document.getElementById('icCopyResultBtn');
  const resDurationLine = document.getElementById('resDurationLine');
  const resPrincipalVal = document.getElementById('resPrincipalVal');
  const resInterestVal = document.getElementById('resInterestVal');
  const resTotalVal = document.getElementById('resTotalVal');
  const resWordsVal = document.getElementById('resWordsVal');
  const resRateSummary = document.getElementById('resRateSummary');
  const resInterestYear = document.getElementById('resInterestYear');
  const resInterestMonth = document.getElementById('resInterestMonth');
  const resInterestDay = document.getElementById('resInterestDay');
  const icThemeBtn = document.getElementById('icThemeBtn');
  const icThemeIcon = document.getElementById('icThemeIcon');
  const icThemeLabel = document.getElementById('icThemeLabel');

  // ---- State ------------------------------------------------------------
  let lastValidResult = null; // BigDecimal of the most recently successfully evaluated result
  let lastEnteredAmount = null; // BigDecimal of the most recently entered numeric amount
  let justEvaluated = false; // true right after pressing "=" (or Enter); governs what the next keystroke does
  let history = loadHistory();

  // ---- Device helper ---------------------------------------------------
  function isTouchOrMobile() {
    return (typeof window !== 'undefined') &&
           (('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0) ||
            window.matchMedia('(max-width: 780px), (pointer: coarse)').matches);
  }

  // On mobile view, completely turn off keyboard functionality for the calculator
  if (isTouchOrMobile()) {
    expressionEl.setAttribute('contenteditable', 'false');
    expressionEl.setAttribute('inputmode', 'none');
    expressionEl.setAttribute('tabindex', '-1');
    expressionEl.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
    expressionEl.addEventListener('focus', () => { expressionEl.blur(); });
  }

  renderHistory();

  // ===========================================================================
  // Core evaluation pipeline
  // ===========================================================================

  /**
   * Run the full pipeline (tokenize -> validate -> parse -> evaluate) on the
   * given expression string. Returns { ok: true, value: BigDecimal } or
   * { ok: false, message: string }.
   */
  function evaluateExpression(expr) {
    try {
      const tokens = new Tokenizer(expr).tokenize();
      new Validator(tokens).validate();
      const postfix = new Parser(tokens).toPostfix();
      const value = new Evaluator(postfix).evaluate();
      return { ok: true, value };
    } catch (err) {
      return { ok: false, message: friendlyErrorMessage(err) };
    }
  }

  /** Convert a CalculatorError (or unexpected error) into a short, human-readable message. */
  function friendlyErrorMessage(err) {
    const code = err && err.code;
    const map = {
      DIVISION_BY_ZERO: 'Cannot divide by zero',
      INVALID_EXPRESSION: 'Invalid expression',
      MISSING_PARENTHESIS: 'Missing parenthesis',
      UNKNOWN_FUNCTION: 'Unknown function',
      UNKNOWN_OPERATOR: 'Unknown operator',
      INVALID_DECIMAL: 'Invalid number',
      INVALID_FACTORIAL: 'Factorial needs a non-negative whole number',
      NEGATIVE_SQRT: 'Cannot take square root of a negative number',
      OVERFLOW: 'Result is too large',
      UNEXPECTED_TOKEN: 'Unexpected character in expression',
      EMPTY_EXPRESSION: '',
      TOO_LONG: 'Expression is too long',
      TOO_DEEP: 'Too many nested parentheses',
      ARGUMENT_COUNT: 'Wrong number of arguments',
      INVALID_ARGUMENT: 'Invalid argument'
    };
    if (code && map[code] !== undefined) return map[code];
    return 'Invalid expression';
  }

  // ===========================================================================
  // Display rendering
  // ===========================================================================

  function getExpressionText() {
    return expressionEl.textContent || '';
  }

  function setExpressionText(text) {
    expressionEl.textContent = text;
    placeCaretAtEnd(expressionEl);
  }

  /**
   * Same as setExpressionText, but guarantees the caret lands at the end even
   * when called from a context where expressionEl isn't already focused
   * (e.g. a history-item click) — focusing AFTER setting text but BEFORE
   * placing the caret is required, since placeCaretAtEnd is a no-op unless
   * expressionEl is the active element at the moment it's called.
   */
  function setExpressionTextAndFocus(text) {
    expressionEl.textContent = text;
    if (!isTouchOrMobile()) {
      expressionEl.focus();
      placeCaretAtEnd(expressionEl);
    }
  }

  function placeCaretAtEnd(el) {
    if (document.activeElement !== el) return;
    const range = document.createRange();
    const sel = window.getSelection();
    if (el.lastChild && el.lastChild.nodeType === Node.TEXT_NODE) {
      // Position by character offset within the actual text node. Using
      // selectNodeContents(el) + collapse(false) here is a trap: Range
      // offsets on an element container are counted in CHILD NODES, not
      // characters, so for a single text-node child that range's "end"
      // collapses to offset 1 (after the one child) rather than to the end
      // of the text — which browsers can then interpret as a caret position
      // BEFORE the existing text rather than after it, causing new input to
      // insert at the wrong place. Anchoring on el.lastChild's own character
      // length avoids this entirely.
      const len = el.lastChild.textContent.length;
      range.setStart(el.lastChild, len);
      range.setEnd(el.lastChild, len);
    } else {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Extract the most recently entered numeric amount from an expression string. */
  function getLastEnteredAmount(expr) {
    if (!expr) return null;
    const matches = expr.replace(/,/g, '').match(/(?:\d+\.?\d*|\.\d+)/g);
    if (!matches || matches.length === 0) return null;
    for (let i = matches.length - 1; i >= 0; i--) {
      const str = matches[i];
      if (str === '.' || str === '') continue;
      try {
        return new BigDecimal(str);
      } catch (e) {
        // continue
      }
    }
    return null;
  }

  /** Re-run evaluation on the current expression and update all display readouts. */
  function refreshDisplay() {
    const expr = getExpressionText().trim();

    if (expr === '' || expr === '0') {
      resultEl.textContent = '0';
      resultEl.classList.remove('is-error');
      indianFormatEl.textContent = '—';
      wordsEl.textContent = 'Zero Only';
      errorRowEl.textContent = '';
      lastValidResult = null;
      lastEnteredAmount = null;

      if (inputValueDisplay) inputValueDisplay.textContent = '—';
      if (inputValueEl) inputValueEl.textContent = '0';
      if (inputValueWords) inputValueWords.textContent = 'Zero Only';
      if (runningTotalEl) runningTotalEl.textContent = '0';
      if (totalEl) totalEl.textContent = '0';
      if (totalDisplayEl) totalDisplayEl.textContent = '0';
      return;
    }

    const currentAmount = getLastEnteredAmount(expr);
    if (currentAmount !== null) {
      lastEnteredAmount = currentAmount;
    }

    // Update input-value box (in words and formatted number)
    if (lastEnteredAmount !== null) {
      const formattedAmount = Formatter.toIndianFormat(lastEnteredAmount);
      const amountWords = lastEnteredAmount.isZero()
        ? 'Zero Only'
        : IndianWords.toWords(lastEnteredAmount, { currency: true });

      if (inputValueDisplay) inputValueDisplay.textContent = formattedAmount;
      if (inputValueEl) inputValueEl.textContent = formattedAmount;
      if (inputValueWords) inputValueWords.textContent = amountWords;
    } else {
      if (inputValueDisplay) inputValueDisplay.textContent = '—';
      if (inputValueEl) inputValueEl.textContent = '0';
      if (inputValueWords) inputValueWords.textContent = 'Zero Only';
    }

    const outcome = evaluateExpression(expr);

    if (outcome.ok) {
      lastValidResult = outcome.value;
      const formattedTotal = Formatter.toIndianFormat(outcome.value);
      resultEl.textContent = outcome.value.toString();
      resultEl.classList.remove('is-error');
      indianFormatEl.textContent = formattedTotal;
      wordsEl.textContent = IndianWords.toWords(outcome.value, { currency: true });
      errorRowEl.textContent = '';

      if (runningTotalEl) runningTotalEl.textContent = formattedTotal;
      if (totalEl) totalEl.textContent = formattedTotal;
      if (totalDisplayEl) totalDisplayEl.textContent = formattedTotal;
    } else {
      // Keep showing the last good result in the main readout, but surface the error
      // beneath rather than blanking everything (matches real calculator UX where you
      // can keep typing toward a valid expression without losing your place).
      if (outcome.message) {
        errorRowEl.textContent = outcome.message;
      } else {
        errorRowEl.textContent = '';
      }
    }
  }

  // ===========================================================================
  // Input handling — keypad
  // ===========================================================================

  // On touch/pointerdown, prevent shifting focus which can invoke mobile keyboard
  keypadEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.key')) {
      e.preventDefault();
    }
  });

  keypadEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.key');
    if (!btn) return;
    e.preventDefault();

    const value = btn.getAttribute('data-value');
    const action = btn.getAttribute('data-action');

    if (value !== null) {
      handlePostEvaluateTransition(value);
      insertAtCursor(value);
      refreshDisplay();
      return;
    }

    switch (action) {
      case 'clear-all':
        justEvaluated = false;
        setExpressionText('');
        refreshDisplay();
        break;
      case 'backspace':
        justEvaluated = false;
        backspaceOne();
        refreshDisplay();
        break;
      case 'toggle-sign':
        toggleLeadingSign();
        refreshDisplay();
        break;
      case 'equals':
        commitCalculation();
        break;
      default:
        break;
    }
  });

  /**
   * After pressing "=" (justEvaluated is true), decide what the very next
   * keystroke should do — matching standard calculator behaviour:
   *   - A digit, decimal point, "(", or a function/root symbol starts a
   *     brand-new expression (the old one is cleared first), since typing
   *     "4" after "7*8=56" should produce "4", not "7*84".
   *   - A binary operator (+ - * / ^) continues from the previous result,
   *     so "+" after "7*8=56" produces "56+", letting you chain calculations.
   * This only fires once per "=" press; it's consumed immediately either way.
   */
  function handlePostEvaluateTransition(value) {
    if (!justEvaluated) return;
    justEvaluated = false;

    const continuesFromResult = ['+', '-', '*', '/', '^', '%', '!'].includes(value);
    const newText = (continuesFromResult && lastValidResult) ? lastValidResult.toString() : '';
    expressionEl.textContent = newText;
    if (!isTouchOrMobile()) {
      expressionEl.focus();
      placeCaretAtEnd(expressionEl);
    }
  }

  /** Insert text into the expression box without triggering mobile virtual keyboard. */
  function insertAtCursor(text) {
    if (!isTouchOrMobile() && document.activeElement === expressionEl) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && expressionEl.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
        expressionEl.textContent = expressionEl.textContent;
        placeCaretAtEnd(expressionEl);
        return;
      }
    }
    // Mobile or expression field not active: append cleanly without invoking mobile keyboard
    setExpressionText(getExpressionText() + text);
  }

  function backspaceOne() {
    const text = getExpressionText();
    setExpressionText(text.slice(0, -1));
  }

  /** Toggle a leading "-" on the whole expression (simple +/- behaviour, matches most calculators' AC+/- key). */
  function toggleLeadingSign() {
    const text = getExpressionText();
    if (text.startsWith('-')) {
      setExpressionText(text.slice(1));
    } else if (text.length > 0) {
      setExpressionText('-' + text);
    }
  }

  function commitCalculation() {
    const expr = getExpressionText().trim();
    if (expr === '') return;
    const outcome = evaluateExpression(expr);
    refreshDisplay();
    if (outcome.ok) {
      addHistoryEntry(expr, outcome.value.toString());
      justEvaluated = true;
    }
  }

  // ===========================================================================
  // Input handling — live typing in the expression field
  // ===========================================================================

  expressionEl.addEventListener('input', () => {
    // contenteditable can insert stray <div>/<br> on Enter in some browsers; keep it plain text.
    if (expressionEl.innerHTML.includes('<')) {
      const text = expressionEl.textContent;
      expressionEl.textContent = text;
      placeCaretAtEnd(expressionEl);
    }
    refreshDisplay();
  });

  // ===========================================================================
  // Keyboard shortcuts (global, per spec: Enter, Escape, Delete, Backspace,
  // Arrow Keys, Number Pad, Ctrl+C, Ctrl+V)
  // ===========================================================================

  document.addEventListener('keydown', (e) => {
    // In mobile view, keyboard functionality is turned off for the calculator
    if (isTouchOrMobile()) {
      return;
    }

    // The Interest tab has its own Enter-to-calculate handling on its own inputs;
    // don't let the global calculator shortcuts (Enter = evaluate expression,
    // Escape = clear expression, etc.) hijack typing in those fields.
    const activeTag = document.activeElement && document.activeElement.tagName;
    const inInterestField = panelInterest && !panelInterest.hidden &&
      (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'BUTTON');
    if (inInterestField) {
      return;
    }

    // Allow normal text editing within the expression field itself (arrows, home/end, etc.)
    // for anything we don't explicitly special-case below.

    if (e.key === 'Enter') {
      e.preventDefault();
      commitCalculation();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setExpressionText('');
      refreshDisplay();
      return;
    }

    // If the user is typing directly into the expression field (native browser
    // text editing, not routed through insertAtCursor) and the field still
    // shows the result of the last "=" press, apply the same fresh-start /
    // continue-from-result transition before the browser inserts the character.
    if (document.activeElement === expressionEl && justEvaluated) {
      const isContentKey = e.key.length === 1 && '0123456789.+-*/^!%()'.includes(e.key);
      if (isContentKey) {
        handlePostEvaluateTransition(e.key);
        // setExpressionText() already moved the caret to the end of the
        // (possibly now-empty, possibly result-prefilled) text; let the
        // browser's native keypress proceed from there to insert e.key.
      } else {
        justEvaluated = false; // any other key (arrows, backspace, etc.) just cancels the pending state
      }
    }

    if (e.key === 'Backspace' && document.activeElement !== expressionEl) {
      e.preventDefault();
      backspaceOne();
      refreshDisplay();
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      setExpressionText('');
      refreshDisplay();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      // Let the browser handle copy if there's an actual text selection;
      // otherwise copy the result.
      const sel = window.getSelection();
      if (!sel || sel.toString().trim() === '') {
        e.preventDefault();
        copyResultToClipboard();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      // Default paste behaviour is fine inside the expression field; if focus
      // is elsewhere, route pasted text into the expression field.
      if (document.activeElement !== expressionEl) {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text) {
            insertAtCursor(sanitizePastedText(text));
            refreshDisplay();
          }
        }).catch(() => {/* clipboard access denied — silently ignore */});
      }
      return;
    }

    // Direct character keys (digits, operators) when focus isn't already in the
    // expression field (e.g. user clicked a button) — forward them in.
    const directChars = '0123456789+-*/^!%().';
    if (directChars.includes(e.key) && document.activeElement !== expressionEl) {
      e.preventDefault();
      insertAtCursor(e.key);
      refreshDisplay();
      return;
    }
  });

  expressionEl.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    insertAtCursor(sanitizePastedText(text));
    refreshDisplay();
  });

  /** Strip whitespace/newlines from pasted content and normalise alternate symbols the Tokenizer also handles. */
  function sanitizePastedText(text) {
    return text.replace(/\s+/g, '');
  }

  // ===========================================================================
  // Clear expression / copy result
  // ===========================================================================

  clearExprBtn.addEventListener('click', () => {
    justEvaluated = false;
    setExpressionTextAndFocus('');
    refreshDisplay();
  });

  copyBtn.addEventListener('click', copyResultToClipboard);

  function copyResultToClipboard() {
    const text = resultEl.textContent;
    if (!text || resultEl.classList.contains('is-error')) return;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.classList.add('copied');
      showToast('Result copied');
      setTimeout(() => copyBtn.classList.remove('copied'), 1200);
    }).catch(() => {
      showToast('Could not copy — try selecting manually');
    });
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  // ===========================================================================
  // History (localStorage, capped at MAX_HISTORY)
  // ===========================================================================

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      // localStorage may be unavailable (private browsing quota, etc.) — fail silently.
    }
  }

  function addHistoryEntry(expression, result) {
    history.unshift({ expression, result, time: Date.now() });
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    historyListEl.querySelectorAll('.history-item').forEach((el) => el.remove());

    if (history.length === 0) {
      historyEmptyEl.style.display = '';
      return;
    }
    historyEmptyEl.style.display = 'none';

    const frag = document.createDocumentFragment();
    for (const entry of history) {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <span class="h-time">${formatTime(entry.time)}</span>
        <div class="h-expr">${escapeHtml(entry.expression)} =</div>
        <div class="h-result">${escapeHtml(entry.result)}</div>
      `;
      li.addEventListener('click', () => {
        justEvaluated = false;
        setExpressionTextAndFocus(entry.expression);
        refreshDisplay();
        if (isTouchOrMobile()) {
          closeHistoryDrawer();
        }
      });
      frag.appendChild(li);
    }
    historyListEl.appendChild(frag);
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  clearHistoryBtn.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
    showToast('History cleared');
  });

  // ===========================================================================
  // Misc UI: how-to panel, history toggle (mobile), finance modal
  // ===========================================================================

  howToBtn.addEventListener('click', () => {
    const isHidden = howtoPanel.hasAttribute('hidden');
    if (isHidden) {
      howtoPanel.removeAttribute('hidden');
      howToBtn.textContent = 'Functions & shortcuts ▴';
    } else {
      howtoPanel.setAttribute('hidden', '');
      howToBtn.textContent = 'Functions & shortcuts ▾';
    }
  });

  function openHistoryDrawer() {
    ledgerColumn.classList.add('mobile-visible');
    if (ledgerBackdrop) ledgerBackdrop.classList.add('is-active');
  }

  function closeHistoryDrawer() {
    ledgerColumn.classList.remove('mobile-visible');
    if (ledgerBackdrop) ledgerBackdrop.classList.remove('is-active');
  }

  historyToggle.addEventListener('click', () => {
    if (ledgerColumn.classList.contains('mobile-visible')) {
      closeHistoryDrawer();
    } else {
      openHistoryDrawer();
    }
  });

  if (ledgerCloseBtn) {
    ledgerCloseBtn.addEventListener('click', closeHistoryDrawer);
  }

  if (ledgerBackdrop) {
    ledgerBackdrop.addEventListener('click', closeHistoryDrawer);
  }

  // ===========================================================================
  // Tab switching (Calculator / Interest)
  // ===========================================================================

  function activateTab(which) {
    const calcActive = which === 'calculator';
    tabCalculator.classList.toggle('is-active', calcActive);
    tabInterest.classList.toggle('is-active', !calcActive);
    tabCalculator.setAttribute('aria-selected', String(calcActive));
    tabInterest.setAttribute('aria-selected', String(!calcActive));
    panelCalculator.hidden = !calcActive;
    panelInterest.hidden = calcActive;
    if (calcActive) {
      if (!isTouchOrMobile()) expressionEl.focus();
    } else {
      if (!isTouchOrMobile()) intPrincipalEl.focus();
    }
    if (history.replaceState) {
      history.replaceState(null, '', calcActive ? window.location.pathname : '#interest');
    }
  }

  tabCalculator.addEventListener('click', () => activateTab('calculator'));
  tabInterest.addEventListener('click', () => activateTab('interest'));

  if (window.location.hash === '#interest') {
    activateTab('interest');
  }

  // ===========================================================================
  // Interest calculator (Screenshot Styled Indian Mobile App Reference)
  // ===========================================================================

  let interestCalcType = 'simple'; // 'simple' | 'compound'
  let interestType = 'rupees';     // 'rupees' | 'percentage'
  let timeMode = 'dates';          // 'dates' | 'duration'

  // Date formatting & parsing helpers (dd/mm/yyyy <-> Date <-> yyyy-mm-dd)
  function formatDateToDMY(d) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function formatDateToISO(d) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  }

  function parseDMYToDate(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.trim().split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (year < 1900 || year > 2200 || month < 0 || month > 11 || day < 1 || day > 31) return null;
    const d = new Date(year, month, day);
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
    return d;
  }

  function calculateDateDiff(d1, d2) {
    if (d1 > d2) {
      throw new Error('From Date cannot be later than To Date');
    }
    let y1 = d1.getFullYear(), m1 = d1.getMonth(), day1 = d1.getDate();
    let y2 = d2.getFullYear(), m2 = d2.getMonth(), day2 = d2.getDate();

    let days = day2 - day1;
    let months = m2 - m1;
    let years = y2 - y1;

    if (days < 0) {
      const daysInPrevMonth = new Date(y2, m2, 0).getDate();
      days += daysInPrevMonth;
      months -= 1;
    }
    if (months < 0) {
      months += 12;
      years -= 1;
    }
    const totalDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    return { years, months, days, totalDays };
  }

  // Pre-fill From Date (1 year ago) and To Date (today)
  const initToDate = new Date();
  const initFromDate = new Date(initToDate);
  initFromDate.setFullYear(initFromDate.getFullYear() - 1);

  if (intFromDateEl && !intFromDateEl.value) {
    intFromDateEl.value = formatDateToDMY(initFromDate);
  }
  if (intFromDatePicker) {
    intFromDatePicker.value = formatDateToISO(initFromDate);
  }
  if (intToDateEl && !intToDateEl.value) {
    intToDateEl.value = formatDateToDMY(initToDate);
  }
  if (intToDatePicker) {
    intToDatePicker.value = formatDateToISO(initToDate);
  }

  // Requirement: Live INR display under box when typing numbers
  function updatePrincipalLivePreview() {
    if (!intPrincipalEl || !intPrincipalPreview) return;
    const raw = intPrincipalEl.value.replace(/,/g, '').trim();
    if (!raw) {
      intPrincipalPreview.hidden = true;
      intPrincipalPreview.innerHTML = '';
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(raw)) {
      intPrincipalPreview.hidden = false;
      intPrincipalPreview.innerHTML = '<span class="ic-live-inr-tag" style="background:rgba(239,68,68,0.2);color:#fca5a5;">Note</span> Please enter numbers only';
      return;
    }
    try {
      const bd = new BigDecimal(raw);
      const formatted = Formatter.toIndianFormat(bd);
      const words = IndianWords.toWords(bd, { currency: true });
      intPrincipalPreview.innerHTML = `<span class="ic-live-inr-tag">₹ INR</span> ₹ <strong style="color:#ffffff;">${formatted}</strong> &bull; ${words}`;
      intPrincipalPreview.hidden = false;
    } catch {
      intPrincipalPreview.hidden = true;
    }
  }

  if (intPrincipalEl) {
    ['input', 'change', 'keyup', 'paste'].forEach((evt) => {
      intPrincipalEl.addEventListener(evt, updatePrincipalLivePreview);
    });
  }

  function updateRateLivePreview() {
    if (!intRateEl || !intRatePreview) return;
    const raw = intRateEl.value.trim();
    if (!raw || isNaN(raw) || Number(raw) <= 0) {
      intRatePreview.hidden = true;
      return;
    }
    const val = parseFloat(raw);
    if (interestType === 'rupees') {
      const annualEquiv = (val * 12).toFixed(2).replace(/\.00$/, '');
      intRatePreview.innerHTML = `<span class="ic-live-inr-tag">Rate</span> ₹ ${val} per ₹100 / month (${annualEquiv}% per year)`;
    } else {
      const monthlyEquiv = (val / 12).toFixed(2).replace(/\.00$/, '');
      intRatePreview.innerHTML = `<span class="ic-live-inr-tag">Rate</span> ${val}% per year (₹ ${monthlyEquiv} per ₹100 / month)`;
    }
    intRatePreview.hidden = false;
  }

  if (intRateEl) {
    ['input', 'change', 'keyup', 'paste'].forEach((evt) => {
      intRateEl.addEventListener(evt, updateRateLivePreview);
    });
  }

  function updateDatesLivePreview() {
    if (!intFromDateEl || !intToDateEl || !icDateDurationPreview) return;
    const d1 = parseDMYToDate(intFromDateEl.value);
    const d2 = parseDMYToDate(intToDateEl.value);
    if (!d1 || !d2) {
      icDateDurationPreview.hidden = true;
      return;
    }
    if (d1 > d2) {
      icDateDurationPreview.innerHTML = '<span class="ic-live-inr-tag" style="background:rgba(239,68,68,0.2);color:#fca5a5;">Error</span> From Date cannot be after To Date';
      icDateDurationPreview.hidden = false;
      return;
    }
    const diff = calculateDateDiff(d1, d2);
    icDateDurationPreview.innerHTML = `<span class="ic-live-inr-tag">Tenure</span> ${diff.years} Years, ${diff.months} Months, ${diff.days} Days (${diff.totalDays} Total Days)`;
    icDateDurationPreview.hidden = false;
  }

  if (intFromDateEl && intToDateEl) {
    ['input', 'change', 'keyup'].forEach((evt) => {
      intFromDateEl.addEventListener(evt, updateDatesLivePreview);
      intToDateEl.addEventListener(evt, updateDatesLivePreview);
    });
  }

  function updateDurationLivePreview() {
    if (!intYearsEl || !intMonthsEl || !intDaysEl || !icDurationPreview) return;
    const y = parseInt(intYearsEl.value, 10) || 0;
    const m = parseInt(intMonthsEl.value, 10) || 0;
    const d = parseInt(intDaysEl.value, 10) || 0;
    if (y === 0 && m === 0 && d === 0) {
      icDurationPreview.hidden = true;
      return;
    }
    const totalMonths = y * 12 + m;
    const approxDays = Math.round(y * 365.25 + m * 30.4375 + d);
    icDurationPreview.innerHTML = `<span class="ic-live-inr-tag">Tenure</span> ${y} Years, ${m} Months, ${d} Days (${totalMonths} Months, ~${approxDays} Days)`;
    icDurationPreview.hidden = false;
  }

  [intYearsEl, intMonthsEl, intDaysEl].forEach((el) => {
    if (el) {
      ['input', 'change', 'keyup'].forEach((evt) => {
        el.addEventListener(evt, updateDurationLivePreview);
      });
    }
  });

  // Initial trigger so previews appear if values exist
  updatePrincipalLivePreview();
  updateRateLivePreview();
  updateDatesLivePreview();

  // Calendar buttons
  btnFromDateCal.addEventListener('click', () => {
    if (typeof intFromDatePicker.showPicker === 'function') {
      intFromDatePicker.showPicker();
    } else {
      intFromDatePicker.focus();
    }
  });
  intFromDatePicker.addEventListener('change', () => {
    if (intFromDatePicker.value) {
      const parts = intFromDatePicker.value.split('-');
      intFromDateEl.value = `${parts[2]}/${parts[1]}/${parts[0]}`;
      updateDatesLivePreview();
    }
  });

  btnToDateCal.addEventListener('click', () => {
    if (typeof intToDatePicker.showPicker === 'function') {
      intToDatePicker.showPicker();
    } else {
      intToDatePicker.focus();
    }
  });
  intToDatePicker.addEventListener('change', () => {
    if (intToDatePicker.value) {
      const parts = intToDatePicker.value.split('-');
      intToDateEl.value = `${parts[2]}/${parts[1]}/${parts[0]}`;
      updateDatesLivePreview();
    }
  });

  // Toggles: Simple vs Compound Interest
  icBtnSimple.addEventListener('click', () => {
    interestCalcType = 'simple';
    icBtnSimple.classList.add('is-active');
    icBtnSimple.setAttribute('aria-selected', 'true');
    icBtnCompound.classList.remove('is-active');
    icBtnCompound.setAttribute('aria-selected', 'false');
    intCompoundFreqGroup.hidden = true;
    if (!icResultsCard.hidden) calculateInterestApp();
  });
  icBtnCompound.addEventListener('click', () => {
    interestCalcType = 'compound';
    icBtnCompound.classList.add('is-active');
    icBtnCompound.setAttribute('aria-selected', 'true');
    icBtnSimple.classList.remove('is-active');
    icBtnSimple.setAttribute('aria-selected', 'false');
    intCompoundFreqGroup.hidden = false;
    if (!icResultsCard.hidden) calculateInterestApp();
  });

  // Toggles: Rupees vs Percentage
  icTypeRupees.addEventListener('click', () => {
    interestType = 'rupees';
    icTypeRupees.classList.add('is-active');
    icTypePercent.classList.remove('is-active');
    intRateLabel.querySelector('.ic-icon').textContent = '₹';
    intRateLabelText.textContent = 'Interest Rate (in rupees)';
    updateRateLivePreview();
    if (!icResultsCard.hidden) calculateInterestApp();
  });
  icTypePercent.addEventListener('click', () => {
    interestType = 'percentage';
    icTypePercent.classList.add('is-active');
    icTypeRupees.classList.remove('is-active');
    intRateLabel.querySelector('.ic-icon').textContent = '%';
    intRateLabelText.textContent = 'Interest Rate (in percentage)';
    updateRateLivePreview();
    if (!icResultsCard.hidden) calculateInterestApp();
  });

  // Toggles: Dates vs Duration
  icModeDates.addEventListener('click', () => {
    timeMode = 'dates';
    icModeDates.classList.add('is-active');
    icModeDuration.classList.remove('is-active');
    icDatesContainer.hidden = false;
    icDurationContainer.hidden = true;
  });
  icModeDuration.addEventListener('click', () => {
    timeMode = 'duration';
    icModeDuration.classList.add('is-active');
    icModeDates.classList.remove('is-active');
    icDatesContainer.hidden = true;
    icDurationContainer.hidden = false;
  });

  // Clear button
  intClearBtn.addEventListener('click', () => {
    intPrincipalEl.value = '';
    intRateEl.value = '';
    intFromDateEl.value = '';
    const resetDate = new Date();
    intToDateEl.value = formatDateToDMY(resetDate);
    intToDatePicker.value = formatDateToISO(resetDate);
    intYearsEl.value = '';
    intMonthsEl.value = '';
    intDaysEl.value = '';
    intPrincipalPreview.hidden = true;
    intRatePreview.hidden = true;
    icDateDurationPreview.hidden = true;
    icDurationPreview.hidden = true;
    intErrorBanner.hidden = true;
    intErrorBanner.textContent = '';
    icResultsCard.hidden = true;
    intPrincipalEl.focus();
  });

  // ===========================================================================
  // Theme toggle (Dark / Light)
  // ===========================================================================

  const THEME_KEY = 'ankhCalculator.theme.v1';

  const SUN_PATH = 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.36-6.36-.71.71M6.34 17.66l-.71.71M17.66 17.66l.71.71M6.34 6.34l-.71-.71M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7z';
  const MOON_PATH = 'M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z';

  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.setAttribute('data-theme', 'light');
      icThemeIcon.innerHTML = `<path d="${SUN_PATH}" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
      if (icThemeLabel) icThemeLabel.textContent = 'Dark';
    } else {
      document.body.removeAttribute('data-theme');
      icThemeIcon.innerHTML = `<path d="${MOON_PATH}"/>`;
      if (icThemeLabel) icThemeLabel.textContent = 'Light';
    }
  }

  // Restore saved preference on load
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(savedTheme);

  if (icThemeBtn) {
    icThemeBtn.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      showToast(next === 'light' ? '☀️ Light mode on' : '🌙 Dark mode on');
    });
  }

  // Current calculation state for bookmarking / copying
  let currentCalculationSummary = null;

  // Main Calculation Function
  function calculateInterestApp() {
    intErrorBanner.hidden = true;
    intErrorBanner.textContent = '';

    // Validate Principal
    const pRaw = intPrincipalEl.value.replace(/,/g, '').trim();
    if (!pRaw) {
      intErrorBanner.textContent = 'Please enter Principal Amount';
      intErrorBanner.hidden = false;
      icResultsCard.hidden = true;
      intPrincipalEl.focus();
      return;
    }
    const P = parseFloat(pRaw);
    if (isNaN(P) || P <= 0) {
      intErrorBanner.textContent = 'Principal Amount must be a positive number';
      intErrorBanner.hidden = false;
      icResultsCard.hidden = true;
      intPrincipalEl.focus();
      return;
    }

    // Validate Rate
    const rRaw = intRateEl.value.trim();
    if (!rRaw) {
      intErrorBanner.textContent = 'Please enter Interest Rate';
      intErrorBanner.hidden = false;
      icResultsCard.hidden = true;
      intRateEl.focus();
      return;
    }
    const R = parseFloat(rRaw);
    if (isNaN(R) || R <= 0) {
      intErrorBanner.textContent = 'Interest Rate must be a positive number';
      intErrorBanner.hidden = false;
      icResultsCard.hidden = true;
      intRateEl.focus();
      return;
    }

    // Determine duration
    let years = 0, months = 0, days = 0, totalDays = 0;
    if (timeMode === 'dates') {
      if (!intFromDateEl.value.trim()) {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        intFromDateEl.value = formatDateToDMY(d);
      }
      if (!intToDateEl.value.trim()) {
        intToDateEl.value = formatDateToDMY(new Date());
      }
      const d1 = parseDMYToDate(intFromDateEl.value);
      if (!d1) {
        intErrorBanner.textContent = 'Please enter a valid From Date in dd/mm/yyyy format';
        intErrorBanner.hidden = false;
        icResultsCard.hidden = true;
        intFromDateEl.focus();
        return;
      }
      const d2 = parseDMYToDate(intToDateEl.value);
      if (!d2) {
        intErrorBanner.textContent = 'Please enter a valid To Date in dd/mm/yyyy format';
        intErrorBanner.hidden = false;
        icResultsCard.hidden = true;
        intToDateEl.focus();
        return;
      }
      if (d1 > d2) {
        intErrorBanner.textContent = 'From Date cannot be later than To Date';
        intErrorBanner.hidden = false;
        icResultsCard.hidden = true;
        return;
      }
      const diff = calculateDateDiff(d1, d2);
      years = diff.years;
      months = diff.months;
      days = diff.days;
      totalDays = diff.totalDays;
    } else {
      years = parseInt(intYearsEl.value, 10) || 0;
      months = parseInt(intMonthsEl.value, 10) || 0;
      days = parseInt(intDaysEl.value, 10) || 0;
      if (years < 0 || months < 0 || days < 0) {
        intErrorBanner.textContent = 'Duration values cannot be negative';
        intErrorBanner.hidden = false;
        icResultsCard.hidden = true;
        return;
      }
      if (years === 0 && months === 0 && days === 0) {
        intErrorBanner.textContent = 'Please enter duration (Years, Months, or Days)';
        intErrorBanner.hidden = false;
        icResultsCard.hidden = true;
        return;
      }
      totalDays = Math.round(years * 365.25 + months * 30.4375 + days);
    }

    // Calculate Interest
    let totalInterest = 0;
    let monthlyInterest = 0;
    let yearlyInterest = 0;
    let dailyInterest = 0;
    let effectiveRateDesc = '';

    if (interestCalcType === 'simple') {
      if (interestType === 'rupees') {
        // Rupees interest (Vaddi): R rupees per month per 100 rupees
        monthlyInterest = P * (R / 100);
        dailyInterest = monthlyInterest / 30; // standard Indian month = 30 days
        yearlyInterest = monthlyInterest * 12;
        const totalMonths = years * 12 + months;
        totalInterest = (totalMonths * monthlyInterest) + (days * dailyInterest);
        effectiveRateDesc = `₹ ${R} per ₹100 / month (${(R * 12).toFixed(2).replace(/\.00$/, '')}% p.a.)`;
      } else {
        // Percentage interest (% per annum)
        yearlyInterest = P * (R / 100);
        monthlyInterest = yearlyInterest / 12;
        dailyInterest = yearlyInterest / 365;
        totalInterest = (years * yearlyInterest) + (months * monthlyInterest) + (days * dailyInterest);
        effectiveRateDesc = `${R}% p.a. (₹ ${(R / 12).toFixed(2)} per ₹100 / month)`;
      }
    } else {
      // Compound Interest
      const n = parseInt(intCompoundFreqEl.value, 10) || 1; // 1 = yearly, 2 = half-yearly, 4 = quarterly, 12 = monthly
      const freqNames = { 1: 'Yearly', 2: 'Half-yearly', 4: 'Quarterly', 12: 'Monthly' };

      if (interestType === 'rupees') {
        const cycleMonths = 12 / n;
        const totalMonths = years * 12 + months;
        const cycles = Math.floor(totalMonths / cycleMonths);
        const cycleRate = (R * cycleMonths) / 100;

        // Compounded principal after full cycles
        const pAcc = P * Math.pow(1 + cycleRate, cycles);

        // Residual months & days after last cycle
        const remMonths = totalMonths % cycleMonths;
        const remMonthlyInterest = pAcc * (R / 100);
        const remDailyInterest = remMonthlyInterest / 30;
        const remInterest = (remMonths * remMonthlyInterest) + (days * remDailyInterest);

        const totalAmount = pAcc + remInterest;
        totalInterest = totalAmount - P;

        monthlyInterest = P * (R / 100);
        yearlyInterest = monthlyInterest * 12;
        dailyInterest = monthlyInterest / 30;
        effectiveRateDesc = `₹ ${R} per ₹100/mo, Compounded ${freqNames[n]}`;
      } else {
        const periodRate = (R / 100) / n;
        const timeInYears = years + (months / 12) + (days / 365);
        const totalPeriods = n * timeInYears;
        const totalAmount = P * Math.pow(1 + periodRate, totalPeriods);
        totalInterest = totalAmount - P;

        yearlyInterest = P * (R / 100);
        monthlyInterest = yearlyInterest / 12;
        dailyInterest = yearlyInterest / 365;
        effectiveRateDesc = `${R}% p.a., Compounded ${freqNames[n]}`;
      }
    }

    const totalAmount = P + totalInterest;

    // Format display numbers
    const PBD = new BigDecimal(P.toFixed(2));
    const intBD = new BigDecimal(totalInterest.toFixed(2));
    const totBD = new BigDecimal(totalAmount.toFixed(2));
    const yBD = new BigDecimal(yearlyInterest.toFixed(2));
    const mBD = new BigDecimal(monthlyInterest.toFixed(2));
    const dBD = new BigDecimal(dailyInterest.toFixed(2));

    resTypeBadge.textContent = interestCalcType === 'simple' ? 'Simple Interest' : 'Compound Interest';
    resDurationLine.textContent = `${years} Years, ${months} Months, ${days} Days (${totalDays} Days)`;
    resPrincipalVal.textContent = '₹ ' + Formatter.toIndianFormat(PBD);
    resInterestVal.textContent = '₹ ' + Formatter.toIndianFormat(intBD);
    resTotalVal.textContent = '₹ ' + Formatter.toIndianFormat(totBD);
    resWordsVal.textContent = IndianWords.toWords(totBD, { currency: true });
    resRateSummary.textContent = effectiveRateDesc;
    resInterestYear.textContent = '₹ ' + Formatter.toIndianFormat(yBD);
    resInterestMonth.textContent = '₹ ' + Formatter.toIndianFormat(mBD);
    resInterestDay.textContent = '₹ ' + Formatter.toIndianFormat(dBD);

    icResultsCard.hidden = false;
    icResultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Store current calculation for Bookmark / Copy
    currentCalculationSummary = {
      type: interestCalcType === 'simple' ? 'Simple Interest' : 'Compound Interest',
      principal: '₹ ' + Formatter.toIndianFormat(PBD),
      interest: '₹ ' + Formatter.toIndianFormat(intBD),
      total: '₹ ' + Formatter.toIndianFormat(totBD),
      duration: `${years} Years, ${months} Months, ${days} Days (${totalDays} Days)`,
      rate: effectiveRateDesc,
      words: IndianWords.toWords(totBD, { currency: true }),
      timestamp: Date.now()
    };
  }

  intCalcBtn.addEventListener('click', calculateInterestApp);

  // Bookmark calculation
  intBookmarkBtn.addEventListener('click', () => {
    if (!currentCalculationSummary) {
      calculateInterestApp();
      if (!currentCalculationSummary) return;
    }

    const historyItem = {
      expr: `${currentCalculationSummary.type}: ${currentCalculationSummary.principal} @ ${currentCalculationSummary.rate} for ${currentCalculationSummary.duration}`,
      result: currentCalculationSummary.total,
      indian: currentCalculationSummary.total,
      words: currentCalculationSummary.words,
      timestamp: Date.now()
    };
    history.unshift(historyItem);
    if (history.length > 100) history.pop();
    saveHistory(history);
    renderHistory();

    showToast('Calculation saved to History!');
  });

  // Copy result
  icCopyResultBtn.addEventListener('click', () => {
    if (!currentCalculationSummary) return;
    const text = [
      `Interest Calculation (${currentCalculationSummary.type})`,
      `---------------------------------------`,
      `Principal: ${currentCalculationSummary.principal}`,
      `Total Interest: ${currentCalculationSummary.interest}`,
      `Total Amount: ${currentCalculationSummary.total}`,
      `Duration: ${currentCalculationSummary.duration}`,
      `Rate: ${currentCalculationSummary.rate}`,
      `In Words: ${currentCalculationSummary.words}`
    ].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Summary copied to clipboard!');
      }).catch(() => {
        showToast('Summary copied!');
      });
    } else {
      showToast('Summary copied!');
    }
  });

  // Allow Enter in inputs to calculate
  [intPrincipalEl, intRateEl, intFromDateEl, intToDateEl, intYearsEl, intMonthsEl, intDaysEl].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        calculateInterestApp();
      }
    });
  });
  intCompoundFreqEl.addEventListener('change', () => {
    if (!icResultsCard.hidden) calculateInterestApp();
  });

  // ===========================================================================
  // Init
  // ===========================================================================

  setExpressionText('');
  refreshDisplay();
})();
