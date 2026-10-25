/**
 * Live turn state for the conversation the map page is showing.
 *
 * The diagnosis flow wakes the tutor from the map page, but the model turn runs
 * in the chat. Without this, the page can only say "go answer the questions" —
 * even while the tutor is still thinking, and even after the turn failed (for
 * example a provider balance error). Reading the Session Controller's snapshot
 * gives the page the two facts it needs: `running` and `lastAgentError`.
 *
 * Read through the bare service name with a structural type, and only when the
 * host provides it: the preview and unit tests have no Session Controller, and
 * they must keep today's behaviour.
 */

import { useEffect, useState } from 'react'

/** The slice of a session snapshot this plugin needs. */
export interface SessionActivity {
  readonly running: boolean
  readonly lastAgentError: string | null
}

/** The slice of the Session Controller service this plugin needs. */
export interface SessionActivitySource {
  binding(sessionId: string): {
    readonly session: {
      getSnapshot(): SessionActivity
    }
  } | undefined
}

/**
 * Follow the current conversation's turn state.
 *
 * Polls instead of subscribing: the snapshot object is cheap to read, the
 * surface already polls its own path state, and this keeps the structural type
 * to two fields instead of the whole observable contract.
 *
 * @param source - the Session Controller, when the host exposes it.
 * @param sessionId - the conversation the map page is showing.
 * @returns the latest turn state, or `undefined` when it cannot be observed.
 */
export function useSessionActivity(
  source: SessionActivitySource | undefined,
  sessionId: string | undefined,
): SessionActivity | undefined {
  const [activity, setActivity] = useState<SessionActivity | undefined>(undefined)

  useEffect(() => {
    if (source === undefined || sessionId === undefined || sessionId.length === 0) {
      setActivity(undefined)
      return
    }
    let live = true
    const read = (): void => {
      try {
        const snapshot = source.binding(sessionId)?.session.getSnapshot()
        if (!live) return
        setActivity((previous) => {
          const next = snapshot === undefined ? undefined : { running: snapshot.running, lastAgentError: snapshot.lastAgentError }
          return previous?.running === next?.running && previous?.lastAgentError === next?.lastAgentError ? previous : next
        })
      } catch {
        // A binding that is not ready yet leaves the last observation in place.
      }
    }
    read()
    const timer = setInterval(read, 1000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [source, sessionId])

  return activity
}
