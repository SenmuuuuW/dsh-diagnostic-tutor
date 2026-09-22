/**
 * The learning panel.
 *
 * Three panes, left to right, that read as one sentence: **the course and its
 * diagnosis map → the node you picked → the learning surface for it.** The
 * layout is the product argument, so it is three columns rather than a
 * dashboard of cards.
 *
 * The panel takes its API as a prop. In DSH that is the real HTTP client; in
 * the standalone preview and in tests it is a fixture-backed object. That one
 * seam is what lets the UI be developed and tested without an agent running.
 *
 * ---------------------------------------------------------------------------
 * Who decides what
 * ---------------------------------------------------------------------------
 * The panel never writes teaching content and never decides what happens next.
 * Pressing **Start learning** records a focus and wakes the tutor; the blocks
 * that appear are whatever the tutor wrote through `udt_lesson_update`; the
 * evidence and state changes are whatever the tutor recorded through
 * `udt_map_update`. The panel's whole job is to show the current truth and to
 * keep showing it as it changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type {
  CourseView,
  FocusResponse,
  FocusView,
  LessonRecord,
  LessonResponse,
  NodeDetailResponse,
  NodeView,
  OverviewResponse,
} from '../contract.js'
import * as realApi from './api.js'
import { LessonBody } from './blocks.jsx'
import {
  buildMapTree,
  flattenTree,
  isFilledState,
  relationLabel,
  stateExplanation,
} from './model.js'

/** The calls the panel makes; injectable so preview and tests can fake them. */
export interface PanelClient {
  fetchOverview(): Promise<OverviewResponse>
  fetchNode(nodeId: string): Promise<NodeDetailResponse>
  fetchLesson(nodeId: string): Promise<LessonResponse>
  startFocus(nodeId: string, sessionId?: string): Promise<FocusResponse>
}

const defaultClient: PanelClient = {
  fetchOverview: realApi.fetchOverview,
  fetchNode: realApi.fetchNode,
  fetchLesson: realApi.fetchLesson,
  startFocus: realApi.startFocus,
}

/**
 * How often the panel re-reads state while a focus is active.
 *
 * Polling rather than a push channel: DSH exposes no generic host→client push
 * for third-party plugins, and the published UI plugins poll for the same
 * reason. The interval only runs while something is being learned, so an idle
 * panel makes no requests at all.
 */
const POLL_INTERVAL_MS = 2000

export interface LearningPanelProps {
  /** Defaults to the real HTTP client. */
  client?: PanelClient
  /** Pre-supplied overview, so the preview and tests skip the first fetch. */
  initialOverview?: OverviewResponse
  /** The session the tutor should be woken in, when the host half knows one. */
  sessionId?: string
  /**
   * Show the conversation again.
   *
   * The panel fills the main column, which is also where the chat lives, so
   * answering a check means leaving the surface. Supplied by the client plugin
   * through the layout service; absent in the preview and in tests.
   */
  onOpenChat?: () => void
}

/** The status pill plus its mark. Never a number. */
function StateMark({ state }: { state: string }): ReactNode {
  return (
    <>
      <span className={`dt-dot dt-state-${state}`} data-filled={isFilledState(state)} />
      <span className={`dt-state dt-state-${state}`}>{state}</span>
    </>
  )
}

function MapPane({
  course,
  nodes,
  selectedId,
  focus,
  onSelect,
}: {
  course: CourseView | null
  nodes: NodeView[]
  selectedId: string | null
  focus: FocusView | null
  onSelect: (id: string) => void
}): ReactNode {
  const rows = useMemo(() => flattenTree(buildMapTree(nodes)), [nodes])
  const confirmed = nodes.filter((node) => node.state === 'confirmed').length

  return (
    <div className="dt-pane">
      <p className="dt-eyebrow">Current course</p>
      <h1 className="dt-course-title">{course?.title ?? 'No goal yet'}</h1>
      {course !== null && (
        <p className="dt-goal">
          <b>Goal:</b> {course.goal}
        </p>
      )}

      <p className="dt-section-title">
        Diagnosis map <span>{nodes.length} nodes</span>
      </p>
      {rows.length === 0 && (
        <p className="dt-empty">
          Nothing on the map yet. State a goal in the chat and the runtime will record it.
        </p>
      )}
      {rows.map(({ node, depth }) => (
        <button
          key={node.id}
          type="button"
          className="dt-node"
          style={{ marginLeft: `${depth * 12}px` }}
          aria-current={node.id === selectedId}
          data-focused={node.id === focus?.nodeId}
          onClick={() => onSelect(node.id)}
        >
          {/* Mark, then title, then the state word: the pill sits in its own
              grid column so it never squeezes the title. */}
          <span className={`dt-dot dt-state-${node.state}`} data-filled={isFilledState(node.state)} />
          <span className="dt-node-title">
            {node.title}
            <span className="dt-node-rel">
              {relationLabel(node.relation)} · {node.evidenceCount} evidence
            </span>
          </span>
          <span className={`dt-state dt-state-${node.state}`}>{node.state}</span>
        </button>
      ))}

      <p className="dt-caption">
        {confirmed} of {nodes.length} confirmed by evidence.
      </p>
    </div>
  )
}

function DetailPane({
  detail,
  isFocused,
  onStart,
  starting,
  note,
  error,
}: {
  detail: NodeDetailResponse | null
  isFocused: boolean
  onStart: () => void
  starting: boolean
  note: string | null
  error: string | null
}): ReactNode {
  if (detail === null) {
    return (
      <div className="dt-pane">
        <p className="dt-empty">Pick a node on the map to see why it is there.</p>
      </div>
    )
  }
  const { node, parent, children } = detail

  return (
    <div className="dt-pane dt-detail">
      <p className="dt-eyebrow">Selected node</p>
      <h2>{node.title}</h2>
      <div className="dt-meta">
        <StateMark state={node.state} />
        <span className="dt-chip">{relationLabel(node.relation)}</span>
        {parent !== null && <span className="dt-chip">parent: {parent.title}</span>}
        {children.length > 0 && <span className="dt-chip">{children.length} children</span>}
      </div>

      <p className="dt-why">{stateExplanation(node.state)}</p>

      <p className="dt-section-title">
        Evidence <span>{node.evidence.length}</span>
      </p>
      {node.evidence.length === 0 ? (
        <p className="dt-empty">Nothing recorded yet.</p>
      ) : (
        <ul className="dt-evidence">
          {node.evidence.map((entry, index) => (
            <li key={index}>
              <div className="kind">
                {entry.kind}
                {entry.readiness !== undefined && ` · ${entry.readiness}`}
              </div>
              {entry.note !== undefined && <div>{entry.note}</div>}
              <div className="when">{entry.at}</div>
            </li>
          ))}
        </ul>
      )}

      {note !== null && <p className="dt-caption">{note}</p>}
      {error !== null && <p className="dt-empty">{error}</p>}
      <button type="button" className="dt-primary" onClick={onStart} disabled={starting}>
        {starting ? 'Starting…' : isFocused ? 'Learning in progress' : 'Start learning'}
      </button>
    </div>
  )
}

function LessonPane({
  lesson,
  awaitingTutor,
  onClose,
  onOpenChat,
}: {
  lesson: LessonRecord | null
  awaitingTutor: boolean
  onClose: () => void
  onOpenChat?: (() => void) | undefined
}): ReactNode {
  if (lesson === null) {
    return (
      <div className="dt-pane">
        <p className="dt-eyebrow">Learning surface</p>
        {awaitingTutor ? (
          <>
            <p className="dt-empty">The tutor is preparing this node…</p>
            <p className="dt-caption">
              The teaching appears here as it is written, while the conversation continues in the
              chat.
            </p>
          </>
        ) : (
          <p className="dt-empty">
            Choose a node and press <b>Start learning</b>. The teaching appears here, and the
            conversation stays in the chat.
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="dt-pane">
      <div className="dt-lesson-head">
        <p className="dt-eyebrow">Learning surface</p>
        <span className="dt-origin">{lesson.origin}</span>
      </div>
      <h2>{lesson.title}</h2>
      <div style={{ marginTop: 14 }}>
        <LessonBody blocks={lesson.blocks} />
      </div>
      {onOpenChat !== undefined && (
        <button type="button" className="dt-primary" onClick={onOpenChat}>
          Answer in the chat
        </button>
      )}
      <button type="button" className="dt-secondary" onClick={onClose}>
        Back to the node
      </button>
    </div>
  )
}

/**
 * The panel.
 *
 * @param props - injectable client, optional pre-supplied overview, session id.
 * @returns the three-pane learning surface.
 */
export function LearningPanel({
  client = defaultClient,
  initialOverview,
  sessionId,
  onOpenChat,
}: LearningPanelProps): ReactNode {
  const [overview, setOverview] = useState<OverviewResponse | null>(initialOverview ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<NodeDetailResponse | null>(null)
  const [lesson, setLesson] = useState<LessonRecord | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(initialOverview === undefined)

  const focus = overview?.focus ?? null
  // Which node the surface is showing. Kept apart from the map selection so
  // that browsing the map does not blank a lesson the tutor is still writing.
  const [surfaceNodeId, setSurfaceNodeId] = useState<string | null>(null)
  const surfaceRef = useRef<string | null>(null)
  surfaceRef.current = surfaceNodeId

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
        setSurfaceNodeId(result.focus.nodeId)
        setNote(
          result.prompted
            ? 'Started. The tutor is teaching this node in the chat — the surface updates as it writes.'
            : `Focus recorded, but the tutor was not woken (${result.promptReason ?? 'unknown reason'}). Say anything in the chat to continue.`,
        )
        // Re-read the overview rather than trusting the response: the focus
        // lives in stored state, and the panel follows stored state. Without
        // this the panel would never see its own focus, and the polling effect
        // below — which keys off it — would never start.
        const [nextOverview, nextLesson] = await Promise.all([
          client.fetchOverview(),
          client.fetchLesson(result.focus.nodeId),
        ])
        setOverview(nextOverview)
        setLesson(nextLesson.lesson)
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setStarting(false))
  }, [client, selectedId, sessionId])

  // Poll only while something is being learned. Three small local reads, and
  // nothing at all when idle.
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
        if (surfaceRef.current === nodeId || selectedId === nodeId) {
          setDetail(await client.fetchNode(nodeId))
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
  }, [client, focus, selectedId])

  return (
    <div className="dt-root">
      <MapPane
        course={overview?.course ?? null}
        nodes={overview?.nodes ?? []}
        selectedId={selectedId}
        focus={focus}
        onSelect={select}
      />
      <DetailPane
        detail={detail}
        isFocused={focus !== null && focus.nodeId === selectedId}
        onStart={start}
        starting={starting}
        note={note}
        error={loading ? 'Loading…' : error}
      />
      <LessonPane
        lesson={lesson}
        awaitingTutor={focus !== null}
        onOpenChat={onOpenChat}
        onClose={() => {
          setLesson(null)
          setSurfaceNodeId(null)
        }}
      />
    </div>
  )
}
