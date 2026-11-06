/** Goal → diagnosis → course preview, the only three steps the learner sees. */
import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'

import type { GoalBrief, PathView } from '../path.js'
import type { AssetView, PathClient, SourceView } from './path-client.js'
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
  const [material, setMaterial] = useState('')
  const [materialTitle, setMaterialTitle] = useState('')
  const [materials, setMaterials] = useState<SourceView[]>([])
  const [assets, setAssets] = useState<AssetView[]>([])
  const [materialBusy, setMaterialBusy] = useState(false)
  const [materialError, setMaterialError] = useState('')
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (dirty) return
    setPurpose(path.path.brief?.purpose ?? '')
    setOutcomes(path.path.brief?.outcomes.join('\n') ?? '')
    setWeekly(path.path.brief?.weeklyMinutes?.toString() ?? '')
    setSession(path.path.brief?.sessionMinutes?.toString() ?? '')
  }, [path.path.brief, dirty])

  useEffect(() => {
    if (client.listSources === undefined) return
    let live = true
    void client.listSources().then((result) => { if (live) setMaterials(result.sources) }).catch(() => { /* sources are optional */ })
    return () => { live = false }
  }, [client])
  useEffect(() => {
    if (client.listAssets === undefined) return
    let live = true
    void client.listAssets().then((result) => { if (live) setAssets(result.assets) }).catch(() => { /* assets are optional */ })
    return () => { live = false }
  }, [client])

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
  const addMaterial = async (content: string, title: string, locator: string, kind: 'text' | 'markdown') => {
    if (client.addSource === undefined || materialBusy) return
    setMaterialBusy(true); setMaterialError('')
    try {
      const result = await client.addSource({ text: content, title, locator, kind })
      setMaterials((current) => current.some((entry) => entry.id === result.source.id) ? current : [...current, result.source])
      setMaterial(''); setMaterialTitle('')
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : text.courseMaterialFailed)
    } finally { setMaterialBusy(false) }
  }
  const addPasted = () => {
    if (material.trim() === '') { setMaterialError(text.courseMaterialRequired); return }
    void addMaterial(material, materialTitle.trim() || text.courseMaterialPasted, materialTitle.trim() || text.courseMaterialPasted, 'text')
  }
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
      if (client.addImage === undefined) { setMaterialError(text.courseAssetFailed); return }
      setMaterialBusy(true); setMaterialError('')
      void client.addImage(file).then((result) => {
        setAssets((current) => current.some((entry) => entry.id === result.asset.id) ? current : [...current, result.asset])
      }).catch((error: unknown) => setMaterialError(error instanceof Error ? error.message : text.courseAssetFailed)).finally(() => setMaterialBusy(false))
      return
    }
    if (/\.pdf$/i.test(file.name)) {
      if (client.addPdf === undefined) { setMaterialError(text.courseMaterialPdfFailed); return }
      setMaterialBusy(true); setMaterialError('')
      void client.addPdf(file).then((result) => {
        setMaterials((current) => current.some((entry) => entry.id === result.source.id) ? current : [...current, result.source])
      }).catch((error: unknown) => setMaterialError(error instanceof Error ? error.message : text.courseMaterialPdfFailed)).finally(() => setMaterialBusy(false))
      return
    }
    if (!/\.(md|markdown|txt)$/i.test(file.name)) { setMaterialError(text.courseMaterialUnsupported); return }
    if (file.size > 131_072) { setMaterialError(text.courseMaterialTooLarge); return }
    void file.text().then((content) => addMaterial(content, file.name, file.name, file.name.toLowerCase().endsWith('.txt') ? 'text' : 'markdown')).catch(() => setMaterialError(text.courseMaterialFailed))
  }
  const importAssets = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined || client.importAssets === undefined) return
    setMaterialBusy(true); setMaterialError('')
    void client.importAssets(file).then((result) => setAssets(result.assets))
      .catch((error: unknown) => setMaterialError(error instanceof Error ? error.message : text.courseAssetImportFailed))
      .finally(() => setMaterialBusy(false))
  }
  const removeAsset = (assetId: string) => {
    if (client.deleteAsset === undefined || materialBusy) return
    setMaterialBusy(true); setMaterialError('')
    void client.deleteAsset(assetId).then(() => setAssets((current) => current.filter((entry) => entry.id !== assetId)))
      .catch((error: unknown) => setMaterialError(error instanceof Error ? error.message : text.courseAssetFailed))
      .finally(() => setMaterialBusy(false))
  }
  const removeMaterial = (sourceId: string) => {
    if (client.deleteSource === undefined || materialBusy) return
    setMaterialBusy(true); setMaterialError('')
    void client.deleteSource(sourceId).then(() => setMaterials((current) => current.filter((entry) => entry.id !== sourceId)))
      .catch((error: unknown) => setMaterialError(error instanceof Error ? error.message : text.courseMaterialFailed))
      .finally(() => setMaterialBusy(false))
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
      {client.addSource !== undefined && <section className="dtx-course-materials" aria-labelledby="dtx-course-materials-title">
        <div className="dtx-course-materials-head"><h3 id="dtx-course-materials-title">{text.courseMaterialsTitle}<span>{text.courseMaterialsOptional}</span></h3><span>{text.courseMaterialsCount(materials.length)}</span></div>
        <p>{text.courseMaterialsBody}</p>
        <textarea id="dtx-material" value={material} maxLength={131_072} placeholder={text.courseMaterialPlaceholder} onChange={(event) => setMaterial(event.target.value)} />
        <div className="dtx-course-material-row"><input id="dtx-material-title" value={materialTitle} maxLength={200} placeholder={text.courseMaterialTitlePlaceholder} onChange={(event) => setMaterialTitle(event.target.value)} /><button type="button" className="dtx-secondary" disabled={materialBusy} onClick={addPasted}>{text.courseMaterialAdd}</button><label className="dtx-course-file">{text.courseMaterialFile}<input type="file" accept=".md,.markdown,.txt,.pdf,.png,.jpg,.jpeg,.webp,text/plain,text/markdown,application/pdf,image/png,image/jpeg,image/webp" onChange={chooseFile} /></label></div>
        {materials.length > 0 && <ul className="dtx-course-material-list">{materials.map((entry) => <li key={entry.id}><span><Icon name="file" size={13} />{entry.title}</span><small>{entry.kind === 'pdf' ? `PDF · ${text.courseMaterialPages(entry.pageCount ?? 0)}` : `${entry.kind} · ${Math.ceil(entry.bytes / 1024)} KB`}</small>{client.deleteSource !== undefined && <button type="button" className="dtx-link" disabled={materialBusy} onClick={() => removeMaterial(entry.id)}>{text.courseMaterialRemove}</button>}</li>)}</ul>}
        {client.addImage !== undefined && <div className="dtx-course-assets"><div className="dtx-course-materials-head"><h3>{text.courseAssetsTitle}</h3><span>{text.courseAssetsCount(assets.length)}</span></div><p>{text.courseAssetsBody}</p><div className="dtx-course-material-row"><a className="dtx-link" href="/diagnostic-tutor/api/assets/export" download>{text.courseAssetExport}</a>{client.importAssets !== undefined && <label className="dtx-course-file">{text.courseAssetImport}<input type="file" accept="application/json,.json" onChange={importAssets} /></label>}</div>{assets.length > 0 && <ul className="dtx-course-asset-list">{assets.map((asset) => <li key={asset.id}><img src={`/diagnostic-tutor/api/asset?id=${encodeURIComponent(asset.id)}`} alt={asset.filename ?? 'Course image'} loading="lazy" /><span>{asset.filename ?? asset.mediaType}<small>{asset.width}×{asset.height}</small></span>{client.deleteAsset !== undefined && <button type="button" className="dtx-link" disabled={materialBusy} onClick={() => removeAsset(asset.id)}>{text.courseAssetRemove}</button>}</li>)}</ul>}{materialError !== '' && <p className="dtx-caption dtx-course-material-error" role="alert">{materialError}</p>}</div>}
      </section>}
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
