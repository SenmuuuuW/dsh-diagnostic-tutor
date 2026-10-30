import { describe, expect, it } from 'vitest'

import { DESIGN_CSS } from '../src/client/design-styles.js'

describe('design stylesheet', () => {
  it('does not contain a selector duplicated inside its own rule', () => {
    // This exact shape (`.dtx-today { ... .dtx-today { ...`) silently turned
    // every later rule into a nested rule and left the UI unstyled.
    const duplicates = [...DESIGN_CSS.matchAll(/(\.[a-z0-9-]+)\s*\{[^{}]*?\1\s*\{/gi)]
    expect(duplicates.map((match) => match[1])).toEqual([])
  })

  it('ships the focused-study surface', () => {
    expect(DESIGN_CSS).toContain('.dtx-study {')
    expect(DESIGN_CSS).toContain('.dtx-study-foot {')
    expect(DESIGN_CSS).toContain('.dtx-study-entry {')
  })
})
