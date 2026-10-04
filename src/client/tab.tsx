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
import { DataFooter, HandoffLine, LessonBody, NextStepCard } from './blocks.jsx'
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
            // Undefined, not false: see the panel — a boolean lands in the DOM
            // as the string "false", which still matches [data-focused].
            data-focused={node.id === focusNodeId ? 'true' : undefined}
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
  /**
   * Opens the full panel in the main column.
   *
   * Offered, never taken: the docked tab is the everyday surface, and giving up
   * the chat to see more of the map is the learner's call.
   */
  onOpenFullView?: (() => void) | undefined
}

/**
 * The docked learning surface.
 *
 * @param props - injectable client and the session the tab belongs to.
 * @returns the stacked node / map / lesson column.
 */
export function LearningTab({ client, sessionId, initialOverview, onOpenFullView }: LearningTabProps): ReactNode {
  const state = useLearning({ client: client ?? defaultClient, sessionId, initialOverview })
  const { overview, focus, nextStep, handoff, teachingBrain, dataNote, selectedId, detail, lesson, note, error, starting, loading, select } =
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

  // Read from the map rather than fetched: the tab already holds every node,
  // and the focused one is among them.
  const focusNode = focus === null ? undefined : overview?.nodes?.find((n) => n.id === focus.nodeId)
  const focusNodeTitle = focusNode?.title ?? null
  const focusNodeState = focusNode?.state ?? null

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
            Works with the Universal Diagnostic Tutor skill. Start by telling the tutor what you
            want to learn — in your own words, in the chat.
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
            No account, no scores, no streak. Your goal, your map and the evidence behind it
            stay on this machine, and are yours to keep or delete.
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
    )
  }

  return (
    <div className="dt-tab">
      {/* ---- two layers, two owners ----
          The course and its map belong to the learner and every conversation
          shares them. Where THIS conversation has got to belongs to this
          conversation alone. One heading over both is what made a brand-new
          chat look as though it had become the learner's old session: the
          course's goal node sat under a label reading "now learning", and a
          conversation that had never started anything appeared to be in the
          middle of one. */}
      <header className="dt-here">
        <p className="dt-eyebrow">Your learning</p>
        <h2 className="dt-here-course">{overview?.course?.title ?? 'No goal yet'}</h2>
        {overview?.course != null && <p className="dt-shared">Shared across conversations</p>}

        <p className="dt-eyebrow dt-eyebrow-here">This conversation</p>
        {focus === null ? (
          <p className="dt-here-empty">
            No learning focus yet. Pick a node below to start learning here.
          </p>
        ) : (
          <p className="dt-here-focus">
            <span className="dt-here-node">{focusNodeTitle ?? focus.nodeId}</span>
            {focusNodeState !== null && (
              <span className={`dt-tab-state dt-state-${focusNodeState}`}>{focusNodeState}</span>
            )}
          </p>
        )}

        {/* One filled control per column. When the tutor has recorded a
            recommendation, that recommendation is the next move and owns the
            primary weight; starting a node is the fallback and steps down. */}
        <button
          type="button"
          className={nextStep === null ? 'dt-primary dt-here-action' : 'dt-secondary dt-here-action'}
          onClick={state.start}
          disabled={starting || shownId === null}
        >
          {starting
            ? 'Starting…'
            : focus !== null && focus.nodeId === shownId
              ? 'Learning in progress'
              : 'Start learning'}
        </button>
        {focus === null && (
          <p className="dt-caption">
            Starting records a focus for this conversation only. Your map and lessons stay shared.
          </p>
        )}
        {loading && detail === null && <p className="dt-caption">Loading…</p>}
        {note !== null && <p className="dt-caption">{note}</p>}
        {error !== null && <p className="dt-empty">{error}</p>}
      </header>

      {/* ---- the teaching ---- */}
      {/* Always present, even before it has content: the surface names its three
          regions so a first-time learner can see what will fill them. */}
      <section className="dt-lesson">
        <p className="dt-tab-section">
          Learning surface
          {onOpenFullView !== undefined && (
            // Secondary on purpose. Everything here works without it; it only
            // trades the chat for a wider map.
            <button type="button" className="dt-tab-expand" onClick={onOpenFullView}>
              Open full view
            </button>
          )}
        </p>
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

      {dataNote !== null && <p className="dt-caption">{dataNote}</p>}

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

      <DataFooter onExport={state.exportData} onReset={state.resetAll} />
    </div>
  )
}
