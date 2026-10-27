import { describe, expect, it } from 'vitest'

import { extractMath, hasMath, renderMathFragments, renderTexToMathML } from '../src/math.js'
import { MAX_MATHML_CHARS, BlockSchema, LessonSchema } from '../src/lesson.js'

const NOW = '2026-01-01T00:00:00.000Z'

describe('host math pre-rendering', () => {
  it('finds inline and display formulas in the skill convention', () => {
    const found = extractMath('Shape \\(X w\\) is explained by\n\n\\[ X w = y \\]\n\nand that is all.')
    expect(found.map((entry) => ({ tex: entry.tex, display: entry.display }))).toEqual([
      { tex: 'X w', display: false },
      { tex: 'X w = y', display: true },
    ])
  })

  it('does not treat math-looking text in fenced code as a formula', () => {
    expect(extractMath('```md\n\\(not math\\)\n```\n\n\\(real math\\)')).toHaveLength(1)
    expect(hasMath('```\n\\[x\\]\n```')).toBe(false)
  })

  it('renders MathML with no KaTeX wrapper or external resource', () => {
    const mathml = renderTexToMathML('\\frac{a}{b}', true)
    expect(mathml.startsWith('<math')).toBe(true)
    expect(mathml).toContain('</math>')
    expect(mathml.length).toBeLessThanOrEqual(MAX_MATHML_CHARS)
    expect(mathml).not.toContain('<span')
    expect(mathml).not.toContain('href=')
    expect(mathml).not.toContain('<script')
  })

  it('rejects invalid TeX with a named error instead of storing a blank', () => {
    expect(() => renderTexToMathML('\\frac{a}{b')).toThrow(/invalid-formula/)
    expect(() => renderTexToMathML('   ')).toThrow(/empty-formula/)
  })

  it('keeps a good inline formula when a sibling is invalid', () => {
    const fragments = renderMathFragments('\\(x^2\\) and \\(\\frac{a}\\) and \\(y\\)')
    expect(fragments.map((entry) => entry.tex)).toEqual(['x^2', 'y'])
    expect(fragments.every((entry) => entry.mathml.startsWith('<math'))).toBe(true)
  })

  it('deduplicates identical formulas', () => {
    expect(renderMathFragments('\\(x\\) and \\(x\\)')).toHaveLength(1)
  })
})

describe('math is part of the durable block schema', () => {
  it('accepts a text block with host MathML and a formula block', () => {
    const mathml = renderTexToMathML('x^2')
    expect(BlockSchema.safeParse({ id: 't', type: 'text', content: { md: '\\(x^2\\)', math: [{ tex: 'x^2', display: false, mathml }] } }).success).toBe(true)
    expect(BlockSchema.safeParse({ id: 'f', type: 'formula', content: { tex: 'x^2', mathml } }).success).toBe(true)
  })

  it('keeps old text blocks without MathML valid', () => {
    expect(BlockSchema.safeParse({ id: 't', type: 'text', content: { md: 'plain' } }).success).toBe(true)
    expect(LessonSchema.safeParse({ id: 'l', courseId: 'c', nodeId: 'n', title: 't', blocks: [{ id: 't', type: 'text', content: { md: '\\(x\\)' } }], origin: 'tutor', createdAt: NOW, updatedAt: NOW }).success).toBe(true)
  })
})
