import { CourseLearning, useCoursePath } from './course-learning.js'
/**
 * The standalone full-page learning panel.
 *
 * NOTE: the plugin no longer registers this as a main panel. The product now
 * has one main page (`Learning map`) and one lesson surface (the docked tab),
 * so the same lesson is not offered in two places. This component is kept as
 * the standalone full-page renderer used by the preview and the tests.
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
import { useLang, type Lang } from './i18n.js'
import { LanguageToggle } from './language-toggle.js'
import { evidenceKindLabel, readinessLabel, stateLabel } from './map-text.js'
import {
  buildMapTree,
  continuationLabel,
  conversationControl,
  flattenTree,
  formatWhen,
  handoffLineVisible,
  isFilledState,
  lessonPlaceholder,
  relationLabel,
  stateExplanation,
} from './model.js'
import { usePanelText } from './panel-text.js'
import type { PanelClient } from './use-learning.js'
import { defaultClient, useLearning } from './use-learning.js'
import { EmptyArt, FeatureRow, NodeLocator, StateBar, StateGlyph } from './visuals.jsx'

export type { PanelClient } from './use-learning.js'

/** A node state as one chip: the mark, and the word. Never a number. */
function StateChip({ state, lang }: { state: string; lang: Lang }): ReactNode {
  return (
    <span className={`dt-tab-state dt-state-${state}`}>
      {stateLabel(state, lang)}
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
  /**
   * Open the diagnosis map as its own page.
   *
   * The map is a reference surface, and the teaching column is for reading a
   * lesson: they are different jobs, so the map gets a page of its own instead
   * of sharing this one. Absent in the preview and in tests.
   */
  onOpenMapPage?: (() => void) | undefined
}

/** The status pill plus its mark. Never a number. */
function StateMark({ state, lang }: { state: string; lang: Lang }): ReactNode {
  return (
    <>
      <span className={`dt-dot dt-state-${state}`} data-filled={isFilledState(state)} />
      <span className={`dt-state dt-state-${state}`}>{stateLabel(state, lang)}</span>
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
  onOpenMapPage,
}: LearningPanelProps): ReactNode {
  const text = usePanelText()
  const lang = useLang()
  const state = useLearning({
    client: client ?? defaultClient,
    sessionId,
    initialOverview,
    onStarted: onFocusStarted,
  })

  const coursePath = useCoursePath((client ?? defaultClient).pathClient, state.overview?.course?.id, sessionId)

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
  const { overview, focus, nextStep, handoff, teachingBrain, dataNote, selectedId, detail, lesson, note, error, starting, loading, library } =
    state

  // The focused node's title and state, read from the map rather than fetched:
  // the panel already holds every node, and the focus is one of them.
  const focusNode = focus === null ? undefined : overview?.nodes?.find((n) => n.id === focus.nodeId)
  const focusNodeTitle = focusNode?.title ?? null
  const focusNodeState = focusNode?.state ?? null
  const rows = flattenTree(buildMapTree(overview?.nodes ?? []))
  const confirmed = (overview?.nodes ?? []).filter((node) => node.state === 'confirmed').length
  // "Already learning this one" is a statement about the tutor's focus, not
  // about what the learner has selected.
  const isFocused = focus !== null && focus.nodeId === selectedId

  /**
   * This conversation's control, its teaching-region state, and whether the
   * handoff line describes a wait that is still real.
   *
   * Derived, not re-decided per surface: the docked tab renders the same three
   * answers from the same three functions, so the two cannot drift into telling
   * a learner to press `Start learning` while a recommendation is pending.
   */
  const control = conversationControl({
    focusNodeId: focus?.nodeId ?? null,
    shownNodeId: selectedId,
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

  // First use, same as the docked tab: a blank three-column page reads as a
  // broken page. One question and the sentence that starts everything.
  // Chosen to start something new: a state, not an empty runtime. It gets its
  // own screen so pressing the control visibly does something — both this and
  // "chosen nothing" have no course, and a surface reading only `course`
  // renders them identically.
  if (overview?.course && coursePath && (coursePath.path.brief || coursePath.run)) {
    return <CourseLearning view={coursePath} title={overview.course.title}
      onOpenMap={onOpenMapPage} onOpenChat={onOpenChat} onExport={state.exportData} onReset={state.resetAll} />
  }

  if (overview?.selection === 'new') {
    return (
      <div className="dt-root-wrap">
        <header className="dt-bar">
          <div className="dt-bar-id">
            <span className="dt-bar-name">{text.startNew}</span>
            <span className="dt-bar-sep" aria-hidden="true">
              ·
            </span>
            <span className="dt-bar-note">{text.startNewNote}</span>
          </div>
          <div className="dt-bar-actions">
            {onOpenChat !== undefined && (
              <button type="button" className="dt-bar-back" onClick={onOpenChat}>
                {text.backToChat}
              </button>
            )}
            <LanguageToggle />
          </div>
        </header>
        <div className="dt-root dt-root-welcome">
          <div className="dt-welcome">
            <EmptyArt kind="welcome" />
            <p className="dt-welcome-eyebrow">{text.startNew}</p>
            <h1 className="dt-welcome-title">{text.startNewTitle}</h1>
            <p className="dt-welcome-body">{text.startNewBody}</p>
            <FeatureRow />
            {library.length > 0 && (
              <>
                <p className="dt-section-title">{text.orContinue}</p>
                <ul className="dt-library">
                  {library.map((project) => (
                    <li key={project.id}>
                      <button type="button" className="dt-project" onClick={() => state.openProject(project.id)}>
                        <span className="dt-project-name">{project.title}</span>
                        <span className="dt-project-count">
                          {text.confirmedOf(project.confirmed, project.total)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {onOpenChat !== undefined && (
              <button type="button" className="dt-primary dt-here-action" onClick={onOpenChat}>
                {text.goToChat}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (overview?.course == null) {
    return (
      <div className="dt-root-wrap">
        <header className="dt-bar">
          <div className="dt-bar-id">
            <span className="dt-bar-name">{text.learning}</span>
            <span className="dt-bar-sep" aria-hidden="true">
              ·
            </span>
            <span className="dt-bar-note">{text.conversationInSidebar}</span>
          </div>
          <div className="dt-bar-actions">
            {onOpenChat !== undefined && (
              <button type="button" className="dt-bar-back" onClick={onOpenChat}>
                {text.backToChat}
              </button>
            )}
            <LanguageToggle />
          </div>
        </header>
        <div className="dt-root dt-root-welcome">
        <div className="dt-welcome">
          <EmptyArt kind="welcome" />
          {/* The library first. A full view with no project open is not an
              empty runtime — the learner's projects are real, and this is
              where they are listed. The welcome copy below only appears when
              there is genuinely nothing yet. */}
          {library.length > 0 && (
            <>
              <p className="dt-welcome-eyebrow">{text.yourLearning}</p>
              <h1 className="dt-welcome-title">{text.yourLearningProjects}</h1>
              <p className="dt-welcome-body">{text.projectsShared}</p>
              <ul className="dt-library">
                {library.map((project) => (
                  <li key={project.id}>
                    <button type="button" className="dt-project" onClick={() => state.openProject(project.id)}>
                      <span className="dt-project-name">{project.title}</span>
                      <span className="dt-project-count">
                        {text.confirmedOf(project.confirmed, project.total)}
                      </span>
                      <span className="dt-project-go">
                        {text.projectGo(project.confirmed)} →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="dt-welcome-eyebrow">{text.product}</p>
          <h1 className="dt-welcome-title">{text.welcomeTitle}</h1>
          <p className="dt-welcome-body">{text.welcomeBody}</p>
          <FeatureRow />
          <div className="dt-welcome-sample">
            <span className="dt-welcome-sample-label">{text.tryLabel}</span>
            <span className="dt-welcome-sample-text">{text.trySample}</span>
          </div>
          <p className="dt-welcome-note">{text.skillNote}</p>
          <p className="dt-welcome-note">{text.dataNote}</p>
          {/* The warning belongs with the copy it qualifies, not under the
              data controls — Export and Delete are about state, not about the
              missing skill. */}
          {teachingBrain === false && (
            <p className="dt-notice">
              <b>{text.warningTitle}</b> {text.warningBody}
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
          <span className="dt-bar-name">{text.learning}</span>
          <span className="dt-bar-sep" aria-hidden="true">
            ·
          </span>
          <span className="dt-bar-note">
            {sessionId === undefined
              ? text.noConversation
              : text.conversationInSidebar}
          </span>
        </div>
        <div className="dt-bar-actions">
          {onOpenMapPage !== undefined && (
            <button type="button" className="dt-bar-back" onClick={onOpenMapPage}>
              {text.learningMap}
            </button>
          )}
          {onOpenChat !== undefined && (
            <button type="button" className="dt-bar-back" onClick={onOpenChat}>
              {/* Named plainly: the fear this button answers is "did I lose my chat?" */}
              {text.backToChat}
            </button>
          )}
          <LanguageToggle />
        </div>
      </header>
      <div className="dt-root">
      {/* ---- course + map ---- */}
      <div className="dt-pane">
        {/* Two layers, because they have two owners. The course and its map
            belong to the learner and every conversation shares them; where
            THIS conversation has got to belongs to this conversation alone.
            One heading over both is what made a brand-new chat look as though
            it had become the learner's old machine-learning session. */}
        <header className="dt-course-card">
          {/* Decorative orbit lines: the header is the map's cover, and an
              empty white rectangle above a list reads as missing content. */}
          <svg className="dt-course-orbit" viewBox="0 0 120 78" aria-hidden="true" focusable="false">
            <circle cx="98" cy="14" r="30" />
            <circle cx="98" cy="14" r="19" strokeDasharray="2.5 4" />
            <circle cx="98" cy="14" r="2.4" fill="currentColor" stroke="none" />
            <circle cx="70" cy="46" r="5" strokeDasharray="2 3" />
          </svg>
          <p className="dt-eyebrow">{text.yourLearning}</p>
          <h1 className="dt-course-title">{overview?.course?.title ?? text.noGoal}</h1>
          {overview?.course != null && (
            <>
              <p className="dt-shared">{text.sharedAcross}</p>
              <p className="dt-goal">
                <b>{text.goalLabel}</b> {overview.course.goal}
              </p>
            </>
          )}
        </header>

        <section className="dt-here-card">
          <p className="dt-eyebrow dt-eyebrow-here">{text.thisConversation}</p>
          {focus === null ? (
            <p className="dt-here-empty">{text.noFocus}</p>
          ) : (
            <p className="dt-here-focus">
              <span className="dt-here-node">{focusNodeTitle ?? focus.nodeId}</span>
              {focusNodeState !== null && (
                <span className={`dt-tab-state dt-state-${focusNodeState}`}>{stateLabel(focusNodeState, lang)}</span>
              )}
            </p>
          )}
          {/* Waking a tutor means naming a conversation, so it lives under THIS
              CONVERSATION, not under the shared course — and it acts on the node
              it describes: the focus when there is one, the selection only before
              anything has started. With a recommendation pending it is not
              rendered at all: the card below owns the move, and two controls for
              one next step is how the page came to ask which one to press. */}
          {control !== null && (
            <button
              type="button"
              className="dt-primary dt-here-action"
              onClick={() => state.continueTo(control.nodeId)}
              disabled={starting || sessionId === undefined}
              {...(sessionId === undefined
                ? { title: text.startNoSessionTitle }
                : {})}
            >
              {starting ? text.starting : control.label}
            </button>
          )}
          {sessionId === undefined && (
            <p className="dt-caption">{text.startNoSessionBody}</p>
          )}
        </section>

        <p className="dt-section-title">
          {text.diagnosisMap} <span>{text.census(rows.length)}</span>
        </p>
        <StateBar nodes={overview?.nodes ?? []} />
        {rows.length === 0 && (
          <>
            <EmptyArt kind="map" />
            <p className="dt-empty">{text.emptyMap}</p>
          </>
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
            <span className={`dt-dot dt-state-${node.state}`} data-filled={isFilledState(node.state)}>
              <StateGlyph state={node.state} />
            </span>
            <span className="dt-node-title">
              {node.title}
              <span className="dt-node-rel">
                {relationLabel(node.relation, lang)} · {text.evidenceCount(node.evidenceCount)}
              </span>
            </span>
            <StateChip state={node.state} lang={lang} />
          </button>
        ))}
        <p className="dt-caption">{text.confirmedByEvidence(confirmed, rows.length)}</p>
      </div>

      {/* ---- node detail ---- */}
      <div className="dt-pane dt-detail">
        {detail === null ? (
          <div className="dt-empty-state">
            <EmptyArt kind="evidence" />
            <p className="dt-empty-title">
              {loading ? text.loadingMap : text.nothingSelected}
            </p>
            <p className="dt-empty">{text.pickNode}</p>
          </div>
        ) : (
          <>
            <div className="dt-detail-hero">
              <span className={`dt-detail-glyph dt-state-${detail.node.state}`} aria-hidden="true">
                <StateGlyph state={detail.node.state} />
              </span>
              <div className="dt-detail-hero-id">
                <p className="dt-eyebrow">{text.selectedNode}</p>
                <h2>{detail.node.title}</h2>
              </div>
            </div>
            <div className="dt-meta">
              <StateMark state={detail.node.state} lang={lang} />
              <span className="dt-chip">{relationLabel(detail.node.relation, lang)}</span>
              {detail.parent !== null && (
                <span className="dt-chip">{text.parent(detail.parent.title)}</span>
              )}
              {detail.children.length > 0 && (
                <span className="dt-chip">{text.children(detail.children.length)}</span>
              )}
            </div>

            <p className="dt-why">{stateExplanation(detail.node.state, lang)}</p>

            <NodeLocator
              parent={
                detail.parent === null
                  ? null
                  : { id: detail.parent.id, title: detail.parent.title, state: detail.parent.state }
              }
              node={{ id: detail.node.id, title: detail.node.title, state: detail.node.state }}
              children={detail.children.map((child) => ({
                id: child.id,
                title: child.title,
                state: child.state,
              }))}
              onSelect={state.select}
              label={text.whereThisSits}
            />

            <p className="dt-section-title">
              {text.evidence} <span>{detail.node.evidence.length}</span>
            </p>
            {detail.node.evidence.length === 0 ? (
              <>
                <EmptyArt kind="evidence" />
                <p className="dt-empty">{text.nothingRecorded}</p>
              </>
            ) : (
              <ul className="dt-evidence">
                {detail.node.evidence.map((entry, index) => (
                  <li key={index}>
                    <span className="dt-ev-kind">{evidenceKindLabel(entry.kind, lang)}</span>
                    {entry.readiness !== undefined && (
                      <span className="dt-ev-readiness">{readinessLabel(entry.readiness, lang)}</span>
                    )}
                    {entry.note !== undefined && <span className="dt-ev-note">{entry.note}</span>}
                    <span className="dt-ev-when">{formatWhen(entry.at, Date.now(), lang)}</span>
                  </li>
                ))}
              </ul>
            )}

            {note !== null && <p className="dt-caption">{note}</p>}
            {error !== null && <p className="dt-empty">{error}</p>}
            {/* Starting belongs to THIS CONVERSATION, so the control lives in
                that block on the left rather than here. Keeping a second one
                next to the teaching would put two primary-weight controls on
                one screen and leave the learner guessing which starts what. */}
            {isFocused && <p className="dt-caption">{text.teachingNode}</p>}
          </>
        )}
      </div>

      {/* ---- learning surface ---- */}
      <div className="dt-pane">
        <div className="dt-lesson-head">
          <p className="dt-eyebrow">{text.learningSurface}</p>
          {lesson !== null && <span className="dt-origin">{text.lessonOrigin(lesson.origin)}</span>}
        </div>
        {lesson === null ? (
          placeholder === 'preparing' ? (
            <div className="dt-empty-state">
              <EmptyArt kind="lesson" />
              <p className="dt-empty">{text.preparing}</p>
              <p className="dt-caption">{text.preparingBody}</p>
            </div>
          ) : (
            <div className="dt-empty-state">
              <EmptyArt kind="lesson" />
              <p className="dt-empty-title">{text.nothingTaught}</p>
              {/* The invitation names the action that actually exists. With a
                  recommendation pending there is no start control to press, and
                  a focused node whose tutor has already handed off is not a turn
                  that is still being written. */}
              <p className="dt-empty">
                {placeholder === 'press-continue' ? (
                  <>
                    {text.pressContinuePrefix}
                    <b>{continuationLabel(nextStep, lang)}</b>
                    {text.pressContinueSuffix}
                  </>
                ) : (
                  <>
                    {text.pressStartPrefix}
                    <b>{text.startLearning}</b>
                    {text.pressStartSuffix}
                  </>
                )}
              </p>
            </div>
          )
        ) : (
          <>
            <h2 className="dt-lesson-title">{lesson.title}</h2>
            <LessonBody blocks={lesson.blocks} />
          </>
        )}
        {/* The wait line is for a wait: with the lesson on screen it would be
            announcing what the page already shows. */}
        {handoffVisible && handoff !== null && (
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
            {text.answerInChat}
          </button>
        )}
        {lesson !== null && (
          <button type="button" className="dt-secondary" onClick={state.dismissLesson}>
            {text.backToNode}
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
