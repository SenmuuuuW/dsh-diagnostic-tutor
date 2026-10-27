// @vitest-environment jsdom
/**
 * Shared legacy-learning copy follows the interface language.
 *
 * These are the pieces both the docked tab and the standalone panel render:
 * the next-step card, the handoff line, the welcome feature row and the sidebar
 * Learn action. English defaults must stay byte-identical; Chinese must not
 * leave English chrome behind.
 */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { HandoffView, NextStepView, OverviewResponse } from '../src/contract.js'
import { LearningPanel } from '../src/client/app.js'
import { HandoffLine, NextStepCard } from '../src/client/blocks.js'
import { getLang, resetLanguageForTests, setLang } from '../src/client/i18n.js'
import { LearnAction } from '../src/client/index.js'
import { runtimeCopy, tabTitleFor } from '../src/client/learning-text.js'
import { LearningTab } from '../src/client/tab.jsx'
import type { PanelClient } from '../src/client/use-learning.js'
import { FeatureRow } from '../src/client/visuals.jsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const EMPTY_OVERVIEW: OverviewResponse = {
  ok: true,
  selection: 'none',
  course: null,
  nodes: [],
  focus: null,
  nextStep: null,
  handoff: null,
  teachingBrain: null,
  lessonCount: 0,
  library: [],
}

const PANEL_CLIENT: PanelClient = {
  fetchOverview: () => Promise.resolve(EMPTY_OVERVIEW),
  fetchNode: () => Promise.reject(new Error('no node')),
  fetchLesson: () => Promise.resolve({ ok: true, lesson: null }),
  startFocus: () => Promise.reject(new Error('no focus')),
}

const NEXT_STEP: NextStepView = {
  fromNodeId: 'ml:math',
  fromNodeTitle: 'Math Foundations',
  targetNodeId: 'ml:la',
  targetNodeTitle: 'Linear Algebra',
  action: 'advance-with-caution',
  reason: 'The derivative check passed.',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const HANDOFF: HandoffView = {
  targetNodeId: 'ml:math',
  phase: 'failed',
  label: 'Could not reach the tutor',
  elapsedMs: 65_000,
  attempts: 2,
  stages: {},
  detail: 'The conversation is busy.',
}

beforeEach(() => resetLanguageForTests())
afterEach(() => resetLanguageForTests())

describe('shared learning copy', () => {
  it('keeps the next-step card in English by default', () => {
    const html = renderToStaticMarkup(
      createElement(NextStepCard, { nextStep: NEXT_STEP, onContinue: () => {} }),
    )
    expect(html).toContain('Next best step')
    expect(html).toContain('advance with caution')
    expect(html).toContain('Next:')
    expect(html).toContain('Why:')
    expect(html).toContain('Continue learning')
  })

  it('switches the next-step card to Chinese in place', () => {
    act(() => setLang('zh'))
    const html = renderToStaticMarkup(
      createElement(NextStepCard, { nextStep: NEXT_STEP, onContinue: () => {} }),
    )
    expect(html).toContain('下一步建议')
    expect(html).toContain('谨慎继续')
    expect(html).toContain('下一步：')
    expect(html).toContain('原因：')
    expect(html).toContain('继续学习')
    expect(html).not.toContain('Next best step')
    // Data stays as written.
    expect(html).toContain('Math Foundations')
    expect(html).toContain('The derivative check passed.')
  })

  it('switches the handoff line, including attempts and retry, to Chinese', () => {
    act(() => setLang('zh'))
    const html = renderToStaticMarkup(
      createElement(HandoffLine, { handoff: HANDOFF, onRetry: () => {} }),
    )
    expect(html).toContain('未能联系到导师')
    expect(html).toContain('1分 5秒')
    expect(html).toContain('第 2 次尝试')
    expect(html).toContain('再问一次')
    // The dynamic detailed reason is model/agent text, not chrome.
    expect(html).toContain('The conversation is busy.')
  })

  it('switches the welcome feature row to Chinese', () => {
    act(() => setLang('zh'))
    const html = renderToStaticMarkup(createElement(FeatureRow))
    expect(html).toContain('诊断地图')
    expect(html).toContain('一次只展开一个节点')
    expect(html).toContain('支撑每一个状态')
  })

  it('localizes the status lines the shared store produces', () => {
    const zh = runtimeCopy('zh')
    expect(zh.started).toContain('已开始')
    expect(zh.focusRecorded('忙碌')).toContain('已记录学习焦点')
    expect(zh.saved('data.json')).toBe('已保存 data.json。')
    expect(zh.everythingDeleted).toBe('已删除全部数据。')
    // English output is unchanged for the same calls.
    const en = runtimeCopy('en')
    expect(en.saved('data.json')).toBe('Saved data.json.')
    expect(en.everythingDeleted).toBe('Everything was deleted.')
  })

  it('names the docked tab in the current language', () => {
    expect(tabTitleFor('en')).toBe('Current lesson')
    expect(tabTitleFor('zh')).toBe('当前课次')
  })

  it('translates the sidebar Learn action and its missing-session explanation', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)

    act(() => setLang('zh'))
    await act(async () => {
      root.render(createElement(LearnAction, { wide: true, uiSession: undefined, onOpen: () => {} }))
    })
    expect(container.textContent).toContain('学习')

    const button = container.querySelector('button')
    await act(async () => button?.click())
    expect(container.textContent).toContain('请先打开或新建一个对话，再开始学习。')
    // Still no navigation without a conversation.
    expect(getLang()).toBe('zh')

    act(() => root.unmount())
    container.remove()
  })
})

/** Mount one surface, click its own toggle, and prove both directions. */
async function expectSurfaceSwitches(component: Parameters<typeof createElement>[0], props: Record<string, unknown>, english: string): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  await act(async () => {
    root.render(createElement(component, props))
  })
  await act(async () => { await Promise.resolve() })

  expect(container.textContent).toContain(english)
  const toggle = container.querySelector<HTMLButtonElement>('.dt-lang-toggle')
  expect(toggle, 'surface must offer the language toggle').not.toBeNull()
  expect(toggle?.textContent).toBe('中文')

  await act(async () => toggle?.click())
  expect(getLang()).toBe('zh')
  expect(container.textContent).toMatch(/[\u4e00-\u9fff]/)

  const back = container.querySelector<HTMLButtonElement>('.dt-lang-toggle')
  await act(async () => back?.click())
  expect(getLang()).toBe('en')
  expect(container.textContent).toContain(english)

  act(() => root.unmount())
  container.remove()
}

describe('the two lesson surfaces switch in place', () => {
  it('switches the docked Current-lesson tab', async () => {
    await expectSurfaceSwitches(
      LearningTab,
      { client: PANEL_CLIENT, initialOverview: EMPTY_OVERVIEW },
      'No lesson yet',
    )
  })

  it('switches the standalone full-page panel', async () => {
    await expectSurfaceSwitches(
      LearningPanel,
      { client: PANEL_CLIENT, initialOverview: EMPTY_OVERVIEW },
      'What do you want to learn?',
    )
  })
})
