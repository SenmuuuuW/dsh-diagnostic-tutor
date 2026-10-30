// @vitest-environment jsdom
/** Course: accepted route browsing, one next action, and lesson start. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PathView } from '../src/path.js'
import { CoursePage } from '../src/client/course-page.js'
import type { PathClient } from '../src/client/path-client.js'
import { resetLanguageForTests } from '../src/client/i18n.js'

const NOW = '2026-01-01T00:00:00.000Z'
const path = {
  ok: true, now: NOW,
  path: {
    courseId: 'ml', revision: 1, briefRevision: 1, assessmentRevision: 1,
    brief: { purpose: 'Learn ML', outcomes: ['Build a model'], background: '', timeZone: 'UTC', targetDate: null, durationWeeks: 4, deadline: 'flexible', weeklyMinutes: 120, sessionMinutes: 45, preferences: '' },
    assessment: null, acceptedVersion: 1, requests: [],
    curricula: [{ version: 1, briefRevision: 1, assessmentRevision: 1, createdAt: NOW, acceptedAt: NOW, title: 'ML route', summary: '',
      modules: [{ id: 'm1', title: 'Foundations', overview: 'Start here.', outcomes: [], milestone: '' }],
      items: [{ id: 'i1', moduleId: 'm1', title: 'Vectors', overview: 'Shapes', outcomes: [], outline: ['Read shapes'], topics: ['shape'], nodeIds: [], practice: '', assessment: '', minutes: { min: 10, max: 20 } }],
      edges: [], assumptions: [], changeReason: '' }],
    updatedAt: NOW,
  }, run: null,
} as unknown as PathView
let container: HTMLDivElement
let root: Root
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove(); resetLanguageForTests() })

describe('course', () => {
  it('shows the accepted route and starts a lesson from the single lesson list', async () => {
    const start = vi.fn(async () => ({ ok: true, prompted: true }))
    const client = { start } as unknown as PathClient
    const onStarted = vi.fn()
    await act(async () => {
      root.render(createElement(CoursePage, { path, courseId: 'ml', title: 'Machine Learning', nodes: [], sessionId: 's1', client, onStarted }))
      await Promise.resolve()
    })
    expect(container.querySelector('.dtx-course')).not.toBeNull()
    expect(container.textContent).toContain('ML route')
    expect(container.textContent).toContain('Foundations')
    expect(container.textContent).toContain('Vectors')
    expect(container.querySelectorAll('.dtx-course .dtx-lesson')).toHaveLength(1)
    await act(async () => { container.querySelector<HTMLButtonElement>('.dtx-course .dtx-lesson')!.click(); await Promise.resolve() })
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ courseId: 'ml', itemId: 'i1', version: 1 }))
    expect(onStarted).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toMatch(/\d+\s*%|mastery/i)
  })

  it('has one primary action and reports the current lesson when an attempt exists', async () => {
    const active = { ...path, run: { courseId: 'ml', sessionId: 's1', revision: 1, activeAttemptId: 'a1', updatedAt: NOW, attempts: [{ id: 'a1', operationId: 'op', operations: ['op'], dispatchId: null, version: 1, itemId: 'i1', status: 'working', nodeId: 'ml:vectors', startedAt: NOW, updatedAt: NOW, prompted: true, promptReason: null, outcome: null, evidence: [], units: [] }] } } as unknown as PathView
    const onOpenLesson = vi.fn()
    await act(async () => {
      root.render(createElement(CoursePage, { path: active, courseId: 'ml', title: 'Machine Learning', nodes: [], sessionId: 's1', client: { start: vi.fn() } as unknown as PathClient, onOpenLesson }))
      await Promise.resolve()
    })
    expect(container.querySelectorAll('.dtx-course-actions .dtx-primary')).toHaveLength(1)
    expect(container.textContent).toContain('Current lesson')
    await act(async () => { container.querySelector<HTMLButtonElement>('.dtx-course-actions .dtx-primary')!.click(); await Promise.resolve() })
    expect(onOpenLesson).toHaveBeenCalledTimes(1)
  })
})
