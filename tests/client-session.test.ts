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
