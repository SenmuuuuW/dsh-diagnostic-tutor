// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InsightsView } from '../src/contract.js'
import { InsightsPage } from '../src/client/insights-panel.jsx'
import type { PathClient } from '../src/client/path-client.js'

const view: InsightsView = {
  ok: true, courseId: 'ml', courseTitle: 'Machine Learning', generatedAt: '2026-01-10T12:00:00.000Z',
  review: { due: 2, overdue: 1, total: 5, lapsed: [{ id: 'c1', front: 'Shapes?', lapses: 3, dueAt: '2026-01-10T12:00:00.000Z' }] },
  recentReviews: [{ at: '2026-01-09T12:00:00.000Z', rating: 'again', front: 'Shapes?' }],
  evidence: { total: 4, last7Days: 2, byKind: [{ kind: 'practice', count: 4 }] },
  weakNodes: [{ id: 'n1', title: 'Weak math', state: 'weak', evidenceCount: 2, updatedAt: '2026-01-09T12:00:00.000Z' }],
  recentAttempts: [{ attemptId: 'a1', status: 'working', updatedAt: '2026-01-10T10:00:00.000Z', units: 1, responses: 2 }],
  tasks: { open: 1, dueToday: 1 },
  sources: { count: 2, bytes: 1000 },
}

let root: Root | null = null
let container: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); container.remove(); root = null })

async function mount(client: PathClient, onOpenReview = () => {}) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(createElement(InsightsPage, { client, courseId: 'ml', onOpenReview }))
    await Promise.resolve(); await Promise.resolve()
  })
}

describe('insights page', () => {
  it('renders stored facts and no score or percentage', async () => {
    const client = { insights: vi.fn(async () => view) } as unknown as PathClient
    await mount(client)
    expect(container.textContent).toContain('Learning insights')
    expect(container.textContent).toContain('Weak math')
    expect(container.textContent).toContain('Shapes?')
    expect(container.textContent).toContain('1 open plan')
    expect(container.textContent).not.toMatch(/\d+\s*%/)
    expect(container.querySelectorAll('[class*="score"], [data-mastery]')).toHaveLength(0)
  })

  it('opens Review from the review card', async () => {
    const onOpenReview = vi.fn()
    const client = { insights: vi.fn(async () => view) } as unknown as PathClient
    await mount(client, onOpenReview)
    const button = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'Open Review')
    expect(button).toBeDefined()
    await act(async () => { button!.click() })
    expect(onOpenReview).toHaveBeenCalled()
  })
})
