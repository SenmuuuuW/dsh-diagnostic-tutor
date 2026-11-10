// @vitest-environment jsdom
/** Production scene block: approved gating, playback controls, Study persistence boundary. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import type { BlockInteraction } from '../src/client/blocks.jsx'
import { BlockView } from '../src/client/blocks.jsx'
import { StudySession } from '../src/client/study.jsx'
import { resetLanguageForTests } from '../src/client/i18n.js'
import type { KnownBlock } from '../src/lesson.js'
import type { SceneProgress } from '../src/path.js'
import { APPROVED_SCENES } from '../src/scene/approved.js'
import { sceneFingerprint } from '../src/scene/canonical.js'

const approved = APPROVED_SCENES[0]!
function sceneBlock(title = approved.spec.metadata.title): KnownBlock {
  const spec = structuredClone(approved.spec) as any
  spec.metadata.title = title
  return { id: 'scene-1', type: 'scene', content: { sceneVersion: '1', spec, fallback: approved.fallback } } as KnownBlock
}
const interaction = (overrides: Partial<BlockInteraction> = {}): BlockInteraction => ({ attemptId: 'attempt-1', responses: [], submit: vi.fn(async () => {}), sceneEnabled: true, ...overrides })
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
function button(label: string): HTMLButtonElement {
  const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((entry) => (entry.getAttribute('aria-label') ?? entry.textContent ?? '').includes(label))
  expect(target, label).toBeDefined()
  return target!
}
function change(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('production scene block', () => {
  it('renders only an approved scene when the feature is enabled', async () => {
    await act(async () => { root.render(createElement(BlockView, { block: sceneBlock(), interaction: interaction() })); await Promise.resolve() })
    expect(container.querySelector('[data-block-type="scene"]')).not.toBeNull()
    expect(container.querySelector('.dt-scene-svg')).not.toBeNull()
    expect(container.querySelector('.dt-scene-svg')?.getAttribute('aria-label')).toContain('unit circle')
    expect(button('Play')).not.toBeUndefined()
    expect(container.textContent).toContain('Teaching checkpoint')
  })

  it('falls back when the feature flag is disabled', async () => {
    await act(async () => { root.render(createElement(BlockView, { block: sceneBlock(), interaction: interaction({ sceneEnabled: false }) })); await Promise.resolve() })
    expect(container.querySelector('.dt-scene-svg')).toBeNull()
    expect(container.textContent).toContain('Dynamic scenes are disabled')
    expect(container.textContent).toContain(approved.fallback)
  })

  it('falls back for a changed, unapproved spec', async () => {
    const block = sceneBlock('Changed title')
    await act(async () => { root.render(createElement(BlockView, { block, interaction: interaction() })); await Promise.resolve() })
    expect(container.querySelector('.dt-scene-svg')).toBeNull()
    expect(container.textContent).toContain('interactive scene is unavailable')
  })

  it('reports presentation progress on seek and parameter change, never as evidence', async () => {
    const progress = vi.fn()
    await act(async () => { root.render(createElement(BlockView, { block: sceneBlock(), interaction: interaction({ sceneProgress: progress }) })); await Promise.resolve() })
    expect(progress).toHaveBeenCalled()
    const checkpoint = button('Predict the sign')
    await act(async () => { checkpoint.click(); await Promise.resolve() })
    expect(container.textContent).toContain('3.14s')
    const angle = container.querySelector<HTMLInputElement>('input[aria-label="angle"]')!
    await act(async () => { change(angle, '2'); await Promise.resolve() })
    const latest = progress.mock.calls.at(-1)?.[1] as SceneProgress
    expect(latest.sceneHash).toMatch(/^fnv1a64-/)
    expect(latest.params.angle).toBe(2)
    expect(container.textContent).not.toContain('mastery')
  })
})

describe('Study scene persistence', () => {
  it('restores time/params paused and continues to the next block only by learner action', async () => {
    const scene = sceneBlock()
    const text: KnownBlock = { id: 'text-1', type: 'text', content: { md: 'Next reading.' } }
    const onProgress = vi.fn()
    const initial = {
      blockId: scene.id, stepIndex: 0, scrollRatio: 0, fullscreen: false, finished: false, updatedAt: '2026-01-01T00:00:00.000Z',
      scenes: { [scene.id]: { blockId: scene.id, sceneHash: 'old', time: 2.4, params: { angle: 2 }, playing: true, reached: [] } },
    }
    await act(async () => { root.render(createElement(StudySession, { title: 'Scene lesson', blocks: [scene, text], interaction: interaction(), onExit: vi.fn(), onProgress, initialStudy: initial })); await Promise.resolve() })
    // A different fingerprint invalidates the old position; restore starts at zero and paused.
    expect(container.textContent).toContain('0.00s')
    expect(container.querySelector('.dt-scene-svg')).not.toBeNull()
    expect(container.textContent).toContain('Step 1 of 2')
    await act(async () => { button('Continue').click(); await Promise.resolve() })
    expect(container.textContent).toContain('Next reading.')
    const last = onProgress.mock.calls.at(-1)?.[0]
    expect(last.scenes).toBeDefined()
    expect(last.finished).toBe(false)
  })

  it('restores matching scene time/params but always paused', async () => {
    const scene = sceneBlock()
    const text: KnownBlock = { id: 'text-1', type: 'text', content: { md: 'Next.' } }
    const hash = sceneFingerprint(approved.spec, approved.fallback)
    const onProgress = vi.fn()
    const initial = {
      blockId: scene.id, stepIndex: 0, scrollRatio: 0, fullscreen: false, finished: false, updatedAt: '2026-01-01T00:00:00.000Z',
      scenes: { [scene.id]: { blockId: scene.id, sceneHash: hash, time: 2.4, params: { angle: 2 }, playing: true, reached: [] } },
    }
    await act(async () => { root.render(createElement(StudySession, { title: 'Restore', blocks: [scene, text], interaction: interaction(), onExit: vi.fn(), onProgress, initialStudy: initial })); await Promise.resolve() })
    expect(container.textContent).toContain('2.40s')
    expect(button('Play')).not.toBeUndefined()
    expect(container.textContent).toContain('2.00rad')
    expect(onProgress).toHaveBeenCalled()
  })

  it('keeps the old lesson progress shape compatible when no scene data exists', async () => {
    const text: KnownBlock = { id: 'text-1', type: 'text', content: { md: 'Old lesson.' } }
    const onProgress = vi.fn()
    await act(async () => { root.render(createElement(StudySession, { title: 'Old', blocks: [text], onExit: vi.fn(), onProgress, initialStudy: { blockId: 'text-1', stepIndex: 0, scrollRatio: 0, fullscreen: false, finished: false, updatedAt: '2026-01-01T00:00:00.000Z' } })); await Promise.resolve() })
    expect(container.textContent).toContain('Old lesson.')
    expect(onProgress).toHaveBeenCalled()
  })
})
