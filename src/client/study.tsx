/**
 * Focused study flow over the lesson blocks the runtime already stores.
 *
 * This is a view, not a second lesson engine: it renders exactly one
 * StoredBlock at a time through LessonBody and forwards the existing
 * BlockInteraction. Answers are still recorded by the runtime; no grading,
 * mastery or automatic advancement is added here.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { StoredBlock } from '../contract.js'
import type { StudyProgress, StudyProgressInput } from '../path.js'
import { isKnownBlock } from '../block-types.js'
import { LessonBody } from './blocks.jsx'
import type { BlockInteraction } from './blocks.jsx'
import { useDesignText } from './design-text.js'
import { Icon } from './design-icons.jsx'
import { useLang } from './i18n.js'

export interface StudySessionProps {
  title: string
  courseTitle?: string | undefined
  moduleTitle?: string | undefined
  code?: string | undefined
  blocks: readonly StoredBlock[]
  interaction?: BlockInteraction | undefined
  onExit: () => void
  onOpenChat?: (() => void) | undefined
  fullscreen?: boolean | undefined
  onToggleFullscreen?: (() => void) | undefined
  /** Last persisted Study position, if any. */
  initialStudy?: StudyProgress | undefined
  /** Report presentation position; the parent persists it. Never teaching state. */
  onProgress?: ((progress: StudyProgressInput) => void) | undefined
}

const TYPE_LABELS = {
  text: { zh: '阅读', en: 'Read' },
  example: { zh: '例子', en: 'Example' },
  diagram: { zh: '图解', en: 'Diagram' },
  check: { zh: '检查', en: 'Check' },
  formula: { zh: '公式', en: 'Formula' },
  code: { zh: '代码', en: 'Code' },
  quiz: { zh: '练习', en: 'Practice' },
  flashcard: { zh: '闪卡', en: 'Flashcard' },
  resource: { zh: '资料', en: 'Resource' },
  comparison: { zh: '对比', en: 'Comparison' },
  slider: { zh: '拖动探索', en: 'Explore' },
  'step-through': { zh: '分步演示', en: 'Step through' },
  figure: { zh: '图示', en: 'Figure' },
} as const

/** Interactive blocks cannot be skipped until their answer is recorded. */
function isInteractive(block: StoredBlock): boolean {
  return isKnownBlock(block) && (block.type === 'quiz' || block.type === 'flashcard')
}

function typeLabel(block: StoredBlock, lang: 'en' | 'zh'): string {
  if (!isKnownBlock(block)) return lang === 'zh' ? '未知内容' : 'Unknown'
  return TYPE_LABELS[block.type]?.[lang] ?? block.type
}

export function StudySession({ title, courseTitle, moduleTitle, code, blocks, interaction, onExit, onOpenChat, fullscreen = false, onToggleFullscreen, initialStudy, onProgress }: StudySessionProps): ReactNode {
  const text = useDesignText()
  const lang = useLang()
  const initialIndex = (() => {
    if (initialStudy === undefined) return 0
    const found = blocks.findIndex((block) => block.id === initialStudy.blockId)
    if (found >= 0) return found
    return Math.min(Math.max(initialStudy.stepIndex, 0), Math.max(blocks.length - 1, 0))
  })()
  const [step, setStep] = useState(initialIndex)
  const [finished, setFinished] = useState(initialStudy?.finished === true)
  const [recorded, setRecorded] = useState<Set<string>>(() => new Set((interaction?.responses ?? []).map((response) => response.blockId)))
  const current = blocks[step]
  const rootRef = useRef<HTMLDivElement>(null)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress
  const live = useRef({ step, finished, fullscreen })
  live.current = { step, finished, fullscreen }
  const restored = useRef(false)
  const scrollReady = useRef(false)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRatio = (): number => {
    // The first report can run before the restore frame. Keep the saved ratio
    // instead of persisting the transient 0 from an unlaid-out surface.
    if (!scrollReady.current && initialStudy !== undefined) return initialStudy.scrollRatio
    const element = rootRef.current
    if (element === null) return 0
    const max = element.scrollHeight - element.clientHeight
    return max <= 0 ? 0 : Math.min(1, Math.max(0, element.scrollTop / max))
  }
  const report = (): void => {
    const state = live.current
    const block = blocks[state.step]
    if (block === undefined || onProgressRef.current === undefined) return
    onProgressRef.current({
      blockId: block.id,
      stepIndex: state.step,
      scrollRatio: scrollRatio(),
      fullscreen: state.fullscreen,
      finished: state.finished,
    })
  }
  useEffect(() => {
    // Mark the surface live synchronously so the first progress report is not
    // lost in tests or in a hidden tab; restore the scroll position on the frame.
    scrollReady.current = false
    restored.current = true
    const frame = requestAnimationFrame(() => {
      const element = rootRef.current
      if (element !== null && initialStudy !== undefined) {
        const max = element.scrollHeight - element.clientHeight
        if (max > 0) element.scrollTop = initialStudy.scrollRatio * max
      }
      scrollReady.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [initialStudy])
  useEffect(() => {
    if (!restored.current) return
    report()
  }, [step, finished, fullscreen])
  useEffect(() => () => {
    if (scrollTimer.current !== null) clearTimeout(scrollTimer.current)
  }, [])
  const onScroll = (): void => {
    if (!restored.current) return
    if (scrollTimer.current !== null) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(report, 200)
  }
  // Without a BlockInteraction (for example a preview or an unavailable
  // answer endpoint) the quiz is read-only; do not trap the learner on it.
  const interactive = interaction !== undefined && current !== undefined && isInteractive(current)
  const currentRecorded = current !== undefined && recorded.has(current.id)
  const hooked = useMemo<BlockInteraction | undefined>(() => interaction === undefined ? undefined : {
    ...interaction,
    onRecorded: (blockId: string) => {
      setRecorded((previous) => {
        if (previous.has(blockId)) return previous
        const next = new Set(previous)
        next.add(blockId)
        return next
      })
    },
  }, [interaction])

  if (blocks.length === 0) {
    return <div className="dtx-study dtx-study-empty"><div className="dtx-tab-empty"><span className="dtx-tab-empty-icon"><Icon name="book" size={30} /></span><h2>{text.studyEmpty}</h2><p>{text.studyEmptyBody}</p><button type="button" className="dtx-secondary" onClick={onExit}>{text.studyExit}</button></div></div>
  }

  const next = () => {
    if (current !== undefined && interactive && !currentRecorded) return
    if (step >= blocks.length - 1) setFinished(true)
    else setStep((value) => value + 1)
  }
  const previous = () => {
    if (step === 0) onExit()
    else setStep((value) => value - 1)
  }

  if (finished) {
    const answered = recorded.size
    return <div className="dtx-study dtx-study-done-wrap" ref={rootRef} onScroll={onScroll}>
      <div className="dtx-study-done">
        <span className="dtx-study-done-mark"><Icon name="check" size={24} /></span>
        <p className="dtx-eyebrow">{text.studyFinishedEyebrow}</p>
        <h2>{text.studyFinishedTitle}</h2>
        <p className="dtx-study-lede">{text.studyFinishedBody}</p>
        <div className="dtx-study-facts">
          <span><b>{blocks.length}</b> {text.studyBlocks}</span>
          <span><b>{answered}</b> {text.studyAnswered}</span>
          <span>{text.studyEvidenceKept}</span>
        </div>
        <div className="dtx-study-done-actions"><button type="button" className="dtx-primary" onClick={onExit}>{text.studyFinish}</button>{onOpenChat !== undefined && <button type="button" className="dtx-secondary" onClick={onOpenChat}>{text.backToChat}</button>}</div>
      </div>
    </div>
  }

  const progress = (step + 1) / blocks.length * 100
  const main = <main className="dtx-study-main">
    <div className="dtx-study-stepbar"><span>{text.studyStep(step + 1, blocks.length)}</span><span>{current === undefined ? '' : typeLabel(current, lang)}</span></div>
    <article className="dtx-study-card" aria-live="polite">
      {current === undefined ? null : <LessonBody key={current.id} blocks={[current]} interaction={hooked} />}
    </article>
    {interactive && !currentRecorded && <p className="dtx-study-hint">{text.studyAnswerFirst}</p>}
    {current !== undefined && !interactive && isKnownBlock(current) && current.type === 'check' && onOpenChat !== undefined && <button type="button" className="dtx-secondary dtx-study-chat" onClick={onOpenChat}>{text.studyOpenChat}</button>}
  </main>
  return <div className={fullscreen ? 'dtx-study dtx-study-focus' : 'dtx-study'} data-fullscreen={fullscreen ? 'true' : undefined} ref={rootRef} onScroll={onScroll}>
    <header className="dtx-study-top">
      <button type="button" className="dtx-iconbtn" onClick={onExit} aria-label={text.studyExit}><Icon name="arrow-left" size={18} /></button>
      <div className="dtx-study-heading"><span className="dtx-eyebrow">{fullscreen ? text.studyFocus : `${text.studyFocus} · ${text.studyHalfScreen}`}</span><h2>{title}</h2><p>{[courseTitle, moduleTitle, code].filter(Boolean).join(' · ')}</p></div>
      {onToggleFullscreen !== undefined && <button type="button" className="dtx-study-layout" onClick={onToggleFullscreen} aria-label={fullscreen ? text.studyExitFullscreen : text.studyFullscreen} title={fullscreen ? text.studyExitFullscreen : text.studyFullscreen}><Icon name={fullscreen ? 'contract' : 'expand'} size={14} /><span>{fullscreen ? text.studyExitFullscreen : text.studyFullscreen}</span></button>}
      <span className="dtx-study-count">{step + 1} / {blocks.length}</span>
    </header>
    <div className="dtx-study-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
    {fullscreen ? <div className="dtx-study-focus-layout">
      <aside className="dtx-study-rail" aria-label={text.studySteps}><p className="dtx-study-rail-label">{text.studySteps}</p><ol>{blocks.map((block, index) => <li key={block.id} data-current={index === step ? 'true' : undefined} data-done={index < step ? 'true' : undefined}><span className="dtx-study-rail-dot">{index < step ? <Icon name="check" size={10} /> : index + 1}</span><span>{typeLabel(block, lang)}</span></li>)}</ol></aside>
      {main}
    </div> : main}
    <footer className="dtx-study-foot">
      <button type="button" className="dtx-link dtx-study-exit" onClick={onExit}>{text.studyExit}</button>
      <div className="dtx-study-foot-actions">
        {step > 0 && <button type="button" className="dtx-secondary" onClick={previous}>{text.studyPrevious}</button>}
        <button type="button" className="dtx-primary" disabled={interactive && !currentRecorded} onClick={next}>{step === blocks.length - 1 ? text.studyFinish : text.studyContinue}<Icon name="arrow-right" size={15} /></button>
      </div>
    </footer>
  </div>
}
