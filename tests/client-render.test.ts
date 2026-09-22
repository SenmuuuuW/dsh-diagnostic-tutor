/**
 * Panel and block rendering.
 *
 * Rendered with `renderToStaticMarkup`, so these run in a plain node
 * environment with no DOM and no test framework glue — the assertions are about
 * what the panel *draws*, which is exactly what a reviewer would check.
 *
 * The interaction test in `client-interaction.test.ts` covers clicking; this
 * file covers the output.
 */

import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Block, NodeView, OverviewResponse } from '../src/contract.js'
import { LearningPanel } from '../src/client/app.js'
import { BLOCK_RENDERERS, LessonBody } from '../src/client/blocks.js'
import { FORBIDDEN_SCORE_FIELDS } from '../src/vocabulary.js'

const NOW = '2026-01-01T00:00:00.000Z'

function node(id: string, title: string, relation: string, state: string, parentId: string | null): NodeView {
  return { id, title, relation, state, parentId, evidenceCount: 1, updatedAt: NOW }
}

const overview: OverviewResponse = {
  ok: true,
  course: {
    id: 'ml',
    title: 'Machine Learning',
    goal: 'Learn ML from weak math foundations',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  },
  focus: null,
  nextStep: null,
  handoff: null,
  nodes: [
    node('ml:goal', 'Machine Learning', 'goal', 'unconfirmed', null),
    node('ml:math', 'Math Foundations', 'prerequisite', 'blocked', 'ml:goal'),
    node('ml:math:la', 'Linear Algebra', 'part-of', 'unconfirmed', 'ml:math'),
    node('ml:math:calc', 'Calculus', 'part-of', 'unconfirmed', 'ml:math'),
    node('ml:math:prob', 'Probability', 'part-of', 'unconfirmed', 'ml:math'),
    node('ml:python', 'Python', 'prerequisite', 'unconfirmed', 'ml:goal'),
  ],
  lessonCount: 0,
}

const client = {
  fetchOverview: () => Promise.resolve(overview),
  fetchNode: () => Promise.reject(new Error('not used')),
  fetchLesson: () => Promise.reject(new Error('not used')),
  startFocus: () => Promise.reject(new Error('not used')),
}

/** Render through React so hooks are legal; calling a component directly would not be. */
function render(ui: ReactNode): string {
  return renderToStaticMarkup(ui)
}

/** Shorthand for the two components under test. */
function panel(props: Parameters<typeof LearningPanel>[0]): string {
  return render(createElement(LearningPanel, props))
}
function lesson(blocks: Block[]): string {
  return render(createElement(LessonBody, { blocks }))
}

describe('the panel shows the product, not a dashboard', () => {
  const html = panel({ client, initialOverview: overview })

  it('names the three panes in order', () => {
    const course = html.indexOf('Current course')
    const surface = html.indexOf('Learning surface')
    expect(course).toBeGreaterThanOrEqual(0)
    // The detail pane shows its empty prompt before the first selection.
    expect(html).toContain('Pick a node on the map')
    expect(surface).toBeGreaterThanOrEqual(0)
    expect(course).toBeLessThan(surface)
  })

  it('shows the course and the goal verbatim', () => {
    expect(html).toContain('Machine Learning')
    expect(html).toContain('Learn ML from weak math foundations')
  })

  it('draws every node with its state as a word', () => {
    for (const title of ['Math Foundations', 'Linear Algebra', 'Calculus', 'Probability', 'Python']) {
      expect(html).toContain(title)
    }
    expect(html).toContain('blocked')
    expect(html).toContain('unconfirmed')
  })

  it('marks the blocked node with its own state class', () => {
    expect(html).toContain('dt-state-blocked')
  })

  it('shows no percentage, score or progress anywhere', () => {
    expect(html).not.toMatch(/\d+\s*%/)
    for (const forbidden of FORBIDDEN_SCORE_FIELDS) {
      // The word may not appear as a rendered label or attribute.
      expect(html.toLowerCase()).not.toContain(`>${forbidden}<`)
    }
  })

  it('reports confirmation as a count of nodes, not as a grade', () => {
    expect(html).toContain('0 of 6 confirmed by evidence')
  })
})

describe('an empty runtime is a normal state', () => {
  const empty: OverviewResponse = { ok: true, course: null, nodes: [], focus: null, nextStep: null, handoff: null, lessonCount: 0 }
  const html = panel({
    client: { ...client, fetchOverview: () => Promise.resolve(empty) },
    initialOverview: empty,
  })

  it('says so instead of rendering broken chrome', () => {
    expect(html).toContain('No goal yet')
    expect(html).toContain('Nothing on the map yet')
  })
})

describe('block renderers', () => {
  const blocks: Block[] = [
    { id: 'a', type: 'text', content: { md: 'First paragraph.\n\nSecond **paragraph**.' } },
    {
      id: 'b',
      type: 'example',
      content: { title: 'A worked case', steps: ['step one', 'step two'], takeaway: 'the point' },
    },
    { id: 'c', type: 'diagram', content: { format: 'ascii', spec: 'root\n└─ child', caption: 'a map' } },
    { id: 'd', type: 'check', content: { prompt: 'What do you already know?', expect: 'reasoning' } },
  ]

  it('registers exactly the four v0.0.4 block types', () => {
    expect(Object.keys(BLOCK_RENDERERS).sort()).toEqual(['check', 'diagram', 'example', 'text'])
  })

  it('renders every type in order', () => {
    const html = lesson(blocks)
    expect(html).toContain('First paragraph.')
    expect(html).toContain('A worked case')
    expect(html).toContain('step two')
    expect(html).toContain('root')
    expect(html).toContain('What do you already know?')
    // Declaration order is preserved in the output.
    expect(html.indexOf('First paragraph.')).toBeLessThan(html.indexOf('A worked case'))
    expect(html.indexOf('A worked case')).toBeLessThan(html.indexOf('What do you already know?'))
  })

  it('escapes content rather than injecting it', () => {
    const hostile: Block[] = [
      { id: 'x', type: 'text', content: { md: '<img src=x onerror=alert(1)>' } },
    ]
    const html = lesson(hostile)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('an unknown block degrades instead of breaking the lesson', () => {
  // A lesson authored by a newer host must still render here.
  const future = [
    { id: 'a', type: 'text', content: { md: 'Before.' } },
    { id: 'b', type: 'formula', content: { latex: 'x^2' } },
    { id: 'c', type: 'text', content: { md: 'After.' } },
  ] as unknown as Block[]

  it('renders the known blocks and announces the unknown one', () => {
    const html = lesson(future)
    expect(html).toContain('Before.')
    expect(html).toContain('After.')
    expect(html).toContain('formula')
    expect(html).toContain('no renderer')
  })

  it('does not throw', () => {
    expect(() => lesson(future)).not.toThrow()
  })
})
