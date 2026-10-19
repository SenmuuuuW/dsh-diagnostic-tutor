/**
 * The diagnosis map's own page.
 *
 * The learning surface and the map answer different questions — "what am I
 * being taught" and "what do I actually know" — and a docked column that
 * carries both makes the map read as a footnote under the lesson. This page
 * gives the map the whole main column: the tree on the left, the selected
 * node's evidence on the right, and the same state census the docked tab uses.
 *
 * It is a *second* main panel, not a replacement for the Learning panel:
 * `Learning` stays the teaching view, `Learning map` is the reference view.
 * Neither decides anything; both read the same `useLearning` state.
 */

import { useEffect, useState, type ReactNode } from 'react'

import { DataFooter } from './blocks.jsx'
import { PathPage } from './path-page.js'
import type { PathClient } from './path-client.js'
import type { NodeDetailResponse, NodeView } from '../contract.js'
import { buildMapTree, flattenTree, formatWhen, relationLabel, stateExplanation } from './model.js'
import type { PanelClient } from './use-learning.js'
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
  /** Switch to the teaching panel in the main column. */
  onOpenLearning?: (() => void) | undefined
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
  const rows = flattenTree(buildMapTree([...nodes]))
  if (rows.length === 0) {
    return (
      <>
        <EmptyArt kind="map" />
        <p className="dt-empty">Nothing on the map yet. State a goal in the chat.</p>
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
              {relationLabel(node.relation)} · {node.evidenceCount} evidence
            </span>
          </span>
          <span className={`dt-tab-state dt-state-${node.state}`}>{node.state}</span>
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
  if (detail === null) {
    return (
      <div className="dt-empty-state">
        <EmptyArt kind="evidence" />
        <p className="dt-empty-title">{loading ? 'Loading your map…' : 'Nothing selected'}</p>
        <p className="dt-empty">
          Pick a node on the left and this column shows what is recorded against it, and why it is
          in that state.
        </p>
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
          <p className="dt-eyebrow">Selected node</p>
          <h2>{detail.node.title}</h2>
        </div>
      </div>
      <div className="dt-meta">
        <span className={`dt-tab-state dt-state-${detail.node.state}`}>{detail.node.state}</span>
        <span className="dt-chip">{relationLabel(detail.node.relation)}</span>
        {detail.parent !== null && <span className="dt-chip">parent: {detail.parent.title}</span>}
        {detail.children.length > 0 && (
          <span className="dt-chip">{detail.children.length} children</span>
        )}
      </div>

      <p className="dt-why">{stateExplanation(detail.node.state)}</p>

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
      />

      <p className="dt-section-title">
        Evidence <span>{detail.node.evidence.length}</span>
      </p>
      {detail.node.evidence.length === 0 ? (
        <>
          <EmptyArt kind="evidence" />
          <p className="dt-empty">Nothing recorded yet.</p>
        </>
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
      {isFocused && <p className="dt-caption">This is the node the tutor is teaching.</p>}
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
  onOpenLearning,
  pathClient,
}: LearningMapPanelProps): ReactNode {
  const [page, setPage] = useState<'curriculum' | 'knowledge'>('curriculum')
  const state = useLearning({ client: client ?? defaultClient, sessionId, initialOverview })
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

  if (overview?.course == null) {
    return (
      <div className="dt-root-wrap">
        <header className="dt-bar">
          <div className="dt-bar-id">
            <span className="dt-bar-name">Learning map</span>
            <span className="dt-bar-sep" aria-hidden="true">
              ·
            </span>
            <span className="dt-bar-note">no project open</span>
          </div>
          {onOpenLearning !== undefined && (
            <button type="button" className="dt-bar-back" onClick={onOpenLearning}>
              Open learning view
            </button>
          )}
        </header>
        <div className="dt-root dt-root-welcome">
          <div className="dt-welcome">
            <EmptyArt kind="welcome" />
            <p className="dt-welcome-eyebrow">Learning map</p>
            <h1 className="dt-welcome-title">Nothing to map yet.</h1>
            <p className="dt-welcome-body">
              State a goal in the chat and the tutor will grow the diagnosis map here, one
              diagnosed node at a time.
            </p>
            {library.length > 0 && (
              <>
                <p className="dt-section-title">Or open a project</p>
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
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {onOpenChat !== undefined && (
              <button type="button" className="dt-primary dt-here-action" onClick={onOpenChat}>
                Go to the chat
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
          <span className="dt-bar-name">Learning map</span>
          <span className="dt-bar-sep" aria-hidden="true">
            ·
          </span>
          <span className="dt-bar-note">{overview.course.title}</span>
        </div>
        <div className="dt-bar-actions">
          {onOpenLearning !== undefined && (
            <button type="button" className="dt-bar-back" onClick={onOpenLearning}>
              Open learning view
            </button>
          )}
          {onOpenChat !== undefined && (
            <button type="button" className="dt-bar-back" onClick={onOpenChat}>
              Back to the conversation
            </button>
          )}
        </div>
      </header>
      <nav className="dt-path-tabs" aria-label="Learning map views">
        <button type="button" aria-current={page === 'curriculum' ? 'page' : undefined} onClick={() => setPage('curriculum')}>Course route</button>
        <button type="button" aria-current={page === 'knowledge' ? 'page' : undefined} onClick={() => setPage('knowledge')}>Knowledge &amp; evidence</button>
      </nav>
      {page === 'curriculum' ? (
        <PathPage courseId={overview.course.id} title={overview.course.title} nodes={nodes}
          sessionId={sessionId} client={pathClient} onOpenChat={onOpenChat} onStarted={onOpenChat} />
      ) : <div className="dt-map-root">
        <section className="dt-map-pane">
          <header className="dt-course-card dt-map-cover">
            <p className="dt-eyebrow">Diagnosis map</p>
            <h1 className="dt-course-title">{overview.course.title}</h1>
            <p className="dt-shared">Shared across conversations</p>
            <p className="dt-goal">
              <b>Goal:</b> {overview.course.goal}
            </p>
          </header>

          <p className="dt-eyebrow dt-eyebrow-here">This conversation</p>
          {focus === null ? (
            <p className="dt-here-empty">
              No focus yet. Pick a node below to start learning here.
            </p>
          ) : (
            <p className="dt-here-focus">
              <span className="dt-here-node">{focusNode?.title ?? focus.nodeId}</span>
              {focusNode !== undefined && (
                <span className={`dt-tab-state dt-state-${focusNode.state}`}>{focusNode.state}</span>
              )}
            </p>
          )}

          <p className="dt-section-title">
            {rows.length} nodes <span>{confirmed} confirmed by evidence</span>
          </p>
          <StateBar nodes={nodes} />
          <MapRows
            nodes={nodes}
            selectedId={selectedId}
            focusNodeId={focus?.nodeId ?? null}
            onSelect={select}
          />
          <p className="dt-caption">
            The map grows only as diagnosis reveals something. A node moves off its born state
            because evidence was recorded, never because it was listed.
          </p>
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
