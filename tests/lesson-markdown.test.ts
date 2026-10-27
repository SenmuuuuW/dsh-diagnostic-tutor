import { describe, expect, it } from 'vitest'

import { blocksMarkdown } from '../src/lesson-markdown.js'
import type { StoredBlock } from '../src/lesson.js'

const blocks: StoredBlock[] = [
  { id: 't', type: 'text', content: { md: 'A **text** unit.' } },
  { id: 'f', type: 'formula', content: { tex: 'x^2', display: true } },
  { id: 'c', type: 'code', content: { language: 'python', source: 'print(1)' } },
  { id: 'q', type: 'quiz', content: { questions: [{ id: 'q1', kind: 'mcq', prompt: 'Which?', options: ['A', 'B'] }] } },
  { id: 'card', type: 'flashcard', content: { front: 'front', back: 'back' } },
  { id: 'r', type: 'resource', content: { title: 'Reading', locator: 'chapter 1' } },
  { id: 'cmp', type: 'comparison', content: { columns: ['A', 'B'], rows: [['1', '2']] } },
  { id: 'future', type: 'video', content: { src: 'clip.mp4' } },
]

describe('Markdown projection for harnesses without the panel', () => {
  it('renders every known block and names an unknown one', () => {
    const markdown = blocksMarkdown(blocks)
    expect(markdown).toContain('A **text** unit.')
    expect(markdown).toContain('\\[x^2\\]')
    expect(markdown).toContain('```python')
    expect(markdown).toContain('Which?')
    expect(markdown).toContain('- A')
    expect(markdown).toContain('front')
    expect(markdown).toContain('Reading')
    expect(markdown).toContain('| A | B |')
    expect(markdown).toContain('[unsupported block: video]')
  })

  it('does not turn the projection into a score or a state claim', () => {
    const markdown = blocksMarkdown(blocks)
    expect(markdown).not.toMatch(/\d+\s*%/)
    expect(markdown.toLowerCase()).not.toContain('mastered')
    expect(markdown.toLowerCase()).not.toContain('confirmed')
  })

  it('is empty for no blocks rather than inventing content', () => {
    expect(blocksMarkdown([])).toBe('')
  })
})
