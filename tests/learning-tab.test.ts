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
import { POLL_INTERVAL_MS, type PanelClient } from '../src/client/use-learning.js'

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
      selection: 'project',
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
    selection: 'project',
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
      selection: 'none',
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
    // The copy explaining what 'new' MEANS belongs to the state it leads to,
    // not to the library — showing it here made the two read alike.
    expect(text).not.toContain('Tell the tutor what you want to learn in Chat.')
    // No map: the map belongs to a project, and none is open.
    expect(host.querySelectorAll('.dt-tab-node').length).toBe(0)

    act(() => r.unmount())
    host.remove()
  })
})

describe('Start something new actually happens', () => {
  /** The tab, with a library and a recorder for what the press sends. */
  async function press(initialSelection: 'none' | 'new') {
    const calls: { sessionId: string; courseId?: string }[] = []
    const library = [
      { id: 'ml', title: 'Machine Learning', goal: 'learn ml', confirmed: 1, total: 7, updatedAt: 'x' },
    ]
    const view = (selection: 'none' | 'new'): Record<string, unknown> => ({
      ok: true,
      selection,
      course: null,
      nodes: [],
      focus: null,
      nextStep: null,
      handoff: null,
      teachingBrain: null,
      lessonCount: 1,
      library,
    })

    // What the server holds, which the re-read after the press reflects.
    let serverSelection: 'none' | 'new' = initialSelection
    const client = {
      fetchOverview: () => Promise.resolve(view(serverSelection)),
      fetchNode: () => Promise.resolve({ ok: true as const, node: null, parent: null, children: [], lessonExists: false }),
      fetchLesson: () => Promise.resolve({ ok: true as const, lesson: null }),
      startFocus: () => Promise.resolve({ ok: true as const, focus: null, prompted: true, handoff: null }),
      selectProject: (sessionId: string, courseId?: string) => {
        calls.push(courseId === undefined ? { sessionId } : { sessionId, courseId })
        serverSelection = courseId === undefined ? 'new' : 'none'
        return Promise.resolve({ ok: true })
      },
    }

    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => {
      r.render(
        createElement(LearningTab, {
          client: client as never,
          sessionId: 'session-under-test',
          initialOverview: view(initialSelection) as never,
        }),
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    return { calls, host, root: r, view }
  }

  it('sends exactly one request, naming this conversation, and leaves the library', async () => {
    const { calls, host, root } = await press('none')

    // The library is what is on screen first.
    expect(host.textContent).toContain('Your learning')
    expect(host.textContent).toContain('Machine Learning')

    const button = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Start something new'),
    )
    expect(button, 'the control is not on screen at all').toBeDefined()

    await act(async () => {
      button?.click()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(calls, 'the press sent nothing').toHaveLength(1)
    expect(calls[0]?.sessionId).toBe('session-under-test')
    // No course: the explicit "start something new" choice, not a guess.
    expect(calls[0]?.courseId).toBeUndefined()

    // And the surface actually changes — this is what "no reaction" was. The
    // library's own header is what must be gone; the browse list below stays,
    // because the learner may still change their mind.
    expect(host.textContent, 'still showing the library').not.toContain('Your learning')
    expect(host.textContent).toContain('Start something new')
    expect(host.textContent).toContain('Tell the tutor what you want to learn in Chat.')
    // The way back is still there.
    expect(host.textContent).toContain('All learning')

    act(() => root.unmount())
    host.remove()
  })

  it('shows the chosen state on arrival, without needing the press', async () => {
    // The state has to survive a reload, so it must render from the overview
    // alone — not only as the result of a click.
    const { host, root } = await press('new')
    expect(host.textContent).toContain('Tell the tutor what you want to learn in Chat.')
    expect(host.textContent).not.toContain('Your learning')
    act(() => root.unmount())
    host.remove()
  })

  it('stays in the library when nothing has been chosen', async () => {
    const { host, root } = await press('none')
    expect(host.textContent).toContain('Your learning')
    expect(host.textContent).toContain('1 of 7 confirmed')
    expect(host.textContent).not.toContain('Tell the tutor what you want to learn in Chat.')
    act(() => root.unmount())
    host.remove()
  })
})

/* -------------------------------------------------------------------------- */
/* The tab follows the visible chat, not the one it was opened in              */
/* -------------------------------------------------------------------------- */

describe('a session switch reaches an already-open tab', () => {
  /** A live session scope, settable the way the real adapter is. */
  function liveScope(initial: string | undefined) {
    let key = initial
    const listeners = new Set<() => void>()
    let snapshot: { key?: string | undefined } = key === undefined ? {} : { key }
    return {
      adapter: {
        current: {
          getSnapshot: () => snapshot,
          subscribe(fn: () => void) {
            listeners.add(fn)
            return () => listeners.delete(fn)
          },
        },
      },
      switchTo(next: string | undefined) {
        key = next
        snapshot = next === undefined ? {} : { key }
        for (const fn of listeners) fn()
      },
    }
  }

  it('sends the action to the session that is visible NOW, not the one it opened with', async () => {
    // The reported blocker: the tab was opened in session A, the learner
    // switched the chat to B, and "Start something new" was written to A —
    // because the tab was still holding the session it had been docked with.
    const calls: { sessionId: string; courseId?: string }[] = []
    const scope = liveScope('session-a')

    const view = (selection: 'none' | 'new'): Record<string, unknown> => ({
      ok: true,
      selection,
      course: null,
      nodes: [],
      focus: null,
      nextStep: null,
      handoff: null,
      teachingBrain: null,
      lessonCount: 0,
      library: [{ id: 'ml', title: 'Machine Learning', goal: 'g', confirmed: 1, total: 7, updatedAt: 'x' }],
    })
    const client = {
      fetchOverview: () => Promise.resolve(view('none')),
      fetchNode: () => Promise.resolve({ ok: true as const, node: null, parent: null, children: [], lessonExists: false }),
      fetchLesson: () => Promise.resolve({ ok: true as const, lesson: null }),
      startFocus: () => Promise.resolve({ ok: true as const, focus: null, prompted: true, handoff: null }),
      selectProject: (sessionId: string, courseId?: string) => {
        calls.push(courseId === undefined ? { sessionId } : { sessionId, courseId })
        return Promise.resolve({ ok: true })
      },
    }

    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => {
      r.render(
        createElement(LearningTab, {
          client: client as never,
          // What the slot said when the pane was docked…
          sessionId: 'session-a',
          // …and the live scope, which is what must win.
          uiSession: scope,
          initialOverview: view('none') as never,
        }),
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    // The learner switches the visible chat to B. The tab stays open.
    await act(async () => {
      scope.switchTo('session-b')
    })

    const button = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Start something new'),
    )
    expect(button, 'the control is missing').toBeDefined()
    await act(async () => {
      button?.click()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(calls, 'the press sent nothing').toHaveLength(1)
    expect(calls[0]?.sessionId, 'the action went to the previous conversation').toBe('session-b')

    act(() => r.unmount())
    host.remove()
  })

  it('keeps following after several switches, with no cached id', async () => {
    // After each switch, the action must name the session visible at that
    // moment, regardless of an in-flight overview refresh.
    const calls: string[] = []
    const scope = liveScope('session-a')
    const empty = {
      ok: true as const,
      selection: 'none' as const,
      course: null,
      nodes: [],
      focus: null,
      nextStep: null,
      handoff: null,
      teachingBrain: null,
      lessonCount: 0,
      library: [{ id: 'ml', title: 'ML', goal: 'g', confirmed: 0, total: 1, updatedAt: 'x' }],
    }
    const client = {
      fetchOverview: () => Promise.resolve(empty),
      fetchNode: () => Promise.resolve({ ok: true as const, node: null, parent: null, children: [], lessonExists: false }),
      fetchLesson: () => Promise.resolve({ ok: true as const, lesson: null }),
      startFocus: () => Promise.resolve({ ok: true as const, focus: null, prompted: true, handoff: null }),
      selectProject: (sessionId: string) => {
        calls.push(sessionId)
        return Promise.resolve({ ok: true })
      },
    }

    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = createRoot(host)
    await act(async () => {
      r.render(
        createElement(LearningTab, {
          client: client as never,
          sessionId: 'session-a',
          uiSession: scope,
          initialOverview: empty as never,
        }),
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    for (const next of ['session-b', 'session-a', 'session-c'] as const) {
      await act(async () => {
        scope.switchTo(next)
      })
      const button = [...host.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes('Start something new'),
      )
      await act(async () => {
        button?.click()
        await Promise.resolve()
      })
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(calls.at(-1), `after switching to ${next}`).toBe(next)
    }
    expect(calls).toEqual(['session-b', 'session-a', 'session-c'])

    act(() => r.unmount())
    host.remove()
  })
})

describe('the open tab discovers its conversation\'s project', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
  })

  function empty(selection: 'none' | 'new' = 'none'): OverviewResponse {
    return {
      ...staticOverview(),
      selection,
      course: null,
      nodes: [],
      focus: null,
      nextStep: null,
      handoff: null,
    }
  }

  function project(id: string, title: string, focused = false): OverviewResponse {
    return {
      ...staticOverview(),
      course: { id, title, goal: title, status: 'active', createdAt: NOW, updatedAt: NOW },
      nodes: [node(`${id}:goal`, `${title} goal`, 'goal', 'unconfirmed', null)],
      focus: focused ? {
        courseId: id,
        nodeId: `${id}:goal`,
        nodeTitle: `${title} goal`,
        startedAt: NOW,
        status: 'active',
      } : null,
      nextStep: null,
      handoff: null,
    }
  }

  function stub(fetchOverview: PanelClient['fetchOverview']): PanelClient {
    return {
      fetchOverview,
      fetchNode: (nodeId) => Promise.resolve({
        ok: true,
        node: { ...node(nodeId, nodeId, 'goal', 'unconfirmed', null), evidence: [] },
        parent: null,
        children: [],
        lessonExists: false,
      }),
      fetchLesson: () => Promise.resolve({ ok: true, lesson: null }),
      startFocus: () => Promise.reject(new Error('not used')),
    }
  }

  function deferred<T>() {
    let resolve: (value: T) => void = () => {}
    const promise = new Promise<T>((done) => { resolve = done })
    return { promise, resolve }
  }

  async function render(
    client: PanelClient,
    sessionId?: string,
    initialOverview?: OverviewResponse,
  ) {
    await act(async () => {
      root.render(createElement(LearningTab, { client, sessionId, initialOverview }))
    })
  }

  it.each(['none', 'new'] as const)('picks up a later binding from %s without a focus or another click', async (selection) => {
    let server = empty(selection)
    const read = vi.fn((sessionId?: string) => {
      expect(sessionId).toBe('session-korean')
      return Promise.resolve(server)
    })
    const client = stub(read)
    await render(client, 'session-korean', server)
    expect(host.querySelector('.dt-here-course')).toBeNull()

    // The tutor writes the goal and session binding independently of this tab.
    // No focus is invented just to make the UI's polling loop run.
    server = project('korean', '韩语')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    })

    expect(read).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')
    expect(host.textContent).toContain('No learning focus yet')
    expect(host.querySelectorAll('.dt-tab-node')).toHaveLength(1)
  })

  it('reads a fresh session immediately and clears the previous project and lesson', async () => {
    const ml = project('ml', '机器学习', true)
    const read = vi.fn((sessionId?: string) => Promise.resolve(sessionId === 'session-a' ? ml : empty()))
    const client = stub(read)
    client.fetchLesson = () => Promise.resolve({
      ok: true,
      lesson: { ...lesson, nodeId: 'ml:goal', title: 'A lesson only', blocks: [] },
    })
    await render(client, 'session-a')
    expect(host.querySelector('.dt-here-course')?.textContent).toBe('机器学习')
    expect(host.textContent).toContain('A lesson only')

    await render(client, 'session-b')

    expect(read).toHaveBeenLastCalledWith('session-b')
    expect(host.querySelector('.dt-here-course')).toBeNull()
    expect(host.querySelectorAll('.dt-tab-node')).toHaveLength(0)
    expect(host.textContent).not.toContain('A lesson only')
    expect(host.textContent).not.toContain('This conversation')
    expect(host.textContent).toContain('Your learning')
  })

  it('rejects a delayed overview after switching A to B and back to A', async () => {
    let finishOldA: (view: OverviewResponse) => void = () => {}
    let readsOfA = 0
    const read = vi.fn((sessionId?: string) => {
      if (sessionId === 'session-a' && readsOfA++ === 0) {
        return new Promise<OverviewResponse>((resolve) => { finishOldA = resolve })
      }
      return Promise.resolve(sessionId === 'session-a' ? project('korean', '韩语') : empty())
    })
    const client = stub(read)
    await render(client, 'session-a')
    await render(client, 'session-b')
    await render(client, 'session-a')
    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')

    await act(async () => {
      finishOldA(project('ml', '过期机器学习'))
    })

    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')
    expect(host.textContent).not.toContain('过期机器学习')
  })

  it.each(['none', 'new', 'project'] as const)('a delayed %s poll cannot undo a newer project choice in the same session', async (selection) => {
    const library = [
      { id: 'ml', title: '机器学习', goal: '机器学习', confirmed: 0, total: 1, updatedAt: NOW },
      { id: 'korean', title: '韩语', goal: '韩语', confirmed: 0, total: 1, updatedAt: NOW },
    ]
    const before = { ...(selection === 'project' ? project('ml', '机器学习') : empty(selection)), library }
    const after = { ...(selection === 'new' ? project('korean', '韩语') : empty('new')), library }
    const oldPoll = deferred<OverviewResponse>()
    const read = vi.fn()
      .mockImplementationOnce(() => oldPoll.promise)
      .mockResolvedValue(after)
    const client = stub(read)
    client.selectProject = vi.fn().mockResolvedValue({ ok: true })
    await render(client, 'session-korean', before)
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })

    await act(async () => {
      const label = selection === 'new' ? '韩语' : selection === 'project' ? 'All learning' : 'Start something new'
      ;[...host.querySelectorAll('button')].find((button) => button.textContent?.includes(label))?.click()
    })
    expect(selection === 'new' ? host.querySelector('.dt-here-course')?.textContent : host.querySelector('.dt-eyebrow')?.textContent)
      .toBe(selection === 'new' ? '韩语' : 'Start something new')

    await act(async () => { oldPoll.resolve(before) })

    expect(selection === 'new' ? host.querySelector('.dt-here-course')?.textContent : host.querySelector('.dt-eyebrow')?.textContent)
      .toBe(selection === 'new' ? '韩语' : 'Start something new')
  })

  it('does not let a delayed initial read undo a binding already discovered by polling', async () => {
    const initial = deferred<OverviewResponse>()
    const read = vi.fn().mockImplementationOnce(() => initial.promise).mockResolvedValue(project('korean', '韩语'))
    await render(stub(read), 'session-korean')
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })
    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')

    await act(async () => { initial.resolve(empty()) })

    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')
    expect(host.querySelectorAll('.dt-tab-node')).toHaveLength(1)
  })

  it('keeps a newer binding when overlapping idle polls finish in reverse order', async () => {
    const oldPoll = deferred<OverviewResponse>()
    const newPoll = deferred<OverviewResponse>()
    const read = vi.fn().mockImplementationOnce(() => oldPoll.promise).mockImplementationOnce(() => newPoll.promise)
    await render(stub(read), 'session-korean', empty())
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2) })
    expect(read).toHaveBeenCalledTimes(2)
    await act(async () => { newPoll.resolve(project('korean', '韩语')) })
    await act(async () => { oldPoll.resolve(empty()) })

    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')
  })

  it('still accepts a slow poll while a newer read is pending', async () => {
    const first = deferred<OverviewResponse>()
    const second = deferred<OverviewResponse>()
    const read = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    await render(stub(read), 'session-korean', empty())
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2) })
    await act(async () => { first.resolve(project('korean', '韩语')) })

    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')
    await act(async () => { second.resolve(project('korean', '韩语')) })
  })

  it('sends two quick project choices in order even if the first write is slow', async () => {
    const library = [
      { id: 'ml', title: '机器学习', goal: '机器学习', confirmed: 0, total: 1, updatedAt: NOW },
      { id: 'korean', title: '韩语', goal: '韩语', confirmed: 0, total: 1, updatedAt: NOW },
    ]
    const firstWrite = deferred<void>()
    let server = { ...empty(), library }
    const read = vi.fn(() => Promise.resolve(server))
    const client = stub(read)
    const writes: string[] = []
    client.selectProject = (_sessionId, courseId) => {
      writes.push(courseId ?? 'new')
      if (courseId === 'ml') {
        return firstWrite.promise.then(() => { server = { ...project('ml', '机器学习'), library } })
      }
      server = { ...project('korean', '韩语'), library }
      return Promise.resolve()
    }
    await render(client, 'session-korean', server)
    await act(async () => {
      ;[...host.querySelectorAll<HTMLButtonElement>('.dt-project')].find((button) => button.textContent?.includes('机器学习'))?.click()
    })
    await act(async () => {
      ;[...host.querySelectorAll<HTMLButtonElement>('.dt-project')].find((button) => button.textContent?.includes('韩语'))?.click()
    })
    expect(writes).toEqual(['ml'])
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })
    expect(read).not.toHaveBeenCalled()

    await act(async () => { firstWrite.resolve() })

    expect(writes).toEqual(['ml', 'korean'])
    expect(server.course?.id).toBe('korean')
    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')
  })

  it('lets a second project choice proceed while the first follow-up read is delayed', async () => {
    const library = [
      { id: 'ml', title: '机器学习', goal: '机器学习', confirmed: 0, total: 1, updatedAt: NOW },
      { id: 'korean', title: '韩语', goal: '韩语', confirmed: 0, total: 1, updatedAt: NOW },
    ]
    const oldRead = deferred<OverviewResponse>()
    const read = vi.fn().mockImplementationOnce(() => oldRead.promise).mockResolvedValue({ ...project('korean', '韩语'), library })
    const client = stub(read)
    client.selectProject = vi.fn().mockResolvedValue({ ok: true })
    await render(client, 'session-korean', { ...empty(), library })
    await act(async () => {
      ;[...host.querySelectorAll<HTMLButtonElement>('.dt-project')].find((button) => button.textContent?.includes('机器学习'))?.click()
    })
    await act(async () => {
      ;[...host.querySelectorAll<HTMLButtonElement>('.dt-project')].find((button) => button.textContent?.includes('韩语'))?.click()
    })
    expect(client.selectProject).toHaveBeenNthCalledWith(2, 'session-korean', 'korean')
    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')

    await act(async () => { oldRead.resolve({ ...project('ml', '机器学习'), library }) })

    expect(host.querySelector('.dt-here-course')?.textContent).toBe('韩语')
  })

  it('keeps session writes in order across an A to B to A journey', async () => {
    const library = ['old-first', 'old-queued', 'latest'].map((id) => ({
      id, title: id, goal: id, confirmed: 0, total: 1, updatedAt: NOW,
    }))
    const firstWrite = deferred<void>()
    const server = new Map<string, OverviewResponse>([
      ['session-a', { ...empty(), library }],
      ['session-b', { ...empty(), library }],
    ])
    const writes: string[] = []
    const client = stub((sessionId) => Promise.resolve(server.get(sessionId ?? '') ?? empty()))
    client.selectProject = (sessionId, courseId) => {
      writes.push(`${sessionId}/${courseId}`)
      const save = () => {
        server.set(sessionId, { ...project(courseId ?? 'new', courseId ?? 'new'), library })
      }
      if (courseId === 'old-first') return firstWrite.promise.then(save)
      save()
      return Promise.resolve()
    }
    const choose = async (title: string) => act(async () => {
      ;[...host.querySelectorAll<HTMLButtonElement>('.dt-project')]
        .find((button) => button.textContent?.includes(title))?.click()
    })

    await render(client, 'session-a', server.get('session-a'))
    await choose('old-first')
    await choose('old-queued')
    await render(client, 'session-b')
    await render(client, 'session-a')
    await choose('latest')

    expect(writes).toEqual(['session-a/old-first'])
    await act(async () => { firstWrite.resolve() })

    expect(writes).toEqual(['session-a/old-first', 'session-a/old-queued', 'session-a/latest'])
    expect(server.get('session-a')?.course?.id).toBe('latest')
    expect(host.querySelector('.dt-here-course')?.textContent).toBe('latest')
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })
    expect(host.querySelector('.dt-here-course')?.textContent).toBe('latest')
    expect(server.get('session-b')?.course).toBeNull()
  })

  it('keeps the selected node evidence when an older node detail arrives late', async () => {
    const nodeA = node('korean:a', '韩语 A', 'goal', 'unconfirmed', null)
    const nodeB = node('korean:b', '韩语 B', 'part-of', 'unconfirmed', nodeA.id)
    const view = { ...project('korean', '韩语'), nodes: [nodeA, nodeB] }
    const oldDetail = deferred<NodeDetailResponse>()
    const detail = (target: NodeView): NodeDetailResponse => ({
      ok: true,
      node: { ...target, evidence: [{ kind: 'diagnosis', at: NOW, note: `${target.title} evidence` }] },
      parent: null,
      children: [],
      lessonExists: false,
    })
    const client = stub(() => Promise.resolve(view))
    client.fetchNode = (nodeId) => nodeId === nodeA.id ? oldDetail.promise : Promise.resolve(detail(nodeB))
    await render(client, 'session-korean', view)
    await act(async () => {
      ;[...host.querySelectorAll<HTMLButtonElement>('.dt-tab-node')].find((button) => button.textContent?.includes('韩语 B'))?.click()
    })
    expect(host.querySelector('.dt-ev-note')?.textContent).toBe('韩语 B evidence')

    await act(async () => { oldDetail.resolve(detail(nodeA)) })

    expect(host.querySelector('.dt-tab-node[aria-current="true"] .dt-tab-node-title')?.textContent).toBe('韩语 B')
    expect(host.querySelector('.dt-ev-note')?.textContent).toBe('韩语 B evidence')
    expect(host.textContent).not.toContain('韩语 A evidence')
  })

  it('keeps newer lesson content when overlapping focus polls finish in reverse order', async () => {
    const view = project('korean', '韩语', true)
    const oldLesson = deferred<Awaited<ReturnType<PanelClient['fetchLesson']>>>()
    const savedLesson: LessonRecord = { ...lesson, id: 'korean:goal:lesson', courseId: 'korean', nodeId: 'korean:goal', blocks: [] }
    const client = stub(() => Promise.resolve(view))
    client.fetchLesson = vi.fn()
      .mockImplementationOnce(() => oldLesson.promise)
      .mockResolvedValue({ ok: true, lesson: { ...savedLesson, title: '最新韩语 lesson' } })
    await render(client, 'session-korean', view)
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })
    expect(host.querySelector('.dt-lesson-title')?.textContent).toBe('最新韩语 lesson')

    await act(async () => { oldLesson.resolve({ ok: true, lesson: { ...savedLesson, title: '过期韩语 lesson' } }) })

    expect(host.querySelector('.dt-lesson-title')?.textContent).toBe('最新韩语 lesson')
    expect(host.textContent).not.toContain('过期韩语 lesson')
  })

  it('keeps refreshing evidence even when its reads are slower than the overview polls', async () => {
    const view = project('korean', '韩语', true)
    const firstDetail = deferred<NodeDetailResponse>()
    const secondDetail = deferred<NodeDetailResponse>()
    const client = stub(() => Promise.resolve(view))
    const initialDetail = await client.fetchNode('korean:goal')
    client.fetchNode = vi.fn()
      .mockResolvedValueOnce(initialDetail)
      .mockImplementationOnce(() => firstDetail.promise)
      .mockImplementationOnce(() => secondDetail.promise)
    await render(client, 'session-korean', view)
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) })
    expect(client.fetchNode).toHaveBeenCalledTimes(3)

    const evidence = (note: string): NodeDetailResponse => ({
      ...initialDetail,
      node: { ...initialDetail.node, evidence: [{ kind: 'diagnosis', at: NOW, note }] },
    })
    await act(async () => { firstDetail.resolve(evidence('首次韩语 evidence')) })
    expect(host.querySelector('.dt-ev-note')?.textContent).toBe('首次韩语 evidence')

    await act(async () => { secondDetail.resolve(evidence('最新韩语 evidence')) })
    expect(host.querySelector('.dt-ev-note')?.textContent).toBe('最新韩语 evidence')
  })

  it('rejects a delayed project selection response after the visible session changes', async () => {
    let finishSelection: () => void = () => {}
    const read = vi.fn((sessionId?: string) => Promise.resolve(sessionId === 'session-a' ? project('ml', '机器学习') : empty()))
    const client = stub(read)
    client.selectProject = () => new Promise<void>((resolve) => { finishSelection = resolve })
    await render(client, 'session-a', empty())
    await act(async () => {
      ;[...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Start something new'))?.click()
    })
    await render(client, 'session-b')
    await act(async () => { finishSelection() })

    expect(host.querySelector('.dt-here-course')).toBeNull()
    expect(host.querySelectorAll('.dt-tab-node')).toHaveLength(0)
    expect(host.textContent).not.toContain('机器学习')
  })

  it('rejects a delayed focus lesson after the visible session changes', async () => {
    let finishLesson: (result: Awaited<ReturnType<PanelClient['fetchLesson']>>) => void = () => {}
    const read = vi.fn((sessionId?: string) => Promise.resolve(sessionId === 'session-a' ? project('ml', '机器学习', true) : empty()))
    const client = stub(read)
    client.fetchLesson = () => new Promise((resolve) => { finishLesson = resolve })
    await render(client, 'session-a')
    await render(client, 'session-b')
    await act(async () => {
      finishLesson({ ok: true, lesson: { ...lesson, nodeId: 'ml:goal', title: 'Delayed A lesson', blocks: [] } })
    })

    expect(host.querySelector('.dt-here-course')).toBeNull()
    expect(host.textContent).not.toContain('Delayed A lesson')
    expect(host.textContent).not.toContain('机器学习')
  })

  it('rejects a delayed lesson when the same conversation moves from A to B', async () => {
    const nodeA = node('korean:a', '韩语 A', 'goal', 'unconfirmed', null)
    const nodeB = node('korean:b', '韩语 B', 'part-of', 'unconfirmed', 'korean:a')
    const focusA: FocusView = {
      courseId: 'korean', nodeId: nodeA.id, nodeTitle: nodeA.title, startedAt: NOW, status: 'active',
    }
    const focusB: FocusView = {
      courseId: 'korean', nodeId: nodeB.id, nodeTitle: nodeB.title, startedAt: NOW, status: 'active',
    }
    const view = (focus: FocusView | null): OverviewResponse => ({
      ...staticOverview(),
      course: { id: 'korean', title: '韩语', goal: '韩语', status: 'active', createdAt: NOW, updatedAt: NOW },
      nodes: [nodeA, nodeB],
      focus,
      nextStep: null,
      handoff: null,
    })

    let releaseOverview: (result: OverviewResponse) => void = () => {}
    let releaseLesson: (result: Awaited<ReturnType<PanelClient['fetchLesson']>>) => void = () => {}
    const read = vi.fn(() => new Promise<OverviewResponse>((resolve) => { releaseOverview = resolve }))
    const client: PanelClient = {
      fetchOverview: read,
      fetchNode: (nodeId) => Promise.resolve({
        ok: true,
        node: { ...(nodeId === nodeA.id ? nodeA : nodeB), evidence: [] },
        parent: null,
        children: [],
        lessonExists: false,
      }),
      fetchLesson: (nodeId) => nodeId === nodeA.id
        ? new Promise((resolve) => { releaseLesson = resolve })
        : Promise.resolve({ ok: true, lesson: null }),
      startFocus: () => Promise.resolve({ ok: true, focus: focusA, prompted: true, handoff: null }),
    }

    await render(client, 'session-korean', view(null))
    await act(async () => {
      ;[...host.querySelectorAll<HTMLButtonElement>('.dt-tab-node')]
        .find((button) => button.textContent?.includes('韩语 A'))
        ?.click()
    })
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.includes('Start learning'))
        ?.click()
      await Promise.resolve()
    })

    // The request started for A, but the stored focus has moved to B before
    // either response arrives. The A lesson must be discarded.
    await act(async () => {
      releaseOverview(view(focusB))
      releaseLesson({ ok: true, lesson: { ...lesson, id: 'korean:a:lesson', courseId: 'korean', nodeId: nodeA.id, title: '迟到的 A lesson', blocks: [] } })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(host.textContent).not.toContain('迟到的 A lesson')
    expect(host.textContent).toContain('韩语 B')
  })

  it('does not poll an invented session when no reliable session is available', async () => {
    const read = vi.fn(() => Promise.resolve(empty()))
    await render(stub(read), undefined, empty())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    })
    expect(read).not.toHaveBeenCalled()
    expect(host.querySelector('.dt-here-course')).toBeNull()
  })
})
