# Ankh Calculator

A production-ready Indian scientific & financial calculator built entirely in **HTML5, CSS3, and vanilla JavaScript (ES6+)** — no frameworks, no `eval()`, no `Function()`. Every expression is evaluated by a real hand-written expression engine: **Tokenizer → Validator → Shunting-Yard Parser → Postfix (RPN) → Stack Evaluator**.

It supports arbitrary-precision decimal arithmetic, Indian lakh/crore number formatting, Indian-English number-to-words conversion (with no upper limit), and the two financial functions `SI()` and `CI()`, all wrapped in a calculator UI styled like a precision financial instrument — a Casio scientific calculator crossed with a banker's ledger, with a signature "cheque strip" that spells out the result the way an amount is written in words on an Indian bank cheque.

---

## 1. Quick start

No build step, no dependencies, no server required.

```bash
cd Calculator
# open index.html directly in a browser, or serve it:
python3 -m http.server 8000
# then visit http://localhost:8000
```

## 2. Project structure

```text
Calculator/
│
├── index.html               Page structure: display, keypad, history panel, modal
├── style.css                 Full visual design (charcoal/brass/teal, parchment display)
├── app.js                     Application controller — wires the UI to the engine
│
├── core/
│   ├── constants.js           Token types, operator table, error codes, limits
│   ├── bigdecimal.js          Arbitrary-precision decimal arithmetic (BigInt-backed)
│   ├── tokenizer.js           Expression string -> token stream
│   ├── validator.js           Grammar-level validation of the token stream
│   ├── parser.js              Shunting-Yard algorithm: infix tokens -> postfix (RPN)
│   ├── operators.js           Binary/unary/postfix operator semantics + percent logic
│   ├── functions.js           SI, CI, SQRT, CBRT implementations
│   ├── evaluator.js           O(n) stack machine that evaluates postfix RPN
│   ├── formatter.js           Indian comma-grouping (lakh/crore) number formatting
│   └── indianWords.js         Indian-English number-to-words conversion
│
├── tests/
│   ├── test-harness.js                        Shared test assertions/reporting
│   ├── 01-arithmetic.test.js                  Arithmetic, precedence, parentheses
│   ├── 02-percent-power-root-factorial.test.js
│   ├── 03-financial-functions.test.js         SI / CI
│   ├── 04-indian-formatting.test.js           Lakh/crore comma formatting
│   ├── 05-number-to-words.test.js             Number-to-words conversion
│   ├── 06-errors.test.js                      Invalid expressions & error codes
│   ├── 07-boundary-performance.test.js        Limits & O(n) performance checks
│   └── run-all.js                             Master runner (aggregates every suite)
│
└── README.md
```

## 3. Running the test suite

```bash
cd Calculator
node tests/run-all.js              # runs all 7 suites, prints a grand total
node tests/01-arithmetic.test.js   # or run any single suite directly
```

The full suite currently runs **4,498 test cases**, all passing, covering:

| Suite | Cases | Covers |
|---|---|---|
| `01-arithmetic` | 2,111 | `+ - * /`, precedence, associativity, parentheses (incl. 200-deep nesting), unary chains, decimal precision, large numbers |
| `02-percent-power-root-factorial` | 138 | Context-sensitive `%`, `^` (incl. negative exponents/bases), `√` `∛`, `!` |
| `03-financial-functions` | 51 | `SI(P,R,T)`, `CI(P,R,T)`, argument validation, nesting |
| `04-indian-formatting` | 1,046 | Comma grouping from 0 through 24-digit numbers, negatives, decimals |
| `05-number-to-words` | 1,049 | Every value 0-99, hundreds, thousands, lakhs, crores, crore-of-crore scale, currency mode, 800 randomized cross-checks against an independent reference implementation |
| `06-errors` | 82 | Every required error category (div-by-zero, malformed syntax, missing parens, unknown function/operator, invalid decimal/factorial, negative sqrt, overflow, length/depth limits) |
| `07-boundary-performance` | 21 | Exactly-at-limit boundaries (1000 parens, 50,000 chars, 1000-digit numbers, 100,000! cap) and timing sanity checks |

## 4. Architecture: the expression engine

No `eval()` or `Function()` is used anywhere. Every expression goes through five explicit stages:

```
"((25+5)*8)^2"
        |  Tokenizer
        v
[ (, (, 25, +, 5, ), *, 8, ), ^, 2 ]
        |  Validator   (parens balanced, no two operators in a row, correct arity, ...)
        v
        |  Parser (Shunting-Yard)
        v
[ 25, 5, +, 8, *, 2, ^ ]            <- postfix / RPN
        |  Evaluator (stack machine)
        v
57600
```

* **Tokenizer** (`core/tokenizer.js`) — turns the raw string into typed tokens, disambiguating unary vs. binary `+`/`-` from lexical context (e.g. `25--5`, `5*-3`, `2^-5`, `∛-8` all tokenize correctly).
* **Validator** (`core/validator.js`) — a second pass over the token stream that catches malformed grammar (unbalanced parens, empty parens, consecutive operators, commas outside a function call, wrong function arity) *before* parsing, so errors are precise and early.
* **Parser** (`core/parser.js`) — a textbook Shunting-Yard implementation, extended to handle: right-associative `^`, prefix-unary `√`/`∛`/`-`/`+` (which bind tighter than any binary operator), postfix `!`/`%`, and multi-argument function calls (`SI`/`CI`). Runs in O(n).
* **Evaluator** (`core/evaluator.js`) — a simple O(n) stack machine over the postfix list. The only non-trivial piece is percentage resolution (see below).
* **BigDecimal** (`core/bigdecimal.js`) — a self-contained arbitrary-precision decimal type built on native `BigInt`, used for *every* numeric value in the engine. This is what guarantees `0.1 + 0.2 === 0.3` exactly, with no floating-point error, and supports 1000+ digit numbers without losing precision.

### Percentage semantics

The calculator matches how a physical scientific calculator behaves, which is genuinely context-sensitive:

```
25%             -> 0.25                     (standalone: divide by 100)
500 + 10%       -> 550   = 500 + 500x10%    (with + / -, % means "of the other operand")
500 - 10%       -> 450   = 500 - 500x10%
500 * 10%       -> 50    = 500 x 0.10        (with * / , % is just a plain fraction)
500 / 10%       -> 5000  = 500 / 0.10
```

This is implemented without any lookahead grammar: `core/operators.js` wraps a `%`-suffixed value in a `PercentValue` marker carrying the raw percentage figure. When the *enclosing* binary operator is later applied, `+`/`-` resolve the percent relative to the other operand, while `*`/`/`/standalone resolve it as a plain fraction.

### Indian number-to-words

Below one crore (10^7), numbers are split exactly like the comma formatter does — a 3-digit "hundreds" group, then 2-digit Thousand and Lakh groups. At and above one crore, the conversion is **recursive**: any value >= 10^7 is expressed as

```
words(value) = words(floor(value / 10^7)) + " Crore " + words(value % 10^7)
```

which is exactly how Indian financial English actually scales beyond crore (the "Crore" unit itself gets re-prefixed with Hundred/Thousand/Lakh/Crore, just like smaller units do), producing — and verified exactly against a reference table — results like:

```
1,00,00,000                One Crore
10,00,00,000               Ten Crore
1,00,00,00,000             One Hundred Crore
10,00,00,00,000            One Thousand Crore
1,00,00,00,00,000          One Lakh Crore
1,00,00,00,00,00,000       One Crore Crore
```

with no fixed upper limit — the recursion just keeps dividing by 10^7.

## 5. Supported syntax

| Category | Examples |
|---|---|
| Arithmetic | `25+18`, `25-10`, `25*5`, `100/4` |
| Power / roots | `2^10`, `√625`, `∛729`, `2^-5` |
| Factorial / percent | `5!`, `25%`, `500+10%` |
| Parentheses | `((25+5)*8)^2`, up to 1000 levels deep |
| Unary | `-25`, `(-25)`, `25--5`, `5*-3` |
| Decimals | `25.75`, `0.00025`, `0.1+0.2` (exact, no float error) |
| Financial functions | `SI(P,R,T)` = (PxRxT)/100, `CI(P,R,T)` = Px(1+R/100)^T - P |

## 6. UI features

* Live expression evaluation as you type, with the result, Indian-formatted figure, and amount-in-words all updating together.
* The **cheque strip** — a signature ruled line styled after how amounts are spelled out on Indian bank cheques, showing the result as currency words ("...Rupees and ...Paise Only").
* History panel (persisted to `localStorage`, capped at the last 100 calculations); click any entry to restore it.
* Copy-to-clipboard for the current result.
* A finance-function picker modal for inserting `SI(` / `CI(` templates.
* Full keyboard support: digits/operators, `Enter` to evaluate, `Escape`/`Delete` to clear, `Backspace`, `Ctrl+C`/`Ctrl+V`.
* Responsive: single-column layout with the history panel relocated below the calculator on narrow viewports.

## 7. Error handling

Every error is classified with a specific code (`DIVISION_BY_ZERO`, `MISSING_PARENTHESIS`, `UNKNOWN_FUNCTION`, `INVALID_FACTORIAL`, `NEGATIVE_SQRT`, `OVERFLOW`, `TOO_DEEP`, `TOO_LONG`, `ARGUMENT_COUNT`, etc. — see `core/constants.js`) and surfaced as a short, human-readable message beneath the result display, without ever clearing the expression you've already typed.

## 8. Performance

The engine is O(n) end-to-end (tokenize -> validate -> parse -> evaluate), verified to handle:
* 1000+ levels of nested parentheses
* ~50,000-character expressions
* 1000-digit numeric literals
* Large financial calculations (8+ digit principals over decade-long terms)

all in well under a second — see `tests/07-boundary-performance.test.js` for exact timing assertions.
