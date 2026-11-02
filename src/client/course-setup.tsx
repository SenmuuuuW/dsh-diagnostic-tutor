/** Goal → diagnosis → course preview, the only three steps the learner sees. */
import { useEffect, useState, type ReactNode } from 'react'

import type { GoalBrief, PathView } from '../path.js'
import type { PathClient } from './path-client.js'
import { Icon } from './design-icons.jsx'
import { useDesignText } from './design-text.js'
import { announcePathState } from './path-events.js'

export interface CourseSetupProps {
  courseId: string
  title: string
  path: PathView
  sessionId?: string | undefined
  client: PathClient
  onOpenChat?: (() => void) | undefined
}

type Stage = 'goal' | 'diagnosis' | 'plan' | 'preview'

function operationId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `setup-${Date.now().toString(36)}`
}
function ready(brief: GoalBrief | null): boolean {
  return brief !== null && brief.purpose.trim().length > 0 && brief.outcomes.length > 0
}
function timeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}
function currentAssessment(path: PathView): boolean {
  const assessment = path.path.assessment
  return assessment !== null && assessment.briefRevision === path.path.briefRevision && (assessment.status === 'ready' || assessment.status === 'skipped')
}

export function CourseSetup({ courseId, title, path, sessionId, client, onOpenChat }: CourseSetupProps): ReactNode {
  const text = useDesignText()
  const [purpose, setPurpose] = useState(path.path.brief?.purpose ?? '')
  const [outcomes, setOutcomes] = useState(path.path.brief?.outcomes.join('\n') ?? '')
  const [weekly, setWeekly] = useState(path.path.brief?.weeklyMinutes?.toString() ?? '')
  const [session, setSession] = useState(path.path.brief?.sessionMinutes?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (dirty) return
    setPurpose(path.path.brief?.purpose ?? '')
    setOutcomes(path.path.brief?.outcomes.join('\n') ?? '')
    setWeekly(path.path.brief?.weeklyMinutes?.toString() ?? '')
    setSession(path.path.brief?.sessionMinutes?.toString() ?? '')
  }, [path.path.brief, dirty])

  const proposal = [...path.path.curricula].reverse().find((entry) => entry.briefRevision === path.path.briefRevision && entry.assessmentRevision === path.path.assessmentRevision) ?? null
  const diagnosis = path.path.requests.findLast((entry) => entry.kind === 'diagnosis' && entry.briefRevision === path.path.briefRevision)
  const planRequest = path.path.requests.findLast((entry) => entry.kind === 'plan' && entry.briefRevision === path.path.briefRevision)
  const stage: Stage = !ready(path.path.brief) ? 'goal' : !currentAssessment(path) ? 'diagnosis' : proposal !== null ? 'preview' : 'plan'
  const waitingDiagnosis = stage === 'diagnosis' && diagnosis?.prompted === true && path.path.assessment?.status === 'in-progress'
  const waitingPlan = stage === 'plan' && planRequest?.prompted === true
  const steps: { key: Stage; label: string }[] = [
    { key: 'goal', label: text.courseSetupGoal },
    { key: 'diagnosis', label: text.courseSetupDiagnosis },
    { key: 'preview', label: text.courseSetupCourse },
  ]
  const activeStep = stage === 'plan' ? 2 : stage === 'diagnosis' ? 1 : stage === 'goal' ? 0 : 2

  const saveGoal = () => {
    if (sessionId === undefined) { setNotice(text.courseSetupNoSession); return }
    const parsed = (value: string): number | null => value.trim() === '' ? null : Number(value)
    const weeklyMinutes = parsed(weekly)
    const sessionMinutes = parsed(session)
    if (weeklyMinutes !== null && (!Number.isInteger(weeklyMinutes) || weeklyMinutes < 15 || weeklyMinutes > 10080)) { setNotice(text.courseSetupBudgetInvalid); return }
    if (sessionMinutes !== null && (!Number.isInteger(sessionMinutes) || sessionMinutes < 5 || sessionMinutes > 480)) { setNotice(text.courseSetupBudgetInvalid); return }
    const brief: GoalBrief = {
      purpose: purpose.trim(), outcomes: outcomes.split('\n').map((line) => line.trim()).filter(Boolean),
      background: '', timeZone: timeZone(), targetDate: null, durationWeeks: null, deadline: 'none',
      weeklyMinutes, sessionMinutes, preferences: '',
    }
    if (!ready(brief)) { setNotice(text.courseSetupGoalRequired); return }
    setBusy(true); setNotice('')
    void client.saveBrief({ sessionId, courseId, expectedRevision: path.path.revision, brief }).then((next) => {
      setDirty(false)
      setPurpose(next.path.brief?.purpose ?? purpose)
      setOutcomes(next.path.brief?.outcomes.join('\n') ?? outcomes)
      announcePathState(false)
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : text.courseSetupFailed)).finally(() => setBusy(false))
  }
  const request = (kind: 'diagnosis' | 'plan') => {
    if (sessionId === undefined) { setNotice(text.courseSetupNoSession); return }
    setBusy(true); setNotice('')
    void client.request({ sessionId, courseId, expectedRevision: path.path.revision, kind, operationId: operationId() }).then((result) => {
      if (!result.prompted) setNotice(result.promptReason ?? text.tabTutorUnreachable)
      else announcePathState(false)
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : text.courseSetupFailed)).finally(() => setBusy(false))
  }
  const skip = () => {
    if (sessionId === undefined) { setNotice(text.courseSetupNoSession); return }
    setBusy(true); setNotice('')
    void client.skipAssessment({ sessionId, courseId, expectedRevision: path.path.revision }).then(() => announcePathState(false))
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : text.courseSetupFailed)).finally(() => setBusy(false))
  }
  const accept = (version: number) => {
    if (sessionId === undefined) { setNotice(text.courseSetupNoSession); return }
    setBusy(true); setNotice('')
    void client.accept({ sessionId, courseId, expectedRevision: path.path.revision, version }).then(() => announcePathState(false))
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : text.courseSetupFailed)).finally(() => setBusy(false))
  }

  return <div className="dtx-course-setup">
    <header className="dtx-course-setup-head">
      <p className="dtx-eyebrow">{text.tabCourse}</p>
      <h1>{title}</h1>
      <p>{text.courseSetupIntro}</p>
      <ol className="dtx-course-steps" aria-label={text.courseSetupProgress}>
        {steps.map((step, index) => <li key={step.key} data-current={index === activeStep ? 'true' : undefined} data-done={index < activeStep ? 'true' : undefined}><span>{index < activeStep ? <Icon name="check" size={11} /> : index + 1}</span>{step.label}</li>)}
      </ol>
    </header>
    {stage === 'goal' && <section className="dtx-course-setup-card" data-stage="goal">
      <span className="dtx-course-setup-icon"><Icon name="target" size={22} /></span>
      <h2>{text.courseSetupGoalTitle}</h2>
      <p>{text.courseSetupGoalBody}</p>
      <label className="dtx-course-field" htmlFor="dtx-purpose"><span>{text.courseSetupPurpose}</span><textarea id="dtx-purpose" value={purpose} maxLength={2000} placeholder={text.courseSetupPurposePlaceholder} onChange={(event) => { setDirty(true); setPurpose(event.target.value) }} /></label>
      <label className="dtx-course-field" htmlFor="dtx-outcomes"><span>{text.courseSetupOutcomes}</span><textarea id="dtx-outcomes" value={outcomes} maxLength={4000} placeholder={text.courseSetupOutcomesPlaceholder} onChange={(event) => { setDirty(true); setOutcomes(event.target.value) }} /></label>
      <div className="dtx-course-budget"><label htmlFor="dtx-weekly"><span>{text.courseSetupWeekly}</span><input id="dtx-weekly" inputMode="numeric" value={weekly} placeholder={text.courseSetupOptional} onChange={(event) => { setDirty(true); setWeekly(event.target.value) }} /></label><label htmlFor="dtx-session"><span>{text.courseSetupSession}</span><input id="dtx-session" inputMode="numeric" value={session} placeholder={text.courseSetupOptional} onChange={(event) => { setDirty(true); setSession(event.target.value) }} /></label></div>
      <div className="dtx-course-setup-actions"><button type="button" className="dtx-primary" disabled={busy} onClick={saveGoal}>{text.courseSetupSaveGoal}<Icon name="arrow-right" size={15} /></button></div>
    </section>}
    {stage === 'diagnosis' && <section className="dtx-course-setup-card" data-stage="diagnosis">
      <span className="dtx-course-setup-icon"><Icon name="spark" size={22} /></span>
      <h2>{text.courseSetupDiagnosisTitle}</h2>
      <p>{text.courseSetupDiagnosisBody}</p>
      {waitingDiagnosis ? <div className="dtx-course-setup-waiting" role="status"><span className="dtx-spinner" />{text.courseSetupDiagnosisWaiting}</div> : null}
      <div className="dtx-course-setup-actions">
        {!waitingDiagnosis && <button type="button" className="dtx-primary" disabled={busy} onClick={() => request('diagnosis')}>{text.courseSetupStartDiagnosis}<Icon name="arrow-right" size={15} /></button>}
        {onOpenChat !== undefined && <button type="button" className="dtx-secondary" onClick={onOpenChat}>{text.courseSetupOpenChat}</button>}
        <button type="button" className="dtx-link" disabled={busy} onClick={skip}>{text.courseSetupSkip}</button>
      </div>
    </section>}
    {stage === 'plan' && <section className="dtx-course-setup-card" data-stage="plan">
      <span className="dtx-course-setup-icon"><Icon name="route" size={22} /></span>
      <h2>{text.courseSetupPlanTitle}</h2>
      <p>{text.courseSetupPlanBody}</p>
      {waitingPlan ? <div className="dtx-course-setup-waiting" role="status"><span className="dtx-spinner" />{text.courseSetupPlanWaiting}</div> : null}
      <div className="dtx-course-setup-actions">
        {!waitingPlan && <button type="button" className="dtx-primary" disabled={busy} onClick={() => request('plan')}>{text.courseSetupGenerate}<Icon name="arrow-right" size={15} /></button>}
        {onOpenChat !== undefined && <button type="button" className="dtx-secondary" onClick={onOpenChat}>{text.courseSetupOpenChat}</button>}
      </div>
    </section>}
    {stage === 'preview' && proposal !== null && <section className="dtx-course-setup-card dtx-course-setup-preview" data-stage="preview">
      <span className="dtx-course-setup-icon"><Icon name="check" size={22} /></span>
      <h2>{text.courseSetupPreviewTitle}</h2>
      <p>{text.courseSetupPreviewBody(proposal.modules.length, proposal.items.length)}</p>
      <div className="dtx-proposal dtx-course-preview"><div className="dtx-proposal-copy"><h3>{proposal.title}</h3><p>{proposal.summary}</p></div><div className="dtx-proposal-stats"><span><span className="dtx-stat-label">{text.courseSetupLessons}</span><br /><span className="dtx-stat-value">{proposal.items.length}</span></span><span><span className="dtx-stat-label">{text.courseSetupModules}</span><br /><span className="dtx-stat-value">{proposal.modules.length}</span></span></div></div>
      <ol className="dtx-course-preview-list">{proposal.modules.map((module) => <li key={module.id}><b>{module.title}</b><span>{proposal.items.filter((item) => item.moduleId === module.id).length} {text.courseSetupLessonCount}</span></li>)}</ol>
      <div className="dtx-course-setup-actions"><button type="button" className="dtx-primary" disabled={busy} onClick={() => accept(proposal.version)}>{text.courseSetupAccept}<Icon name="arrow-right" size={15} /></button>{onOpenChat !== undefined && <button type="button" className="dtx-link" onClick={onOpenChat}>{text.courseSetupOpenChat}</button>}</div>
    </section>}
    {notice !== '' && <p className="dtx-tab-notice dtx-course-setup-notice" role="alert">{notice}</p>}
  </div>
}
