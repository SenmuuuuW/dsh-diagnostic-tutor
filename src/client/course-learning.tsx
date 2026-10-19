/** Current course attempt beside chat; curriculum browsing stays in Learning map. */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PathView } from '../path.js'
import type { PathClient } from './path-client.js'
import { DataFooter, LessonBody } from './blocks.js'

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
    return () => { live = false; clearInterval(timer) }
  }, [client, courseId, scope, sessionId])
  return snapshot?.scope === scope ? snapshot.view : null
}

export function CourseLearning({ view, title, compact = false, onOpenMap, onOpenChat, onExport, onReset }: {
  view: PathView; title: string; compact?: boolean; onOpenMap?: (() => void) | undefined;
  onOpenChat?: (() => void) | undefined; onExport: () => void; onReset: () => void;
}): ReactNode {
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
      <h2 className="dt-course-title">{item?.title ?? 'Your learning route'}</h2>
      {item && route && <p className="dt-shared">{module?.title} · Lesson {index + 1} of {route.items.length} · Route v{route.version}</p>}
      {attempt && <p className="dt-caption">{attempt.status === 'completed' ? 'Lesson completed · evidence recorded' : attempt.status === 'interrupted' ? 'Lesson paused' : 'This conversation’s current lesson'}</p>}
      {attempt && view.path.acceptedVersion !== attempt.version && <p className="dt-caption">A newer route exists. This lesson remains on v{attempt.version}.</p>}
      {onOpenMap && <button className="dt-secondary" type="button" onClick={onOpenMap}>Open course route</button>}
    </header>
    {latest.size ? [...latest.values()].map((unit) => <article key={unit.lesson.nodeId} className="dt-lesson-body dt-course-unit">
      <div className="dt-lesson-head"><h3 className="dt-lesson-title">{unit.lesson.title}</h3><span className="dt-origin">Tutor</span></div>
      <LessonBody blocks={unit.lesson.blocks} />
    </article>) : <div className="dt-empty-state">
      <p className="dt-empty-title">{attempt ? 'The tutor is preparing this lesson' : route ? 'Your course route is ready' : 'Build a route around your goal'}</p>
      <p className="dt-empty">{attempt ? 'The teaching appears here as it is written. Answer the tutor’s questions in the chat.' : route ? 'Browse any lesson Overview in Learning map, then choose where to begin.' : 'Set your target, available time and background in Learning map, then ask for an initial diagnosis and course outline.'}</p>
      {attempt && !attempt.prompted && <p className="dt-notice">{attempt.promptReason ?? 'The teaching request has not reached a live tutor yet.'} Open the course route to retry.</p>}
    </div>}
    {attempt?.outcome && <div className="dt-next"><p className="dt-next-label">Lesson outcome</p><p>{attempt.outcome}</p><p className="dt-caption">Completing a lesson does not automatically confirm its knowledge points.</p>{onOpenMap && <button type="button" className="dt-primary" onClick={onOpenMap}>Choose the next lesson</button>}</div>}
    {onOpenChat && <button type="button" className="dt-secondary" onClick={onOpenChat}>Answer in the chat</button>}
    <DataFooter onExport={onExport} onReset={onReset} />
  </>
  return compact ? <div className="dt-tab">{content}</div> : <div className="dt-root-wrap"><div className="dt-course-reading">{content}</div></div>
}
