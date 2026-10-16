/**
 * Which conversation is the learner actually looking at.
 *
 * This is not a detail. The panel wakes an agent when the learner presses
 * *Start learning*, and waking the wrong conversation is worse than waking
 * none: the tutor answers somewhere the learner is not, and the panel looks
 * broken while a different chat quietly changes.
 *
 * The id is **not** available from the slot props: `main` and
 * `sidebar.panellist` are root-scoped, and only session-scoped seats receive
 * `sessionId`. The supported root-scope route is the session scope adapter,
 * whose `current` binding carries the scope identity as `key` — `undefined`
 * when nothing is selected. `ui-session` exposes exactly that as
 * `ctx.get('uiSession').adapter`.
 *
 * The earlier version of this file did not exist, and the panel used
 * `state.ids[0]` — the first row of the session list. That is a different
 * session as soon as anything newer exists, which is most of the time.
 */

import { useSyncExternalStore } from 'react'

/** The part of the session scope adapter this hook reads. */
interface ScopeAdapterLike {
  readonly current: {
    getSnapshot(): { readonly key?: string | undefined }
    subscribe(fn: () => void): () => void
  }
}

/**
 * The id of the conversation the learner has open.
 *
 * @param uiSession - `ctx.get('uiSession')`, when the profile mounts it.
 * @returns the session id, or `undefined` when no conversation is selected.
 */
export function useCurrentSessionId(uiSession: unknown): string | undefined {
  const adapter = (uiSession as { adapter?: ScopeAdapterLike } | undefined)?.adapter
  // Hooks cannot be called conditionally, so the subscription is always set up
  // and simply reports nothing when there is no adapter to read.
  const key = useSyncExternalStore(
    (onChange) => adapter?.current.subscribe(onChange) ?? (() => {}),
    () => adapter?.current.getSnapshot().key,
    () => undefined,
  )
  return typeof key === 'string' && key.length > 0 ? key : undefined
}
