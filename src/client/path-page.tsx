/** Curriculum browsing and explicit learner actions; never selects a project. */
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { NodeView } from '../contract.js'
import type { Assessment, CourseAttempt, Curriculum, CurriculumItem, GoalBrief, PathView } from '../path.js'
import { Icon } from './design-icons.jsx'
import { useDesignText } from './design-text.js'
import type { DesignText } from './design-text.js'
import { useLang } from './i18n.js'
import type { Lang } from './i18n.js'
import { defaultPathClient, PathClientError } from './path-client.js'
import type { PathClient, PathWriteParams, PromptedPathView } from './path-client.js'
import { usePathText } from './path-text.js'
import type { PathText } from './path-text.js'
import { routeFit } from './path-fit.js'
import type { RouteFit } from './path-fit.js'
import { classifyTutorError } from './tutor-error.js'
import type { SessionActivity } from './use-session-activity.js'

export interface PathPageProps {
  courseId: string
  title: string
  nodes: NodeView[]
  sessionId?: string | undefined
  onOpenChat?: (() => void) | undefined
  onStarted?: (() => void) | undefined
  onOpenLesson?: (() => void) | undefined
  onOpenEvidence?: (() => void) | undefined
  sessionActivity?: SessionActivity | undefined
  client?: PathClient | undefined
}

type GoalDraft = {
  purpose: string; outcomes: string; background: string; timeZone: string
  targetDate: string; durationWeeks: string; weeklyMinutes: string; sessionMinutes: string; preferences: string
}
type PromptIssue = { kind: 'diagnosis' | 'plan'; message: string } | {
  kind: 'start'; message: string; version: number; itemId: string; review: boolean
}

const WEEKLY_OPTIONS = [
  { value: '', zh: '未设置', en: 'Not set' },
  { value: '120', zh: '1–3 小时', en: '1–3 hours' },
  { value: '300', zh: '3–5 小时', en: '3–5 hours' },
  { value: '480', zh: '5–8 小时', en: '5–8 hours' },
  { value: '720', zh: '8–12 小时', en: '8–12 hours' },
  { value: '900', zh: '12 小时以上', en: '12+ hours' },
]
const SESSION_OPTIONS = [
  { value: '', zh: '未设置', en: 'Not set' },
  { value: '30', zh: '15–30 分钟', en: '15–30 min' },
  { value: '45', zh: '30–60 分钟', en: '30–60 min' },
  { value: '75', zh: '60–90 分钟', en: '60–90 min' },
  { value: '105', zh: '90 分钟以上', en: '90+ min' },
]

function initialZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}
function draftFromBrief(brief: GoalBrief | null): GoalDraft {
  return {
    purpose: brief?.purpose ?? '', outcomes: brief?.outcomes.join('\n') ?? '', background: brief?.background ?? '',
    timeZone: brief?.timeZone ?? initialZone(), targetDate: brief?.targetDate ?? '',
    durationWeeks: brief?.durationWeeks?.toString() ?? '',
    weeklyMinutes: brief?.weeklyMinutes?.toString() ?? '', sessionMinutes: brief?.sessionMinutes?.toString() ?? '',
    preferences: brief?.preferences ?? '',
  }
}
function numericDraft(value: string, label: string, min: number, max: number, text: PathText): number | null {
  if (!value.trim()) return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(text.wholeNumber(label, min, max))
  return number
}
function briefFromDraft(draft: GoalDraft, text: PathText): GoalBrief {
  const timeZone = draft.timeZone.trim()
  try { new Intl.DateTimeFormat('en', { timeZone }).format() } catch { throw new Error(text.invalidTimeZone) }
  if (!timeZone) throw new Error(text.timeZoneRequired)
  const targetDate = draft.targetDate || null
  const durationWeeks = draft.durationWeeks ? numericDraft(draft.durationWeeks, text.durationWeeksLabel, 1, 260, text) : null
  if (targetDate !== null && durationWeeks !== null) throw new Error(text.invalidTargetDate)
  if (draft.targetDate !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.targetDate) || Number.isNaN(Date.parse(`${draft.targetDate}T12:00:00Z`)) || new Date(`${draft.targetDate}T12:00:00Z`).toISOString().slice(0, 10) !== draft.targetDate)) {
    throw new Error(text.invalidTargetDate)
  }
  const outcomes = draft.outcomes.split('\n').map((line) => line.trim()).filter(Boolean)
  if (outcomes.length > 20 || outcomes.some((line) => line.length > 2000)) throw new Error(text.outcomeLimits)
  return {
    purpose: draft.purpose, outcomes, background: draft.background, timeZone, targetDate, durationWeeks,
    deadline: targetDate === null && durationWeeks === null ? 'none' : 'flexible',
    weeklyMinutes: numericDraft(draft.weeklyMinutes, text.weeklyMinutesErrorLabel, 15, 10080, text),
    sessionMinutes: numericDraft(draft.sessionMinutes, text.sessionMinutesErrorLabel, 5, 480, text), preferences: draft.preferences,
  }
}
function ready(brief: GoalBrief | null): boolean { return !!brief?.purpose.trim() && !!brief.outcomes.length }
function operationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `path-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
function messageOf(error: unknown, text: PathText): string { return error instanceof Error ? error.message : text.requestFailed }
function duration(value: number, lang: Lang): string {
  if (value < 120) return lang === 'zh' ? `${value} 分钟` : `${value} min`
  const hours = Number((value / 60).toFixed(1))
  return lang === 'zh' ? `${hours} 小时` : `${hours} h`
}
function range(value: { min: number; max: number }, lang: Lang): string { return `${duration(value.min, lang)}–${duration(value.max, lang)}` }
function waitDuration(value: number, lang: Lang): string {
  if (value < 60) return duration(value, lang)
  if (value < 60 * 48) return lang === 'zh' ? `${Number((value / 60).toFixed(1))} 小时` : `${Number((value / 60).toFixed(1))} h`
  return lang === 'zh' ? `${Number((value / 1440).toFixed(1))} 天` : `${Number((value / 1440).toFixed(1))} d`
}
function when(value: string, lang: Lang): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(lang === 'zh' ? 'zh-CN' : undefined)
}
function latestAttempt(attempts: readonly CourseAttempt[], version: number, itemId: string): CourseAttempt | undefined {
  return [...attempts].reverse().find((attempt) => attempt.version === version && attempt.itemId === itemId)
}
type LessonState = 'planned' | 'current' | 'completed' | 'interrupted'
function lessonState(attempts: readonly CourseAttempt[], activeId: string | null, version: number, itemId: string): LessonState {
  const attempt = latestAttempt(attempts, version, itemId)
  if (attempt === undefined) return 'planned'
  if (attempt.id === activeId && attempt.status !== 'completed' && attempt.status !== 'interrupted') return 'current'
  if (attempt.status === 'completed') return 'completed'
  if (attempt.status === 'interrupted') return 'interrupted'
  return 'current'
}
function lessonStateLabel(state: LessonState, text: DesignText): string {
  if (state === 'completed') return text.lessonStatusCompleted
  if (state === 'current') return text.lessonStatusCurrent
  return text.lessonStatusPlanned
}
function attemptDone(attempts: readonly CourseAttempt[], version: number): Set<string> {
  return new Set(attempts.filter((attempt) => attempt.version === version && attempt.status === 'completed').map((attempt) => attempt.itemId))
}
function codeFor(plan: Curriculum, item: CurriculumItem): string {
  const moduleIndex = plan.modules.findIndex((module) => module.id === item.moduleId)
  const within = plan.items.filter((entry) => entry.moduleId === item.moduleId).findIndex((entry) => entry.id === item.id)
  return `${moduleIndex + 1}.${within + 1}`
}

function Button({ children, primary, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }): ReactNode {
  return <button type="button" className={primary ? 'dtx-primary' : 'dtx-secondary'} {...props}>{children}</button>
}

function StageBar({ stage, text }: { stage: 'goal' | 'diagnosis' | 'route' | 'learning'; text: DesignText }): ReactNode {
  const index = ['goal', 'diagnosis', 'route', 'learning'].indexOf(stage)
  return (
    <nav className="dtx-stagebar" aria-label={text.stages.join(' · ')}>
      {text.stages.map((label, position) => {
        const state = position < index ? 'done' : position === index ? 'current' : 'pending'
        return (
          <Fragment key={label}>
            <div className="dtx-stage" data-state={state}>
              <span className="dtx-stage-num">{state === 'done' ? <Icon name="check" size={15} /> : position + 1}</span>
              <span className="dtx-stage-label">{label}</span>
              {state === 'done' && <span className="dtx-stage-check"><Icon name="check" size={15} /></span>}
            </div>
            {position < text.stages.length - 1 && <span className="dtx-stage-line" />}
          </Fragment>
        )
      })}
    </nav>
  )
}

function NextCard({ kind, title, body, note, primary, secondary, tertiary, children, layout }: {
  kind?: 'waiting' | 'error' | 'version' | 'complete' | 'proposal' | undefined
  title: string
  body?: string
  note?: string | undefined
  primary?: { label: string; run: () => void; disabled?: boolean } | undefined
  secondary?: { label: string; run: () => void; disabled?: boolean } | undefined
  tertiary?: { label: string; run: () => void; disabled?: boolean } | undefined
  children?: ReactNode
  layout?: 'row' | 'stack'
}): ReactNode {
  const text = useDesignText()
  const boxed = kind === 'waiting' || kind === 'error'
  return (
    <section className="dtx-next" data-kind={kind ?? 'normal'} data-layout={layout ?? 'row'} aria-label={text.nextStep}>
      {kind === 'complete' && <span className="dtx-complete-icon"><Icon name="check" size={24} /></span>}
      <div className="dtx-next-copy">
        <p className="dtx-next-eyebrow">{text.nextStep}</p>
        <h2>{title}</h2>
        {body !== undefined && !boxed && <p className="dtx-next-body">{body}</p>}
        {note !== undefined && <p className="dtx-next-note">{note}</p>}
        {kind === 'waiting' && <div className="dtx-wait-box">
          <span className="dtx-spinner" />
          <span><span className="dtx-wait-title">{body ?? text.waitingTutor}</span><span className="dtx-wait-sub">{note ?? text.waitingTutorHint}</span></span>
        </div>}
        {kind === 'error' && <div className="dtx-error-box">
          <span className="dtx-error-title"><Icon name="warning" size={16} />{title}</span>
          <span className="dtx-error-body">{body ?? text.errorOther}</span>
        </div>}
        {children}
      </div>
      {(primary !== undefined || secondary !== undefined || tertiary !== undefined) && <div className="dtx-next-actions">
        {primary !== undefined && <button type="button" className="dtx-primary" disabled={primary.disabled} onClick={primary.run}>{primary.label}</button>}
        {secondary !== undefined && <button type="button" className="dtx-secondary" disabled={secondary.disabled} onClick={secondary.run}>{secondary.label}</button>}
        {tertiary !== undefined && <button type="button" className="dtx-link" disabled={tertiary.disabled} onClick={tertiary.run}>{tertiary.label}</button>}
      </div>}
    </section>
  )
}

function GoalForm({ draft, dirty, busy, readOnly, onChange, onSave, text, lang }: {
  draft: GoalDraft; dirty: boolean; busy: boolean; readOnly: boolean
  onChange: (field: keyof GoalDraft, value: string) => void
  onSave: () => void
  text: DesignText
  lang: Lang
}): ReactNode {
  const field = (name: keyof GoalDraft) => ({
    value: draft[name],
    disabled: readOnly,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(name, event.target.value),
  })
  const options = (entries: { value: string; zh: string; en: string }[]) => entries.map((entry) => <option key={entry.value} value={entry.value}>{lang === 'zh' ? entry.zh : entry.en}</option>)
  return (
    <form className="dtx-card dtx-form-card" onSubmit={(event: FormEvent) => { event.preventDefault(); onSave() }}>
      <div className="dtx-form-head">
        <div>
          <h2>{text.goalTitle}</h2>
          <p>{text.goalHelp}</p>
        </div>
        <button type="submit" className="dtx-primary" disabled={busy || readOnly}>{text.saveGoal}</button>
      </div>
      {dirty && <p className="dtx-small dtx-muted" style={{ marginTop: 10 }}>{text.unsavedChanges}</p>}
      <div className="dtx-form">
        <div className="dtx-field">
          <label htmlFor="dtx-purpose">{text.fieldPurpose}</label>
          <textarea id="dtx-purpose" className="dtx-input" maxLength={2000} {...field('purpose')} placeholder={text.fieldPurposePlaceholder} />
          <p className="dtx-counter">{text.charCount(draft.purpose.length, 2000)}</p>
        </div>
        <div className="dtx-field">
          <label htmlFor="dtx-outcomes">{text.fieldOutcomes}</label>
          <textarea id="dtx-outcomes" className="dtx-input" {...field('outcomes')} placeholder={text.fieldOutcomesPlaceholder} />
        </div>
        <div className="dtx-field">
          <label htmlFor="dtx-background">{text.fieldBackground}</label>
          <textarea id="dtx-background" className="dtx-input" {...field('background')} placeholder={text.fieldBackgroundPlaceholder} />
        </div>
        <div className="dtx-form-grid">
          <div className="dtx-field">
            <label htmlFor="dtx-weekly">{text.fieldWeekly}</label>
            <select id="dtx-weekly" className="dtx-input" {...field('weeklyMinutes')}>{options(WEEKLY_OPTIONS)}</select>
          </div>
          <div className="dtx-field">
            <label htmlFor="dtx-session">{text.fieldSession}</label>
            <select id="dtx-session" className="dtx-input" {...field('sessionMinutes')}>{options(SESSION_OPTIONS)}</select>
          </div>
        </div>
        <details className="dtx-more">
          <summary>{text.moreSettings}</summary>
          <div className="dtx-more-grid">
            <div className="dtx-field">
              <label htmlFor="dtx-target">{text.fieldTargetDate}</label>
              <input id="dtx-target" type="date" className="dtx-input" {...field('targetDate')} />
            </div>
            <div className="dtx-field">
              <label htmlFor="dtx-weeks">{text.fieldDurationWeeks}</label>
              <input id="dtx-weeks" type="number" min={1} max={260} className="dtx-input" {...field('durationWeeks')} />
            </div>
            <div className="dtx-field">
              <label htmlFor="dtx-tz">{text.fieldTimeZone}</label>
              <input id="dtx-tz" className="dtx-input" {...field('timeZone')} />
            </div>
            <div className="dtx-field">
              <label htmlFor="dtx-preferences">{text.fieldPreferences}</label>
              <input id="dtx-preferences" className="dtx-input" {...field('preferences')} />
            </div>
          </div>
        </details>
      </div>
    </form>
  )
}

function GoalRail({ text }: { text: DesignText }): ReactNode {
  const titles = [text.stageGoalTitle, text.stageDiagnosisTitle, text.stageRouteTitle, text.stageLearningTitle]
  return (
    <>
      <section className="dtx-card dtx-rail-card">
        <p className="dtx-rail-eyebrow">{text.currentStage}</p>
        <h2 className="dtx-stage-current-title">{text.stageGoalTitle}</h2>
        <p className="dtx-stage-current-step">{text.stepOf(1, 4)}</p>
        <div className="dtx-stage-steps">
          {titles.map((title, index) => <div key={title} className="dtx-stage-step" data-current={index === 0 ? 'true' : undefined}>
            <span className="dtx-stage-step-num">{index + 1}</span>
            <span>{title}</span>
          </div>)}
        </div>
        <div className="dtx-rail-divider" />
        <h3 className="dtx-rail-section">{text.stageHelper}</h3>
        {[
          { icon: 'book' as const, title: text.helperMatchTitle, body: text.helperMatchBody },
          { icon: 'clock' as const, title: text.helperPaceTitle, body: text.helperPaceBody },
          { icon: 'target' as const, title: text.helperPracticeTitle, body: text.helperPracticeBody },
        ].map((tip) => <div className="dtx-tip" key={tip.title}>
          <span className="dtx-tip-icon"><Icon name={tip.icon} size={18} /></span>
          <span><span className="dtx-tip-title">{tip.title}</span><span className="dtx-tip-body">{tip.body}</span></span>
        </div>)}
      </section>
    </>
  )
}

function DiagnosisInfo({ text }: { text: DesignText }): ReactNode {
  return (
    <section className="dtx-card dtx-info-card">
      <h3>{text.diagnosisHowTitle}</h3>
      <div className="dtx-how-steps">
        {text.diagnosisHow.map((step, index) => <div className="dtx-how-step" key={step.title}>
          <span className="dtx-how-num">{index + 1}</span>
          <span><span className="dtx-how-title">{step.title}</span><span className="dtx-how-body" style={{ display: 'block' }}>{step.body}</span></span>
        </div>)}
      </div>
      <div className="dtx-hint-box">
        <span className="dtx-hint-icon"><Icon name="chat" size={18} /></span>
        <span><span className="dtx-hint-title">{text.diagnosisHintTitle}</span><span className="dtx-hint-body" style={{ display: 'block' }}>{text.diagnosisHintBody}</span></span>
      </div>
    </section>
  )
}

function EmptyRail({ title, body, action, text }: { title: string; body: string; action?: { label: string; run: () => void } | undefined; text: DesignText }): ReactNode {
  return (
    <section className="dtx-card dtx-rail-empty">
      <span className="dtx-rail-empty-icon"><Icon name="book" size={30} /></span>
      <p className="dtx-rail-empty-title">{title}</p>
      <p className="dtx-rail-empty-body">{body}</p>
      {action !== undefined && <button type="button" className="dtx-secondary" onClick={action.run}>{action.label}</button>}
      <span className="dtx-small dtx-muted" style={{ marginTop: 12 }}>{text.currentLesson}</span>
    </section>
  )
}

function RouteModules({ plan, attempts, activeAttemptId, selectedItemId, onSelect, version, showProgress, text, lang }: {
  plan: Curriculum
  attempts: readonly CourseAttempt[]
  activeAttemptId: string | null
  selectedItemId: string | null
  onSelect: (id: string) => void
  version: number
  showProgress: boolean
  text: DesignText
  lang: Lang
}): ReactNode {
  const done = attemptDone(attempts, plan.version)
  const modules = plan.modules.map((module) => {
    const items = plan.items.filter((item) => item.moduleId === module.id)
    return { module, items, done: items.length > 0 && items.every((item) => done.has(item.id)) }
  })
  const activeItemId = activeAttemptId === null ? null : attempts.find((attempt) => attempt.id === activeAttemptId)?.itemId ?? null
  const currentModuleId = activeItemId === null ? null : plan.items.find((item) => item.id === activeItemId)?.moduleId ?? null
  const initial = () => new Set(currentModuleId === null ? (modules[0] === undefined ? [] : [modules[0].module.id]) : [currentModuleId])
  const [expanded, setExpanded] = useState<Set<string>>(initial)
  useEffect(() => { setExpanded(initial()) }, [plan.version])
  const allOpen = modules.length > 0 && modules.every((entry) => expanded.has(entry.module.id))
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  return (
    <section className="dtx-card dtx-route-card">
      <div className="dtx-route-head">
        <h3>{text.routeListTitle}</h3>
        <div className="dtx-route-meta">
          {showProgress ? <><span>{text.sessionProgress(done.size, plan.items.length)}</span><span>·</span><span>{text.routeLabel(version)}</span></> : <span>{text.routeLabel(version)}</span>}
          <button type="button" className="dtx-link" onClick={() => setExpanded(allOpen ? new Set() : new Set(modules.map((entry) => entry.module.id)))}>
            {allOpen ? text.collapseAll : text.expandAll}
          </button>
        </div>
      </div>
      <div className="dtx-modules">
        {modules.map(({ module, items, done: moduleDone }) => {
          const moduleMinutes = items.reduce((sum, item) => sum + item.minutes.min, 0)
          const open = expanded.has(module.id)
          const current = module.id === currentModuleId
          return (
            <div className="dtx-module" data-done={moduleDone ? 'true' : undefined} data-open={open ? 'true' : undefined} data-current={current ? 'true' : undefined} key={module.id}>
              <button type="button" className="dtx-module-toggle" aria-expanded={open} onClick={() => toggle(module.id)}>
                <span className="dtx-module-num">{moduleDone ? <Icon name="check" size={14} /> : plan.modules.findIndex((entry) => entry.id === module.id) + 1}</span>
                <span className="dtx-module-main">
                  <span className="dtx-module-title">{module.title}</span>
                  {open && <span className="dtx-module-desc">{module.overview}</span>}
                </span>
                <span className="dtx-module-meta">{text.moduleMeta(duration(moduleMinutes, lang), items.length)}</span>
                <span className="dtx-module-chevron"><Icon name="chevron-right" size={15} /></span>
              </button>
              {open && <div className="dtx-lessons">
                {items.map((item) => {
                  const state = lessonState(attempts, activeAttemptId, plan.version, item.id)
                  return (
                    <button type="button" className="dtx-lesson" data-state={state} aria-current={item.id === selectedItemId || undefined} onClick={() => onSelect(item.id)} key={item.id}>
                      <span className="dtx-lesson-state">{state === 'completed' ? <Icon name="check" size={11} /> : null}</span>
                      <span className="dtx-lesson-body">
                        <span className="dtx-lesson-top">
                          <span className="dtx-lesson-code">{codeFor(plan, item)}</span>
                          <span className="dtx-lesson-title">{item.title}</span>
                          <span className="dtx-lesson-minutes">{duration(item.minutes.min, lang)}</span>
                        </span>
                        <span className="dtx-lesson-topics">{item.topics.slice(0, 3).join('、')}</span>
                      </span>
                    </button>
                  )
                })}
              </div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function timeText(minutes: number, text: DesignText, lang: Lang): string {
  return `${text.totalDuration} ${duration(minutes, lang)}`
}

function LessonRail({ plan, item, attempt, activeAttempt, mode, version, text, lang, onStart, onOpenChat, onOpenLesson, readOnly }: {
  plan: Curriculum
  item: CurriculumItem
  attempt: CourseAttempt | undefined
  activeAttempt: CourseAttempt | undefined
  mode: 'preview' | 'current'
  version: number
  text: DesignText
  lang: Lang
  onStart: (() => void) | undefined
  onOpenChat: (() => void) | undefined
  onOpenLesson: (() => void) | undefined
  readOnly: boolean
}): ReactNode {
  const module = plan.modules.find((entry) => entry.id === item.moduleId)
  const state = lateState(attempt, activeAttempt, item)
  const title = mode === 'current' ? text.currentLesson : text.lessonPreview
  const outline = item.outline.slice(0, 3)
  return (
    <section className="dtx-card dtx-rail-card">
      <div className="dtx-rail-head">
        <p className="dtx-rail-eyebrow">{title}</p>
      </div>
      <h2 className="dtx-rail-title">{item.title}</h2>
      <p className="dtx-rail-sub">{module?.title ?? ''}{mode === 'current' ? ` · ${codeFor(plan, item)}` : ` · ${text.lessonMinutes(duration(item.minutes.min, lang))}`}</p>
      <div className="dtx-rail-pills">
        <span className="dtx-pill" data-tone={state === 'completed' ? 'green' : state === 'current' ? 'blue' : 'gray'}>{lessonStateLabel(state, text)}</span>
        <span className="dtx-pill" data-tone="gray">{text.routeLabel(version)}</span>
      </div>
      <div className="dtx-rail-divider" />
      <h3 className="dtx-rail-section">{text.lessonContents}</h3>
      {outline.map((line, index) => <div className="dtx-rail-item" key={index}>
        <span className="dtx-rail-item-icon"><Icon name={index === 0 ? 'book' : index === 1 ? 'grid' : 'spark'} size={17} /></span>
        <span><span className="dtx-rail-item-title">{line}</span><span className="dtx-rail-item-desc" style={{ display: 'block' }}>{item.topics.slice(index, index + 2).join('、')}</span></span>
      </div>)}
      {mode === 'preview' && <p className="dtx-rail-note">{text.plannedNote}</p>}
      {mode === 'current' && <div className="dtx-answer-card">
        <p className="dtx-answer-title"><Icon name="chat" size={16} />{text.answerInChat}</p>
        <p className="dtx-answer-body">{text.answerInChatBody}</p>
      </div>}
    </section>
  )
}
function lateState(attempt: CourseAttempt | undefined, activeAttempt: CourseAttempt | undefined, item: CurriculumItem): LessonState {
  if (attempt !== undefined && attempt.id === activeAttempt?.id && attempt.status !== 'completed') return 'current'
  if (attempt?.status === 'completed') return 'completed'
  if (attempt?.status === 'interrupted') return 'interrupted'
  return 'planned'
}

function ProposalCard({ plan, brief, text, lang, busy, readOnly, canRequest, onAccept, onRevise, versions, selectedVersion, onSelectVersion }: {
  plan: Curriculum
  brief: GoalBrief | null
  text: DesignText
  lang: Lang
  busy: boolean
  readOnly: boolean
  canRequest: boolean
  onAccept: () => void
  onRevise: () => void
  versions: number[]
  selectedVersion: number | null
  onSelectVersion: (version: number) => void
}): ReactNode {
  const fit = routeFit(plan, brief)
  return (
    <section className="dtx-proposal">
      <span className="dtx-proposal-icon"><Icon name="route" size={24} /></span>
      <div className="dtx-proposal-copy">
        <h2>{text.proposalTitle}</h2>
        <p>{text.proposalBody}</p>
      </div>
      <div className="dtx-proposal-stats">
        <span><span className="dtx-stat-label">{text.totalDuration}</span><br /><span className="dtx-stat-value">{duration(fit.totalMin, lang)}–{duration(fit.totalMax, lang)}</span></span>
        {fit.weeklyMinutes !== null && <span><span className="dtx-stat-label">{text.weeklySuggestion}</span><br /><span className="dtx-stat-value">{duration(fit.weeklyMinutes, lang)}</span></span>}
        <span><span className="dtx-stat-label">{text.routeVersion(plan.version)}</span><br /><span className="dtx-stat-value">{text.pendingAccept}</span></span>
      </div>
      <div className="dtx-proposal-actions">
        <button type="button" className="dtx-primary" disabled={busy || readOnly} onClick={onAccept}>{text.acceptRoute}</button>
        <button type="button" className="dtx-link" disabled={!canRequest || busy} onClick={onRevise}>{text.requestRevision}</button>
        {versions.length > 1 && <select className="dtx-input" aria-label={text.routeListTitle} value={selectedVersion ?? plan.version} onChange={(event) => onSelectVersion(Number(event.target.value))} style={{ height: 32, marginTop: 4 }}>
          {versions.map((version) => <option key={version} value={version}>{text.routeVersion(version)}</option>)}
        </select>}
      </div>
    </section>
  )
}

export function PathPage(props: PathPageProps): ReactNode {
  const text = useDesignText()
  const pathText = usePathText()
  const lang = useLang()
  return <PathPageBody {...props} designText={text} pathText={pathText} lang={lang} />
}

function PathPageBody({ courseId, title, sessionId, onOpenChat, onStarted, onOpenLesson, onOpenEvidence, sessionActivity, client = defaultPathClient, designText: text, pathText, lang }: PathPageProps & { designText: DesignText; pathText: PathText; lang: Lang }): ReactNode {
  const [view, setView] = useState<PathView | null>(null)
  const [draft, setDraft] = useState<GoalDraft>(() => draftFromBrief(null))
  const [dirty, setDirty] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [notice, setNotice] = useState('')
  const [promptIssue, setPromptIssue] = useState<PromptIssue | null>(null)
  const currentView = useRef<PathView | null>(null)
  const dirtyRef = useRef(false)
  const editGeneration = useRef(0)
  const generation = useRef(0)
  const readSequence = useRef(0)
  const reading = useRef(false)
  const mutationEpoch = useRef(0)
  const live = useRef(false)
  const locked = useRef(false)
  const initialized = useRef(false)
  const synchronizedBrief = useRef('')
  const readOnly = !sessionId

  const adopt = useCallback((next: PathView) => {
    if (next.path.courseId !== courseId || next.run && (next.run.sessionId !== sessionId || next.run.courseId !== courseId)) return
    const previous = currentView.current
    if (previous && next.path.revision < previous.path.revision) return
    const run = previous?.run && next.run && next.run.revision < previous.run.revision ? previous.run : next.run
    const accepted = { ...next, run }
    currentView.current = accepted
    setView(accepted)
    const serialized = JSON.stringify(next.path.brief)
    if (!dirtyRef.current && synchronizedBrief.current !== serialized) {
      synchronizedBrief.current = serialized
      setDraft(draftFromBrief(next.path.brief))
    }
    if (!initialized.current) {
      initialized.current = true
      const active = next.run?.attempts.find((attempt) => attempt.id === next.run?.activeAttemptId)
      setSelectedVersion(active?.version ?? next.path.acceptedVersion ?? next.path.curricula.at(-1)?.version ?? null)
    } else setSelectedVersion((version) => version ?? next.path.acceptedVersion ?? next.path.curricula.at(-1)?.version ?? null)
  }, [courseId, sessionId])

  const refresh = useCallback(async (force = false) => {
    if ((locked.current || reading.current) && !force) return
    const scope = generation.current
    const epoch = mutationEpoch.current
    const sequence = ++readSequence.current
    reading.current = true
    try {
      const next = await client.get(courseId, sessionId)
      if (!live.current || scope !== generation.current || epoch !== mutationEpoch.current || sequence !== readSequence.current) return
      adopt(next)
      setPollError('')
    } catch (failure) {
      if (live.current && scope === generation.current && epoch === mutationEpoch.current && sequence === readSequence.current) setPollError(messageOf(failure, pathText))
    } finally {
      if (scope === generation.current && sequence === readSequence.current) reading.current = false
    }
  }, [adopt, client, courseId, sessionId, pathText])
  useEffect(() => {
    live.current = true
    generation.current += 1
    reading.current = false
    locked.current = false
    setBusy(null)
    void refresh()
    const timer = setInterval(() => { void refresh() }, 3000)
    return () => { live.current = false; generation.current += 1; clearInterval(timer) }
  }, [refresh])

  const mutate = async (name: string, task: (params: PathWriteParams) => Promise<PathView>, success?: (result: PathView) => void) => {
    if (locked.current || !sessionId || !currentView.current) return
    locked.current = true
    const scope = generation.current
    mutationEpoch.current += 1
    setBusy(name); setError(''); setNotice(''); setPromptIssue(null)
    try {
      const result = await task({ sessionId, courseId, expectedRevision: currentView.current.path.revision })
      if (!live.current || scope !== generation.current) return
      adopt(result)
      success?.(result)
    } catch (failure) {
      if (!live.current || scope !== generation.current) return
      if (failure instanceof PathClientError && failure.status === 409) {
        await refresh(true)
        if (live.current && scope === generation.current) setError(pathText.staleProjectError)
      } else setError(messageOf(failure, pathText))
    } finally {
      if (live.current && scope === generation.current) { locked.current = false; setBusy(null) }
    }
  }
  const changeDraft = (field: keyof GoalDraft, value: string) => {
    dirtyRef.current = true; editGeneration.current += 1; setDirty(true)
    setDraft((previous) => ({ ...previous, [field]: value }))
  }
  const saveBrief = () => {
    let brief: GoalBrief
    try { brief = briefFromDraft(draft, pathText) } catch (failure) { setError(messageOf(failure, pathText)); return }
    if (!ready(brief)) { setError(text.goalNeedsOutcome); return }
    const edit = editGeneration.current
    void mutate('save', (params) => client.saveBrief({ ...params, brief }), (result) => {
      if (edit === editGeneration.current) {
        dirtyRef.current = false; setDirty(false)
        synchronizedBrief.current = JSON.stringify(result.path.brief)
        setDraft(draftFromBrief(result.path.brief))
      }
      setNotice(ready(result.path.brief) ? text.goalSaved : pathText.draftSaved)
    })
  }
  const ask = (kind: 'diagnosis' | 'plan') => {
    const path = currentView.current?.path
    if (!path || dirtyRef.current || !ready(path.brief)) { setError(pathText.askNeedsGoal); return }
    if (kind === 'plan' && (!path.assessment || path.assessment.briefRevision !== path.briefRevision || !['ready', 'skipped'].includes(path.assessment.status))) { setError(pathText.askNeedsAssessment); return }
    void mutate(`request-${kind}`, (params) => client.request({ ...params, kind, operationId: operationId() }), (result) => {
      const response = result as PromptedPathView
      if (!response.prompted) setPromptIssue({ kind, message: response.promptReason ?? pathText.tutorUnreachable })
      else setNotice(pathText.requestSent(kind))
    })
  }
  const start = (version: number, itemId: string, review: boolean) => {
    void mutate('start', (params) => client.start({ ...params, version, itemId, operationId: operationId(), ...(review ? { review: true } : {}) }), (result) => {
      const response = result as PromptedPathView
      if (!response.prompted) setPromptIssue({ kind: 'start', version, itemId, review, message: response.promptReason ?? pathText.tutorUnreachable })
      else { setNotice(pathText.lessonRequested); onStarted?.() }
    })
  }
  const acceptVersion = (version: number) => {
    void mutate('accept', (params) => client.accept({ ...params, version }), () => { setNotice(pathText.routeAcceptedNotice(version)); setSelectedVersion(version) })
  }
  const skipAssessment = () => { void mutate('skip', (params) => client.skipAssessment(params), () => setNotice(pathText.assessmentSkippedNotice)) }

  const activeAttempt = view?.run?.attempts.find((attempt) => attempt.id === view.run?.activeAttemptId)
  const savedReady = ready(view?.path.brief ?? null)
  const assessmentCurrent = !!view?.path.assessment && view.path.assessment.briefRevision === view.path.briefRevision
  const assessment = assessmentCurrent ? view?.path.assessment ?? null : null
  const latestDiagnosis = view?.path.requests.findLast((request) => request.kind === 'diagnosis' && request.briefRevision === view.path.briefRevision)
  const latestPlan = view?.path.requests.findLast((request) => request.kind === 'plan' && request.briefRevision === view.path.briefRevision)
  const diagnosisResolved = !!assessment && assessment.status !== 'in-progress' && (!latestDiagnosis || assessment.updatedAt >= latestDiagnosis.createdAt)
  const planResolved = !!latestPlan && !!view?.path.curricula.some((entry) => entry.briefRevision === view.path.briefRevision && entry.assessmentRevision === view.path.assessmentRevision && entry.createdAt >= latestPlan.createdAt)
  const diagnosisWaiting = !!latestDiagnosis?.prompted && !diagnosisResolved
  const planWaiting = !!latestPlan?.prompted && !planResolved
  const savedPromptFailure = promptIssue !== null ? null : latestPlan !== undefined && !latestPlan.prompted && !planResolved ? latestPlan : latestDiagnosis !== undefined && !latestDiagnosis.prompted && !diagnosisResolved ? latestDiagnosis : null
  const versions = view?.path.curricula ?? []
  const acceptedPlan = versions.find((entry) => entry.version === view?.path.acceptedVersion) ?? null
  const latestProposal = versions.at(-1)
  const plan = versions.find((entry) => entry.version === selectedVersion) ?? latestProposal
  const busyAction = busy !== null
  const hasAcceptedRoute = view?.path.acceptedVersion != null
  const stage: 'goal' | 'diagnosis' | 'route' | 'learning' = !savedReady ? 'goal' : !assessmentCurrent || !['ready', 'skipped'].includes(assessment?.status ?? '') ? 'diagnosis' : hasAcceptedRoute ? 'learning' : 'route'
  const activePlan = stage === 'learning' ? acceptedPlan : plan ?? null
  const doneSet = activePlan === null ? new Set<string>() : attemptDone(view?.run?.attempts ?? [], activePlan.version)
  const doneItems = activePlan?.items.filter((item) => doneSet.has(item.id)) ?? []
  const nextLesson = activePlan?.items.find((item) => !doneSet.has(item.id)) ?? null
  const defaultItemId = activeAttempt?.itemId ?? nextLesson?.id ?? activePlan?.items[0]?.id ?? null
  useEffect(() => {
    if (activePlan === null) return
    setSelectedItemId((current) => current !== null && activePlan.items.some((item) => item.id === current) ? current : defaultItemId)
  }, [activePlan?.version, defaultItemId])
  const selectedItem = activePlan?.items.find((item) => item.id === selectedItemId) ?? activePlan?.items.find((item) => item.id === defaultItemId) ?? null
  const activeItem = activePlan?.items.find((item) => item.id === activeAttempt?.itemId) ?? null

  const diagnosisAgeMinutes = view !== null && latestDiagnosis !== undefined
    ? Math.max(0, Math.round((Date.parse(view.now) - Date.parse(latestDiagnosis.createdAt)) / 60_000))
    : 0
  const liveFailure = sessionActivity !== undefined && !sessionActivity.running ? sessionActivity.lastAgentError : null
  const diagnosisFailure = diagnosisWaiting ? latestDiagnosis?.failure ?? liveFailure : null
  const startWaiting = activeAttempt !== undefined && activeAttempt.units.length === 0 && activeAttempt.status !== 'completed' && activeAttempt.status !== 'interrupted' && promptIssue === null
  const startFailure = activeAttempt !== undefined && !activeAttempt.prompted && promptIssue?.kind !== 'start' ? activeAttempt.promptReason ?? pathText.noReason : null
  const versionConflict = activeAttempt !== undefined && view?.path.acceptedVersion != null && activeAttempt.version !== view.path.acceptedVersion

  const retryDiagnosisAndOpen = () => {
    const path = currentView.current?.path
    if (!path || dirtyRef.current || !ready(path.brief)) { onOpenChat?.(); return }
    void mutate('request-diagnosis', (params) => client.request({ ...params, kind: 'diagnosis', operationId: operationId() }), (result) => {
      const response = result as PromptedPathView
      if (!response.prompted) setPromptIssue({ kind: 'diagnosis', message: response.promptReason ?? pathText.tutorUnreachable })
      onOpenChat?.()
    })
  }
  const retryPlan = () => ask('plan')
  const retryStart = () => {
    if (activeAttempt === undefined) return
    start(activeAttempt.version, activeAttempt.itemId, false)
  }
  const errorAdvice = (raw: string): string => {
    const kind = classifyTutorError(raw)
    if (kind === 'billing') return text.errorBilling
    if (kind === 'auth') return text.errorAuth
    if (kind === 'rate-limit') return text.errorRate
    if (kind === 'network') return text.errorNetwork
    if (kind === 'context') return text.errorContext
    return text.errorOther
  }
  const fit = plan === undefined || view === null ? null : routeFit(plan, view.path.brief)

  let nextCard: ReactNode = null
  if (view === null) nextCard = null
  else if (readOnly) nextCard = <NextCard title={text.goalTitle} body={pathText.readOnlyNotice} />
  else if (stage === 'goal') nextCard = null
  else if (stage === 'diagnosis') {
    if (diagnosisWaiting && diagnosisFailure !== null) {
      nextCard = <NextCard kind="error" layout="stack" title={text.diagnosisFailed} body={errorAdvice(diagnosisFailure)}
        primary={{ label: text.retryWithChat, run: retryDiagnosisAndOpen, disabled: busyAction || dirty }}
        secondary={{ label: text.skipDiagnosis, run: skipAssessment, disabled: busyAction }} />
    } else if (diagnosisWaiting) {
      const running = sessionActivity?.running === true
      nextCard = <NextCard kind="waiting" layout="stack" title={text.diagnosisWaitingTitle} body={text.diagnosisWaitingHint}
        note={diagnosisAgeMinutes >= 1 ? text.elapsed(waitDuration(diagnosisAgeMinutes, lang)) : undefined}
        primary={onOpenChat === undefined ? undefined : { label: text.openChat, run: onOpenChat }}
        secondary={{ label: text.skipDiagnosis, run: skipAssessment, disabled: busyAction }}
        tertiary={running || diagnosisAgeMinutes < 1 ? undefined : { label: text.tutorNoQuestions, run: retryDiagnosisAndOpen, disabled: busyAction || dirty }} />
    } else {
      nextCard = <NextCard title={text.diagnosisTitle} body={text.diagnosisBody}
        primary={{ label: text.requestDiagnosis, run: () => ask('diagnosis'), disabled: busyAction || dirty }}
        secondary={{ label: text.skipDiagnosis, run: skipAssessment, disabled: busyAction }} />
    }
  } else if (stage === 'route') {
    if (savedPromptFailure !== null) {
      nextCard = <NextCard kind="error" layout="stack" title={text.routeFailedTitle} body={errorAdvice(savedPromptFailure.reason ?? '')}
        primary={{ label: text.retry, run: () => ask(savedPromptFailure.kind), disabled: busyAction || dirty }} />
    } else if (planWaiting) {
      nextCard = <NextCard kind="waiting" layout="stack" title={text.routeWaitingTitle} body={text.routeWaitingBody}
        primary={onOpenChat === undefined ? undefined : { label: text.openChat, run: onOpenChat }} />
    } else if (plan !== undefined && plan.briefRevision === view.path.briefRevision && plan.assessmentRevision === view.path.assessmentRevision) {
      nextCard = <ProposalCard plan={plan} brief={view.path.brief} text={text} lang={lang} busy={busyAction} readOnly={readOnly}
        canRequest={!busyAction && !dirty && !readOnly}
        onAccept={() => acceptVersion(plan.version)} onRevise={() => ask('plan')}
        versions={versions.map((entry) => entry.version)} selectedVersion={selectedVersion} onSelectVersion={setSelectedVersion} />
    } else {
      nextCard = <NextCard title={text.proposalTitle} body={text.proposalBody}
        primary={{ label: text.requestRoute, run: () => ask('plan'), disabled: !savedReady || busyAction || dirty || readOnly }}
        secondary={undefined} />
    }
  } else {
    if (versionConflict) {
      nextCard = <NextCard kind="version" layout="stack" title={activeItem?.title ?? text.currentLesson} body={text.versionSubtitle}
        children={<div className="dtx-version-box"><p className="dtx-version-title"><Icon name="warning" size={16} />{text.versionTitle(activeAttempt!.version, view.path.acceptedVersion!)}</p><p className="dtx-version-body">{text.versionBody(activeAttempt!.version, view.path.acceptedVersion!)}</p></div>}
        primary={{ label: text.continueConversation, run: onOpenChat ?? (() => {}) }}
        tertiary={{ label: text.viewLatestRoute, run: () => { setSelectedVersion(view.path.acceptedVersion!); setSelectedItemId(null) } }} />
    } else if (startFailure !== null) {
      nextCard = <NextCard kind="error" layout="stack" title={text.routeFailedTitle} body={startFailure}
        primary={{ label: pathText.retryCurrentLesson ?? text.retry, run: retryStart, disabled: busyAction || readOnly }}
        secondary={onOpenChat === undefined ? undefined : { label: text.openChat, run: onOpenChat }} />
    } else if (startWaiting) {
      const age = Math.max(0, Math.round((Date.now() - Date.parse(activeAttempt!.updatedAt)) / 60_000))
      nextCard = <NextCard kind="waiting" layout="stack" title={text.waitingTutor} body={text.waitingTutorHint}
        note={age >= 1 ? text.elapsed(waitDuration(age, lang)) : undefined}
        primary={onOpenChat === undefined ? undefined : { label: text.openChat, run: onOpenChat }} />
    } else if (acceptedPlan !== null && nextLesson === null) {
      nextCard = <NextCard kind="complete" title={text.routeCompleteTitle} body={text.routeCompleteBody(doneItems.length, acceptedPlan.items.length)}
        children={<div className="dtx-hint-box"><span className="dtx-hint-icon"><Icon name="info" size={18} /></span><span><span className="dtx-hint-title">{text.masteryNoticeTitle}</span><span className="dtx-hint-body" style={{ display: 'block' }}>{text.masteryNoticeBody}</span></span></div>}
        primary={onOpenEvidence === undefined ? undefined : { label: text.viewEvidence, run: onOpenEvidence }}
        secondary={onOpenChat === undefined ? undefined : { label: text.backToChat, run: onOpenChat }} />
    } else if (activeAttempt !== undefined && activeItem !== null) {
      nextCard = <NextCard title={activeItem.title} body={`${text.currentLesson} · ${text.lessonStatusCurrent}`}
        primary={{ label: text.continueLesson, run: onOpenLesson ?? onOpenChat ?? (() => {}) }} />
    } else if (activePlan !== null && nextLesson !== null) {
      nextCard = <NextCard title={nextLesson.title} body={doneItems.length === 0 ? text.startFirstBody : text.sessionProgress(doneItems.length, activePlan.items.length)}
        primary={{ label: doneItems.length === 0 ? text.startLesson : text.startNextLesson, run: () => start(activePlan.version, nextLesson.id, false), disabled: busyAction || readOnly }} />
    } else {
      nextCard = <NextCard title={text.proposalTitle} body={text.noRouteBody} primary={onOpenChat === undefined ? undefined : { label: text.openChat, run: onOpenChat }} />
    }
  }

  const rail: ReactNode = (() => {
    if (stage === 'goal') return <GoalRail text={text} />
    if (stage === 'diagnosis') return <EmptyRail title={text.emptyLessonTitle} body={text.emptyLessonBody} text={text} action={undefined} />
    if (stage === 'route' && plan === undefined) return <EmptyRail title={text.noRouteTitle} body={text.noRouteBody} text={text} action={onOpenChat === undefined ? undefined : { label: text.openChat, run: onOpenChat }} />
    if (activePlan === null || selectedItem === null) return <EmptyRail title={text.emptyLessonTitle} body={text.emptyLessonBody} text={text} />
    const attempt = latestAttempt(view?.run?.attempts ?? [], activePlan.version, selectedItem.id)
    const mode = stage === 'learning' && activeAttempt !== undefined && activeAttempt.itemId === selectedItem.id ? 'current' : 'preview'
    return <LessonRail plan={activePlan} item={selectedItem} attempt={attempt} activeAttempt={activeAttempt} mode={mode} version={activePlan.version}
      text={text} lang={lang}
      onStart={stage === 'learning' && activeAttempt === undefined ? () => start(activePlan.version, selectedItem.id, false) : undefined}
      onOpenChat={onOpenChat} onOpenLesson={onOpenLesson} readOnly={readOnly} />
  })()

  const assessmentSummary = assessment !== null && stage !== 'diagnosis' ? (
    <details className="dtx-card dtx-form-card" style={{ padding: 0 }}>
      <summary style={{ cursor: 'pointer', padding: '14px 18px', fontSize: 13, color: 'var(--dt-muted,#6b7280)' }}>{text.diagnosisSummary} · {assessment.status === 'skipped' ? text.diagnosisSkipped : text.diagnosisReady}</summary>
      <div style={{ padding: '0 18px 18px', fontSize: 13 }}>
        <p style={{ marginTop: 0 }}>{assessment.summary}</p>
        {assessment.strengths.length > 0 && <p><b>{text.prerequisiteKnowledge}:</b> {assessment.strengths.join(' · ')}</p>}
        {assessment.gaps.length > 0 && <p><b>{text.diagnosisFailed}:</b> {assessment.gaps.join(' · ')}</p>}
      </div>
    </details>
  ) : null

  const routeSettings = versions.length > 0 && stage !== 'goal' ? (
    <details className="dtx-card dtx-form-card" style={{ padding: 0 }}>
      <summary style={{ cursor: 'pointer', padding: '14px 18px', fontSize: 13, color: 'var(--dt-muted,#6b7280)' }}>{text.routeListTitle} · {text.routeVersion(selectedVersion ?? versions.at(-1)?.version ?? 1)}</summary>
      <div style={{ padding: '0 18px 18px', fontSize: 13, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="dtx-input" style={{ width: 180, height: 36 }} value={selectedVersion ?? ''} onChange={(event) => { setSelectedVersion(Number(event.target.value)); setSelectedItemId(null) }}>
          {versions.map((entry) => <option key={entry.version} value={entry.version}>{text.routeVersion(entry.version)}{entry.version === view?.path.acceptedVersion ? ` · ${text.statusAccepted}` : ''}</option>)}
        </select>
        {stage === 'learning' && <button type="button" className="dtx-secondary" disabled={busyAction || dirty || readOnly} onClick={() => ask('plan')}>{text.requestRevision}</button>}
      </div>
    </details>
  ) : null

  return (
    <div className="dtx-content" aria-label={pathText.pageLabel(title)}>
      {readOnly && <p className="dtx-notice">{pathText.readOnlyNotice}</p>}
      {error !== '' && <p className="dtx-alert" role="alert">{error}</p>}
      {pollError !== '' && <p className="dtx-alert" role="status">{view === null ? pathText.couldNotLoadPath : pathText.updatesPaused}{pollError} <button type="button" className="dtx-link" onClick={() => { void refresh() }}>{pathText.retryLoading}</button></p>}
      {notice !== '' && <p className="dtx-status" role="status">{notice}</p>}
      {promptIssue !== null && <p className="dtx-alert" role="alert">{promptIssue.message} <button type="button" className="dtx-link" disabled={busyAction || readOnly} onClick={() => { if (promptIssue.kind === 'start') start(promptIssue.version, promptIssue.itemId, promptIssue.review); else ask(promptIssue.kind) }}>{pathText.retryTutorRequest}</button></p>}
      {view === null
        ? pollError === '' && <p className="dtx-status" role="status">{pathText.loadingPath}</p>
        : <div className="dtx-route">
          <div className="dtx-main">
            <StageBar stage={stage} text={text} />
            {stage === 'goal' ? <GoalForm draft={draft} dirty={dirty} busy={busy === 'save'} readOnly={readOnly} onChange={changeDraft} onSave={saveBrief} text={text} lang={lang} /> : nextCard}
            {stage === 'diagnosis' && !diagnosisWaiting && diagnosisFailure === null && <DiagnosisInfo text={text} />}
            {activePlan !== null && (stage === 'route' || stage === 'learning') && <RouteModules plan={activePlan} attempts={view.run?.attempts ?? []} activeAttemptId={view.run?.activeAttemptId ?? null}
              selectedItemId={selectedItemId} onSelect={setSelectedItemId} version={activePlan.version} showProgress={stage === 'learning'} text={text} lang={lang} />}
            {stage !== 'goal' && assessmentSummary}
            {stage !== 'goal' && routeSettings}
            {fit !== null && fit.longLessons.length > 0 && <p className="dtx-small dtx-muted">{text.sessionMismatch(fit.longLessons.length)}</p>}
          </div>
          <aside className="dtx-rail">{rail}</aside>
        </div>}
    </div>
  )
}
