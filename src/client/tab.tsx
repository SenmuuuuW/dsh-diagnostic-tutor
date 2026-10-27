/**
 * The docked Current lesson tab.
 *
 * One lesson, beside the chat: the teaching material the tutor wrote for the
 * active attempt, the session's progress, and the green "answer in the chat"
 * card. The planning map lives in the Learning map page; this surface stays
 * narrow and only renders the lesson itself.
 */

import { useMemo, type ReactNode } from 'react'

import type { CourseAttempt, Curriculum, CurriculumItem } from '../path.js'
import { LessonBody } from './blocks.jsx'
import { Icon } from './design-icons.jsx'
import { useDesignText } from './design-text.js'
import { LanguageToggle } from './language-toggle.js'
import { useLang } from './i18n.js'
import { useCoursePath } from './course-learning.js'
import type { PanelClient } from './use-learning.js'
import { defaultClient, useLearning } from './use-learning.js'
import { useCurrentSessionId } from './use-session.js'
import type { OverviewResponse } from '../contract.js'

/** The tab chip's text. */
export function LearningTabTitle(): ReactNode {
  return useDesignText().tabTitle
}

export interface LearningTabProps {
  client?: PanelClient
  sessionId?: string | undefined
  uiSession?: unknown
  initialOverview?: OverviewResponse | undefined
  onOpenMapPage?: (() => void) | undefined
  onOpenSession?: ((sessionId: string) => boolean) | undefined
}

function duration(value: number, lang: 'en' | 'zh'): string {
  if (value < 120) return lang === 'zh' ? `${value} 分钟` : `${value} min`
  return lang === 'zh' ? `${Number((value / 60).toFixed(1))} 小时` : `${Number((value / 60).toFixed(1))} h`
}
function codeFor(plan: Curriculum, item: CurriculumItem): string {
  const moduleIndex = plan.modules.findIndex((module) => module.id === item.moduleId)
  const within = plan.items.filter((entry) => entry.moduleId === item.moduleId).findIndex((entry) => entry.id === item.id)
  return `${moduleIndex + 1}.${within + 1}`
}
function attemptFor(attempts: readonly CourseAttempt[], activeId: string | null): CourseAttempt | undefined {
  return attempts.find((attempt) => attempt.id === activeId)
}

function EmptyTab({ title, body, action }: { title: string; body: string; action?: { label: string; run: () => void } | undefined }): ReactNode {
  return (
    <div className="dtx-tab">
      <div className="dtx-tab-inner dtx-tab-empty">
        <span className="dtx-tab-empty-icon"><Icon name="book" size={32} /></span>
        <h2>{title}</h2>
        <p>{body}</p>
        {action !== undefined && <button type="button" className="dtx-primary" onClick={action.run}>{action.label}</button>}
        <div style={{ marginTop: 18 }}><LanguageToggle /></div>
      </div>
    </div>
  )
}

/**
 * The docked learning surface.
 */
export function LearningTab({
  client,
  sessionId,
  uiSession,
  initialOverview,
  onOpenMapPage,
  onOpenSession,
}: LearningTabProps): ReactNode {
  const text = useDesignText()
  const lang = useLang()
  const liveSession = useCurrentSessionId(uiSession)
  const activeSession = uiSession === undefined ? sessionId : liveSession
  const learning = useLearning({ client: client ?? defaultClient, sessionId: activeSession, initialOverview, onOpenSession })
  const courseId = learning.overview?.course?.id
  const view = useCoursePath((client ?? defaultClient).pathClient, courseId, activeSession)
  const attempt = useMemo(() => {
    const active = view?.run?.attempts.find((entry) => entry.id === view.run?.activeAttemptId)
    return active ?? attemptFor(view?.run?.attempts ?? [], view?.run?.activeAttemptId ?? null)
  }, [view])
  const route = useMemo(() => {
    if (view === null) return null
    const version = attempt?.version ?? view.path.acceptedVersion
    return view.path.curricula.find((entry) => entry.version === version) ?? null
  }, [view, attempt])
  const item = route?.items.find((entry) => entry.id === attempt?.itemId) ?? null
  const module = route?.modules.find((entry) => entry.id === item?.moduleId) ?? null
  const units = useMemo(() => {
    const latest = new Map<string, NonNullable<typeof attempt>['units'][number]>()
    for (const unit of attempt?.units ?? []) latest.set(unit.lesson.nodeId, unit)
    return [...latest.values()]
  }, [attempt])
  const done = view === null ? 0 : new Set((view.run?.attempts ?? []).filter((entry) => entry.status === 'completed' && entry.version === (attempt?.version ?? view.path.acceptedVersion)).map((entry) => entry.itemId)).size

  if (courseId === undefined) {
    return <EmptyTab title={text.tabEmptyTitle} body={text.tabEmptyBody} action={onOpenMapPage === undefined ? undefined : { label: text.openLearningMap, run: onOpenMapPage }} />
  }
  if (view === null) {
    return <EmptyTab title={text.lessonWaiting} body={text.lessonWaitingBody} action={onOpenMapPage === undefined ? undefined : { label: text.openLearningMap, run: onOpenMapPage }} />
  }
  if (attempt === undefined || route === null || item === null) {
    return <EmptyTab title={text.emptyLessonTitle} body={text.emptyLessonBody} action={onOpenMapPage === undefined ? undefined : { label: text.openLearningMap, run: onOpenMapPage }} />
  }

  const status = attempt.status === 'completed' ? text.lessonComplete : attempt.status === 'interrupted' ? text.lessonInterrupted : text.lessonStatusCurrent
  const tone = attempt.status === 'completed' ? 'green' : attempt.status === 'interrupted' ? 'amber' : 'blue'
  return (
    <div className="dtx-tab">
      <div className="dtx-tab-inner">
      <h2>{item.title}</h2>
      <p className="dtx-tab-head-meta">{learning.overview?.course?.title ?? ''}{module !== null ? ` · ${module.title}` : ''} · {codeFor(route, item)}</p>
      <div className="dtx-tab-pills">
        <span className="dtx-pill" data-tone={tone}>{status}</span>
        <span className="dtx-pill" data-tone="gray">{text.routeLabel(route.version)}</span>
      </div>
      <div className="dtx-tab-progress"><span>{text.sessionProgress(done, route.items.length)}</span><span>{text.routeLabel(route.version)}</span></div>
      <div className="dtx-tab-divider" />
      {units.length === 0
        ? <div className="dtx-tab-empty" style={{ minHeight: 260 }}>
            <span className="dtx-tab-empty-icon"><Icon name="spark" size={28} /></span>
            <h2>{text.lessonWaiting}</h2>
            <p>{text.lessonWaitingBody}</p>
            {onOpenMapPage !== undefined && <button type="button" className="dtx-secondary" onClick={onOpenMapPage}>{text.openLearningMap}</button>}
          </div>
        : <>
            <h3 className="dtx-tab-section"><span className="dtx-section-icon"><Icon name="book" size={16} /></span>{text.lessonContents}</h3>
            {units.map((unit) => <article key={unit.lesson.nodeId}>
              {units.length > 1 && <h3 className="dtx-tab-section">{unit.lesson.title}</h3>}
              {unit.lesson.blocks.map((block) => block.type === 'diagram'
                ? <details className="dtx-tab-fold" key={block.id}>
                    <summary>{text.lessonDiagram}{block.content.caption !== undefined ? ` · ${block.content.caption}` : ''}</summary>
                    <LessonBody blocks={[block]} />
                  </details>
                : <LessonBody key={block.id} blocks={[block]} />)}
            </article>)}
          </>}
      {attempt.outcome !== null && <div className="dtx-tab-outcome"><b>{text.outcomeLabel}</b>{attempt.outcome}</div>}
      {onOpenMapPage !== undefined && <div className="dtx-tab-linkrow" style={{ marginTop: 18 }}>
        <button type="button" className="dtx-secondary" onClick={onOpenMapPage}><Icon name="map" size={15} />{text.openLearningMap}</button>
        <LanguageToggle />
      </div>}
      </div>
    </div>
  )
}
