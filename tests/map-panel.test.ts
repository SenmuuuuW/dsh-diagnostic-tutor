// @vitest-environment jsdom
/**
 * The diagnosis map's own page.
 *
 * The map used to live inside the teaching column, where it read as a footnote
 * under the lesson. These tests pin the separate page: a tree of its own, the
 * selected node's evidence beside it, and a way back to the teaching view and
 * the conversation. Nothing here decides anything — the page only reads the
 * same learning state every other surface reads.
 */

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// React needs to be told this is a test environment, or `act` warns on every
// update and state flushes are not batched.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import type { NodeDetailResponse, NodeView, OverviewResponse } from '../src/contract.js'
import { resetLanguageForTests } from '../src/client/i18n.js'
import { LearningMapPanel } from '../src/client/map-panel.js'
import type { PanelClient } from '../src/client/use-learning.js'

const NOW = '2026-01-01T00:00:00.000Z'

const nodes: NodeView[] = [
  { id: 'ml:goal', title: 'Machine Learning', relation: 'goal', state: 'explained', parentId: null, evidenceCount: 1, updatedAt: NOW },
  { id: 'ml:math', title: 'Math Foundations', relation: 'prerequisite', state: 'blocked', parentId: 'ml:goal', evidenceCount: 1, updatedAt: NOW },
  { id: 'ml:math:la', title: 'Linear Algebra', relation: 'part-of', state: 'checked', parentId: 'ml:math', evidenceCount: 2, updatedAt: NOW },
  { id: 'ml:python', title: 'Python', relation: 'prerequisite', state: 'confirmed', parentId: 'ml:goal', evidenceCount: 3, updatedAt: NOW },
]

const overview: OverviewResponse = {
  ok: true,
  selection: 'project',
  course: {
    id: 'ml',
    title: 'Machine Learning',
    goal: 'Learn ML from weak math foundations',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  },
  nodes,
  focus: null,
  nextStep: null,
  handoff: null,
  teachingBrain: true,
  lessonCount: 0,
  library: [],
}

function detail(nodeId: string): NodeDetailResponse {
  const node = nodes.find((entry) => entry.id === nodeId) ?? nodes[0]!
  const parent = nodes.find((entry) => entry.id === node.parentId) ?? null
  const children = nodes.filter((entry) => entry.parentId === node.id)
  return {
    ok: true,
    node: {
      ...node,
      evidence: [
        { kind: 'diagnosis', at: NOW, note: 'Recorded against this node.', readiness: 'diagnose-again' },
      ],
    },
    parent,
    children,
    lessonExists: false,
  }
}

const client: PanelClient = {
  fetchOverview: () => Promise.resolve(overview),
  fetchNode: (nodeId) => Promise.resolve(detail(nodeId)),
  fetchLesson: () => Promise.resolve({ ok: true, lesson: null }),
  startFocus: () => Promise.reject(new Error('the map page never starts a focus')),
}

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

async function mount(props: Partial<Parameters<typeof LearningMapPanel>[0]> = {}): Promise<void> {
  await act(async () => {
    root.render(createElement(LearningMapPanel, { client, initialOverview: overview, sessionId: 's1', ...props }))
  })
}

describe('the map page', () => {
  it('renders the map as its own page, with a census and every node', async () => {
    await mount()
    expect(container.querySelector('.dt-path-page')).not.toBeNull()
    await act(async () => { [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Knowledge & evidence')?.click() })
    expect(container.querySelector('.dt-map-root')).not.toBeNull()
    expect(container.querySelectorAll('.dt-map-row')).toHaveLength(nodes.length)
    // The census is state counts, not a score.
    expect(container.querySelector('.dt-statebar')).not.toBeNull()
    expect(container.textContent).toContain('Machine Learning')
    expect(container.textContent).toContain('4 nodes')
  })

  it('shows the selected node evidence beside the tree', async () => {
    await mount()
    await act(async () => { [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Knowledge & evidence')?.click() })
    expect(container.querySelector('.dt-map-detail')?.textContent).toContain('Machine Learning')

    const rows = [...container.querySelectorAll<HTMLButtonElement>('.dt-map-row')]
    const linear = rows.find((row) => row.textContent?.includes('Linear Algebra'))
    await act(async () => {
      linear?.click()
    })
    expect(container.querySelector('.dt-map-detail')?.textContent).toContain('Linear Algebra')
    expect(container.querySelector('.dt-map-detail')?.textContent).toContain('Recorded against this node.')
  })

  it('offers the way back to the current lesson and the conversation', async () => {
    const opened: string[] = []
    await mount({
      onOpenLesson: () => opened.push('lesson'),
      onOpenChat: () => opened.push('chat'),
    })
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')]
    const lesson = buttons.find((button) => button.textContent?.trim() === 'Open current lesson')
    const chat = buttons.find((button) => button.textContent?.trim() === 'Back to the conversation')
    expect(lesson).toBeDefined()
    expect(chat).toBeDefined()
    await act(async () => {
      lesson?.click()
      chat?.click()
    })
    expect(opened).toEqual(['lesson', 'chat'])
  })

  it('says there is nothing to map when no project is open', async () => {
    await mount({
      initialOverview: { ...overview, selection: 'none', course: null, nodes: [], focus: null },
    })
    expect(container.textContent).toContain('Nothing to map yet.')
    expect(container.querySelector('.dt-map-root')).toBeNull()
  })

  it('switches its own copy between English and Chinese without a reload', async () => {
    await mount()
    // The route tab tries the real client, which has no host in this test; the
    // language check lives on the knowledge view so it asserts copy, not a
    // network failure.
    await act(async () => { [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Knowledge & evidence')?.click() })
    const pane = () => container.querySelector('.dt-map-pane')?.textContent ?? ''
    expect(pane()).toContain('Diagnosis map')
    expect(pane()).not.toMatch(/[\u4e00-\u9fff]/)

    const toggle = container.querySelector<HTMLButtonElement>('.dt-lang-toggle')
    expect(toggle?.textContent).toBe('中文')
    await act(async () => toggle?.click())
    expect(pane()).toContain('诊断地图')
    expect(container.querySelector('.dt-lang-toggle')?.textContent).toBe('EN')

    const back = container.querySelector<HTMLButtonElement>('.dt-lang-toggle')
    // No host is attached in a unit test, so the preference stays local.
    await act(async () => back?.click())
    expect(pane()).toContain('Diagnosis map')
    expect(pane()).not.toMatch(/[\u4e00-\u9fff]/)
  })
})
