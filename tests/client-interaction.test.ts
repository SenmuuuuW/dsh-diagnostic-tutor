// @vitest-environment jsdom
/**
 * Panel interaction, in a real DOM.
 *
 * This is the test that proves the product claim end to end at the UI level:
 * **map → click a node → its detail → Start learning → the learning surface.**
 * Rendering assertions cannot show that, because the transition is the point.
 *
 * The panel takes its API as a prop, so the fakes here are ordinary objects —
 * no global `fetch` stubbing, and no server needed.
 */

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// React needs to be told this is a test environment, or `act` warns on every
// update and state flushes are not batched.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import type {
  FocusResponse,
  FocusView,
  LessonRecord,
  NodeDetailResponse,
  NodeView,
  OverviewResponse,
} from '../src/contract.js'
import { LearningPanel } from '../src/client/app.js'
import type { PanelClient } from '../src/client/app.js'

const NOW = '2026-01-01T00:00:00.000Z'

function node(id: string, title: string, relation: string, state: string, parentId: string | null): NodeView {
  return { id, title, relation, state, parentId, evidenceCount: 1, updatedAt: NOW }
}

const nodes = [
  node('ml:goal', 'Machine Learning', 'goal', 'unconfirmed', null),
  node('ml:math', 'Math Foundations', 'prerequisite', 'blocked', 'ml:goal'),
  node('ml:math:la', 'Linear Algebra', 'part-of', 'unconfirmed', 'ml:math'),
  node('ml:python', 'Python', 'prerequisite', 'unconfirmed', 'ml:goal'),
]

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
  nodes,
  focus: null,
  nextStep: null,
  handoff: null,
  lessonCount: 0,
}

/** Focus the fake host is currently holding; `startFocus` sets it. */
let activeFocus: FocusView | null = null

/**
 * Blocks the "tutor" adds after the fact, to model a turn still in progress.
 * The panel should pick these up from its own polling, with no user action.
 */
let tutorBlocks: { id: string; type: string; content: Record<string, unknown> }[] = []

const lesson: LessonRecord = {
  id: 'ml:math:prototype',
  courseId: 'ml',
  nodeId: 'ml:math',
  title: 'Math Foundations',
  origin: 'prototype',
  createdAt: NOW,
  updatedAt: NOW,
  blocks: [
    { id: 'a', type: 'text', content: { md: 'Why this node exists.' } },
    { id: 'b', type: 'check', content: { prompt: 'What do you already know?' } },
  ],
}

/** Records which node the interaction test asked about. */
const asked: string[] = []
const askedLesson: string[] = []
const started: string[] = []

const fixtureClient: PanelClient = {
  // Stateful, like the real host: starting a focus changes what the next
  // overview reports, which is what the panel polls for.
  fetchOverview: () => Promise.resolve({ ...overview, focus: activeFocus }),
  fetchNode: (nodeId): Promise<NodeDetailResponse> => {
    asked.push(nodeId)
    const target = nodes.find((entry) => entry.id === nodeId)
    if (!target) return Promise.reject(new Error('no such node'))
    return Promise.resolve({
      ok: true,
      node: {
        ...target,
        evidence: [{ kind: 'diagnosis', at: NOW, readiness: 'step-down', note: 'shaky maths' }],
      },
      parent: nodes.find((entry) => entry.id === target.parentId) ?? null,
      children: nodes.filter((entry) => entry.parentId === nodeId),
      lessonExists: false,
    })
  },
  // One lesson per node, as the runtime stores it: the surface shows whatever
  // the tutor wrote for the node that is focused.
  fetchLesson: (nodeId) => {
    askedLesson.push(nodeId)
    const target = nodes.find((entry) => entry.id === nodeId)
    if (!target) return Promise.resolve({ ok: true as const, lesson: null })
    return Promise.resolve({
      ok: true as const,
      lesson: {
        ...lesson,
        id: `${nodeId}:lesson`,
        nodeId,
        title: target.title,
        blocks: [...lesson.blocks, ...tutorBlocks] as never,
      },
    })
  },
  startFocus: (nodeId, sessionId): Promise<FocusResponse> => {
    started.push(`${nodeId}@${sessionId ?? '-'}`)
    const target = nodes.find((entry) => entry.id === nodeId)
    const focus: FocusView = {
      courseId: 'ml',
      nodeId,
      nodeTitle: target?.title ?? nodeId,
      startedAt: NOW,
      status: 'active',
    }
    activeFocus = focus
    return Promise.resolve({ ok: true, focus, prompted: true, handoff: null })
  },
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  asked.length = 0
  askedLesson.length = 0
  started.length = 0
  activeFocus = null
  tutorBlocks = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Mount the panel and let its effects settle. */
async function mount(): Promise<void> {
  await act(async () => {
    root.render(createElement(LearningPanel, { client: fixtureClient, initialOverview: overview }))
  })
}

/** Find a map row by its visible title. */
function nodeButton(title: string): HTMLButtonElement {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button.dt-node')]
  const found = buttons.find((button) => button.textContent?.includes(title))
  if (!found) throw new Error(`no map row for "${title}"`)
  return found
}

describe('the panel appears', () => {
  it('renders the map with every node', async () => {
    await mount()
    expect(container.querySelector('.dt-root')).not.toBeNull()
    for (const title of ['Machine Learning', 'Math Foundations', 'Linear Algebra', 'Python']) {
      expect(() => nodeButton(title)).not.toThrow()
    }
  })
})

describe('clicking a node switches the detail pane', () => {
  it('shows the selected node and asks the host exactly once for it', async () => {
    await mount()
    await act(async () => {
      nodeButton('Linear Algebra').click()
    })

    expect(asked).toEqual(['ml:math:la'])
    const detail = container.querySelector('.dt-detail')
    expect(detail?.textContent).toContain('Linear Algebra')
    // Its evidence and its parent context are both shown.
    expect(detail?.textContent).toContain('shaky maths')
    expect(detail?.textContent).toContain('parent: Math Foundations')
  })

  it('moves the selection rather than accumulating selections', async () => {
    await mount()
    await act(async () => {
      nodeButton('Math Foundations').click()
    })
    await act(async () => {
      nodeButton('Python').click()
    })

    expect(asked).toEqual(['ml:math', 'ml:python'])
    const current = [...container.querySelectorAll('button.dt-node[aria-current="true"]')]
    expect(current).toHaveLength(1)
    expect(current[0]?.textContent).toContain('Python')
  })

  it('shows the state as a word, never a number', async () => {
    await mount()
    await act(async () => {
      nodeButton('Math Foundations').click()
    })
    expect(container.textContent).toContain('blocked')
    expect(container.textContent).not.toMatch(/\d+\s*%/)
  })
})

describe('Start learning opens the learning surface', () => {
  it('renders the lesson blocks for the selected node', async () => {
    await mount()
    await act(async () => {
      nodeButton('Math Foundations').click()
    })

    const start = container.querySelector<HTMLButtonElement>('button.dt-primary')
    expect(start?.textContent).toContain('Start learning')

    await act(async () => {
      start?.click()
    })

    expect(started).toEqual(['ml:math@-'])
    expect(container.textContent).toContain('Why this node exists.')
    expect(container.textContent).toContain('What do you already know?')
    // The prototype is labelled as such, so it cannot be mistaken for teaching.
    expect(container.textContent).toContain('prototype')
  })

  it('picks up blocks the tutor writes afterwards, without user action', async () => {
    // The real loop: the tutor keeps teaching while the panel watches. This is
    // the polling path, and it is the difference between "a lesson page" and
    // "a surface the teaching appears in".
    vi.useFakeTimers()
    try {
      await mount()
      await act(async () => {
        nodeButton('Math Foundations').click()
      })
      await act(async () => {
        container.querySelector<HTMLButtonElement>('button.dt-primary')?.click()
      })
      expect(container.textContent).toContain('Why this node exists.')

      // The tutor records the learner's answer, then writes the next unit.
      tutorBlocks = [
        { id: 'next', type: 'text', content: { md: 'The next unit, written after your answer.' } },
      ]
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })

      expect(container.textContent).toContain('The next unit, written after your answer.')
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns to the node from the learning surface', async () => {
    await mount()
    await act(async () => {
      nodeButton('Python').click()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button.dt-primary')?.click()
    })
    expect(container.textContent).toContain('Why this node exists.')

    const back = [...container.querySelectorAll<HTMLButtonElement>('button.dt-secondary')].find(
      (button) => button.textContent?.includes('Back to the node'),
    )
    await act(async () => {
      back?.click()
    })
    expect(container.textContent).not.toContain('Why this node exists.')
    // With the focus still active, the surface goes back to waiting for the
    // tutor rather than inviting another start.
    expect(container.textContent).toContain('The tutor is preparing this node')
  })
})

describe('unmount leaves no DOM residue', () => {
  it('removes everything it rendered', async () => {
    await mount()
    expect(container.querySelector('.dt-root')).not.toBeNull()
    act(() => root.unmount())
    expect(container.querySelector('.dt-root')).toBeNull()
    expect(container.textContent).toBe('')
  })
})
