/**
 * Block renderers.
 *
 * The registry is the whole extension story: a block type is a key in
 * `BLOCK_RENDERERS`, so Formula, Code, Comparison, Practice or Resource arrive
 * as one more entry and never as a rewrite of the lesson renderer.
 *
 * Unknown types are the interesting case. A lesson authored by a newer host
 * will contain blocks this build has never heard of, and that must degrade —
 * the block is announced by type and left legible, rather than throwing inside
 * React and blanking the whole panel.
 *
 * Note what is absent: no percentage, no score, no stars, no progress bar.
 * State is always a word from the skill's vocabulary plus a coloured mark.
 */

import { createElement, useState, type ReactNode } from 'react'

import { MathMLView } from './mathml.jsx'

import type { Block, HandoffView, KnownBlock, NextStepView, StoredBlock } from '../contract.js'
import { isKnownBlock } from '../block-types.js'
import { useLang } from './i18n.js'
import { useLearningText } from './learning-text.js'
import { useLessonText } from './lesson-text.js'
import { readinessLabel } from './map-text.js'
import { continuationLabel, formatDuration } from './model.js'

/** Props every renderer receives. */
export interface BlockInteraction {
  attemptId: string
  loadSource?(sourceId: string): Promise<{ id: string; title: string; locator: string; content?: string }>
  responses: readonly {
    blockId: string
    kind: string
    answers: readonly { questionId: string; value: string }[]
    submittedAt: string
  }[]
  submit(blockId: string, answers: { questionId: string; value: string }[]): Promise<void>
  /** Optional observation hook used by focused study; it stores nothing itself. */
  onRecorded?(blockId: string): void
}

export interface BlockRenderProps<B extends KnownBlock = KnownBlock> {
  block: B
  interaction?: BlockInteraction | undefined
}

type Renderer = (props: BlockRenderProps<KnownBlock>) => ReactNode

/**
 * Inline formatting: `**bold**`, `*italic*`, `` `code` ``, and inline math.
 *
 * Math is handled because the teaching brain writes it by convention —
 * `\\(...\\)` inline and `\\[...\\]` display are the skill's own rule — and a
 * STEM surface that prints the delimiters verbatim is unreadable.
 *
 * Emphasis is handled for the same reason, and it was the more visible miss:
 * a single asterisk is the most ordinary thing a writer types, so `*Machine
 * Learning*` arrived in the lesson with its asterisks still attached. Bold has
 * to be matched first — `**x**` also starts with a `*` — which the ordering of
 * the alternation below does for free.
 *
 * This is *styling*, not typesetting: the span is set apart and given a
 * monospace face so the expression is legible. Real math rendering needs a
 * typesetter (KaTeX or MathML), which is a later decision, not a silent gap.
 *
 * The inline pattern is non-greedy to the closing delimiter rather than
 * "anything but a close parenthesis", which is what it used to be and what
 * `\\((m,n)\\cdot(n,p)\\)` — a real expression out of a real lesson — broke:
 * the first `)` ended the candidate match, nothing matched, and the lesson
 * printed the delimiters and the expression as source.
 */
const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\\\([\s\S]*?\\\))/g

function inline(text: string, math?: readonly { tex: string; display: boolean; mathml: string }[]): ReactNode[] {
  return text
    .split(INLINE_PATTERN)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>
      }
      if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
        return <em key={index}>{part.slice(1, -1)}</em>
      }
      if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
      if (part.startsWith('\\(') && part.endsWith('\\)')) {
        const tex = part.slice(2, -2).trim()
        const fragment = math?.find((entry) => !entry.display && entry.tex === tex)
        return (
          <span className="dt-math" key={index}>
            <MathMLView
              mathml={fragment?.mathml}
              fallback={<span className="dt-math-source">{part.slice(2, -2)}</span>}
            />
          </span>
        )
      }
      return part
    })
}

/** One line of a text body, classified. */
type Line =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'ordered'; marker: string; text: string }
  | { kind: 'math'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'code'; text: string; language: string }

/** Split one pipe-table row into trimmed cells. */
function tableCells(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

/** The `| --- | :---: |` separator that turns pipe rows into a table. */
function tableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

/**
 * Classify one line.
 *
 * The teaching brain writes ordinary light markdown — `###` headings, `-`
 * bullets, `1.` steps — because that is how a person writes an explanation.
 * Printing the markers verbatim is what makes a lesson look like a Markdown
 * renderer instead of a lesson, so they are recognised here.
 *
 * This adds **no block type**: it is how the existing text and check blocks are
 * displayed, which is the part of the surface the learner actually reads.
 */
function classify(line: string): Line {
  const heading = /^(#{2,3})\s+(.*)$/.exec(line)
  if (heading) return { kind: 'heading', level: heading[1] === '##' ? 2 : 3, text: heading[2]! }
  // Display math is written with escaped delimiters: \[...\]
  const trimmed = line.trim()
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return { kind: 'math', text: trimmed.slice(2, -2).trim() }
  }
  const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
  if (bullet) return { kind: 'bullet', text: bullet[1]! }
  const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
  if (ordered) return { kind: 'ordered', marker: ordered[1]!, text: ordered[2]! }
  return { kind: 'text', text: line }
}

/**
 * Group consecutive lines into runs that render as one element.
 *
 * Display math gets a pre-pass because it is the one construct that is not
 * line-shaped. `\\[ ... \\]` opens and closes on its own lines, and a matrix or
 * a derivation routinely puts several lines between them — a real lesson
 * contains
 *
 *     \\[X=\\begin{bmatrix}
 *     1 & 2 \\\\
 *     3 & 4
 *     \\end{bmatrix}\\]
 *
 * and a line-at-a-time classifier sees four ordinary lines: the delimiters, the
 * `&` alignment and the `\\\\` row breaks all print verbatim, and the matrix a
 * learner most needs to read is the one that arrives as source.
 *
 * An unterminated `\\[` is deliberately *not* consumed. Printing one stray
 * delimiter is a small blemish; swallowing the rest of a lesson into a code
 * panel is a lost lesson.
 */
function toRuns(md: string): Line[][] {
  const runs: Line[][] = []
  let current: Line[] = []
  let currentKind: Line['kind'] | null = null
  const flush = (): void => {
    if (current.length > 0) runs.push(current)
    current = []
    currentKind = null
  }
  const lines = md.split(/\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trimEnd()
    if (line.trim().length === 0) {
      flush()
      continue
    }

    const trimmed = line.trim()
    // Fenced code is line-shaped and must be consumed before ordinary prose.
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const body: string[] = []
      let cursor = index + 1
      let closed = false
      while (cursor < lines.length) {
        const next = lines[cursor]!
        if (next.trim().startsWith('```')) { cursor += 1; closed = true; break }
        body.push(next)
        cursor += 1
      }
      if (closed) {
        flush()
        runs.push([{ kind: 'code', text: body.join('\n'), language }])
        index = cursor - 1
        continue
      }
    }
    // A pipe table is a header row, a separator row, and data rows. Treating
    // it as prose is the difference between a readable table and a wall of `|`.
    if (trimmed.startsWith('|') && trimmed.includes('|')) {
      const raw: string[] = []
      let cursor = index
      while (cursor < lines.length && lines[cursor]!.trim().startsWith('|') && lines[cursor]!.trim().includes('|')) {
        raw.push(lines[cursor]!.trim())
        cursor += 1
      }
      const rows = raw.map(tableCells)
      flush()
      if (rows.length >= 2 && tableSeparator(rows[1]!)) {
        runs.push([{ kind: 'table', rows: [rows[0]!, ...rows.slice(2)] }])
      } else {
        for (const row of raw) runs.push([{ kind: 'text', text: row }])
      }
      index = cursor - 1
      continue
    }
    if (trimmed.startsWith('\\[') && !trimmed.includes('\\]')) {
      const span = [trimmed]
      let cursor = index + 1
      let closed = false
      while (cursor < lines.length) {
        const next = lines[cursor]!.trim()
        span.push(next)
        cursor += 1
        if (next.includes('\\]')) {
          closed = true
          break
        }
      }
      if (closed) {
        const joined = span.join('\n')
        const body = joined.slice(2, joined.indexOf('\\]'))
        flush()
        runs.push([{ kind: 'math', text: body.trim() }])
        // Anything after the closing delimiter is prose again, not math.
        const rest = joined.slice(joined.indexOf('\\]') + 2).trim()
        index = cursor - 1
        if (rest.length > 0) {
          runs.push([{ kind: 'text', text: rest }])
        }
        continue
      }
    }

    const parsed = classify(line)
    // Three things join the run in progress: a wrapped prose line, and a bullet
    // or ordered step continuing a list of the same kind. Everything else —
    // headings, display math, a change of list kind — starts a new run, so a
    // heading never swallows the prose under it.
    const continues =
      parsed.kind === 'text'
        ? currentKind === 'text'
        : (parsed.kind === 'bullet' || parsed.kind === 'ordered') && currentKind === parsed.kind
    if (!continues) flush()
    current.push(parsed)
    currentKind = parsed.kind
  }
  flush()
  return runs
}

/**
 * Render a text body as a lesson rather than as source.
 *
 * Blank-line separated runs become paragraphs, `###` becomes a real heading,
 * `-` and `1.` become real lists, and `\[...\]` becomes a display-math panel.
 */
function Paragraphs({ md, math }: { md: string; math?: readonly { tex: string; display: boolean; mathml: string }[] | undefined }): ReactNode {
  return (
    <>
      {toRuns(md).map((run, index) => {
        const first = run[0]!
        if (first.kind === 'heading') {
          const Tag = first.level === 2 ? 'h3' : 'h4'
          return (
            <Tag className={`dt-md-h${first.level}`} key={index}>
              {inline(first.text, math)}
            </Tag>
          )
        }
        if (first.kind === 'math') {
          const fragment = math?.find((entry) => entry.display && entry.tex === first.text)
          return (
            <div className="dt-math-block" key={index}>
              <MathMLView mathml={fragment?.mathml} fallback={<span className="dt-math-source">{first.text}</span>} />
            </div>
          )
        }
        if (first.kind === 'code') {
          return (
            <pre className="dt-md-code" key={index}>
              <code>{first.text}</code>
            </pre>
          )
        }
        if (first.kind === 'table') {
          const [head, ...body] = first.rows
          return (
            <div className="dt-md-table-wrap" key={index}>
              <table className="dt-md-table">
                <thead><tr>{(head ?? []).map((cell, column) => <th key={column}>{inline(cell, math)}</th>)}</tr></thead>
                <tbody>
                  {body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{inline(cell, math)}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          )
        }
        if (first.kind === 'bullet') {
          return (
            <ul className="dt-md-ul" key={index}>
              {run.map((line, inner) => (
                <li key={inner}>{inline('text' in line ? line.text : '', math)}</li>
              ))}
            </ul>
          )
        }
        if (first.kind === 'ordered') {
          return (
            <ol className="dt-md-ol" key={index}>
              {run.map((line, inner) => (
                <li key={inner}>{inline('text' in line ? line.text : '', math)}</li>
              ))}
            </ol>
          )
        }
        return (
          <p className="dt-block-md" key={index}>
            {inline(run.map((line) => ('text' in line ? line.text : '')).join(' '), math)}
          </p>
        )
      })}
    </>
  )
}

function TextBlockView({ block }: BlockRenderProps): ReactNode {
  if (block.type !== 'text') return null
  return (
    <div className="dt-block dt-block-text">
      <Paragraphs md={block.content.md} math={block.content.math ?? undefined} />
    </div>
  )
}

/** A label with a small mark, so block kinds are recognisable before reading. */
function BlockLabel({ icon, children }: { icon: ReactNode; children: ReactNode }): ReactNode {
  return (
    <p className="dt-block-label">
      <span className="dt-block-label-icon" aria-hidden="true">
        {icon}
      </span>
      {children}
    </p>
  )
}

function ExampleBlockView({ block }: BlockRenderProps): ReactNode {
  const text = useLessonText()
  if (block.type !== 'example') return null
  return (
    <div className="dt-block dt-block-example">
      <BlockLabel
        icon={
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12.5h4M6.4 14h3.2M8 2a4 4 0 0 1 2.4 7.2c-.4.3-.4.6-.4 1H6c0-.4 0-.7-.4-1A4 4 0 0 1 8 2z" />
          </svg>
        }
      >
        {text.workedExample}
      </BlockLabel>
      <h4>{block.content.title}</h4>
      <ol>
        {block.content.steps.map((step, index) => (
          <li key={index}>{inline(step)}</li>
        ))}
      </ol>
      {block.content.takeaway !== undefined && (
        <p className="dt-takeaway">{inline(block.content.takeaway)}</p>
      )}
    </div>
  )
}

function DiagramBlockView({ block }: BlockRenderProps): ReactNode {
  const text = useLessonText()
  if (block.type !== 'diagram') return null
  const isMermaid = block.content.format === 'mermaid'
  return (
    <div className="dt-block dt-block-diagram">
      <BlockLabel
        icon={
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <rect x="2" y="2.5" width="4.5" height="3.5" rx="1" />
            <rect x="9.5" y="10" width="4.5" height="3.5" rx="1" />
            <path d="M6.5 4.2h3a2 2 0 0 1 2 2v3.8" />
          </svg>
        }
      >
        {text.diagram}
      </BlockLabel>
      {isMermaid && (
        <p className="dt-caption">
          {text.mermaidSourcePrefix}
          <code>mermaid</code>
          {text.mermaidSourceSuffix}
        </p>
      )}
      <pre className="dt-pre">{block.content.spec}</pre>
      {block.content.caption !== undefined && <p className="dt-caption">{block.content.caption}</p>}
    </div>
  )
}

/**
 * The check.
 *
 * Rendered as an invitation rather than a field: this surface has no input box,
 * so the block has to make it obvious that the next move is the learner's and
 * that it happens in the chat. The wording says so instead of leaving a dead
 * question sitting in a panel.
 */
function CheckBlockView({ block }: BlockRenderProps): ReactNode {
  const text = useLessonText()
  if (block.type !== 'check') return null
  return (
    <div className="dt-block dt-block-check">
      <div className="dt-check-head">
        <span className="dt-check-tag">{text.yourTurn}</span>
        <span className="dt-check-where">{text.answerInChatHint}</span>
      </div>
      <div className="dt-check-body">
        <Paragraphs md={block.content.prompt} />
      </div>
      {block.content.hint !== undefined && (
        <p className="dt-check-hint">
          <span>{text.hint}</span>
          {inline(block.content.hint)}
        </p>
      )}
    </div>
  )
}

function FormulaBlockView({ block }: BlockRenderProps): ReactNode {
  const text = useLessonText()
  if (block.type !== 'formula') return null
  return (
    <div className="dt-block dt-block-formula">
      <BlockLabel icon={<span aria-hidden="true">∑</span>}>{text.formula}</BlockLabel>
      <div className="dt-formula-body">
        <MathMLView
          mathml={block.content.mathml}
          fallback={<div className="dt-math-block"><span className="dt-math-source">{block.content.tex}</span></div>}
        />
      </div>
      {block.content.caption !== undefined && <p className="dt-caption">{block.content.caption}</p>}
    </div>
  )
}

function CodeBlockView({ block }: BlockRenderProps): ReactNode {
  const text = useLessonText()
  if (block.type !== 'code') return null
  return (
    <div className="dt-block dt-block-code">
      <BlockLabel icon={<span aria-hidden="true">⌘</span>}>
        {text.code}{block.content.language === undefined ? '' : ` · ${block.content.language}`}
      </BlockLabel>
      <pre className="dt-pre"><code>{block.content.source}</code></pre>
      {block.content.caption !== undefined && <p className="dt-caption">{block.content.caption}</p>}
    </div>
  )
}

function QuizBlockView({ block, interaction }: BlockRenderProps): ReactNode {
  const text = useLessonText()
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  if (block.type !== 'quiz') return null
  const recorded = interaction?.responses.find((response) => response.blockId === block.id)
  const submitted = sent || recorded !== undefined
  const select = (questionId: string, value: string) => setValues((current) => ({ ...current, [questionId]: value }))
  const complete = block.content.questions.every((question) => {
    const value = recorded?.answers.find((answer) => answer.questionId === question.id)?.value ?? values[question.id]
    return typeof value === 'string' && value.length > 0
  })
  const submit = async () => {
    if (interaction === undefined || busy || !complete) return
    setBusy(true); setError('')
    try {
      await interaction.submit(block.id, block.content.questions.map((question) => ({
        questionId: question.id,
        value: recorded?.answers.find((answer) => answer.questionId === question.id)?.value ?? values[question.id] ?? '',
      })))
      interaction.onRecorded?.(block.id)
      setSent(true)
    } catch {
      setError(text.answerFailed)
    } finally { setBusy(false) }
  }
  return (
    <div className="dt-block dt-block-quiz">
      <BlockLabel icon={<span aria-hidden="true">?</span>}>{text.quiz}{block.content.title === undefined ? '' : ` · ${block.content.title}`}</BlockLabel>
      {block.content.questions.map((question, index) => {
        const chosen = recorded?.answers.find((answer) => answer.questionId === question.id)?.value ?? values[question.id] ?? ''
        return (
          <div className="dt-quiz-question" key={question.id}>
            <p className="dt-quiz-prompt"><b>{index + 1}.</b> {inline(question.prompt)}</p>
            {question.options !== undefined
              ? <div className="dt-quiz-options" role="radiogroup" aria-label={question.prompt}>
                  {question.options.map((option) => (
                    <label className="dt-quiz-option" key={option}>
                      <input type="radio" name={`${block.id}-${question.id}`} value={option} checked={chosen === option} disabled={submitted || interaction === undefined} onChange={() => select(question.id, option)} />
                      <span>{inline(option)}</span>
                    </label>
                  ))}
                </div>
              : <input className="dt-quiz-input" aria-label={question.prompt} value={chosen} disabled={submitted || interaction === undefined} onChange={(event) => select(question.id, event.target.value)} />}
          </div>
        )
      })}
      {interaction === undefined
        ? <p className="dt-caption">{text.quizAnswerInChat}</p>
        : submitted
          ? <p className="dt-quiz-recorded" role="status">{text.answerRecorded}</p>
          : <button type="button" className="dt-secondary" disabled={busy || !complete} onClick={() => void submit()}>{text.submitAnswer}</button>}
      {error !== '' && <p className="dt-caption" role="alert">{error}</p>}
    </div>
  )
}

function FlashcardBlockView({ block, interaction }: BlockRenderProps): ReactNode {
  const text = useLessonText()
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (block.type !== 'flashcard') return null
  const recorded = interaction?.responses.find((response) => response.blockId === block.id)
  const submit = async (value: 'again' | 'got-it') => {
    if (interaction === undefined || busy) return
    setBusy(true); setError('')
    try {
      await interaction.submit(block.id, [{ questionId: block.id, value }])
      interaction.onRecorded?.(block.id)
      setRevealed(true)
    } catch {
      setError(text.answerFailed)
    } finally { setBusy(false) }
  }
  return (
    <div className="dt-block dt-block-flashcard">
      <BlockLabel icon={<span aria-hidden="true">▣</span>}>{text.flashcard}</BlockLabel>
      <div className="dt-flashcard">
        <p className="dt-flashcard-front">{inline(block.content.front)}</p>
        {interaction === undefined
          ? <details><summary>{text.showAnswer}</summary><p className="dt-flashcard-back">{inline(block.content.back)}</p></details>
          : (revealed || recorded !== undefined)
            ? <p className="dt-flashcard-back">{inline(block.content.back)}</p>
            : <button type="button" className="dt-secondary" onClick={() => setRevealed(true)}>{text.showAnswer}</button>}
        {interaction !== undefined && (revealed || recorded !== undefined) && recorded === undefined && (
          <div className="dt-flashcard-actions">
            <button type="button" className="dt-secondary" disabled={busy} onClick={() => void submit('again')}>{text.flashcardAgain}</button>
            <button type="button" className="dt-secondary" disabled={busy} onClick={() => void submit('got-it')}>{text.flashcardGotIt}</button>
          </div>
        )}
        {recorded !== undefined && <p className="dt-quiz-recorded" role="status">{text.answerRecorded}</p>}
      </div>
      {block.content.tags !== undefined && <p className="dt-caption">{block.content.tags.join(' · ')}</p>}
      {error !== '' && <p className="dt-caption" role="alert">{error}</p>}
    </div>
  )
}

function ResourceBlockView({ block }: BlockRenderProps): ReactNode {
  const text = useLessonText()
  if (block.type !== 'resource') return null
  return (
    <div className="dt-block dt-block-resource">
      <BlockLabel icon={<span aria-hidden="true">↗</span>}>{text.resource}</BlockLabel>
      <p className="dt-resource-title">{inline(block.content.title)}</p>
      {(block.content.locator !== undefined || block.content.sourceId !== undefined) && (
        <p className="dt-caption">{text.sourceRef}{block.content.locator === undefined ? '' : ` · ${block.content.locator}`}</p>
      )}
      {block.content.url !== undefined && <p className="dt-caption">{block.content.url}</p>}
      {block.content.note !== undefined && <p className="dt-caption">{inline(block.content.note)}</p>}
    </div>
  )
}

function ComparisonBlockView({ block }: BlockRenderProps): ReactNode {
  const text = useLessonText()
  if (block.type !== 'comparison') return null
  return (
    <div className="dt-block dt-block-comparison">
      <BlockLabel icon={<span aria-hidden="true">⇄</span>}>{text.comparison}</BlockLabel>
      <div className="dt-md-table-wrap">
        <table className="dt-md-table">
          <thead><tr>{block.content.columns.map((column) => <th key={column}>{inline(column)}</th>)}</tr></thead>
          <tbody>
            {block.content.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{inline(cell)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.content.caption !== undefined && <p className="dt-caption">{block.content.caption}</p>}
    </div>
  )
}

/**
 * The registry. Adding a block type means adding one entry here.
 *
 * Deliberately a plain object rather than a switch: a `Map`/record makes the
 * extension point visible and keeps the fallback impossible to forget.
 */
export const BLOCK_RENDERERS: Record<string, Renderer> = {
  text: TextBlockView,
  example: ExampleBlockView,
  diagram: DiagramBlockView,
  check: CheckBlockView,
  formula: FormulaBlockView,
  code: CodeBlockView,
  quiz: QuizBlockView,
  flashcard: FlashcardBlockView,
  resource: ResourceBlockView,
  comparison: ComparisonBlockView,
}

/** Shown for a block type this build does not know. Never throws. */
function UnknownBlockView({ block }: { block: StoredBlock }): ReactNode {
  const text = useLessonText()
  const type = (block as { type?: unknown }).type
  return (
    <div className="dt-block dt-block-unknown">
      <strong>{typeof type === 'string' ? type : text.unknownType}</strong>
      {text.unknownBlockAfter}
    </div>
  )
}

/**
 * Render one block, degrading for anything unrecognised.
 *
 * @param props.block - the block to render.
 * @returns the rendered block.
 */
function SourceRefs({ block, interaction }: { block: StoredBlock; interaction?: BlockInteraction | undefined }): ReactNode {
  const text = useLessonText()
  const [open, setOpen] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ title: string; locator: string; content: string } | null>(null)
  const [error, setError] = useState('')
  const refs = block.sourceRefs ?? []
  if (refs.length === 0) return null
  const load = async (sourceId: string) => {
    if (open === sourceId) { setOpen(null); setPreview(null); return }
    setOpen(sourceId); setPreview(null); setError('')
    if (interaction?.loadSource === undefined) return
    try {
      const source = await interaction.loadSource(sourceId)
      setPreview({ title: source.title, locator: source.locator, content: source.content ?? '' })
    } catch { setError(text.answerFailed) }
  }
  return (
    <div className="dt-source-refs">
      <p className="dt-block-label">{text.sourceRef}</p>
      {refs.map((ref) => (
        <button type="button" className="dt-source-ref" key={`${ref.sourceId}:${ref.locator}`} onClick={() => void load(ref.sourceId)}>
          {ref.locator}
        </button>
      ))}
      {open !== null && preview !== null && (
        <div className="dt-source-preview">
          <p className="dt-source-preview-title">{preview.title}</p>
          <p className="dt-caption">{preview.locator}</p>
          <pre>{preview.content.slice(0, 4000)}</pre>
        </div>
      )}
      {error !== '' && <p className="dt-caption" role="alert">{error}</p>}
    </div>
  )
}

export function BlockView({ block, interaction }: { block: StoredBlock; interaction?: BlockInteraction | undefined }): ReactNode {
  if (!isKnownBlock(block)) {
    return <div data-block-type={block.type}><UnknownBlockView block={block} /><SourceRefs block={block} interaction={interaction} /></div>
  }
  const renderer = BLOCK_RENDERERS[block.type]
  if (renderer === undefined) {
    return <div data-block-type={block.type}><UnknownBlockView block={block} /><SourceRefs block={block} interaction={interaction} /></div>
  }
  // Render the registered renderer as a component, not by calling it. Study
  // swaps one block at a time inside the same position, so a direct call makes
  // the renderer's hooks change order when the block type changes.
  return <div data-block-type={block.type}>{createElement(renderer, { block, interaction })}<SourceRefs block={block} interaction={interaction} /></div>
}

/**
 * Render a whole lesson's blocks in order.
 *
 * @param props.blocks - the blocks to render.
 * @returns the rendered list.
 */
export function LessonBody({ blocks, interaction }: { blocks: readonly StoredBlock[]; interaction?: BlockInteraction | undefined }): ReactNode {
  return (
    <>
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} interaction={interaction} />
      ))}
    </>
  )
}

/**
 * The recommendation card.
 *
 * The learner reads *why* before they move, and nothing moves until they press
 * the button — the tutor decides, the runtime stores, the learner chooses. That
 * ordering is the whole point of the card existing rather than an automatic
 * jump.
 *
 * Wording follows the decision: a move names where it goes, a stay says so
 * plainly. No percentage, no score, no completion estimate — how far along the
 * learner is lives in the node's state and evidence, and nowhere else.
 */
export function NextStepCard({
  nextStep,
  onContinue,
  busy,
}: {
  nextStep: NextStepView
  onContinue: () => void
  busy?: boolean
}): ReactNode {
  const text = useLearningText()
  const lang = useLang()
  const moves = nextStep.targetNodeId !== null
  return (
    <div className="dt-next">
      <p className="dt-next-label">
        <span className="dt-next-arrow" aria-hidden="true">
          ↓
        </span>
        {text.nextBestStep}
      </p>
      <p className="dt-next-from">
        <span className="dt-next-tick" aria-hidden="true">
          ✓
        </span>
        {nextStep.fromNodeTitle} — {readinessLabel(nextStep.action, lang)}
      </p>
      <p className="dt-next-target">
        {moves ? (
          <>
            {text.nextPrefix} <b>{nextStep.targetNodeTitle}</b>
          </>
        ) : (
          <>
            {text.nextPrefix} <b>{text.stayOn(nextStep.fromNodeTitle)}</b>
          </>
        )}
      </p>
      <p className="dt-next-why">
        <span className="dt-next-why-label">{text.why}</span> {nextStep.reason}
      </p>
      <button type="button" className="dt-primary" onClick={onContinue} disabled={busy === true}>
        {/* The label comes from the shared rule, so a sentence elsewhere that
            points at this button cannot name a different verb. */}
        {busy === true ? text.starting : continuationLabel(nextStep, lang)}
      </button>
    </div>
  )
}

/**
 * The handoff progress line.
 *
 * A model turn is not instant, and a silent wait is indistinguishable from a
 * broken button — so the wait is narrated: which stage it is in, how long it
 * has been, and how many attempts. When it goes quiet the learner gets a retry
 * rather than a dead end, and retrying **never touches the focus**: the record
 * is a statement about the wait, never about where they are.
 *
 * The elapsed time is shown because it is honest. A tutor that takes ninety
 * seconds should look like a tutor that takes ninety seconds, not like a hang —
 * and a record restored from three days ago should not look like one either,
 * which is why the unit changes once the wait is no longer a wait being
 * watched.
 */
export function HandoffLine({
  handoff,
  onRetry,
}: {
  handoff: HandoffView
  onRetry: () => void
}): ReactNode {
  const text = useLearningText()
  const lang = useLang()
  const retryable = handoff.phase === 'failed' || handoff.phase === 'stalled'
  const elapsed = formatDuration(handoff.elapsedMs, lang)
  return (
    <div className="dt-handoff" data-phase={handoff.phase}>
      <span className="dt-handoff-dot" aria-hidden="true" />
      {/* The phase is the stable part; the host's label is English. */}
      <span className="dt-handoff-label">{text.handoffLabel(handoff.phase)}</span>
      {elapsed !== '' && <span className="dt-handoff-time">{elapsed}</span>}
      {handoff.attempts > 1 && <span className="dt-handoff-try">{text.handoffAttempts(handoff.attempts)}</span>}
      {handoff.detail !== undefined && <span className="dt-handoff-detail">{handoff.detail}</span>}
      {retryable && (
        <button type="button" className="dt-handoff-retry" onClick={onRetry}>
          {text.askAgain}
        </button>
      )}
    </div>
  )
}

/**
 * The learner's controls over their own data.
 *
 * Both promises this project makes about state are kept here: that it is
 * **visible and exportable**, and that it can be **deleted**. An export that
 * only existed as an API route would not be a promise kept, and a delete that
 * happened on one click would be a trap — so the second click is the
 * confirmation, inline, with no dialog to dismiss by reflex.
 */
export function DataFooter({
  onExport,
  onReset,
  busy,
}: {
  onExport: () => void
  onReset: () => void
  busy?: boolean
}): ReactNode {
  const text = useLessonText()
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="dt-data dt-data-confirm">
        <p className="dt-data-ask">{text.deleteConfirm}</p>
        <div className="dt-data-row">
          <button
            type="button"
            className="dt-danger"
            onClick={() => {
              setConfirming(false)
              onReset()
            }}
            disabled={busy === true}
          >
            {busy === true ? text.deleting : text.deleteYes}
          </button>
          <button type="button" className="dt-quiet" onClick={() => setConfirming(false)}>
            {text.cancel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dt-data">
      <button type="button" className="dt-quiet" onClick={onExport} disabled={busy === true}>
        {text.exportData}
      </button>
      <button type="button" className="dt-quiet" onClick={() => setConfirming(true)} disabled={busy === true}>
        {text.deleteAll}
      </button>
      <span className="dt-data-note">{text.dataNote}</span>
    </div>
  )
}
