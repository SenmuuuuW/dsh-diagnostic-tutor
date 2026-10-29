/**
 * Host-side math pre-rendering.
 *
 * The browser half is a single JavaScript file with nowhere to serve KaTeX
 * fonts or CSS from, so TeX cannot be typeset there. Instead the host renders
 * every formula to a MathML subtree at write time and stores that subtree next
 * to the original TeX. The browser renders native MathML; no font, stylesheet or
 * network request is added. TeX remains the source of truth for re-rendering and
 * export.
 *
 * Only the `<math>` element is stored. KaTeX's wrapper `<span class="katex">`
 * is deliberately dropped: the client whitelist should never have to decide
 * what to do with arbitrary KaTeX chrome.
 */

import katex from 'katex'

import { MAX_MATHML_CHARS, MAX_MATH_TEX_CHARS } from './lesson.js'

export interface MathFragment {
  /** Source TeX, without the delimiters. */
  tex: string
  display: boolean
  /** Sanitized-to-our-best-knowledge `<math>...</math>` subtree. */
  mathml: string
}

interface DelimitedMath {
  tex: string
  display: boolean
  start: number
  end: number
}

/** The skill's convention: inline `\(...\)`, display `\[...\]`. */
const MATH_PATTERN = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g

/**
 * Mark byte ranges that are fenced code so math-looking text inside a code
 * sample is not rendered. Offsets are JavaScript string indices.
 */
function fenceMask(markdown: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const lines = markdown.split('\n')
  let offset = 0
  let open: number | null = null
  for (const line of lines) {
    const next = offset + line.length + 1
    if (line.trimStart().startsWith('```')) {
      if (open === null) open = offset
      else { ranges.push([open, next]); open = null }
    }
    offset = next
  }
  if (open !== null) ranges.push([open, markdown.length])
  return ranges
}

function masked(index: number, ranges: readonly [number, number][]): boolean {
  return ranges.some(([start, end]) => index >= start && index < end)
}

/** Extract every formula in the skill's delimiters, skipping fenced code. */
export function extractMath(markdown: string): DelimitedMath[] {
  const ranges = fenceMask(markdown)
  const found: DelimitedMath[] = []
  for (const match of markdown.matchAll(MATH_PATTERN)) {
    const index = match.index ?? 0
    if (masked(index, ranges)) continue
    const display = match[1] !== undefined
    const tex = ((display ? match[1] : match[2]) ?? '').trim()
    if (tex.length === 0) continue
    found.push({ tex, display, start: index, end: index + (match[0] ?? '').length })
  }
  return found
}

/**
 * Render one TeX expression to a stored MathML subtree.
 *
 * Invalid TeX is a caller-visible error: a formula block that cannot be
 * rendered should be rejected at the boundary, not stored as an unexplained
 * blank. Text blocks use the non-throwing `renderMathFragments` instead so one
 * bad inline expression cannot destroy an otherwise useful unit.
 */
export function renderTexToMathML(tex: string, display = false): string {
  if (tex.trim().length === 0) throw new Error('empty-formula')
  if (tex.length > MAX_MATH_TEX_CHARS) throw new Error('formula-too-long')
  let rendered: string
  try {
    rendered = katex.renderToString(tex, {
      output: 'mathml',
      displayMode: display,
      throwOnError: true,
      strict: 'ignore',
      trust: false,
    })
  } catch (cause) {
    throw new Error(`invalid-formula: ${(cause as Error).message}`)
  }
  const match = /<math[\s\S]*?<\/math>/.exec(rendered)
  if (match === null) throw new Error('invalid-formula: no MathML produced')
  if (match[0].length > MAX_MATHML_CHARS) throw new Error('formula-mathml-too-long')
  return match[0]
}

/**
 * Pre-render every valid formula in a markdown string.
 *
 * A bad inline expression is skipped, leaving the raw delimiters for the
 * existing styled fallback; the rest of the unit still renders. Fragments are
 * unique by (tex, display) to keep the stored record small.
 */
export function renderMathFragments(markdown: string): MathFragment[] {
  const unique = new Map<string, MathFragment>()
  for (const formula of extractMath(markdown)) {
    const key = `${formula.display ? 'd' : 'i'}:${formula.tex}`
    if (unique.has(key)) continue
    try {
      unique.set(key, {
        tex: formula.tex,
        display: formula.display,
        mathml: renderTexToMathML(formula.tex, formula.display),
      })
    } catch {
      // Preserve the raw text; the client falls back to the old styled math.
    }
  }
  return [...unique.values()]
}

/** True when a Markdown body contains at least one formula. */
export function hasMath(markdown: string): boolean {
  return extractMath(markdown).length > 0
}
