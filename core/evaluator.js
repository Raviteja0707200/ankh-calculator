/**
 * evaluator.js
 * -----------------------------------------------------------------------------
 * Walks a postfix (RPN) node list produced by the Parser and evaluates it
 * using a simple stack machine, in O(n) time and O(n) auxiliary space.
 *
 * Node kinds handled:
 *   number    -> push BigDecimal(value)
 *   operator  -> pop 2, apply binary op, push result
 *   unary     -> pop 1, apply prefix unary op, push result
 *   postfix   -> pop 1, apply postfix unary op ('!' or '%'), push result
 *   function  -> pop `argc` values (in argument order), apply function, push result
 *
 * Values on the stack are either BigDecimal or PercentValue (see operators.js
 * for why "%" needs to stay unresolved until it meets its enclosing operator).
 * -----------------------------------------------------------------------------
 */

'use strict';

(function (global) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const { BigDecimal } = isNode ? require('./bigdecimal.js') : global;
  const { Operators, PercentValue } = isNode ? require('./operators.js') : global;
  const { CalcFunctions } = isNode ? require('./functions.js') : global;
  const { ErrorCode } = isNode ? require('./constants.js') : global;
  const { CalculatorError } = isNode ? require('./tokenizer.js') : global;

  class Evaluator {
    /**
     * @param {Array<object>} postfix - RPN node list from Parser.toPostfix()
     */
    constructor(postfix) {
      this.postfix = postfix;
    }

    /** @returns {BigDecimal} final evaluated result */
    evaluate() {
      const stack = [];

      for (const node of this.postfix) {
        switch (node.kind) {
          case 'number': {
            let bd;
            try {
              bd = new BigDecimal(node.value);
            } catch (e) {
              throw new CalculatorError(ErrorCode.INVALID_DECIMAL, `Invalid number "${node.value}"`, node.position);
            }
            stack.push(bd);
            break;
          }

          case 'operator': {
            if (stack.length < 2) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Operator "${node.op}" is missing operands`,
                node.position
              );
            }
            const b = stack.pop();
            const a = stack.pop();
            stack.push(Operators.applyBinary(node.op, a, b, node.position));
            break;
          }

          case 'unary': {
            if (stack.length < 1) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Operator "${node.op}" is missing an operand`,
                node.position
              );
            }
            const a = stack.pop();
            stack.push(Operators.applyUnary(node.op, a, node.position));
            break;
          }

          case 'postfix': {
            if (stack.length < 1) {
              throw new CalculatorError(
                ErrorCode.INVALID_EXPRESSION,
                `Operator "${node.op}" is missing an operand`,
                node.position
              );
            }
            const a = stack.pop();
            stack.push(Operators.applyPostfix(node.op, a, node.position));
            break;
          }

          case 'function': {
            if (stack.length < node.argc) {
              throw new CalculatorError(
                ErrorCode.ARGUMENT_COUNT,
                `Function "${node.name}" is missing arguments`,
                node.position
              );
            }
            const rawArgs = [];
            for (let i = 0; i < node.argc; i++) rawArgs.unshift(stack.pop());
            const args = rawArgs.map((v) => Operators.resolveStandalone(v));

            const fn = CalcFunctions[node.name];
            if (!fn) {
              throw new CalculatorError(ErrorCode.UNKNOWN_FUNCTION, `Unknown function "${node.name}"`, node.position);
            }
            stack.push(fn(args, node.position));
            break;
          }

          default:
            throw new CalculatorError(
              ErrorCode.UNEXPECTED_TOKEN,
              `Unknown postfix node kind "${node.kind}"`,
              node.position
            );
        }
      }

      if (stack.length !== 1) {
        throw new CalculatorError(
          ErrorCode.INVALID_EXPRESSION,
          'Expression did not reduce to a single value',
          0
        );
      }

      return Operators.resolveStandalone(stack[0]);
    }
  }

  const api = { Evaluator };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.Evaluator = Evaluator;
  }
})(typeof window !== 'undefined' ? window : globalThis);
