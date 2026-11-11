/** Candidate lifecycle: request-only model access, digest-bound human review, no evidence. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APPROVED_SCENES } from '../src/scene/approved.js'
import {
  SCENE_CANDIDATE_ENV, assertCandidateContext, attachCandidateRecord, canTransition, createCandidateRequest, listCandidates,
  readCandidate, recordGeneratedCandidate, updateCandidate,
} from '../src/scene/candidates.js'
import { sceneDigest } from '../src/scene/approval.js'

const ENV = SCENE_CANDIDATE_ENV
let dir: string; let previous: string | undefined
const request = { courseId: 'ml', sessionId: 's1', lessonId: 'lesson-1', knowledgeNodeId: 'ml:math', teachingObjective: 'Explain derivative slope geometrically', learnerDifficulty: 'Can calculate but cannot picture slope', visualizationIntent: 'Show secant approaching tangent', sourceRefs: [] }
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'udt-candidates-')); previous = process.env[ENV]; process.env[ENV] = '1'; process.env.DSH_HOME = dir; if (process.env[ENV] === undefined) delete process.env[ENV] })
afterEach(async () => { if (previous === undefined) delete process.env[ENV]; else process.env[ENV] = previous; await rm(dir, { recursive: true, force: true }) })

describe('scene candidates', () => {
  it('requires the experimental flag and is request-only', async () => {
    delete process.env[ENV]
    await expect(createCandidateRequest({ ...request, courseId: 'ml' })).rejects.toThrow(/scene-candidates-disabled/)
    process.env[ENV] = '1'
    const { candidate, duplicate } = await createCandidateRequest({ ...request })
    expect(duplicate).toBe(false)
    expect(candidate.status).toBe('requested')
    expect(await readCandidate(candidate.id)).toMatchObject({ status: 'requested', revision: 1 })
    const again = await createCandidateRequest({ ...request })
    expect(again.duplicate).toBe(true)
    expect((await listCandidates()).filter((entry) => entry.requestHash === candidate.requestHash)).toHaveLength(1)
  })

  it('records a validated scene at needs-review and enforces a digest-bound approval', async () => {
    const { candidate } = await createCandidateRequest({ ...request })
    const spec = APPROVED_SCENES[0]!.spec; const fallback = APPROVED_SCENES[0]!.fallback
    const updated = await recordGeneratedCandidate(candidate.id, { spec, fallback, contractVersion: 'v4', repairHistory: [] })
    expect(updated.status).toBe('needs-review')
    const digest = sceneDigest({ spec, fallback })!
    expect(updated.validation?.digest).toBe(digest)
    const approved = await updateCandidate(candidate.id, (current) => ({ ...current, status: 'approved', revision: current.revision + 1, review: { reviewer: 'operator', approvedAt: new Date().toISOString(), digest, warningsAcknowledged: true } }))
    const attached = await attachCandidateRecord(candidate.id, { lessonId: 'lesson-1', blockId: `scene-${candidate.id}`, attemptId: 'a1', attachedAt: new Date().toISOString() })
    expect(attached.status).toBe('attached')
    expect(canTransition('approved', 'attached')).toBe(true)
    expect(canTransition('attached', 'approved')).toBe(false)
  })

  it('rejects a changed scene whose stored digest no longer matches', async () => {
    const { candidate } = await createCandidateRequest({ ...request })
    const spec = APPROVED_SCENES[0]!.spec; const fallback = APPROVED_SCENES[0]!.fallback
    const generated = await recordGeneratedCandidate(candidate.id, { spec, fallback })
    const digest = generated.validation!.digest
    await updateCandidate(candidate.id, (current) => ({ ...current, status: 'approved', revision: current.revision + 1, generation: { ...current.generation!, fallback: fallback + ' changed' }, review: { reviewer: 'operator', approvedAt: new Date().toISOString(), digest, warningsAcknowledged: true } }))
    await expect(attachCandidateRecord(candidate.id, { lessonId: 'lesson-1', blockId: 'scene-x', attachedAt: new Date().toISOString() })).rejects.toThrow(/digest-mismatch/)
  })
})

describe('candidate security boundaries', () => {
  it('rejects a candidate from another project/node/session and a duplicate attach', async () => {
    const { candidate } = await createCandidateRequest({ ...request })
    expect(() => assertCandidateContext(candidate, { courseId: 'other', sessionId: 's1', nodeId: 'ml:math' })).toThrow(/project-mismatch/)
    expect(() => assertCandidateContext(candidate, { courseId: 'ml', sessionId: 'other', nodeId: 'ml:math' })).toThrow(/project-mismatch/)
    expect(() => assertCandidateContext(candidate, { courseId: 'ml', sessionId: 's1', nodeId: 'ml:other' })).toThrow(/node-mismatch/)
    const spec = APPROVED_SCENES[0]!.spec; const fallback = APPROVED_SCENES[0]!.fallback
    const generated = await recordGeneratedCandidate(candidate.id, { spec, fallback })
    const digest = generated.validation!.digest
    await updateCandidate(candidate.id, (current) => ({ ...current, status: 'approved', revision: current.revision + 1, review: { reviewer: 'operator', approvedAt: new Date().toISOString(), digest, warningsAcknowledged: true } }))
    await attachCandidateRecord(candidate.id, { lessonId: 'lesson-1', blockId: 'scene-one', attachedAt: new Date().toISOString() })
    await expect(attachCandidateRecord(candidate.id, { lessonId: 'lesson-1', blockId: 'scene-two', attachedAt: new Date().toISOString() })).rejects.toThrow(/not-approved|transition/)
  })
})
