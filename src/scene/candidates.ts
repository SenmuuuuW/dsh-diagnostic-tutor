/**
 * Experimental Scene Candidate lifecycle.
 *
 * Candidates are local review artifacts, not learner evidence. They are kept in
 * a separate file under the DSH storage root so an old `udt` domain never needs
 * a migration just because generation is experimental. The model may request a
 * candidate, but only the human CLI may approve it; attaching only accepts an
 * approved, digest-matching candidate.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { validateSceneSpec } from './spec.js'
import { visualLintScene } from './visual-lint.js'
import type { VisualLintResult } from './visual-lint.js'
import { sceneDigest } from './approval.js'

export const SCENE_CANDIDATE_ENV = 'DSH_DIAGNOSTIC_TUTOR_SCENE_CANDIDATES'
export const CANDIDATE_STORE_VERSION = 1
export const CANDIDATE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type CandidateStatus =
  | 'requested' | 'generating' | 'generated' | 'validating'
  | 'needs-review' | 'approved' | 'attached' | 'rejected'
  | 'revoked' | 'failed' | 'expired' | 'cancelled'

export interface CandidateRequest {
  readonly courseId: string
  readonly sessionId: string
  readonly lessonId: string | null
  readonly knowledgeNodeId: string
  readonly teachingObjective: string
  readonly learnerDifficulty: string
  readonly visualizationIntent: string
  readonly sourceRefs: readonly { sourceId: string; locator?: string }[]
}

export interface CandidateValidation {
  readonly strictSchema: boolean
  readonly normalizedSchema: boolean
  readonly visual: VisualLintResult | null
  readonly semantic: { status: string; constraintId?: string; reason?: string } | null
  readonly digest: string
}

export interface SceneCandidateRecord {
  id: string
  requestHash: string
  request: CandidateRequest
  status: CandidateStatus
  revision: number
  createdAt: string
  updatedAt: string
  expiresAt: string
  generation?: {
    attemptId?: string
    contractVersion?: string
    spec: unknown
    fallback: string
    inputHash?: string
    outputHash?: string
    repairHistory?: unknown[]
  }
  validation?: CandidateValidation
  review?: {
    reviewer: string
    note?: string
    approvedAt: string
    digest: string
    warningsAcknowledged: boolean
  }
  attached?: { lessonId: string; blockId: string; attemptId?: string; attachedAt: string }
  failure?: string
  cancelledAt?: string
  rejectedAt?: string
  revokedAt?: string
}

interface CandidateStore { version: 1; candidates: SceneCandidateRecord[] }

export function sceneCandidateGenerationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SCENE_CANDIDATE_ENV] === '1' || env[SCENE_CANDIDATE_ENV] === 'true'
}

export function candidateStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME !== undefined && env.DSH_HOME !== '' ? env.DSH_HOME! : join(homedir(), '.dsh')
  return join(home, 'storages', 'diagnostic-tutor-scene-candidates.json')
}

function expire(record: SceneCandidateRecord, now: number): SceneCandidateRecord {
  if (['approved', 'attached', 'revoked', 'rejected', 'failed', 'expired', 'cancelled'].includes(record.status)) return record
  if (Date.parse(record.expiresAt) > now) return record
  return { ...record, status: 'expired', revision: record.revision + 1, updatedAt: new Date(now).toISOString() }
}

let writeChain: Promise<unknown> = Promise.resolve()
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = writeChain.then(work, work)
  writeChain = next.catch(() => {})
  return next
}

async function readStore(path: string): Promise<CandidateStore> {
  if (!existsSync(path)) return { version: CANDIDATE_STORE_VERSION, candidates: [] }
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    if (parsed === null || typeof parsed !== 'object') return { version: 1, candidates: [] }
    const document = parsed as { version?: unknown; candidates?: unknown }
    if (document.version !== 1 || !Array.isArray(document.candidates)) return { version: 1, candidates: [] }
    return { version: 1, candidates: document.candidates as SceneCandidateRecord[] }
  } catch { return { version: 1, candidates: [] } }
}
async function writeStore(path: string, store: CandidateStore): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
  await rename(temp, path)
}

export async function listCandidates(env: NodeJS.ProcessEnv = process.env): Promise<readonly SceneCandidateRecord[]> {
  const path = candidateStorePath(env); const store = await readStore(path); const now = Date.now()
  return store.candidates.map((record) => expire(record, now))
}
export async function readCandidate(id: string, env: NodeJS.ProcessEnv = process.env): Promise<SceneCandidateRecord | undefined> {
  return (await listCandidates(env)).find((record) => record.id === id)
}

export function requestHash(request: CandidateRequest): string {
  const canonical = {
    courseId: request.courseId, lessonId: request.lessonId, knowledgeNodeId: request.knowledgeNodeId,
    teachingObjective: request.teachingObjective.trim(), learnerDifficulty: request.learnerDifficulty.trim(),
    visualizationIntent: request.visualizationIntent.trim(),
    sourceRefs: request.sourceRefs.map((ref) => ({ sourceId: ref.sourceId, locator: ref.locator ?? null })).sort((a, b) => a.sourceId.localeCompare(b.sourceId) || String(a.locator).localeCompare(String(b.locator))),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
export function candidateIdFromHash(hash: string): string { return `scn-${hash.slice(0, 16)}` }

export async function createCandidateRequest(request: CandidateRequest, env: NodeJS.ProcessEnv = process.env): Promise<{ candidate: SceneCandidateRecord; duplicate: boolean }> {
  if (!sceneCandidateGenerationEnabled(env)) throw new Error('scene-candidates-disabled: set DSH_DIAGNOSTIC_TUTOR_SCENE_CANDIDATES=1 only for development')
  if (request.teachingObjective.trim().length < 5 || request.teachingObjective.length > 2000) throw new Error('invalid-objective')
  if (request.learnerDifficulty.length > 1000 || request.visualizationIntent.length > 1000) throw new Error('request-too-large')
  if (request.sourceRefs.length > 6) throw new Error('too-many-source-refs')
  const hash = requestHash(request); const id = candidateIdFromHash(hash)
  return serialized(async () => {
    const path = candidateStorePath(env); const store = await readStore(path); const now = Date.now()
    const current = store.candidates.map((record) => expire(record, now))
    const existing = current.find((record) => record.requestHash === hash && ['requested', 'generating', 'generated', 'validating', 'needs-review', 'approved', 'attached'].includes(record.status))
    if (existing !== undefined) return { candidate: existing, duplicate: true }
    const timestamp = new Date(now).toISOString()
    const candidate: SceneCandidateRecord = { id, requestHash: hash, request, status: 'requested', revision: 1, createdAt: timestamp, updatedAt: timestamp, expiresAt: new Date(now + CANDIDATE_TTL_MS).toISOString() }
    store.candidates = [...current, candidate]; await writeStore(path, store)
    return { candidate, duplicate: false }
  })
}

const TRANSITIONS: Record<CandidateStatus, readonly CandidateStatus[]> = {
  requested: ['generating', 'failed', 'cancelled', 'expired'],
  generating: ['generated', 'failed', 'cancelled', 'expired'],
  generated: ['validating', 'failed', 'cancelled', 'expired'],
  validating: ['needs-review', 'failed', 'cancelled', 'expired'],
  'needs-review': ['approved', 'rejected', 'failed', 'cancelled', 'expired'],
  approved: ['attached', 'revoked', 'expired'],
  attached: ['revoked'],
  rejected: [], revoked: [], failed: [], expired: [], cancelled: [],
}
export function canTransition(from: CandidateStatus, to: CandidateStatus): boolean { return TRANSITIONS[from].includes(to) }

export async function updateCandidate(id: string, change: (record: SceneCandidateRecord) => SceneCandidateRecord, env: NodeJS.ProcessEnv = process.env): Promise<SceneCandidateRecord> {
  return serialized(async () => {
    const path = candidateStorePath(env); const store = await readStore(path); const now = Date.now()
    const index = store.candidates.findIndex((record) => record.id === id)
    if (index < 0) throw new Error(`unknown-candidate: ${id}`)
    const current = expire(store.candidates[index]!, now); const next = change(current)
    if (next.revision <= current.revision) throw new Error('candidate-revision-not-advanced')
    store.candidates[index] = { ...next, updatedAt: new Date(now).toISOString() }; await writeStore(path, store)
    return next
  })
}

export async function recordGeneratedCandidate(id: string, generation: NonNullable<SceneCandidateRecord['generation']>, env: NodeJS.ProcessEnv = process.env): Promise<SceneCandidateRecord> {
  const validation = validateSceneSpec(generation.spec)
  if (!validation.ok) throw new Error('candidate-scene-invalid: ' + validation.errors.map((entry) => `${entry.path}: ${entry.message}`).join('; '))
  const visual = visualLintScene(validation.spec)
  const digest = sceneDigest({ spec: validation.spec, fallback: generation.fallback })
  if (digest === null) throw new Error('candidate-digest-unavailable')
  const now = Date.now()
  return updateCandidate(id, (current) => {
    if (!['requested', 'generating', 'failed'].includes(current.status)) throw new Error(`candidate-not-generatable from ${current.status}`)
    return { ...current, status: 'needs-review', revision: current.revision + 1, generation: { ...generation, spec: validation.spec, outputHash: digest }, validation: { strictSchema: true, normalizedSchema: true, visual, semantic: null, digest } }
  }, env)
}

export async function attachCandidateRecord(id: string, attached: NonNullable<SceneCandidateRecord['attached']>, env: NodeJS.ProcessEnv = process.env): Promise<SceneCandidateRecord> {
  return updateCandidate(id, (current) => {
    if (current.status !== 'approved') throw new Error(`candidate-not-approved: ${current.status}`)
    if (!current.generation || !current.validation || !current.review) throw new Error('candidate-content-missing')
    const liveDigest = sceneDigest({ spec: current.generation.spec, fallback: current.generation.fallback })
    if (liveDigest === null || current.validation.digest !== current.review.digest || liveDigest !== current.review.digest) throw new Error('candidate-digest-mismatch')
    if (!canTransition('approved', 'attached')) throw new Error('candidate-transition-refused')
    return { ...current, status: 'attached', revision: current.revision + 1, attached }
  }, env)
}

export function assertCandidateContext(candidate: SceneCandidateRecord, input: { courseId: string; sessionId: string; lessonId?: string | null; nodeId: string }): void {
  if (candidate.request.courseId !== input.courseId || candidate.request.sessionId !== input.sessionId) throw new Error('candidate-project-mismatch')
  if (candidate.request.knowledgeNodeId !== input.nodeId) throw new Error('candidate-node-mismatch')
  if (input.lessonId !== undefined && input.lessonId !== null && candidate.request.lessonId !== input.lessonId) throw new Error('candidate-lesson-mismatch')
}
