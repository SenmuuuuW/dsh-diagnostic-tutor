// @vitest-environment jsdom
/** The redesigned course-route page: one main column, one context rail. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeView } from '../src/contract.js'
import type { CourseAttempt, Curriculum, GoalBrief, PathView } from '../src/path.js'
import { defaultPathClient, PathClientError } from '../src/client/path-client.js'
import type { PathClient } from '../src/client/path-client.js'
import { resetLanguageForTests, setLang } from '../src/client/i18n.js'
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
function assessment(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready' as const, summary: 'One representation task was checked.', strengths: ['Can inspect a vector'],
    gaps: ['Training is unfamiliar'], uncertainties: ['Transfer is unverified'],
    evidence: [{ nodeId: 'vectors', evidenceIndex: 1 }], briefRevision: 1, sessionId: 'synthetic-session', updatedAt: NOW,
    ...overrides,
  }
}
function pathView(plans: Curriculum[] = [curriculum()], overrides: Partial<PathView['path']> = {}, runOverrides: Partial<NonNullable<PathView['run']>> = {}): PathView {
  return {
    ok: true, now: NOW,
    path: {
      courseId: 'synthetic-course', revision: 4, briefRevision: 1, assessmentRevision: 1, brief,
      assessment: assessment(), curricula: plans, acceptedVersion: plans.findLast((plan) => plan.acceptedAt)?.version ?? null,
      requests: [], updatedAt: NOW, ...overrides,
    },
    run: { courseId: 'synthetic-course', sessionId: 'synthetic-session', revision: 0, activeAttemptId: null, attempts: [], updatedAt: NOW, ...runOverrides },
  }
}
function attempt(overrides: Partial<CourseAttempt> = {}): CourseAttempt {
  return {
    id: 'attempt-one', operationId: 'operation-one', operations: ['operation-one'], dispatchId: null, version: 1, itemId: 'represent', status: 'working', nodeId: 'vectors',
    startedAt: NOW, updatedAt: NOW, prompted: true, promptReason: null, outcome: null, evidence: [], units: [], ...overrides,
  }
}
let host: PathView
let container: HTMLDivElement
let root: Root
let client: PathClient
let requestFailure: string | null

beforeEach(() => {
  host = pathView()
  requestFailure = null
  client = {
    get: vi.fn(async () => structuredClone(host)),
    saveBrief: vi.fn(async (params) => {
      host = { ...host, path: { ...host.path, brief: params.brief, revision: host.path.revision + 1, briefRevision: 1 } }
      return structuredClone(host)
    }),
    request: vi.fn(async (params) => {
      host.path = { ...host.path, revision: host.path.revision + 1, requests: [...host.path.requests, { id: params.operationId, sessionId: params.sessionId, kind: params.kind, briefRevision: host.path.briefRevision, createdAt: NOW, prompted: true, reason: null, failure: requestFailure }] }
      return { ...structuredClone(host), prompted: true }
    }),
    skipAssessment: vi.fn(async () => {
      host.path = { ...host.path, revision: host.path.revision + 1, assessmentRevision: 1, assessment: assessment({ status: 'skipped', summary: 'Skipped by learner.' }) }
      return structuredClone(host)
    }),
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
  resetLanguageForTests()
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
const nextCard = () => container.querySelector<HTMLElement>('.dtx-next')
const rail = () => container.querySelector<HTMLElement>('.dtx-rail')

describe('goal form', () => {
  it('saves the purpose, outcomes, weekly and session budget in one action', async () => {
    host = pathView()
    host.path = { ...host.path, brief: null, briefRevision: 0, assessment: null, assessmentRevision: 0 }
    await mount()
    expect(container.textContent).toContain('Set your learning goal')
    await change('#dtx-purpose', 'Understand regression')
    await change('#dtx-outcomes', 'Explain a baseline\nCompare two models')
    await change('#dtx-background', 'Some Python')
    await change('#dtx-weekly', '480')
    await change('#dtx-session', '45')
    await click('Save goal')
    expect(vi.mocked(client.saveBrief)).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(client.saveBrief).mock.calls[0]![0].brief
    expect(sent.purpose).toBe('Understand regression')
    expect(sent.outcomes).toEqual(['Explain a baseline', 'Compare two models'])
    expect(sent.weeklyMinutes).toBe(480)
    expect(sent.sessionMinutes).toBe(45)
  })

  it('asks for the diagnosis after the goal is saved', async () => {
    host = pathView()
    host.path = { ...host.path, assessment: null, assessmentRevision: 0 }
    await mount({ onOpenChat: () => {} })
    expect(container.textContent).toContain('Start the initial diagnosis')
    await click('Request diagnosis')
    expect(vi.mocked(client.request).mock.calls[0]![0]).toMatchObject({ kind: 'diagnosis' })
    expect(container.textContent).toContain('Waiting for the tutor…')
    expect(container.textContent).toContain('Open chat')
  })

  it('lets a learner skip the diagnosis and ask for a route', async () => {
    host = pathView()
    host.path = { ...host.path, assessment: null, assessmentRevision: 0, curricula: [], acceptedVersion: null }
    await mount()
    await click('Skip diagnosis')
    expect(vi.mocked(client.skipAssessment)).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Review and accept the learning route')
    expect(vi.mocked(client.request)).not.toHaveBeenCalled()
    await click('Generate learning route')
    expect(vi.mocked(client.request).mock.calls[0]![0]).toMatchObject({ kind: 'plan' })
  })
})

describe('diagnosis states', () => {
  it('shows elapsed waiting time and a recovery link after a minute', async () => {
    vi.useFakeTimers()
    host = pathView()
    host.path = { ...host.path, assessment: null, assessmentRevision: 0 }
    host.path.requests = [{ id: 'r1', sessionId: 'synthetic-session', kind: 'diagnosis', briefRevision: 1, createdAt: '2026-10-01T11:55:00.000Z', prompted: true, reason: null }]
    host.now = '2026-10-01T12:00:00.000Z'
    await mount()
    expect(container.textContent).toContain('Waiting for the tutor…')
    expect(container.textContent).toContain('Waiting 5 min')
    expect(container.textContent).toContain('No questions yet? Retry')
  })

  it('explains a failed turn and retries with a fresh request', async () => {
    requestFailure = 'OpenAI API error (403): insufficient balance'
    const onOpenChat = vi.fn()
    host = pathView()
    host.path = { ...host.path, assessment: null, assessmentRevision: 0, requests: [] }
    await mount({ onOpenChat })
    await click('Request diagnosis')
    expect(container.textContent).toContain('The tutor could not finish the diagnosis')
    expect(container.textContent).toContain('no balance')
    await click('Retry and open the chat')
    expect(vi.mocked(client.request)).toHaveBeenCalledTimes(2)
    expect(onOpenChat).toHaveBeenCalled()
  })
})

describe('route proposal', () => {
  beforeEach(() => {
    host = pathView([curriculum(1, false)], { acceptedVersion: null })
  })

  it('shows the route, budget and accept action, then unlocks learning', async () => {
    await mount()
    expect(container.querySelector('.dtx-proposal')?.textContent).toContain('Review and accept the learning route')
    expect(container.textContent).toContain('Foundations')
    await click('Expand all')
    expect(container.querySelectorAll('.dtx-lesson')).toHaveLength(3)
    expect(container.textContent).toContain('2 h')
    expect(container.textContent).toContain('Accept route')
    await click('Accept route')
    expect(vi.mocked(client.accept).mock.calls[0]![0].version).toBe(1)
    expect(container.textContent).toContain('Represent the data')
    expect(container.textContent).toContain('Start this lesson')
  })

  it('previews a lesson in the rail when it is selected', async () => {
    await mount()
    await click('Expand all')
    const lesson = [...container.querySelectorAll<HTMLButtonElement>('.dtx-lesson')].find((entry) => entry.textContent?.includes('Train the classifier'))!
    await act(async () => lesson.click())
    expect(rail()?.textContent).toContain('Lesson preview')
    expect(rail()?.textContent).toContain('Train the classifier')
    expect(rail()?.textContent).toContain('Define a model')
    expect(rail()?.textContent).toContain('Plan only, not evidence of mastery.')
  })

  it('flags lessons that do not fit the preferred session length', async () => {
    await mount()
    expect(container.textContent).toContain('3 lessons longer than one session')
  })
})

describe('learning', () => {
  it('reconnects the tutor when continuing the active lesson', async () => {
    const onStarted = vi.fn()
    host = pathView([curriculum(1, true)], {}, { activeAttemptId: 'attempt-one', attempts: [attempt({ units: [{
      id: 'u1', writtenAt: NOW,
      lesson: { id: 'lesson-represent', courseId: 'synthetic-course', nodeId: 'vectors', title: 'Represent the data', origin: 'tutor', createdAt: NOW, updatedAt: NOW, blocks: [{ id: 'b1', type: 'text', content: { md: 'Start with a small example.' } }] },
    }] })] })
    await mount({ onStarted })
    expect(nextCard()?.textContent).toContain('Represent the data')
    expect(nextCard()?.textContent).toContain('Continue this lesson')
    await click('Continue this lesson')
    expect(vi.mocked(client.start).mock.calls[0]![0]).toMatchObject({ resume: true, version: 1, itemId: 'represent' })
    expect(onStarted).toHaveBeenCalledTimes(1)
  })

  it('pauses the active lesson and resumes it explicitly', async () => {
    const pause = vi.fn(async () => {
      host = { ...host, run: { ...host.run!, activeAttemptId: 'attempt-one', attempts: [attempt({ status: 'interrupted' })] } }
      return structuredClone(host)
    })
    client.pause = pause
    host = pathView([curriculum(1, true)], {}, { activeAttemptId: 'attempt-one', attempts: [attempt({ units: [{ id: 'u1', writtenAt: NOW, lesson: { id: 'lesson', courseId: 'synthetic-course', nodeId: 'vectors', title: 'Represent the data', origin: 'tutor', createdAt: NOW, updatedAt: NOW, blocks: [{ id: 'b1', type: 'text', content: { md: 'Start.' } }] } }] })] })
    await mount()
    await click('Pause this lesson')
    expect(pause).toHaveBeenCalledTimes(1)
    expect(nextCard()?.textContent).toContain('Paused')
    await click('Continue this lesson')
    expect(vi.mocked(client.start).mock.calls.at(-1)![0]).toMatchObject({ resume: true })
  })

  it('starts the next unfinished lesson after earlier completions', async () => {
    host = pathView([curriculum(1, true)], {}, {
      attempts: [
        attempt({ id: 'a1', itemId: 'represent', status: 'completed', units: [] }),
        attempt({ id: 'a2', itemId: 'train', status: 'completed', units: [] }),
      ],
    })
    await mount()
    expect(nextCard()?.textContent).toContain('Evaluate new examples')
    expect(nextCard()?.textContent).toContain('Start next lesson')
    expect(container.textContent).toContain('2/3 lessons')
    await click('Start next lesson')
    expect(vi.mocked(client.start).mock.calls[0]![0]).toMatchObject({ version: 1, itemId: 'evaluate' })
  })

  it('says the route is complete when every lesson has a completed attempt', async () => {
    const onOpenEvidence = vi.fn()
    host = pathView([curriculum(1, true)], {}, {
      attempts: ['represent', 'train', 'evaluate'].map((itemId, index) => attempt({ id: `a${index}`, itemId, status: 'completed', units: [] })),
    })
    await mount({ onOpenEvidence })
    const card = container.querySelector<HTMLElement>('.dtx-next[data-kind=complete]')
    expect(card?.textContent).toContain('This conversation finished the route')
    expect(card?.textContent).toContain('Completing lessons is not mastery')
    await click('View learning evidence')
    expect(onOpenEvidence).toHaveBeenCalled()
  })

  it('shows a waiting card for a lesson the tutor has not written yet', async () => {
    host = pathView([curriculum(1, true)], {}, { activeAttemptId: 'attempt-one', attempts: [attempt({ units: [] })] })
    await mount({ onOpenChat: () => {} })
    expect(container.textContent).toContain('Waiting for the tutor to join…')
    expect(container.textContent).toContain('Open chat')
  })

  it('shows a version conflict without moving the conversation', async () => {
    const onOpenChat = vi.fn()
    host = pathView([curriculum(1, true), curriculum(2, true)], { acceptedVersion: 2 }, { activeAttemptId: 'attempt-one', attempts: [attempt({ version: 1 })] })
    await mount({ onOpenChat })
    const card = container.querySelector<HTMLElement>('.dtx-next[data-kind=version]')
    expect(card?.textContent).toContain('This conversation uses v1 · the project accepted v2')
    await click('Continue this conversation')
    expect(onOpenChat).toHaveBeenCalled()
  })

  it('keeps the page read-only without a conversation', async () => {
    host = pathView()
    host.path = { ...host.path, brief: null, briefRevision: 0, assessment: null, assessmentRevision: 0 }
    host.run = null
    await mount({ sessionId: undefined })
    expect(container.textContent).toContain('Browsing only')
    expect((container.querySelector('#dtx-purpose') as HTMLTextAreaElement).disabled).toBe(true)
  })
})

describe('route copy', () => {
  it('switches to Chinese without translating lesson content', async () => {
    await mount()
    expect(container.textContent).toContain('Learning route')
    await act(async () => setLang('zh'))
    expect(container.textContent).toContain('学习路线')
    expect(container.textContent).toContain('学习路线')
    expect(container.textContent).toContain('Represent the data')
    await act(async () => setLang('en'))
    expect(container.textContent).toContain('Learning route')
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
