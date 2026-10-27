/**
 * A plain-text projection of learning blocks for harnesses without this UI.
 *
 * The panel is the rich surface; the model-facing tool result still needs to be
 * usable when the client half is absent. This is deliberately a projection, not
 * another renderer: no HTML, no styling, no state.
 */

import type { StoredBlock } from './lesson.js'
import { isKnownBlock } from './block-types.js'

function table(columns: string[], rows: string[][]): string {
  const head = `| ${columns.join(' | ')} |`
  const divider = `| ${columns.map(() => '---').join(' | ')} |`
  return [head, divider, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
}

/** Render stored blocks as Markdown for model/tool consumers. */
export function blocksMarkdown(blocks: readonly StoredBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (!isKnownBlock(block)) {
      parts.push(`[unsupported block: ${block.type}]`)
      continue
    }
    switch (block.type) {
      case 'text':
        parts.push(block.content.md)
        break
      case 'formula':
        parts.push(block.content.display === true ? `\\[${block.content.tex}\\]` : `\\(${block.content.tex}\\)`)
        break
      case 'example':
        parts.push([
          `### ${block.content.title}`,
          ...block.content.steps.map((step, index) => `${index + 1}. ${step}`),
          ...(block.content.takeaway === undefined ? [] : [`> ${block.content.takeaway}`]),
        ].join('\n'))
        break
      case 'diagram':
        parts.push(`\`\`\`\n${block.content.spec}\n\`\`\``)
        break
      case 'check':
        parts.push(`**Your turn:** ${block.content.prompt}${block.content.hint === undefined ? '' : `\n\n> Hint: ${block.content.hint}`}`)
        break
      case 'code':
        parts.push(`\`\`\`${block.content.language ?? ''}\n${block.content.source}\n\`\`\``)
        break
      case 'quiz':
        parts.push([
          `### ${block.content.title ?? 'Quiz'}`,
          ...block.content.questions.flatMap((question, index) => [
            `${index + 1}. ${question.prompt}`,
            ...(question.options ?? []).map((option) => `   - ${option}`),
          ]),
          'Answer in the chat; the tutor will respond there.',
        ].join('\n'))
        break
      case 'flashcard':
        parts.push(`**Flashcard — front:** ${block.content.front}\n\n**Back:** ${block.content.back}`)
        break
      case 'resource':
        parts.push(`**Resource:** ${block.content.title}${block.content.locator === undefined ? '' : ` — ${block.content.locator}`}${block.content.note === undefined ? '' : `\n\n${block.content.note}`}`)
        break
      case 'comparison':
        parts.push(table(block.content.columns, block.content.rows))
        break
    }
  }
  return parts.join('\n\n')
}
