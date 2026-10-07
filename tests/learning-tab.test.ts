// @vitest-environment jsdom
/**
 * The docked Learning tab.
 *
 * This surface exists for one reason: the full panel takes the main column,
 * which is also where the conversation lives, so with only that panel the
 * learner has to leave the lesson to answer a check. The tab lives in the right
 * sidebar — a separate column — so chat and learning can be on screen at once.
 *
 * These tests pin the behaviour that makes that useful, and the structural
 * property that makes it possible: the tab registers into a session-scoped
 * seat of the right sidebar, never into `main`.
 */

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  FocusView,
  LessonRecord,
  NodeDetailResponse,
  NodeView,
  OverviewResponse,
} from '../src/contract.js'
import { NextStepCard } from '../src/client/blocks.jsx'
import { LearningTab, LearningTabTitle } from '../src/client/tab.jsx'
import type { PanelClient } from '../src/client/use-learning.js'

const NOW = '2026-01-01T00:00:00.000Z'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function node(id: string, title: string, relation: string, state: string, parentId: string | null): NodeView {
  return { id, title, relation, state, parentId, evidenceCount: 1, updatedAt: NOW }
}

const nodes = [
  node('ml:goal', 'Machine Learning', 'goal', 'unconfirmed', null),
  node('ml:math', 'Math Foundations', 'prerequisite', 'blocked', 'ml:goal'),
  node('ml:la', 'Linear Algebra', 'part-of', 'unconfirmed', 'ml:math'),
]

let activeFocus: FocusView | null = null
let tutorBlocks: { id: string; type: string; content: Record<string, unknown> }[] = []

const lesson: LessonRecord = {
  id: 'ml:math:lesson',
  courseId: 'ml',
  nodeId: 'ml:math',
  title: 'Math Foundations',
  origin: 'tutor',
  createdAt: NOW,
  updatedAt: NOW,
  blocks: [{ id: 'a', type: 'text', content: { md: 'Why this node exists.' } }],
}

const client: PanelClient = {
  fetchOverview: (): Promise<OverviewResponse> =>
    Promise.resolve({
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
      focus: activeFocus,
  nextStep: null,
  handoff: null,
      teachingBrain: true,
      lessonCount: 1,
  library: [],
    }),
  fetchNode: (nodeId): Promise<NodeDetailResponse> => {
    const target = nodes.find((entry) => entry.id === nodeId)
    if (!target) return Promise.reject(new Error('no such node'))
    return Promise.resolve({
      ok: true,
      node: { ...target, evidence: [{ kind: 'diagnosis', at: NOW, readiness: 'step-down' }] },
      parent: nodes.find((entry) => entry.id === target.parentId) ?? null,
      children: nodes.filter((entry) => entry.parentId === nodeId),
      lessonExists: true,
    })
  },
  fetchLesson: (nodeId) =>
    Promise.resolve({
      ok: true,
      lesson:
        nodeId === lesson.nodeId
          ? { ...lesson, blocks: [...lesson.blocks, ...tutorBlocks] as never }
          : null,
    }),
  startFocus: (nodeId) => {
    const target = nodes.find((entry) => entry.id === nodeId)
    activeFocus = {
      courseId: 'ml',
      nodeId,
      nodeTitle: target?.title ?? nodeId,
      startedAt: NOW,
      status: 'active',
    }
    return Promise.resolve({ ok: true, focus: activeFocus, prompted: true, handoff: null })
  },
}

/** The overview a static render needs, since effects do not run there. */
function staticOverview(): OverviewResponse {
  return {
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
    teachingBrain: true,
    lessonCount: 1,
  library: [],
  }
}

describe('the tab title', () => {
  it('names the surface', () => {
    expect(renderToStaticMarkup(createElement(LearningTabTitle))).toContain('Learning')
  })
})

describe('the tab shows the whole runtime in one column', () => {
  it('renders the node, the map and the learning surface together', () => {
    activeFocus = { courseId: 'ml', nodeId: 'ml:math', nodeTitle: 'Math Foundations', startedAt: NOW, status: 'active' }
    const html = renderToStaticMarkup(
      createElement(LearningTab, { client, initialOverview: staticOverview() }),
    )

    expect(html).toContain('Your learning')
    expect(html).toContain('Diagnosis map')
    expect(html).toContain('Learning surface')
    // Every node, including the ones the full panel would show in its own column.
    for (const title of ['Machine Learning', 'Math Foundations', 'Linear Algebra']) {
      expect(html).toContain(title)
    }
    activeFocus = null
  })

  it('says what to do before anything is focused', () => {
    const html = renderToStaticMarkup(
      createElement(LearningTab, { client, initialOverview: staticOverview() }),
    )
    expect(html).toContain('Start learning')
    expect(html).toContain('the chat stays open beside it')
  })

  it('lays out as a single column, so a narrow docked panel still reads', () => {
    // Graceful degradation is structural here: the tab never splits into
    // columns, so there is no width at which it becomes unreadable. The
    // stylesheet's one media query applies to the full panel only.
    const html = renderToStaticMarkup(
      createElement(LearningTab, { client, initialOverview: staticOverview() }),
    )
    expect(html).not.toContain('dt-root')
    expect(html).toContain('dt-tab')
    // No fixed pixel width is baked into the markup.
    expect(html).not.toMatch(/width:\s*\d+px/)
  })
})

describe('the next best step card', () => {
  const move = {
    fromNodeId: 'ml:math',
    fromNodeTitle: 'Math Foundations',
    targetNodeId: 'ml:la',
    targetNodeTitle: 'Linear Algebra',
    action: 'step-down',
    reason: 'Vectors and matrix shapes come before anything built on them.',
    createdAt: NOW,
  }

  it('names where it goes and why, and waits to be pressed', () => {
    const html = renderToStaticMarkup(createElement(NextStepCard, { nextStep: move, onContinue: () => {} }))
    expect(html).toContain('Next best step')
    expect(html).toContain('Math Foundations')
    expect(html).toContain('step down')
    expect(html).toContain('Linear Algebra')
    expect(html).toContain('Vectors and matrix shapes come before')
    expect(html).toContain('Continue learning')
  })

  it('says plainly when the answer is to stay', () => {
    const stay = { ...move, targetNodeId: null, targetNodeTitle: null, action: 'more-practice' }
    const html = renderToStaticMarkup(createElement(NextStepCard, { nextStep: stay, onContinue: () => {} }))
    expect(html).toContain('Stay on Math Foundations')
    expect(html).toContain('more practice')
    expect(html).not.toContain('Continue learning')
  })

  it('shows no percentage, score, XP or stars', () => {
    const html = renderToStaticMarkup(createElement(NextStepCard, { nextStep: move, onContinue: () => {} }))
    expect(html).not.toMatch(/\d+\s*%/)
    for (const banned of ['score', 'xp', 'star', 'points', 'progress']) {
      expect(html.toLowerCase()).not.toContain(`>${banned}`)
    }
  })
})

describe('the tab follows the runtime', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    activeFocus = null
    tutorBlocks = []
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  async function mount(): Promise<void> {
    await act(async () => {
      root.render(createElement(LearningTab, { client }))
    })
    // The tab selects something on arrival; let that settle.
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('picks a node on arrival rather than showing an empty panel', async () => {
    await mount()
    expect(container.querySelector('.dt-here')).not.toBeNull()
    expect(container.textContent).toContain('Machine Learning')
  })

  it('moves the selection when another node is clicked, without claiming a focus', async () => {
    // The header reports THIS CONVERSATION's focus, and nothing has started
    // one — so clicking around the map moves the selection and must not make
    // the header claim the conversation is now learning that node.
    await mount()
    const rows = [...container.querySelectorAll<HTMLButtonElement>('.dt-tab-node')]
    const linear = rows.find((row) => row.textContent?.includes('Linear Algebra'))
    await act(async () => {
      linear?.click()
    })

    expect(linear?.getAttribute('aria-current')).toBe('true')
    expect(container.textContent).toContain('No learning focus yet')
    expect(container.querySelector('.dt-here-focus')).toBeNull()
  })

  it('does not let a new conversation look like an old session', async () => {
    // The reported confusion: a brand-new chat opened Learn, saw the learner's
    // existing course under a heading reading "now learning", and looked as
    // though that chat had become the old machine-learning session.
    await mount()
    const text = container.textContent ?? ''
    expect(text).toContain('Your learning')
    expect(text).toContain('Shared across conversations')
    expect(text).toContain('This conversation')
    expect(text).toContain('No learning focus yet')
    // The map is still shared, and still shown.
    expect(container.querySelectorAll('.dt-tab-node').length).toBeGreaterThan(0)
  })

  it('starts learning and opens the tutor-written lesson', async () => {
    await mount()
    // Focus the node the lesson belongs to: the surface follows the focused
    // node, not whatever is being browsed.
    await act(async () => {
      ;[...container.querySelectorAll<HTMLButtonElement>('.dt-tab-node')]
        .find((row) => row.textContent?.includes('Math Foundations'))
        ?.click()
    })
    const start = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Start learning'),
    )
    await act(async () => {
      start?.click()
    })

    expect(activeFocus?.nodeId).toBe('ml:math')
    expect(container.querySelector('.dt-origin')?.textContent).toBe('tutor')
    expect(container.textContent).toContain('Why this node exists.')
  })

  it('picks up blocks the tutor writes afterwards, with the chat still open', async () => {
    vi.useFakeTimers()
    await mount()
    // Focus the node the lesson belongs to, then start.
    await act(async () => {
      ;[...container.querySelectorAll<HTMLButtonElement>('.dt-tab-node')]
        .find((row) => row.textContent?.includes('Math Foundations'))
        ?.click()
    })
    await act(async () => {
      ;[...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.includes('Start learning'))
        ?.click()
    })

    tutorBlocks = [{ id: 'next', type: 'text', content: { md: 'The next unit.' } }]
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    expect(container.textContent).toContain('The next unit.')
  })

  it('leaves no residue in the DOM when it unmounts', async () => {
    await mount()
    expect(container.querySelector('.dt-tab')).not.toBeNull()
    act(() => root.unmount())
    expect(container.textContent).toBe('')
  })
})

describe('the library is where a conversation starts', () => {
  it('cannot auto-open a project, and says what it is showing instead', async () => {
    // The reported confusion was a brand-new chat landing inside the learner's
    // old project. The library is what replaces that, so it has to be what
    // renders when the conversation has chosen nothing — and it must not fetch
    // its way into a course.
    const empty = {
      ok: true as const,
      course: null,
      nodes: [],
      focus: null,
      nextStep: null,
      handoff: null,
      teachingBrain: null,
      lessonCount: 4,
      library: [
        { id: 'ml', title: 'Machine Learning', goal: 'learn ml', confirmed: 1, total: 7, updatedAt: 'x' },
        { id: 'calc', title: 'Calculus', goal: 'brush up', confirmed: 4, total: 12, updatedAt: 'y' },
      ],
    }
    const stub = {
      fetchOverview: () => Promise.resolve(empty),
      fetchNode: () => Promise.resolve({ ok: true as const, node: null, parent: null, children: [], lessonExists: false }),
      fetchLesson: () => Promise.resolve({ ok: true as const, lesson: null }),
      startFocus: () => Promise.resolve({ ok: true as const, focus: null, prompted: true, handoff: null }),
    }

    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => {
      r.render(createElement(LearningTab, { client: stub as never, initialOverview: empty as never }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    const text = host.textContent ?? ''
    expect(text).toContain('Your learning')
    // Both projects are cards, and neither has been opened.
    expect(text).toContain('Machine Learning')
    expect(text).toContain('Calculus')
    expect(text).toContain('1 of 7 confirmed')
    expect(text).toContain('4 of 12 confirmed')
    expect(text).toContain('Continue')
    expect(text).toContain('Start something new')
    expect(text).toContain('Tell the tutor what you want to learn in Chat.')
    // No map: the map belongs to a project, and none is open.
    expect(host.querySelectorAll('.dt-tab-node').length).toBe(0)

    act(() => r.unmount())
    host.remove()
  })
})
