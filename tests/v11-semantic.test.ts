/** v11 semantic constraints: pass, fail and unverified are distinct. */
import { describe, expect, it } from 'vitest'
import { verifySceneSemantics } from '../research/dynamic-lesson-engine/v4/semantic.mjs'

function lineScene(dy: number) {
  return {
    version: '0.1',
    viewport: { width: 400, height: 300, background: '#ffffff' },
    metadata: { title: 'line', subject: 'math', objective: 'slope', learner: 'test' },
    properties: [{ id: 'x', label: 'x', min: 0, max: 1, step: .1, default: .5 }],
    primitives: [{ id: 'line', type: 'line', x1: 10, y1: 10, x2: 110, y2: 10 + dy, stroke: '#111827' }],
    timeline: { duration: 1, tracks: [] }, controls: [], checkpoints: [], narration: [],
    fallback: { text: 'line' }, accessibility: { alt: 'line', reducedMotion: 'static', keyboard: true },
  }
}

describe('v11 semantic constraints', () => {
  it('passes a positive line slope and fails a negative one', () => {
    expect(verifySceneSemantics(lineScene(50), { kind: 'line-slope', direction: 'positive' }).status).toBe('pass')
    expect(verifySceneSemantics(lineScene(-50), { kind: 'line-slope', direction: 'positive' })).toMatchObject({ status: 'fail', constraintId: 'line-slope' })
  })

  it('returns unverified rather than pass when no supported primitive exists', () => {
    const scene = lineScene(50); scene.primitives = []
    expect(verifySceneSemantics(scene, { kind: 'line-slope', direction: 'positive' }).status).toBe('unverified')
    expect(verifySceneSemantics(lineScene(50), undefined).status).toBe('not-applicable')
    expect(verifySceneSemantics(lineScene(50), { kind: 'sorting-order' }).status).toBe('unverified')
  })
})
