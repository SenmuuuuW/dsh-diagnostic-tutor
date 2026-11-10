/** Production scene block: schema, approval boundary, feature flag and Study progress. */
import { describe, expect, it } from 'vitest'

import { SceneBlockContentSchema } from '../src/scene/block.js'
import { SceneBlockSchema } from '../src/lesson.js'
import { APPROVED_SCENES, isApprovedScene } from '../src/scene/approved.js'
import { assertSceneWriteAllowed, checkSceneGate, sceneDigest } from '../src/scene/approval.js'
import { DYNAMIC_SCENES_ENV } from '../src/scene/feature.js'
import { SceneProgressSchema, StudyProgressSchema } from '../src/path.js'
import { BlockSchema } from '../src/lesson.js'

const approved = APPROVED_SCENES[0]!
function sceneBlock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'scene-1',
    type: 'scene',
    content: { sceneVersion: '1', spec: structuredClone(approved.spec), fallback: approved.fallback, ...overrides },
  }
}
function withFlag(value: string | undefined, run: () => void): void {
  const previous = process.env[DYNAMIC_SCENES_ENV]
  if (value === undefined) delete process.env[DYNAMIC_SCENES_ENV]
  else process.env[DYNAMIC_SCENES_ENV] = value
  try { run() } finally {
    if (previous === undefined) delete process.env[DYNAMIC_SCENES_ENV]
    else process.env[DYNAMIC_SCENES_ENV] = previous
  }
}

describe('production scene schema', () => {
  it('accepts the reviewed approved scene and rejects a missing fallback', () => {
    expect(SceneBlockSchema.safeParse(sceneBlock()).success).toBe(true)
    expect(SceneBlockSchema.safeParse({ id: 's', type: 'scene', content: { sceneVersion: '1', spec: approved.spec } }).success).toBe(false)
    expect(BlockSchema.safeParse(sceneBlock()).success).toBe(true)
  })

  it('rejects a scene with a remote URL or an unknown executable field', () => {
    const remote = structuredClone(approved.spec) as any
    remote.primitives[0].fill = 'url(https://evil.example/x)'
    expect(SceneBlockContentSchema.safeParse({ sceneVersion: '1', spec: remote, fallback: approved.fallback }).success).toBe(false)
    const handler = structuredClone(approved.spec) as any
    handler.primitives[0].onclick = 'alert(1)'
    expect(SceneBlockSchema.safeParse(sceneBlock({ spec: handler })).success).toBe(false)
  })

  it('accepts a valid but unapproved spec structurally, while approval rejects it', () => {
    const changed = structuredClone(approved.spec) as any
    changed.metadata.title = 'A changed title'
    expect(SceneBlockSchema.safeParse(sceneBlock({ spec: changed })).success).toBe(true)
    expect(isApprovedScene(changed, approved.fallback)).toBe(false)
  })
})

describe('approval and feature boundary', () => {
  it('approves only the exact reviewed spec + fallback', () => {
    expect(isApprovedScene(approved.spec, approved.fallback)).toBe(true)
    expect(isApprovedScene(approved.spec, approved.fallback + ' changed')).toBe(false)
    expect(sceneDigest({ spec: approved.spec, fallback: approved.fallback })).toMatch(/^[a-f0-9]{64}$/)
  })

  it('refuses writes when the feature flag is off, even for an approved scene', () => {
    withFlag(undefined, () => {
      expect(() => assertSceneWriteAllowed({ spec: approved.spec, fallback: approved.fallback })).toThrow(/dynamic-scenes-disabled/)
    })
  })

  it('refuses unapproved content when rendering is enabled', () => {
    withFlag('1', () => {
      expect(() => assertSceneWriteAllowed({ spec: approved.spec, fallback: approved.fallback })).not.toThrow()
      expect(() => assertSceneWriteAllowed({ spec: approved.spec, fallback: 'different' })).toThrow(/scene-not-approved/)
      const gate = checkSceneGate({ spec: approved.spec, fallback: approved.fallback }, true)
      expect(gate).toMatchObject({ valid: true, approved: true, enabled: true })
      expect(sceneDigest({ spec: approved.spec, fallback: approved.fallback })).not.toBeNull()
    })
  })
})

describe('scene Study progress', () => {
  it('parses an additive scene position and keeps old Study progress compatible', () => {
    const scenes = { 'scene-1': { blockId: 'scene-1', sceneHash: 'fnv1a64-0000000000000001', time: 2.5, params: { angle: 1.2 }, playing: true, checkpointId: 'cp-pi', reached: ['cp-pi'] } }
    const parsed = StudyProgressSchema.parse({ blockId: 'scene-1', stepIndex: 2, scrollRatio: 0.3, fullscreen: false, finished: false, scenes, updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(parsed.scenes?.['scene-1']?.time).toBe(2.5)
    const old = StudyProgressSchema.parse({ blockId: 'text-1', stepIndex: 0, scrollRatio: 0, fullscreen: false, finished: false, updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(old.scenes).toBeUndefined()
  })

  it('rejects oversized or non-finite scene positions', () => {
    expect(SceneProgressSchema.safeParse({ blockId: 's', sceneHash: 'h', time: 999, params: {}, playing: false, reached: [] }).success).toBe(false)
    expect(SceneProgressSchema.safeParse({ blockId: 's', sceneHash: 'h', time: Number.NaN, params: {}, playing: false, reached: [] }).success).toBe(false)
  })
})
