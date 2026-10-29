/**
 * tokenizer.js
 * -----------------------------------------------------------------------------
 * Converts a raw expression string into an array of Token objects.
 *
 * Responsibilities:
 *  - Recognise numeric literals (integers, decimals, with optional leading
 *    decimal point e.g. ".5").
 *  - Recognise operators: + - * / % ^ ! and the unicode root symbols √ ∛.
 *  - Recognise parentheses and the function-argument comma.
 *  - Recognise function names (SI, CI) case-insensitively.
 *  - Disambiguate unary vs binary +/- based on the preceding token (this is
 *    purely lexical context-sensitivity, not full parsing).
 *  - Reject illegal characters early with a precise error.
 *
 * The tokenizer does NOT validate grammar (e.g. "++5" or "(5" with no closing
 * paren) — that is the Validator's job. The tokenizer's only contract is:
 * every character of the input is either consumed into a token or causes an
 * UNEXPECTED_TOKEN error.
 * -----------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  const { TokenType, FUNCTIONS, MAX_EXPRESSION_LENGTH, MAX_NUMBER_DIGITS, ErrorCode } =
    (typeof module !== 'undefined' && module.exports) ? require('./constants.js') : global;

  class Token {
    constructor(type, value, position) {
      this.type = type;
      this.value = value;
      this.position = position;
    }
  }

  class CalculatorError extends Error {
    constructor(code, message, position) {
      super(message);
      this.name = 'CalculatorError';
      this.code = code;
      this.position = position;
    }
  }

  const SINGLE_CHAR_OPERATORS = new Set(['+', '-', '*', '/', '%', '^', '!']);
  const ROOT_SYMBOLS = { '√': 'SQRT', '∛': 'CBRT' };

  // '×' and '÷' are common alternate multiplication/division glyphs that users
  // (especially on mobile keypads) may paste in; normalise them.
  const SYMBOL_ALIASES = { '×': '*', '÷': '/', '−': '-' };

  class Tokenizer {
    /**
     * @param {string} expression - raw input expression
     */
    constructor(expression) {
      if (typeof expression !== 'string') {
        throw new CalculatorError(ErrorCode.INVALID_EXPRESSION, 'Expression must be a string', 0);
      }
      if (expression.length === 0) {
        throw new CalculatorError(ErrorCode.EMPTY_EXPRESSION, 'Expression is empty', 0);
      }
      if (expression.length > MAX_EXPRESSION_LENGTH) {
        throw new CalculatorError(
          ErrorCode.TOO_LONG,
          `Expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters`,
          MAX_EXPRESSION_LENGTH
        );
      }
      this.expr = expression;
      this.pos = 0;
      this.tokens = [];
    }

    /** Peek at the most recently emitted token (used for unary disambiguation). */
    _lastToken() {
      return this.tokens.length ? this.tokens[this.tokens.length - 1] : null;
    }

    /** Determine whether a +/- at the current position should be treated as unary. */
    _isUnaryContext() {
      const last = this._lastToken();
      if (!last) return true; // start of expression
      if (last.type === TokenType.OPERATOR) return true; // after any operator, e.g. "5*-3"
      if (last.type === TokenType.LPAREN) return true;     // "(-5"
      if (last.type === TokenType.COMMA) return true;      // "SI(100,-5,2)" edge case
      if (last.type === TokenType.FUNCTION) return true;   // "√-4" / "∛-8" — prefix function expects an operand next
      // After NUMBER, RPAREN, FACTORIAL, PERCENT -> binary context
      return false;
    }

    tokenize() {
      const { expr } = this;
      const len = expr.length;

      while (this.pos < len) {
        const ch = expr[this.pos];

        // Whitespace: skip.
        if (/\s/.test(ch)) { this.pos++; continue; }

        // Normalise common alternate symbols.
        const aliased = SYMBOL_ALIASES[ch];
        const effectiveCh = aliased !== undefined ? aliased : ch;

        // Numeric literal: digits, optional single decimal point.
        if (/[0-9]/.test(effectiveCh) || (effectiveCh === '.' && /[0-9]/.test(expr[this.pos + 1] || ''))) {
          this._readNumber();
          continue;
        }

        // Root symbols √ and ∛ behave as prefix functions of arity 1.
        if (ROOT_SYMBOLS[ch]) {
          this.tokens.push(new Token(TokenType.FUNCTION, ROOT_SYMBOLS[ch], this.pos));
          this.pos++;
          continue;
        }

        // Parentheses.
        if (effectiveCh === '(') {
          this.tokens.push(new Token(TokenType.LPAREN, '(', this.pos));
          this.pos++;
          continue;
        }
        if (effectiveCh === ')') {
          this.tokens.push(new Token(TokenType.RPAREN, ')', this.pos));
          this.pos++;
          continue;
        }

        // Comma — function argument separator.
        if (effectiveCh === ',') {
          this.tokens.push(new Token(TokenType.COMMA, ',', this.pos));
          this.pos++;
          continue;
        }

        // Factorial is always postfix unary.
        if (effectiveCh === '!') {
          this.tokens.push(new Token(TokenType.FACTORIAL, '!', this.pos));
          this.pos++;
          continue;
        }

        // Percent: postfix unary OR could be immediately followed by nothing else special.
        if (effectiveCh === '%') {
          this.tokens.push(new Token(TokenType.PERCENT, '%', this.pos));
          this.pos++;
          continue;
        }

        // +/- require disambiguation between unary and binary.
        if (effectiveCh === '+' || effectiveCh === '-') {
          const isUnary = this._isUnaryContext();
          this.tokens.push(
            new Token(TokenType.OPERATOR, isUnary ? `u${effectiveCh}` : effectiveCh, this.pos)
          );
          this.pos++;
          continue;
        }

        // Remaining single-char binary operators: * / ^
        if (effectiveCh === '*' || effectiveCh === '/' || effectiveCh === '^') {
          this.tokens.push(new Token(TokenType.OPERATOR, effectiveCh, this.pos));
          this.pos++;
          continue;
        }

        // Letters: function name (SI / CI) — read the full identifier.
        if (/[A-Za-z]/.test(ch)) {
          this._readIdentifier();
          continue;
        }

        // Anything else is illegal.
        throw new CalculatorError(
          ErrorCode.UNEXPECTED_TOKEN,
          `Unexpected character "${ch}" at position ${this.pos}`,
          this.pos
        );
      }

      this.tokens.push(new Token(TokenType.EOF, null, len));
      return this.tokens;
    }

    _readNumber() {
      const start = this.pos;
      const { expr } = this;
      let sawDot = false;
      let digitCount = 0;

      while (this.pos < expr.length) {
        const c = expr[this.pos];
        if (c >= '0' && c <= '9') {
          digitCount++;
          this.pos++;
        } else if (c === '.' && !sawDot) {
          sawDot = true;
          this.pos++;
        } else if (c === '.' && sawDot) {
          throw new CalculatorError(
            ErrorCode.INVALID_DECIMAL,
            `Invalid number: multiple decimal points at position ${this.pos}`,
            this.pos
          );
        } else {
          break;
        }
      }

      const raw = expr.slice(start, this.pos);
      if (raw === '.' || raw === '') {
        throw new CalculatorError(ErrorCode.INVALID_DECIMAL, `Invalid number literal at position ${start}`, start);
      }
      if (digitCount > MAX_NUMBER_DIGITS) {
        throw new CalculatorError(
          ErrorCode.OVERFLOW,
          `Number literal exceeds maximum of ${MAX_NUMBER_DIGITS} digits`,
          start
        );
      }
      this.tokens.push(new Token(TokenType.NUMBER, raw, start));
    }

    _readIdentifier() {
      const start = this.pos;
      const { expr } = this;
      while (this.pos < expr.length && /[A-Za-z]/.test(expr[this.pos])) {
        this.pos++;
      }
      const name = expr.slice(start, this.pos).toUpperCase();
      if (!FUNCTIONS[name]) {
        throw new CalculatorError(
          ErrorCode.UNKNOWN_FUNCTION,
          `Unknown function "${expr.slice(start, this.pos)}" at position ${start}`,
          start
        );
      }
      this.tokens.push(new Token(TokenType.FUNCTION, name, start));
    }
  }

  const api = { Tokenizer, Token, CalculatorError };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.Tokenizer = Tokenizer;
    global.Token = Token;
    global.CalculatorError = CalculatorError;
  }
})(typeof window !== 'undefined' ? window : globalThis);
