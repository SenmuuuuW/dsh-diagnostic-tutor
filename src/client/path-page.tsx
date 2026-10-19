/** Curriculum browsing and explicit learner actions; never selects a project. */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent, ReactNode } from 'react'
import type { NodeView } from '../contract.js'
import type { Assessment, CourseAttempt, Curriculum, CurriculumItem, GoalBrief, PathView } from '../path.js'
import { defaultPathClient, PathClientError } from './path-client.js'
import type { PathClient, PathWriteParams, PromptedPathView } from './path-client.js'

export interface PathPageProps {
  courseId: string
  title: string
  nodes: NodeView[]
  sessionId?: string | undefined
  onOpenChat?: (() => void) | undefined
  onStarted?: (() => void) | undefined
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
const STEPS = ['Goal', 'Background', 'Time', 'Preferences']

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
function numericDraft(value: string, label: string, min: number, max: number): number | null {
  if (!value.trim()) return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be a whole number from ${min} to ${max}, or left blank.`)
  return number
}
function briefFromDraft(draft: GoalDraft): GoalBrief {
  const timeZone = draft.timeZone.trim()
  try { new Intl.DateTimeFormat('en', { timeZone }).format() } catch { throw new Error('Enter a valid IANA time zone, such as America/New_York or UTC.') }
  if (!timeZone) throw new Error('Choose a time zone before saving.')
  const targetDate = draft.timeKind === 'date' ? draft.targetDate || null : null
  const durationWeeks = draft.timeKind === 'weeks' ? numericDraft(draft.durationWeeks, 'Duration in weeks', 1, 260) : null
  if (draft.timeKind === 'date' && (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || Number.isNaN(Date.parse(`${targetDate}T12:00:00Z`)) || new Date(`${targetDate}T12:00:00Z`).toISOString().slice(0, 10) !== targetDate)) {
    throw new Error('Choose a valid target date, or select No deadline.')
  }
  if (draft.timeKind === 'weeks' && durationWeeks === null) throw new Error('Enter a duration in weeks, or select No deadline.')
  const outcomes = draft.outcomes.split('\n').map((line) => line.trim()).filter(Boolean)
  if (outcomes.length > 20 || outcomes.some((line) => line.length > 2000)) throw new Error('Use up to 20 outcomes, with at most 2,000 characters each.')
  return {
    purpose: draft.purpose, outcomes, background: draft.background, timeZone, targetDate, durationWeeks,
    deadline: draft.timeKind === 'none' ? 'none' : draft.deadline,
    weeklyMinutes: numericDraft(draft.weeklyMinutes, 'Weekly minutes', 15, 10080),
    sessionMinutes: numericDraft(draft.sessionMinutes, 'Session minutes', 5, 480), preferences: draft.preferences,
  }
}
function ready(brief: GoalBrief | null): boolean { return !!brief?.purpose.trim() && !!brief.outcomes.length }
function operationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `path-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'The request could not be completed.' }
function effort(items: readonly CurriculumItem[]): { min: number; max: number } {
  return items.reduce((total, item) => ({ min: total.min + item.minutes.min, max: total.max + item.minutes.max }), { min: 0, max: 0 })
}
function minutes(value: number): string {
  if (value < 120) return `${value} min`
  return `${Number((value / 60).toFixed(1))} h`
}
function range(value: { min: number; max: number }): string { return `${minutes(value.min)}–${minutes(value.max)}` }
function budget(brief: GoalBrief | null, plan: Curriculum, now: string) {
  const total = effort(plan.items)
  let weeks = brief?.durationWeeks ?? null
  if (brief?.targetDate) {
    try {
      const parts = new Intl.DateTimeFormat('en', { timeZone: brief.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now))
      const value = (part: string) => parts.find((entry) => entry.type === part)?.value
      const today = `${value('year')}-${value('month')}-${value('day')}`
      weeks = Math.max(0, (Date.parse(`${brief.targetDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 604800000)
    } catch { weeks = null }
  }
  const available = weeks === null || !brief?.weeklyMinutes ? null : Math.floor(weeks * brief.weeklyMinutes)
  return { ...total, available, conflict: available !== null && total.min > available, tight: available !== null && total.max > available }
}
function when(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
function attemptFor(attempts: readonly CourseAttempt[], version: number, itemId: string): CourseAttempt | undefined {
  return [...attempts].reverse().find((attempt) => attempt.version === version && attempt.itemId === itemId)
}
function itemStatus(attempt: CourseAttempt | undefined, activeId: string | null): string {
  if (!attempt) return 'Planned · overview available'
  if (attempt.id === activeId && attempt.status !== 'completed' && attempt.status !== 'interrupted') return `Current · ${attempt.status}`
  return attempt.status === 'completed' ? 'Completed attempt' : attempt.status === 'interrupted' ? 'Interrupted attempt' : attempt.status
}
function BulletList({ values, empty }: { values: readonly string[]; empty?: string }): ReactNode {
  return values.length ? <ul className="dt-path-list">{values.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p className="dt-path-muted">{empty ?? 'Not recorded yet.'}</p>
}
function Button({ children, primary, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }): ReactNode {
  return <button type="button" className="dt-path-button" data-primary={primary ? 'true' : undefined} {...props}>{children}</button>
}

function GoalWizard({ draft, step, dirty, recovered, busy, readOnly, onChange, onStep, onSave, onClose }: {
  draft: GoalDraft; step: number; dirty: boolean; recovered: boolean; busy: boolean; readOnly: boolean
  onChange: (field: keyof GoalDraft, value: string) => void; onStep: (step: number) => void
  onSave: (close: boolean) => void; onClose: () => void
}): ReactNode {
  const formId = useId()
  const field = (name: keyof GoalDraft) => ({ id: `${formId}-${name}`, value: draft[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(name, event.target.value), disabled: readOnly })
  return <form className="dt-path-card dt-path-wizard" aria-label="Learning goal wizard" noValidate onSubmit={(event: FormEvent) => { event.preventDefault(); onSave(false) }}>
    <div className="dt-path-card-head"><div><p className="dt-path-eyebrow">Your goal and time</p><h3>Build a route around what you want to do</h3></div><Button onClick={onClose}>Close wizard</Button></div>
    <p className="dt-path-muted">Save at any step. You can leave your purpose, outcomes, background, budget, and preferences unfinished.</p>
    {recovered && <p className="dt-path-small" role="status">Saved goal draft recovered from this project.</p>}
    <ol className="dt-path-steps" aria-label="Goal wizard steps">{STEPS.map((title, index) => <li key={title}><button type="button" className="dt-path-step" aria-current={step === index ? 'step' : undefined} onClick={() => onStep(index)}>{index + 1}. {title}</button></li>)}</ol>
    <div className="dt-path-fields">
      {step === 0 && <>
        <label className="dt-path-field" data-wide="true" htmlFor={`${formId}-purpose`}>What will you use this for?<textarea {...field('purpose')} maxLength={2000} placeholder="A work project, exam, interview, or something you want to understand…" /><small>The situation and why it matters to you. You can decide later.</small></label>
        <label className="dt-path-field" data-wide="true" htmlFor={`${formId}-outcomes`}>What should you be able to do?<textarea {...field('outcomes')} placeholder="One observable outcome per line, such as implement a model and explain its errors." /><small>Describe something you could explain, solve, build, or apply. Blank is fine for a draft.</small></label>
      </>}
      {step === 1 && <label className="dt-path-field" data-wide="true" htmlFor={`${formId}-background`}>What have you already studied or tried?<textarea {...field('background')} maxLength={4000} placeholder="What feels familiar? What is difficult or uncertain?" /><small>This is your self-report. The tutor will distinguish it from observed evidence.</small></label>}
      {step === 2 && <>
        <label className="dt-path-field" htmlFor={`${formId}-timeKind`}>Target time<select {...field('timeKind')}><option value="none">No deadline / not sure yet</option><option value="date">A target date</option><option value="weeks">A number of weeks</option></select></label>
        <label className="dt-path-field" htmlFor={`${formId}-timeZone`}>Time zone<input {...field('timeZone')} maxLength={200} placeholder="America/New_York" /><small>IANA time zone; saved alongside your date.</small></label>
        {draft.timeKind === 'date' && <label className="dt-path-field" htmlFor={`${formId}-targetDate`}>Target date<input {...field('targetDate')} type="date" /></label>}
        {draft.timeKind === 'weeks' && <label className="dt-path-field" htmlFor={`${formId}-durationWeeks`}>Duration in weeks<input {...field('durationWeeks')} type="number" min={1} max={260} placeholder="For example, 8" /></label>}
        {draft.timeKind !== 'none' && <label className="dt-path-field" htmlFor={`${formId}-deadline`}>How firm is this time?<select {...field('deadline')}><option value="flexible">Flexible target</option><option value="fixed">Fixed deadline</option></select></label>}
        <label className="dt-path-field" htmlFor={`${formId}-weeklyMinutes`}>Minutes available each week<input {...field('weeklyMinutes')} type="number" min={15} max={10080} placeholder="Not sure yet" /><small>Include practice and review.</small></label>
        <label className="dt-path-field" htmlFor={`${formId}-sessionMinutes`}>Preferred minutes per session<input {...field('sessionMinutes')} type="number" min={5} max={480} placeholder="Not sure yet" /></label>
      </>}
      {step === 3 && <label className="dt-path-field" data-wide="true" htmlFor={`${formId}-preferences`}>Materials, language, scope, and learning preferences<textarea {...field('preferences')} maxLength={2000} placeholder="Topics to include, a textbook you use, preferred language, or the kinds of practice you want…" /></label>}
    </div>
    <div className="dt-path-actions">
      <Button disabled={step === 0} onClick={() => onStep(step - 1)}>Back</Button>
      {step < STEPS.length - 1 && <Button onClick={() => onStep(step + 1)}>Next</Button>}
      <Button type="submit" primary disabled={busy || readOnly}>{busy ? 'Saving…' : 'Save draft'}</Button>
      <Button disabled={busy || readOnly} onClick={() => onSave(true)}>Save and close</Button>
      <span className="dt-path-muted dt-path-small">{dirty ? 'Unsaved changes' : recovered ? 'Saved to this project' : 'Draft not saved yet'}</span>
    </div>
    {readOnly && <p className="dt-path-muted">Open a conversation with this project selected to save your goal.</p>}
  </form>
}

function AssessmentCard({ assessment, nodes, readyBrief, dirty, readOnly, busy, waiting, onRequest, onSkip, onEvidence, onOpenChat }: {
  assessment: Assessment | null; nodes: NodeView[]; readyBrief: boolean; dirty: boolean; readOnly: boolean; busy: boolean; waiting: boolean
  onRequest: () => void; onSkip: () => void; onEvidence: (id: string) => void; onOpenChat?: (() => void) | undefined
}): ReactNode {
  const disabled = readOnly || busy || !readyBrief || dirty
  return <section className="dt-path-card" aria-label="Initial diagnosis">
    <div className="dt-path-card-head"><h3>Initial diagnosis</h3><span className="dt-path-tag">{assessment?.status ?? 'Not requested'}</span></div>
    {assessment ? <>
      <p>{assessment.summary}</p>
      {assessment.status === 'skipped' && <p className="dt-path-muted">You chose to skip the initial assessment. Some foundations remain unverified; the route should make those assumptions visible.</p>}
      <div className="dt-path-columns"><div><h4>Strengths</h4><BulletList values={assessment.strengths} empty="No strengths recorded yet." /></div><div><h4>Gaps</h4><BulletList values={assessment.gaps} empty="No gaps recorded yet." /></div><div><h4>Uncertainties</h4><BulletList values={assessment.uncertainties} empty="No uncertainties recorded yet." /></div></div>
      {assessment.evidence.length > 0 && <><h4>Evidence references</h4><div className="dt-path-evidence">{assessment.evidence.map((ref, index) => <button type="button" className="dt-path-link" key={`${ref.nodeId}-${ref.evidenceIndex}-${index}`} onClick={() => onEvidence(ref.nodeId)}>{nodes.find((node) => node.id === ref.nodeId)?.title ?? ref.nodeId} · evidence {ref.evidenceIndex + 1}</button>)}</div></>}
    </> : <p className="dt-path-muted">The tutor uses your answers and existing evidence to choose a useful starting point. Background notes are self-reports until checked.</p>}
    {waiting && <p role="status">Diagnosis requested. Waiting for the tutor in your conversation.</p>}
    {!readyBrief && <p className="dt-path-muted">Save a purpose and at least one observable outcome before requesting diagnosis.</p>}
    {dirty && <p className="dt-path-muted">Save your goal edits before requesting the tutor.</p>}
    <div className="dt-path-actions"><Button disabled={disabled} onClick={onRequest}>{waiting ? 'Request diagnosis again' : assessment ? 'Request a new diagnosis' : 'Request diagnosis'}</Button>
      {assessment?.status !== 'skipped' && <Button disabled={disabled} onClick={onSkip}>Skip initial assessment</Button>}
      {onOpenChat && <Button onClick={onOpenChat}>Open conversation</Button>}
    </div>
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
  return <section className="dt-path-map-side" aria-label="Curriculum route and lesson list">
    <div className="dt-path-tools"><input className="dt-path-search" aria-label="Search curriculum lessons" placeholder="Search lessons or topics" value={query} onChange={(event) => setQuery(event.target.value)} />
      <Button aria-label="Zoom out curriculum" onClick={() => zoom(1 / 1.2)}>−</Button><span className="dt-path-small" aria-live="polite">{Math.round(viewport.scale * 100)}%</span><Button aria-label="Zoom in curriculum" onClick={() => zoom(1.2)}>+</Button><Button onClick={fit}>Fit route</Button><Button disabled={!active} onClick={current}>Current lesson</Button>
    </div>
    <p id={`${marker}-help`} className="dt-path-sr-only">Drag the canvas to pan. Focus the canvas and use arrow keys to pan, plus or minus to zoom, or Home to fit. Every lesson is also available in the ordered list below.</p>
    <div ref={surface} className="dt-path-canvas" tabIndex={0} role="group" aria-label="Curriculum route canvas" aria-describedby={`${marker}-help`} data-panning={panning ? 'true' : undefined} onPointerDown={pointerDown} onPointerMove={(event) => { const start = drag.current; if (start?.pointerId === event.pointerId) setViewport((old) => ({ ...old, x: start.startX + event.clientX - start.x, y: start.startY + event.clientY - start.y })) }} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={() => { drag.current = null; setPanning(false) }} onMouseDown={mouseDown} onMouseMove={mouseMove} onMouseUp={mouseUp} onMouseLeave={mouseUp} onKeyDown={canvasKey}>
      <div className="dt-path-stage" style={{ width: layout.width, height: layout.height, transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})` }}>
        <svg className="dt-path-svg" width={layout.width} height={layout.height} role="img" aria-label="Directed prerequisite connections; solid lines are required and dashed lines are optional">
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
            return <path key={`${edge.from}-${edge.to}`} className="dt-path-edge" data-optional={edge.kind === 'optional' ? 'true' : undefined} d={d} markerEnd={`url(#${marker})`}><title>{edge.kind} prerequisite: {plan.items.find((item) => item.id === edge.from)?.title} to {plan.items.find((item) => item.id === edge.to)?.title}</title></path>
          })}
        </svg>
        {layout.groups.map((group) => <div key={group.id} className="dt-path-module-label" style={{ left: group.x + 12, top: group.y + 9, width: group.width - 24 }}><button type="button" className="dt-path-link" onClick={() => onModule(group.id)}>{plan.modules.find((module) => module.id === group.id)?.title}</button><Button aria-label={`${collapsed.has(group.id) ? 'Expand' : 'Collapse'} module ${plan.modules.find((module) => module.id === group.id)?.title}`} aria-expanded={!collapsed.has(group.id)} onClick={() => toggleModule(group.id)}>{collapsed.has(group.id) ? 'Expand' : 'Collapse'}</Button></div>)}
        {plan.items.map((item, index) => {
          const position = layout.positions.get(item.id)
          if (!position || !matchedIds.has(item.id)) return null
          return <button key={item.id} type="button" className="dt-path-node" style={{ left: position.x, top: position.y }} aria-label={`Overview lesson ${index + 1}: ${item.title}`} aria-pressed={selection.kind === 'item' && selection.id === item.id} data-current={active?.itemId === item.id ? 'true' : undefined} onClick={() => onSelect(item.id)}><span className="dt-path-number">{index + 1}</span><span className="dt-path-node-text"><span className="dt-path-node-title">{item.title}</span><span className="dt-path-node-status">{itemStatus(attemptFor(attempts, plan.version, item.id), active?.id ?? null)}</span></span></button>
        })}
      </div>
    </div>
    <div className="dt-path-legend"><span><i className="dt-path-legend-line" /> Required prerequisite →</span><span><i className="dt-path-legend-line" data-optional="true" /> Optional prerequisite →</span><span>Numbers show recommended lesson order</span></div>
    <div className="dt-path-module-controls"><Button onClick={() => setCollapsed(new Set())}>Expand all modules</Button><Button onClick={() => setCollapsed(new Set(plan.modules.map((module) => module.id)))}>Collapse all modules</Button></div>
    <h4>All lesson Overviews</h4><p className="dt-path-muted dt-path-small">Browse any lesson. Opening an Overview keeps your current lesson in place.</p>
    {needle && <p role="status">{matches.length} matching {matches.length === 1 ? 'lesson' : 'lessons'}. The list includes results from collapsed modules.</p>}
    <div className="dt-path-outline"><ol className="dt-path-ordered" aria-label="Curriculum lesson list">{plan.items.map((item, index) => !matchedIds.has(item.id) ? null : <li key={item.id} value={index + 1}><button type="button" className="dt-path-row" aria-label={`Browse lesson ${index + 1}: ${item.title}`} aria-pressed={selection.kind === 'item' && selection.id === item.id} onClick={() => onSelect(item.id)}><span className="dt-path-number">{index + 1}</span><span className="dt-path-row-copy"><strong>{item.title}</strong><small>{plan.modules.find((module) => module.id === item.moduleId)?.title} · {range(item.minutes)} · {itemStatus(attemptFor(attempts, plan.version, item.id), active?.id ?? null)}</small></span></button></li>)}</ol></div>
  </section>
}

function AttemptHistory({ attempts, curricula, nodes, activeId, onEvidence }: {
  attempts: readonly CourseAttempt[]; curricula: readonly Curriculum[]; nodes: NodeView[]; activeId: string | null; onEvidence: (id: string) => void
}): ReactNode {
  return <section className="dt-path-history" aria-label="Lesson attempt history"><h4>Lesson attempts and saved teaching units</h4>
    {!attempts.length && <p className="dt-path-muted">No lesson attempts recorded in this conversation.</p>}
    {[...attempts].reverse().map((attempt) => {
      const plan = curricula.find((entry) => entry.version === attempt.version)
      const item = plan?.items.find((entry) => entry.id === attempt.itemId)
      return <details key={attempt.id}><summary><strong>{item?.title ?? attempt.itemId}</strong> · version {attempt.version} · {attempt.status}{attempt.id === activeId ? ' · current attempt' : ''}<br /><span className="dt-path-muted dt-path-small">{when(attempt.startedAt)} · {attempt.units.length} saved {attempt.units.length === 1 ? 'unit' : 'units'}</span></summary>
        <p className="dt-path-small">Attempt <code>{attempt.id}</code> · lesson <code>{attempt.itemId}</code>{attempt.nodeId && <> · knowledge <code>{attempt.nodeId}</code></>}</p>
        {attempt.outcome && <p>{attempt.outcome}</p>}
        {!attempt.prompted && <p className="dt-path-muted">Tutor was not reached: {attempt.promptReason ?? 'No reason supplied.'}</p>}
        {attempt.evidence.map((ref, index) => <button type="button" className="dt-path-link" key={`${ref.nodeId}-${index}`} onClick={() => onEvidence(ref.nodeId)}>{nodes.find((node) => node.id === ref.nodeId)?.title ?? ref.nodeId} · evidence {ref.evidenceIndex + 1}</button>)}
        {attempt.units.map((unit) => <details key={unit.id} className="dt-path-snapshot"><summary>{unit.lesson.title} · snapshot {unit.id}</summary><p className="dt-path-muted dt-path-small">Saved {when(unit.writtenAt)} · lesson reference <code>{unit.lesson.id}</code> · node <code>{unit.lesson.nodeId}</code></p>{unit.lesson.blocks.map((block) => <div className="dt-path-snapshot" key={block.id}><span className="dt-path-tag">{block.type} · {block.id}</span><pre>{block.type === 'text' ? block.content.md : block.type === 'example' ? [block.content.title, ...block.content.steps, block.content.takeaway].filter(Boolean).join('\n\n') : block.type === 'diagram' ? [block.content.caption, block.content.spec].filter(Boolean).join('\n') : [block.content.prompt, block.content.hint].filter(Boolean).join('\n\n')}</pre></div>)}</details>)}
      </details>
    })}
  </section>
}

function Overview({ plan, selection, view, nodes, activeAttempt, readOnly, busy, onSelect, onModule, onProject, onStart, onEvidence }: {
  plan: Curriculum; selection: Selection; view: PathView; nodes: NodeView[]; activeAttempt: CourseAttempt | undefined; readOnly: boolean; busy: boolean
  onSelect: (id: string) => void; onModule: (id: string) => void; onProject: () => void; onStart: (version: number, itemId: string, review: boolean) => void; onEvidence: (id: string) => void
}): ReactNode {
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
      <div className="dt-path-actions"><button type="button" className="dt-path-link" onClick={onProject}>Project Overview</button>{module && <><span aria-hidden="true">/</span><button type="button" className="dt-path-link" onClick={() => onModule(module.id)}>{module.title}</button></>}</div>
      <p className="dt-path-eyebrow">Lesson {index + 1} of {plan.items.length} · version {plan.version}</p><h3 id={detailId}>{item.title}</h3><span className="dt-path-tag">{itemStatus(last, view.run?.activeAttemptId ?? null)}</span>
      <p>{item.overview}</p><p className="dt-path-muted dt-path-small">Lesson ID: <code>{item.id}</code> · Estimated effort {range(item.minutes)}</p>
      <h4>What you should be able to do</h4><BulletList values={item.outcomes} />
      <h4>Lesson outline</h4><ol className="dt-path-list">{item.outline.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}</ol>
      <h4>Practice</h4><p>{item.practice}</p><h4>Assessment</h4><p>{item.assessment}</p>
      <h4>Prerequisites</h4>{!prior.length && <p className="dt-path-muted">No prerequisite lessons specified.</p>}
      <ul className="dt-path-list">{prior.map((edge) => { const source = plan.items.find((entry) => entry.id === edge.from); return <li key={edge.from}><button type="button" className="dt-path-link" onClick={() => onSelect(edge.from)}>{source?.title ?? edge.from}</button> · {edge.kind} · {itemStatus(attemptFor(attempts, plan.version, edge.from), view.run?.activeAttemptId ?? null)}</li> })}</ul>
      {prior.some((edge) => edge.kind === 'required' && attemptFor(attempts, plan.version, edge.from)?.status !== 'completed') && <p className="dt-path-muted dt-path-small">Some prerequisite lessons have no completed attempt. You can browse freely; ask the tutor for a short check if you want to begin here.</p>}
      <h4>Linked knowledge</h4><ul className="dt-path-knowledge">{item.nodeIds.map((id) => { const node = nodes.find((entry) => entry.id === id); return <li key={id}><button type="button" className="dt-path-link" onClick={() => onEvidence(id)}>{node?.title ?? id}</button><span className="dt-path-tag">{node?.state ?? 'Not yet diagnosed'}</span></li> })}</ul>
      {!item.nodeIds.length && <p className="dt-path-muted">No diagnosed knowledge nodes linked yet.</p>}
      <p className="dt-path-small dt-path-muted">Planned topics: {item.topics.join(' · ')}. Planning a topic does not establish its knowledge state.</p>
      {!itemAttempts.some((attempt) => attempt.units.length > 0) && <p className="dt-path-muted">This Overview is available before teaching content exists. Teaching units are written when you start the lesson.</p>}
      {!canStart && <p className="dt-path-muted">Accept this route to start its lessons. You can continue browsing every Overview.</p>}
      {readOnly && <p className="dt-path-muted">Open a conversation with this project selected to start or review a lesson.</p>}
      <div className="dt-path-actions"><Button primary disabled={readOnly || busy || !canStart} onClick={() => onStart(plan.version, item.id, false)}>{current ? 'Continue lesson' : 'Start lesson'}</Button>{itemAttempts.length > 0 && <Button disabled={readOnly || busy || !canStart} onClick={() => onStart(plan.version, item.id, true)}>Review lesson</Button>}</div>
      <div className="dt-path-actions" style={{ marginTop: 15 }}><Button disabled={!previous} onClick={() => previous && onSelect(previous.id)}>Previous Overview</Button><Button disabled={!next} onClick={() => next && onSelect(next.id)}>Next Overview</Button></div>
      <AttemptHistory attempts={itemAttempts} {...historyProps} />
    </section>
  }
  if (module && selection.kind === 'module') {
    const items = plan.items.filter((entry) => entry.moduleId === module.id)
    const itemIds = new Set(items.map((entry) => entry.id))
    const prerequisiteIds = [...new Set(plan.edges.filter((edge) => itemIds.has(edge.to) && !itemIds.has(edge.from)).map((edge) => edge.from))]
    return <section ref={detailRef} tabIndex={-1} className="dt-path-card dt-path-detail" aria-labelledby={detailId}><button type="button" className="dt-path-link" onClick={onProject}>Project Overview</button><p className="dt-path-eyebrow">Module Overview · version {plan.version}</p><h3 id={detailId}>{module.title}</h3><p>{module.overview}</p><p className="dt-path-muted">{items.length} lessons · estimated effort {range(effort(items))}</p><h4>Module outcomes</h4><BulletList values={module.outcomes} /><h4>Milestone assessment</h4><p>{module.milestone}</p><h4>Prerequisite lessons from other modules</h4>{prerequisiteIds.length ? <ul className="dt-path-list">{prerequisiteIds.map((id) => <li key={id}><button type="button" className="dt-path-link" onClick={() => onSelect(id)}>{plan.items.find((entry) => entry.id === id)?.title ?? id}</button></li>)}</ul> : <p className="dt-path-muted">No cross-module prerequisite lessons specified.</p>}<h4>Lesson Overviews</h4>{items.map((entry) => <button type="button" className="dt-path-module-card" key={entry.id} onClick={() => onSelect(entry.id)}><strong>{plan.items.findIndex((candidate) => candidate.id === entry.id) + 1}. {entry.title}</strong><small>{range(entry.minutes)} · {itemStatus(attemptFor(attempts, plan.version, entry.id), view.run?.activeAttemptId ?? null)}</small></button>)}</section>
  }
  return <section ref={detailRef} tabIndex={-1} className="dt-path-card dt-path-detail" aria-labelledby={detailId}><p className="dt-path-eyebrow">Project Overview · version {plan.version}</p><h3 id={detailId}>{plan.title}</h3><span className="dt-path-tag">{view.path.acceptedVersion === plan.version ? 'Accepted route' : plan.acceptedAt ? 'Previously accepted route' : 'Draft route'}</span><p>{plan.summary}</p>
    <div className="dt-path-summary"><div><strong>{plan.items.length}</strong><span>planned lessons</span></div><div><strong>{completed} / {plan.items.length}</strong><span>lessons with a completed attempt</span></div><div><strong>{range(effort(plan.items))}</strong><span>estimated effort</span></div></div>
    <h4>Your intended outcomes</h4><BulletList values={view.path.brief?.outcomes ?? []} />
    <h4>Time plan</h4><p>{view.path.brief?.targetDate ? `Target ${view.path.brief.targetDate} (${view.path.brief.timeZone}); ${view.path.brief.deadline} deadline.` : view.path.brief?.durationWeeks ? `${view.path.brief.durationWeeks} weeks; ${view.path.brief.deadline} target.` : 'No deadline selected.'} {view.path.brief?.weeklyMinutes ? `${view.path.brief.weeklyMinutes} minutes per week.` : 'Weekly budget not specified.'} {view.path.brief?.sessionMinutes ? `${view.path.brief.sessionMinutes} minutes per session preferred.` : ''}</p>
    <h4>Planning assumptions</h4><BulletList values={plan.assumptions} empty="No planning assumptions recorded." /><h4>Why this version was proposed</h4><p>{plan.changeReason}</p>
    <h4>Modules and milestones</h4>{plan.modules.map((entry) => <button type="button" key={entry.id} className="dt-path-module-card" onClick={() => onModule(entry.id)}><strong>{entry.title}</strong><small>{plan.items.filter((candidate) => candidate.moduleId === entry.id).length} lessons · {entry.milestone}</small></button>)}
    {plan.items[0] && <p><button type="button" className="dt-path-link" onClick={() => onSelect(plan.items[0]!.id)}>Browse the first lesson</button>{activeAttempt?.version === plan.version && <> · <button type="button" className="dt-path-link" onClick={() => onSelect(activeAttempt.itemId)}>Browse your current lesson</button></>}</p>}
    <p className="dt-path-muted dt-path-small">Completed attempts describe recorded activity. Knowledge states depend on evidence; estimated time does not promise mastery.</p><AttemptHistory attempts={attempts} {...historyProps} />
  </section>
}

/** A keyed inner page isolates pending reads, edits, and navigation per conversation. */
export function PathPage(props: PathPageProps): ReactNode {
  return <PathPageBody key={JSON.stringify([props.courseId, props.sessionId ?? null])} {...props} />
}
function PathPageBody({ courseId, title, nodes, sessionId, onOpenChat, onStarted, client = defaultPathClient }: PathPageProps): ReactNode {
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
      if (live.current && scope === generation.current && epoch === mutationEpoch.current && sequence === readSequence.current) setPollError(messageOf(failure))
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
        if (live.current && scope === generation.current) setError('This project changed in another conversation. The latest version has been refreshed; your unsaved goal edits are kept. Review it and click your action again.')
      } else setError(messageOf(failure))
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
    try { brief = briefFromDraft(draft) } catch (failure) { setError(messageOf(failure)); return }
    const edit = editGeneration.current
    void mutate('save', (params) => client.saveBrief({ ...params, brief }), (result) => {
      if (edit === editGeneration.current) {
        dirtyRef.current = false; setDirty(false)
        synchronizedBrief.current = JSON.stringify(result.path.brief)
        setDraft(draftFromBrief(result.path.brief))
        if (close) setWizardOpen(false)
      }
      setRecovered(true)
      setNotice(ready(result.path.brief) ? 'Goal draft saved. You can request diagnosis when you are ready.' : 'Incomplete goal draft saved. Return to add your purpose and observable outcomes when ready.')
    })
  }
  const ask = (kind: 'diagnosis' | 'plan') => {
    const path = currentView.current?.path
    if (!path || dirtyRef.current || !ready(path.brief)) { setError('Save your purpose and observable outcomes before requesting the tutor.'); return }
    if (kind === 'plan' && (!path.assessment || path.assessment.briefRevision !== path.briefRevision || !['ready', 'skipped'].includes(path.assessment.status))) { setError('Complete or explicitly skip the assessment for the saved goal before requesting a plan.'); return }
    void mutate(`request-${kind}`, (params) => client.request({ ...params, kind, operationId: operationId() }), (result) => {
      const response = result as PromptedPathView
      if (!response.prompted) setPromptIssue({ kind, message: response.promptReason ?? 'The tutor could not be reached.' })
      else setNotice(`${kind === 'plan' ? 'Route proposal' : 'Diagnosis'} request sent to the tutor in your conversation.`)
    })
  }
  const start = (version: number, itemId: string, review: boolean) => {
    void mutate('start', (params) => client.start({ ...params, version, itemId, operationId: operationId(), ...(review ? { review: true } : {}) }), (result) => {
      const response = result as PromptedPathView
      if (!response.prompted) setPromptIssue({ kind: 'start', version, itemId, review, message: response.promptReason ?? 'The tutor could not be reached.' })
      else { setNotice('Lesson requested in your conversation.'); onStarted?.() }
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
  const capacity = plan && view ? budget(view.path.brief, plan, view.now) : null
  const versions = view?.path.curricula ?? []
  const busyAction = busy !== null

  return <div className="dt-path-page" aria-label={`${title} curriculum`}>
    <header className="dt-path-header"><div><p className="dt-path-eyebrow">Learning path</p><h2>{title}</h2><p className="dt-path-muted">A complete route to browse, with teaching and checks one lesson at a time.</p></div><div className="dt-path-actions"><Button onClick={() => setSelection({ kind: 'project' })}>Project Overview</Button><Button aria-expanded={wizardOpen} onClick={() => setWizardOpen((open) => !open)}>Goal and time settings</Button>{onOpenChat && <Button onClick={onOpenChat}>Back to conversation</Button>}</div></header>
    {readOnly && <div className="dt-path-status" role="note">Browsing only. Open a conversation with this project selected to save a goal, request the tutor, accept a route, or start a lesson.</div>}
    {error && <div className="dt-path-alert" role="alert">{error}</div>}
    {pollError && <div className="dt-path-alert" role="status">{view ? 'Updates paused: ' : 'Could not load this path: '}{pollError} <button type="button" className="dt-path-link" onClick={() => { void refresh() }}>Retry loading</button></div>}
    {notice && <div className="dt-path-status" role="status">{notice}</div>}
    {promptIssue && <div className="dt-path-alert" role="alert">The request was saved, but the tutor was not reached: {promptIssue.message} <Button disabled={busyAction || readOnly} onClick={() => { if (promptIssue.kind === 'start') start(promptIssue.version, promptIssue.itemId, promptIssue.review); else ask(promptIssue.kind) }}>Retry tutor request</Button><p className="dt-path-small">Retry sends a new operation only when you click.</p></div>}
    {savedPromptFailure && <div className="dt-path-alert" role="alert">The previous {savedPromptFailure.kind === 'plan' ? 'route' : 'diagnosis'} request did not reach the tutor: {savedPromptFailure.reason ?? 'No reason supplied.'} <Button disabled={busyAction || readOnly || dirty} onClick={() => ask(savedPromptFailure.kind)}>Retry tutor request</Button></div>}
    {!view ? !pollError && <p className="dt-path-status" role="status">Loading the saved learning path…</p> : <div className="dt-path-body">
      {wizardOpen && <GoalWizard draft={draft} step={step} dirty={dirty} recovered={recovered} busy={busy === 'save'} readOnly={readOnly} onChange={changeDraft} onStep={setStep} onSave={saveBrief} onClose={() => setWizardOpen(false)} />}
      {!wizardOpen && dirty && <div className="dt-path-card"><p>Your unsaved goal edits are kept on this page.</p><Button onClick={() => setWizardOpen(true)}>Return to goal draft</Button></div>}
      {activeAttempt && <section className="dt-path-card" data-current="true" aria-label="Current pinned lesson"><p className="dt-path-eyebrow">This conversation's pinned attempt</p><h3>{view.path.curricula.find((entry) => entry.version === activeAttempt.version)?.items.find((item) => item.id === activeAttempt.itemId)?.title ?? activeAttempt.itemId}</h3><p>Route version {activeAttempt.version} · {activeAttempt.status} · attempt <code>{activeAttempt.id}</code></p>{view.path.acceptedVersion !== null && view.path.acceptedVersion !== activeAttempt.version && <p>The accepted route is now version {view.path.acceptedVersion}. This conversation remains on version {activeAttempt.version} until you explicitly start a lesson from another route.</p>}<div className="dt-path-actions"><Button onClick={() => { setSelectedVersion(activeAttempt.version); onSelect(activeAttempt.itemId) }}>View pinned lesson Overview</Button>{view.path.acceptedVersion !== null && view.path.acceptedVersion !== activeAttempt.version && <Button onClick={() => { setSelectedVersion(view.path.acceptedVersion); setSelection({ kind: 'project' }) }}>Browse accepted version {view.path.acceptedVersion}</Button>}{onOpenChat && <Button onClick={onOpenChat}>Open current conversation</Button>}</div></section>}
      <AssessmentCard assessment={assessment} nodes={nodes} readyBrief={savedReady} dirty={dirty} readOnly={readOnly} busy={busyAction} waiting={diagnosisWaiting} onRequest={() => ask('diagnosis')} onSkip={() => { void mutate('skip', (params) => client.skipAssessment(params), () => setNotice('Initial assessment explicitly skipped. The route will retain unverified assumptions.')) }} onEvidence={setKnowledgeId} onOpenChat={onOpenChat} />
      {view.path.assessment && !assessmentCurrent && <p className="dt-path-muted">The previous assessment belongs to an earlier goal draft. Request a new diagnosis or explicitly skip for the current goal.</p>}
      {activeAttempt && !activeAttempt.prompted && !promptIssue && <div className="dt-path-alert" role="alert">The pinned lesson request did not reach the tutor: {activeAttempt.promptReason ?? 'No reason supplied.'} <Button disabled={busyAction || readOnly} onClick={() => start(activeAttempt.version, activeAttempt.itemId, false)}>Retry current lesson request</Button></div>}
      {knowledgeId && <section className="dt-path-card" aria-label="Linked knowledge evidence reference"><div className="dt-path-card-head"><h3>{knowledge?.title ?? knowledgeId}</h3><Button onClick={() => setKnowledgeId(null)}>Close knowledge reference</Button></div><p><span className="dt-path-tag">{knowledge?.state ?? 'Not yet diagnosed'}</span> · {knowledge?.evidenceCount ?? 0} recorded evidence entries</p><p className="dt-path-muted">Knowledge ID: <code>{knowledgeId}</code>. Open the Knowledge tab to inspect the recorded observations. A curriculum topic alone does not confirm understanding.</p></section>}
      <section className="dt-path-card" aria-label="Route proposals"><div className="dt-path-card-head"><h3>{versions.length ? 'Route versions' : 'Build your curriculum route'}</h3>{planWaiting && <span className="dt-path-tag" role="status">Waiting for a tutor proposal</span>}</div>
        {!versions.length && <p className="dt-path-muted">Save your goal, then complete or explicitly skip the initial diagnosis. The tutor can propose a complete outline with every lesson Overview before the lesson bodies are written.</p>}
        {!assessmentCurrent && savedReady && <p className="dt-path-muted">The current goal needs an assessment or your explicit skip before a plan can be requested.</p>}
        <div className="dt-path-version-row">{versions.length > 0 && <label>Route to browse<select className="dt-path-version" aria-label="Route version to browse" value={selectedVersion ?? ''} onChange={(event) => { setSelectedVersion(Number(event.target.value)); setSelection({ kind: 'project' }) }}>{versions.map((entry) => <option key={entry.version} value={entry.version}>Version {entry.version} · {entry.version === view.path.acceptedVersion ? 'accepted' : entry.acceptedAt ? 'previously accepted' : 'draft'} · {entry.title}</option>)}</select></label>}<Button disabled={!canPlan} onClick={() => ask('plan')}>{planWaiting ? 'Request plan again' : versions.length ? 'Request a revised plan' : 'Request a route proposal'}</Button>{plan && plan.version !== view.path.acceptedVersion && <Button primary disabled={readOnly || busyAction || dirty || plan.briefRevision !== view.path.briefRevision || plan.assessmentRevision !== view.path.assessmentRevision} onClick={() => { void mutate('accept', (params) => client.accept({ ...params, version: plan.version }), () => setNotice(`Route version ${plan.version} accepted. Start a lesson explicitly when ready.`)) }}>Accept route version {plan.version}</Button>}</div>
        {plan && <p className="dt-path-small dt-path-muted">{plan.version === view.path.acceptedVersion ? 'This route is accepted. Lesson starts remain your choice.' : 'Browsing a proposal does not accept it or start a lesson.'}{plan.briefRevision !== view.path.briefRevision || plan.assessmentRevision !== view.path.assessmentRevision ? ' This version was based on an earlier goal or assessment; request a revision before accepting it.' : ''}</p>}
        {versions.some((entry) => entry.version > (selectedVersion ?? 0) && !entry.acceptedAt) && <p className="dt-path-muted">A newer draft is available in the version selector. Your current view and attempt have been kept.</p>}
      </section>
      {plan && capacity && <section className={`dt-path-card${capacity.tight ? ' dt-path-conflict' : ''}`} aria-label="Estimated effort and available capacity"><h3>Estimated effort: {range(capacity)}</h3><p>{capacity.available === null ? 'Add a weekly budget and a target date or duration to compare available time.' : `Approximate available budget: ${minutes(capacity.available)} in your selected time window.`} Estimates include the planned lessons; time alone does not establish mastery.</p>{capacity.tight && <><p>{capacity.conflict ? 'The minimum estimated effort exceeds your available time.' : 'The upper estimate exceeds your available time.'} You can adjust scope, extend the timeline, increase available time, or ask the tutor for an adjusted proposal.</p><div className="dt-path-actions"><Button onClick={() => { setStep(0); setWizardOpen(true) }}>Edit goal or scope</Button><Button onClick={() => { setStep(2); setWizardOpen(true) }}>Edit time budget</Button><Button disabled={!canPlan} onClick={() => ask('plan')}>Request an adjusted plan</Button></div></>}</section>}
      {plan ? <div className="dt-path-workspace"><RouteCanvas key={plan.version} plan={plan} selection={selection} activeAttempt={activeAttempt} attempts={view.run?.attempts ?? []} onSelect={onSelect} onModule={onModule} /><Overview plan={plan} selection={selection} view={view} nodes={nodes} activeAttempt={activeAttempt} readOnly={readOnly} busy={busyAction} onSelect={onSelect} onModule={onModule} onProject={() => setSelection({ kind: 'project' })} onStart={start} onEvidence={setKnowledgeId} /></div> : <section className="dt-path-empty"><p className="dt-path-eyebrow">Your route will appear here</p><h3>{planWaiting ? 'The tutor is preparing a proposal' : 'No curriculum has been proposed yet'}</h3><p>Existing knowledge and teaching remain available from the Knowledge tab and conversation.</p>{onOpenChat && <Button onClick={onOpenChat}>Open conversation</Button>}</section>}
    </div>}
  </div>
}
