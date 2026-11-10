// @vitest-environment jsdom
/** v0.7 research: bounded SceneSpec validation and rendering; not production. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SceneRenderer } from '../research/dynamic-lesson-engine/renderer.mjs'
import { compileExpression, formatValidationErrors, validateSceneSpec } from '../research/dynamic-lesson-engine/scene-spec.mjs'

const EXAMPLES = join(import.meta.dirname, '..', 'research', 'dynamic-lesson-engine', 'examples')

async function example(name: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(join(EXAMPLES, `${name}.json`), 'utf8')) as Record<string, any>
}

describe('SceneSpec v0 validation', () => {
  it('accepts the three research examples', async () => {
    for (const name of ['gradient-descent', 'unit-circle', 'bubble-sort']) {
      const result = validateSceneSpec(await example(name))
      expect(result.ok, `${name}: ${result.ok ? '' : formatValidationErrors(result.errors)}`).toBe(true)
    }
  })

  it('rejects unknown fields, external URLs/event handlers, and unsafe path data', async () => {
    const base = await example('gradient-descent')
    const withUnknown = structuredClone(base) as Record<string, any>
    withUnknown.primitives[0].onclick = 'alert(1)'
    expect(validateSceneSpec(withUnknown).ok).toBe(false)
    const withUrl = structuredClone(base) as Record<string, any>
    withUrl.primitives[0].fill = 'url(https://example.com/x)'
    expect(validateSceneSpec(withUrl).ok).toBe(false)
    const withPath = structuredClone(base) as Record<string, any>
    withPath.primitives[2].d = 'M0 0 <script>alert(1)</script>'
    expect(validateSceneSpec(withPath).ok).toBe(false)
    const withKeyframes = structuredClone(base) as Record<string, any>
    withKeyframes.timeline.tracks[0].keyframes = [{ at: 2, value: 1 }, { at: 1, value: 2 }]
    expect(validateSceneSpec(withKeyframes).ok).toBe(false)
  })

  it('rejects unbounded expressions and oversized arrays', async () => {
    const base = await example('gradient-descent')
    const withExpression = structuredClone(base) as Record<string, any>
    withExpression.primitives[5].x2 = { expr: 'window.location' }
    expect(validateSceneSpec(withExpression).ok).toBe(false)
    const withLong = structuredClone(base) as Record<string, any>
    withLong.primitives = Array.from({ length: 121 }, (_, index) => ({ ...base.primitives[0], id: `p${index}` }))
    expect(validateSceneSpec(withLong).ok).toBe(false)
    expect(validateSceneSpec({ ...base, timeline: { ...base.timeline, duration: 1000 } }).ok).toBe(false)
  })

  it('compiles only the bounded arithmetic language', () => {
    expect(compileExpression('sin(pi/2)+2^3', [])).toMatchObject({ ok: true })
    expect(compileExpression('x*2', ['x'])).toMatchObject({ ok: true })
    expect(compileExpression('window.location', [])).toMatchObject({ ok: false })
    expect(compileExpression('x; alert(1)', ['x'])).toMatchObject({ ok: false })
    expect(compileExpression('x'.repeat(300), ['x'])).toMatchObject({ ok: false })
  })
})

describe('research state snapshots', () => {
  it('accepts named states and rejects unknown state references', async () => {
    const spec = await example('bubble-sort-states')
    expect(validateSceneSpec(spec)).toMatchObject({ ok: true })
    const invalid = structuredClone(spec) as Record<string, any>
    invalid.stateTimeline[1].state = 'missing'
    expect(validateSceneSpec(invalid).ok).toBe(false)
  })

  it('applies a bounded named-state override deterministically', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const renderer = new SceneRenderer(container, await example('bubble-sort-states'))
    expect(renderer.ok).toBe(true)
    const bar = () => container.querySelector('[data-primitive="b0"]') as SVGRectElement | null
    renderer.seek(0)
    const startHeight = bar()?.getAttribute('height')
    renderer.seek(4)
    const passHeight = bar()?.getAttribute('height')
    expect(startHeight).not.toBe(passHeight)
    renderer.destroy(); container.remove()
  })
})

describe('SceneRenderer v0 prototype', () => {
  it('renders SVG primitives and updates at a deterministic time', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const spec = await example('bubble-sort')
    const renderer = new SceneRenderer(container, spec)
    expect(renderer.ok).toBe(true)
    expect(container.querySelectorAll('svg').length).toBe(1)
    expect(container.querySelectorAll('[data-primitive]').length).toBe(7)
    renderer.seek(3)
    expect(renderer.time).toBe(3)
    expect(container.querySelector('[data-primitive="scan"]')?.getAttribute('x1')).toBeTruthy()
    renderer.setProperty('missing', 1)
    renderer.destroy()
    container.remove()
  })

  it('falls back safely when rendering receives invalid data', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const renderer = new SceneRenderer(container, { version: '0.1' })
    expect(renderer.ok).toBe(false)
    expect(renderer.errors.length).toBeGreaterThan(0)
    renderer.destroy()
    container.remove()
  })
})
