// @vitest-environment jsdom
/**
 * "Enter learning" resumes the conversation that owns the project.
 *
 * The project library is shared, but its focus and attempts belong to a
 * conversation. These tests pin the delegation: ask the host, hand the resolved
 * conversation to the shell, and only fall back to binding it here when the host
 * cannot say (or says this one).
 */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OverviewResponse } from '../src/contract.js'
import type { PanelClient } from '../src/client/use-learning.js'
import { useLearning } from '../src/client/use-learning.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const LIBRARY = [{ id: 'ml', title: 'Machine Learning', goal: 'Learn ML', confirmed: 0, total: 2, updatedAt: '2026-01-01T00:00:00.000Z' }]

const OVERVIEW: OverviewResponse = {
  ok: true,
  selection: 'none',
  course: null,
  nodes: [],
  focus: null,
  nextStep: null,
  handoff: null,
  teachingBrain: true,
  lessonCount: 0,
  library: LIBRARY,
}

function client(overrides: Partial<PanelClient> = {}): PanelClient {
  return {
    fetchOverview: () => Promise.resolve(OVERVIEW),
    fetchNode: () => Promise.reject(new Error('no node')),
    fetchLesson: () => Promise.resolve({ ok: true, lesson: null }),
    startFocus: () => Promise.reject(new Error('no focus')),
    selectProject: vi.fn(async () => ({ ok: true })),
    ...overrides,
  }
}

/** A tiny surface that only exposes the "enter project" action. */
function Probe({ api, sessionId, onOpenSession }: {
  api: PanelClient
  sessionId: string
  onOpenSession: (sessionId: string) => boolean
}): ReturnType<typeof createElement> {
  const state = useLearning({ client: api, sessionId, initialOverview: OVERVIEW, onOpenSession })
  return createElement('button', { onClick: () => state.enterProject('ml') }, 'enter')
}

async function render(api: PanelClient, onOpenSession: (sessionId: string) => boolean): Promise<{
  container: HTMLDivElement
  root: Root
  click: () => Promise<void>
}> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(Probe, { api, sessionId: 'session-here', onOpenSession }))
  })
  return {
    container,
    root,
    click: async () => {
      await act(async () => {
        container.querySelector('button')?.click()
        // enterProject resolves through one promise before it acts.
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })
    },
  }
}

const mounted: Root[] = []
afterEach(() => {
  for (const root of mounted.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

describe('entering a project', () => {
  it('navigates to the resolved conversation instead of rebinding this one', async () => {
    const selectProject = vi.fn(async () => ({ ok: true }))
    const resolveProjectSession = vi.fn(async () => ({ sessionId: 'session-elsewhere' }))
    const api = client({ selectProject, resolveProjectSession })
    const opened: string[] = []
    const view = await render(api, (sessionId) => { opened.push(sessionId); return true })
    mounted.push(view.root)

    await view.click()

    expect(resolveProjectSession).toHaveBeenCalledWith('ml', 'session-here')
    expect(opened).toEqual(['session-elsewhere'])
    expect(selectProject).not.toHaveBeenCalled()
  })

  it('opens the project here when the host says this conversation owns it', async () => {
    const selectProject = vi.fn(async () => ({ ok: true }))
    const resolveProjectSession = vi.fn(async () => ({ sessionId: 'session-here' }))
    const api = client({ selectProject, resolveProjectSession })
    const opened: string[] = []
    const view = await render(api, (sessionId) => { opened.push(sessionId); return true })
    mounted.push(view.root)

    await view.click()

    expect(opened).toEqual([])
    expect(selectProject).toHaveBeenCalledWith('session-here', 'ml')
  })

  it('falls back to opening here when resolution fails or navigation is unavailable', async () => {
    const selectProject = vi.fn(async () => ({ ok: true }))
    const failing = client({ selectProject, resolveProjectSession: async () => Promise.reject(new Error('offline')) })
    const first = await render(failing, () => false)
    mounted.push(first.root)
    await first.click()
    expect(selectProject).toHaveBeenCalledWith('session-here', 'ml')

    selectProject.mockClear()
    const noNavigation = client({ selectProject, resolveProjectSession: async () => ({ sessionId: 'session-elsewhere' }) })
    const second = await render(noNavigation, () => false)
    mounted.push(second.root)
    await second.click()
    // The shell refused to navigate, so the project still opens here.
    expect(selectProject).toHaveBeenCalledWith('session-here', 'ml')
  })
})
