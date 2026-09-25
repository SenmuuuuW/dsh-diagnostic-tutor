/**
 * The docked Learning tab.
 *
 * This is the surface that makes the loop usable. The full-page panel occupies
 * the main column, which is also where the conversation lives — so with only
 * that panel, answering a check means leaving the lesson. The right sidebar is
 * a *separate column*, so the same runtime sits beside the chat and the learner
 * never has to switch.
 *
 * Layout is deliberately narrow-first and ordered by what the learner needs
 * next: **the lesson, then the recommendation, then the map, then the
 * evidence.** The lesson leads because it is the teaching; the map and the
 * evidence are reference material the learner consults, not the main event.
 *
 * It runs on the same `useLearning` state as the full panel, so the two cannot
 * disagree about what is focused or what the tutor wrote.
 */

import { useEffect, useMemo, type ReactNode } from 'react'

import type { NodeView, OverviewResponse } from '../contract.js'
import { HandoffLine, LessonBody, NextStepCard } from './blocks.jsx'
import { buildMapTree, flattenTree, relationLabel, stateExplanation } from './model.js'
import type { PanelClient } from './use-learning.js'
import { defaultClient, useLearning } from './use-learning.js'

/** The tab chip's text. */
export function LearningTabTitle(): ReactNode {
  return <>Learning</>
}

function CompactMap({
  nodes,
  selectedId,
  focusNodeId,
  onSelect,
}: {
  nodes: NodeView[]
  selectedId: string | null
  focusNodeId: string | null
  onSelect: (id: string) => void
}): ReactNode {
  const rows = useMemo(() => flattenTree(buildMapTree(nodes)), [nodes])
  const confirmed = nodes.filter((node) => node.state === 'confirmed').length

  return (
    <>
      <p className="dt-tab-section">
        Diagnosis map <span>{nodes.length}</span>
      </p>
      {rows.length === 0 && <p className="dt-empty">No map yet — state a goal in the chat.</p>}
      <div className="dt-tree">
        {rows.map(({ node, depth }) => (
          <button
            key={node.id}
            type="button"
            className="dt-tab-node"
            style={{ paddingLeft: `${6 + depth * 14}px` }}
            // Depth as data, so the stylesheet can draw the guide without
            // measuring anything.
            data-depth={depth > 0 ? Math.min(depth, 3) : undefined}
            data-attention={node.state === 'blocked' || node.state === 'weak' ? 'true' : undefined}
            aria-current={node.id === selectedId}
            data-focused={node.id === focusNodeId}
            onClick={() => onSelect(node.id)}
          >
            <span className={`dt-dot dt-state-${node.state}`} data-filled={node.state === 'confirmed'} />
            <span className="dt-tab-node-title">{node.title}</span>
            <span className={`dt-tab-state dt-state-${node.state}`}>{node.state}</span>
          </button>
        ))}
      </div>
      <p className="dt-caption">
        {confirmed} of {nodes.length} confirmed by evidence.
      </p>
    </>
  )
}

export interface LearningTabProps {
  /** Defaults to the real HTTP client. */
  client?: PanelClient
  /** Injected by the session scope; the tab asks the tutor in this session. */
  sessionId?: string | undefined
  /** Pre-supplied state, so the preview and tests skip the first fetch. */
  initialOverview?: OverviewResponse | undefined
}

/**
 * The docked learning surface.
 *
 * @param props - injectable client and the session the tab belongs to.
 * @returns the stacked node / map / lesson column.
 */
export function LearningTab({ client, sessionId, initialOverview }: LearningTabProps): ReactNode {
  const state = useLearning({ client: client ?? defaultClient, sessionId, initialOverview })
  const { overview, focus, nextStep, handoff, teachingBrain, selectedId, detail, lesson, note, error, starting, loading, select } =
    state

  // Show something on first paint: the focused node if there is one, else the
  // map's first row. `select` is a stable callback, so this runs on arrival
  // rather than on every render.
  useEffect(() => {
    if (selectedId !== null) return
    const first = overview?.nodes?.[0]?.id
    if (first !== undefined) select(focus?.nodeId ?? first)
  }, [overview, focus, selectedId, select])

  const shownId = focus?.nodeId ?? selectedId

  const hasCourse = overview?.course != null
  const rows = overview?.nodes ?? []

  // First use: no goal yet. A blank panel would read as a broken panel, so it
  // says what to do and shows the exact sentence that starts everything. No
  // wizard — the chat is the input, and the shortest path there is one line of
  // text the learner can copy.
  if (!hasCourse) {
    return (
      <div className="dt-tab">
        <div className="dt-welcome">
          <p className="dt-welcome-eyebrow">Universal Diagnostic Tutor</p>
          <h2 className="dt-welcome-title">What do you want to learn?</h2>
          <p className="dt-welcome-body">
            Say it in the chat — in your own words. The tutor will ask what you already know
            before it teaches anything, and this panel fills in as it does.
          </p>
          <div className="dt-welcome-sample">
            <span className="dt-welcome-sample-label">Try</span>
            <span className="dt-welcome-sample-text">
              I want to learn machine learning. I know some Python, but my math is weak.
            </span>
          </div>
          <p className="dt-welcome-note">
            No account, no scores, no streak. Your goal, your map and the evidence behind it
            stay on this machine and are yours to export.
          </p>
      {teachingBrain === false && (
        <p className="dt-notice">
          <b>No tutor is installed for this workspace.</b> This panel will record and show
          your learning state, but no lesson will be written until the Universal Diagnostic
          Tutor skill is available.
        </p>
      )}
        </div>
      </div>
    )
  }

  return (
    <div className="dt-tab">
      {/* ---- now learning ---- */}
      {detail === null ? (
        // The header frame stays even before the first fetch lands, so the
        // surface never looks like an empty box on a slow connection.
        <header className="dt-now">
          <p className="dt-now-eyebrow">Now learning</p>
          <p className="dt-empty">
            {loading ? 'Loading…' : 'Pick a node on the map below to begin.'}
          </p>
        </header>
      ) : (
        <header className="dt-now" data-state={detail.node.state}>
          <p className="dt-now-eyebrow">Now learning</p>
          <h2 className="dt-now-title">{detail.node.title}</h2>
          <div className="dt-now-meta">
            <span className={`dt-tab-state dt-state-${detail.node.state}`}>{detail.node.state}</span>
            <span className="dt-now-rel">{relationLabel(detail.node.relation)}</span>
            {detail.parent !== null && <span className="dt-now-rel">in {detail.parent.title}</span>}
          </div>
          <p className="dt-now-note">{stateExplanation(detail.node.state)}</p>
          <button
            type="button"
            className="dt-primary dt-now-action"
            onClick={state.start}
            disabled={starting || shownId === null}
          >
            {starting
              ? 'Starting…'
              : focus !== null && focus.nodeId === shownId
                ? 'Keep going'
                : 'Start learning'}
          </button>
          {note !== null && <p className="dt-caption">{note}</p>}
          {error !== null && <p className="dt-empty">{error}</p>}
        </header>
      )}

      {/* ---- the teaching ---- */}
      {/* Always present, even before it has content: the surface names its three
          regions so a first-time learner can see what will fill them. */}
      <section className="dt-lesson">
        <p className="dt-tab-section">Learning surface</p>
        {handoff !== null && (
          <HandoffLine handoff={handoff} onRetry={() => state.continueTo(handoff.targetNodeId)} />
        )}
        {lesson === null ? (
          <p className="dt-empty">
            {focus !== null
              ? 'The tutor is preparing this node…'
              : 'Press Start learning and the teaching appears here, while the chat stays open beside it.'}
          </p>
        ) : (
          <article className="dt-lesson-body">
            <div className="dt-lesson-head">
              <h3 className="dt-lesson-title">{lesson.title}</h3>
              <span className="dt-origin">{lesson.origin}</span>
            </div>
            <LessonBody blocks={lesson.blocks} />
          </article>
        )}
      </section>

      {/* ---- where to go next ---- */}
      {nextStep !== null && (
        <NextStepCard
          nextStep={nextStep}
          busy={starting}
          // Acting on the recommendation starts the focus it names — or, for a
          // stay, re-opens the same node so the tutor picks the thread back up.
          onContinue={() => {
            const target = nextStep.targetNodeId ?? nextStep.fromNodeId
            select(target)
            state.continueTo(target)
          }}
        />
      )}

      <CompactMap
        nodes={rows}
        selectedId={shownId}
        focusNodeId={focus?.nodeId ?? null}
        onSelect={select}
      />

      {/* ---- the evidence behind this node ---- */}
      {detail !== null && detail.node.evidence.length > 0 && (
        <>
          <p className="dt-tab-section">
            Evidence <span>{detail.node.evidence.length}</span>
          </p>
          <ul className="dt-evidence">
            {detail.node.evidence.map((entry, index) => (
              <li key={index}>
                <span className="dt-ev-kind">{entry.kind}</span>
                {entry.readiness !== undefined && (
                  <span className="dt-ev-readiness">{entry.readiness.replace(/-/g, ' ')}</span>
                )}
                {entry.note !== undefined && <span className="dt-ev-note">{entry.note}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
