// @vitest-environment jsdom
/** The redesigned docked Current lesson tab: lesson content, progress, answers in chat. */
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OverviewResponse } from '../src/contract.js'
import type { CourseAttempt, Curriculum, GoalBrief, PathView } from '../src/path.js'
import { resetLanguageForTests, setLang } from '../src/client/i18n.js'
import { LearningTab, LearningTabTitle } from '../src/client/tab.jsx'
import type { PanelClient } from '../src/client/use-learning.js'

const NOW = '2026-01-01T00:00:00.000Z'
const brief: GoalBrief = {
  purpose: 'Learn ML', outcomes: ['Build a small model'], background: 'Some Python', timeZone: 'America/New_York',
  targetDate: null, durationWeeks: 4, deadline: 'flexible', weeklyMinutes: 120, sessionMinutes: 45, preferences: '',
}
const plan: Curriculum = {
  version: 1, briefRevision: 1, assessmentRevision: 1, createdAt: NOW, acceptedAt: NOW,
  title: 'ML route', summary: 'A route.',
  modules: [{ id: 'm1', title: 'Foundations', overview: 'Start here.', outcomes: ['Build a model'], milestone: 'Build a model' }],
  items: [{
    id: 'i1', moduleId: 'm1', title: 'Vectors and matrices', overview: 'Vectors first.', outcomes: ['Read a matrix'],
    outline: ['Read the shapes', 'Compute a dot product'], topics: ['shapes', 'dot product'], nodeIds: ['ml:vectors'],
    practice: 'Compute a shape.', assessment: 'Explain a shape.', minutes: { min: 35, max: 50 },
  }],
  edges: [], assumptions: [], changeReason: 'Initial route.',
}
const lesson = {
  id: 'lesson-1', courseId: 'ml', nodeId: 'ml:vectors', title: 'Vectors and matrices', origin: 'tutor' as const,
  createdAt: NOW, updatedAt: NOW,
  blocks: [
    { id: 'b1', type: 'text' as const, content: { md: 'Vectors describe features; matrices describe datasets.' } },
    { id: 'b2', type: 'check' as const, content: { prompt: 'What is the shape of a 5 × 2 matrix times a length-2 vector?' } },
  ],
}
function attempt(overrides: Partial<CourseAttempt> = {}): CourseAttempt {
  return {
    id: 'a1', operationId: 'op', operations: ['op'], dispatchId: null, version: 1, itemId: 'i1', status: 'working', nodeId: 'ml:vectors',
    startedAt: NOW, updatedAt: NOW, prompted: true, promptReason: null, outcome: null, evidence: [],
    units: [{ id: 'u1', writtenAt: NOW, lesson }], ...overrides,
  }
}
function pathView(runOverrides: Partial<NonNullable<PathView['run']>> = {}, overrides: Partial<PathView['path']> = {}): PathView {
  return {
    ok: true, now: NOW,
    path: {
      courseId: 'ml', revision: 4, briefRevision: 1, assessmentRevision: 1, brief,
      assessment: { status: 'ready', summary: 's', strengths: [], gaps: [], uncertainties: [], evidence: [], briefRevision: 1, sessionId: 's1', updatedAt: NOW },
      curricula: [plan], acceptedVersion: 1, requests: [], updatedAt: NOW, ...overrides,
    },
    run: { courseId: 'ml', sessionId: 's1', revision: 0, activeAttemptId: 'a1', attempts: [attempt()], updatedAt: NOW, ...runOverrides },
  }
}
const overview: OverviewResponse = {
  ok: true, selection: 'project',
  course: { id: 'ml', title: 'Machine Learning', goal: 'Learn ML', status: 'active', createdAt: NOW, updatedAt: NOW },
  nodes: [], focus: null, nextStep: null, handoff: null, teachingBrain: true, lessonCount: 0, library: [],
}
function makeClient(view: PathView): PanelClient {
  return {
    fetchOverview: () => Promise.resolve(overview),
    fetchNode: () => Promise.reject(new Error('not used')),
    fetchLesson: () => Promise.resolve({ ok: true, lesson }),
    startFocus: () => Promise.reject(new Error('not used')),
    pathClient: {
      get: () => Promise.resolve(view),
      saveBrief: () => Promise.reject(new Error('not used')),
      request: () => Promise.reject(new Error('not used')),
      skipAssessment: () => Promise.reject(new Error('not used')),
      accept: () => Promise.reject(new Error('not used')),
      start: () => Promise.reject(new Error('not used')),
    },
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
async function mount(view: PathView, props: Partial<Parameters<typeof LearningTab>[0]> = {}) {
  await act(async () => {
    root.render(createElement(LearningTab, { client: makeClient(view), sessionId: 's1', onOpenMapPage: () => {}, ...props }))
    await Promise.resolve()
    await Promise.resolve()
  })
}
function button(label: string): HTMLButtonElement {
  const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent?.trim() === label)
  expect(target, label).toBeDefined()
  return target!
}

describe('empty states', () => {
  it('names the tab', () => {
    expect(renderToStaticMarkup(createElement(LearningTabTitle))).toBe('Current lesson')
  })
  it('offers the learning map when no project is open', async () => {
    const onOpenMapPage = vi.fn()
    const client = makeClient(pathView())
    client.fetchOverview = () => Promise.resolve({ ...overview, course: null, selection: 'none' })
    await act(async () => {
      root.render(createElement(LearningTab, { client, sessionId: 's1', onOpenMapPage }))
      await Promise.resolve()
    })
    expect(container.textContent).toContain('No lesson yet')
    await act(async () => button('Open learning map').click())
    expect(onOpenMapPage).toHaveBeenCalled()
  })
  it('says the lesson is not started when there is no attempt', async () => {
    await mount(pathView({ activeAttemptId: null, attempts: [] }))
    expect(container.textContent).toContain('No lesson started')
    expect(container.textContent).toContain('Open learning map')
  })
})

describe('active lesson', () => {
  it('renders the lesson title, route meta, progress and the tutor-written blocks', async () => {
    await mount(pathView())
    expect(container.querySelector('h2')?.textContent).toBe('Vectors and matrices')
    expect(container.textContent).toContain('Foundations')
    expect(container.textContent).toContain('This conversation 0/1 lessons')
    expect(container.textContent).toContain('Route v1')
    expect(container.textContent).toContain('Vectors describe features')
    expect(container.textContent).toContain('What is the shape')
    expect(container.textContent.toLowerCase()).toContain('answer in the chat')
    expect(container.textContent).toContain('Open learning map')
  })
  it('lets the tutor continue or check in, and can pause the lesson', async () => {
    const view = pathView()
    const base = makeClient(view)
    const start = vi.fn(async (..._args: any[]) => ({ ...view, prompted: true }))
    const pause = vi.fn(async (..._args: any[]) => ({ ...view, run: { ...view.run!, attempts: [attempt({ status: 'interrupted' })] } }))
    const onOpenChat = vi.fn()
    await act(async () => {
      root.render(createElement(LearningTab, {
        client: { ...base, pathClient: { ...base.pathClient!, start, pause } },
        sessionId: 's1', onOpenMapPage: () => {}, onOpenChat,
      }))
      await Promise.resolve(); await Promise.resolve()
    })
    await act(async () => { button('Let the tutor continue').click(); await Promise.resolve() })
    expect(start.mock.calls[0]![0]).toMatchObject({ resume: true, version: 1, itemId: 'i1' })
    expect(onOpenChat).toHaveBeenCalled()
    await act(async () => { button('Check in with me').click(); await Promise.resolve() })
    expect(start.mock.calls.at(-1)![0]).toMatchObject({ resume: true, checkin: true })
    await act(async () => { button('Pause this lesson').click(); await Promise.resolve() })
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('folds a long diagram until the learner opens it', async () => {
    const withDiagram = {
      ...lesson,
      blocks: [...lesson.blocks, { id: 'd1', type: 'diagram' as const, content: { format: 'ascii' as const, spec: 'wide ascii diagram', caption: '路线图' } }],
    }
    await mount(pathView({ activeAttemptId: 'a1', attempts: [attempt({ units: [{ id: 'u1', writtenAt: NOW, lesson: withDiagram }] })] }))
    const fold = container.querySelector<HTMLDetailsElement>('.dtx-tab-fold')
    expect(fold).not.toBeNull()
    expect(fold?.open).toBe(false)
    expect(fold?.querySelector('summary')?.textContent).toContain('路线图')
    await act(async () => { if (fold !== null) fold.open = true })
    expect(container.textContent).toContain('wide ascii diagram')
  })

  it('shows the waiting state while the tutor has not written a unit', async () => {
    await mount(pathView({ activeAttemptId: 'a1', attempts: [attempt({ units: [] })] }))
    expect(container.textContent).toContain('The tutor is preparing this lesson…')
  })
  it('shows completed status and switches to Chinese', async () => {
    await mount(pathView({ activeAttemptId: 'a1', attempts: [attempt({ status: 'completed', outcome: 'Explained the shape.' })] }))
    expect(container.textContent).toContain('Completed')
    expect(container.textContent).toContain('Explained the shape.')
    await act(async () => setLang('zh'))
    expect(container.textContent).toContain('已完成')
    expect(container.textContent).toContain('本会话 1/1 课次')
  })
})
