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
  LessonRecord,
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
}

type LessonResponse = Awaited<ReturnType<typeof realApi.fetchLesson>>
type FocusResponse = Awaited<ReturnType<typeof realApi.startFocus>>

export const defaultClient: PanelClient = {
  fetchOverview: realApi.fetchOverview,
  fetchNode: realApi.fetchNode,
  fetchLesson: realApi.fetchLesson,
  startFocus: realApi.startFocus,
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
  /** The node whose detail is shown; the focus when nothing is picked. */
  readonly selectedId: string | null
  readonly detail: NodeDetailResponse | null
  readonly lesson: LessonRecord | null
  readonly note: string | null
  readonly error: string | null
  readonly starting: boolean
  readonly loading: boolean
  select(nodeId: string): void
  start(): void
  dismissLesson(): void
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

  const start = useCallback(() => {
    if (selectedId === null) return
    setStarting(true)
    setError(null)
    setNote(null)
    client
      .startFocus(selectedId, sessionId)
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
  }, [client, selectedId, sessionId, onStarted])

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
    selectedId,
    detail,
    lesson,
    note,
    error,
    starting,
    loading,
    select,
    start,
    dismissLesson: useCallback(() => setLesson(null), []),
  }
}
