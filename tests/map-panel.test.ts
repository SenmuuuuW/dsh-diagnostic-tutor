// @vitest-environment jsdom
/** The redesigned Learning map shell: library, route shell and knowledge master-detail. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeDetailResponse, NodeView, OverviewResponse, ProjectCardView } from '../src/contract.js'
import { resetLanguageForTests, setLang } from '../src/client/i18n.js'
import { LearningMapPanel } from '../src/client/map-panel.js'
import type { PanelClient } from '../src/client/use-learning.js'

const NOW = '2026-01-01T00:00:00.000Z'
const nodes: NodeView[] = [
  { id: 'ml:goal', title: 'Machine Learning', relation: 'goal', state: 'explained', parentId: null, evidenceCount: 1, updatedAt: NOW },
  { id: 'ml:math', title: 'Math Foundations', relation: 'prerequisite', state: 'blocked', parentId: 'ml:goal', evidenceCount: 1, updatedAt: NOW },
  { id: 'ml:math:la', title: 'Linear Algebra', relation: 'part-of', state: 'checked', parentId: 'ml:math', evidenceCount: 2, updatedAt: NOW },
  { id: 'ml:python', title: 'Python', relation: 'prerequisite', state: 'confirmed', parentId: 'ml:goal', evidenceCount: 3, updatedAt: NOW },
]
const library: ProjectCardView[] = [
  { id: 'ml', title: 'Machine Learning', goal: 'Learn ML', confirmed: 1, total: 4, updatedAt: '2026-10-25T00:00:00.000Z', status: 'accepted', acceptedVersion: 1 },
  { id: 'astro', title: '天文学', goal: 'Learn astronomy', confirmed: 0, total: 1, updatedAt: '2026-10-20T00:00:00.000Z', status: 'legacy', acceptedVersion: null },
]
function overview(overrides: Partial<OverviewResponse> = {}): OverviewResponse {
  return {
    ok: true, selection: 'project',
    course: { id: 'ml', title: 'Machine Learning', goal: 'Learn ML from weak math foundations', status: 'active', createdAt: NOW, updatedAt: NOW },
    nodes, focus: null, nextStep: null, handoff: null, teachingBrain: true, lessonCount: 0, library,
    ...overrides,
  }
}
function detail(nodeId: string): NodeDetailResponse {
  const node = nodes.find((entry) => entry.id === nodeId) ?? nodes[0]!
  const parent = nodes.find((entry) => entry.id === node.parentId) ?? null
  return {
    ok: true,
    node: { ...node, evidence: [{ kind: 'diagnosis', at: NOW, note: 'Recorded against this node.', readiness: 'diagnose-again' }] },
    parent,
    children: nodes.filter((entry) => entry.parentId === node.id),
    lessonExists: false,
  }
}
function makeClient(initial: OverviewResponse): PanelClient {
  return {
    fetchOverview: () => Promise.resolve(initial),
    fetchNode: (nodeId) => Promise.resolve(detail(nodeId)),
    fetchLesson: () => Promise.resolve({ ok: true, lesson: null }),
    startFocus: () => Promise.reject(new Error('the map page never starts a focus')),
    selectProject: vi.fn(async () => ({ ok: true })),
  }
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
async function mount(client: PanelClient, initial: OverviewResponse, props: Partial<Parameters<typeof LearningMapPanel>[0]> = {}) {
  await act(async () => {
    root.render(createElement(LearningMapPanel, { client, initialOverview: initial, sessionId: 's1', ...props }))
    await Promise.resolve()
  })
}
async function clickButton(text: string) {
  const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent?.trim() === text)
  expect(target, text).toBeDefined()
  await act(async () => target!.click())
}

describe('library', () => {
  const noCourse = overview({ selection: 'none', course: null, nodes: [], library })
  it('lists projects with status and last-studied metadata', async () => {
    await mount(makeClient(noCourse), noCourse, { onOpenChat: () => {} })
    expect(container.textContent).toContain('Welcome back')
    expect(container.textContent).toContain('My learning projects')
    expect(container.textContent).toContain('Machine Learning')
    expect(container.textContent).toContain('Route accepted')
    expect(container.textContent).toContain('Legacy project')
    expect(container.textContent).toContain('Last studied:')
  })
  it('opens a project from the row', async () => {
    const client = makeClient(noCourse)
    await mount(client, noCourse)
    const row = [...container.querySelectorAll<HTMLButtonElement>('.dtx-project-row')].find((entry) => entry.textContent?.includes('Machine Learning'))
    await act(async () => row!.click())
    expect(client.selectProject).toHaveBeenCalledWith('s1', 'ml')
  })
  it('offers the conversation when there are no projects', async () => {
    const empty = overview({ selection: 'none', course: null, nodes: [], library: [] })
    const onOpenChat = vi.fn()
    await mount(makeClient(empty), empty, { onOpenChat })
    expect(container.textContent).toContain('Start your learning')
    await clickButton('Back to chat')
    expect(onOpenChat).toHaveBeenCalled()
  })
})

describe('project header', () => {
  it('names the project, keeps the tabs and goes back to the conversation', async () => {
    const onOpenChat = vi.fn()
    await mount(makeClient(overview()), overview(), { onOpenChat })
    expect(container.textContent).toContain('Learning map')
    expect(container.textContent).toContain('Machine Learning')
    expect(container.querySelectorAll('.dtx-tabbtn')).toHaveLength(4)
    await clickButton('Back to chat')
    expect(onOpenChat).toHaveBeenCalled()
  })
})

describe('knowledge & evidence', () => {
  async function openKnowledge() {
    await mount(makeClient(overview()), overview())
    await clickButton('Knowledge & evidence')
  }
  it('lists nodes on the left and the selected node evidence on the right', async () => {
    await openKnowledge()
    expect(container.textContent).toContain('Knowledge (4)')
    expect(container.querySelectorAll('.dtx-node-row')).toHaveLength(4)
    const row = [...container.querySelectorAll<HTMLButtonElement>('.dtx-node-row')].find((entry) => entry.textContent?.includes('Linear Algebra'))
    await act(async () => row!.click())
    expect(container.querySelector('.dtx-knowledge-detail')?.textContent).toContain('Linear Algebra')
    expect(container.querySelector('.dtx-knowledge-detail')?.textContent).toContain('Recorded against this node.')
    expect(container.querySelector('.dtx-knowledge-detail')?.textContent).toContain('Evidence (1)')
    expect(container.querySelector('.dtx-knowledge-detail')?.textContent).toContain('Mastery needs evidence')
  })
  it('filters nodes by search', async () => {
    await openKnowledge()
    const input = container.querySelector<HTMLInputElement>('.dtx-search input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'python')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.querySelectorAll('.dtx-node-row')).toHaveLength(1)
    expect(container.textContent).toContain('Python')
  })
  it('switches copy between English and Chinese', async () => {
    await openKnowledge()
    expect(container.textContent).toContain('Knowledge (4)')
    await act(async () => setLang('zh'))
    expect(container.textContent).toContain('知识节点 (4)')
    expect(container.querySelector('.dtx-search input')?.getAttribute('placeholder')).toBe('搜索知识点')
    await act(async () => setLang('en'))
    expect(container.textContent).toContain('Knowledge (4)')
  })
})
