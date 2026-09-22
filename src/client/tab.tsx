/**
 * The docked Learning tab.
 *
 * This is the surface that makes the loop usable. The full-page panel occupies
 * the main column, which is also where the conversation lives — so with only
 * that panel, answering a check means leaving the lesson. The right sidebar is
 * a *separate column*, so the same runtime sits beside the chat and the learner
 * never has to switch.
 *
 * Layout is deliberately narrow-first: node, then map, then the lesson, stacked
 * in one scrolling column. A three-column split inside a docked panel would be
 * unreadable at the widths this column actually takes.
 *
 * It runs on the same `useLearning` state as the full panel, so the two cannot
 * disagree about what is focused or what the tutor wrote.
 */

import { useEffect, useMemo, type ReactNode } from 'react'

import type { NodeView, OverviewResponse } from '../contract.js'
import { LessonBody, NextStepCard } from './blocks.jsx'
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
      {rows.map(({ node, depth }) => (
        <button
          key={node.id}
          type="button"
          className="dt-tab-node"
          style={{ paddingLeft: `${6 + depth * 10}px` }}
          aria-current={node.id === selectedId}
          data-focused={node.id === focusNodeId}
          onClick={() => onSelect(node.id)}
        >
          <span className={`dt-dot dt-state-${node.state}`} data-filled={node.state === 'confirmed'} />
          <span className="dt-tab-node-title">{node.title}</span>
          <span className={`dt-state dt-state-${node.state}`}>{node.state}</span>
        </button>
      ))}
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
  const { overview, focus, nextStep, selectedId, detail, lesson, note, error, starting, loading, select } =
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

  return (
    <div className="dt-tab">
      <p className="dt-eyebrow">Now learning</p>
      {detail === null ? (
        <p className="dt-empty">
          {loading ? 'Loading…' : 'Pick a node on the map below to begin.'}
        </p>
      ) : (
        <>
          <div className="dt-tab-head">
            <h3 className="dt-tab-title">{detail.node.title}</h3>
            <span className={`dt-state dt-state-${detail.node.state}`}>{detail.node.state}</span>
          </div>
          <p className="dt-tab-meta">
            {relationLabel(detail.node.relation)}
            {detail.parent !== null && ` · ${detail.parent.title}`}
            {` · ${detail.node.evidence.length} evidence`}
          </p>
          <p className="dt-why">{stateExplanation(detail.node.state)}</p>

          <button
            type="button"
            className="dt-primary dt-tab-action"
            onClick={state.start}
            disabled={starting || shownId === null}
          >
            {starting ? 'Starting…' : focus !== null && focus.nodeId === shownId ? 'Learning in progress' : 'Start learning'}
          </button>
          {note !== null && <p className="dt-caption">{note}</p>}
          {error !== null && <p className="dt-empty">{error}</p>}
        </>
      )}

      <CompactMap
        nodes={overview?.nodes ?? []}
        selectedId={shownId}
        focusNodeId={focus?.nodeId ?? null}
        onSelect={select}
      />

      <p className="dt-tab-section">Learning surface</p>
      {lesson === null ? (
        <p className="dt-empty">
          {focus !== null
            ? 'The tutor is preparing this node…'
            : 'Press Start learning and the teaching appears here, while the chat stays open beside it.'}
        </p>
      ) : (
        <>
          <div className="dt-lesson-head">
            <span className="dt-tab-lesson-title">{lesson.title}</span>
            <span className="dt-origin">{lesson.origin}</span>
          </div>
          <LessonBody blocks={lesson.blocks} />
        </>
      )}

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

      {detail !== null && detail.node.evidence.length > 0 && (
        <>
          <p className="dt-tab-section">
            Evidence <span>{detail.node.evidence.length}</span>
          </p>
          <ul className="dt-evidence">
            {detail.node.evidence.map((entry, index) => (
              <li key={index}>
                <div className="kind">
                  {entry.kind}
                  {entry.readiness !== undefined && ` · ${entry.readiness}`}
                </div>
                {entry.note !== undefined && <div>{entry.note}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
