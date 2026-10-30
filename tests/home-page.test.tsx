// @vitest-environment jsdom
/** Home: one next action, due review, deadline and the learner's courses. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OverviewResponse } from '../src/contract.js'
import type { PathView } from '../src/path.js'
import { resetLanguageForTests, setLang } from '../src/client/i18n.js'
import { HomePage } from '../src/client/home.jsx'
import type { PathClient } from '../src/client/path-client.js'

const NOW = '2026-01-01T00:00:00.000Z'
const overview = {
  ok: true, selection: 'project',
  course: { id: 'ml', title: 'Machine Learning' },
  nodes: [], focus: null, nextStep: null, handoff: null,
  library: [
    { id: 'ml', title: 'Machine Learning', status: 'accepted', confirmed: 1, total: 2, updatedAt: NOW },
    { id: 'astro', title: 'Astronomy', status: 'active', confirmed: 0, total: 1, updatedAt: NOW },
  ],
  tasks: [{ id: 't1', title: 'Read shapes', status: 'open', createdAt: NOW, dueAt: '2026-01-02T12:00:00.000Z' }],
  teachingBrain: null, lessonCount: 1,
} as unknown as OverviewResponse

const path = {
  ok: true, now: NOW,
  path: {
    courseId: 'ml', revision: 4, briefRevision: 1, assessmentRevision: 1,
    brief: { purpose: 'Learn ML', outcomes: ['Build a model'], background: '', timeZone: 'UTC', targetDate: '2026-01-25', durationWeeks: 4, deadline: 'fixed', weeklyMinutes: 120, sessionMinutes: 45, preferences: '' },
    assessment: null, acceptedVersion: 1, requests: [],
    curricula: [{
      version: 1, briefRevision: 1, assessmentRevision: 1, createdAt: NOW, acceptedAt: NOW,
      title: 'ML route', summary: 'A route.', modules: [{ id: 'm1', title: 'Foundations', overview: '', outcomes: [], milestone: '' }],
      items: [
        { id: 'i1', moduleId: 'm1', title: 'Vectors and matrices', overview: '', outcomes: [], outline: [], topics: [], nodeIds: [], practice: '', assessment: '', minutes: { min: 10, max: 20 } },
        { id: 'i2', moduleId: 'm1', title: 'Products', overview: '', outcomes: [], outline: [], topics: [], nodeIds: [], practice: '', assessment: '', minutes: { min: 10, max: 20 } },
      ], edges: [], assumptions: [], changeReason: '',
    }],
    updatedAt: NOW,
  },
  run: {
    courseId: 'ml', sessionId: 's1', revision: 1, activeAttemptId: 'a1', updatedAt: NOW,
    attempts: [{ id: 'a1', operationId: 'op', operations: ['op'], dispatchId: null, version: 1, itemId: 'i1', status: 'working', nodeId: 'ml:vectors', startedAt: NOW, updatedAt: NOW, prompted: true, promptReason: null, outcome: null, evidence: [], units: [] }],
  },
} as unknown as PathView

const reviewClient = { reviewNext: vi.fn(async () => ({ ok: true, cards: [], count: 3 })) } as unknown as PathClient
let container: HTMLDivElement
let root: Root
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove(); resetLanguageForTests() })

async function mount() {
  const onOpenLesson = vi.fn(); const onOpenRoute = vi.fn(); const onOpenReview = vi.fn(); const onOpenProject = vi.fn()
  await act(async () => {
    root.render(createElement(HomePage, { overview, path, reviewClient, onOpenLesson, onOpenRoute, onOpenReview, onOpenProject }))
    await Promise.resolve()
  })
  return { onOpenLesson, onOpenRoute, onOpenReview, onOpenProject }
}

describe('home', () => {
  it('answers what to do today with one primary action', async () => {
    const handlers = await mount()
    expect(container.textContent).toContain('One step today')
    expect(container.textContent).toContain('Vectors and matrices')
    expect(container.textContent).toContain('Foundations')
    expect(container.querySelectorAll('.dtx-home-copy .dtx-primary')).toHaveLength(1)
    await act(async () => { container.querySelector<HTMLButtonElement>('.dtx-home-copy .dtx-primary')!.click(); await Promise.resolve() })
    expect(handlers.onOpenLesson).toHaveBeenCalledTimes(1)
  })

  it('shows due review, deadline, today tasks and learner courses without fake progress', async () => {
    const handlers = await mount()
    expect(container.textContent).toContain('3')
    expect(container.textContent).toContain('cards due')
    expect(container.textContent).toMatch(/\d+ days|No deadline/)
    expect(container.textContent).toContain('Read shapes')
    expect(container.textContent).toContain('Astronomy')
    expect(container.textContent).not.toMatch(/\d+\s*%|mastery|score/i)
    await act(async () => { container.querySelector<HTMLButtonElement>('.dtx-home-review')!.click(); await Promise.resolve() })
    expect(handlers.onOpenReview).toHaveBeenCalledTimes(1)
  })

  it('speaks Chinese and states when there is no deadline', async () => {
    setLang('zh')
    await mount()
    expect(container.textContent).toContain('今天走一步')
    expect(container.textContent).toContain('继续学习')
    expect(container.textContent).toContain('张卡到期')
  })
})
