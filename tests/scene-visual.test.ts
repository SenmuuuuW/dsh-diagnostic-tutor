/** Static visual quality gate: real failure modes, not style preference. */
import { describe, expect, it } from 'vitest'
import { APPROVED_SCENES } from '../src/scene/approved.js'
import { visualLintScene } from '../src/scene/visual-lint.js'

function base() { return structuredClone(APPROVED_SCENES[0]!.spec) as any }
function withPrimitive(patch: Record<string, unknown>) { const spec = base(); spec.primitives = [{ id: 'p', type: 'line', x1: 10, y1: 10, x2: 100, y2: 100 }, ...spec.primitives]; Object.assign(spec.primitives[0], patch); return spec }

describe('visual lint', () => {
  it('passes the reviewed approved scene', () => {
    const result = visualLintScene(APPROVED_SCENES[0]!.spec)
    expect(result.ok).toBe(true)
    expect(result.diagnostics.filter((entry) => entry.severity === 'error')).toHaveLength(0)
  })

  it('blocks a line without a visible stroke', () => {
    const result = visualLintScene(withPrimitive({}))
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'VISUAL_MISSING_STROKE', severity: 'error', primitiveId: 'p' }))
  })

  it('blocks explicitly invisible shapes but treats omitted fill as a warning', () => {
    const invisible = base(); invisible.primitives = [{ id: 'ghost', type: 'circle', cx: 100, cy: 100, r: 20, fill: 'none' }]
    expect(visualLintScene(invisible).diagnostics).toContainEqual(expect.objectContaining({ code: 'VISUAL_INVISIBLE', severity: 'error' }))
    const implicit = base(); implicit.primitives = [{ id: 'dot', type: 'circle', cx: 100, cy: 100, r: 10 }]
    const result = visualLintScene(implicit)
    expect(result.ok).toBe(true)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'VISUAL_IMPLICIT_FILL', severity: 'warning' }))
  })

  it('warns on low contrast and catches out-of-viewport coordinates', () => {
    const low = base(); low.primitives = [{ id: 'line', type: 'line', x1: 10, y1: 10, x2: 200, y2: 10, stroke: '#ffffff', strokeWidth: 1 }]
    expect(visualLintScene(low).diagnostics).toContainEqual(expect.objectContaining({ code: 'VISUAL_LOW_CONTRAST' }))
    const outside = base(); outside.primitives = [{ id: 'dot', type: 'circle', cx: 5000, cy: 5000, r: 4, fill: '#000000' }]
    expect(visualLintScene(outside)).toMatchObject({ ok: false })
    expect(visualLintScene(outside).diagnostics).toContainEqual(expect.objectContaining({ code: 'VISUAL_OUT_OF_VIEWPORT' }))
  })

  it('catches zero geometry, text overlap and a non-finite expression at a parameter boundary', () => {
    const zero = base(); zero.primitives = [{ id: 'bar', type: 'rect', x: 10, y: 10, width: 0, height: 20, fill: '#2563eb' }]
    expect(visualLintScene(zero).diagnostics).toContainEqual(expect.objectContaining({ code: 'VISUAL_INVALID_GEOMETRY' }))
    const overlap = base(); overlap.primitives = [
      { id: 't1', type: 'text', x: 100, y: 100, text: 'first label', fontSize: 20, fill: '#111827' },
      { id: 't2', type: 'text', x: 102, y: 102, text: 'second label', fontSize: 20, fill: '#111827' },
    ]
    expect(visualLintScene(overlap).diagnostics).toContainEqual(expect.objectContaining({ code: 'VISUAL_TEXT_OVERLAP', severity: 'warning' }))
    const expr = base(); expr.properties = [{ id: 'x', label: 'x', min: 0, max: 1, step: .1, default: 0 }]; expr.controls = []; expr.checkpoints = []; expr.narration = []
    expr.primitives = [{ id: 'bad', type: 'line', x1: 10, y1: 10, x2: { expr: '10/(x-x)' }, y2: 10, stroke: '#000000' }]
    expect(visualLintScene(expr).diagnostics).toContainEqual(expect.objectContaining({ code: 'VISUAL_INVALID_EXPRESSION', severity: 'error' }))
  })

  it('catches an animation that leaves the viewport at a keyframe', () => {
    const spec = base(); spec.properties = []; spec.controls = []; spec.checkpoints = []; spec.narration = []; spec.primitives = [{ id: 'dot', type: 'circle', cx: 100, cy: 100, r: 4, fill: '#000000' }]
    spec.timeline = { duration: 2, tracks: [{ target: { primitive: 'dot', property: 'cy' }, keyframes: [{ at: 0, value: 100 }, { at: 2, value: 900 }] }] }
    expect(visualLintScene(spec).diagnostics).toContainEqual(expect.objectContaining({ code: 'VISUAL_OUT_OF_VIEWPORT', primitiveId: 'dot' }))
  })
})
