// @vitest-environment jsdom
/** The learner-facing three-step course creation flow. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PathView } from '../src/path.js'
import { CourseSetup } from '../src/client/course-setup.jsx'
import type { PathClient } from '../src/client/path-client.js'
import { resetLanguageForTests } from '../src/client/i18n.js'

const NOW = '2026-01-01T00:00:00.000Z'
const brief = {
  purpose: 'Learn ML', outcomes: ['Build a model'], background: '', timeZone: 'UTC', targetDate: null,
  durationWeeks: null, deadline: 'none' as const, weeklyMinutes: null, sessionMinutes: null, preferences: '',
}
function view(patch: { brief?: typeof brief | null; assessment?: unknown; curricula?: unknown[]; acceptedVersion?: number | null } = {}): PathView {
  return {
    ok: true, now: NOW,
    path: {
      courseId: 'ml', revision: 1, briefRevision: 1, assessmentRevision: 1,
      brief: patch.brief === undefined ? null : patch.brief,
      assessment: patch.assessment ?? null,
      acceptedVersion: patch.acceptedVersion ?? null, requests: [],
      curricula: patch.curricula ?? [], updatedAt: NOW,
    }, run: null,
  } as unknown as PathView
}
const proposal = {
  version: 1, briefRevision: 1, assessmentRevision: 1, createdAt: NOW, acceptedAt: null,
  title: 'ML route', summary: 'A route.',
  modules: [{ id: 'm1', title: 'Foundations', overview: '', outcomes: [], milestone: '' }],
  items: [{ id: 'i1', moduleId: 'm1', title: 'Vectors', overview: '', outcomes: [], outline: [], topics: [], nodeIds: [], practice: '', assessment: '', minutes: { min: 10, max: 20 } }],
  edges: [], assumptions: [], changeReason: '',
}
const assessment = { status: 'ready', summary: 's', strengths: [], gaps: [], uncertainties: [], evidence: [], briefRevision: 1, sessionId: 's1', updatedAt: NOW }
let container: HTMLDivElement
let root: Root
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove(); resetLanguageForTests() })

async function mount(path: PathView, client: PathClient) {
  await act(async () => {
    root.render(createElement(CourseSetup, { path, courseId: 'ml', title: 'Machine Learning', sessionId: 's1', client }))
    await Promise.resolve()
  })
}
function button(label: string): HTMLButtonElement {
  const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent?.trim() === label)
  expect(target, label).toBeDefined()
  return target!
}
function setValue(id: string, value: string) {
  const element = container.querySelector<HTMLTextAreaElement>(`#${id}`)!
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('course setup', () => {
  it('starts with one goal step and saves real GoalBrief fields', async () => {
    const saveBrief = vi.fn(async () => view({ brief }))
    await mount(view(), { saveBrief } as unknown as PathClient)
    expect(container.querySelector('.dtx-course-setup-card')?.getAttribute('data-stage')).toBe('goal')
    expect(container.querySelectorAll('.dtx-course-setup-card textarea')).toHaveLength(2)
    await act(async () => { setValue('dtx-purpose', 'Learn ML'); setValue('dtx-outcomes', 'Build a model'); await Promise.resolve() })
    await act(async () => { button('Save goal').click(); await Promise.resolve() })
    expect(saveBrief).toHaveBeenCalledWith(expect.objectContaining({
      courseId: 'ml', sessionId: 's1', brief: expect.objectContaining({ purpose: 'Learn ML', outcomes: ['Build a model'] }),
    }))
  })

  it('adds pasted material through the existing source store', async () => {
    const addSource = vi.fn(async () => ({ ok: true, deduped: false, source: { id: 's1', kind: 'text', title: 'Pasted material', locator: 'Pasted material', sha256: 'a'.repeat(64), bytes: 12, createdAt: NOW, status: 'ready' } }))
    const listSources = vi.fn(async () => ({ ok: true, count: 0, bytes: 0, sources: [] }))
    await mount(view(), { saveBrief: vi.fn(), addSource, listSources } as unknown as PathClient)
    const material = container.querySelector<HTMLTextAreaElement>('#dtx-material')!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(material, 'A source paragraph.')
    material.dispatchEvent(new Event('input', { bubbles: true }))
    await act(async () => { button('Add material').click(); await Promise.resolve() })
    expect(addSource).toHaveBeenCalledWith(expect.objectContaining({ text: 'A source paragraph.', kind: 'text' }))
    expect(container.textContent).toContain('Pasted material')
  })

  it('asks for diagnosis and exposes the conversation, not internal assessment fields', async () => {
    const request = vi.fn(async () => ({ ok: true, prompted: true }))
    await mount(view({ brief }), { request } as unknown as PathClient)
    expect(container.querySelector('.dtx-course-setup-card')?.getAttribute('data-stage')).toBe('diagnosis')
    expect(container.textContent).not.toContain('assessmentRevision')
    await act(async () => { button('Start diagnosis').click(); await Promise.resolve() })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ kind: 'diagnosis', courseId: 'ml' }))
  })

  it('shows the course preview and accepts the proposed version', async () => {
    const accept = vi.fn(async () => ({ ok: true }))
    await mount(view({ brief, assessment, curricula: [proposal] }), { accept } as unknown as PathClient)
    expect(container.querySelector('.dtx-course-setup-card')?.getAttribute('data-stage')).toBe('preview')
    expect(container.textContent).toContain('Foundations')
    await act(async () => { button('Accept course').click(); await Promise.resolve() })
    expect(accept).toHaveBeenCalledWith(expect.objectContaining({ version: 1, courseId: 'ml' }))
  })
})
