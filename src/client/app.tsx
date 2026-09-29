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

import { useEffect, type ReactNode } from 'react'

import { DataFooter, HandoffLine, LessonBody, NextStepCard } from './blocks.jsx'
import {
  buildMapTree,
  flattenTree,
  formatWhen,
  isFilledState,
  relationLabel,
  stateExplanation,
} from './model.js'
import type { PanelClient } from './use-learning.js'
import { defaultClient, useLearning } from './use-learning.js'

export type { PanelClient } from './use-learning.js'

/** A node state as one chip: the mark, and the word. Never a number. */
function StateChip({ state }: { state: string }): ReactNode {
  return (
    <span className={`dt-tab-state dt-state-${state}`}>
      {state}
    </span>
  )
}

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

  // Pick something on arrival, the same way the docked tab does. Without this
  // the middle and right panes sit empty until the learner works out that the
  // map rows are clickable — which reads as a broken page, not an invitation.
  const arrival = state.selectedId
  const select = state.select
  useEffect(() => {
    if (arrival !== null) return
    const first = state.overview?.nodes?.[0]?.id
    if (first !== undefined) select(state.focus?.nodeId ?? first)
  }, [arrival, select, state.overview, state.focus])
  const { overview, focus, nextStep, handoff, teachingBrain, dataNote, selectedId, detail, lesson, note, error, starting, loading } =
    state
  const rows = flattenTree(buildMapTree(overview?.nodes ?? []))
  const confirmed = (overview?.nodes ?? []).filter((node) => node.state === 'confirmed').length
  // "Already learning this one" is a statement about the tutor's focus, not
  // about what the learner has selected.
  const isFocused = focus !== null && focus.nodeId === selectedId

  // First use, same as the docked tab: a blank three-column page reads as a
  // broken page. One question and the sentence that starts everything.
  if (overview?.course == null) {
    return (
      <div className="dt-root-wrap">
        <header className="dt-bar">
          <div className="dt-bar-id">
            <span className="dt-bar-name">Learning</span>
            <span className="dt-bar-sep" aria-hidden="true">
              ·
            </span>
            <span className="dt-bar-note">your conversation stays in the sidebar</span>
          </div>
          {onOpenChat !== undefined && (
            <button type="button" className="dt-bar-back" onClick={onOpenChat}>
              Back to the conversation
            </button>
          )}
        </header>
        <div className="dt-root dt-root-welcome">
        <div className="dt-welcome">
          <p className="dt-welcome-eyebrow">Universal Diagnostic Tutor</p>
          <h1 className="dt-welcome-title">What do you want to learn?</h1>
          <p className="dt-welcome-body">
            Works with the Universal Diagnostic Tutor skill. Start by telling the tutor what you
            want to learn — in your own words, in the chat. Then this page fills in: a map of what
            you actually know, the lesson, and the evidence behind every status.
          </p>
          <div className="dt-welcome-sample">
            <span className="dt-welcome-sample-label">Try</span>
            <span className="dt-welcome-sample-text">
              I want to learn machine learning. I know some Python, but my math is weak.
            </span>
          </div>
          <p className="dt-welcome-note">
            If tutoring doesn&apos;t start, make sure the UDT skill is available to your active DSH
            agent.
          </p>
          <p className="dt-welcome-note">
            No account, no scores, no streak. Your goal, your map and the evidence behind it stay
            on this machine, and are yours to keep or delete.
          </p>
          {/* The warning belongs with the copy it qualifies, not under the
              data controls — Export and Delete are about state, not about the
              missing skill. */}
          {teachingBrain === false && (
            <p className="dt-notice">
              <b>The Universal Diagnostic Tutor skill was not found.</b> This panel still records
              and shows your learning state, but no lesson will be written until the skill is
              available to your active DSH agent.
            </p>
          )}
          <DataFooter onExport={state.exportData} onReset={state.resetAll} />
        </div>
      </div>
    </div>
    )
  }

  return (
    <div className="dt-root-wrap">
      <header className="dt-bar">
        <div className="dt-bar-id">
          <span className="dt-bar-name">Learning</span>
          <span className="dt-bar-sep" aria-hidden="true">
            ·
          </span>
          <span className="dt-bar-note">
            {sessionId === undefined
              ? 'no conversation selected'
              : 'your conversation stays in the sidebar'}
          </span>
        </div>
        {onOpenChat !== undefined && (
          <button type="button" className="dt-bar-back" onClick={onOpenChat}>
            {/* Named plainly: the fear this button answers is "did I lose my chat?" */}
            Back to the conversation
          </button>
        )}
      </header>
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
            // Padding, not margin: the row is `width: 100%`, so an outer
            // margin makes it wider than its pane and pushes it off screen at
            // narrow widths.
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            // Depth and attention as data, so the stylesheet draws the guide
            // and the blocker tint without measuring anything — the same two
            // attributes the docked tab has always set.
            data-depth={depth > 0 ? Math.min(depth, 3) : undefined}
            data-attention={node.state === 'blocked' || node.state === 'weak' ? 'true' : undefined}
            aria-current={node.id === selectedId}
            // Undefined rather than false: React stringifies a boolean onto a
            // data-* attribute, so `data-focused={false}` renders
            // data-focused="false" — which every [data-focused] rule matches.
            data-focused={node.id === focus?.nodeId ? 'true' : undefined}
            onClick={() => state.select(node.id)}
          >
            <span className={`dt-dot dt-state-${node.state}`} data-filled={isFilledState(node.state)} />
            <span className="dt-node-title">
              {node.title}
              <span className="dt-node-rel">
                {relationLabel(node.relation)} · {node.evidenceCount} evidence
              </span>
            </span>
            <StateChip state={node.state} />
          </button>
        ))}
        <p className="dt-caption">
          {confirmed} of {rows.length} confirmed by evidence.
        </p>
      </div>

      {/* ---- node detail ---- */}
      <div className="dt-pane dt-detail">
        {detail === null ? (
          <div className="dt-empty-state">
            <p className="dt-empty-title">
              {loading ? 'Loading your map…' : 'Nothing selected'}
            </p>
            <p className="dt-empty">
              Pick a node on the map and this column shows what is recorded against it, and why it
              is in that state.
            </p>
          </div>
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
                    <span className="dt-ev-kind">{entry.kind.replace(/-/g, ' ')}</span>
                    {entry.readiness !== undefined && (
                      <span className="dt-ev-readiness">{entry.readiness.replace(/-/g, ' ')}</span>
                    )}
                    {entry.note !== undefined && <span className="dt-ev-note">{entry.note}</span>}
                    <span className="dt-ev-when">{formatWhen(entry.at)}</span>
                  </li>
                ))}
              </ul>
            )}

            {note !== null && <p className="dt-caption">{note}</p>}
            {error !== null && <p className="dt-empty">{error}</p>}
            {/* Waking a tutor means naming a conversation, so with none selected
                the button says why it cannot work rather than appearing to.

                When this node is already the focus, the button is no longer the
                next thing to do — the teaching is. It stays (re-waking the
                tutor is a real action) but drops out of the primary weight, so
                the filled control on screen belongs to whatever comes next. */}
            <button
              type="button"
              className={isFocused ? 'dt-secondary' : 'dt-primary'}
              onClick={state.start}
              disabled={starting || sessionId === undefined}
              {...(sessionId === undefined
                ? { title: 'Open or start a conversation first — that is where the tutor replies.' }
                : {})}
            >
              {starting
                ? 'Starting…'
                : sessionId === undefined
                  ? 'Start learning'
                  : isFocused
                    ? 'Restart this node'
                    : 'Start learning'}
            </button>
            {isFocused && !starting && (
              <p className="dt-caption">
                This is the node the tutor is teaching. The lesson is on the right.
              </p>
            )}
            {sessionId === undefined && (
              <p className="dt-caption">
                Open a conversation first. The tutor teaches in the chat, so a node cannot be
                started without one.
              </p>
            )}
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
            <div className="dt-empty-state">
              <p className="dt-empty-title">Nothing is being taught yet</p>
              <p className="dt-empty">
                Choose a node on the map and press <b>Start learning</b>. The teaching appears
                here, and the conversation stays in the chat.
              </p>
            </div>
          )
        ) : (
          <>
            <h2 className="dt-lesson-title">{lesson.title}</h2>
            <LessonBody blocks={lesson.blocks} />
          </>
        )}
        {handoff !== null && lesson === null && focus !== null && (
          <HandoffLine handoff={handoff} onRetry={() => state.continueTo(handoff.targetNodeId)} />
        )}
        {nextStep !== null && (
          <NextStepCard
            nextStep={nextStep}
            busy={starting}
            onContinue={() => state.continueTo(nextStep.targetNodeId ?? nextStep.fromNodeId)}
          />
        )}
        {/* One filled control per column. When the tutor has recorded a next
            step, that step is what the learner should press; answering in the
            chat is the way back to the conversation, which is navigation
            rather than a recommendation, so it steps down. With no
            recommendation it is the only thing left to do, and takes the
            primary weight. */}
        {onOpenChat !== undefined && (
          <button
            type="button"
            className={nextStep === null && lesson !== null ? 'dt-primary' : 'dt-secondary'}
            onClick={onOpenChat}
          >
            Answer in the chat
          </button>
        )}
        {lesson !== null && (
          <button type="button" className="dt-secondary" onClick={state.dismissLesson}>
            Back to the node
          </button>
        )}
        {dataNote !== null && <p className="dt-caption">{dataNote}</p>}
      </div>
      </div>
      {/* Rights, not calls to action: under everything, findable, and out of
          the way of the teaching. */}
      <footer className="dt-foot">
        <DataFooter onExport={state.exportData} onReset={state.resetAll} />
      </footer>
    </div>
  )
}
