/** v4 repair is bounded: fix contract shape/style, never guess math or semantic facts. */
import { describe, expect, it } from 'vitest'
import { APPROVED_SCENES } from '../src/scene/approved.js'
import { analyzeScene, deterministicRepair, repairContractDrift, attemptRecord, hashValue } from '../research/dynamic-lesson-engine/v4/pipeline.mjs'

function approved() { return structuredClone(APPROVED_SCENES[0]!.spec) as any }

describe('v4 repair safety', () => {
  it('canonicalizes common contract drift and records every change', () => {
    const raw = approved()
    raw.properties[0].value = raw.properties[0].default; delete raw.properties[0].default
    raw.timeline = { duration: 6, tracks: [{ target: { primitive: 'radius', field: 'x2' }, keyframes: [{ at: 0, value: 200 }, { at: 2, value: 300 }] }] }
    raw.checkpoints = [{ at: 3.14, prompt: 'Predict', learnerAction: 'answer' }]
    raw.controls[0].property = 'angle'; delete raw.controls[0].propertyId
    raw.sourceRefs = ['not-an-object']
    const repaired = repairContractDrift(raw)
    expect(repaired.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'properties[0].value', action: 'rename-to-default' }),
      expect.objectContaining({ path: 'timeline.tracks[0].target.field', action: 'rename-to-property' }),
      expect.objectContaining({ path: 'controls[0].property', action: 'rename-to-propertyId' }),
      expect.objectContaining({ path: 'sourceRefs', action: 'remove-bare-strings' }),
    ]))
    expect(analyzeScene(repaired.spec).strict.ok).toBe(true)
  })

  it('does not repair an unknown variable or a semantic contradiction by guessing', () => {
    const raw = approved()
    raw.primitives[1].x2 = { expr: '100 + unknownVariable' }
    const analysis = analyzeScene(raw)
    expect(analysis.normalized.ok).toBe(false)
    expect(analysis.normalized.spec).toBeUndefined()
    const semantic = analyzeScene(approved(), { reference: { kind: 'sampled-point', samples: [{ vars: { angle: 0 }, x: 0, y: 0 }], tolerance: 1 } })
    expect(semantic.semantic?.status).toBe('fail')
    expect(deterministicRepair(semantic.normalized.spec).changes).toEqual([])
  })

  it('repairs missing line paint but not invalid geometry or out-of-viewport content', () => {
    const missingStroke = approved(); delete missingStroke.primitives[1].stroke
    missingStroke.primitives[1].stroke = 'none'
    expect(analyzeScene(missingStroke).visual?.ok).toBe(false)
    expect(deterministicRepair(analyzeScene(missingStroke).normalized.spec).changes).toContainEqual(expect.objectContaining({ action: 'add-visible-stroke' }))
    const outside = approved(); outside.primitives[3].cx = 5000; outside.primitives[3].cy = 5000
    const before = analyzeScene(outside)
    expect(before.visual?.ok).toBe(false)
    expect(deterministicRepair(before.normalized.spec).changes).toEqual([])
  })

  it('uses a stable attempt id and separate input/output hashes', () => {
    const inputHash = hashValue('input')
    const record = attemptRecord({ caseId: 'c', candidateId: 'cand', inputHash, outputHash: hashValue('output'), analysis: analyzeScene(approved()), finalStatus: 'strict-valid' })
    expect(record.attemptId).toHaveLength(24)
    expect(record.inputHash).not.toBe(record.outputHash)
    expect(attemptRecord({ caseId: 'c', candidateId: 'cand', inputHash, outputHash: hashValue('output'), analysis: analyzeScene(approved()), finalStatus: 'strict-valid' }).attemptId).toBe(record.attemptId)
  })
})
