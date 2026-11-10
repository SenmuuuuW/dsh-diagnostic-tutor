/** Canonical contract: strict vs normalized are reported as different outcomes. */
import { describe, expect, it } from 'vitest'
import { APPROVED_SCENES } from '../src/scene/approved.js'
import { contractSummary, normalizeSceneSpec } from '../src/scene/contract.js'
import { validateSceneSpec as validateProduction } from '../src/scene/spec.js'
import { validateSceneSpec as validateResearch } from '../research/dynamic-lesson-engine/scene-spec.mjs'

function staticSpec() {
  const spec = structuredClone(APPROVED_SCENES[0]!.spec) as any
  spec.properties = []
  spec.controls = []
  spec.checkpoints = []
  spec.narration = []
  spec.timeline = { duration: 1, tracks: [] }
  spec.primitives = [
    { id: 'ring', type: 'circle', cx: 100, cy: 100, r: 40, fill: 'none', stroke: '#2563eb', strokeWidth: 2 },
    { id: 'label', type: 'text', x: 160, y: 100, text: 'static diagram', fontSize: 14, fill: '#111827', anchor: 'start' },
  ]
  return spec
}
function aliasSpec() {
  const spec = staticSpec()
  spec.metadata.topic = 'trigonometry'
  delete spec.primitives[1].anchor
  spec.primitives[1].textAnchor = 'middle'
  return spec
}

describe('canonical scene contract', () => {
  it('publishes anchor and the official optional topic/properties fields', () => {
    const summary = contractSummary()
    expect(summary).toContain('generator contract v4')
    expect(summary).toContain('Text MUST use anchor')
    expect(summary).toContain('properties is optional')
    expect(summary).toContain('metadata.topic is optional')
  })

  it('production strict accepts official topic and omitted properties but rejects deprecated textAnchor', () => {
    const official = staticSpec()
    official.metadata.topic = 'trigonometry'
    official.properties = undefined
    expect(validateProduction(official).ok).toBe(true)
    const alias = aliasSpec()
    expect(validateProduction(alias).ok).toBe(false)
    expect(validateProduction(alias).errors).toContainEqual(expect.objectContaining({ path: 'primitives[1].textAnchor', code: 'unknown-key' }))
  })

  it('research strict rejects textAnchor; normalization maps it and revalidation succeeds', () => {
    const raw = aliasSpec()
    const strict = validateResearch(structuredClone(raw), { normalizeAliases: false })
    expect(strict.ok).toBe(false)
    const normalized = normalizeSceneSpec(raw)
    expect(normalized.changes).toEqual([expect.objectContaining({ path: 'primitives[1].textAnchor', to: 'anchor' })])
    const accepted = validateResearch(normalized.spec, { normalizeAliases: false })
    expect(accepted.ok).toBe(true)
    expect(accepted.spec.metadata.topic).toBe('trigonometry')
  })
})
