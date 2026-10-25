/** Curriculum browsing and explicit learner actions; never selects a project. */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent, ReactNode } from 'react'
import type { NodeView } from '../contract.js'
import type { Assessment, CourseAttempt, Curriculum, CurriculumItem, GoalBrief, PathView } from '../path.js'
import { useLang } from './i18n.js'
import type { Lang } from './i18n.js'
import { defaultPathClient, PathClientError } from './path-client.js'
import type { PathClient, PathWriteParams, PromptedPathView } from './path-client.js'
import { usePathText } from './path-text.js'
import type { PathText } from './path-text.js'
import type { SessionActivity } from './use-session-activity.js'

export interface PathPageProps {
  courseId: string
  title: string
  nodes: NodeView[]
  sessionId?: string | undefined
  onOpenChat?: (() => void) | undefined
  onStarted?: (() => void) | undefined
  /** Return to the conversation with the current-lesson tab open. */
  onOpenLesson?: (() => void) | undefined
  /** Live turn state of the conversation this page is showing, when observable. */
  sessionActivity?: SessionActivity | undefined
  client?: PathClient | undefined
}

type Selection = { kind: 'project' } | { kind: 'module'; id: string } | { kind: 'item'; id: string }
type GoalDraft = {
  purpose: string; outcomes: string; background: string; timeZone: string
  timeKind: 'none' | 'date' | 'weeks'; targetDate: string; durationWeeks: string
  deadline: 'flexible' | 'fixed'; weeklyMinutes: string; sessionMinutes: string; preferences: string
}
type PromptIssue = { kind: 'diagnosis' | 'plan'; message: string } | {
  kind: 'start'; message: string; version: number; itemId: string; review: boolean
}
function initialZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}
function draftFromBrief(brief: GoalBrief | null): GoalDraft {
  return {
    purpose: brief?.purpose ?? '', outcomes: brief?.outcomes.join('\n') ?? '', background: brief?.background ?? '',
    timeZone: brief?.timeZone ?? initialZone(), timeKind: brief?.targetDate ? 'date' : brief?.durationWeeks ? 'weeks' : 'none',
    targetDate: brief?.targetDate ?? '', durationWeeks: brief?.durationWeeks?.toString() ?? '',
    deadline: brief?.deadline === 'fixed' ? 'fixed' : 'flexible', weeklyMinutes: brief?.weeklyMinutes?.toString() ?? '',
    sessionMinutes: brief?.sessionMinutes?.toString() ?? '', preferences: brief?.preferences ?? '',
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
  const targetDate = draft.timeKind === 'date' ? draft.targetDate || null : null
  const durationWeeks = draft.timeKind === 'weeks' ? numericDraft(draft.durationWeeks, text.durationWeeksLabel, 1, 260, text) : null
  if (draft.timeKind === 'date' && (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || Number.isNaN(Date.parse(`${targetDate}T12:00:00Z`)) || new Date(`${targetDate}T12:00:00Z`).toISOString().slice(0, 10) !== targetDate)) {
    throw new Error(text.invalidTargetDate)
  }
  if (draft.timeKind === 'weeks' && durationWeeks === null) throw new Error(text.durationRequired)
  const outcomes = draft.outcomes.split('\n').map((line) => line.trim()).filter(Boolean)
  if (outcomes.length > 20 || outcomes.some((line) => line.length > 2000)) throw new Error(text.outcomeLimits)
  return {
    purpose: draft.purpose, outcomes, background: draft.background, timeZone, targetDate, durationWeeks,
    deadline: draft.timeKind === 'none' ? 'none' : draft.deadline,
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
function effort(items: readonly CurriculumItem[]): { min: number; max: number } {
  return items.reduce((total, item) => ({ min: total.min + item.minutes.min, max: total.max + item.minutes.max }), { min: 0, max: 0 })
}
function minutes(value: number, text: PathText): string {
  if (value < 120) return text.durationMinutes(value)
  return text.durationHours(Number((value / 60).toFixed(1)))
}
function range(value: { min: number; max: number }, text: PathText): string { return `${minutes(value.min, text)}–${minutes(value.max, text)}` }
function budget(brief: GoalBrief | null, plan: Curriculum, now: string, lang: Lang) {
  const total = effort(plan.items)
  let weeks = brief?.durationWeeks ?? null
  if (brief?.targetDate) {
    try {
      const parts = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { timeZone: brief.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now))
      const value = (part: string) => parts.find((entry) => entry.type === part)?.value
      const today = `${value('year')}-${value('month')}-${value('day')}`
      weeks = Math.max(0, (Date.parse(`${brief.targetDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 604800000)
    } catch { weeks = null }
  }
  const available = weeks === null || !brief?.weeklyMinutes ? null : Math.floor(weeks * brief.weeklyMinutes)
  return { ...total, available, conflict: available !== null && total.min > available, tight: available !== null && total.max > available }
}
function when(value: string, lang: Lang): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(lang === 'zh' ? 'zh-CN' : undefined)
}
function attemptFor(attempts: readonly CourseAttempt[], version: number, itemId: string): CourseAttempt | undefined {
  return [...attempts].reverse().find((attempt) => attempt.version === version && attempt.itemId === itemId)
}
function itemStatus(attempt: CourseAttempt | undefined, activeId: string | null, text: PathText): string {
  if (!attempt) return text.statusPlanned
  if (attempt.id === activeId && attempt.status !== 'completed' && attempt.status !== 'interrupted') return text.statusCurrent(text.attemptStatus(attempt.status))
  return attempt.status === 'completed' ? text.statusCompletedAttempt : attempt.status === 'interrupted' ? text.statusInterruptedAttempt : text.attemptStatus(attempt.status)
}
function BulletList({ values, empty }: { values: readonly string[]; empty?: string }): ReactNode {
  const text = usePathText()
  return values.length ? <ul className="dt-path-list">{values.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p className="dt-path-muted">{empty ?? text.notRecorded}</p>
}
function Button({ children, primary, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }): ReactNode {
  return <button type="button" className="dt-path-button" data-primary={primary ? 'true' : undefined} {...props}>{children}</button>
}

function GoalWizard({ draft, step, dirty, recovered, busy, readOnly, onChange, onStep, onSave, onClose }: {
  draft: GoalDraft; step: number; dirty: boolean; recovered: boolean; busy: boolean; readOnly: boolean
  onChange: (field: keyof GoalDraft, value: string) => void; onStep: (step: number) => void
  onSave: (close: boolean) => void; onClose: () => void
}): ReactNode {
  const text = usePathText()
  const formId = useId()
  const field = (name: keyof GoalDraft) => ({ id: `${formId}-${name}`, value: draft[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(name, event.target.value), disabled: readOnly })
  return <form className="dt-path-card dt-path-wizard" aria-label={text.wizardLabel} noValidate onSubmit={(event: FormEvent) => { event.preventDefault(); onSave(false) }}>
    <div className="dt-path-card-head"><div><p className="dt-path-eyebrow">{text.wizardEyebrow}</p><h3>{text.wizardTitle}</h3></div><Button onClick={onClose}>{text.closeWizard}</Button></div>
    <p className="dt-path-muted">{text.wizardIntro}</p>
    {recovered && <p className="dt-path-small" role="status">{text.wizardRecovered}</p>}
    <ol className="dt-path-steps" aria-label={text.wizardStepsLabel}>{text.wizardSteps.map((title, index) => <li key={title}><button type="button" className="dt-path-step" aria-current={step === index ? 'step' : undefined} onClick={() => onStep(index)}>{index + 1}. {title}</button></li>)}</ol>
    <div className="dt-path-fields">
      {step === 0 && <>
        <label className="dt-path-field" data-wide="true" htmlFor={`${formId}-purpose`}>{text.purposeLabel}<textarea {...field('purpose')} maxLength={2000} placeholder={text.purposePlaceholder} /><small>{text.purposeHelp}</small></label>
        <label className="dt-path-field" data-wide="true" htmlFor={`${formId}-outcomes`}>{text.outcomesLabel}<textarea {...field('outcomes')} placeholder={text.outcomesPlaceholder} /><small>{text.outcomesHelp}</small></label>
      </>}
      {step === 1 && <label className="dt-path-field" data-wide="true" htmlFor={`${formId}-background`}>{text.backgroundLabel}<textarea {...field('background')} maxLength={4000} placeholder={text.backgroundPlaceholder} /><small>{text.backgroundHelp}</small></label>}
      {step === 2 && <>
        <label className="dt-path-field" htmlFor={`${formId}-timeKind`}>{text.targetTimeLabel}<select {...field('timeKind')}><option value="none">{text.timeNone}</option><option value="date">{text.timeDate}</option><option value="weeks">{text.timeWeeks}</option></select></label>
        <label className="dt-path-field" htmlFor={`${formId}-timeZone`}>{text.timeZoneLabel}<input {...field('timeZone')} maxLength={200} placeholder={text.timeZonePlaceholder} /><small>{text.timeZoneHelp}</small></label>
        {draft.timeKind === 'date' && <label className="dt-path-field" htmlFor={`${formId}-targetDate`}>{text.targetDateLabel}<input {...field('targetDate')} type="date" /></label>}
        {draft.timeKind === 'weeks' && <label className="dt-path-field" htmlFor={`${formId}-durationWeeks`}>{text.durationWeeksLabel}<input {...field('durationWeeks')} type="number" min={1} max={260} placeholder={text.durationWeeksPlaceholder} /></label>}
        {draft.timeKind !== 'none' && <label className="dt-path-field" htmlFor={`${formId}-deadline`}>{text.deadlineLabel}<select {...field('deadline')}><option value="flexible">{text.deadlineFlexible}</option><option value="fixed">{text.deadlineFixed}</option></select></label>}
        <label className="dt-path-field" htmlFor={`${formId}-weeklyMinutes`}>{text.weeklyMinutesField}<input {...field('weeklyMinutes')} type="number" min={15} max={10080} placeholder={text.notSureYet} /><small>{text.weeklyHelp}</small></label>
        <label className="dt-path-field" htmlFor={`${formId}-sessionMinutes`}>{text.sessionMinutesField}<input {...field('sessionMinutes')} type="number" min={5} max={480} placeholder={text.notSureYet} /></label>
      </>}
      {step === 3 && <label className="dt-path-field" data-wide="true" htmlFor={`${formId}-preferences`}>{text.preferencesLabel}<textarea {...field('preferences')} maxLength={2000} placeholder={text.preferencesPlaceholder} /></label>}
    </div>
    <div className="dt-path-actions">
      <Button disabled={step === 0} onClick={() => onStep(step - 1)}>{text.back}</Button>
      {step < text.wizardSteps.length - 1 && <Button onClick={() => onStep(step + 1)}>{text.next}</Button>}
      <Button type="submit" primary disabled={busy || readOnly}>{busy ? text.saving : text.saveDraft}</Button>
      <Button disabled={busy || readOnly} onClick={() => onSave(true)}>{text.saveAndClose}</Button>
      <span className="dt-path-muted dt-path-small">{dirty ? text.unsavedChanges : recovered ? text.savedToProject : text.draftNotSaved}</span>
    </div>
    {readOnly && <p className="dt-path-muted">{text.saveReadOnly}</p>}
  </form>
}

function AssessmentCard({ assessment, nodes, readyBrief, dirty, readOnly, busy, waiting, showActions = true, onRequest, onSkip, onEvidence, onOpenChat }: {
  assessment: Assessment | null; nodes: NodeView[]; readyBrief: boolean; dirty: boolean; readOnly: boolean; busy: boolean; waiting: boolean
  /** The diagnosis stage owns the action row in the Next-step card; folds keep their own. */
  showActions?: boolean
  onRequest: () => void; onSkip: () => void; onEvidence: (id: string) => void; onOpenChat?: (() => void) | undefined
}): ReactNode {
  const text = usePathText()
  const disabled = readOnly || busy || !readyBrief || dirty
  return <section className="dt-path-card" aria-label={text.initialDiagnosis}>
    <div className="dt-path-card-head"><h3>{text.initialDiagnosis}</h3><span className="dt-path-tag">{assessment ? text.assessmentStatus(assessment.status) : text.assessmentNotRequested}</span></div>
    {assessment ? <>
      <p>{assessment.summary}</p>
      {assessment.status === 'skipped' && <p className="dt-path-muted">{text.assessmentSkipped}</p>}
      <div className="dt-path-columns"><div><h4>{text.strengths}</h4><BulletList values={assessment.strengths} empty={text.noStrengths} /></div><div><h4>{text.gaps}</h4><BulletList values={assessment.gaps} empty={text.noGaps} /></div><div><h4>{text.uncertainties}</h4><BulletList values={assessment.uncertainties} empty={text.noUncertainties} /></div></div>
      {assessment.evidence.length > 0 && <><h4>{text.evidenceReferences}</h4><div className="dt-path-evidence">{assessment.evidence.map((ref, index) => <button type="button" className="dt-path-link" key={`${ref.nodeId}-${ref.evidenceIndex}-${index}`} onClick={() => onEvidence(ref.nodeId)}>{nodes.find((node) => node.id === ref.nodeId)?.title ?? ref.nodeId} · {text.evidence(ref.evidenceIndex + 1)}</button>)}</div></>}
    </> : <p className="dt-path-muted">{text.assessmentHelp}</p>}
    {waiting && <p role="status">{text.diagnosisWaiting}</p>}
    {!readyBrief && <p className="dt-path-muted">{text.diagnosisNeedsGoal}</p>}
    {dirty && <p className="dt-path-muted">{text.diagnosisNeedsSave}</p>}
    {showActions && <div className="dt-path-actions"><Button disabled={disabled} onClick={onRequest}>{waiting ? text.requestDiagnosisAgain : assessment ? text.requestNewDiagnosis : text.requestDiagnosis}</Button>
      {assessment?.status !== 'skipped' && <Button disabled={disabled} onClick={onSkip}>{text.skipAssessment}</Button>}
      {onOpenChat && <Button onClick={onOpenChat}>{text.openConversation}</Button>}
    </div>}
  </section>
}

interface Position { x: number; y: number }
interface ModuleBox { id: string; x: number; y: number; width: number; height: number }
function routeLayout(plan: Curriculum, collapsed: ReadonlySet<string>) {
  const positions = new Map<string, Position>()
  const groups: ModuleBox[] = []
  let y = 24
  for (const module of plan.modules) {
    const items = plan.items.filter((item) => item.moduleId === module.id)
    const rows = Math.ceil(items.length / 3)
    const height = collapsed.has(module.id) ? 72 : 76 + rows * 130
    groups.push({ id: module.id, x: 24, y, width: 932, height })
    if (!collapsed.has(module.id)) items.forEach((item, index) => positions.set(item.id, { x: 44 + (index % 3) * 302, y: y + 68 + Math.floor(index / 3) * 130 }))
    y += height + 30
  }
  return { positions, groups, width: 980, height: Math.max(260, y) }
}
function RouteCanvas({ plan, selection, activeAttempt, attempts, onSelect, onModule }: {
  plan: Curriculum; selection: Selection; activeAttempt: CourseAttempt | undefined; attempts: readonly CourseAttempt[]
  onSelect: (item: string) => void; onModule: (module: string) => void
}): ReactNode {
  const text = usePathText()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [viewport, setViewport] = useState({ x: 12, y: 12, scale: .7 })
  const [panning, setPanning] = useState(false)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null)
  const marker = `dt-path-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const layout = useMemo(() => routeLayout(plan, collapsed), [plan, collapsed])
  const needle = query.trim().toLocaleLowerCase()
  const matches = useMemo(() => plan.items.filter((item) => !needle || `${item.title} ${item.topics.join(' ')} ${plan.modules.find((module) => module.id === item.moduleId)?.title ?? ''}`.toLocaleLowerCase().includes(needle)), [plan, needle])
  const matchedIds = new Set(matches.map((item) => item.id))
  const active = activeAttempt?.version === plan.version ? activeAttempt : undefined
  const fit = useCallback(() => {
    const width = surface.current?.clientWidth || 720
    const height = surface.current?.clientHeight || 440
    const scale = Math.max(.025, Math.min(1.15, (width - 24) / layout.width, (height - 24) / layout.height))
    setViewport({ x: (width - layout.width * scale) / 2, y: 12, scale })
  }, [layout.width, layout.height])
  const fitted = useRef(false)
  useEffect(() => { if (!fitted.current) { fitted.current = true; fit() } }, [fit])
  const zoom = (factor: number) => setViewport((old) => {
    const nextScale = Math.max(.025, Math.min(2.5, old.scale * factor))
    const cx = (surface.current?.clientWidth || 720) / 2
    const cy = (surface.current?.clientHeight || 440) / 2
    const ratio = nextScale / old.scale
    return { x: cx - (cx - old.x) * ratio, y: cy - (cy - old.y) * ratio, scale: nextScale }
  })
  const current = () => {
    if (!active) return
    const item = plan.items.find((entry) => entry.id === active.itemId)
    if (!item) return
    const nextCollapsed = new Set(collapsed)
    nextCollapsed.delete(item.moduleId)
    setCollapsed(nextCollapsed)
    const position = routeLayout(plan, nextCollapsed).positions.get(item.id)
    if (position) {
      const width = surface.current?.clientWidth || 720
      const height = surface.current?.clientHeight || 440
      const scale = Math.max(.55, Math.min(1.2, width / 550))
      setViewport({ x: width / 2 - (position.x + 138) * scale, y: height / 2 - (position.y + 46) * scale, scale })
    }
    onSelect(item.id)
  }
  const toggleModule = (id: string) => setCollapsed((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button,input,select,textarea,a')) return
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: viewport.x, startY: viewport.y }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setPanning(true)
    event.preventDefault()
  }
  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setPanning(false)
  }
  const canvasKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const moves: Record<string, Position> = { ArrowLeft: { x: 40, y: 0 }, ArrowRight: { x: -40, y: 0 }, ArrowUp: { x: 0, y: 40 }, ArrowDown: { x: 0, y: -40 } }
    const move = moves[event.key]
    if (move) { event.preventDefault(); setViewport((old) => ({ ...old, x: old.x + move.x, y: old.y + move.y })) }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.2) }
    else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.2) }
    else if (event.key === 'Home') { event.preventDefault(); fit() }
  }

  // Chrome's mouse input path is still used by some embedded/phone-width
  // surfaces even when Pointer Events are available. Keep a mouse fallback so
  // a canvas never degenerates into text selection at narrow widths.
  const mouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button,input,select,textarea,a')) return
    drag.current = { pointerId: -1, x: event.clientX, y: event.clientY, startX: viewport.x, startY: viewport.y }
    setPanning(true); event.preventDefault()
  }
  const mouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const start = drag.current
    if (start?.pointerId === -1) setViewport((old) => ({ ...old, x: start.startX + event.clientX - start.x, y: start.startY + event.clientY - start.y }))
  }
  const mouseUp = () => { if (drag.current?.pointerId === -1) { drag.current = null; setPanning(false) } }
  return <section className="dt-path-map-side" aria-label={text.routeCanvasLabel}>
    <div className="dt-path-tools"><input className="dt-path-search" aria-label={text.searchLessonsLabel} placeholder={text.searchPlaceholder} value={query} onChange={(event) => setQuery(event.target.value)} />
      <Button aria-label={text.zoomOutLabel} onClick={() => zoom(1 / 1.2)}>−</Button><span className="dt-path-small" aria-live="polite">{Math.round(viewport.scale * 100)}%</span><Button aria-label={text.zoomInLabel} onClick={() => zoom(1.2)}>+</Button><Button onClick={fit}>{text.fitRoute}</Button><Button disabled={!active} onClick={current}>{text.currentLesson}</Button>
    </div>
    <p id={`${marker}-help`} className="dt-path-sr-only">{text.canvasHelp}</p>
    <div ref={surface} className="dt-path-canvas" tabIndex={0} role="group" aria-label={text.canvasLabel} aria-describedby={`${marker}-help`} data-panning={panning ? 'true' : undefined} onPointerDown={pointerDown} onPointerMove={(event) => { const start = drag.current; if (start?.pointerId === event.pointerId) setViewport((old) => ({ ...old, x: start.startX + event.clientX - start.x, y: start.startY + event.clientY - start.y })) }} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={() => { drag.current = null; setPanning(false) }} onMouseDown={mouseDown} onMouseMove={mouseMove} onMouseUp={mouseUp} onMouseLeave={mouseUp} onKeyDown={canvasKey}>
      <div className="dt-path-stage" style={{ width: layout.width, height: layout.height, transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})` }}>
        <svg className="dt-path-svg" width={layout.width} height={layout.height} role="img" aria-label={text.edgesLabel}>
          <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path className="dt-path-arrow" d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
          {layout.groups.map((group) => <rect key={group.id} className="dt-path-module-bg" x={group.x} y={group.y} width={group.width} height={group.height} rx="14" />)}
          {plan.edges.map((edge) => {
            const from = layout.positions.get(edge.from); const to = layout.positions.get(edge.to)
            if (!from || !to || !matchedIds.has(edge.from) || !matchedIds.has(edge.to)) return null
            const forward = to.y > from.y
            const sameRow = to.y === from.y
            const rightward = to.x > from.x
            const startX = sameRow ? from.x + (rightward ? 276 : 0) : from.x + 138
            const startY = sameRow ? from.y + 46 : from.y + (forward ? 92 : 0)
            const endX = sameRow ? to.x + (rightward ? -4 : 280) : to.x + 138
            const endY = sameRow ? to.y + 46 : to.y + (forward ? -5 : 97)
            const mid = (startY + endY) / 2
            const d = sameRow ? `M${startX},${startY} L${endX},${endY}` : `M${startX},${startY} C${startX},${mid} ${endX},${mid} ${endX},${endY}`
            return <path key={`${edge.from}-${edge.to}`} className="dt-path-edge" data-optional={edge.kind === 'optional' ? 'true' : undefined} d={d} markerEnd={`url(#${marker})`}><title>{text.edgeTitle(text.edgeKind(edge.kind), plan.items.find((item) => item.id === edge.from)?.title, plan.items.find((item) => item.id === edge.to)?.title)}</title></path>
          })}
        </svg>
        {layout.groups.map((group) => <div key={group.id} className="dt-path-module-label" style={{ left: group.x + 12, top: group.y + 9, width: group.width - 24 }}><button type="button" className="dt-path-link" onClick={() => onModule(group.id)}>{plan.modules.find((module) => module.id === group.id)?.title}</button><Button aria-label={text.moduleToggle(collapsed.has(group.id), plan.modules.find((module) => module.id === group.id)?.title)} aria-expanded={!collapsed.has(group.id)} onClick={() => toggleModule(group.id)}>{collapsed.has(group.id) ? text.expand : text.collapse}</Button></div>)}
        {plan.items.map((item, index) => {
          const position = layout.positions.get(item.id)
          if (!position || !matchedIds.has(item.id)) return null
          return <button key={item.id} type="button" className="dt-path-node" style={{ left: position.x, top: position.y }} aria-label={text.overviewLesson(index + 1, item.title)} aria-pressed={selection.kind === 'item' && selection.id === item.id} data-current={active?.itemId === item.id ? 'true' : undefined} onClick={() => onSelect(item.id)}><span className="dt-path-number">{index + 1}</span><span className="dt-path-node-text"><span className="dt-path-node-title">{item.title}</span><span className="dt-path-node-status">{itemStatus(attemptFor(attempts, plan.version, item.id), active?.id ?? null, text)}</span></span></button>
        })}
      </div>
    </div>
    <div className="dt-path-legend"><span><i className="dt-path-legend-line" /> {text.requiredPrerequisite}</span><span><i className="dt-path-legend-line" data-optional="true" /> {text.optionalPrerequisite}</span><span>{text.lessonOrderLegend}</span></div>
    <div className="dt-path-module-controls"><Button onClick={() => setCollapsed(new Set())}>{text.expandAllModules}</Button><Button onClick={() => setCollapsed(new Set(plan.modules.map((module) => module.id)))}>{text.collapseAllModules}</Button></div>
    <h4>{text.allOverviews}</h4><p className="dt-path-muted dt-path-small">{text.allOverviewsHelp}</p>
    {needle && <p role="status">{text.matchingLessons(matches.length)}</p>}
    <div className="dt-path-outline"><ol className="dt-path-ordered" aria-label={text.lessonListLabel}>{plan.items.map((item, index) => !matchedIds.has(item.id) ? null : <li key={item.id} value={index + 1}><button type="button" className="dt-path-row" aria-label={text.browseLesson(index + 1, item.title)} aria-pressed={selection.kind === 'item' && selection.id === item.id} onClick={() => onSelect(item.id)}><span className="dt-path-number">{index + 1}</span><span className="dt-path-row-copy"><strong>{item.title}</strong><small>{plan.modules.find((module) => module.id === item.moduleId)?.title} · {range(item.minutes, text)} · {itemStatus(attemptFor(attempts, plan.version, item.id), active?.id ?? null, text)}</small></span></button></li>)}</ol></div>
  </section>
}

function AttemptHistory({ attempts, curricula, nodes, activeId, onEvidence }: {
  attempts: readonly CourseAttempt[]; curricula: readonly Curriculum[]; nodes: NodeView[]; activeId: string | null; onEvidence: (id: string) => void
}): ReactNode {
  const text = usePathText()
  const lang = useLang()
  return <section className="dt-path-history" aria-label={text.historyLabel}><h4>{text.historyTitle}</h4>
    {!attempts.length && <p className="dt-path-muted">{text.noAttempts}</p>}
    {[...attempts].reverse().map((attempt) => {
      const plan = curricula.find((entry) => entry.version === attempt.version)
      const item = plan?.items.find((entry) => entry.id === attempt.itemId)
      return <details key={attempt.id}><summary><strong>{item?.title ?? attempt.itemId}</strong> · {text.version(attempt.version)} · {text.attemptStatus(attempt.status)}{attempt.id === activeId ? text.currentAttemptSuffix : ''}<br /><span className="dt-path-muted dt-path-small">{when(attempt.startedAt, lang)} · {text.savedUnits(attempt.units.length)}</span></summary>
        <p className="dt-path-small">{text.attemptLabel} <code>{attempt.id}</code> · {text.lessonLabel} <code>{attempt.itemId}</code>{attempt.nodeId && <> · {text.knowledgeLabel} <code>{attempt.nodeId}</code></>}</p>
        {attempt.outcome && <p>{attempt.outcome}</p>}
        {!attempt.prompted && <p className="dt-path-muted">{text.tutorNotReached} {attempt.promptReason ?? text.noReason}</p>}
        {attempt.evidence.map((ref, index) => <button type="button" className="dt-path-link" key={`${ref.nodeId}-${index}`} onClick={() => onEvidence(ref.nodeId)}>{nodes.find((node) => node.id === ref.nodeId)?.title ?? ref.nodeId} · {text.evidence(ref.evidenceIndex + 1)}</button>)}
        {attempt.units.map((unit) => <details key={unit.id} className="dt-path-snapshot"><summary>{unit.lesson.title} · {text.snapshot(unit.id)}</summary><p className="dt-path-muted dt-path-small">{text.savedAt} {when(unit.writtenAt, lang)} · {text.lessonReference} <code>{unit.lesson.id}</code> · {text.nodeLabel} <code>{unit.lesson.nodeId}</code></p>{unit.lesson.blocks.map((block) => <div className="dt-path-snapshot" key={block.id}><span className="dt-path-tag">{block.type} · {block.id}</span><pre>{block.type === 'text' ? block.content.md : block.type === 'example' ? [block.content.title, ...block.content.steps, block.content.takeaway].filter(Boolean).join('\n\n') : block.type === 'diagram' ? [block.content.caption, block.content.spec].filter(Boolean).join('\n') : [block.content.prompt, block.content.hint].filter(Boolean).join('\n\n')}</pre></div>)}</details>)}
      </details>
    })}
  </section>
}

function Overview({ plan, selection, view, nodes, activeAttempt, readOnly, busy, onSelect, onModule, onProject, onStart, onEvidence }: {
  plan: Curriculum; selection: Selection; view: PathView; nodes: NodeView[]; activeAttempt: CourseAttempt | undefined; readOnly: boolean; busy: boolean
  onSelect: (id: string) => void; onModule: (id: string) => void; onProject: () => void; onStart: (version: number, itemId: string, review: boolean) => void; onEvidence: (id: string) => void
}): ReactNode {
  const text = usePathText()
  const attempts = view.run?.attempts ?? []
  const item = selection.kind === 'item' ? plan.items.find((entry) => entry.id === selection.id) : undefined
  const module = selection.kind === 'module' ? plan.modules.find((entry) => entry.id === selection.id) : item ? plan.modules.find((entry) => entry.id === item.moduleId) : undefined
  const completed = new Set(attempts.filter((attempt) => attempt.version === plan.version && attempt.status === 'completed').map((attempt) => attempt.itemId)).size
  const detailRef = useRef<HTMLElement>(null)
  const detailId = useId()
  useEffect(() => { if (selection.kind !== 'project') detailRef.current?.focus({ preventScroll: true }) }, [selection])
  const historyProps = { curricula: view.path.curricula, nodes, activeId: view.run?.activeAttemptId ?? null, onEvidence }
  if (item) {
    const index = plan.items.findIndex((entry) => entry.id === item.id)
    const prior = plan.edges.filter((edge) => edge.to === item.id)
    const itemAttempts = attempts.filter((attempt) => attempt.version === plan.version && attempt.itemId === item.id)
    const last = itemAttempts.at(-1)
    const current = activeAttempt?.version === plan.version && activeAttempt.itemId === item.id && (activeAttempt.status === 'requested' || activeAttempt.status === 'working')
    const accepted = view.path.acceptedVersion === plan.version
    const canStart = accepted || current
    const next = plan.items[index + 1]; const previous = plan.items[index - 1]
    return <section ref={detailRef} tabIndex={-1} className="dt-path-card dt-path-detail" aria-labelledby={detailId}>
      <div className="dt-path-actions"><button type="button" className="dt-path-link" onClick={onProject}>{text.projectOverview}</button>{module && <><span aria-hidden="true">/</span><button type="button" className="dt-path-link" onClick={() => onModule(module.id)}>{module.title}</button></>}</div>
      <p className="dt-path-eyebrow">{text.lessonOf(index + 1, plan.items.length)} · {text.version(plan.version)}</p><h3 id={detailId}>{item.title}</h3><span className="dt-path-tag">{itemStatus(last, view.run?.activeAttemptId ?? null, text)}</span>
      <p>{item.overview}</p><p className="dt-path-muted dt-path-small">{text.lessonIdLabel} <code>{item.id}</code> · {text.estimatedEffortTitle} {range(item.minutes, text)}</p>
      <h4>{text.learnOutcomes}</h4><BulletList values={item.outcomes} />
      <h4>{text.lessonOutline}</h4><ol className="dt-path-list">{item.outline.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}</ol>
      <h4>{text.practice}</h4><p>{item.practice}</p><h4>{text.assessmentHeading}</h4><p>{item.assessment}</p>
      <h4>{text.prerequisites}</h4>{!prior.length && <p className="dt-path-muted">{text.noPrerequisites}</p>}
      <ul className="dt-path-list">{prior.map((edge) => { const source = plan.items.find((entry) => entry.id === edge.from); return <li key={edge.from}><button type="button" className="dt-path-link" onClick={() => onSelect(edge.from)}>{source?.title ?? edge.from}</button> · {text.edgeKind(edge.kind)} · {itemStatus(attemptFor(attempts, plan.version, edge.from), view.run?.activeAttemptId ?? null, text)}</li> })}</ul>
      {prior.some((edge) => edge.kind === 'required' && attemptFor(attempts, plan.version, edge.from)?.status !== 'completed') && <p className="dt-path-muted dt-path-small">{text.somePrerequisitesIncomplete}</p>}
      <h4>{text.linkedKnowledge}</h4><ul className="dt-path-knowledge">{item.nodeIds.map((id) => { const node = nodes.find((entry) => entry.id === id); return <li key={id}><button type="button" className="dt-path-link" onClick={() => onEvidence(id)}>{node?.title ?? id}</button><span className="dt-path-tag">{node ? text.nodeState(node.state) : text.notDiagnosed}</span></li> })}</ul>
      {!item.nodeIds.length && <p className="dt-path-muted">{text.noLinkedNodes}</p>}
      <p className="dt-path-small dt-path-muted">{text.plannedTopics(item.topics.join(' · '))}</p>
      {!itemAttempts.some((attempt) => attempt.units.length > 0) && <p className="dt-path-muted">{text.overviewBeforeTeaching}</p>}
      {!canStart && <p className="dt-path-muted">{text.acceptToStart}</p>}
      {readOnly && <p className="dt-path-muted">{text.startReadOnly}</p>}
      <div className="dt-path-actions"><Button primary disabled={readOnly || busy || !canStart} onClick={() => onStart(plan.version, item.id, false)}>{current ? text.continueLesson : text.startLesson}</Button>{itemAttempts.length > 0 && <Button disabled={readOnly || busy || !canStart} onClick={() => onStart(plan.version, item.id, true)}>{text.reviewLesson}</Button>}</div>
      <div className="dt-path-actions" style={{ marginTop: 15 }}><Button disabled={!previous} onClick={() => previous && onSelect(previous.id)}>{text.previousOverview}</Button><Button disabled={!next} onClick={() => next && onSelect(next.id)}>{text.nextOverview}</Button></div>
      <AttemptHistory attempts={itemAttempts} {...historyProps} />
    </section>
  }
  if (module && selection.kind === 'module') {
    const items = plan.items.filter((entry) => entry.moduleId === module.id)
    const itemIds = new Set(items.map((entry) => entry.id))
    const prerequisiteIds = [...new Set(plan.edges.filter((edge) => itemIds.has(edge.to) && !itemIds.has(edge.from)).map((edge) => edge.from))]
    return <section ref={detailRef} tabIndex={-1} className="dt-path-card dt-path-detail" aria-labelledby={detailId}><button type="button" className="dt-path-link" onClick={onProject}>{text.projectOverview}</button><p className="dt-path-eyebrow">{text.moduleOverview(plan.version)}</p><h3 id={detailId}>{module.title}</h3><p>{module.overview}</p><p className="dt-path-muted">{text.lessons(items.length)} · {text.estimatedEffortLabel} {range(effort(items), text)}</p><h4>{text.moduleOutcomes}</h4><BulletList values={module.outcomes} /><h4>{text.milestoneAssessment}</h4><p>{module.milestone}</p><h4>{text.crossModulePrerequisites}</h4>{prerequisiteIds.length ? <ul className="dt-path-list">{prerequisiteIds.map((id) => <li key={id}><button type="button" className="dt-path-link" onClick={() => onSelect(id)}>{plan.items.find((entry) => entry.id === id)?.title ?? id}</button></li>)}</ul> : <p className="dt-path-muted">{text.noCrossModulePrerequisites}</p>}<h4>{text.lessonOverviews}</h4>{items.map((entry) => <button type="button" className="dt-path-module-card" key={entry.id} onClick={() => onSelect(entry.id)}><strong>{plan.items.findIndex((candidate) => candidate.id === entry.id) + 1}. {entry.title}</strong><small>{range(entry.minutes, text)} · {itemStatus(attemptFor(attempts, plan.version, entry.id), view.run?.activeAttemptId ?? null, text)}</small></button>)}</section>
  }
  return <section ref={detailRef} tabIndex={-1} className="dt-path-card dt-path-detail" aria-labelledby={detailId}><p className="dt-path-eyebrow">{text.projectOverviewVersion(plan.version)}</p><h3 id={detailId}>{plan.title}</h3><span className="dt-path-tag">{view.path.acceptedVersion === plan.version ? text.acceptedRoute : plan.acceptedAt ? text.previouslyAcceptedRoute : text.draftRoute}</span><p>{plan.summary}</p>
    <div className="dt-path-summary"><div><strong>{plan.items.length}</strong><span>{text.plannedLessons}</span></div><div><strong>{completed} / {plan.items.length}</strong><span>{text.completedAttemptLessons}</span></div><div><strong>{range(effort(plan.items), text)}</strong><span>{text.estimatedEffortLabel}</span></div></div>
    <h4>{text.intendedOutcomes}</h4><BulletList values={view.path.brief?.outcomes ?? []} />
    <h4>{text.timePlanHeading}</h4><p>{text.timePlan(view.path.brief)}</p>
    <h4>{text.planningAssumptions}</h4><BulletList values={plan.assumptions} empty={text.noAssumptions} /><h4>{text.whyVersion}</h4><p>{plan.changeReason}</p>
    <h4>{text.modulesAndMilestones}</h4>{plan.modules.map((entry) => <button type="button" key={entry.id} className="dt-path-module-card" onClick={() => onModule(entry.id)}><strong>{entry.title}</strong><small>{text.lessons(plan.items.filter((candidate) => candidate.moduleId === entry.id).length)} · {entry.milestone}</small></button>)}
    {plan.items[0] && <p><button type="button" className="dt-path-link" onClick={() => onSelect(plan.items[0]!.id)}>{text.browseFirstLesson}</button>{activeAttempt?.version === plan.version && <> · <button type="button" className="dt-path-link" onClick={() => onSelect(activeAttempt.itemId)}>{text.browseCurrentLesson}</button></>}</p>}
    <p className="dt-path-muted dt-path-small">{text.completedNote}</p><AttemptHistory attempts={attempts} {...historyProps} />
  </section>
}

/** A keyed inner page isolates pending reads, edits, and navigation per conversation. */
export function PathPage(props: PathPageProps): ReactNode {
  return <PathPageBody key={JSON.stringify([props.courseId, props.sessionId ?? null])} {...props} />
}
function PathPageBody({ courseId, title, nodes, sessionId, onOpenChat, onStarted, onOpenLesson, sessionActivity, client = defaultPathClient }: PathPageProps): ReactNode {
  const text = usePathText()
  const lang = useLang()
  const textRef = useRef(text)
  useEffect(() => { textRef.current = text }, [text])
  const [view, setView] = useState<PathView | null>(null)
  const [draft, setDraft] = useState<GoalDraft>(() => draftFromBrief(null))
  const [dirty, setDirty] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [recovered, setRecovered] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [selection, setSelection] = useState<Selection>({ kind: 'project' })
  const [knowledgeId, setKnowledgeId] = useState<string | null>(null)
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
      setRecovered(next.path.brief !== null)
      setWizardOpen(!ready(next.path.brief))
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
      if (live.current && scope === generation.current && epoch === mutationEpoch.current && sequence === readSequence.current) setPollError(messageOf(failure, textRef.current))
    } finally {
      if (scope === generation.current && sequence === readSequence.current) reading.current = false
    }
  }, [adopt, client, courseId, sessionId])
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
        if (live.current && scope === generation.current) setError(text.staleProjectError)
      } else setError(messageOf(failure, text))
    } finally {
      if (live.current && scope === generation.current) { locked.current = false; setBusy(null) }
    }
  }
  const changeDraft = (field: keyof GoalDraft, value: string) => {
    dirtyRef.current = true; editGeneration.current += 1; setDirty(true)
    setDraft((previous) => ({ ...previous, [field]: value }))
  }
  const saveBrief = (close: boolean) => {
    let brief: GoalBrief
    try { brief = briefFromDraft(draft, text) } catch (failure) { setError(messageOf(failure, text)); return }
    const edit = editGeneration.current
    void mutate('save', (params) => client.saveBrief({ ...params, brief }), (result) => {
      if (edit === editGeneration.current) {
        dirtyRef.current = false; setDirty(false)
        synchronizedBrief.current = JSON.stringify(result.path.brief)
        setDraft(draftFromBrief(result.path.brief))
        if (close) setWizardOpen(false)
      }
      setRecovered(true)
      setNotice(ready(result.path.brief) ? text.goalSaved : text.draftSaved)
    })
  }
  const ask = (kind: 'diagnosis' | 'plan') => {
    const path = currentView.current?.path
    if (!path || dirtyRef.current || !ready(path.brief)) { setError(text.askNeedsGoal); return }
    if (kind === 'plan' && (!path.assessment || path.assessment.briefRevision !== path.briefRevision || !['ready', 'skipped'].includes(path.assessment.status))) { setError(text.askNeedsAssessment); return }
    void mutate(`request-${kind}`, (params) => client.request({ ...params, kind, operationId: operationId() }), (result) => {
      const response = result as PromptedPathView
      if (!response.prompted) setPromptIssue({ kind, message: response.promptReason ?? text.tutorUnreachable })
      else setNotice(text.requestSent(kind))
    })
  }
  const start = (version: number, itemId: string, review: boolean) => {
    void mutate('start', (params) => client.start({ ...params, version, itemId, operationId: operationId(), ...(review ? { review: true } : {}) }), (result) => {
      const response = result as PromptedPathView
      if (!response.prompted) setPromptIssue({ kind: 'start', version, itemId, review, message: response.promptReason ?? text.tutorUnreachable })
      else { setNotice(text.lessonRequested); onStarted?.() }
    })
  }
  const onSelect = (id: string) => setSelection({ kind: 'item', id })
  const onModule = (id: string) => setSelection({ kind: 'module', id })
  const activeAttempt = view?.run?.attempts.find((attempt) => attempt.id === view.run?.activeAttemptId)
  const plan = view?.path.curricula.find((entry) => entry.version === selectedVersion)
  const savedReady = ready(view?.path.brief ?? null)
  const assessmentCurrent = !!view?.path.assessment && view.path.assessment.briefRevision === view.path.briefRevision
  const canPlan = savedReady && assessmentCurrent && ['ready', 'skipped'].includes(view?.path.assessment?.status ?? '') && !dirty && !readOnly && !busy
  const assessment = assessmentCurrent ? view?.path.assessment ?? null : null
  const latestDiagnosis = view?.path.requests.findLast((request) => request.kind === 'diagnosis' && request.briefRevision === view.path.briefRevision)
  const latestPlan = view?.path.requests.findLast((request) => request.kind === 'plan' && request.briefRevision === view.path.briefRevision)
  const diagnosisResolved = !!assessment && assessment.status !== 'in-progress' && (!latestDiagnosis || assessment.updatedAt >= latestDiagnosis.createdAt)
  const planResolved = !!latestPlan && !!view?.path.curricula.some((entry) => entry.briefRevision === view.path.briefRevision && entry.assessmentRevision === view.path.assessmentRevision && entry.createdAt >= latestPlan.createdAt)
  const diagnosisWaiting = !!latestDiagnosis?.prompted && !diagnosisResolved
  const planWaiting = !!latestPlan?.prompted && !planResolved
  const savedPromptFailure = !promptIssue && (latestPlan && !latestPlan.prompted && !planResolved ? latestPlan : latestDiagnosis && !latestDiagnosis.prompted && !diagnosisResolved ? latestDiagnosis : null)
  const knowledge = nodes.find((node) => node.id === knowledgeId)
  const capacity = plan && view ? budget(view.path.brief, plan, view.now, lang) : null
  const versions = view?.path.curricula ?? []
  const busyAction = busy !== null

  type Stage = 'goal' | 'diagnosis' | 'route' | 'learning'
  const diagnosisReady = assessmentCurrent && !!assessment && ['ready', 'skipped'].includes(assessment.status)
  const hasAcceptedRoute = view?.path.acceptedVersion != null
  const stage: Stage = !savedReady ? 'goal' : !diagnosisReady ? 'diagnosis' : hasAcceptedRoute ? 'learning' : 'route'
  const stages: { key: Stage; label: string }[] = [
    { key: 'goal', label: text.stageGoal },
    { key: 'diagnosis', label: text.stageDiagnosis },
    { key: 'route', label: text.stageRoute },
    { key: 'learning', label: text.stageLearning },
  ]
  const stageIndex = stages.findIndex((entry) => entry.key === stage)
  const skipAssessment = () => { void mutate('skip', (params) => client.skipAssessment(params), () => setNotice(text.assessmentSkippedNotice)) }
  const assessmentCard = <AssessmentCard assessment={assessment} nodes={nodes} readyBrief={savedReady} dirty={dirty} readOnly={readOnly} busy={busyAction} waiting={diagnosisWaiting} showActions={false} onRequest={() => ask('diagnosis')} onSkip={skipAssessment} onEvidence={setKnowledgeId} onOpenChat={onOpenChat} />
  const assessmentCardFull = <AssessmentCard assessment={assessment} nodes={nodes} readyBrief={savedReady} dirty={dirty} readOnly={readOnly} busy={busyAction} waiting={diagnosisWaiting} onRequest={() => ask('diagnosis')} onSkip={skipAssessment} onEvidence={setKnowledgeId} onOpenChat={onOpenChat} />
  const routeView = view
  const routeCard = routeView === null ? null : <section className="dt-path-card" aria-label={text.routeProposalsLabel}><div className="dt-path-card-head"><h3>{versions.length ? text.routeVersions : text.buildRoute}</h3>{planWaiting && <span className="dt-path-tag" role="status">{text.waitingProposal}</span>}</div>
    {!versions.length && <p className="dt-path-muted">{text.noVersionsHelp}</p>}
    {!assessmentCurrent && savedReady && <p className="dt-path-muted">{text.needsAssessmentHelp}</p>}
    <div className="dt-path-version-row">{versions.length > 0 && <label>{text.routeToBrowse}<select className="dt-path-version" aria-label={text.routeVersionToBrowse} value={selectedVersion ?? ''} onChange={(event) => { setSelectedVersion(Number(event.target.value)); setSelection({ kind: 'project' }) }}>{versions.map((entry) => <option key={entry.version} value={entry.version}>{text.versionOption(entry.version, entry.version === routeView.path.acceptedVersion, entry.acceptedAt !== null, entry.title)}</option>)}</select></label>}{stage !== 'route' && <><Button disabled={!canPlan} onClick={() => ask('plan')}>{planWaiting ? text.requestPlanAgain : versions.length ? text.requestRevisedPlan : text.requestRouteProposal}</Button>{plan && plan.version !== routeView.path.acceptedVersion && <Button primary disabled={readOnly || busyAction || dirty || plan.briefRevision !== routeView.path.briefRevision || plan.assessmentRevision !== routeView.path.assessmentRevision} onClick={() => acceptVersion(plan.version)}>{text.acceptRouteVersion(plan.version)}</Button>}</>}</div>
    {plan && <p className="dt-path-small dt-path-muted">{plan.version === routeView.path.acceptedVersion ? text.routeAcceptedHelp : text.routeProposalHelp}{plan.briefRevision !== routeView.path.briefRevision || plan.assessmentRevision !== routeView.path.assessmentRevision ? text.routeRevisionWarning : ''}</p>}
    {versions.some((entry) => entry.version > (selectedVersion ?? 0) && !entry.acceptedAt) && <p className="dt-path-muted">{text.newerDraftHelp}</p>}
  </section>
  const pinnedCard = activeAttempt && view ? <section className="dt-path-card" data-current="true" aria-label={text.pinnedLessonLabel}><p className="dt-path-eyebrow">{text.pinnedAttemptEyebrow}</p><h3>{view.path.curricula.find((entry) => entry.version === activeAttempt.version)?.items.find((item) => item.id === activeAttempt.itemId)?.title ?? activeAttempt.itemId}</h3><p>{text.routeVersion(activeAttempt.version)} · {text.attemptStatus(activeAttempt.status)} · {text.attemptWord} <code>{activeAttempt.id}</code></p>{view.path.acceptedVersion !== null && view.path.acceptedVersion !== activeAttempt.version && <p>{text.newerAcceptedRoute(view.path.acceptedVersion, activeAttempt.version)}</p>}<div className="dt-path-actions"><Button onClick={() => { setSelectedVersion(activeAttempt.version); onSelect(activeAttempt.itemId) }}>{text.viewPinnedOverview}</Button>{view.path.acceptedVersion !== null && view.path.acceptedVersion !== activeAttempt.version && <Button onClick={() => { setSelectedVersion(view.path.acceptedVersion); setSelection({ kind: 'project' }) }}>{text.browseAcceptedVersion(view.path.acceptedVersion)}</Button>}{onOpenChat && <Button onClick={onOpenChat}>{text.openCurrentConversation}</Button>}</div></section> : null
  const assessmentFold = <details className="dt-path-fold"><summary>{text.diagnosisDoneSummary} · {text.assessmentStatus(assessment?.status ?? 'ready')}</summary>{assessmentCardFull}</details>
  const routeFold = <details className="dt-path-fold"><summary>{text.routeSettingsSummary}</summary>{routeCard}</details>
  const staleAssessment = view?.path.assessment && !assessmentCurrent ? <p className="dt-path-muted">{text.assessmentStale}</p> : null
  const pinnedAlert = activeAttempt && !activeAttempt.prompted && !promptIssue ? <div className="dt-path-alert" role="alert">{text.pinnedRequestFailed} {activeAttempt.promptReason ?? text.noReason} <Button disabled={busyAction || readOnly} onClick={() => start(activeAttempt.version, activeAttempt.itemId, false)}>{text.retryCurrentLesson}</Button></div> : null
  const knowledgeCard = knowledgeId ? <section className="dt-path-card" aria-label={text.knowledgeReferenceLabel}><div className="dt-path-card-head"><h3>{knowledge?.title ?? knowledgeId}</h3><Button onClick={() => setKnowledgeId(null)}>{text.closeKnowledgeReference}</Button></div><p><span className="dt-path-tag">{knowledge ? text.nodeState(knowledge.state) : text.notDiagnosed}</span> · {text.evidenceEntries(knowledge?.evidenceCount ?? 0)}</p><p className="dt-path-muted">{text.knowledgeIdLabel} <code>{knowledgeId}</code>{text.knowledgeIdHelp}</p></section> : null
  const capacityLine = capacity ? <p className="dt-path-muted dt-path-small">{text.capacityTitle(range(capacity, text))} · {capacity.available === null ? text.capacityNeedBudget : text.capacityAvailable(minutes(capacity.available, text))}</p> : null
  const capacityCard = capacity?.tight ? <section className="dt-path-card dt-path-conflict" aria-label={text.capacityLabel}><p>{capacity.conflict ? text.conflictMinimum : text.conflictMaximum} {text.conflictAdvice}</p><div className="dt-path-actions"><Button onClick={() => { setStep(0); setWizardOpen(true) }}>{text.editGoalScope}</Button><Button onClick={() => { setStep(2); setWizardOpen(true) }}>{text.editTimeBudget}</Button><Button disabled={!canPlan} onClick={() => ask('plan')}>{text.requestAdjustedPlan}</Button></div></section> : null
  const workspaceEl = plan && view ? <div className="dt-path-workspace"><RouteCanvas key={plan.version} plan={plan} selection={selection} activeAttempt={activeAttempt} attempts={view.run?.attempts ?? []} onSelect={onSelect} onModule={onModule} /><Overview plan={plan} selection={selection} view={view} nodes={nodes} activeAttempt={activeAttempt} readOnly={readOnly} busy={busyAction} onSelect={onSelect} onModule={onModule} onProject={() => setSelection({ kind: 'project' })} onStart={start} onEvidence={setKnowledgeId} /></div> : null
  const acceptVersion = (version: number) => {
    void mutate('accept', (params) => client.accept({ ...params, version }), () => setNotice(text.routeAcceptedNotice(version)))
  }
  const diagnosisFailure = diagnosisWaiting && sessionActivity !== undefined && !sessionActivity.running
    ? sessionActivity.lastAgentError
    : null
  const acceptedPlan = view?.path.curricula.find((entry) => entry.version === view.path.acceptedVersion) ?? null
  const activeLessonTitle = view && activeAttempt
    ? view.path.curricula.find((entry) => entry.version === activeAttempt.version)?.items.find((item) => item.id === activeAttempt.itemId)?.title ?? activeAttempt.itemId
    : null
  type NextAction = { label: string; run: () => void; disabled?: boolean }
  const nextStep: { step: number; title: string; body: string; primary?: NextAction; secondary?: NextAction } | null = (() => {
    if (!view || readOnly) return null
    if (!savedReady) return {
      step: 1, title: text.nextGoalTitle, body: text.nextGoalBody,
      primary: { label: text.nextSetGoal, run: () => setWizardOpen(true) },
    }
    if (diagnosisWaiting) {
      const running = sessionActivity?.running === true
      return {
        step: 2,
        title: running ? text.nextWaitingRunningTitle : text.nextWaitingTitle,
        body: running ? text.nextWaitingRunningBody : text.nextWaitingBody,
        ...(onOpenChat ? { primary: { label: text.openConversation, run: onOpenChat } } : {}),
        secondary: { label: text.skipAssessment, run: skipAssessment, disabled: busyAction },
      }
    }
    if (!diagnosisReady) return {
      step: 2, title: text.nextDiagnosisTitle, body: text.nextDiagnosisBody,
      primary: { label: text.nextRequestDiagnosis, run: () => ask('diagnosis'), disabled: busyAction || dirty },
      secondary: { label: text.skipAssessment, run: skipAssessment, disabled: busyAction },
    }
    if (!hasAcceptedRoute) {
      if (planWaiting) return {
        step: 3, title: text.nextRouteWaitingTitle, body: text.nextRouteWaitingBody,
        ...(onOpenChat ? { primary: { label: text.openConversation, run: onOpenChat } } : {}),
      }
      if (plan !== undefined && plan.briefRevision === view.path.briefRevision && plan.assessmentRevision === view.path.assessmentRevision) return {
        step: 3, title: text.nextProposalTitle, body: text.nextProposalBody(plan.version),
        primary: { label: text.nextAcceptVersion(plan.version), run: () => acceptVersion(plan.version), disabled: busyAction || dirty },
        secondary: { label: text.requestRevisedPlan, run: () => ask('plan'), disabled: !canPlan },
      }
      return {
        step: 3, title: text.nextRouteTitle, body: text.nextRouteBody,
        primary: { label: text.nextRequestRoute, run: () => ask('plan'), disabled: !canPlan },
      }
    }
    const acceptedVersion = view.path.acceptedVersion
    if (activeAttempt !== undefined && activeLessonTitle !== null) {
      const run = onOpenLesson ?? onOpenChat
      return {
        step: 4, title: text.nextContinueTitle, body: text.nextContinueBody(activeLessonTitle),
        ...(run === undefined ? {} : { primary: { label: onOpenLesson === undefined ? text.openConversation : text.nextOpenLesson, run } }),
      }
    }
    const firstLesson = acceptedPlan?.items[0]
    if (acceptedVersion !== null && firstLesson !== undefined) return {
      step: 4, title: text.nextAcceptedTitle, body: text.nextAcceptedBody(firstLesson.title),
      primary: { label: text.nextStartFirst, run: () => start(acceptedVersion, firstLesson.id, false), disabled: busyAction },
    }
    return {
      step: 4, title: text.nextAcceptedTitle, body: text.stageLearningHint,
      ...(onOpenChat ? { primary: { label: text.openConversation, run: onOpenChat } } : {}),
    }
  })()

  return <div className="dt-path-page" aria-label={text.pageLabel(title)}>
    <header className="dt-path-header"><div><p className="dt-path-eyebrow">{text.learningPath}</p><h2>{title}</h2><p className="dt-path-muted">{text.learningPathIntro}</p></div><div className="dt-path-actions"><Button onClick={() => setSelection({ kind: 'project' })}>{text.projectOverview}</Button><Button aria-expanded={wizardOpen} onClick={() => setWizardOpen((open) => !open)}>{text.goalAndTimeSettings}</Button></div></header>
    {readOnly && <div className="dt-path-status" role="note">{text.readOnlyNotice}</div>}
    {error && <div className="dt-path-alert" role="alert">{error}</div>}
    {pollError && <div className="dt-path-alert" role="status">{view ? text.updatesPaused : text.couldNotLoadPath}{pollError} <button type="button" className="dt-path-link" onClick={() => { void refresh() }}>{text.retryLoading}</button></div>}
    {notice && <div className="dt-path-status" role="status">{notice}</div>}
    {promptIssue && <div className="dt-path-alert" role="alert">{text.requestSavedTutorUnreached}{promptIssue.message} <Button disabled={busyAction || readOnly} onClick={() => { if (promptIssue.kind === 'start') start(promptIssue.version, promptIssue.itemId, promptIssue.review); else ask(promptIssue.kind) }}>{text.retryTutorRequest}</Button><p className="dt-path-small">{text.retryTutorHelp}</p></div>}
    {savedPromptFailure && <div className="dt-path-alert" role="alert">{text.previousRequestFailed(savedPromptFailure.kind)} {savedPromptFailure.reason ?? text.noReason} <Button disabled={busyAction || readOnly || dirty} onClick={() => ask(savedPromptFailure.kind)}>{text.retryTutorRequest}</Button></div>}
    {!view ? !pollError && <p className="dt-path-status" role="status">{text.loadingPath}</p> : <div className="dt-path-body">
      {wizardOpen && <GoalWizard draft={draft} step={step} dirty={dirty} recovered={recovered} busy={busy === 'save'} readOnly={readOnly} onChange={changeDraft} onStep={setStep} onSave={saveBrief} onClose={() => setWizardOpen(false)} />}
      {!wizardOpen && dirty && <div className="dt-path-card"><p>{text.unsavedKept}</p><Button onClick={() => setWizardOpen(true)}>{text.returnToDraft}</Button></div>}
      <div className="dt-path-stagebar" aria-label={text.stagebarLabel}>
        <ol>{stages.map((entry, index) => {
          const state = index < stageIndex ? 'done' : index === stageIndex ? 'current' : 'pending'
          return <li key={entry.key} data-state={state}><span className="dt-path-stage-number">{index + 1}</span><span>{entry.label}</span><small>{state === 'done' ? text.stageDone : state === 'current' ? text.stageCurrent : text.stagePending}</small></li>
        })}</ol>
      </div>
      {nextStep && <section className="dt-path-next" aria-label={text.nextStepEyebrow}>
        <div className="dt-path-next-copy">
          <p className="dt-path-eyebrow">{text.nextStepEyebrow} · {text.nextStepProgress(nextStep.step, stages.length)}</p>
          <h3>{nextStep.title}</h3>
          <p>{nextStep.body}</p>
        </div>
        {(nextStep.primary || nextStep.secondary) && <div className="dt-path-next-actions">
          {nextStep.primary && <Button primary disabled={nextStep.primary.disabled} onClick={nextStep.primary.run}>{nextStep.primary.label}</Button>}
          {nextStep.secondary && <Button disabled={nextStep.secondary.disabled} onClick={nextStep.secondary.run}>{nextStep.secondary.label}</Button>}
        </div>}
      </section>}
      {diagnosisFailure !== null && <div className="dt-path-alert" role="alert">
        <p>{text.diagnosisFailed(diagnosisFailure)}</p>
        <div className="dt-path-actions">
          <Button primary disabled={busyAction || dirty} onClick={() => ask('diagnosis')}>{text.nextRetryDiagnosis}</Button>
          <Button disabled={busyAction} onClick={skipAssessment}>{text.skipAssessment}</Button>
        </div>
      </div>}
      {pinnedCard}
      {stage === 'diagnosis' && !diagnosisWaiting && assessmentCard}
      {stage !== 'goal' && staleAssessment}
      {pinnedAlert}
      {knowledgeCard}
      {stage === 'route' && <>
        {diagnosisReady && assessmentFold}
        {versions.length > 0 && routeCard}
        {capacityLine}
        {capacityCard}
        {workspaceEl}
      </>}
      {stage === 'learning' && <>
        {plan ? workspaceEl : null}
        {capacityLine}
        {capacityCard}
        {diagnosisReady && assessmentFold}
        {diagnosisReady && routeFold}
      </>}

    </div>}
  </div>
}
