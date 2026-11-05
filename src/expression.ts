/**
 * A tiny, safe expression evaluator for the slider block.
 *
 * Teaching content is model-authored, so the client must never run it as
 * JavaScript. This parser accepts only numbers, the single variable `x`, a
 * fixed set of functions and constants, the operators `+ - * / ^`, parentheses
 * and commas. Anything else makes the expression invalid.
 *
 * It is deliberately small: one variable, one expression, no assignment, no
 * property access, no strings, no branching. A slider that needs more than this
 * should be a different block, not a bigger evaluator.
 */

export const MAX_EXPRESSION_CHARS = 240
const MAX_DEPTH = 64

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }

const FUNCTIONS: Record<string, { arity: number; apply: (...args: number[]) => number }> = {
  sin: { arity: 1, apply: Math.sin },
  cos: { arity: 1, apply: Math.cos },
  tan: { arity: 1, apply: Math.tan },
  sqrt: { arity: 1, apply: Math.sqrt },
  abs: { arity: 1, apply: Math.abs },
  exp: { arity: 1, apply: Math.exp },
  log: { arity: 1, apply: Math.log },
  ln: { arity: 1, apply: Math.log },
  floor: { arity: 1, apply: Math.floor },
  ceil: { arity: 1, apply: Math.ceil },
  round: { arity: 1, apply: Math.round },
  pow: { arity: 2, apply: Math.pow },
  min: { arity: 2, apply: Math.min },
  max: { arity: 2, apply: Math.max },
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]!
    if (/\s/.test(char)) { index += 1; continue }
    if (/[0-9.]/.test(char)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(index))
      if (match === null) throw new Error('bad number')
      tokens.push({ kind: 'number', value: Number(match[0]) })
      index += match[0].length
      continue
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index))
      if (match === null) throw new Error('bad name')
      tokens.push({ kind: 'name', value: match[0].toLowerCase() })
      index += match[0].length
      continue
    }
    if ('+-*/^(),'.includes(char)) {
      tokens.push({ kind: 'op', value: char })
      index += 1
      continue
    }
    throw new Error('unsupported character')
  }
  return tokens
}

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'variable' }
  | { kind: 'unary'; op: '+' | '-'; value: Node }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] }

class Parser {
  private index = 0
  private depth = 0
  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Node {
    const node = this.additive()
    if (this.index !== this.tokens.length) throw new Error('unexpected token')
    return node
  }

  private peek(): Token | undefined { return this.tokens[this.index] }
  private takeOp(value: string): boolean {
    const token = this.peek()
    if (token?.kind === 'op' && token.value === value) { this.index += 1; return true }
    return false
  }
  private expectOp(value: string): void {
    if (!this.takeOp(value)) throw new Error(`expected ${value}`)
  }
  private enter(): void {
    this.depth += 1
    if (this.depth > MAX_DEPTH) throw new Error('expression too deep')
  }
  private leave(): void { this.depth -= 1 }

  private additive(): Node {
    let left = this.multiplicative()
    for (;;) {
      if (this.takeOp('+')) left = { kind: 'binary', op: '+', left, right: this.multiplicative() }
      else if (this.takeOp('-')) left = { kind: 'binary', op: '-', left, right: this.multiplicative() }
      else return left
    }
  }
  private multiplicative(): Node {
    let left = this.unary()
    for (;;) {
      if (this.takeOp('*')) left = { kind: 'binary', op: '*', left, right: this.unary() }
      else if (this.takeOp('/')) left = { kind: 'binary', op: '/', left, right: this.unary() }
      else return left
    }
  }
  private unary(): Node {
    if (this.takeOp('+')) return { kind: 'unary', op: '+', value: this.unary() }
    if (this.takeOp('-')) return { kind: 'unary', op: '-', value: this.unary() }
    return this.power()
  }
  private power(): Node {
    const base = this.primary()
    if (!this.takeOp('^')) return base
    this.enter()
    const exponent = this.unary()
    this.leave()
    return { kind: 'binary', op: '^', left: base, right: exponent }
  }
  private primary(): Node {
    const token = this.peek()
    if (token === undefined) throw new Error('expected value')
    if (token.kind === 'number') {
      this.index += 1
      return { kind: 'number', value: token.value }
    }
    if (token.kind === 'name') {
      this.index += 1
      if (token.value === 'x') return { kind: 'variable' }
      const fn = FUNCTIONS[token.value]
      if (fn !== undefined) {
        this.expectOp('(')
        this.enter()
        const args: Node[] = []
        if (!this.takeOp(')')) {
          for (;;) {
            args.push(this.additive())
            if (this.takeOp(',')) continue
            this.expectOp(')')
            break
          }
        }
        this.leave()
        if (args.length !== fn.arity) throw new Error('wrong function arity')
        return { kind: 'call', name: token.value, args }
      }
      const constant = CONSTANTS[token.value]
      if (constant !== undefined) return { kind: 'number', value: constant }
      throw new Error('unsupported name')
    }
    if (token.kind === 'op' && token.value === '(') {
      this.index += 1
      this.enter()
      const node = this.additive()
      this.leave()
      this.expectOp(')')
      return node
    }
    throw new Error('expected value')
  }
}

function evaluate(node: Node, x: number): number {
  switch (node.kind) {
    case 'number': return node.value
    case 'variable': return x
    case 'unary': return node.op === '-' ? -evaluate(node.value, x) : evaluate(node.value, x)
    case 'binary': {
      const left = evaluate(node.left, x)
      const right = evaluate(node.right, x)
      switch (node.op) {
        case '+': return left + right
        case '-': return left - right
        case '*': return left * right
        case '/': return left / right
        case '^': return left ** right
      }
    }
    case 'call': {
      const fn = FUNCTIONS[node.name]!
      return fn.apply(...node.args.map((arg) => evaluate(arg, x)))
    }
  }
}

/** Whether an expression is syntactically valid and uses only the safe vocabulary. */
export function isValidExpression(source: string): boolean {
  try {
    if (source.length === 0 || source.length > MAX_EXPRESSION_CHARS) return false
    new Parser(tokenize(source)).parse()
    return true
  } catch { return false }
}

/** Compile an expression, or return null when it is invalid. */
export function compileExpression(source: string): ((x: number) => number) | null {
  try {
    if (source.length === 0 || source.length > MAX_EXPRESSION_CHARS) return null
    const node = new Parser(tokenize(source)).parse()
    return (x: number) => evaluate(node, x)
  } catch { return null }
}
