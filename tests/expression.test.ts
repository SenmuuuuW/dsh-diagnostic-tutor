import { describe, expect, it } from 'vitest'

import { compileExpression, isValidExpression } from '../src/expression.js'

describe('the slider expression evaluator', () => {
  it('evaluates arithmetic, powers and the slider variable', () => {
    const f = compileExpression('(x - 3)^2 + 2')!
    expect(f(3)).toBe(2)
    expect(f(1)).toBe(6)
  })

  it('supports the small fixed function vocabulary', () => {
    expect(compileExpression('sin(x)')!(0)).toBe(0)
    expect(compileExpression('sqrt(abs(x))')!(-9)).toBe(3)
    expect(compileExpression('max(x, 2)')!(1)).toBe(2)
  })

  it('rejects anything outside numbers, x, safe functions and operators', () => {
    for (const source of ['alert(1)', 'x; 1', 'window.x', 'x = 2', 'foo(x)', 'x.__proto__', '']) {
      expect(isValidExpression(source), source).toBe(false)
      expect(compileExpression(source)).toBeNull()
    }
  })

  it('rejects malformed expressions', () => {
    for (const source of ['(x', 'x +', 'sin()', 'sin(x, 1)', 'x ^']) {
      expect(isValidExpression(source), source).toBe(false)
    }
  })

  it('caps length and nesting', () => {
    expect(isValidExpression('x'.repeat(241))).toBe(false)
    expect(isValidExpression('('.repeat(70) + 'x' + ')'.repeat(70))).toBe(false)
  })
})
