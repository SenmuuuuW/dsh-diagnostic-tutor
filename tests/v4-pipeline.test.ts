/** Research v4 pipeline: strict vs normalized vs repaired and limited semantics. */
import { describe, expect, it } from 'vitest'
import { APPROVED_SCENES } from '../src/scene/approved.js'
import { analyzeScene, attemptRecord, deterministicRepair, hashValue } from '../research/dynamic-lesson-engine/v4/pipeline.mjs'

const reference = {
  kind: 'sampled-point', tolerance: 1.5,
  samples: [
    { vars: { angle: 0 }, x: 290, y: 180 },
    { vars: { angle: Math.PI / 2 }, x: 180, y: 70 },
    { vars: { angle: Math.PI }, x: 70, y: 180 },
  ],
}
function approved() { return structuredClone(APPROVED_SCENES[0]!.spec) as any }

describe('v4 pipeline', () => {
  it('keeps strict, normalized and repaired outcomes separate', () => {
    const raw = approved(); raw.primitives[6].textAnchor = 'end'; delete raw.primitives[6].anchor
    const analysis = analyzeScene(raw)
    expect(analysis.strict.ok).toBe(false)
    expect(analysis.normalization.changes).toHaveLength(1)
    expect(analysis.normalized.ok).toBe(true)
    expect(analysis.status).toBe('normalized-valid')
  })

  it('verifies a supported point-on-circle constraint and catches a flipped sine sign', () => {
    const good = analyzeScene(approved(), { reference })
    expect(good.normalized.ok).toBe(true)
    expect(good.semantic?.status).toBe('pass')
    const badRaw = approved(); badRaw.primitives[3].cy = { expr: '180 + 110*sin(angle)' }
    const bad = analyzeScene(badRaw, { reference })
    expect(bad.visual?.ok).toBe(true)
    expect(bad.semantic?.status).toBe('fail')
    expect(bad.errors).toContainEqual(expect.objectContaining({ category: 'semantic', code: 'SEMANTIC_CONSTRAINT_FAILED' }))
  })

  it('deterministically repairs a missing line stroke and revalidates', () => {
    const raw = approved(); delete raw.primitives[1].stroke
    const before = analyzeScene(raw)
    expect(before.normalized.ok).toBe(true)
    expect(before.visual?.ok).toBe(false)
    const repaired = deterministicRepair(before.normalized.spec)
    expect(repaired.changes).toContainEqual(expect.objectContaining({ action: 'add-visible-stroke' }))
    const after = analyzeScene(repaired.spec)
    expect(after.visual?.ok).toBe(true)
  })

  it('does not guess a semantic or expression repair', () => {
    const raw = approved(); raw.primitives[3].cy = { expr: '180 + 110*sin(angle)' }
    const analysis = analyzeScene(raw, { reference })
    const repaired = deterministicRepair(analysis.normalized.spec)
    expect(repaired.changes).toEqual([])
    expect(analyzeScene(repaired.spec, { reference }).semantic?.status).toBe('fail')
  })

  it('creates a stable attempt id from case/candidate/input/contract', () => {
    const hash = hashValue({ x: 1 })
    const base = { caseId: 'c', candidateId: 'cand', inputHash: hash, outputHash: hash, analysis: analyzeScene(approved()), finalStatus: undefined }
    expect(attemptRecord(base).attemptId).toBe(attemptRecord(base).attemptId)
    expect(attemptRecord({ ...base, candidateId: 'cand2' }).attemptId).not.toBe(attemptRecord(base).attemptId)
  })
})
