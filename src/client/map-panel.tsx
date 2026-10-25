/**
 * The Learning map page: the plugin's only main-column page.
 *
 * It answers two questions in one place — "what is my route" (course route tab)
 * and "what do I actually know" (knowledge & evidence tab). The lesson itself
 * lives in the docked tab beside the conversation, so this page never doubles
 * as a second teaching surface.
 *
 * Nothing here decides anything; every view reads the same `useLearning` state
 * the docked tab reads (`pathClient` supplies the planning view for the route
 * tab).
 */

import { useEffect, useState, type ReactNode } from 'react'

import { DataFooter } from './blocks.jsx'
import { useLang } from './i18n.js'
import { LanguageToggle } from './language-toggle.js'
import { evidenceKindLabel, readinessLabel, stateLabel, useMapText } from './map-text.js'
import { PathPage } from './path-page.js'
import type { PathClient } from './path-client.js'
import type { NodeDetailResponse, NodeView } from '../contract.js'
import { buildMapTree, flattenTree, formatWhen, relationLabel, stateExplanation } from './model.js'
import type { PanelClient } from './use-learning.js'
import type { SessionActivity } from './use-session-activity.js'
import { defaultClient, useLearning } from './use-learning.js'
import { EmptyArt, NodeLocator, StateBar, StateGlyph } from './visuals.jsx'

/** The key the map page registers under in `main`, and its panellist id. */
export const MAP_PANEL_ID = 'diagnostic-tutor-map'

export interface LearningMapPanelProps {
  /** Defaults to the real HTTP client. */
  client?: PanelClient
  /** Pre-supplied overview, so the preview and tests skip the first fetch. */
  initialOverview?: Parameters<typeof useLearning>[0]['initialOverview']
  /** The session the tutor should be woken in, when the host half knows one. */
  sessionId?: string | undefined
  /** Show the conversation again. */
  onOpenChat?: (() => void) | undefined
  /** Return to the conversation with the current-lesson tab open. */
  onOpenLesson?: (() => void) | undefined
  /** Switch to the conversation a project's learning belongs to; false when the shell cannot navigate. */
  onOpenSession?: ((sessionId: string) => boolean) | undefined
  /** Live turn state of the conversation this page is showing, when observable. */
  sessionActivity?: SessionActivity | undefined
  pathClient?: PathClient | undefined
}

/**
 * One row of the map. Kept local rather than shared with the docked tab: the
 * two have different widths and different amounts of room for the relation
 * line, and neither is a copy of the other's information.
 */
function MapRows({
  nodes,
  selectedId,
  focusNodeId,
  onSelect,
}: {
  nodes: readonly NodeView[]
  selectedId: string | null
  focusNodeId: string | null
  onSelect: (id: string) => void
}): ReactNode {
  const text = useMapText()
  const lang = useLang()
  const rows = flattenTree(buildMapTree([...nodes]))
  if (rows.length === 0) {
    return (
      <>
        <EmptyArt kind="map" />
        <p className="dt-empty">{text.emptyMap}</p>
      </>
    )
  }
  return (
    <div className="dt-map-list" role="list">
      {rows.map(({ node, depth }) => (
        <button
          key={node.id}
          type="button"
          role="listitem"
          className="dt-node dt-map-row"
          style={{ paddingLeft: `${10 + depth * 16}px` }}
          data-depth={depth > 0 ? Math.min(depth, 4) : undefined}
          data-attention={node.state === 'blocked' || node.state === 'weak' ? 'true' : undefined}
          aria-current={node.id === selectedId}
          data-focused={node.id === focusNodeId ? 'true' : undefined}
          onClick={() => onSelect(node.id)}
        >
          <span className={`dt-dot dt-state-${node.state}`}>
            <StateGlyph state={node.state} />
          </span>
          <span className="dt-node-title">
            {node.title}
            <span className="dt-node-rel">
              {relationLabel(node.relation, lang)} · {text.evidenceCount(node.evidenceCount)}
            </span>
          </span>
          <span className={`dt-tab-state dt-state-${node.state}`}>{stateLabel(node.state, lang)}</span>
        </button>
      ))}
    </div>
  )
}

/** The selected node's record, without the teaching column beside it. */
function MapDetail({
  detail,
  loading,
  note,
  error,
  isFocused,
  onSelect,
}: {
  detail: NodeDetailResponse | null
  loading: boolean
  note: string | null
  error: string | null
  isFocused: boolean
  onSelect: (id: string) => void
}): ReactNode {
  const text = useMapText()
  const lang = useLang()
  if (detail === null) {
    return (
      <div className="dt-empty-state">
        <EmptyArt kind="evidence" />
        <p className="dt-empty-title">{loading ? text.loadingMap : text.nothingSelected}</p>
        <p className="dt-empty">{text.pickNode}</p>
      </div>
    )
  }
  return (
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
        <span className={`dt-tab-state dt-state-${detail.node.state}`}>
          {stateLabel(detail.node.state, lang)}
        </span>
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
        onSelect={onSelect}
        label={text.whereThisSits}
      />

      <p className="dt-section-title">{text.evidence(detail.node.evidence.length)}</p>
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
      {isFocused && <p className="dt-caption">{text.teachingNode}</p>}
    </>
  )
}

/**
 * The map page.
 *
 * @param props - injectable client, pre-supplied overview, session id and the
 *   two navigation actions the panel owns.
 * @returns the map's own main-column page.
 */
export function LearningMapPanel({
  client,
  initialOverview,
  sessionId,
  onOpenChat,
  onOpenLesson,
  onOpenSession,
  sessionActivity,
  pathClient,
}: LearningMapPanelProps): ReactNode {
  const text = useMapText()
  const lang = useLang()
  const [page, setPage] = useState<'curriculum' | 'knowledge'>('curriculum')
  const state = useLearning({ client: client ?? defaultClient, sessionId, initialOverview, onOpenSession })
  const { overview, focus, detail, selectedId, note, error, loading, library } = state

  // Pick something on arrival, so the right column is a record rather than an
  // empty placeholder. Same rule as the other surfaces: the focused node first.
  const arrival = selectedId
  const select = state.select
  useEffect(() => {
    if (arrival !== null) return
    const first = overview?.nodes?.[0]?.id
    if (first !== undefined) select(focus?.nodeId ?? first)
  }, [arrival, select, overview, focus])

  /**
   * Enter the project's current lesson.
   *
   * If the project's lesson was started in another conversation, switch there
   * instead of opening an empty current-lesson tab here. The stored session is
   * resolved read-only; falling back to this conversation is the old behaviour.
   */
  const enterCurrentLesson = (): void => {
    const courseId = overview?.course?.id
    const resolve = (client ?? defaultClient).resolveProjectSession
    if (courseId !== undefined && sessionId !== undefined && resolve !== undefined && onOpenSession !== undefined) {
      void (async () => {
        try {
          const resolved = await resolve(courseId, sessionId)
          if (resolved.sessionId !== null && resolved.sessionId !== sessionId && onOpenSession(resolved.sessionId)) return
        } catch {
          // Unresolvable (or an older host): stay in this conversation.
        }
        onOpenLesson?.()
      })()
      return
    }
    onOpenLesson?.()
  }

  if (overview?.course == null) {
    return (
      <div className="dt-root-wrap">
        <header className="dt-bar">
          <div className="dt-bar-id">
            <span className="dt-bar-name">{text.pageTitle}</span>
            <span className="dt-bar-sep" aria-hidden="true">
              ·
            </span>
            <span className="dt-bar-note">{text.noProject}</span>
          </div>
          <div className="dt-bar-actions">
            <LanguageToggle />
          </div>
        </header>
        <div className="dt-root dt-root-welcome">
          <div className="dt-welcome">
            <EmptyArt kind="welcome" />
            <p className="dt-welcome-eyebrow">{text.pageTitle}</p>
            <h1 className="dt-welcome-title">{text.welcomeTitle}</h1>
            <p className="dt-welcome-body">{text.welcomeBody}</p>
            {library.length > 0 && (
              <>
                <p className="dt-section-title">{text.orOpenProject}</p>
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

  const nodes = overview.nodes ?? []
  const rows = flattenTree(buildMapTree([...nodes]))
  const focusNode = focus === null ? undefined : nodes.find((node) => node.id === focus.nodeId)
  const confirmed = nodes.filter((node) => node.state === 'confirmed').length

  return (
    <div className="dt-root-wrap dt-map-root-wrap">
      <header className="dt-bar">
        <div className="dt-bar-id">
          <span className="dt-bar-name">{text.pageTitle}</span>
          <span className="dt-bar-sep" aria-hidden="true">
            ·
          </span>
          <span className="dt-bar-note">{overview.course.title}</span>
        </div>
        <div className="dt-bar-actions">
          {onOpenLesson !== undefined && (
            <button type="button" className="dt-bar-back" onClick={enterCurrentLesson}>
              {text.openLesson}
            </button>
          )}
          {onOpenChat !== undefined && (
            <button type="button" className="dt-bar-back" onClick={onOpenChat}>
              {text.backToChat}
            </button>
          )}
          <LanguageToggle />
        </div>
      </header>
      <nav className="dt-path-tabs" aria-label={text.mapViews}>
        <button type="button" aria-current={page === 'curriculum' ? 'page' : undefined} onClick={() => setPage('curriculum')}>{text.courseRoute}</button>
        <button type="button" aria-current={page === 'knowledge' ? 'page' : undefined} onClick={() => setPage('knowledge')}>{text.knowledgeEvidence}</button>
      </nav>
      {page === 'curriculum' ? (
        <PathPage courseId={overview.course.id} title={overview.course.title} nodes={nodes}
          sessionId={sessionId} client={pathClient} onOpenChat={onOpenChat}
          onStarted={onOpenLesson ?? onOpenChat} onOpenLesson={onOpenLesson}
          {...(sessionActivity === undefined ? {} : { sessionActivity })} />
      ) : <div className="dt-map-root">
        <section className="dt-map-pane">
          <header className="dt-course-card dt-map-cover">
            <p className="dt-eyebrow">{text.diagnosisMap}</p>
            <h1 className="dt-course-title">{overview.course.title}</h1>
            <p className="dt-shared">{text.sharedAcrossConversations}</p>
            <p className="dt-goal">
              <b>{text.goalLabel}</b> {overview.course.goal}
            </p>
          </header>

          <p className="dt-eyebrow dt-eyebrow-here">{text.thisConversation}</p>
          {focus === null ? (
            <p className="dt-here-empty">{text.noFocus}</p>
          ) : (
            <p className="dt-here-focus">
              <span className="dt-here-node">{focusNode?.title ?? focus.nodeId}</span>
              {focusNode !== undefined && (
                <span className={`dt-tab-state dt-state-${focusNode.state}`}>
                  {stateLabel(focusNode.state, lang)}
                </span>
              )}
            </p>
          )}

          <p className="dt-section-title">
            {text.census(rows.length)} <span>{text.confirmedByEvidence(confirmed)}</span>
          </p>
          <StateBar nodes={nodes} />
          <MapRows
            nodes={nodes}
            selectedId={selectedId}
            focusNodeId={focus?.nodeId ?? null}
            onSelect={select}
          />
          <p className="dt-caption">{text.mapGrowth}</p>
        </section>

        <aside className="dt-map-detail dt-pane">
          <MapDetail
            detail={detail}
            loading={loading}
            note={note}
            error={error}
            isFocused={focus !== null && focus.nodeId === selectedId}
            onSelect={select}
          />
        </aside>
      </div>}
      <footer className="dt-foot">
        <DataFooter onExport={state.exportData} onReset={state.resetAll} />
      </footer>
    </div>
  )
}
