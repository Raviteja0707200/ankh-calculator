/**
 * validator.js
 * -----------------------------------------------------------------------------
 * Performs grammar-level validation on a token stream produced by the
 * Tokenizer, BEFORE it reaches the Shunting-Yard parser. This catches and
 * reports precise errors such as:
 *
 *   - Mismatched / unbalanced parentheses (extra '(' or extra ')')
 *   - Empty parentheses "()"
 *   - Two binary operators in a row with no operand between them, e.g. "5+*3"
 *   - A binary operator at the very start or end of the expression
 *   - A comma outside of a function call, or wrong arity for SI/CI
 *   - Consecutive numbers with no operator between them, e.g. "5 5"
 *   - Nesting depth beyond MAX_PAREN_DEPTH
 *
 * Designed to fail fast with a CalculatorError carrying a specific ErrorCode,
 * so the UI can show a precise, friendly message.
 * -----------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { TokenType, FUNCTIONS, MAX_PAREN_DEPTH, ErrorCode } = isNode ? require('./constants.js') : global;
  const { CalculatorError } = isNode ? require('./tokenizer.js') : global;

  class Validator {
    /**
     * @param {Token[]} tokens
     */
    constructor(tokens) {
      this.tokens = tokens;
    }

    validate() {
      this._checkParenBalance();
      this._checkTokenSequence();
      this._checkFunctionArity();
      return true;
    }

    _checkParenBalance() {
      let depth = 0;
      let maxDepth = 0;
      for (const tok of this.tokens) {
        if (tok.type === TokenType.LPAREN) {
          depth++;
          maxDepth = Math.max(maxDepth, depth);
          if (depth > MAX_PAREN_DEPTH) {
            throw new CalculatorError(
              ErrorCode.TOO_DEEP,
              `Parenthesis nesting exceeds maximum depth of ${MAX_PAREN_DEPTH}`,
              tok.position
            );
          }
        } else if (tok.type === TokenType.RPAREN) {
          depth--;
          if (depth < 0) {
            throw new CalculatorError(
              ErrorCode.MISSING_PARENTHESIS,
              `Unmatched closing parenthesis at position ${tok.position}`,
              tok.position
            );
          }
        }
      }
      if (depth > 0) {
        throw new CalculatorError(
          ErrorCode.MISSING_PARENTHESIS,
          `Missing ${depth} closing parenthesis${depth > 1 ? 'es' : ''}`,
          this.tokens[this.tokens.length - 1].position
        );
      }
    }

    _checkTokenSequence() {
      const { tokens } = this;
      const n = tokens.length; // includes EOF

      if (n === 1) {
        // Only EOF present -> nothing was tokenized (shouldn't happen given tokenizer guards, but be safe)
        throw new CalculatorError(ErrorCode.EMPTY_EXPRESSION, 'Expression is empty', 0);
      }

      // Track a stack of booleans: for each currently-open '(' , whether it was opened
      // directly by a FUNCTION token (i.e. is a function-call paren that legally permits commas).
      const parenIsFunctionCall = [];

      for (let i = 0; i < n; i++) {
        const tok = tokens[i];
        const prev = i > 0 ? tokens[i - 1] : null;
        const next = i < n - 1 ? tokens[i + 1] : null;

        switch (tok.type) {
          case TokenType.LPAREN: {
            if (next && next.type === TokenType.RPAREN) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Empty parentheses at position ${tok.position}`,
                tok.position
              );
            }
            parenIsFunctionCall.push(Boolean(prev && prev.type === TokenType.FUNCTION));
            break;
          }

          case TokenType.RPAREN: {
            if (!prev) {
              throw new CalculatorError(
                ErrorCode.MISSING_PARENTHESIS,
                `Unexpected closing parenthesis at position ${tok.position}`,
                tok.position
              );
            }
            // ')' cannot directly follow an operator, comma, or opening paren (handled above)
            if (prev.type === TokenType.OPERATOR && OPERATORS_BINARY_OR_PREFIX(prev.value)) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Unexpected closing parenthesis after operator at position ${tok.position}`,
                tok.position
              );
            }
            if (prev.type === TokenType.COMMA) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Unexpected closing parenthesis after comma at position ${tok.position}`,
                tok.position
              );
            }
            parenIsFunctionCall.pop();
            break;
          }

          case TokenType.OPERATOR: {
            const isPrefix = tok.value.startsWith('u');
            if (isPrefix) {
              // Prefix unary must be followed by a number, function, '(', or another prefix unary.
              if (!next || !isOperandStart(next)) {
                throw new CalculatorError(
                  ErrorCode.INVALID_EXPRESSION,
                  `Operator "${tok.value.slice(1)}" at position ${tok.position} must be followed by a value`,
                  tok.position
                );
              }
            } else {
              // Binary operator: cannot be first or last token (EOF excluded), cannot be preceded
              // by another binary operator or '(' or ',' (tokenizer already prevents most of this
              // by choosing unary in those contexts, but defend anyway).
              if (!prev || prev.type === TokenType.LPAREN || prev.type === TokenType.COMMA) {
                throw new CalculatorError(
                  ErrorCode.INVALID_EXPRESSION,
                  `Unexpected operator "${tok.value}" at position ${tok.position}`,
                  tok.position
                );
              }
              if (!next || next.type === TokenType.EOF || next.type === TokenType.RPAREN || next.type === TokenType.COMMA) {
                throw new CalculatorError(
                  ErrorCode.INVALID_EXPRESSION,
                  `Operator "${tok.value}" at position ${tok.position} is missing a right-hand operand`,
                  tok.position
                );
              }
              if (next.type === TokenType.OPERATOR && !next.value.startsWith('u')) {
                throw new CalculatorError(
                  ErrorCode.INVALID_EXPRESSION,
                  `Consecutive operators "${tok.value}" and "${next.value}" at position ${next.position}`,
                  next.position
                );
              }
            }
            break;
          }

          case TokenType.FACTORIAL:
          case TokenType.PERCENT: {
            // Postfix operators must follow a number, ')', '!' or '%'.
            if (!prev || !isOperandEnd(prev)) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Operator "${tok.value}" at position ${tok.position} must follow a value`,
                tok.position
              );
            }
            break;
          }

          case TokenType.NUMBER: {
            // A number cannot be immediately followed by another number or by a function/'(' without an operator.
            if (next && (next.type === TokenType.NUMBER)) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Unexpected number at position ${next.position}; missing operator`,
                next.position
              );
            }
            if (next && (next.type === TokenType.LPAREN || next.type === TokenType.FUNCTION)) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Missing operator before position ${next.position}`,
                next.position
              );
            }
            break;
          }

          case TokenType.FUNCTION: {
            const isRoot = tok.value === 'SQRT' || tok.value === 'CBRT';
            if (isRoot) {
              // √ / ∛ act as prefix operators: must be followed by a number, '(', or another function/prefix.
              if (!next || !isOperandStart(next)) {
                throw new CalculatorError(
                  ErrorCode.INVALID_EXPRESSION,
                  `Function "${tok.value}" at position ${tok.position} must be followed by a value`,
                  tok.position
                );
              }
            } else {
              // SI / CI must be followed by '('.
              if (!next || next.type !== TokenType.LPAREN) {
                throw new CalculatorError(
                  ErrorCode.INVALID_EXPRESSION,
                  `Function "${tok.value}" at position ${tok.position} must be followed by "("`,
                  tok.position
                );
              }
            }
            break;
          }

          case TokenType.COMMA: {
            if (!prev || !isOperandEnd(prev)) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Unexpected comma at position ${tok.position}`,
                tok.position
              );
            }
            if (!next || !isOperandStart(next)) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Comma at position ${tok.position} must be followed by a value`,
                tok.position
              );
            }
            if (parenIsFunctionCall.length === 0 || !parenIsFunctionCall[parenIsFunctionCall.length - 1]) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Comma at position ${tok.position} is not inside a function call`,
                tok.position
              );
            }
            break;
          }

          case TokenType.EOF: {
            if (prev && (prev.type === TokenType.COMMA)) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                'Expression ends with a trailing comma',
                prev.position
              );
            }
            if (prev && prev.type === TokenType.LPAREN) {
              throw new CalculatorError(
                ErrorCode.MISSING_PARENTHESIS,
                'Expression ends with an unmatched opening parenthesis',
                prev.position
              );
            }
            break;
          }

          default:
            break;
        }
      }
    }

    /** Validate that SI(...) and CI(...) calls receive exactly 3 comma-separated arguments. */
    _checkFunctionArity() {
      const { tokens } = this;
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.type !== TokenType.FUNCTION) continue;
        if (tok.value === 'SQRT' || tok.value === 'CBRT') continue; // prefix-style, arity handled by parser

        const meta = FUNCTIONS[tok.value];
        if (!meta) {
          throw new CalculatorError(ErrorCode.UNKNOWN_FUNCTION, `Unknown function "${tok.value}"`, tok.position);
        }

        // Expect tokens[i+1] === LPAREN (validated already above); walk to matching RPAREN counting commas at depth 1.
        let depth = 0;
        let argCount = 1; // start at 1; incremented per comma encountered at depth 1
        let j = i + 1;
        if (tokens[j].type !== TokenType.LPAREN) continue; // already reported elsewhere
        for (; j < tokens.length; j++) {
          const t = tokens[j];
          if (t.type === TokenType.LPAREN) depth++;
          else if (t.type === TokenType.RPAREN) {
            depth--;
            if (depth === 0) break;
          } else if (t.type === TokenType.COMMA && depth === 1) {
            argCount++;
          }
        }
        // Detect empty-argument call: FUNCTION ( ) -> handled by generic empty-paren check, treat as 0 args.
        if (tokens[i + 2] && tokens[i + 2].type === TokenType.RPAREN) {
          argCount = 0;
        }
        if (argCount !== meta.arity) {
          throw new CalculatorError(
            ErrorCode.ARGUMENT_COUNT,
            `Function "${tok.value}" expects ${meta.arity} arguments but received ${argCount}`,
            tok.position
          );
        }
      }
    }
  }

  /** True if `tok` can legitimately start an operand/sub-expression (number, '(', function, prefix-unary). */
  function isOperandStart(tok) {
    return (
      tok.type === TokenType.NUMBER ||
      tok.type === TokenType.LPAREN ||
      tok.type === TokenType.FUNCTION ||
      (tok.type === TokenType.OPERATOR && tok.value.startsWith('u'))
    );
  }

  /** True if `tok` can legitimately end an operand/sub-expression (number, ')', '!' , '%'). */
  function isOperandEnd(tok) {
    return (
      tok.type === TokenType.NUMBER ||
      tok.type === TokenType.RPAREN ||
      tok.type === TokenType.FACTORIAL ||
      tok.type === TokenType.PERCENT
    );
  }

  function OPERATORS_BINARY_OR_PREFIX(value) {
    return true; // any operator token reaching this check is invalid directly before ')'
  }

  const api = { Validator };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.Validator = Validator;
  }
})(typeof window !== 'undefined' ? window : globalThis);
