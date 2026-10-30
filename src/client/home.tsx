/** The Home surface: one next action, due review, deadline and the learner's courses. */
import { useEffect, useState, type ReactNode } from 'react'

import type { OverviewResponse, TaskView } from '../contract.js'
import type { PathView } from '../path.js'
import { Icon } from './design-icons.jsx'
import { useDesignText } from './design-text.js'
import { useLang } from './i18n.js'
import type { PathClient } from './path-client.js'

export interface HomePageProps {
  overview: OverviewResponse
  path: PathView | null
  reviewClient: PathClient
  onOpenLesson?: (() => void) | undefined
  onOpenRoute: () => void
  onOpenReview: () => void
  onOpenProject: (courseId: string) => void
}

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  const target = Date.parse(`${date}T12:00:00Z`)
  if (!Number.isFinite(target)) return null
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  return Math.max(0, Math.ceil((target - today) / 86_400_000))
}

function taskDue(task: TaskView, lang: 'en' | 'zh'): string {
  if (task.dueAt === undefined) return ''
  const parsed = new Date(task.dueAt)
  if (!Number.isFinite(parsed.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).format(parsed)
  } catch { return '' }
}

export function HomePage({ overview, path, reviewClient, onOpenLesson, onOpenRoute, onOpenReview, onOpenProject }: HomePageProps): ReactNode {
  const text = useDesignText()
  const lang = useLang()
  const [due, setDue] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    const load = async () => {
      if (reviewClient.reviewNext === undefined) return
      try {
        const result = await reviewClient.reviewNext()
        if (live) setDue(result.count)
      } catch { /* Home stays useful when Review is unavailable. */ }
    }
    void load()
    return () => { live = false }
  }, [reviewClient])

  const attempt = path?.run?.attempts.find((entry) => entry.id === path.run?.activeAttemptId)
  const accepted = path?.path.acceptedVersion ?? null
  const route = path?.path.curricula.find((entry) => entry.version === (attempt?.version ?? accepted)) ?? null
  const index = route?.items.findIndex((entry) => entry.id === attempt?.itemId) ?? -1
  const item = index >= 0 ? route?.items[index] : route?.items[0]
  const module = item === undefined ? undefined : route?.modules.find((entry) => entry.id === item.moduleId)
  const completed = path?.run?.attempts.filter((entry) => entry.status === 'completed' && entry.version === (attempt?.version ?? accepted)).length ?? 0
  const targetDate = path?.path.brief?.targetDate ?? null
  const days = daysUntil(targetDate)
  const weeks = path?.path.brief?.durationWeeks ?? null
  const openTasks = (overview.tasks ?? []).filter((task) => task.status === 'open').slice(0, 3)
  const primary = attempt !== undefined ? text.homeContinue : item !== undefined ? text.homeStart : text.homeOpenRoute
  const primaryAction = attempt !== undefined && onOpenLesson !== undefined ? onOpenLesson : onOpenRoute
  const date = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())
  return <div className="dtx-home">
    <header className="dtx-home-head"><div><p className="dtx-eyebrow">{text.homeEyebrow}</p><h1>{text.homeTitle}</h1></div><p className="dtx-home-date">{date}</p></header>
    <section className="dtx-home-hero" aria-labelledby="dtx-home-next">
      <div className="dtx-home-copy">
        <p className="dtx-home-kicker">{attempt !== undefined ? text.homeContinueLabel : text.homeStartLabel}</p>
        <h2 id="dtx-home-next">{item?.title ?? text.homeNoLesson}</h2>
        <p className="dtx-home-meta">{module?.title ?? overview.course?.title ?? ''}{route !== null && index >= 0 ? ` · ${text.homeLessonOf(index + 1, route.items.length)}` : ''}</p>
        <p className="dtx-home-lede">{attempt !== undefined ? text.homeContinueBody : item !== undefined ? text.homeStartBody : text.homeNoRoute}</p>
        <div className="dtx-home-actions"><button type="button" className="dtx-primary" onClick={primaryAction}>{primary}<Icon name="arrow-right" size={15} /></button><button type="button" className="dtx-link" onClick={onOpenRoute}>{text.homeViewCourse}<Icon name="chevron-right" size={14} /></button></div>
      </div>
      <div className="dtx-home-side">
        <button type="button" className="dtx-home-small dtx-home-review" onClick={onOpenReview}>
          <span className="dtx-home-side-label"><Icon name="clock" size={14} /> {text.homeReviewLabel}</span>
          <strong>{due === null ? '—' : due}</strong>
          <span className="dtx-home-side-note">{due === 0 ? text.homeReviewNone : text.homeReviewDue}</span>
          <span className="dtx-home-side-action">{text.homeReviewOpen}<Icon name="chevron-right" size={13} /></span>
        </button>
        <div className="dtx-home-small dtx-home-exam">
          <span className="dtx-home-side-label"><Icon name="target" size={14} /> {text.homeExamLabel}</span>
          <strong>{days !== null ? text.homeDays(days) : weeks !== null ? text.homeWeeks(weeks) : text.homeNoDeadline}</strong>
          <span className="dtx-home-side-note">{path?.path.brief?.purpose ?? text.homeExamNote}</span>
        </div>
      </div>
    </section>
    <div className="dtx-home-grid">
      <section className="dtx-card dtx-home-card" aria-labelledby="dtx-home-tasks"><div className="dtx-home-card-head"><h2 id="dtx-home-tasks">{text.homeTasksTitle}</h2><button type="button" className="dtx-link" onClick={onOpenRoute}>{text.homePlanLink}</button></div>
        {openTasks.length === 0 ? <p className="dtx-home-empty">{text.homeTasksEmpty}</p> : <ul className="dtx-home-tasks">{openTasks.map((task) => <li key={task.id}><span className="dtx-home-task-dot" /><span>{task.title}</span>{task.dueAt !== undefined && <small>{taskDue(task, lang)}</small>}</li>)}</ul>}
      </section>
      <section className="dtx-card dtx-home-card" aria-labelledby="dtx-home-courses"><div className="dtx-home-card-head"><h2 id="dtx-home-courses">{text.homeCoursesTitle}</h2></div>
        <div className="dtx-home-courses">{overview.library.slice(0, 3).map((project) => <button type="button" key={project.id} className="dtx-home-course" data-current={project.id === overview.course?.id ? 'true' : undefined} onClick={() => onOpenProject(project.id)}><span><b>{project.title}</b><small>{project.id === overview.course?.id ? text.homeCurrent : text.homeOpenCourse}</small></span><Icon name="chevron-right" size={15} /></button>)}</div>
        {path !== null && route !== null && <p className="dtx-home-facts"><span>{text.homeRouteFacts(route.version, route.items.length)}</span><span>{text.homeCompleted(completed, route.items.length)}</span></p>}
      </section>
    </div>
  </div>
}
