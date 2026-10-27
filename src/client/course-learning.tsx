/** Current course attempt beside chat; curriculum browsing stays in Learning map. */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PathView } from '../path.js'
import type { PathClient } from './path-client.js'
import { DataFooter, LessonBody } from './blocks.js'
import { LanguageToggle } from './language-toggle.js'
import { useLessonText } from './lesson-text.js'
import { PATH_PAUSED_EVENT, PATH_RESUMED_EVENT } from './path-events.js'

export function useCoursePath(client: PathClient | undefined, courseId: string | undefined, sessionId?: string): PathView | null {
  const scope = `${courseId ?? ''}:${sessionId ?? ''}`
  const [snapshot, setSnapshot] = useState<{ scope: string; view: PathView } | null>(null)
  useEffect(() => {
    if (!client || !courseId) return
    let live = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const view = await client.get(courseId, sessionId)
        if (live && view.path.courseId === courseId && (!view.run || view.run.sessionId === sessionId)) setSnapshot((old) => old?.scope === scope && old.view.path.revision > view.path.revision ? old : { scope, view })
      } catch { /* Existing node-only learning remains usable when planning is unavailable. */ }
      finally { pending = false }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 2000)
    const signal = () => { void refresh() }
    window.addEventListener(PATH_PAUSED_EVENT, signal)
    window.addEventListener(PATH_RESUMED_EVENT, signal)
    return () => {
      live = false
      clearInterval(timer)
      window.removeEventListener(PATH_PAUSED_EVENT, signal)
      window.removeEventListener(PATH_RESUMED_EVENT, signal)
    }
  }, [client, courseId, scope, sessionId])
  return snapshot?.scope === scope ? snapshot.view : null
}

export function CourseLearning({ view, title, compact = false, onOpenMap, onOpenChat, onExport, onReset }: {
  view: PathView; title: string; compact?: boolean; onOpenMap?: (() => void) | undefined;
  onOpenChat?: (() => void) | undefined; onExport: () => void; onReset: () => void;
}): ReactNode {
  const text = useLessonText()
  const attempt = view.run?.attempts.find((entry) => entry.id === view.run?.activeAttemptId)
  const route = view.path.curricula.find((entry) => entry.version === (attempt?.version ?? view.path.acceptedVersion))
  const index = route?.items.findIndex((entry) => entry.id === attempt?.itemId) ?? -1
  const item = route?.items[index]
  const module = route?.modules.find((entry) => entry.id === item?.moduleId)
  // Replace supersedes a displayed node's unit, not its stored historical snapshots.
  const latest = new Map<string, NonNullable<typeof attempt>['units'][number]>()
  for (const unit of attempt?.units ?? []) latest.set(unit.lesson.nodeId, unit)
  const content = <>
    <header className="dt-course-card">
      <p className="dt-eyebrow">{title}</p>
      <h2 className="dt-course-title">{item?.title ?? text.learningRoute}</h2>
      {item && route && <p className="dt-shared">{module?.title} · {text.lesson} {index + 1} {text.lessonOf} {route.items.length} · {text.routeVersion}{route.version}</p>}
      {attempt && <p className="dt-caption">{attempt.status === 'completed' ? text.lessonCompleted : attempt.status === 'interrupted' ? text.lessonPaused : text.currentLesson}</p>}
      {attempt && view.path.acceptedVersion !== attempt.version && <p className="dt-caption">{text.newerRoutePrefix}{attempt.version}{text.newerRouteSuffix}</p>}
      {onOpenMap && <button className="dt-secondary" type="button" onClick={onOpenMap}>{text.openCourseRoute}</button>}{' '}
      <LanguageToggle />
    </header>
    {latest.size ? [...latest.values()].map((unit) => <article key={unit.lesson.nodeId} className="dt-lesson-body dt-course-unit">
      <div className="dt-lesson-head"><h3 className="dt-lesson-title">{unit.lesson.title}</h3><span className="dt-origin">{text.tutorOrigin}</span></div>
      <LessonBody blocks={unit.lesson.blocks} />
    </article>) : <div className="dt-empty-state">
      <p className="dt-empty-title">{attempt ? text.preparingTitle : route ? text.routeReadyTitle : text.buildRouteTitle}</p>
      <p className="dt-empty">{attempt ? text.preparingBody : route ? text.routeReadyBody : text.buildRouteBody}</p>
      {attempt && !attempt.prompted && <p className="dt-notice">{attempt.promptReason ?? text.promptPending}{text.promptRetry}</p>}
    </div>}
    {attempt?.outcome && <div className="dt-next"><p className="dt-next-label">{text.lessonOutcome}</p><p>{attempt.outcome}</p><p className="dt-caption">{text.outcomeNote}</p>{onOpenMap && <button type="button" className="dt-primary" onClick={onOpenMap}>{text.chooseNextLesson}</button>}</div>}
    {onOpenChat && <button type="button" className="dt-secondary" onClick={onOpenChat}>{text.answerInChat}</button>}
    <DataFooter onExport={onExport} onReset={onReset} />
  </>
  return compact ? <div className="dt-tab">{content}</div> : <div className="dt-root-wrap"><div className="dt-course-reading">{content}</div></div>
}
