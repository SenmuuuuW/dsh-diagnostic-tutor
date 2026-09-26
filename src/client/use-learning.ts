/**
 * Shared learning state for both surfaces.
 *
 * The plugin renders the same runtime in two places — the full-page panel and
 * the docked right-sidebar tab — and both need identical behaviour: select a
 * node, start learning, follow the tutor. Duplicating that would mean two
 * implementations of the focus hand-off and two copies of the polling loop,
 * which is exactly how two surfaces drift apart.
 *
 * So the behaviour lives here once, and the components are presentation.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  FocusView,
  HandoffView,
  LessonRecord,
  NextStepView,
  NodeDetailResponse,
  OverviewResponse,
} from '../contract.js'
import * as realApi from './api.js'

/** The calls the surfaces make; injectable so preview and tests can fake them. */
export interface PanelClient {
  fetchOverview(): Promise<OverviewResponse>
  fetchNode(nodeId: string): Promise<NodeDetailResponse>
  fetchLesson(nodeId: string): Promise<LessonResponse>
  startFocus(nodeId: string, sessionId?: string): Promise<FocusResponse>
  /** Optional: only the real client can report it. */
  reportObserved?(nodeId: string): Promise<unknown>
  /** Optional: only the real client can save a file. */
  downloadExport?(): Promise<string>
  /** Optional: only the real client can delete state. */
  resetState?(): Promise<unknown>
}

type LessonResponse = Awaited<ReturnType<typeof realApi.fetchLesson>>
type FocusResponse = Awaited<ReturnType<typeof realApi.startFocus>>

export const defaultClient: PanelClient = {
  fetchOverview: realApi.fetchOverview,
  fetchNode: realApi.fetchNode,
  fetchLesson: realApi.fetchLesson,
  startFocus: realApi.startFocus,
  reportObserved: realApi.reportObserved,
  downloadExport: realApi.downloadExport,
  resetState: realApi.resetState,
}

/**
 * How often the surfaces re-read state while a focus is active.
 *
 * Polling rather than a push channel: DSH exposes no generic host→client push
 * for third-party plugins, and the published UI plugins poll for the same
 * reason. The interval only runs while something is being learned, so an idle
 * surface makes no requests at all.
 */
export const POLL_INTERVAL_MS = 2000

export interface LearningState {
  readonly overview: OverviewResponse | null
  readonly focus: FocusView | null
  /** The tutor's recommendation, when the learner has not acted on it yet. */
  readonly nextStep: NextStepView | null
  /** How the current handoff is going, for the progress line. */
  readonly handoff: HandoffView | null
  /**
   * Whether a teaching brain is installed: `true`, confidently `false`, or
   * `null` when this scope cannot see the catalog. Only `false` may warn.
   */
  readonly teachingBrain: boolean | null
  /** The node whose detail is shown; the focus when nothing is picked. */
  readonly selectedId: string | null
  readonly detail: NodeDetailResponse | null
  readonly lesson: LessonRecord | null
  readonly note: string | null
  readonly error: string | null
  readonly starting: boolean
  readonly loading: boolean
  select(nodeId: string): void
  /** Start learning on the selected node. */
  start(): void
  /** Start learning on a named node — how a recommendation is acted on. */
  continueTo(nodeId: string): void
  dismissLesson(): void
  /** Save everything to a file. */
  exportData(): void
  /** Delete everything and re-read from empty. */
  resetAll(): void
  /** A one-line account of the last data action, for the surface to show. */
  readonly dataNote: string | null
}

/**
 * Read and follow the learning runtime.
 *
 * @param options.client - the API to talk to.
 * @param options.sessionId - the session the tutor should be woken in.
 * @param options.initialOverview - pre-supplied state, so the preview and tests
 *   skip the first fetch.
 * @returns the state and the two actions the surfaces offer.
 */
export function useLearning(options: {
  client: PanelClient
  sessionId?: string | undefined
  initialOverview?: OverviewResponse | undefined
  /** Called once a focus has been recorded, so a surface can react to it. */
  onStarted?: (() => void) | undefined
}): LearningState {
  const { client, sessionId, initialOverview, onStarted } = options

  const [overview, setOverview] = useState<OverviewResponse | null>(initialOverview ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<NodeDetailResponse | null>(null)
  const [lesson, setLesson] = useState<LessonRecord | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(initialOverview === undefined)

  const focus = overview?.focus ?? null
  const focusNodeId = focus?.nodeId ?? null

  // Which node's detail is worth keeping fresh. The focus wins, so the panel
  // follows the tutor's node even when the learner is browsing elsewhere.
  const liveNodeId = focusNodeId ?? selectedId
  const liveRef = useRef<string | null>(liveNodeId)
  liveRef.current = liveNodeId
  /** The node whose lesson has already been reported as seen. */
  const observedRef = useRef<string | null>(null)

  useEffect(() => {
    if (initialOverview !== undefined) return
    let live = true
    client
      .fetchOverview()
      .then((data) => {
        if (live) setOverview(data)
      })
      .catch((cause: Error) => {
        if (live) setError(cause.message)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [client, initialOverview])

  const select = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId)
      setError(null)
      client
        .fetchNode(nodeId)
        .then(setDetail)
        .catch((cause: Error) => setError(cause.message))
    },
    [client],
  )

  const beginFocus = useCallback(
    (nodeId: string) => {
    setStarting(true)
    setError(null)
    setNote(null)
    client
      .startFocus(nodeId, sessionId)
      .then(async (result) => {
        setNote(
          result.prompted
            ? 'Started. The tutor is teaching this node in the chat — the surface updates as it writes.'
            : `Focus recorded, but the tutor was not woken (${result.promptReason ?? 'unknown reason'}). Say anything in the chat to continue.`,
        )
        // Re-read the overview rather than trusting the response: the focus
        // lives in stored state, and the surfaces follow stored state. Without
        // this the panel would never see its own focus, and the polling effect
        // below — which keys off it — would never start.
        const [nextOverview, nextLesson] = await Promise.all([
          client.fetchOverview(),
          client.fetchLesson(result.focus.nodeId),
        ])
        setOverview(nextOverview)
        setLesson(nextLesson.lesson)
        onStarted?.()
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setStarting(false))
    },
    [client, sessionId, onStarted],
  )

  const start = useCallback(() => {
    if (selectedId === null) return
    beginFocus(selectedId)
  }, [beginFocus, selectedId])

  const [dataNote, setDataNote] = useState<string | null>(null)

  /** Re-read everything, the same way the initial load does. */
  const refresh = useCallback(
    () =>
      client
        .fetchOverview()
        .then((data) => {
          setOverview(data)
          setError(null)
          return data
        })
        .catch((cause: Error) => {
          setError(cause.message)
          return null
        }),
    [client],
  )

  const exportData = useCallback(() => {
    setDataNote(null)
    void client
      .downloadExport?.()
      .then((name) => setDataNote(`Saved ${name}.`))
      .catch((cause: Error) => setDataNote(`Could not export: ${cause.message}`))
  }, [client])

  const resetAll = useCallback(() => {
    setDataNote(null)
    setDetail(null)
    setLesson(null)
    void client
      .resetState?.()
      .then(refresh)
      .then(() => setDataNote('Everything was deleted.'))
      .catch((cause: Error) => setDataNote(`Could not delete: ${cause.message}`))
  }, [client, refresh])

  useEffect(() => {
    if (focus === null) return
    const nodeId = focus.nodeId
    let live = true

    const tick = async (): Promise<void> => {
      try {
        const [nextOverview, nextLesson] = await Promise.all([
          client.fetchOverview(),
          client.fetchLesson(nodeId),
        ])
        if (!live) return
        setOverview(nextOverview)
        setLesson(nextLesson.lesson)
        // The evidence trail and the node's state are what a check changes.
        const watched = liveRef.current
        if (watched !== null) setDetail(await client.fetchNode(watched))

        // Tell the host the lesson reached a screen. Reported once per node, so
        // the timing chain records the first sighting rather than every poll.
        if (nextLesson.lesson !== null && observedRef.current !== nodeId) {
          observedRef.current = nodeId
          void client.reportObserved?.(nodeId)?.catch(() => {})
        }
      } catch {
        // A failed poll is not worth surfacing; the next one may succeed.
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [client, focus])

  return {
    overview,
    focus,
    nextStep: overview?.nextStep ?? null,
    handoff: overview?.handoff ?? null,
    teachingBrain: overview?.teachingBrain ?? null,
    selectedId,
    detail,
    lesson,
    note,
    error,
    starting,
    loading,
    select,
    start,
    continueTo: beginFocus,
    exportData,
    resetAll,
    dataNote,
    dismissLesson: useCallback(() => setLesson(null), []),
  }
}
