/**
 * Focused study flow over the lesson blocks the runtime already stores.
 *
 * This is a view, not a second lesson engine: it renders exactly one
 * StoredBlock at a time through LessonBody and forwards the existing
 * BlockInteraction. Answers are still recorded by the runtime; no grading,
 * mastery or automatic advancement is added here.
 */
import { useMemo, useState, type ReactNode } from 'react'

import type { StoredBlock } from '../contract.js'
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
} as const

/** Interactive blocks cannot be skipped until their answer is recorded. */
function isInteractive(block: StoredBlock): boolean {
  return isKnownBlock(block) && (block.type === 'quiz' || block.type === 'flashcard')
}

function typeLabel(block: StoredBlock, lang: 'en' | 'zh'): string {
  if (!isKnownBlock(block)) return lang === 'zh' ? '未知内容' : 'Unknown'
  return TYPE_LABELS[block.type]?.[lang] ?? block.type
}

export function StudySession({ title, courseTitle, moduleTitle, code, blocks, interaction, onExit, onOpenChat }: StudySessionProps): ReactNode {
  const text = useDesignText()
  const lang = useLang()
  const [step, setStep] = useState(0)
  const [finished, setFinished] = useState(false)
  const [recorded, setRecorded] = useState<Set<string>>(() => new Set((interaction?.responses ?? []).map((response) => response.blockId)))
  const current = blocks[step]
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
    return <div className="dtx-study dtx-study-done-wrap">
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
  return <div className="dtx-study">
    <header className="dtx-study-top">
      <button type="button" className="dtx-iconbtn" onClick={onExit} aria-label={text.studyExit}><Icon name="arrow-left" size={18} /></button>
      <div className="dtx-study-heading"><span className="dtx-eyebrow">{text.studyFocus}</span><h2>{title}</h2><p>{[courseTitle, moduleTitle, code].filter(Boolean).join(' · ')}</p></div>
      <span className="dtx-study-count">{step + 1} / {blocks.length}</span>
    </header>
    <div className="dtx-study-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
    <main className="dtx-study-main">
      <div className="dtx-study-stepbar"><span>{text.studyStep(step + 1, blocks.length)}</span><span>{current === undefined ? '' : typeLabel(current, lang)}</span></div>
      <article className="dtx-study-card" aria-live="polite">
        {current === undefined ? null : <LessonBody key={current.id} blocks={[current]} interaction={hooked} />}
      </article>
      {interactive && !currentRecorded && <p className="dtx-study-hint">{text.studyAnswerFirst}</p>}
      {current !== undefined && !interactive && isKnownBlock(current) && current.type === 'check' && onOpenChat !== undefined && <button type="button" className="dtx-secondary dtx-study-chat" onClick={onOpenChat}>{text.studyOpenChat}</button>}
    </main>
    <footer className="dtx-study-foot">
      <button type="button" className="dtx-link dtx-study-exit" onClick={onExit}>{text.studyExit}</button>
      <div className="dtx-study-foot-actions">
        {step > 0 && <button type="button" className="dtx-secondary" onClick={previous}>{text.studyPrevious}</button>}
        <button type="button" className="dtx-primary" disabled={interactive && !currentRecorded} onClick={next}>{step === blocks.length - 1 ? text.studyFinish : text.studyContinue}<Icon name="arrow-right" size={15} /></button>
      </div>
    </footer>
  </div>
}
