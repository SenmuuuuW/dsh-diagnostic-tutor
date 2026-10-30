/** The course surface: accepted route, one next action, and the generation flow when none exists. */
import { useState, type ReactNode } from 'react'

import type { PathView } from '../path.js'
import type { PathClient } from './path-client.js'
import { defaultPathClient } from './path-client.js'
import { Icon } from './design-icons.jsx'
import { useDesignText } from './design-text.js'
import { useLang } from './i18n.js'
import { PathPage } from './path-page.js'
import type { PathPageProps } from './path-page.js'
import { RouteModules } from './path-page.js'

export interface CoursePageProps extends PathPageProps {
  path: PathView | null
}

function operationId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `course-${Date.now().toString(36)}`
}

export function CoursePage({ path, courseId, title, sessionId, client, onOpenChat, onStarted, onOpenLesson, onOpenEvidence, nodes, tasks, sessionActivity }: CoursePageProps): ReactNode {
  const text = useDesignText()
  const lang = useLang()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const pathClient: PathClient = client ?? defaultPathClient
  const acceptedVersion = path?.path.acceptedVersion ?? null
  const accepted = path?.path.curricula.find((entry) => entry.version === acceptedVersion) ?? null

  if (path === null) {
    return <div className="dtx-course"><div className="dtx-status">{text.loading}</div></div>
  }
  // No accepted route yet: the existing route page owns the goal → diagnosis →
  // proposal flow. Keeping that flow in one place avoids a second generator.
  if (accepted === null) {
    return <PathPage courseId={courseId} title={title} nodes={nodes} sessionId={sessionId} client={client}
      {...(onOpenChat === undefined ? {} : { onOpenChat })}
      {...(onStarted === undefined ? {} : { onStarted })}
      {...(onOpenLesson === undefined ? {} : { onOpenLesson })}
      {...(onOpenEvidence === undefined ? {} : { onOpenEvidence })}
      {...(tasks === undefined ? {} : { tasks })}
      {...(sessionActivity === undefined ? {} : { sessionActivity })} />
  }
  const attempt = path.run?.attempts.find((entry) => entry.id === path.run?.activeAttemptId)
  const activeItem = accepted.items.find((entry) => entry.id === attempt?.itemId)
  const done = new Set(path.run?.attempts.filter((entry) => entry.status === 'completed' && entry.version === acceptedVersion).map((entry) => entry.itemId))
  const next = (attempt === undefined ? undefined : accepted.items.find((entry) => entry.id === attempt.itemId)) ?? accepted.items.find((entry) => !done.has(entry.id)) ?? null
  const start = (itemId: string) => {
    if (busy || sessionId === undefined) return
    setBusy(true); setNotice('')
    void pathClient.start({
      sessionId, courseId, expectedRevision: path.path.revision, version: accepted.version,
      itemId, operationId: operationId(),
    }).then((result) => {
      if (!result.prompted) { setNotice(result.promptReason ?? text.tabTutorUnreachable); return }
      onStarted?.()
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : text.tabTutorUnreachable)).finally(() => setBusy(false))
  }
  const primary = attempt !== undefined
    ? { label: text.continueLesson, run: () => onOpenLesson?.() }
    : next !== null
      ? { label: done.size === 0 ? text.startLesson : text.startNextLesson, run: () => start(next.id) }
      : { label: text.routeCompleteTitle, run: () => onOpenEvidence?.() }
  const completed = done.size
  return <div className="dtx-course">
    <header className="dtx-course-head">
      <p className="dtx-eyebrow">{text.tabCourse}</p>
      <h1>{accepted.title || title}</h1>
      <p>{path.path.brief?.purpose ?? text.courseGoalEmpty}</p>
      <div className="dtx-course-facts">
        <span>{text.courseRoute(accepted.version)}</span>
        <span>{text.courseLessons(accepted.items.length)}</span>
        <span>{text.courseCompleted(completed, accepted.items.length)}</span>
      </div>
      <div className="dtx-course-actions">
        <button type="button" className="dtx-primary" disabled={busy || (attempt === undefined && next === null)} onClick={primary.run}>{primary.label}<Icon name="arrow-right" size={15} /></button>
        {onOpenChat !== undefined && <button type="button" className="dtx-link" onClick={onOpenChat}>{text.backToChat}</button>}
      </div>
      {notice !== '' && <p className="dtx-tab-notice" role="alert">{notice}</p>}
    </header>
    <main className="dtx-course-layout">
      <RouteModules plan={accepted} attempts={path.run?.attempts ?? []} activeAttemptId={path.run?.activeAttemptId ?? null}
        selectedItemId={attempt?.itemId ?? null} onSelect={(itemId) => start(itemId)} version={accepted.version}
        showProgress text={text} lang={lang} />
      <aside className="dtx-course-side">
        <section className="dtx-card dtx-course-card">
          <h2>{attempt === undefined ? text.courseNextTitle : text.courseCurrentTitle}</h2>
          {next === null ? <p>{text.courseCompleteBody}</p> : <><p className="dtx-course-next-title">{next.title}</p><p>{next.overview}</p></>}
        </section>
        {onOpenChat !== undefined && <section className="dtx-card dtx-course-card"><h2>{text.courseGenerateTitle}</h2><p>{text.courseGenerateBody}</p><button type="button" className="dtx-secondary" onClick={onOpenChat}>{text.backToChat}</button></section>}
      </aside>
    </main>
  </div>
}
