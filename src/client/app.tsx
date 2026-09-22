/**
 * The full-page learning panel.
 *
 * Three columns, left to right, that read as one sentence: **the course and its
 * diagnosis map → the node you picked → the learning surface for it.** This is
 * the "focus mode" view — the whole runtime at once.
 *
 * The docked tab (`tab.tsx`) renders the same state in the right sidebar so the
 * learner can keep the chat open while working. Both run on `useLearning`, so
 * they cannot disagree about what is focused or what the tutor wrote.
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

import type { ReactNode } from 'react'

import { LessonBody, NextStepCard } from './blocks.jsx'
import { buildMapTree, flattenTree, isFilledState, relationLabel, stateExplanation } from './model.js'
import type { PanelClient } from './use-learning.js'
import { defaultClient, useLearning } from './use-learning.js'

export type { PanelClient } from './use-learning.js'

export interface LearningPanelProps {
  /** Defaults to the real HTTP client. */
  client?: PanelClient
  /** Pre-supplied overview, so the preview and tests skip the first fetch. */
  initialOverview?: Parameters<typeof useLearning>[0]['initialOverview']
  /** The session the tutor should be woken in, when the host half knows one. */
  sessionId?: string | undefined
  /**
   * Show the conversation again.
   *
   * This panel fills the main column, which is also where the chat lives, so
   * answering a check means leaving it. Supplied by the client plugin through
   * the layout service; absent in the preview and in tests.
   */
  onOpenChat?: (() => void) | undefined
  /** Called once a focus is recorded — used to dock the side tab. */
  onFocusStarted?: (() => void) | undefined
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

/**
 * The panel.
 *
 * @param props - injectable client, optional pre-supplied overview, session id.
 * @returns the three-pane learning surface.
 */
export function LearningPanel({
  client,
  initialOverview,
  sessionId,
  onOpenChat,
  onFocusStarted,
}: LearningPanelProps): ReactNode {
  const state = useLearning({
    client: client ?? defaultClient,
    sessionId,
    initialOverview,
    onStarted: onFocusStarted,
  })
  const { overview, focus, nextStep, selectedId, detail, lesson, note, error, starting, loading } = state
  const rows = flattenTree(buildMapTree(overview?.nodes ?? []))
  const confirmed = (overview?.nodes ?? []).filter((node) => node.state === 'confirmed').length

  return (
    <div className="dt-root">
      {/* ---- course + map ---- */}
      <div className="dt-pane">
        <p className="dt-eyebrow">Current course</p>
        <h1 className="dt-course-title">{overview?.course?.title ?? 'No goal yet'}</h1>
        {overview?.course != null && (
          <p className="dt-goal">
            <b>Goal:</b> {overview.course.goal}
          </p>
        )}

        <p className="dt-section-title">
          Diagnosis map <span>{rows.length} nodes</span>
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
            onClick={() => state.select(node.id)}
          >
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
          {confirmed} of {rows.length} confirmed by evidence.
        </p>
      </div>

      {/* ---- node detail ---- */}
      <div className="dt-pane dt-detail">
        {detail === null ? (
          <p className="dt-empty">
            {loading ? 'Loading…' : 'Pick a node on the map to see why it is there.'}
          </p>
        ) : (
          <>
            <p className="dt-eyebrow">Selected node</p>
            <h2>{detail.node.title}</h2>
            <div className="dt-meta">
              <StateMark state={detail.node.state} />
              <span className="dt-chip">{relationLabel(detail.node.relation)}</span>
              {detail.parent !== null && <span className="dt-chip">parent: {detail.parent.title}</span>}
              {detail.children.length > 0 && (
                <span className="dt-chip">{detail.children.length} children</span>
              )}
            </div>

            <p className="dt-why">{stateExplanation(detail.node.state)}</p>

            <p className="dt-section-title">
              Evidence <span>{detail.node.evidence.length}</span>
            </p>
            {detail.node.evidence.length === 0 ? (
              <p className="dt-empty">Nothing recorded yet.</p>
            ) : (
              <ul className="dt-evidence">
                {detail.node.evidence.map((entry, index) => (
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
            <button type="button" className="dt-primary" onClick={state.start} disabled={starting}>
              {starting
                ? 'Starting…'
                : focus !== null && focus.nodeId === selectedId
                  ? 'Learning in progress'
                  : 'Start learning'}
            </button>
          </>
        )}
      </div>

      {/* ---- learning surface ---- */}
      <div className="dt-pane">
        <div className="dt-lesson-head">
          <p className="dt-eyebrow">Learning surface</p>
          {lesson !== null && <span className="dt-origin">{lesson.origin}</span>}
        </div>
        {lesson === null ? (
          focus !== null ? (
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
          )
        ) : (
          <>
            <h2>{lesson.title}</h2>
            <div style={{ marginTop: 14 }}>
              <LessonBody blocks={lesson.blocks} />
            </div>
          </>
        )}
        {nextStep !== null && (
          <NextStepCard
            nextStep={nextStep}
            busy={starting}
            onContinue={() => state.continueTo(nextStep.targetNodeId ?? nextStep.fromNodeId)}
          />
        )}
        {onOpenChat !== undefined && (
          <button type="button" className="dt-primary" onClick={onOpenChat}>
            Answer in the chat
          </button>
        )}
        {lesson !== null && (
          <button type="button" className="dt-secondary" onClick={state.dismissLesson}>
            Back to the node
          </button>
        )}
      </div>
    </div>
  )
}
