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
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import type {
  CourseView,
  LessonRecord,
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

/** The three calls the panel needs; injectable so preview and tests can fake them. */
export interface PanelClient {
  fetchOverview(): Promise<OverviewResponse>
  fetchNode(nodeId: string): Promise<NodeDetailResponse>
  startLesson(nodeId: string): Promise<{ lesson: LessonRecord; reused: boolean }>
}

const defaultClient: PanelClient = {
  fetchOverview: realApi.fetchOverview,
  fetchNode: realApi.fetchNode,
  startLesson: realApi.startLesson,
}

export interface LearningPanelProps {
  /** Defaults to the real HTTP client. */
  client?: PanelClient
  /** Pre-supplied overview, so the preview and tests skip the first fetch. */
  initialOverview?: OverviewResponse
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
  onSelect,
}: {
  course: CourseView | null
  nodes: NodeView[]
  selectedId: string | null
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
  onStart,
  starting,
  error,
}: {
  detail: NodeDetailResponse | null
  onStart: () => void
  starting: boolean
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

      {error !== null && <p className="dt-empty">{error}</p>}
      <button type="button" className="dt-primary" onClick={onStart} disabled={starting}>
        {starting ? 'Opening…' : detail.lessonExists ? 'Continue learning' : 'Start learning'}
      </button>
    </div>
  )
}

function LessonPane({
  lesson,
  onClose,
}: {
  lesson: LessonRecord | null
  onClose: () => void
}): ReactNode {
  if (lesson === null) {
    return (
      <div className="dt-pane">
        <p className="dt-empty">
          The learning surface opens here. Choose a node and press <b>Start learning</b>.
        </p>
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
      {lesson.origin === 'prototype' && (
        <p className="dt-caption">
          A prototype: assembled deterministically from what the runtime already recorded, not
          generated teaching content.
        </p>
      )}
      <div style={{ marginTop: 14 }}>
        <LessonBody blocks={lesson.blocks} />
      </div>
      <button type="button" className="dt-primary" onClick={onClose}>
        Back to the node
      </button>
    </div>
  )
}

/**
 * The panel.
 *
 * @param props - injectable client and optional pre-supplied overview.
 * @returns the three-pane learning surface.
 */
export function LearningPanel({ client = defaultClient, initialOverview }: LearningPanelProps): ReactNode {
  const [overview, setOverview] = useState<OverviewResponse | null>(initialOverview ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<NodeDetailResponse | null>(null)
  const [lesson, setLesson] = useState<LessonRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(initialOverview === undefined)

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
      setLesson(null)
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
    client
      .startLesson(selectedId)
      .then((result) => setLesson(result.lesson))
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setStarting(false))
  }, [client, selectedId])

  return (
    <div className="dt-root">
      <MapPane
        course={overview?.course ?? null}
        nodes={overview?.nodes ?? []}
        selectedId={selectedId}
        onSelect={select}
      />
      <DetailPane
        detail={detail}
        onStart={start}
        starting={starting}
        error={loading ? 'Loading…' : error}
      />
      <LessonPane lesson={lesson} onClose={() => setLesson(null)} />
    </div>
  )
}
