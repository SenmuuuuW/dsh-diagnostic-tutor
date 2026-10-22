import { CourseLearning, useCoursePath } from './course-learning.js'
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
import { useLang } from './i18n.js'
import { LanguageToggle } from './language-toggle.js'
import { useLearningText } from './learning-text.js'
import { evidenceKindLabel, readinessLabel, stateLabel } from './map-text.js'
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
import { useTabText } from './tab-text.js'
import type { PanelClient } from './use-learning.js'
import { defaultClient, useLearning } from './use-learning.js'
import { useCurrentSessionId } from './use-session.js'
import { EmptyArt, StateBar, StateGlyph } from './visuals.jsx'

/** The tab chip's text. */
export function LearningTabTitle(): ReactNode {
  return useLearningText().tabTitle
}

function CompactMap({
  nodes,
  selectedId,
  focusNodeId,
  onSelect,
  onOpenMapPage,
}: {
  nodes: NodeView[]
  selectedId: string | null
  focusNodeId: string | null
  onSelect: (id: string) => void
  onOpenMapPage?: (() => void) | undefined
}): ReactNode {
  const text = useTabText()
  const lang = useLang()
  const rows = useMemo(() => flattenTree(buildMapTree(nodes)), [nodes])
  const confirmed = nodes.filter((node) => node.state === 'confirmed').length

  return (
    <>
      <p className="dt-tab-section">
        {text.diagnosisMap} <span>{nodes.length}</span>
        {onOpenMapPage !== undefined && (
          <button type="button" className="dt-tab-expand" onClick={onOpenMapPage}>
            {text.openMap}
          </button>
        )}
      </p>
      <StateBar nodes={nodes} />
      {rows.length === 0 && (
        <>
          <EmptyArt kind="map" />
          <p className="dt-empty">{text.noMapYet}</p>
        </>
      )}
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
            <span className={`dt-dot dt-state-${node.state}`} data-filled={node.state === 'confirmed'}>
              <StateGlyph state={node.state} />
            </span>
            <span className="dt-tab-node-title">{node.title}</span>
            <span className={`dt-tab-state dt-state-${node.state}`}>{stateLabel(node.state, lang)}</span>
          </button>
        ))}
      </div>
      <p className="dt-caption">
        {text.confirmedByEvidence(confirmed, nodes.length)}
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
  /** Opens the diagnosis map as its own main-column page. */
  onOpenMapPage?: (() => void) | undefined
  /** Switch to the conversation a project's learning belongs to; false when the shell cannot navigate. */
  onOpenSession?: ((sessionId: string) => boolean) | undefined
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
  onOpenMapPage,
  onOpenSession,
}: LearningTabProps): ReactNode {
  // The live scope when there is one. `adapter.current` is a HostObservable and
  // `useCurrentSessionId` subscribes to it, so a session switch re-renders this
  // surface with the new id — no cache, no closure, nothing to invalidate.
  const liveSession = useCurrentSessionId(uiSession)
  const activeSession = uiSession === undefined ? sessionId : liveSession
  const text = useTabText()
  const learning = useLearningText()
  const lang = useLang()
  const state = useLearning({ client: client ?? defaultClient, sessionId: activeSession, initialOverview, onOpenSession })
  const { overview, focus, nextStep, handoff, teachingBrain, dataNote, selectedId, detail, lesson, note, error, starting, loading, select, library } =
    state

  const coursePath = useCoursePath((client ?? defaultClient).pathClient, state.overview?.course?.id, activeSession)

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
  }, lang)
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
  if (overview?.course && coursePath && (coursePath.path.brief || coursePath.run)) {
    return <CourseLearning view={coursePath} title={overview.course.title} compact
      onOpenMap={onOpenMapPage}  onExport={state.exportData} onReset={state.resetAll} />
  }

  if (startingNew) {
    return (
      <div className="dt-tab">
        <header className="dt-here">
          <button type="button" className="dt-back" onClick={() => state.openProject()}>
            {text.allLearning}
          </button>
          <EmptyArt kind="welcome" />
          <p className="dt-eyebrow">{text.startSomethingNew}</p>
          <p className="dt-here-empty">{text.tellTutorInChat}</p>
          <p className="dt-caption">{text.newProjectNote}</p>
          <LanguageToggle />
        </header>
        {library.length > 0 && (
          <section className="dt-lesson">
            <p className="dt-tab-section">{text.orContinueOne}</p>
            <ul className="dt-library">
              {library.map((project) => (
                <li key={project.id}>
                  <button type="button" className="dt-project" onClick={() => void state.enterProject(project.id)}>
                    <span className="dt-project-name">{project.title}</span>
                    <span className="dt-project-count">
                      {text.confirmedOf(project.confirmed, project.total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {teachingBrain === false && (
          <p className="dt-notice">
            <b>{text.skillMissingTitle}</b> {text.skillMissingBody}
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
          <EmptyArt kind="library" />
          <p className="dt-eyebrow">{text.yourLearning}</p>
          {library.length === 0 ? (
            <p className="dt-here-empty">{text.nothingHereYet}</p>
          ) : (
            <>
              <p className="dt-shared">{text.sharedAcrossYourConversations}</p>
              <ul className="dt-library">
                {library.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      className="dt-project"
                      onClick={() => void state.enterProject(project.id)}
                    >
                      <span className="dt-project-name">{project.title}</span>
                      <span className="dt-project-count">
                        {text.confirmedOf(project.confirmed, project.total)}
                      </span>
                      <span className="dt-project-go">
                        {project.confirmed === 0 ? text.openLabel : text.continueLabel} →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <LanguageToggle />
        </header>

        <section className="dt-lesson">
          {/* The library offers the way out of itself; the copy explaining what
              "new" MEANS belongs to the state it leads to, not here. Showing
              both in one place made the two states read alike, which is the
              same failure as before in a different costume. */}
          <button type="button" className="dt-secondary dt-here-action" onClick={() => state.openProject()}>
            {text.startSomethingNewAction}
          </button>
        </section>

        {teachingBrain === false && (
          <p className="dt-notice">
            <b>{text.skillMissingTitle}</b> {text.skillMissingBody}
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
          {text.allLearning}
        </button>
        <div className="dt-tab-cover">
          <svg className="dt-course-orbit" viewBox="0 0 120 78" aria-hidden="true" focusable="false">
            <circle cx="98" cy="14" r="30" />
            <circle cx="98" cy="14" r="19" strokeDasharray="2.5 4" />
            <circle cx="98" cy="14" r="2.4" fill="currentColor" stroke="none" />
            <circle cx="70" cy="46" r="5" strokeDasharray="2 3" />
          </svg>
          <p className="dt-eyebrow">{text.yourLearning}</p>
          <h2 className="dt-here-course">{overview?.course?.title ?? text.noGoal}</h2>
          {overview?.course != null && <p className="dt-shared">{text.sharedAcrossConversations}</p>}
        </div>

        <p className="dt-eyebrow dt-eyebrow-here">{text.thisConversation}</p>
        {focus === null ? (
          <p className="dt-here-empty">{text.noFocus}</p>
        ) : (
          <p className="dt-here-focus">
            <span className="dt-here-node">{focusNodeTitle ?? focus.nodeId}</span>
            {focusNodeState !== null && (
              <span className={`dt-tab-state dt-state-${focusNodeState}`}>
                {stateLabel(focusNodeState, lang)}
              </span>
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
            {starting ? learning.starting : control.label}
          </button>
        )}
        {control?.kind === 'start' && (
          <p className="dt-caption">{text.startingCaption}</p>
        )}
        {loading && detail === null && <p className="dt-caption">{text.loading}</p>}
        {note !== null && <p className="dt-caption">{note}</p>}
        {error !== null && <p className="dt-empty">{error}</p>}
        <LanguageToggle />
      </header>

      {/* ---- the teaching ---- */}
      {/* Always present, even before it has content: the surface names its three
          regions so a first-time learner can see what will fill them. */}
      <section className="dt-lesson">
        <p className="dt-tab-section">
          {text.learningSurface}
        </p>
        {/* The wait line is for a wait: with the lesson on screen (or nothing
            focused) it would be announcing what the page already shows. */}
        {handoffVisible && handoff !== null && (
          <HandoffLine handoff={handoff} onRetry={() => state.continueTo(handoff.targetNodeId)} />
        )}
        {lesson === null ? (
          <div className="dt-empty-state">
            <EmptyArt kind="lesson" />
            <p className="dt-empty">
              {placeholder === 'preparing'
                ? text.preparing
                : placeholder === 'press-continue'
                  ? text.pressContinue(continuationLabel(nextStep, lang))
                  : text.pressStart}
            </p>
          </div>
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

      {onOpenMapPage ? <button type="button" className="dt-secondary dt-map-shortcut" onClick={onOpenMapPage}>{text.courseRouteAndMap}</button> : <CompactMap
        nodes={rows}
        selectedId={shownId}
        focusNodeId={focus?.nodeId ?? null}
        onSelect={select}
        {...(onOpenMapPage === undefined ? {} : { onOpenMapPage })}
      />}

      {dataNote !== null && <p className="dt-caption">{dataNote}</p>}

      {/* ---- the evidence behind this node ---- */}
      {!onOpenMapPage && detail !== null && detail.node.evidence.length > 0 && (
        <>
          <p className="dt-tab-section">
            {text.evidence} <span>{detail.node.evidence.length}</span>
          </p>
          <ul className="dt-evidence">
            {detail.node.evidence.map((entry, index) => (
              <li key={index}>
                {/* The kind is fixed vocabulary from the runtime; English keeps
                    the stored word, Chinese uses the map's wording. */}
                <span className="dt-ev-kind">
                  {lang === 'zh' ? evidenceKindLabel(entry.kind, lang) : entry.kind}
                </span>
                {entry.readiness !== undefined && (
                  <span className="dt-ev-readiness">{readinessLabel(entry.readiness, lang)}</span>
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
