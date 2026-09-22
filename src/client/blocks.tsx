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

import type { Block } from '../contract.js'

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

/**
 * Split a text body into display-math blocks and prose paragraphs, then format
 * each part inline. Blank-line separated, so a TextBlock reads as prose rather
 * than one wall.
 */
function Paragraphs({ md }: { md: string }): ReactNode {
  const segments = md.split(/(\\\[[\s\S]*?\\\])/g).filter((part) => part.trim().length > 0)
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.startsWith('\\[') && segment.endsWith('\\]')) {
          return (
            <div className="dt-math-block" key={index}>
              {segment.slice(2, -2).trim()}
            </div>
          )
        }
        return segment
          .split(/\n{2,}/)
          .filter((part) => part.trim().length > 0)
          .map((paragraph, inner) => (
            <p key={`${index}-${inner}`} className="dt-block-md">
              {inline(paragraph.trim())}
            </p>
          ))
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
      {isMermaid && (
        <p className="dt-caption">
          Diagram source (<code>mermaid</code>) — shown as text because this build ships no
          mermaid renderer.
        </p>
      )}
      <pre className="dt-pre">{block.content.spec}</pre>
      {block.content.caption !== undefined && <p className="dt-caption">{block.content.caption}</p>}
    </div>
  )
}

function CheckBlockView({ block }: BlockRenderProps): ReactNode {
  if (block.type !== 'check') return null
  return (
    <div className="dt-block dt-block-check">
      <div className="dt-check-tag">Check — answer in the chat</div>
      <Paragraphs md={block.content.prompt} />
      {block.content.hint !== undefined && <p className="dt-caption">{block.content.hint}</p>}
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
