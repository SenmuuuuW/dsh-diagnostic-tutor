// @vitest-environment jsdom
/**
 * How a lesson is displayed.
 *
 * The teaching brain writes ordinary light markdown inside its blocks — `###`
 * headings, `-` bullets, `1.` steps — because that is how a person writes an
 * explanation. Printing the markers verbatim is what makes a lesson read like a
 * Markdown source file instead of a lesson, so these tests pin the display of
 * each construct.
 *
 * This adds no block type: text, example, diagram and check are still the whole
 * vocabulary, and the registry is unchanged.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BlockView, LessonBody } from '../src/client/blocks.jsx'
import type { Block } from '../src/contract.js'

const text = (md: string): Block => ({ id: 'b', type: 'text', content: { md } }) as Block

const render = (block: Block): string => renderToStaticMarkup(createElement(BlockView, { block }))

describe('a text block is displayed as a lesson, not as source', () => {
  it('turns ### into a heading instead of printing the hashes', () => {
    const html = render(text('### 先把问题缩到最小'))
    expect(html).toContain('<h4')
    expect(html).toContain('先把问题缩到最小')
    expect(html).not.toContain('###')
  })

  it('turns ## into a larger heading', () => {
    const html = render(text('## The rule'))
    expect(html).toContain('<h3')
    expect(html).not.toContain('##')
  })

  it('turns - into a real list', () => {
    const html = render(text('- first\n- second\n- third'))
    expect(html).toContain('<ul')
    expect(html.match(/<li/g)).toHaveLength(3)
    expect(html).not.toContain('- first')
  })

  it('turns 1. into an ordered list', () => {
    const html = render(text('1. 预测\n2. 算错多少\n3. 调参数'))
    expect(html).toContain('<ol')
    expect(html.match(/<li/g)).toHaveLength(3)
    // The markers are the list's job, not the text's.
    expect(html).not.toContain('1. 预测')
  })

  it('does not merge a heading into the list after it', () => {
    const html = render(text('### 一次训练循环\n\n- 预测\n- 调参'))
    expect(html).toContain('<h4')
    expect(html).toContain('<ul')
    // Heading first, then the list: the heading must not become a list item.
    expect(html.indexOf('<h4')).toBeLessThan(html.indexOf('<ul'))
  })

  it('keeps bold, code and inline math', () => {
    const html = render(text('**形状** 是 `(n,d)`，内维用 \\(X w\\) 判断。'))
    expect(html).toContain('<strong>形状</strong>')
    expect(html).toContain('<code>(n,d)</code>')
    expect(html).toContain('dt-math')
  })

  it('sets display math apart from the prose', () => {
    const html = render(text('更新式是\n\n\\[ w \\leftarrow w - \\eta f\u0027(w) \\]\n\n就这么简单。'))
    expect(html).toContain('dt-math-block')
    expect(html).toContain('就这么简单')
  })

  it('separates paragraphs on blank lines', () => {
    const html = render(text('第一段。\n\n第二段。'))
    expect(html.match(/<p class="dt-block-md"/g)).toHaveLength(2)
  })

  it('joins a wrapped paragraph rather than breaking it', () => {
    // A soft-wrapped line inside a paragraph is still one paragraph.
    const html = render(text('这是一句\n被折行的句子。'))
    expect(html.match(/<p class="dt-block-md"/g)).toHaveLength(1)
  })
})

describe('the check is an invitation, not a field', () => {
  const check: Block = {
    id: 'c',
    type: 'check',
    content: { prompt: 'X 的形状是 (5,3)，Xw 是什么形状？', hint: '看内维。' },
  } as Block

  it('says whose turn it is and where to answer', () => {
    const html = render(check)
    expect(html).toContain('Your turn')
    expect(html).toContain('answer in the chat')
    expect(html).toContain('X 的形状是 (5,3)')
  })

  it('shows the hint as a hint', () => {
    const html = render(check)
    expect(html).toContain('dt-check-hint')
    expect(html).toContain('Hint')
  })

  it('renders the prompt through the same lesson formatting', () => {
    const structured = { ...check, content: { prompt: '1. 先说形状\n2. 再说原因' } } as Block
    const html = render(structured)
    expect(html).toContain('<ol')
  })
})

describe('examples and diagrams announce themselves', () => {
  it('labels a worked example', () => {
    const html = render({
      id: 'e',
      type: 'example',
      content: { title: '30 套房', steps: ['数行数', '数列数'], takeaway: '形状是 30×5。' },
    } as Block)
    expect(html).toContain('Worked example')
    expect(html).toContain('30 套房')
    expect(html).toContain('形状是 30×5。')
  })

  it('labels a diagram and keeps its source legible', () => {
    const html = render({
      id: 'd',
      type: 'diagram',
      content: { format: 'ascii', spec: '预测 → 算错 → 调参' },
    } as Block)
    expect(html).toContain('Diagram')
    expect(html).toContain('dt-pre')
    expect(html).toContain('预测 → 算错 → 调参')
  })

  it('says so when it cannot render a mermaid diagram', () => {
    const html = render({
      id: 'd',
      type: 'diagram',
      content: { format: 'mermaid', spec: 'graph TD; A-->B' },
    } as Block)
    // Honest about the gap rather than showing nothing.
    expect(html).toContain('no')
    expect(html).toContain('mermaid')
  })
})

describe('the lesson keeps its shape', () => {
  it('renders every block in order, tagged by type', () => {
    const html = renderToStaticMarkup(
      createElement(LessonBody, {
        blocks: [
          text('### 开头'),
          { id: 'e', type: 'example', content: { title: 'E', steps: ['a'] } } as Block,
          { id: 'c', type: 'check', content: { prompt: 'Q' } } as Block,
        ],
      }),
    )
    const order = [...html.matchAll(/data-block-type="([a-z]+)"/g)].map((match) => match[1])
    expect(order).toEqual(['text', 'example', 'check'])
  })

  it('still degrades for a block type it does not know', () => {
    const html = render({ id: 'x', type: 'formula', content: {} } as unknown as Block)
    expect(html).toContain('formula')
    expect(html).toContain('no')
  })

  it('never renders a score, percentage or stars', () => {
    const html = renderToStaticMarkup(
      createElement(LessonBody, {
        blocks: [text('### 标题\n\n- 一\n- 二'), { id: 'c', type: 'check', content: { prompt: 'Q' } } as Block],
      }),
    )
    expect(html).not.toMatch(/\d+\s*%/)
    expect(html.toLowerCase()).not.toContain('star')
    expect(html.toLowerCase()).not.toContain('score')
  })
})
