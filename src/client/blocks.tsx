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

import type { ReactNode } from 'react'

import type { Block, HandoffView, NextStepView } from '../contract.js'

/** Props every renderer receives. */
export interface BlockRenderProps<B extends Block = Block> {
  block: B
}

type Renderer = (props: BlockRenderProps) => ReactNode

/**
 * Inline formatting: `**bold**`, `` `code` ``, and inline math.
 *
 * Math is handled because the teaching brain writes it by convention —
 * `\(...\)` inline and `\[...\]` display are the skill's own rule — and a
 * STEM surface that prints the delimiters verbatim is unreadable.
 *
 * This is *styling*, not typesetting: the span is set apart and given a
 * monospace face so the expression is legible. Real math rendering needs a
 * typesetter (KaTeX or MathML), which is a later decision, not a silent gap.
 */
const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\\\([^)]*\\\))/g

function inline(text: string): ReactNode[] {
  return text
    .split(INLINE_PATTERN)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
      if (part.startsWith('\\(') && part.endsWith('\\)')) {
        return (
          <span className="dt-math" key={index}>
            {part.slice(2, -2)}
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

/** Group consecutive lines into runs that render as one element. */
function toRuns(md: string): Line[][] {
  const runs: Line[][] = []
  let current: Line[] = []
  let currentKind: Line['kind'] | null = null
  const flush = (): void => {
    if (current.length > 0) runs.push(current)
    current = []
    currentKind = null
  }
  for (const raw of md.split(/\n/)) {
    const line = raw.trimEnd()
    if (line.trim().length === 0) {
      flush()
      continue
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
function Paragraphs({ md }: { md: string }): ReactNode {
  return (
    <>
      {toRuns(md).map((run, index) => {
        const first = run[0]!
        if (first.kind === 'heading') {
          const Tag = first.level === 2 ? 'h3' : 'h4'
          return (
            <Tag className={`dt-md-h${first.level}`} key={index}>
              {inline(first.text)}
            </Tag>
          )
        }
        if (first.kind === 'math') {
          return (
            <div className="dt-math-block" key={index}>
              {first.text}
            </div>
          )
        }
        if (first.kind === 'bullet') {
          return (
            <ul className="dt-md-ul" key={index}>
              {run.map((line, inner) => (
                <li key={inner}>{inline(line.text)}</li>
              ))}
            </ul>
          )
        }
        if (first.kind === 'ordered') {
          return (
            <ol className="dt-md-ol" key={index}>
              {run.map((line, inner) => (
                <li key={inner}>{inline(line.text)}</li>
              ))}
            </ol>
          )
        }
        return (
          <p className="dt-block-md" key={index}>
            {inline(run.map((line) => line.text).join(' '))}
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
      <Paragraphs md={block.content.md} />
    </div>
  )
}

function ExampleBlockView({ block }: BlockRenderProps): ReactNode {
  if (block.type !== 'example') return null
  return (
    <div className="dt-block dt-block-example">
      <p className="dt-block-label">Worked example</p>
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
  if (block.type !== 'diagram') return null
  const isMermaid = block.content.format === 'mermaid'
  return (
    <div className="dt-block dt-block-diagram">
      <p className="dt-block-label">Diagram</p>
      {isMermaid && (
        <p className="dt-caption">
          Source shown as text — this build ships no <code>mermaid</code> renderer.
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
  if (block.type !== 'check') return null
  return (
    <div className="dt-block dt-block-check">
      <div className="dt-check-head">
        <span className="dt-check-tag">Your turn</span>
        <span className="dt-check-where">answer in the chat →</span>
      </div>
      <div className="dt-check-body">
        <Paragraphs md={block.content.prompt} />
      </div>
      {block.content.hint !== undefined && (
        <p className="dt-check-hint">
          <span>Hint</span>
          {inline(block.content.hint)}
        </p>
      )}
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
}

/** Shown for a block type this build does not know. Never throws. */
function UnknownBlockView({ block }: BlockRenderProps): ReactNode {
  const type = (block as { type?: unknown }).type
  return (
    <div className="dt-block dt-block-unknown">
      <strong>{typeof type === 'string' ? type : 'unknown'}</strong> block — this build has no
      renderer for it. Update the plugin to see it.
    </div>
  )
}

/**
 * Render one block, degrading for anything unrecognised.
 *
 * @param props.block - the block to render.
 * @returns the rendered block.
 */
export function BlockView({ block }: { block: Block }): ReactNode {
  const renderer = BLOCK_RENDERERS[block.type] ?? UnknownBlockView
  return <div data-block-type={block.type}>{renderer({ block })}</div>
}

/**
 * Render a whole lesson's blocks in order.
 *
 * @param props.blocks - the blocks to render.
 * @returns the rendered list.
 */
export function LessonBody({ blocks }: { blocks: Block[] }): ReactNode {
  return (
    <>
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} />
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
  const moves = nextStep.targetNodeId !== null
  return (
    <div className="dt-next">
      <p className="dt-next-label">
        <span className="dt-next-arrow" aria-hidden="true">
          ↓
        </span>
        Next best step
      </p>
      <p className="dt-next-from">
        <span className="dt-next-tick" aria-hidden="true">
          ✓
        </span>
        {nextStep.fromNodeTitle} — {nextStep.action.replace(/-/g, ' ')}
      </p>
      <p className="dt-next-target">
        {moves ? (
          <>
            Next: <b>{nextStep.targetNodeTitle}</b>
          </>
        ) : (
          <>
            Next: <b>Stay on {nextStep.fromNodeTitle}</b>
          </>
        )}
      </p>
      <p className="dt-next-why">
        <span className="dt-next-why-label">Why:</span> {nextStep.reason}
      </p>
      <button type="button" className="dt-primary" onClick={onContinue} disabled={busy === true}>
        {busy === true ? 'Starting…' : moves ? 'Continue learning' : 'Continue'}
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
 * seconds should look like a tutor that takes ninety seconds, not like a hang.
 */
export function HandoffLine({
  handoff,
  onRetry,
}: {
  handoff: HandoffView
  onRetry: () => void
}): ReactNode {
  const retryable = handoff.phase === 'failed' || handoff.phase === 'stalled'
  const seconds = Math.round(handoff.elapsedMs / 1000)
  return (
    <div className="dt-handoff" data-phase={handoff.phase}>
      <span className="dt-handoff-dot" aria-hidden="true" />
      <span className="dt-handoff-label">{handoff.label}</span>
      <span className="dt-handoff-time">{seconds}s</span>
      {handoff.attempts > 1 && <span className="dt-handoff-try">attempt {handoff.attempts}</span>}
      {handoff.detail !== undefined && <span className="dt-handoff-detail">{handoff.detail}</span>}
      {retryable && (
        <button type="button" className="dt-handoff-retry" onClick={onRetry}>
          Ask again
        </button>
      )}
    </div>
  )
}
