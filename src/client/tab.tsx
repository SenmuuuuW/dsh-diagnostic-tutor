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
import {
  buildMapTree,
  continuationLabel,
  conversationControl,
  flattenTree,
  handoffLineVisible,
  lessonPlaceholder,
  relationLabel,
  stateExplanation,
} from './model.js'
import type { PanelClient } from './use-learning.js'
import { defaultClient, useLearning } from './use-learning.js'
import { useCurrentSessionId } from './use-session.js'

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
  /**
   * The session the slot says this tab belongs to.
   *
   * Used only when no live source is available — the preview and the tests.
   * In the real client `uiSession` is supplied and WINS, because this prop is
   * captured when the pane is docked and a docked pane outlives a session
   * switch: the tab would keep asking about the conversation it was opened in
   * while the learner looks at another one. That is exactly the bug this
   * replaces — a `POST /project` that went to the previous conversation.
   */
  sessionId?: string | undefined
  /**
   * The live session scope, read through the same adapter the sidebar entry
   * uses. An observable, so the surface follows the visible chat by
   * construction rather than by remembering to re-render.
   */
  uiSession?: unknown
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
export function LearningTab({
  client,
  sessionId,
  uiSession,
  initialOverview,
  onOpenFullView,
}: LearningTabProps): ReactNode {
  // The live scope when there is one. `adapter.current` is a HostObservable and
  // `useCurrentSessionId` subscribes to it, so a session switch re-renders this
  // surface with the new id — no cache, no closure, nothing to invalidate.
  const liveSession = useCurrentSessionId(uiSession)
  const activeSession = uiSession === undefined ? sessionId : liveSession
  const state = useLearning({ client: client ?? defaultClient, sessionId: activeSession, initialOverview })
  const { overview, focus, nextStep, handoff, teachingBrain, dataNote, selectedId, detail, lesson, note, error, starting, loading, select, library } =
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

  /**
   * The conversation's control, and the state the teaching region is in.
   *
   * Both are derived from what is true rather than from what would look busy:
   * with a recommendation pending there is no start control (its card owns the
   * next move), `Start learning` exists only before anything is focused, and the
   * handoff line narrates a wait rather than announcing a lesson that is already
   * on the page.
   */
  const control = conversationControl({
    focusNodeId: focus?.nodeId ?? null,
    shownNodeId: shownId,
    hasNextStep: nextStep !== null,
  })
  const placeholder = lessonPlaceholder({
    focusNodeId: focus?.nodeId ?? null,
    hasNextStep: nextStep !== null,
  })
  const handoffVisible = handoffLineVisible({
    handoff,
    lesson,
    focusNodeId: focus?.nodeId ?? null,
  })

  // Read from the map rather than fetched: the tab already holds every node,
  // and the focused one is among them.
  const focusNode = focus === null ? undefined : overview?.nodes?.find((n) => n.id === focus.nodeId)
  const focusNodeTitle = focusNode?.title ?? null
  const focusNodeState = focusNode?.state ?? null

  const hasCourse = overview?.course != null
  /**
   * The conversation has deliberately chosen to start something new.
   *
   * A third state, and the reason the button used to look dead: both "chosen
   * nothing" and "chosen new" have no course, so a surface reading only
   * `course` renders them the same and the press appears to do nothing while
   * the state behind it is correct.
   */
  const startingNew = overview?.selection === 'new'
  const rows = overview?.nodes ?? []

  // First use: no goal yet. A blank panel would read as a broken panel, so it
  // says what to do and shows the exact sentence that starts everything. No
  // wizard — the chat is the input, and the shortest path there is one line of
  // text the learner can copy.
  // Chosen: the tutor will make this conversation's project from whatever the
  // learner says next. Nothing is created here — no empty course, no invented
  // focus — so this state is a sentence and a way back, and nothing else.
  if (startingNew) {
    return (
      <div className="dt-tab">
        <header className="dt-here">
          <button type="button" className="dt-back" onClick={() => state.openProject()}>
            ← All learning
          </button>
          <p className="dt-eyebrow">Start something new</p>
          <p className="dt-here-empty">Tell the tutor what you want to learn in Chat.</p>
          <p className="dt-caption">
            When the tutor records a goal there, it becomes this conversation&rsquo;s project. Your
            other projects are untouched.
          </p>
        </header>
        {library.length > 0 && (
          <section className="dt-lesson">
            <p className="dt-tab-section">Or continue one</p>
            <ul className="dt-library">
              {library.map((project) => (
                <li key={project.id}>
                  <button type="button" className="dt-project" onClick={() => state.openProject(project.id)}>
                    <span className="dt-project-name">{project.title}</span>
                    <span className="dt-project-count">
                      {project.confirmed} of {project.total} confirmed
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {teachingBrain === false && (
          <p className="dt-notice">
            <b>The Universal Diagnostic Tutor skill was not found.</b> This panel still records and
            shows your learning state, but no lesson will be written until the skill is available to
            your active DSH agent.
          </p>
        )}
        <section className="dt-lesson">
          <DataFooter onExport={state.exportData} onReset={state.resetAll} />
        </section>
      </div>
    )
  }

  // No project open and none chosen. That is the library, not a welcome screen
  // and not somebody else's course: the projects below are the learner's,
  // shared like the maps themselves, and opening one is this conversation's
  // choice to make.
  if (!hasCourse) {
    return (
      <div className="dt-tab">
        <header className="dt-here">
          <p className="dt-eyebrow">Your learning</p>
          {library.length === 0 ? (
            <p className="dt-here-empty">
              Nothing here yet. Tell the tutor what you want to learn, in the chat.
            </p>
          ) : (
            <>
              <p className="dt-shared">Shared across your conversations</p>
              <ul className="dt-library">
                {library.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      className="dt-project"
                      onClick={() => state.openProject(project.id)}
                    >
                      <span className="dt-project-name">{project.title}</span>
                      <span className="dt-project-count">
                        {project.confirmed} of {project.total} confirmed
                      </span>
                      <span className="dt-project-go">
                        {project.confirmed === 0 ? 'Open' : 'Continue'} →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </header>

        <section className="dt-lesson">
          {/* The library offers the way out of itself; the copy explaining what
              "new" MEANS belongs to the state it leads to, not here. Showing
              both in one place made the two states read alike, which is the
              same failure as before in a different costume. */}
          <button type="button" className="dt-secondary dt-here-action" onClick={() => state.openProject()}>
            + Start something new
          </button>
        </section>

        {teachingBrain === false && (
          <p className="dt-notice">
            <b>The Universal Diagnostic Tutor skill was not found.</b> This panel still records and
            shows your learning state, but no lesson will be written until the skill is available to
            your active DSH agent.
          </p>
        )}
        <section className="dt-lesson">
          <DataFooter onExport={state.exportData} onReset={state.resetAll} />
        </section>
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
        {/* One link, not a breadcrumb: there are two levels and the learner
            only ever needs the one they are not on. */}
        <button type="button" className="dt-back" onClick={() => state.openProject()}>
          ← All learning
        </button>
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

        {/* One control, and only one. With a recommendation pending the card
            below owns the move and this control is not rendered at all — the
            two used to appear together, which is a question rather than a
            choice. `Start learning` is offered only before anything is focused;
            once there is a focus the control names the state instead. */}
        {control !== null && (
          <button
            type="button"
            className="dt-primary dt-here-action"
            // It acts on the node it describes. Starting used to follow the
            // selection, so browsing the map could silently retarget a press
            // that looked like it was about the focused node.
            onClick={() => state.continueTo(control.nodeId)}
            disabled={starting}
          >
            {starting ? 'Starting…' : control.label}
          </button>
        )}
        {control?.kind === 'start' && (
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
        {/* The wait line is for a wait: with the lesson on screen (or nothing
            focused) it would be announcing what the page already shows. */}
        {handoffVisible && handoff !== null && (
          <HandoffLine handoff={handoff} onRetry={() => state.continueTo(handoff.targetNodeId)} />
        )}
        {lesson === null ? (
          <p className="dt-empty">
            {placeholder === 'preparing'
              ? 'The tutor is preparing this node…'
              : placeholder === 'press-continue'
                ? `Press ${continuationLabel(nextStep)} and the teaching appears here, while the chat stays open beside it.`
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
