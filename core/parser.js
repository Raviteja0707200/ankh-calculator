/**
 * parser.js
 * -----------------------------------------------------------------------------
 * Implements the Shunting-Yard algorithm to convert a validated infix token
 * stream into Reverse Polish Notation (postfix), which the Evaluator can then
 * process with a simple O(n) stack pass.
 *
 * Supported postfix node kinds emitted:
 *   { kind: 'number',   value: '<raw numeric string>' }
 *   { kind: 'operator', op: '+'|'-'|'*'|'/'|'^' }                  (binary)
 *   { kind: 'unary',    op: 'u-'|'u+' }                            (prefix unary)
 *   { kind: 'postfix',  op: '!'|'%' }                              (postfix unary)
 *   { kind: 'function', name: 'SQRT'|'CBRT', argc: 1 }
 *   { kind: 'function', name: 'SI'|'CI',     argc: 3 }
 *
 * The algorithm runs in O(n) time and O(n) space relative to token count,
 * satisfying the performance requirement for large expressions (up to
 * MAX_EXPRESSION_LENGTH characters / MAX_PAREN_DEPTH nesting).
 * -----------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { TokenType, OPERATORS, FUNCTIONS, ErrorCode } = isNode ? require('./constants.js') : global;
  const { CalculatorError } = isNode ? require('./tokenizer.js') : global;

  /** Internal marker pushed onto the operator stack when a function call's '(' is opened. */
  const FUNCTION_PAREN_MARKER = Symbol('FUNCTION_PAREN');

  class Parser {
    /**
     * @param {Token[]} tokens - already validated token stream (including trailing EOF)
     */
    constructor(tokens) {
      this.tokens = tokens;
    }

    /** @returns {Array<object>} postfix (RPN) node list */
    toPostfix() {
      const output = [];
      const opStack = []; // holds operator strings, '(' markers, or { fn, argc } call frames
      const argCountStack = []; // tracks argument counts for active function calls, parallel to '(' depth

      const tokens = this.tokens;

      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        switch (tok.type) {
          case TokenType.NUMBER: {
            output.push({ kind: 'number', value: tok.value, position: tok.position });
            break;
          }

          case TokenType.FUNCTION: {
            const isRootFn = tok.value === 'SQRT' || tok.value === 'CBRT';
            if (isRootFn) {
              // √ / ∛ behave as prefix unary operators (precedence matches unary minus/plus):
              // they bind to exactly the single operand that immediately follows, e.g.
              // "√625" -> sqrt(625), "√25+5" -> sqrt(25)+5, "√(25+5)" -> sqrt(30).
              while (opStack.length) {
                const top = opStack[opStack.length - 1];
                if (top.type !== 'op') break;
                const topMeta = OPERATORS[top.value];
                const myPrecedence = 8; // same binding strength as unary minus/plus
                const shouldPop = topMeta.precedence > myPrecedence;
                if (!shouldPop) break;
                output.push(this._popOperatorNode(opStack));
              }
              opStack.push({ type: 'rootfn', name: tok.value, position: tok.position });
            } else {
              // SI / CI: must be called with parens, e.g. SI(100,5,2). Push a marker so the
              // following LPAREN is recognised as opening a function-call argument list.
              opStack.push({ type: 'func', name: tok.value, position: tok.position });
            }
            break;
          }

          case TokenType.LPAREN: {
            const top = opStack[opStack.length - 1];
            if (top && top.type === 'func') {
              opStack.pop(); // consume the 'func' marker; replace with its paren frame
              opStack.push({ type: 'paren', isFunctionCall: true, funcName: top.name, funcPosition: top.position });
              argCountStack.push(1); // at least one argument once we see the first operand (adjusted on RPAREN if empty)
            } else {
              opStack.push({ type: 'paren', isFunctionCall: false });
            }
            break;
          }

          case TokenType.COMMA: {
            // Pop operators (and any pending root-functions) until we hit the enclosing
            // function-call paren marker.
            while (opStack.length && (opStack[opStack.length - 1].type === 'op' || opStack[opStack.length - 1].type === 'rootfn')) {
              output.push(this._popOperatorNode(opStack));
            }
            const top = opStack[opStack.length - 1];
            if (!top || top.type !== 'paren' || !top.isFunctionCall) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Comma at position ${tok.position} is not inside a function call`,
                tok.position
              );
            }
            argCountStack[argCountStack.length - 1] += 1;
            break;
          }

          case TokenType.RPAREN: {
            while (opStack.length && (opStack[opStack.length - 1].type === 'op' || opStack[opStack.length - 1].type === 'rootfn')) {
              output.push(this._popOperatorNode(opStack));
            }
            const parenFrame = opStack.pop();
            if (!parenFrame || parenFrame.type !== 'paren') {
              throw new CalculatorError(
                ErrorCode.MISSING_PARENTHESIS,
                `Unmatched closing parenthesis at position ${tok.position}`,
                tok.position
              );
            }
            if (parenFrame.isFunctionCall) {
              const argc = argCountStack.pop();
              const meta = FUNCTIONS[parenFrame.funcName];
              output.push({
                kind: 'function',
                name: parenFrame.funcName,
                argc,
                position: parenFrame.funcPosition
              });
              if (meta && argc !== meta.arity) {
                throw new CalculatorError(
                  ErrorCode.ARGUMENT_COUNT,
                  `Function "${parenFrame.funcName}" expects ${meta.arity} arguments but received ${argc}`,
                  parenFrame.funcPosition
                );
              }
            }
            break;
          }

          case TokenType.FACTORIAL:
          case TokenType.PERCENT: {
            // Postfix unary operators bind immediately and tighter than any pending binary op,
            // so emit directly to output rather than going through the operator stack precedence
            // dance (they always apply to the value immediately to their left).
            output.push({ kind: 'postfix', op: tok.value, position: tok.position });
            break;
          }

          case TokenType.OPERATOR: {
            const isUnary = tok.value.startsWith('u');
            const meta = OPERATORS[tok.value];
            if (!meta) {
              throw new CalculatorError(ErrorCode.UNKNOWN_OPERATOR, `Unknown operator "${tok.value}"`, tok.position);
            }

            if (isUnary) {
              // Prefix unary operators (u-, u+) never cause anything to be popped —
              // they simply wait on the stack for their single upcoming operand.
              // Popping here would be wrong: e.g. in "∛-8", the pending CBRT rootfn
              // must stay below this u- entry so the eventual postfix order is
              // [8, u-, CBRT] (negate 8, then cube-root the result is NOT what we want —
              // see note below) rather than emitting CBRT before its operand exists.
              opStack.push({ type: 'op', value: tok.value, isUnary, position: tok.position });
              break;
            }

            while (opStack.length) {
              const top = opStack[opStack.length - 1];
              if (top.type === 'rootfn') {
                // Root functions (√, ∛) always bind tighter than any binary operator.
                output.push(this._popOperatorNode(opStack));
                continue;
              }
              if (top.type !== 'op') break;
              const topMeta = OPERATORS[top.value];
              const shouldPop =
                topMeta.precedence > meta.precedence ||
                (topMeta.precedence === meta.precedence && meta.assoc === 'L');
              if (!shouldPop) break;
              output.push(this._popOperatorNode(opStack));
            }
            opStack.push({ type: 'op', value: tok.value, isUnary, position: tok.position });
            break;
          }

          case TokenType.EOF: {
            while (opStack.length) {
              const top = opStack[opStack.length - 1];
              if (top.type === 'paren') {
                throw new CalculatorError(
                  ErrorCode.MISSING_PARENTHESIS,
                  'Missing closing parenthesis',
                  top.funcPosition !== undefined ? top.funcPosition : tok.position
                );
              }
              output.push(this._popOperatorNode(opStack));
            }
            break;
          }

          default:
            throw new CalculatorError(
              ErrorCode.UNEXPECTED_TOKEN,
              `Unexpected token at position ${tok.position}`,
              tok.position
            );
        }
      }

      if (output.length === 0) {
        throw new CalculatorError(ErrorCode.EMPTY_EXPRESSION, 'Expression is empty', 0);
      }

      return output;
    }

    _popOperatorNode(opStack) {
      const frame = opStack.pop();
      if (frame.type === 'rootfn') {
        return { kind: 'function', name: frame.name, argc: 1, position: frame.position };
      }
      if (frame.isUnary) {
        return { kind: 'unary', op: frame.value, position: frame.position };
      }
      return { kind: 'operator', op: frame.value, position: frame.position };
    }
  }

  const api = { Parser };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.Parser = Parser;
  }
})(typeof window !== 'undefined' ? window : globalThis);
