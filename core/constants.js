/**
 * constants.js
 * -----------------------------------------------------------------------------
 * Centralised constants used across the calculator engine: token types,
 * operator metadata (precedence / associativity / arity), error codes and
 * configuration limits. Keeping these in one module avoids magic strings
 * scattered through the tokenizer, parser and evaluator.
 *
 * Like every other core/*.js module, this is wrapped in an IIFE so it works
 * identically whether loaded via CommonJS `require` (tests, Node tooling) or
 * as a plain <script> tag in the browser (where it attaches its exports onto
 * `window`). Top-level `const` declarations do NOT become global/window
 * properties in browsers, so this wrapper is required — a bare top-level
 * `const TokenType = ...` would be invisible to every other module.
 * -----------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  /** Token type identifiers produced by the Tokenizer and consumed by the Parser. */
  const TokenType = Object.freeze({
    NUMBER: 'NUMBER',
    OPERATOR: 'OPERATOR',
    FUNCTION: 'FUNCTION',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    COMMA: 'COMMA',
    PERCENT: 'PERCENT',
    FACTORIAL: 'FACTORIAL',
    EOF: 'EOF'
  });

  /**
   * Operator table. Higher `precedence` binds tighter.
   * `assoc` is 'L' (left) or 'R' (right).
   * `arity` is 1 for unary, 2 for binary.
   * `type` distinguishes prefix-unary, postfix-unary and binary operators so the
   * parser/evaluator can treat e.g. unary minus differently from subtraction.
   */
  const OPERATORS = Object.freeze({
    'u-': { precedence: 8, assoc: 'R', arity: 1, type: 'prefix' },   // unary minus
    'u+': { precedence: 8, assoc: 'R', arity: 1, type: 'prefix' },   // unary plus
    '^': { precedence: 7, assoc: 'R', arity: 2, type: 'binary' },
    '!': { precedence: 9, assoc: 'L', arity: 1, type: 'postfix' },
    '%': { precedence: 9, assoc: 'L', arity: 1, type: 'postfix' },
    '*': { precedence: 5, assoc: 'L', arity: 2, type: 'binary' },
    '/': { precedence: 5, assoc: 'L', arity: 2, type: 'binary' },
    '+': { precedence: 4, assoc: 'L', arity: 2, type: 'binary' },
    '-': { precedence: 4, assoc: 'L', arity: 2, type: 'binary' }
  });

  /** Recognised function names (case-insensitive at tokenizer level, stored upper-case). */
  const FUNCTIONS = Object.freeze({
    SI: { arity: 3 },
    CI: { arity: 3 },
    SQRT: { arity: 1 },   // backing implementation for √
    CBRT: { arity: 1 }    // backing implementation for ∛
  });

  /** Maximum supported expression length (characters). */
  const MAX_EXPRESSION_LENGTH = 50000;

  /** Maximum supported nesting depth of parentheses. */
  const MAX_PAREN_DEPTH = 1000;

  /** Maximum digit count for a single numeric literal (integer + fraction digits). */
  const MAX_NUMBER_DIGITS = 1000;

  /** Decimal precision (significant digits) used internally by BigDecimal for division/roots. */
  const DECIMAL_PRECISION = 60;

  /** Error codes used by CalculatorError so the UI can branch on error type if desired. */
  const ErrorCode = Object.freeze({
    DIVISION_BY_ZERO: 'DIVISION_BY_ZERO',
    INVALID_EXPRESSION: 'INVALID_EXPRESSION',
    MISSING_PARENTHESIS: 'MISSING_PARENTHESIS',
    UNKNOWN_FUNCTION: 'UNKNOWN_FUNCTION',
    UNKNOWN_OPERATOR: 'UNKNOWN_OPERATOR',
    INVALID_DECIMAL: 'INVALID_DECIMAL',
    INVALID_FACTORIAL: 'INVALID_FACTORIAL',
    NEGATIVE_SQRT: 'NEGATIVE_SQRT',
    OVERFLOW: 'OVERFLOW',
    UNEXPECTED_TOKEN: 'UNEXPECTED_TOKEN',
    EMPTY_EXPRESSION: 'EMPTY_EXPRESSION',
    TOO_LONG: 'TOO_LONG',
    TOO_DEEP: 'TOO_DEEP',
    ARGUMENT_COUNT: 'ARGUMENT_COUNT',
    INVALID_ARGUMENT: 'INVALID_ARGUMENT'
  });

  const api = {
    TokenType, OPERATORS, FUNCTIONS, MAX_EXPRESSION_LENGTH,
    MAX_PAREN_DEPTH, MAX_NUMBER_DIGITS, DECIMAL_PRECISION, ErrorCode
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    Object.assign(global, api);
  }
})(typeof window !== 'undefined' ? window : globalThis);
