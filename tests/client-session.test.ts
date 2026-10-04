// @vitest-environment jsdom
/**
 * Which conversation the panel thinks it is looking at.
 *
 * This was wrong in v0.1.0. The panel read `state.ids[0]` — the first row of the
 * session list — and used it as "the conversation the learner has open". Those
 * are the same thing only when nothing newer exists, which is rare: press *New
 * Session*, open an older chat, or leave a session running anywhere, and the
 * panel starts waking an agent the learner is not looking at.
 *
 * The id now comes from the session scope adapter, whose `current` binding
 * carries the scope key. These tests pin the two properties that matter: it
 * follows the adapter, and it never invents an id when there is no session.
 */

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LearningPanel } from '../src/client/app.js'
import { useCurrentSessionId } from '../src/client/use-session.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A stand-in for the session scope adapter, with a selectable current scope. */
function adapter(initial: string | undefined) {
  let key = initial
  const listeners = new Set<() => void>()
  let snapshot: { key?: string | undefined } = initial === undefined ? {} : { key }
  return {
    current: {
      getSnapshot: () => snapshot,
      subscribe(fn: () => void) {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
    },
    /** Move the selection the way the real adapter does: new snapshot, notify. */
    select(next: string | undefined) {
      key = next
      snapshot = next === undefined ? {} : { key }
      for (const fn of listeners) fn()
    },
    get subscriberCount() {
      return listeners.size
    },
    get currentKey() {
      return key
    },
  }
}

/** Render the hook and expose what it returned. */
function mount(uiSession: unknown): { root: Root; container: HTMLDivElement; seen: (string | undefined)[] } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const seen: (string | undefined)[] = []
  const root = createRoot(container)

  function Probe(): null {
    seen.push(useCurrentSessionId(uiSession))
    return null
  }

  act(() => root.render(createElement(Probe)))
  return { root, container, seen }
}

describe('the current session id', () => {
  let mounted: ReturnType<typeof mount> | null = null

  afterEach(() => {
    if (mounted) act(() => mounted?.root.unmount())
    mounted?.container.remove()
    mounted = null
  })

  it('reads the scope the adapter reports', () => {
    const scope = adapter('session-abc')
    mounted = mount({ adapter: scope })
    expect(mounted.seen.at(-1)).toBe('session-abc')
  })

  it('is undefined when no conversation is selected', () => {
    mounted = mount({ adapter: adapter(undefined) })
    // The hook must not invent one. `undefined` is what disables the actions
    // that need a conversation, instead of waking some other chat.
    expect(mounted.seen.at(-1)).toBeUndefined()
  })

  it('treats an empty key as no session', () => {
    mounted = mount({ adapter: adapter('') })
    expect(mounted.seen.at(-1)).toBeUndefined()
  })

  it('follows a selection change', () => {
    const scope = adapter('session-one')
    mounted = mount({ adapter: scope })
    expect(mounted.seen.at(-1)).toBe('session-one')

    act(() => scope.select('session-two'))
    expect(mounted.seen.at(-1)).toBe('session-two')

    act(() => scope.select(undefined))
    expect(mounted.seen.at(-1)).toBeUndefined()
  })

  it('does not fall back to a list when the profile mounts no adapter', () => {
    mounted = mount(undefined)
    expect(mounted.seen.at(-1)).toBeUndefined()
  })

  it('survives an object that is not an adapter', () => {
    mounted = mount({ somethingElse: true })
    expect(mounted.seen.at(-1)).toBeUndefined()
  })

  it('unsubscribes when it unmounts', () => {
    const scope = adapter('session-abc')
    mounted = mount({ adapter: scope })
    expect(scope.subscriberCount).toBe(1)
    act(() => mounted?.root.unmount())
    expect(scope.subscriberCount).toBe(0)
    mounted.container.remove()
    mounted = null
  })
})

describe('nothing here scans a session list', () => {
  beforeEach(() => {
    // Guard against a regression that reintroduces `ids[0]` behind a different
    // name: the hook's only input is the scope adapter.
    expect(useCurrentSessionId.length).toBe(1)
  })

  it('is the sole source of session identity in the client', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/client/index.tsx', 'utf8'),
    )
    expect(source).not.toMatch(/ids\[0\]/)
    expect(source).not.toMatch(/ids\.at\(0\)/)
    expect(source).toContain('useCurrentSessionId')
  })
})

/* -------------------------------------------------------------------------- */
/* Switching conversations                                                    */
/* -------------------------------------------------------------------------- */

describe('a session switch retargets the next action', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('sends each Start learning to the session on screen at the time', async () => {
    // The failure this guards: a panel that captured a session once, or read a
    // list, and keeps waking that one after the learner switches.
    const started: string[] = []
    const client = {
      fetchOverview: () =>
        Promise.resolve({
          ok: true as const,
          course: {
            id: 'ml',
            title: 'Machine Learning',
            goal: 'learn',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          nodes: [
            {
              id: 'ml:a',
              title: 'Node A',
              relation: 'part-of',
              state: 'blocked',
              parentId: null,
              evidenceCount: 1,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          focus: null,
          nextStep: null,
          handoff: null,
          teachingBrain: null,
          lessonCount: 1,
        }),
      fetchNode: () =>
        Promise.resolve({
          ok: true as const,
          node: {
            id: 'ml:a',
            title: 'Node A',
            relation: 'part-of',
            state: 'blocked',
            parentId: null,
            evidenceCount: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
            evidence: [],
          },
          parent: null,
          children: [],
          lessonExists: false,
        }),
      fetchLesson: () => Promise.resolve({ ok: true as const, lesson: null }),
      startFocus: (nodeId: string, sessionId?: string) => {
        started.push(`${nodeId}@${sessionId ?? '-'}`)
        return Promise.resolve({ ok: true as const, focus: null, prompted: true, handoff: null })
      },
    }

    const overview = await client.fetchOverview()
    const render = (sessionId: string) =>
      act(() =>
        root.render(
          createElement(LearningPanel, {
            client: client as never,
            initialOverview: overview as never,
            sessionId,
          }),
        ),
      )

    /** The button only exists once the selected node's detail has loaded. */
    const clickStart = async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const button = [...container.querySelectorAll('button')].find((el) =>
          (el.textContent ?? '').includes('Start learning'),
        )
        if (button) {
          await act(async () => {
            button.click()
            await Promise.resolve()
          })
          return
        }
        await act(async () => {
          await Promise.resolve()
        })
      }
      throw new Error('Start learning never appeared')
    }

    // Conversation A.
    render('session-a')
    await act(async () => {
      await Promise.resolve()
    })
    await clickStart()

    // Learner switches to B; the same button must now target B.
    render('session-b')
    await clickStart()

    // And back to A.
    render('session-a')
    await clickStart()

    expect(started).toEqual(['ml:a@session-a', 'ml:a@session-b', 'ml:a@session-a'])
    // A stale id must never appear: every call names the session that was on
    // screen when it was made.
    expect(started.every((call) => call.endsWith('@session-a') || call.endsWith('@session-b'))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* Requests that must name the conversation                                   */
/* -------------------------------------------------------------------------- */

describe('the observed report carries the conversation', () => {
  const realFetch = globalThis.fetch
  let calls: { url: string; body: unknown }[]

  beforeEach(() => {
    calls = []
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      calls.push({ url: String(url), body: init?.body === undefined ? undefined : JSON.parse(init.body) })
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true, handoff: null }),
        text: async () => '{"ok":true,"handoff":null}',
      }
    }) as never
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('includes sessionId in the body', async () => {
    // The bug this exists for: the host made sessionId required and the client
    // kept sending only the node, so every lesson's first render collected a
    // 400 and the handoff never recorded being seen. The host tests pin the
    // contract; this pins the client actually meeting it.
    const { reportObserved } = await import('../src/client/api.js')
    await reportObserved('ml:a', 'session-abc')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toContain('/handoff/observed')
    expect(calls[0]?.body).toEqual({ nodeId: 'ml:a', sessionId: 'session-abc' })
  })

  it('is not sent at all when no conversation is open', async () => {
    // Nothing to report: the handoff belongs to a conversation.
    const { LearningPanel } = await import('../src/client/app.js')
    const client = {
      fetchOverview: () => Promise.resolve(REPORT_OVERVIEW),
      fetchNode: () =>
        Promise.resolve({
          ok: true as const,
          node: {
            id: 'ml:a',
            title: 'Node A',
            relation: 'part-of',
            state: 'unconfirmed',
            parentId: null,
            evidenceCount: 0,
            updatedAt: '2026-01-01T00:00:00.000Z',
            evidence: [],
          },
          parent: null,
          children: [],
          lessonExists: true,
        }),
      fetchLesson: () =>
        Promise.resolve({
          ok: true as const,
          lesson: { id: 'l', nodeId: 'ml:a', courseId: 'ml', title: 'T', blocks: [], createdAt: 'x', updatedAt: 'x' },
        }),
      startFocus: () => Promise.resolve({ ok: true as const, focus: null, prompted: true, handoff: null }),
      reportObserved: (...args: unknown[]) => {
        observed.push(args)
        return Promise.resolve({})
      },
    }
    const observed: unknown[][] = []
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    // No sessionId: the panel has no conversation to report about.
    await act(async () => {
      root.render(createElement(LearningPanel, { client: client as never, initialOverview: REPORT_OVERVIEW as never }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(observed).toEqual([])
    act(() => root.unmount())
    container.remove()
  })
})

/** The minimum overview the panel needs to reach its lesson path. */
const REPORT_OVERVIEW = {
  ok: true as const,
  course: {
    id: 'ml',
    title: 'Machine Learning',
    goal: 'learn',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  nodes: [
    {
      id: 'ml:a',
      title: 'Node A',
      relation: 'part-of',
      state: 'unconfirmed',
      parentId: null,
      evidenceCount: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  focus: { courseId: 'ml', nodeId: 'ml:a', nodeTitle: 'Node A', startedAt: 'x', status: 'active' },
  nextStep: null,
  handoff: null,
  teachingBrain: null,
  lessonCount: 1,
}
