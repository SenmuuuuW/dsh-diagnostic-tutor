import type { PathClient } from './path-client.js'
import { defaultPathClient } from './path-client.js'
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
  ProjectCardView,
} from '../contract.js'
import * as realApi from './api.js'
import { getLang } from './i18n.js'
import { runtimeCopy } from './learning-text.js'

/** The calls the surfaces make; injectable so preview and tests can fake them. */
export interface PanelClient {
  /** Optional planning capability; legacy clients remain node-only. */
  pathClient?: PathClient

  fetchOverview(sessionId?: string): Promise<OverviewResponse>
  fetchNode(nodeId: string): Promise<NodeDetailResponse>
  fetchLesson(nodeId: string): Promise<LessonResponse>
  startFocus(nodeId: string, sessionId?: string): Promise<FocusResponse>
  /** Optional: only the real client can change which project is open. */
  selectProject?(sessionId: string, courseId?: string): Promise<unknown>
  /**
   * Optional: resolve the conversation that should resume a project.
   *
   * Without it (preview, unit tests) "enter learning" falls back to opening the
   * project in this conversation.
   */
  resolveProjectSession?(courseId: string, sessionId?: string): Promise<{ sessionId: string | null }>
  /** Optional: only the real client can report it. */
  reportObserved?(nodeId: string, sessionId: string): Promise<unknown>
  /** Optional: only the real client can save a file. */
  downloadExport?(): Promise<string>
  /** Optional: only the real client can delete state. */
  resetState?(): Promise<unknown>
}

type LessonResponse = Awaited<ReturnType<typeof realApi.fetchLesson>>
type FocusResponse = Awaited<ReturnType<typeof realApi.startFocus>>

function requestScope(sessionId: string | undefined) {
  return {
    sessionId,
    revision: 0,
    overviewIssued: 0,
    overviewApplied: 0,
    detailRevision: 0,
    detailIssued: 0,
    detailApplied: 0,
    pendingAction: false,
  }
}

type RequestScope = ReturnType<typeof requestScope>

function overviewRequest(scope: RequestScope) {
  return { scope, revision: scope.revision, sequence: ++scope.overviewIssued }
}

type OverviewRequest = ReturnType<typeof overviewRequest>

function orderedWrite<T>(
  queues: Map<string | undefined, Promise<void>>,
  scope: RequestScope,
  write: () => Promise<T>,
): Promise<T> {
  const result = (queues.get(scope.sessionId) ?? Promise.resolve()).then(write)
  // Only the writes are ordered; a slow follow-up read must not hold the next
  // choice up, and a failed write must not prevent the next choice being sent.
  queues.set(scope.sessionId, result.then(() => {}, () => {}))
  return result
}

export const defaultClient: PanelClient = {
  pathClient: defaultPathClient,
  fetchOverview: realApi.fetchOverview,
  fetchNode: realApi.fetchNode,
  fetchLesson: realApi.fetchLesson,
  startFocus: realApi.startFocus,
  selectProject: realApi.selectProject,
  resolveProjectSession: realApi.resolveProjectSession,
  reportObserved: realApi.reportObserved,
  downloadExport: realApi.downloadExport,
  resetState: realApi.resetState,
}

/**
 * How often a surface re-reads its conversation's state.
 *
 * Polling rather than a push channel: DSH exposes no generic host→client push
 * for third-party plugins, and the published UI plugins poll for the same
 * reason. An open conversation must also refresh before it has a focus: the
 * tutor can create or adopt its project while the surface shows the library.
 */
export const POLL_INTERVAL_MS = 2000

export interface LearningState {
  /** Every Learning Project the learner has, for the library. */
  library: ProjectCardView[]
  /** Opens one in this conversation, or the blank slate when given none. */
  openProject: (courseId?: string) => void
  /**
   * Enters a project for learning: resumes the conversation that was last
   * studying it when there is one, instead of rebinding it to this one.
   */
  enterProject: (courseId: string) => void
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
  /** Called when "enter learning" resolves to a different conversation. */
  onOpenSession?: ((sessionId: string) => void) | undefined
}): LearningState {
  const { client, sessionId, initialOverview, onStarted, onOpenSession } = options

  // A request belongs to the scope that started it. Replacing this token on
  // every switch also rejects an old A response after an A → B → A journey.
  const scopeRef = useRef(requestScope(sessionId))
  if (scopeRef.current.sessionId !== sessionId) scopeRef.current = requestScope(sessionId)
  // Writes keep their order for the lifetime of the surface, even when the
  // learner leaves a session and returns while its earlier writes are pending.
  const writeQueuesRef = useRef(new Map<string | undefined, Promise<void>>())

  const [snapshot, setSnapshot] = useState({
    scope: scopeRef.current,
    data: initialOverview ?? null,
  })
  // Hide the previous conversation's data on the switch render, before the
  // effect clears the local detail and the new overview has arrived.
  const currentScope = snapshot.scope === scopeRef.current
  const overview = currentScope ? snapshot.data : null
  const overviewRef = useRef(overview)
  overviewRef.current = overview
  const currentRequest = useCallback((request: OverviewRequest) => (
    scopeRef.current === request.scope &&
    request.scope.revision === request.revision &&
    request.sequence >= request.scope.overviewApplied
  ), [])
  const setOverview = useCallback((request: OverviewRequest, data: OverviewResponse): boolean => {
    if (!currentRequest(request)) return false
    request.scope.overviewApplied = request.sequence
    const previous = overviewRef.current
    const projectChanged = previous?.course?.id !== data.course?.id
    if (projectChanged) {
      setSelectedId(null)
    }
    if (projectChanged || previous?.focus?.nodeId !== data.focus?.nodeId) {
      ++request.scope.detailRevision
      setDetail(null)
      setLesson(null)
      setNote(null)
    }
    overviewRef.current = data
    setSnapshot({ scope: request.scope, data })
    setLoading(false)
    return true
  }, [currentRequest])
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
  const firstLoadRef = useRef(true)

  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false
      if (initialOverview !== undefined) return
    }
    const scope = scopeRef.current
    ++scope.revision
    ++scope.detailRevision
    scope.pendingAction = false
    const request = overviewRequest(scope)
    let live = true
    setSnapshot({ scope, data: null })
    setSelectedId(null)
    setDetail(null)
    setLesson(null)
    setNote(null)
    setError(null)
    setStarting(false)
    setLoading(true)
    observedRef.current = null
    client
      .fetchOverview(sessionId)
      .then((data) => {
        if (live) setOverview(request, data)
      })
      .catch((cause: Error) => {
        if (live && currentRequest(request)) setError(cause.message)
      })
      .finally(() => {
        if (live && currentRequest(request)) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [client, initialOverview, sessionId, setOverview, currentRequest])

  const select = useCallback(
    (nodeId: string) => {
      const scope = scopeRef.current
      const revision = ++scope.detailRevision
      const sequence = ++scope.detailIssued
      setSelectedId(nodeId)
      setDetail(null)
      setError(null)
      client
        .fetchNode(nodeId)
        .then((data) => {
          if (
            scopeRef.current === scope && scope.detailRevision === revision &&
            sequence >= scope.detailApplied &&
            overviewRef.current?.nodes.some((node) => node.id === nodeId)
          ) {
            scope.detailApplied = sequence
            setDetail(data)
          }
        })
        .catch((cause: Error) => {
          if (scopeRef.current === scope && scope.detailRevision === revision) setError(cause.message)
        })
    },
    [client],
  )

  const beginFocus = useCallback(
    (nodeId: string) => {
      const scope = scopeRef.current
      // A user action invalidates reads made before it. Queue the writes too:
      // two quick choices must reach the runtime in the learner's order.
      const revision = ++scope.revision
      ++scope.detailRevision
      scope.pendingAction = true
      setStarting(true)
      setError(null)
      setNote(null)
      void (async () => {
        try {
          const result = await orderedWrite(writeQueuesRef.current, scope, () => client.startFocus(nodeId, scope.sessionId))
          if (scopeRef.current !== scope || scope.revision !== revision) return
          // Re-read stored focus instead of treating a write response as the
          // current state: the tutor may already have moved to another node.
          const request = overviewRequest(scope)
          const [nextOverview, nextLesson] = await Promise.all([
            client.fetchOverview(scope.sessionId),
            client.fetchLesson(result.focus.nodeId),
          ])
          if (!setOverview(request, nextOverview)) return
          if (nextOverview.focus?.nodeId !== result.focus.nodeId) {
            setLesson(null)
            setNote(null)
            return
          }
          const copy = runtimeCopy(getLang())
          setNote(
            result.prompted
              ? copy.started
              : copy.focusRecorded(result.promptReason ?? copy.unknownReason),
          )
          setLesson(nextLesson.lesson)
          onStarted?.()
        } catch (cause) {
          if (scopeRef.current === scope && scope.revision === revision) setError((cause as Error).message)
        } finally {
          if (scope.revision === revision) scope.pendingAction = false
          if (scopeRef.current === scope && scope.revision === revision) setStarting(false)
        }
      })()
    },
    [client, onStarted, setOverview],
  )

  const start = useCallback(() => {
    if (selectedId === null) return
    beginFocus(selectedId)
  }, [beginFocus, selectedId])

  const [dataNote, setDataNote] = useState<string | null>(null)

  /** Re-read everything, the same way the initial load does. */
  const refresh = useCallback(
    () => {
      const scope = scopeRef.current
      const request = overviewRequest(scope)
      return client
        .fetchOverview(scope.sessionId)
        .then((data) => {
          if (!setOverview(request, data)) return null
          setError(null)
          return data
        })
        .catch((cause: Error) => {
          if (currentRequest(request)) setError(cause.message)
          return null
        })
    },
    [client, setOverview, currentRequest],
  )

  const exportData = useCallback(() => {
    setDataNote(null)
    const copy = runtimeCopy(getLang())
    void client
      .downloadExport?.()
      .then((name) => setDataNote(copy.saved(name)))
      .catch((cause: Error) => setDataNote(copy.exportFailed(cause.message)))
  }, [client])

  const resetAll = useCallback(() => {
    setDataNote(null)
    setDetail(null)
    setLesson(null)
    const copy = runtimeCopy(getLang())
    void client
      .resetState?.()
      .then(refresh)
      .then(() => setDataNote(copy.everythingDeleted))
      .catch((cause: Error) => setDataNote(copy.deleteFailed(cause.message)))
  }, [client, refresh])

  useEffect(() => {
    if (focusNodeId === null) return
    const scope = scopeRef.current
    const nodeId = focusNodeId
    let live = true

    const tick = async (): Promise<void> => {
      if (scope.pendingAction) return
      const request = overviewRequest(scope)
      try {
        const [nextOverview, nextLesson] = await Promise.all([
          client.fetchOverview(sessionId),
          client.fetchLesson(nodeId),
        ])
        if (!live || !setOverview(request, nextOverview)) return
        if (nextOverview.focus?.nodeId !== nodeId) {
          setLesson(null)
          return
        }
        setLesson(nextLesson.lesson)
        // The evidence trail and the node's state are what a check changes.
        const watched = liveRef.current
        if (watched !== null) {
          const revision = scope.detailRevision
          const sequence = ++scope.detailIssued
          const nextDetail = await client.fetchNode(watched)
          if (
            !live || scopeRef.current !== scope || scope.revision !== request.revision ||
            scope.detailRevision !== revision ||
            liveRef.current !== watched || sequence < scope.detailApplied
          ) return
          scope.detailApplied = sequence
          setDetail(nextDetail)
        }

        // Tell the host the lesson reached a screen. Reported once per node, so
        // the timing chain records the first sighting rather than every poll.
        //
        // Only when a conversation is open: the report is about that
        // conversation's wait, and without one there is nothing to report —
        // sending it anyway would be a request that can only be refused.
        const observedIn = sessionId
        if (nextLesson.lesson !== null && observedIn !== undefined && observedRef.current !== nodeId) {
          observedRef.current = nodeId
          void client.reportObserved?.(nodeId, observedIn)?.catch(() => {})
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
  }, [client, focusNodeId, sessionId, setOverview])

  // The tutor writes a goal independently of this UI. Without this read, a
  // library or "start something new" tab never sees the resulting binding.
  useEffect(() => {
    if (sessionId === undefined || focusNodeId !== null) return
    const scope = scopeRef.current
    let live = true
    const timer = setInterval(() => {
      if (scope.pendingAction) return
      const request = overviewRequest(scope)
      void client.fetchOverview(sessionId).then((data) => {
        if (live) setOverview(request, data)
      }).catch(() => {})
    }, POLL_INTERVAL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [client, focusNodeId, sessionId, setOverview])

  /**
   * Open a Learning Project in this conversation.
   *
   * Nothing is fabricated: the server records the choice and the panel re-reads,
   * so a project with no focus here still reads "no learning focus yet". The
   * re-read is immediate rather than waiting for the poll, because the learner
   * just pressed something and a two-second silence reads as a dead button.
   */
  const openProject = useCallback(
    (courseId?: string) => {
      const scope = scopeRef.current
      const { sessionId } = scope
      const choose = client.selectProject
      if (sessionId === undefined || choose === undefined) return
      const revision = ++scope.revision
      ++scope.detailRevision
      scope.pendingAction = true
      setStarting(false)
      setNote(null)
      void (async () => {
        try {
          await orderedWrite(writeQueuesRef.current, scope, () => choose(sessionId, courseId))
          if (scopeRef.current !== scope || scope.revision !== revision) return
          const request = overviewRequest(scope)
          const next = await client.fetchOverview(sessionId)
          if (!setOverview(request, next)) return
          setLesson(null)
          setDetail(null)
          setSelectedId(null)
        } catch {
          // The next poll will show whatever the server actually holds.
        } finally {
          if (scope.revision === revision) scope.pendingAction = false
        }
      })()
    },
    [client, setOverview],
  )

  /**
   * Enter a project for learning.
   *
   * A project is shared, but its focus and runs belong to a conversation. If a
   * stored conversation was last learning it, opening the project here would
   * start a second, empty attempt; so this asks the host which conversation
   * that is and, when it differs, hands navigation to the surface. Otherwise it
   * falls back to the ordinary "open here" write.
   */
  const enterProject = useCallback(
    (courseId: string) => {
      const scope = scopeRef.current
      const current = scope.sessionId
      const resolve = client.resolveProjectSession
      if (current === undefined || resolve === undefined || onOpenSession === undefined) {
        openProject(courseId)
        return
      }
      void (async () => {
        try {
          const resolved = await resolve(courseId, current)
          if (resolved.sessionId !== null && resolved.sessionId !== current && onOpenSession(resolved.sessionId)) return
        } catch {
          // A project that cannot be resolved is still openable here.
        }
        openProject(courseId)
      })()
    },
    [client, onOpenSession, openProject],
  )

  return {
    overview,
    /** The learner's projects, shared like the maps themselves. */
    library: overview?.library ?? [],
    openProject,
    enterProject,
    focus,
    nextStep: overview?.nextStep ?? null,
    handoff: overview?.handoff ?? null,
    teachingBrain: overview?.teachingBrain ?? null,
    selectedId: currentScope ? selectedId : null,
    detail: currentScope ? detail : null,
    lesson: currentScope ? lesson : null,
    note: currentScope ? note : null,
    error: currentScope ? error : null,
    starting: currentScope && starting,
    loading: !currentScope || loading,
    select,
    start,
    continueTo: beginFocus,
    exportData,
    resetAll,
    dataNote,
    dismissLesson: useCallback(() => setLesson(null), []),
  }
}
