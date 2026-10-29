/**
 * The Learning map page, redesigned as one page with a persistent context rail.
 *
 * Two tabs share one shell: the route (learning path) and the knowledge map.
 * The shell owns the header, tabs and library; the route tab owns its own
 * main/rail split. Nothing here decides anything — every value comes from the
 * same `useLearning` / `PathPage` runtime the other surfaces read.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { DataFooter } from './blocks.jsx'
import { Icon } from './design-icons.jsx'
import type { IconName } from './design-icons.jsx'
import { useDesignText, nodeStateText } from './design-text.js'
import type { DesignText } from './design-text.js'
import { useLang } from './i18n.js'
import { LanguageToggle } from './language-toggle.js'
import { evidenceKindLabel } from './map-text.js'
import { formatWhen, relationLabel, stateExplanation } from './model.js'
import { PathPage } from './path-page.js'
import { ReviewPage } from './review-panel.jsx'
import { InsightsPage } from './insights-panel.jsx'
import type { PathClient } from './path-client.js'
import { defaultPathClient } from './path-client.js'
import type { NodeDetailResponse, NodeView, ProjectCardView } from '../contract.js'
import type { PanelClient } from './use-learning.js'
import type { SessionActivity } from './use-session-activity.js'
import { defaultClient, useLearning } from './use-learning.js'

/** The key the map page registers under in `main`, and its panellist id. */
export const MAP_PANEL_ID = 'diagnostic-tutor-map'

export interface LearningMapPanelProps {
  client?: PanelClient
  initialOverview?: Parameters<typeof useLearning>[0]['initialOverview']
  sessionId?: string | undefined
  onOpenChat?: (() => void) | undefined
  onOpenLesson?: (() => void) | undefined
  onOpenSession?: ((sessionId: string) => boolean) | undefined
  sessionActivity?: SessionActivity | undefined
  pathClient?: PathClient | undefined
}

type MapView = 'curriculum' | 'knowledge' | 'review' | 'insights'

function whenText(iso: string, text: DesignText): string {
  const stamp = Date.parse(iso)
  if (!Number.isFinite(stamp)) return ''
  const days = Math.max(0, Math.floor((Date.now() - stamp) / 86_400_000))
  if (days < 1) return text.whenToday
  if (days < 2) return text.whenYesterday
  if (days < 7) return text.whenDays(days)
  return text.whenWeeks(Math.max(1, Math.floor(days / 7)))
}

function projectIcon(title: string): IconName {
  if (/天文|astro|物理|physics|宇宙|太空/i.test(title)) return 'planet'
  if (/机器学习|machine|math|数学|算法|数据|data|经济|金融|code|编程/i.test(title)) return 'graph'
  return 'book'
}

function statusOf(project: ProjectCardView): 'accepted' | 'active' | 'legacy' {
  if (project.status !== undefined) return project.status
  return project.confirmed > 0 ? 'active' : 'legacy'
}

function StatusPill({ status, text }: { status: 'accepted' | 'active' | 'legacy'; text: DesignText }): ReactNode {
  const label = status === 'accepted' ? text.statusAccepted : status === 'active' ? text.statusActive : text.statusLegacy
  return (
    <span className="dtx-pill" data-tone={status === 'accepted' ? 'green' : status === 'active' ? 'blue' : 'gray'}>
      {status === 'accepted' ? <Icon name="check" size={13} /> : status === 'legacy' ? <Icon name="clock" size={13} /> : <Icon name="route" size={13} />}
      {label}
    </span>
  )
}

function LibraryPage({ library, onOpenChat, onOpen, error }: {
  library: ProjectCardView[]
  onOpenChat?: (() => void) | undefined
  onOpen: (id: string) => void
  error: string | null
}): ReactNode {
  const text = useDesignText()
  if (error !== null) return <div className="dtx-empty-page"><p className="dtx-alert">{error}</p></div>
  if (library.length === 0) {
    return <div className="dtx-empty-page">
      <div className="dtx-empty-icon"><Icon name="book" size={38} /></div>
      <h1 className="dtx-empty-title">{text.libraryEmptyTitle}</h1>
      <p className="dtx-empty-body">{text.libraryEmptyBody}</p>
      {onOpenChat !== undefined && <button type="button" className="dtx-primary" onClick={onOpenChat}>{text.backToChat}</button>}
    </div>
  }
  return (
    <>
      <section className="dtx-card dtx-hero">
        <p className="dtx-eyebrow">{text.libraryEyebrow}</p>
        <h1>{text.libraryTitle}</h1>
        <p>{text.libraryBody}</p>
        <div className="dtx-hero-row">
          <div className="dtx-hero-prompt">
            <span className="dtx-hero-prompt-icon"><Icon name="chat" size={18} /></span>
            <span>
              <span className="dtx-hero-prompt-title">{text.libraryPromptTitle}</span>
              <span className="dtx-hero-prompt-sub">{text.libraryPromptExample}</span>
            </span>
          </div>
          {onOpenChat !== undefined && <button type="button" className="dtx-primary" onClick={onOpenChat}>{text.backToChat}</button>}
        </div>
      </section>
      <div className="dtx-section-head"><h2>{text.librarySection}</h2></div>
      <div className="dtx-project-list">
        {library.map((project) => {
          const status = statusOf(project)
          return (
            <button key={project.id} type="button" className="dtx-project-row" onClick={() => onOpen(project.id)}>
              <span className="dtx-project-icon" data-kind={projectIcon(project.title)}><Icon name={projectIcon(project.title)} size={28} /></span>
              <span className="dtx-project-main">
                <span className="dtx-project-title">{project.title}</span>
                <span className="dtx-project-meta">{text.lastStudied(whenText(project.updatedAt, text))}</span>
              </span>
              <span className="dtx-project-status"><StatusPill status={status} text={text} /></span>
              <span className="dtx-project-action">{text.continueLearning}<Icon name="chevron-right" size={16} /></span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function statePillTone(state: string): 'green' | 'blue' | 'gray' | 'amber' {
  if (state === 'confirmed' || state === 'checked' || state === 'practiced') return 'green'
  if (state === 'explained') return 'blue'
  if (state === 'weak' || state === 'blocked') return 'amber'
  return 'gray'
}

function NodeIcon({ state }: { state: string }): ReactNode {
  if (state === 'confirmed' || state === 'checked' || state === 'practiced') return <span className="dtx-node-icon" data-state={state}><Icon name="check" size={13} /></span>
  if (state === 'weak' || state === 'blocked') return <span className="dtx-node-icon" data-state={state}><Icon name="warning" size={13} /></span>
  if (state === 'explained') return <span className="dtx-node-icon" data-state={state}><span style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }} /></span>
  return <span className="dtx-node-icon" data-state={state} />
}

function KnowledgeDetail({ detail, loading, error, text, lang }: {
  detail: NodeDetailResponse | null
  loading: boolean
  error: string | null
  text: DesignText
  lang: 'en' | 'zh'
}): ReactNode {
  if (detail === null) {
    return <div className="dtx-knowledge-empty">
      <div className="dtx-rail-empty-icon"><Icon name="layers" size={28} /></div>
      {error !== null ? <p>{error}</p> : <p>{loading ? text.loading : text.selectNode}</p>}
    </div>
  }
  const node = detail.node
  const prereq = detail.parent !== null && (node.relation === 'prerequisite' || node.relation === 'part-of') ? [detail.parent] : []
  return (
    <>
      <div className="dtx-detail-head">
        <h2>{node.title}</h2>
        <span className="dtx-pill" data-tone={statePillTone(node.state)}>{nodeStateText(node.state, text)}</span>
      </div>
      <p className="dtx-detail-desc">{stateExplanation(node.state, lang)}</p>
      <div className="dtx-detail-section">
        <h3>{text.relatedPosition}</h3>
        <div className="dtx-breadcrumb">
          <Icon name="layers" size={15} />
          {detail.parent !== null && <><span>{detail.parent.title}</span><span>›</span></>}
          <b>{node.title}</b>
        </div>
      </div>
      {prereq.length > 0 && <div className="dtx-detail-section">
        <h3>{text.prerequisiteKnowledge}</h3>
        <div className="dtx-chips">
          {prereq.map((entry) => <span key={entry.id} className="dtx-chip" data-state={entry.state === 'confirmed' ? 'confirmed' : undefined}>
            <NodeIcon state={entry.state} />{entry.title}
          </span>)}
        </div>
      </div>}
      <div className="dtx-detail-section">
        <h3>{text.evidenceTitle(node.evidence.length)}</h3>
        {node.evidence.length === 0 && <p className="dtx-muted dtx-small">{text.noEvidence}</p>}
        <div className="dtx-evidence">
          {[...node.evidence].reverse().map((entry, index) => (
            <div className="dtx-evidence-card" key={index}>
              <span className="dtx-evidence-icon"><Icon name={entry.kind === 'practice' || entry.kind === 'check' ? 'book' : 'chat'} size={17} /></span>
              <span className="dtx-evidence-main">
                <span className="dtx-evidence-title">{evidenceKindLabel(entry.kind, lang)}</span>
                {entry.note !== undefined && entry.note !== '' && <span className="dtx-evidence-note">{entry.note}</span>}
              </span>
              <span className="dtx-evidence-side">
                <span className="dtx-pill" data-tone={statePillTone(node.state)}>{nodeStateText(node.state, text)}</span>
                <span className="dtx-evidence-when">{formatWhen(entry.at, Date.now(), lang)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="dtx-info-box">
        <span className="dtx-info-icon"><Icon name="info" size={17} /></span>
        <span><span className="dtx-info-title">{text.evidenceInfoTitle}</span><span className="dtx-info-body">{text.evidenceInfoBody}</span></span>
      </div>
    </>
  )
}

function KnowledgePage({ nodes, selectedId, detail, loading, error, onSelect }: {
  nodes: NodeView[]
  selectedId: string | null
  detail: NodeDetailResponse | null
  loading: boolean
  error: string | null
  onSelect: (id: string) => void
}): ReactNode {
  const text = useDesignText()
  const lang = useLang()
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle === '' ? nodes : nodes.filter((node) => node.title.toLowerCase().includes(needle))
  }, [nodes, query])
  return (
    <div className="dtx-content">
      <div className="dtx-knowledge">
        <section className="dtx-card dtx-knowledge-list">
          <header className="dtx-knowledge-head">
            <h2>{text.knowledgeTitle(nodes.length)}</h2>
            <label className="dtx-search">
              <Icon name="search" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchKnowledge} aria-label={text.searchKnowledge} />
            </label>
          </header>
          <div className="dtx-node-list">
            {filtered.length === 0 && <p className="dtx-muted dtx-small" style={{ padding: '16px 18px' }}>{text.noNodesYet}</p>}
            {filtered.map((node) => (
              <button key={node.id} type="button" className="dtx-node-row" aria-current={node.id === selectedId || undefined} onClick={() => onSelect(node.id)}>
                <NodeIcon state={node.state} />
                <span className="dtx-node-main">
                  <span className="dtx-node-title">{node.title}</span>
                  <span className="dtx-node-sub">{relationLabel(node.relation, lang)} · {node.evidenceCount}</span>
                </span>
                <span className="dtx-pill" data-tone={statePillTone(node.state)}>{nodeStateText(node.state, text)}</span>
                <span className="dtx-node-chevron"><Icon name="chevron-right" size={16} /></span>
              </button>
            ))}
          </div>
        </section>
        <section className="dtx-card dtx-knowledge-detail">
          <KnowledgeDetail detail={detail} loading={loading} error={error} text={text} lang={lang} />
        </section>
      </div>
    </div>
  )
}

/**
 * The map page shell.
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
  const text = useDesignText()
  const [page, setPage] = useState<MapView>('curriculum')
  const state = useLearning({ client: client ?? defaultClient, sessionId, initialOverview, onOpenSession })
  const { overview, focus, detail, selectedId, note, error, loading, library } = state
  const reviewClient = pathClient ?? defaultClient.pathClient ?? defaultPathClient

  const arrival = selectedId
  const select = state.select
  useEffect(() => {
    if (arrival !== null) return
    const first = overview?.nodes?.[0]?.id
    if (first !== undefined) select(focus?.nodeId ?? first)
  }, [arrival, select, overview, focus])

  const enterCurrentLesson = (): void => {
    const courseId = overview?.course?.id
    const resolve = (client ?? defaultClient).resolveProjectSession
    if (courseId !== undefined && sessionId !== undefined && resolve !== undefined && onOpenSession !== undefined) {
      void (async () => {
        try {
          const resolved = await resolve(courseId, sessionId)
          if (resolved.sessionId !== null && resolved.sessionId !== sessionId && onOpenSession(resolved.sessionId)) return
        } catch { /* stay here */ }
        onOpenLesson?.()
      })()
      return
    }
    onOpenLesson?.()
  }

  if (overview?.course == null) {
    return (
      <div className="dtx-map">
        <header className="dtx-topbar">
          <div className="dtx-topbar-title"><span className="dtx-topbar-page">{text.pageTitle}</span></div>
          <div className="dtx-topbar-actions"><LanguageToggle /></div>
        </header>
        <div className="dtx-scroll">
          <div className="dtx-content">
            <LibraryPage library={library} onOpenChat={onOpenChat} onOpen={(id) => void state.enterProject(id)} error={error} />
            <footer className="dtx-small dtx-muted" style={{ marginTop: 28 }}><DataFooter onExport={state.exportData} onReset={state.resetAll} /></footer>
          </div>
        </div>
      </div>
    )
  }

  const nodes = overview.nodes ?? []
  return (
    <div className="dtx-map">
      <header className="dtx-topbar">
        <div className="dtx-topbar-title">
          <span className="dtx-topbar-page">{text.pageTitle}</span>
          <span className="dtx-topbar-divider" aria-hidden="true" />
          <span className="dtx-topbar-project">{overview.course.title}</span>
        </div>
        <div className="dtx-topbar-actions">
          {onOpenChat !== undefined && <button type="button" className="dtx-back" onClick={onOpenChat}><Icon name="arrow-left" size={16} /><span>{text.backToChat}</span></button>}
          <LanguageToggle />
        </div>
      </header>
      <nav className="dtx-tabs" aria-label={text.pageTitle}>
        <button type="button" className="dtx-tabbtn" aria-current={page === 'curriculum' ? 'page' : undefined} onClick={() => setPage('curriculum')}>{text.tabRoute}</button>
        <button type="button" className="dtx-tabbtn" aria-current={page === 'knowledge' ? 'page' : undefined} onClick={() => setPage('knowledge')}>{text.tabKnowledge}</button>
        <button type="button" className="dtx-tabbtn" aria-current={page === 'review' ? 'page' : undefined} onClick={() => setPage('review')}>{text.tabReview}</button>
        <button type="button" className="dtx-tabbtn" aria-current={page === 'insights' ? 'page' : undefined} onClick={() => setPage('insights')}>{text.tabInsights}</button>
      </nav>
      <div className="dtx-scroll">
        {page === 'curriculum'
          ? <PathPage courseId={overview.course.id} title={overview.course.title} nodes={nodes}
              sessionId={sessionId} client={pathClient} onOpenChat={onOpenChat} tasks={overview.tasks ?? []}
              onStarted={enterCurrentLesson} onOpenLesson={onOpenLesson === undefined ? undefined : enterCurrentLesson}
              onOpenEvidence={() => setPage('knowledge')}
              {...(sessionActivity === undefined ? {} : { sessionActivity })} />
          : page === 'knowledge'
            ? <KnowledgePage nodes={nodes} selectedId={selectedId} detail={detail} loading={loading} error={error} onSelect={select} />
            : page === 'review'
              ? <ReviewPage client={reviewClient} onOpenRoute={() => setPage('curriculum')} />
              : <InsightsPage client={reviewClient} courseId={overview.course.id} onOpenRoute={() => setPage('curriculum')} onOpenReview={() => setPage('review')} />}
        {page === 'curriculum' && <div className="dtx-content" style={{ paddingTop: 0 }}><footer className="dtx-small dtx-muted"><DataFooter onExport={state.exportData} onReset={state.resetAll} /></footer></div>}
      </div>
    </div>
  )
}
