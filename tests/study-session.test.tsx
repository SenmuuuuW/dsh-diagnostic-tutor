// @vitest-environment jsdom
/** Focused study: one stored block at a time, answers still submitted through the runtime. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import type { StoredBlock } from '../src/contract.js'
import type { BlockInteraction } from '../src/client/blocks.jsx'
import { resetLanguageForTests, setLang } from '../src/client/i18n.js'
import { StudySession } from '../src/client/study.jsx'

const blocks: StoredBlock[] = [
  { id: 'b1', type: 'text', content: { md: 'A vector has a shape.' } } as StoredBlock,
  { id: 'b2', type: 'quiz', content: { questions: [{ id: 'q1', kind: 'mcq', prompt: 'Which shape?', options: ['(4, 3)', '(3,)'] }] } } as StoredBlock,
]
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  resetLanguageForTests()
})
function button(label: string): HTMLButtonElement {
  const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent?.trim() === label)
  expect(target, label).toBeDefined()
  return target!
}
async function mount(interaction: BlockInteraction | undefined = undefined) {
  const onExit = vi.fn()
  await act(async () => {
    root.render(createElement(StudySession, { title: 'Shapes', blocks, interaction, onExit }))
    await Promise.resolve()
  })
  return { onExit }
}
function interaction(submit: BlockInteraction['submit']): BlockInteraction {
  return { attemptId: 'a1', responses: [], submit }
}

describe('focused study', () => {
  it('renders one block at a time and switches block types without changing hook order', async () => {
    await mount()
    expect(container.textContent).toContain('A vector has a shape.')
    expect(container.textContent).not.toContain('Which shape?')
    expect(container.textContent).toContain('Step 1 of 2')
    await act(async () => { button('Continue').click(); await Promise.resolve() })
    expect(container.textContent).toContain('Which shape?')
    expect(container.textContent).not.toContain('A vector has a shape.')
    expect(container.textContent).toContain('Step 2 of 2')
  })

  it('does not advance past a quiz until its answer is recorded', async () => {
    const submit = vi.fn(async () => {})
    await mount(interaction(submit))
    await act(async () => { button('Continue').click(); await Promise.resolve() })
    expect(button('Finish').disabled).toBe(true)
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[value="(4, 3)"]')!.click()
      await Promise.resolve()
    })
    await act(async () => { button('Record my answer').click(); await Promise.resolve() })
    expect(submit).toHaveBeenCalledWith('b2', [{ questionId: 'q1', value: '(4, 3)' }])
    expect(container.textContent).toContain('Answer recorded')
    expect(button('Finish').disabled).toBe(false)
  })

  it('finishes with factual evidence counts, never a score or mastery claim', async () => {
    const { onExit } = await mount(interaction(vi.fn(async () => {})))
    await act(async () => { button('Continue').click(); await Promise.resolve() })
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[value="(3,)"]')!.click()
      await Promise.resolve()
    })
    await act(async () => { button('Record my answer').click(); await Promise.resolve() })
    await act(async () => { button('Finish').click(); await Promise.resolve() })
    expect(container.textContent).toContain('Lesson complete')
    expect(container.textContent).toContain('2 content blocks')
    expect(container.textContent).toContain('1 practice answers recorded')
    expect(container.textContent).not.toMatch(/\d+\s*%|mastered|score/i)
    await act(async () => { button('Finish').click(); await Promise.resolve() })
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('keeps a read-only quiz navigable when no interaction is available', async () => {
    await mount()
    await act(async () => { button('Continue').click(); await Promise.resolve() })
    expect(button('Finish').disabled).toBe(false)
  })

  it('translates the focused surface', async () => {
    setLang('zh')
    await mount()
    expect(container.textContent).toContain('专注学习')
    expect(container.textContent).toContain('第 1 / 2 步')
    expect(button('继续')).toBeDefined()
  })
})
