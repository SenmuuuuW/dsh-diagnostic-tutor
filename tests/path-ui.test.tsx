// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeView } from '../src/contract.js'
import type { CourseAttempt, Curriculum, GoalBrief, PathView } from '../src/path.js'
import { defaultPathClient, PathClientError } from '../src/client/path-client.js'
import type { PathClient } from '../src/client/path-client.js'
import { PathPage } from '../src/client/path-page.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const NOW = '2026-10-01T12:00:00.000Z'
const brief: GoalBrief = {
  purpose: 'Build a small classifier for a work project', outcomes: ['Implement a classifier and explain its errors'],
  background: 'I have written Python scripts. This is a self-report.', timeZone: 'America/New_York',
  targetDate: null, durationWeeks: 4, deadline: 'flexible', weeklyMinutes: 120, sessionMinutes: 30,
  preferences: 'Python examples and short checks',
}
const nodes: NodeView[] = [{ id: 'vectors', title: 'Vectors', relation: 'prerequisite', state: 'checked', parentId: null, evidenceCount: 2, updatedAt: NOW }]
function curriculum(version = 1, accepted = true): Curriculum {
  return {
    version, briefRevision: 1, assessmentRevision: 1, createdAt: NOW, acceptedAt: accepted ? NOW : null,
    title: `Classifier route ${version}`, summary: 'A complete outline with lessons written when started.',
    modules: [
      { id: 'foundations', title: 'Foundations', overview: 'Prepare the inputs.', outcomes: ['Represent an example as a vector'], milestone: 'Explain an input representation' },
      { id: 'implementation', title: 'Implementation', overview: 'Build and evaluate a model.', outcomes: ['Build a working classifier'], milestone: 'Evaluate error cases' },
    ],
    items: [
      { id: 'represent', moduleId: 'foundations', title: 'Represent the data', overview: 'Turn examples into model inputs.', outcomes: ['Choose a useful representation'], outline: ['Inspect examples', 'Create vectors'], topics: ['vectors'], nodeIds: ['vectors'], practice: 'Represent three examples.', assessment: 'Explain why one representation fits.', minutes: { min: 30, max: 50 } },
      { id: 'train', moduleId: 'implementation', title: 'Train the classifier', overview: 'Use the representation to fit a classifier.', outcomes: ['Implement one training loop'], outline: ['Define a model', 'Fit parameters'], topics: ['training'], nodeIds: [], practice: 'Fit a classifier on a toy dataset.', assessment: 'Explain a failed prediction.', minutes: { min: 40, max: 70 } },
      { id: 'evaluate', moduleId: 'implementation', title: 'Evaluate new examples', overview: 'Inspect transfer to unseen examples.', outcomes: ['Analyze two new errors'], outline: ['Hold out examples', 'Compare mistakes'], topics: ['generalization'], nodeIds: [], practice: 'Inspect new examples.', assessment: 'Predict a failure before running it.', minutes: { min: 30, max: 50 } },
    ],
    edges: [{ from: 'represent', to: 'train', kind: 'required' }, { from: 'represent', to: 'evaluate', kind: 'optional' }],
    assumptions: ['Python background is self-reported and needs checking.'], changeReason: 'Fit the project goal and available time.',
  }
}
function pathView(plans: Curriculum[] = [curriculum()]): PathView {
  return {
    ok: true, now: NOW,
    path: {
      courseId: 'synthetic-course', revision: 4, briefRevision: 1, assessmentRevision: 1, brief,
      assessment: { status: 'ready', summary: 'One representation task was checked.', strengths: ['Can inspect a vector'], gaps: ['Training is unfamiliar'], uncertainties: ['Transfer is unverified'], evidence: [{ nodeId: 'vectors', evidenceIndex: 1 }], briefRevision: 1, sessionId: 'synthetic-session', updatedAt: NOW },
      curricula: plans, acceptedVersion: plans.findLast((plan) => plan.acceptedAt)?.version ?? null, requests: [], updatedAt: NOW,
    },
    run: { courseId: 'synthetic-course', sessionId: 'synthetic-session', revision: 0, activeAttemptId: null, attempts: [], updatedAt: NOW },
  }
}
function attempt(overrides: Partial<CourseAttempt> = {}): CourseAttempt {
  return {
    id: 'attempt-one', operationId: 'operation-one', operations: ['operation-one'], dispatchId: null, version: 1, itemId: 'represent', status: 'working', nodeId: 'vectors',
    startedAt: NOW, updatedAt: NOW, prompted: true, promptReason: null, outcome: null, evidence: [], units: [], ...overrides,
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
let host: PathView
let container: HTMLDivElement
let root: Root
let client: PathClient
beforeEach(() => {
  host = pathView()
  client = {
    get: vi.fn(async () => structuredClone(host)),
    saveBrief: vi.fn(async (params) => {
      host = { ...host, path: { ...host.path, brief: params.brief, revision: host.path.revision + 1, briefRevision: host.path.briefRevision + 1 } }
      return structuredClone(host)
    }),
    request: vi.fn(async (params) => {
      host.path = { ...host.path, revision: host.path.revision + 1, requests: [...host.path.requests, { id: params.operationId, sessionId: params.sessionId, kind: params.kind, briefRevision: host.path.briefRevision, createdAt: NOW, prompted: true, reason: null }] }
      return { ...structuredClone(host), prompted: true }
    }),
    skipAssessment: vi.fn(async () => structuredClone(host)),
    accept: vi.fn(async ({ version }) => {
      host = { ...host, path: { ...host.path, revision: host.path.revision + 1, acceptedVersion: version, curricula: host.path.curricula.map((plan) => plan.version === version ? { ...plan, acceptedAt: NOW } : plan) } }
      return structuredClone(host)
    }),
    start: vi.fn(async () => ({ ...structuredClone(host), prompted: true })),
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function mount(props: Partial<Parameters<typeof PathPage>[0]> = {}) {
  await act(async () => root.render(createElement(PathPage, { courseId: 'synthetic-course', sessionId: 'synthetic-session', title: 'Synthetic classifier project', nodes, client, ...props })))
}
function button(label: string): HTMLButtonElement {
  const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent?.trim() === label || entry.getAttribute('aria-label') === label)
  expect(target, `button ${label}`).toBeDefined()
  return target!
}
async function click(label: string) { await act(async () => button(label).click()) }
async function change(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)
  expect(input, selector).not.toBeNull()
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input!.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
async function poll() { await act(async () => { await vi.advanceTimersByTimeAsync(3000) }) }

describe('curriculum browsing and explicit execution', () => {
  it('browses project, module and every future lesson without starting or accepting', async () => {
    await mount()
    expect(container.querySelector('.dt-path-detail')?.textContent).toContain('Project Overview')
    expect(container.querySelectorAll('.dt-path-node')).toHaveLength(3)
    expect(container.querySelectorAll('.dt-path-ordered li')).toHaveLength(3)
    await click('Browse lesson 3: Evaluate new examples')
    expect(container.querySelector('.dt-path-detail')?.textContent).toContain('Predict a failure before running it.')
    expect(container.querySelector('.dt-path-detail')?.textContent).toContain('before teaching content exists')
    const moduleLink = [...container.querySelectorAll<HTMLButtonElement>('.dt-path-module-label .dt-path-link')].find((entry) => entry.textContent === 'Implementation')!
    await act(async () => moduleLink.click())
    expect(container.querySelector('.dt-path-detail')?.textContent).toContain('Module Overview')
    expect(container.querySelector('.dt-path-detail')?.textContent).toContain('Evaluate error cases')
    expect(client.start).not.toHaveBeenCalled()
    expect(client.accept).not.toHaveBeenCalled()
    expect(client.request).not.toHaveBeenCalled()
  })

  it('accepts a proposal separately from starting and sends only one operation per click', async () => {
    host = pathView([curriculum(1, false)])
    const onStarted = vi.fn()
    await mount({ onStarted })
    await click('Browse lesson 2: Train the classifier')
    expect(button('Start lesson').disabled).toBe(true)
    await click('Accept route version 1')
    expect(client.accept).toHaveBeenCalledWith({ sessionId: 'synthetic-session', courseId: 'synthetic-course', expectedRevision: 4, version: 1 })
    expect(client.start).not.toHaveBeenCalled()
    const pending = deferred<ReturnType<typeof pathView> & { prompted: boolean }>()
    vi.mocked(client.start).mockReturnValueOnce(pending.promise)
    await act(async () => { button('Start lesson').click(); button('Start lesson').click() })
    expect(client.start).toHaveBeenCalledTimes(1)
    expect(button('Start lesson').disabled).toBe(true)
    const params = vi.mocked(client.start).mock.calls[0]![0]
    expect(params).toMatchObject({ sessionId: 'synthetic-session', courseId: 'synthetic-course', expectedRevision: 5, version: 1, itemId: 'train' })
    expect(params.operationId.length).toBeGreaterThan(10)
    expect(onStarted).not.toHaveBeenCalled()
    await act(async () => pending.resolve({ ...host, prompted: true }))
    expect(onStarted).toHaveBeenCalledTimes(1)
  })

  it('keeps a prompt failure visible and retries only on a click with a new operation id', async () => {
    vi.mocked(client.start).mockResolvedValueOnce({ ...host, prompted: false, promptReason: 'Conversation is busy' })
    const onStarted = vi.fn()
    await mount({ onStarted })
    await click('Browse lesson 1: Represent the data')
    await click('Start lesson')
    expect(container.textContent).toContain('Conversation is busy')
    expect(onStarted).not.toHaveBeenCalled()
    expect(client.start).toHaveBeenCalledTimes(1)
    await click('Retry tutor request')
    expect(client.start).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(client.start).mock.calls
    expect(calls[0]![0].operationId).not.toEqual(calls[1]![0].operationId)
    expect(onStarted).toHaveBeenCalledTimes(1)
  })

  it('keeps the conversation pinned to its old version while new versions arrive and exposes snapshots', async () => {
    vi.useFakeTimers()
    host = pathView([curriculum(1, true), curriculum(2, true)])
    const current = attempt()
    const historical = attempt({ id: 'attempt-history', status: 'completed', outcome: 'Explained one representation.', units: [{ id: 'unit-snapshot', writtenAt: NOW, lesson: { id: 'lesson-original', courseId: 'synthetic-course', nodeId: 'vectors', title: 'Original vector lesson', origin: 'tutor', createdAt: NOW, updatedAt: NOW, blocks: [{ id: 'original-text', type: 'text', content: { md: 'Preserved original teaching content.' } }] } }] })
    host.run = { ...host.run!, activeAttemptId: current.id, attempts: [historical, current] }
    await mount()
    expect((container.querySelector('.dt-path-version') as HTMLSelectElement).value).toBe('1')
    expect(container.textContent).toContain('This conversation remains on version 1')
    expect(container.textContent).toContain('Preserved original teaching content.')
    expect(container.textContent).toContain('lesson-original')
    host.path = { ...host.path, revision: 5, acceptedVersion: 3, curricula: [...host.path.curricula, curriculum(3, true)] }
    await poll()
    expect((container.querySelector('.dt-path-version') as HTMLSelectElement).value).toBe('1')
    expect(container.textContent).toContain('accepted route is now version 3')
    await click('Browse accepted version 3')
    expect((container.querySelector('.dt-path-version') as HTMLSelectElement).value).toBe('3')
    expect(client.start).not.toHaveBeenCalled()
  })

  it('has directed edges, unique SVG markers, accessible matching order, collapse and search', async () => {
    await mount()
    const graphOrder = [...container.querySelectorAll('.dt-path-node')].map((entry) => entry.getAttribute('aria-label')?.replace('Overview', 'Browse'))
    const listOrder = [...container.querySelectorAll('.dt-path-row')].map((entry) => entry.getAttribute('aria-label'))
    expect(graphOrder).toEqual(listOrder)
    expect(container.querySelectorAll('.dt-path-edge')).toHaveLength(2)
    expect(container.querySelectorAll('.dt-path-edge[data-optional=true]')).toHaveLength(1)
    const marker = container.querySelector('marker')!.id
    expect(container.querySelector('.dt-path-edge')!.getAttribute('marker-end')).toBe(`url(#${marker})`)
    await click('Collapse module Implementation')
    expect(container.querySelectorAll('.dt-path-node')).toHaveLength(1)
    expect(container.querySelectorAll('.dt-path-row')).toHaveLength(3)
    await change('.dt-path-search', 'unseen')
    expect(container.querySelectorAll('.dt-path-row')).toHaveLength(0)
    await change('.dt-path-search', 'generalization')
    expect(container.querySelectorAll('.dt-path-row')).toHaveLength(1)
    await click('Browse lesson 3: Evaluate new examples')
    expect(container.querySelector('.dt-path-detail')?.textContent).toContain('Evaluate new examples')
    expect(client.start).not.toHaveBeenCalled()
  })
})

describe('independent curriculum canvases', () => {
  it('gives each SVG marker its own id when two pages are mounted', async () => {
    const props = { courseId: 'synthetic-course', sessionId: 'synthetic-session', title: 'Synthetic project', nodes, client }
    await act(async () => root.render(createElement('div', null, createElement(PathPage, props), createElement(PathPage, props))))
    const markers = [...container.querySelectorAll('marker')].map((entry) => entry.id)
    expect(markers).toHaveLength(2)
    expect(new Set(markers).size).toBe(2)
  })
})

describe('goal wizard persistence and request readiness', () => {
  it('saves a genuinely incomplete draft with the required wire fields and no invented deadline', async () => {
    host = pathView([])
    host.path = { ...host.path, brief: null, briefRevision: 0, assessment: null, assessmentRevision: 0 }
    await mount()
    expect(container.querySelector('form[aria-label="Learning goal wizard"]')).not.toBeNull()
    await change('textarea[id$="-purpose"]', 'I am still choosing the project')
    await click('Save draft')
    expect(client.saveBrief).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(client.saveBrief).mock.calls[0]![0]
    expect(saved).toMatchObject({ sessionId: 'synthetic-session', courseId: 'synthetic-course', expectedRevision: 4, brief: { purpose: 'I am still choosing the project', outcomes: [], background: '', targetDate: null, durationWeeks: null, deadline: 'none', weeklyMinutes: null, sessionMinutes: null, preferences: '' } })
    expect(saved.brief.timeZone.length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Incomplete goal draft saved')
    expect(button('Request diagnosis').disabled).toBe(true)
    expect(button('Request a route proposal').disabled).toBe(true)
  })

  it('recovers a server draft and submits outcomes, self-report, timezone and exclusive duration', async () => {
    await mount()
    await click('Goal and time settings')
    expect((container.querySelector('textarea[id$="-purpose"]') as HTMLTextAreaElement).value).toBe(brief.purpose)
    expect(container.textContent).toContain('Saved goal draft recovered')
    await change('textarea[id$="-outcomes"]', 'Explain one prediction\n\nImplement a training loop')
    await click('2. Background')
    await change('textarea[id$="-background"]', 'I report basic Python; it has not been checked.')
    await click('3. Time')
    await change('select[id$="-timeKind"]', 'date')
    await change('input[id$="-targetDate"]', '2027-02-03')
    await change('select[id$="-deadline"]', 'fixed')
    await change('input[id$="-timeZone"]', 'Asia/Seoul')
    await change('input[id$="-weeklyMinutes"]', '240')
    await change('input[id$="-sessionMinutes"]', '40')
    // Switching time choices must clear hidden date data in the saved payload.
    await change('select[id$="-timeKind"]', 'weeks')
    await change('input[id$="-durationWeeks"]', '10')
    await click('4. Preferences')
    await change('textarea[id$="-preferences"]', 'Use Korean explanations and implementation practice.')
    await click('Save and close')
    expect(vi.mocked(client.saveBrief).mock.calls[0]![0].brief).toEqual({ ...brief, outcomes: ['Explain one prediction', 'Implement a training loop'], background: 'I report basic Python; it has not been checked.', timeZone: 'Asia/Seoul', targetDate: null, durationWeeks: 10, deadline: 'fixed', weeklyMinutes: 240, sessionMinutes: 40, preferences: 'Use Korean explanations and implementation practice.' })
    expect(container.querySelector('form')).toBeNull()
  })

  it('polls without overwriting edits and refreshes a stale save while keeping those edits', async () => {
    vi.useFakeTimers()
    await mount()
    await click('Goal and time settings')
    await change('textarea[id$="-purpose"]', 'My unsaved new purpose')
    host.path = { ...host.path, revision: 5, brief: { ...brief, purpose: 'Another conversation changed it' } }
    await poll()
    expect((container.querySelector('textarea[id$="-purpose"]') as HTMLTextAreaElement).value).toBe('My unsaved new purpose')
    vi.mocked(client.saveBrief).mockRejectedValueOnce(new PathClientError('Stale revision', 'stale_revision', 409))
    await click('Save draft')
    expect(container.textContent).toContain('your unsaved goal edits are kept')
    expect((container.querySelector('textarea[id$="-purpose"]') as HTMLTextAreaElement).value).toBe('My unsaved new purpose')
    expect(client.get).toHaveBeenCalledTimes(3)
  })

  it('allows a plan request only after explicit assessment skip and never invents a plan', async () => {
    host = pathView([])
    host.path.assessment = null
    vi.mocked(client.skipAssessment).mockImplementation(async () => {
      host.path = { ...host.path, revision: 5, assessmentRevision: 2, assessment: { status: 'skipped', summary: 'Skipped by learner.', strengths: [], gaps: [], uncertainties: ['Foundations unverified'], evidence: [], briefRevision: 1, sessionId: 'synthetic-session', updatedAt: NOW } }
      return structuredClone(host)
    })
    await mount()
    expect(button('Request a route proposal').disabled).toBe(true)
    expect(client.skipAssessment).not.toHaveBeenCalled()
    await click('Skip initial assessment')
    expect(client.skipAssessment).toHaveBeenCalledWith({ sessionId: 'synthetic-session', courseId: 'synthetic-course', expectedRevision: 4 })
    expect(button('Request a route proposal').disabled).toBe(false)
    await click('Request a route proposal')
    expect(vi.mocked(client.request).mock.calls[0]![0]).toMatchObject({ kind: 'plan', expectedRevision: 5, sessionId: 'synthetic-session', courseId: 'synthetic-course' })
    expect(container.querySelectorAll('.dt-path-node')).toHaveLength(0)
    expect(container.textContent).toContain('Waiting for a tutor proposal')
  })

  it('does not overlap slow polls or discard every delayed response', async () => {
    vi.useFakeTimers()
    const slow = deferred<PathView>()
    vi.mocked(client.get).mockReturnValueOnce(slow.promise)
    await mount()
    await poll()
    await poll()
    expect(client.get).toHaveBeenCalledTimes(1)
    await act(async () => slow.resolve(host))
    expect(container.querySelector('.dt-path-version')).not.toBeNull()
    await poll()
    expect(client.get).toHaveBeenCalledTimes(2)
  })

  it('keeps edits made while a save is in flight', async () => {
    const saving = deferred<PathView>()
    await mount()
    await click('Goal and time settings')
    await change('textarea[id$="-purpose"]', 'First edit sent to save')
    vi.mocked(client.saveBrief).mockReturnValueOnce(saving.promise)
    await click('Save and close')
    await change('textarea[id$="-purpose"]', 'Second edit while saving')
    await act(async () => saving.resolve({ ...host, path: { ...host.path, revision: 5, brief: { ...brief, purpose: 'First edit sent to save' } } }))
    expect((container.querySelector('textarea[id$="-purpose"]') as HTMLTextAreaElement).value).toBe('Second edit while saving')
    expect(container.textContent).toContain('Unsaved changes')
  })

  it('ignores late reads after switching course and session', async () => {
    const late = deferred<PathView>()
    vi.mocked(client.get).mockReturnValueOnce(late.promise)
    await mount()
    const other = pathView([curriculum(2, true)])
    other.path.courseId = 'another-synthetic-course'
    other.run!.courseId = 'another-synthetic-course'
    other.run!.sessionId = 'another-synthetic-session'
    vi.mocked(client.get).mockResolvedValueOnce(other)
    await mount({ courseId: 'another-synthetic-course', sessionId: 'another-synthetic-session', title: 'Another project' })
    await act(async () => late.resolve(pathView()))
    expect(container.textContent).toContain('Another project')
    expect((container.querySelector('.dt-path-version') as HTMLSelectElement).value).toBe('2')
  })

  it('browses without a conversation and explains why mutations are unavailable', async () => {
    host.run = null
    await mount({ sessionId: undefined })
    expect(container.textContent).toContain('Browsing only')
    expect(button('Request a revised plan').disabled).toBe(true)
    await click('Browse lesson 3: Evaluate new examples')
    expect(button('Start lesson').disabled).toBe(true)
    expect(client.start).not.toHaveBeenCalled()
    expect(client.request).not.toHaveBeenCalled()
    expect(client.get).toHaveBeenCalledWith('synthetic-course', undefined)
  })
})

describe('path transport', () => {
  it('uses the agreed REST envelope, encodes query values, and retains stale error status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => host }).mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ ok: false, error: { code: 'stale_revision', message: 'Please refresh.' } }) })
    vi.stubGlobal('fetch', fetchMock)
    await defaultPathClient.get('synthetic course & one', 'session?two')
    const url = new URL(fetchMock.mock.calls[0]![0] as string, 'http://example.invalid')
    expect(url.pathname).toBe('/diagnostic-tutor/api/path')
    expect(url.searchParams.get('courseId')).toBe('synthetic course & one')
    expect(url.searchParams.get('sessionId')).toBe('session?two')
    const params = { sessionId: 'synthetic-session', courseId: 'synthetic-course', expectedRevision: 4, brief }
    await expect(defaultPathClient.saveBrief(params)).rejects.toMatchObject({ code: 'stale_revision', status: 409, message: 'Please refresh.' })
    expect(fetchMock.mock.calls[1]![0]).toBe('/diagnostic-tutor/api/path/brief')
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual(params)
  })
})
