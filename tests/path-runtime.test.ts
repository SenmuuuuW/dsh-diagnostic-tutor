/** Planning and actual teaching stay separate across the real storage boundary. */
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LessonRecord } from '../src/lesson.js'
import {
  activeAttempt, briefReady, CurriculumInputSchema, CurriculumSchema, GoalBriefSchema,
} from '../src/path.js'
import type { Assessment, CurriculumInput, GoalBrief } from '../src/path.js'
import {
  acceptCurriculum, beginCourseItem, bindCourseNode, completeCourseItem, pathView,
  proposeCurriculum, recordCourseTeaching, reservePathRequest, saveAssessment, saveBrief, stampCoursePrompt,
} from '../src/path-runtime.js'
import type { BeginItemInput } from '../src/path-runtime.js'
import { newNode, openUdState, UDT_DOMAIN_VERSION } from '../src/state.js'
import type { Evidence, UdState } from '../src/state.js'
import { createHarness } from './harness.js'

const NOW = '2026-10-18T12:00:00.000Z'
const COURSE = 'linear-algebra'
const OTHER = 'probability'
const SESSION = 'conversation-a'
const SECOND = 'conversation-b'
const ROOT = `${COURSE}:goal`
const NODE = `${COURSE}:vectors`
const FOREIGN = `${OTHER}:goal`

function brief(patch: Partial<GoalBrief> = {}): GoalBrief {
  return {
    purpose: 'Implement and explain a least-squares solver.',
    outcomes: ['Explain a projection and solve a small least-squares problem.'],
    background: 'I have used matrices but have not checked my geometric intuition.',
    timeZone: 'America/New_York', targetDate: null, durationWeeks: null, deadline: 'none',
    weeklyMinutes: 120, sessionMinutes: 30, preferences: 'Use geometric examples.',
    ...patch,
  }
}

function curriculum(patch: Partial<CurriculumInput> = {}): CurriculumInput {
  const item = (id: string, moduleId: string) => ({
    id, moduleId, title: `Lesson ${id}`, overview: `Explain and practise ${id}.`,
    outcomes: [`Solve a new ${id} problem.`], outline: ['Diagnose', 'Explain', 'Practise', 'Check'],
    topics: [`Planned topic ${id}`], nodeIds: [], practice: 'Work a small example.',
    assessment: 'Explain the reasoning for a new example.', minutes: { min: 20, max: 40 },
  })
  return {
    title: 'From vectors to projections', summary: 'Build a solver and explain why it works.',
    modules: [
      { id: 'foundations', title: 'Foundations', overview: 'Vectors and products.', outcomes: ['Interpret vectors.'], milestone: 'Explain the geometry.' },
      { id: 'application', title: 'Application', overview: 'Apply the geometry.', outcomes: ['Implement a solver.'], milestone: 'Check a new problem.' },
    ],
    items: [item('vectors', 'foundations'), item('products', 'foundations'), item('projections', 'application')],
    edges: [
      { from: 'vectors', to: 'projections', kind: 'required' },
      { from: 'products', to: 'projections', kind: 'required' },
      // Optional review links may point back; hard prerequisites must form a DAG.
      { from: 'projections', to: 'vectors', kind: 'optional' },
    ],
    assumptions: ['The first lesson will check basic arithmetic.'], changeReason: 'Initial route.',
    ...patch,
  }
}

function assessment(state: UdState, patch: Partial<Assessment> = {}): Assessment {
  return {
    status: 'ready', summary: 'A short vector check revealed a geometric gap.',
    strengths: ['Can compute a small vector sum.'], gaps: ['Needs to interpret projection.'],
    uncertainties: ['Has not yet explained least squares.'], evidence: [{ nodeId: NODE, evidenceIndex: 0 }],
    briefRevision: state.readPath(COURSE)?.briefRevision ?? 1, sessionId: SESSION, updatedAt: NOW,
    ...patch,
  }
}

function revision(state: UdState): number {
  return state.readPath(COURSE)?.revision ?? 0
}

function beginInput(state: UdState, patch: Partial<BeginItemInput> = {}): BeginItemInput {
  return {
    courseId: COURSE, sessionId: SESSION, expectedRevision: revision(state),
    version: 1, itemId: 'vectors', operationId: 'start-vectors', ...patch,
  }
}

function lesson(nodeId = NODE, md = 'A vector records a direction and magnitude.', at = NOW): LessonRecord {
  return {
    id: `${nodeId}:lesson`, courseId: COURSE, nodeId, title: 'Vector geometry', origin: 'tutor',
    createdAt: NOW, updatedAt: at, blocks: [{ id: 'unit', type: 'text', content: { md } }],
  }
}

async function seed(state: UdState) {
  for (const id of [COURSE, OTHER]) {
    await state.writeCourse({ id, title: id, goal: `Learn ${id}`, status: 'paused', createdAt: NOW, updatedAt: NOW })
  }
  await state.writeNode(newNode({ id: ROOT, courseId: COURSE, title: 'Learn linear algebra', relation: 'goal', now: NOW }))
  await state.writeNode(newNode({
    id: NODE, courseId: COURSE, title: 'Vector geometry', relation: 'part-of', parentId: ROOT,
    evidence: [{ kind: 'diagnosis', at: NOW, note: 'Computed a sum, then could not explain its geometry.' }], now: NOW,
  }))
  await state.writeNode(newNode({ id: FOREIGN, courseId: OTHER, title: 'Learn probability', relation: 'goal', now: NOW }))
  await state.selectProject(SESSION, COURSE, NOW)
}

async function prepare(state: UdState, accept = true) {
  await saveBrief(state, COURSE, SESSION, revision(state), brief())
  await saveAssessment(state, COURSE, SESSION, revision(state), assessment(state))
  const proposed = await proposeCurriculum(state, COURSE, SESSION, revision(state), curriculum())
  return accept ? acceptCurriculum(state, COURSE, SESSION, proposed.revision, proposed.curricula.at(-1)!.version) : proposed
}

async function observe(state: UdState, nodeId: string, kind: Evidence['kind'], at: string, provenance?: { sessionId: string; attemptId: string }) {
  const node = state.readNode(nodeId)!
  const evidenceIndex = node.evidence.length
  await state.writeNode({ ...node, evidence: [...node.evidence, { kind, at, note: 'The learner explained a fresh example.', ...(provenance ?? {}) }], updatedAt: at })
  return { nodeId, evidenceIndex }
}

interface StoreDocument {
  unit: { name: string; version: number }
  tables: Record<string, Record<string, unknown>>
}

/** Open exactly one domain, with no plugin mount or connection to a live profile. */
async function storageFixture() {
  let harness = await createHarness()
  const storeRoot = harness.storeRoot
  let state = await openUdState(harness.ctx.get('storageDomain')!)
  let reopened = false
  return {
    get state() { return state },
    storeRoot,
    async reopen(rewrite?: (document: StoreDocument) => void) {
      await state.close()
      await harness.close({ keepStore: true })
      if (rewrite) {
        const file = join(storeRoot, 'udt.json')
        const document = JSON.parse(await readFile(file, 'utf8')) as StoreDocument
        rewrite(document)
        await writeFile(file, JSON.stringify(document), 'utf8')
      }
      harness = await createHarness({ storeRoot })
      reopened = true
      state = await openUdState(harness.ctx.get('storageDomain')!)
    },
    async close() {
      await state.close()
      await harness.close()
      if (reopened) {
        // A reused harness does not own the original temporary directory.
        const target = resolve(storeRoot)
        if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('udt-store-')) {
          throw new Error(`Refusing to remove a non-fixture directory: ${target}`)
        }
        await rm(target, { recursive: true, force: true })
      }
    },
  }
}

describe('GoalBrief validation', () => {
  it('accepts no deadline, real leap dates, and an exclusive duration', () => {
    expect(GoalBriefSchema.parse(brief()).targetDate).toBeNull()
    expect(GoalBriefSchema.safeParse(brief({ deadline: 'fixed', targetDate: '2028-02-29' })).success).toBe(true)
    expect(GoalBriefSchema.safeParse(brief({ deadline: 'flexible', durationWeeks: 6 })).success).toBe(true)
  })

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-01', 'not-a-date'])(
    'rejects the invalid calendar date %s through validation', (targetDate) => {
      expect(GoalBriefSchema.safeParse(brief({ deadline: 'fixed', targetDate })).success).toBe(false)
    },
  )

  it.each([
    { deadline: 'fixed', targetDate: '2028-02-29', durationWeeks: 4 },
    { deadline: 'none', targetDate: '2028-02-29' },
    { deadline: 'none', durationWeeks: 4 },
    { deadline: 'fixed' },
    { deadline: 'flexible' },
  ] as const)('rejects conflicting or hidden deadline fields: %j', (patch) => {
    expect(GoalBriefSchema.safeParse(brief(patch)).success).toBe(false)
  })

  it('keeps incomplete drafts valid while readiness requires a purpose and an outcome', () => {
    const draft = GoalBriefSchema.parse(brief({ purpose: '', outcomes: [], weeklyMinutes: null, sessionMinutes: null }))
    expect(briefReady(draft)).toBe(false)
    expect(briefReady(brief({ purpose: '   ' }))).toBe(false)
    expect(briefReady(brief())).toBe(true)
    expect(GoalBriefSchema.safeParse(brief({ timeZone: 'not/a-zone' })).success).toBe(false)
  })
})

const invalidCurricula: { name: string; make: () => CurriculumInput }[] = [
  { name: 'a required prerequisite after its target', make: () => curriculum({ edges: [{ from: 'projections', to: 'vectors', kind: 'required' }] }) },
  { name: 'a required cycle', make: () => curriculum({ edges: [{ from: 'vectors', to: 'products', kind: 'required' }, { from: 'products', to: 'vectors', kind: 'required' }] }) },
  { name: 'a required self edge', make: () => curriculum({ edges: [{ from: 'vectors', to: 'vectors', kind: 'required' }] }) },
  { name: 'an optional self edge', make: () => curriculum({ edges: [{ from: 'vectors', to: 'vectors', kind: 'optional' }] }) },
  { name: 'an unknown prerequisite', make: () => curriculum({ edges: [{ from: 'missing', to: 'vectors', kind: 'required' }] }) },
  { name: 'an unknown optional target', make: () => curriculum({ edges: [{ from: 'vectors', to: 'missing', kind: 'optional' }] }) },
  { name: 'duplicate edges with different kinds', make: () => curriculum({ edges: [{ from: 'vectors', to: 'products', kind: 'required' }, { from: 'vectors', to: 'products', kind: 'optional' }] }) },
  { name: 'duplicate lesson IDs', make: () => { const plan = curriculum(); plan.items[1]!.id = plan.items[0]!.id; return plan } },
  { name: 'duplicate module IDs', make: () => { const plan = curriculum(); plan.modules[1]!.id = plan.modules[0]!.id; return plan } },
  { name: 'an unknown module', make: () => { const plan = curriculum(); plan.items[0]!.moduleId = 'missing'; return plan } },
  { name: 'an empty module', make: () => { const plan = curriculum(); plan.items[2]!.moduleId = 'foundations'; return plan } },
]

describe.each(['proposal', 'stored version'] as const)('Curriculum validation: %s', (kind) => {
  const validate = (input: CurriculumInput) => kind === 'proposal'
    ? CurriculumInputSchema.safeParse(input)
    : CurriculumSchema.safeParse({ ...input, version: 1, briefRevision: 1, assessmentRevision: 1, createdAt: NOW, acceptedAt: null })

  it('accepts several prerequisites in recommended order and an optional review link', () => {
    expect(validate(curriculum()).success).toBe(true)
  })

  it.each(invalidCurricula)('rejects $name', ({ make }) => {
    expect(validate(make()).success).toBe(false)
  })
})

describe('planning runtime with temporary DSH storage', () => {
  let fixture: Awaited<ReturnType<typeof storageFixture>>
  let state: UdState
  beforeEach(async () => {
    fixture = await storageFixture()
    state = fixture.state
    await seed(state)
  })
  afterEach(async () => { await fixture.close() })

  describe('goal brief and initial assessment', () => {
    it('saves an incomplete draft without inventing an assessment or route', async () => {
      const result = await saveBrief(state, COURSE, SESSION, 0, brief({ purpose: '', outcomes: [], weeklyMinutes: null }))
      expect(result).toMatchObject({ revision: 1, briefRevision: 1, assessmentRevision: 0, assessment: null, curricula: [], acceptedVersion: null })
      expect(briefReady(result.brief)).toBe(false)
      expect(state.readPath(COURSE)).toEqual(result)
    })

    it('uses revision CAS and recovers after a rejected stale write', async () => {
      const first = await saveBrief(state, COURSE, SESSION, 0, brief())
      await expect(saveBrief(state, COURSE, SESSION, 0, brief({ purpose: 'A stale edit.' }))).rejects.toThrow(/revision-conflict/)
      expect(state.readPath(COURSE)).toEqual(first)
      const next = await saveBrief(state, COURSE, SESSION, first.revision, brief({ purpose: 'A fresh edit.' }))
      expect(next).toMatchObject({ revision: 2, briefRevision: 2, brief: { purpose: 'A fresh edit.' } })
    })

    it('allows only one of two concurrent edits based on the same revision', async () => {
      const results = await Promise.allSettled([
        saveBrief(state, COURSE, SESSION, 0, brief({ purpose: 'First edit.' })),
        saveBrief(state, COURSE, SESSION, 0, brief({ purpose: 'Second edit.' })),
      ])
      expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
      if (results[1]!.status === 'rejected') expect(String(results[1]!.reason)).toContain('revision-conflict')
      expect(state.readPath(COURSE)).toMatchObject({ revision: 1, briefRevision: 1, brief: { purpose: 'First edit.' } })
      await expect(saveBrief(state, COURSE, SESSION, 1, brief({ purpose: 'Retry after refreshing.' }))).resolves.toMatchObject({ revision: 2 })
    })

    it('checks a queued project choice before allowing a planning write', async () => {
      const selection = state.selectProject(SESSION, OTHER, NOW)
      const pending = saveBrief(state, COURSE, SESSION, 0, brief())
      await selection
      await expect(pending).rejects.toThrow(/project-selection-changed/)
      expect(state.readPath(COURSE)).toBeUndefined()
      await state.selectProject(SESSION, COURSE, NOW)
      await expect(saveBrief(state, COURSE, SESSION, 0, brief())).resolves.toMatchObject({ revision: 1 })
    })

    it('does not treat a self-report without actual evidence as a ready assessment', async () => {
      await saveBrief(state, COURSE, SESSION, 0, brief())
      const selfReport = assessment(state, { summary: 'The learner says vectors are easy.', strengths: ['Self-reported confidence.'], evidence: [] })
      await expect(saveAssessment(state, COURSE, SESSION, revision(state), selfReport)).rejects.toThrow(/assessment-needs-evidence/)
      expect(state.readPath(COURSE)?.assessment).toBeNull()
      await expect(saveAssessment(state, COURSE, SESSION, revision(state), { ...selfReport, status: 'in-progress' })).resolves.toMatchObject({ assessment: { status: 'in-progress' } })
      await expect(saveAssessment(state, COURSE, SESSION, revision(state), assessment(state))).resolves.toMatchObject({ assessmentRevision: 2, assessment: { status: 'ready', evidence: [{ nodeId: NODE, evidenceIndex: 0 }] } })
    })

    it.each([
      { nodeId: 'missing-node', evidenceIndex: 0 },
      { nodeId: NODE, evidenceIndex: 1 },
      { nodeId: FOREIGN, evidenceIndex: 0 },
    ])('rejects a missing or foreign observation: %j', async (ref) => {
      await saveBrief(state, COURSE, SESSION, 0, brief())
      // Give the foreign node a real observation, so project isolation is tested separately from existence.
      await observe(state, FOREIGN, 'diagnosis', NOW)
      const before = state.readPath(COURSE)
      await expect(saveAssessment(state, COURSE, SESSION, revision(state), assessment(state, { evidence: [ref] }))).rejects.toThrow(/invalid-evidence-reference/)
      expect(state.readPath(COURSE)).toEqual(before)
    })

    it('rejects assessments for an incomplete brief, stale brief, or different conversation', async () => {
      await saveBrief(state, COURSE, SESSION, 0, brief({ purpose: '', outcomes: [] }))
      await expect(saveAssessment(state, COURSE, SESSION, revision(state), assessment(state))).rejects.toThrow(/stale-assessment/)
      await saveBrief(state, COURSE, SESSION, revision(state), brief())
      for (const patch of [{ briefRevision: 1 }, { sessionId: SECOND }]) {
        await expect(saveAssessment(state, COURSE, SESSION, revision(state), assessment(state, patch))).rejects.toThrow(/stale-assessment/)
      }
      expect(state.readPath(COURSE)?.assessmentRevision).toBe(0)
    })

    it('allows skipping only with the explicit application-side allowSkip flag', async () => {
      await saveBrief(state, COURSE, SESSION, 0, brief())
      const skipped = assessment(state, { status: 'skipped', summary: 'The learner chose to start with unverified foundations.', evidence: [] })
      await expect(saveAssessment(state, COURSE, SESSION, revision(state), skipped)).rejects.toThrow(/only-the-learner-can-skip-assessment/)
      const result = await saveAssessment(state, COURSE, SESSION, revision(state), skipped, true)
      expect(result.assessment).toEqual(skipped)
      await expect(proposeCurriculum(state, COURSE, SESSION, result.revision, curriculum())).resolves.toMatchObject({ acceptedVersion: null, curricula: [{ version: 1 }] })
    })
  })

  describe('request reservations', () => {
    it('deduplicates simultaneous requests for the same operation and checks replay identity', async () => {
      await saveBrief(state, COURSE, SESSION, 0, brief())
      const input = { courseId: COURSE, sessionId: SESSION, expectedRevision: revision(state), kind: 'diagnosis' as const, operationId: 'request-race' }
      const [first, second] = await Promise.all([reservePathRequest(state, input), reservePathRequest(state, input)])
      expect([first.shouldPrompt, second.shouldPrompt]).toEqual([true, false])
      expect(first.request).toEqual(second.request)
      expect(state.readPath(COURSE)?.requests).toHaveLength(1)
      await expect(reservePathRequest(state, { ...input, kind: 'plan' })).rejects.toThrow(/operation-id-conflict/)
      await state.selectProject(SECOND, COURSE, NOW)
      await expect(reservePathRequest(state, { ...input, sessionId: SECOND })).rejects.toThrow(/operation-id-conflict/)
      await expect(reservePathRequest(state, { ...input, operationId: 'another-request' })).rejects.toThrow(/revision-conflict/)
      const contested = { ...input, expectedRevision: revision(state), operationId: 'contested-request' }
      const competing = await Promise.allSettled([
        reservePathRequest(state, contested), reservePathRequest(state, { ...contested, kind: 'plan' }),
      ])
      expect(competing.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1)
      expect(competing.filter((entry) => entry.status === 'rejected')).toHaveLength(1)
      const rejected = competing.find((entry) => entry.status === 'rejected')
      if (rejected?.status === 'rejected') expect(String(rejected.reason)).toMatch(/operation-id-conflict/)
    })
  })

  describe('route proposals and acceptance', () => {
    it('requires a ready brief and a current ready or explicitly skipped assessment', async () => {
      await expect(proposeCurriculum(state, COURSE, SESSION, 0, curriculum())).rejects.toThrow(/diagnosis-first/)
      await saveBrief(state, COURSE, SESSION, 0, brief())
      await expect(proposeCurriculum(state, COURSE, SESSION, revision(state), curriculum())).rejects.toThrow(/diagnosis-first/)
      await saveAssessment(state, COURSE, SESSION, revision(state), assessment(state, { status: 'in-progress', evidence: [] }))
      await expect(proposeCurriculum(state, COURSE, SESSION, revision(state), curriculum())).rejects.toThrow(/diagnosis-first/)
      await saveAssessment(state, COURSE, SESSION, revision(state), assessment(state))
      await saveBrief(state, COURSE, SESSION, revision(state), brief({ weeklyMinutes: 60 }))
      await expect(proposeCurriculum(state, COURSE, SESSION, revision(state), curriculum())).rejects.toThrow(/diagnosis-first/)
      expect(state.readPath(COURSE)?.curricula).toEqual([])
    })

    it('allows planned topic labels without nodes but validates every linked node in this project', async () => {
      await saveBrief(state, COURSE, SESSION, 0, brief())
      await saveAssessment(state, COURSE, SESSION, revision(state), assessment(state))
      const nodes = state.listNodes(COURSE)
      for (const nodeId of ['missing-node', FOREIGN]) {
        const plan = curriculum()
        plan.items[0]!.nodeIds = [nodeId]
        await expect(proposeCurriculum(state, COURSE, SESSION, revision(state), plan)).rejects.toThrow(/foreign-node-reference/)
      }
      const plan = curriculum()
      plan.items[0]!.nodeIds = [NODE]
      const result = await proposeCurriculum(state, COURSE, SESSION, revision(state), plan)
      expect(result).toMatchObject({ acceptedVersion: null, curricula: [{ version: 1, briefRevision: 1, assessmentRevision: 1, acceptedAt: null }] })
      expect(state.listNodes(COURSE)).toEqual(nodes)
      expect(state.readFocus(SESSION, COURSE)).toBeUndefined()
    })

    it('revalidates persisted assessment evidence and linked nodes before propose, accept, and start', async () => {
      await saveBrief(state, COURSE, SESSION, 0, brief())
      await saveAssessment(state, COURSE, SESSION, revision(state), assessment(state))
      await state.writeNode({ ...state.readNode(NODE)!, evidence: [] })
      await expect(proposeCurriculum(state, COURSE, SESSION, revision(state), curriculum())).rejects.toThrow(/invalid-evidence-reference/)
      await observe(state, NODE, 'diagnosis', NOW)
      const proposal = curriculum()
      proposal.items[0]!.nodeIds = [NODE]
      await proposeCurriculum(state, COURSE, SESSION, revision(state), proposal)
      await state.writeNode({ ...state.readNode(NODE)!, courseId: OTHER })
      await expect(acceptCurriculum(state, COURSE, SESSION, revision(state), 1)).rejects.toThrow(/invalid-evidence-reference/)
      await state.writeNode({ ...state.readNode(NODE)!, courseId: COURSE })
      await acceptCurriculum(state, COURSE, SESSION, revision(state), 1)
      await state.writeNode({ ...state.readNode(NODE)!, courseId: OTHER })
      await expect(beginCourseItem(state, beginInput(state))).rejects.toThrow(/foreign-node-reference/)
    })

    it('requires a fresh revision to accept a proposed version and preserves the first acceptance time', async () => {
      const proposed = await prepare(state, false)
      await expect(acceptCurriculum(state, COURSE, SESSION, proposed.revision - 1, 1)).rejects.toThrow(/revision-conflict/)
      await expect(acceptCurriculum(state, COURSE, SESSION, proposed.revision, 99)).rejects.toThrow(/stale-curriculum/)
      expect(state.readPath(COURSE)?.acceptedVersion).toBeNull()
      const accepted = await acceptCurriculum(state, COURSE, SESSION, proposed.revision, 1)
      expect(accepted.acceptedVersion).toBe(1)
      expect(accepted.curricula[0]!.acceptedAt).toEqual(expect.any(String))
      const again = await acceptCurriculum(state, COURSE, SESSION, accepted.revision, 1)
      expect(again.curricula[0]!.acceptedAt).toBe(accepted.curricula[0]!.acceptedAt)
    })

    it.each(['brief', 'assessment'] as const)('refuses a version based on an older %s while retaining its history', async (changed) => {
      const accepted = await prepare(state)
      const original = accepted.curricula[0]
      if (changed === 'brief') {
        await saveBrief(state, COURSE, SESSION, revision(state), brief({ purpose: 'Explain a larger solver.' }))
      } else {
        await saveAssessment(state, COURSE, SESSION, revision(state), assessment(state, { summary: 'A follow-up check changed the starting point.' }))
      }
      await expect(acceptCurriculum(state, COURSE, SESSION, revision(state), 1)).rejects.toThrow(/stale-curriculum/)
      if (changed === 'brief') await saveAssessment(state, COURSE, SESSION, revision(state), assessment(state))
      const second = await proposeCurriculum(state, COURSE, SESSION, revision(state), curriculum({ changeReason: 'Respond to the updated context.' }))
      expect(second.curricula).toHaveLength(2)
      expect(second.curricula[0]).toEqual(original)
      const current = await acceptCurriculum(state, COURSE, SESSION, second.revision, 2)
      expect(current.acceptedVersion).toBe(2)
      expect(current.curricula[0]).toEqual(original)
    })

    it('returns detached path views so browsing cannot rewrite saved planning history', async () => {
      await prepare(state)
      const view = pathView(state, COURSE, SESSION)
      view.path.brief!.purpose = 'An accidental UI mutation.'
      view.path.curricula[0]!.items[0]!.title = 'An accidental plan mutation.'
      expect(state.readPath(COURSE)?.brief?.purpose).toBe(brief().purpose)
      expect(state.readPath(COURSE)?.curricula[0]!.items[0]!.title).toBe('Lesson vectors')
      expect(view.run).toBeNull()
      expect(() => pathView(state, 'missing-project', SESSION)).toThrow(/no-such-course/)
    })
  })

  describe('beginning and continuing course items', () => {
    it('requires acceptance and a selected conversation without fabricating a knowledge node', async () => {
      await prepare(state, false)
      await expect(beginCourseItem(state, beginInput(state))).rejects.toThrow(/accept-the-current-route-before-starting/)
      expect(state.readCourseRun(COURSE, SESSION)).toBeUndefined()
      await acceptCurriculum(state, COURSE, SESSION, revision(state), 1)
      for (const sessionId of ['', 'no-project', SECOND]) {
        if (sessionId === SECOND) await state.selectProject(SECOND, OTHER, NOW)
        await expect(beginCourseItem(state, beginInput(state, { sessionId }))).rejects.toThrow(/project-unavailable|project-selection-changed|missing-session-id/)
      }
      const before = state.listNodes(COURSE)
      const result = await beginCourseItem(state, beginInput(state))
      expect(result.shouldPrompt).toBe(true)
      expect(result.attempt).toMatchObject({ version: 1, itemId: 'vectors', status: 'requested', nodeId: null, units: [], evidence: [] })
      expect(result.prompt).toContain(`attemptId=${result.attempt.id}`)
      expect(result.prompt).toContain('Lesson Overview:')
      expect(result.prompt).toContain('materially changes the route')
      expect(result.prompt).toContain('the learner must accept any proposal')
      expect(state.listNodes(COURSE)).toEqual(before)
      expect(state.readFocus(SESSION, COURSE)).toBeUndefined()
      expect(state.listLessons()).toEqual([])
    })

    it('rejects a stale path revision, nonexistent item, and a changed goal before starting', async () => {
      await prepare(state)
      await expect(beginCourseItem(state, beginInput(state, { expectedRevision: revision(state) - 1 }))).rejects.toThrow(/revision-conflict/)
      await expect(beginCourseItem(state, beginInput(state, { itemId: 'missing' }))).rejects.toThrow(/no-such-course-item/)
      await saveBrief(state, COURSE, SESSION, revision(state), brief({ weeklyMinutes: 45 }))
      await expect(beginCourseItem(state, beginInput(state))).rejects.toThrow(/stale-curriculum/)
      expect(state.readCourseRun(COURSE, SESSION)).toBeUndefined()
    })

    it('replays an operation without prompting again, even when its original path revision is stale', async () => {
      await prepare(state)
      const input = beginInput(state)
      const first = await beginCourseItem(state, input)
      await saveAssessment(state, COURSE, SESSION, revision(state), assessment(state))
      const replay = await beginCourseItem(state, input)
      expect(replay.shouldPrompt).toBe(false)
      expect(replay.attempt).toEqual(first.attempt)
      expect(replay.run.attempts).toHaveLength(1)
      await expect(beginCourseItem(state, { ...input, itemId: 'products' })).rejects.toThrow(/operation-id-conflict/)
    })

    it.each(['same operation', 'different operations'] as const)('serializes a concurrent double click with %s into one prompt and one attempt', async (kind) => {
      await prepare(state)
      const first = beginInput(state)
      const second = { ...first, operationId: kind === 'same operation' ? first.operationId : 'second-click' }
      const results = await Promise.all([beginCourseItem(state, first), beginCourseItem(state, second)])
      expect(results.map((result) => result.shouldPrompt)).toEqual([true, false])
      expect(results[0]!.attempt.id).toBe(results[1]!.attempt.id)
      expect(state.readCourseRun(COURSE, SESSION)?.attempts).toHaveLength(1)
    })

    it('remembers a suppressed double-click operation so its late replay cannot restart an earlier item', async () => {
      await prepare(state)
      const firstInput = beginInput(state)
      const suppressedInput = beginInput(state, { operationId: 'suppressed-double-click' })
      const [first, suppressed] = await Promise.all([
        beginCourseItem(state, firstInput), beginCourseItem(state, suppressedInput),
      ])
      expect(suppressed.shouldPrompt).toBe(false)
      expect(suppressed.attempt.id).toBe(first.attempt.id)
      const next = await beginCourseItem(state, beginInput(state, { itemId: 'products', operationId: 'start-next-item' }))
      const replay = await beginCourseItem(state, suppressedInput)
      expect(replay.shouldPrompt).toBe(false)
      expect(replay.attempt.id).toBe(first.attempt.id)
      expect(replay.run.activeAttemptId).toBe(next.attempt.id)
      expect(replay.run.attempts).toHaveLength(2)
    })

    it('retries a failed dispatch on the same attempt and ignores a late stamp from the earlier dispatch', async () => {
      await prepare(state)
      const firstInput = beginInput(state)
      const first = await beginCourseItem(state, firstInput)
      await stampCoursePrompt(state, firstInput, first.attempt.id, false, 'Agent was busy.')
      const retryInput = beginInput(state, { operationId: 'retry-vector-prompt' })
      const retry = await beginCourseItem(state, retryInput)
      expect(retry.shouldPrompt).toBe(true)
      expect(retry.attempt.id).toBe(first.attempt.id)
      expect(retry.attempt.operations).toEqual([firstInput.operationId, retryInput.operationId])
      await stampCoursePrompt(state, firstInput, first.attempt.id, true)
      expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.dispatchId).toBe(retryInput.operationId)
      await stampCoursePrompt(state, retryInput, retry.attempt.id, true)
      const continued = await beginCourseItem(state, beginInput(state, { operationId: 'continue-after-prompt' }))
      expect(continued.shouldPrompt).toBe(false)
      expect(continued.attempt.id).toBe(first.attempt.id)
    })

    it('keeps session attempts independent and pins an existing attempt when another route is accepted', async () => {
      await prepare(state)
      await state.selectProject(SECOND, COURSE, NOW)
      const a = await beginCourseItem(state, beginInput(state))
      const b = await beginCourseItem(state, beginInput(state, { sessionId: SECOND, operationId: 'b-start' }))
      expect(a.attempt.id).not.toBe(b.attempt.id)
      const aBefore = state.readCourseRun(COURSE, SESSION)
      const replacement = curriculum({ title: 'A revised route', changeReason: 'Add a more direct application.' })
      replacement.items[0]!.title = 'Revised first lesson'
      const proposed = await proposeCurriculum(state, COURSE, SECOND, revision(state), replacement)
      await acceptCurriculum(state, COURSE, SECOND, proposed.revision, 2)
      expect(state.readCourseRun(COURSE, SESSION)).toEqual(aBefore)
      const continued = await beginCourseItem(state, beginInput(state, { operationId: 'a-continue-old' }))
      expect(continued.attempt.id).toBe(a.attempt.id)
      expect(continued.attempt.version).toBe(1)
      expect(continued.prompt).toContain("Let's start Lesson vectors")
      const movedB = await beginCourseItem(state, beginInput(state, { sessionId: SECOND, version: 2, operationId: 'b-start-new' }))
      expect(movedB.attempt.version).toBe(2)
      expect(movedB.run.attempts[0]!.status).toBe('interrupted')
      expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.id).toBe(a.attempt.id)
      await state.selectProject('new-conversation', COURSE, NOW)
      await expect(beginCourseItem(state, beginInput(state, { sessionId: 'new-conversation', operationId: 'old-version-new-session' }))).rejects.toThrow(/accept-the-current-route-before-starting/)
    })

    it('preserves a completed attempt, its teaching, and its evidence when the learner reviews the same item', async () => {
      await prepare(state)
      const first = await beginCourseItem(state, beginInput(state))
      await bindCourseNode(state, COURSE, SESSION, first.attempt.id, NODE)
      await recordCourseTeaching(state, COURSE, SESSION, first.attempt.id, lesson())
      const ref = await observe(state, NODE, 'check', first.attempt.startedAt, { sessionId: SESSION, attemptId: first.attempt.id })
      const completed = await completeCourseItem(state, COURSE, SESSION, first.attempt.id, 'Explained the new example.', [ref])
      const history = completed.attempts[0]
      const review = await beginCourseItem(state, beginInput(state, { operationId: 'review-vectors', review: true }))
      expect(review.attempt.id).not.toBe(first.attempt.id)
      expect(review.attempt).toMatchObject({ status: 'requested', nodeId: null, units: [], evidence: [] })
      expect(review.run.attempts).toHaveLength(2)
      expect(review.run.attempts[0]).toEqual(history)
      await bindCourseNode(state, COURSE, SESSION, review.attempt.id, NODE)
      await expect(completeCourseItem(state, COURSE, SESSION, review.attempt.id, 'Reuse the earlier check.', [ref])).rejects.toThrow(/completion-needs-check-or-transfer-evidence-from-this-attempt/)
      await expect(recordCourseTeaching(state, COURSE, SESSION, first.attempt.id, lesson())).rejects.toThrow(/stale-attempt/)
    })
  })

  describe('binding and immutable teaching history', () => {
    it('binds only an existing diagnosed node in the selected project and starts only that session focus', async () => {
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      for (const nodeId of ['missing-node', FOREIGN]) {
        await expect(bindCourseNode(state, COURSE, SESSION, begun.attempt.id, nodeId)).rejects.toThrow(/bind-an-existing-diagnosed-node-in-this-project/)
      }
      expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.nodeId).toBeNull()
      await expect(bindCourseNode(state, COURSE, SESSION, '', NODE)).rejects.toThrow(/stale-attempt/)
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      expect(activeAttempt(state.readCourseRun(COURSE, SESSION))).toMatchObject({ id: begun.attempt.id, nodeId: NODE, status: 'working' })
      expect(state.readFocus(SESSION, COURSE)).toMatchObject({ nodeId: NODE, sessionId: SESSION, status: 'active' })
      expect(state.readFocus(SECOND, COURSE)).toBeUndefined()
    })

    it('requires the explicit active attempt and its bound node before recording teaching', async () => {
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      await expect(recordCourseTeaching(state, COURSE, SESSION, begun.attempt.id, lesson())).rejects.toThrow(/bind-the-node-before-writing-planned-teaching/)
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      await expect(recordCourseTeaching(state, COURSE, SESSION, '', lesson())).rejects.toThrow(/stale-attempt/)
      await expect(recordCourseTeaching(state, COURSE, SESSION, begun.attempt.id, lesson(ROOT))).rejects.toThrow(/bind-the-node-before-writing-planned-teaching/)
      await expect(recordCourseTeaching(state, COURSE, SESSION, begun.attempt.id, { ...lesson(), courseId: OTHER })).rejects.toThrow(/bind-the-node-before-writing-planned-teaching/)
      expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.units).toEqual([])
    })

    it('snapshots each write despite later replacement, another conversation, and mutation of returned data', async () => {
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      const first = lesson()
      await state.writeLesson(first)
      const written = await recordCourseTeaching(state, COURSE, SESSION, begun.attempt.id, first)
      const firstSnapshot = structuredClone(first)
      first.blocks = [{ id: 'mutated', type: 'text', content: { md: 'Caller changed its input.' } }]
      written.attempts[0]!.units[0]!.lesson.title = 'Caller changed the returned snapshot.'
      const replacement = lesson(NODE, 'A revised explanation.', '2026-10-18T12:01:00.000Z')
      await state.writeLesson(replacement)
      await recordCourseTeaching(state, COURSE, SESSION, begun.attempt.id, replacement)
      await state.selectProject(SECOND, COURSE, NOW)
      const other = await beginCourseItem(state, beginInput(state, { sessionId: SECOND, operationId: 'other-session' }))
      await bindCourseNode(state, COURSE, SECOND, other.attempt.id, NODE)
      const otherLesson = lesson(NODE, 'Teaching for another conversation.')
      await state.writeLesson(otherLesson)
      await recordCourseTeaching(state, COURSE, SECOND, other.attempt.id, otherLesson)
      const units = activeAttempt(state.readCourseRun(COURSE, SESSION))!.units
      expect(units.map((unit) => unit.lesson)).toEqual([firstSnapshot, replacement])
      expect(new Set(units.map((unit) => unit.id)).size).toBe(2)
      expect(units.map((unit) => unit.writtenAt)).toEqual([firstSnapshot.updatedAt, replacement.updatedAt])
      expect(activeAttempt(state.readCourseRun(COURSE, SECOND))?.units.map((unit) => unit.lesson)).toEqual([otherLesson])
      expect(state.lessonForNode(NODE)).toEqual(otherLesson)
    })

    it('rejects stale attempt writes after another lesson starts and rejects another session attempt ID', async () => {
      await prepare(state)
      const first = await beginCourseItem(state, beginInput(state))
      await bindCourseNode(state, COURSE, SESSION, first.attempt.id, NODE)
      await recordCourseTeaching(state, COURSE, SESSION, first.attempt.id, lesson())
      const next = await beginCourseItem(state, beginInput(state, { itemId: 'products', operationId: 'start-products' }))
      const before = state.readCourseRun(COURSE, SESSION)
      await expect(bindCourseNode(state, COURSE, SESSION, first.attempt.id, ROOT)).rejects.toThrow(/stale-attempt/)
      await expect(recordCourseTeaching(state, COURSE, SESSION, first.attempt.id, lesson())).rejects.toThrow(/stale-attempt/)
      await state.selectProject(SECOND, COURSE, NOW)
      await expect(recordCourseTeaching(state, COURSE, SECOND, next.attempt.id, lesson())).rejects.toThrow(/stale-attempt/)
      expect(state.readCourseRun(COURSE, SESSION)).toEqual(before)
      expect(state.readFocus(SESSION, COURSE)?.nodeId).toBe(NODE)
    })

    it('checks selection inside the teaching queue so a late write cannot attach to a changed project', async () => {
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      const before = state.readCourseRun(COURSE, SESSION)
      const selecting = state.selectProject(SESSION, OTHER, NOW)
      const pending = recordCourseTeaching(state, COURSE, SESSION, begun.attempt.id, lesson())
      await selecting
      await expect(pending).rejects.toThrow(/project-selection-changed/)
      expect(state.readCourseRun(COURSE, SESSION)).toEqual(before)
    })
  })

  describe('completion evidence', () => {
    it.each(['diagnosis', 'explanation', 'practice'] as const)('does not complete from %s evidence alone', async (kind) => {
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      const ref = await observe(state, NODE, kind, begun.attempt.startedAt, { sessionId: SESSION, attemptId: begun.attempt.id })
      await expect(completeCourseItem(state, COURSE, SESSION, begun.attempt.id, 'The material was presented.', [ref])).rejects.toThrow(/completion-needs-check-or-transfer-evidence-from-this-attempt/)
      expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.status).toBe('working')
    })

    it('rejects an old check, a check on a different node, a fabricated reference, and an unbound attempt', async () => {
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      const current = await observe(state, NODE, 'check', begun.attempt.startedAt)
      await expect(completeCourseItem(state, COURSE, SESSION, begun.attempt.id, 'A check exists.', [current])).rejects.toThrow(/completion-needs-check-or-transfer-evidence-from-this-attempt/)
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      const old = await observe(state, NODE, 'check', new Date(Date.parse(begun.attempt.startedAt) - 1).toISOString())
      const other = await observe(state, ROOT, 'transfer', begun.attempt.startedAt)
      for (const ref of [old, other]) {
        await expect(completeCourseItem(state, COURSE, SESSION, begun.attempt.id, 'A different check exists.', [ref])).rejects.toThrow(/completion-needs-check-or-transfer-evidence-from-this-attempt/)
      }
      await expect(completeCourseItem(state, COURSE, SESSION, begun.attempt.id, 'A fabricated check.', [{ nodeId: NODE, evidenceIndex: 999 }])).rejects.toThrow(/invalid-evidence-reference/)
    })

    it('requires nonempty evidence and an observed reason without modifying the attempt', async () => {
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      const ref = await observe(state, NODE, 'check', begun.attempt.startedAt)
      const before = state.readCourseRun(COURSE, SESSION)
      await expect(completeCourseItem(state, COURSE, SESSION, begun.attempt.id, 'Observed a check.', [])).rejects.toThrow()
      for (const reason of ['   ', 'x'.repeat(2001)]) {
        await expect(completeCourseItem(state, COURSE, SESSION, begun.attempt.id, reason, [ref])).rejects.toThrow(/completion-needs-an-observed-reason/)
      }
      expect(state.readCourseRun(COURSE, SESSION)).toEqual(before)
    })

    it.each(['check', 'transfer'] as const)('completes with an actual %s from this attempt without assigning mastery or starting the next item', async (kind) => {
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      const ref = await observe(state, NODE, kind, begun.attempt.startedAt, { sessionId: SESSION, attemptId: begun.attempt.id })
      const nodeBefore = state.readNode(NODE)
      const completed = await completeCourseItem(state, COURSE, SESSION, begun.attempt.id, 'Explained the geometry in a new example.', [ref])
      expect(completed.attempts).toHaveLength(1)
      expect(completed.activeAttemptId).toBe(begun.attempt.id)
      expect(completed.attempts[0]).toMatchObject({ status: 'completed', evidence: [ref], outcome: 'Explained the geometry in a new example.' })
      expect(state.readNode(NODE)).toEqual(nodeBefore)
      expect(state.readFocus(SESSION, COURSE)?.nodeId).toBe(NODE)
      await expect(completeCourseItem(state, COURSE, SESSION, begun.attempt.id, 'Complete again.', [ref])).rejects.toThrow(/stale-attempt/)
    })
  })

  describe('persistence, export, and reset', () => {
    it('exports complete planning and per-session teaching history and reopens the same v1 storage', async () => {
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      await recordCourseTeaching(state, COURSE, SESSION, begun.attempt.id, lesson())
      const ref = await observe(state, NODE, 'transfer', begun.attempt.startedAt, { sessionId: SESSION, attemptId: begun.attempt.id })
      await completeCourseItem(state, COURSE, SESSION, begun.attempt.id, 'Transferred to a fresh example.', [ref])
      await state.selectProject(SECOND, COURSE, NOW)
      await beginCourseItem(state, beginInput(state, { sessionId: SECOND, operationId: 'second-session' }))
      const exported = state.exportState(NOW)
      expect(exported.learningPaths).toEqual([state.readPath(COURSE)])
      expect(exported.courseRuns).toHaveLength(2)
      expect(exported.courseRuns[0]!.attempts[0]!.units[0]!.lesson).toEqual(lesson())
      expect(JSON.parse(JSON.stringify(exported))).toEqual(exported)
      const original = structuredClone(exported)
      exported.learningPaths[0]!.curricula[0]!.title = 'Export consumer mutation.'
      exported.courseRuns[0]!.attempts[0]!.units[0]!.lesson.title = 'Export consumer mutation.'
      expect(state.exportState(NOW)).toEqual(original)
      await fixture.reopen()
      state = fixture.state
      expect(state.version).toBe(1)
      expect(state.exportState(NOW)).toEqual(original)
      const disk = JSON.parse(await readFile(join(fixture.storeRoot, 'udt.json'), 'utf8')) as StoreDocument
      expect(disk.unit.version).toBe(UDT_DOMAIN_VERSION)
      expect(Object.keys(disk.tables.learning_paths!)).toEqual([COURSE])
      expect(Object.keys(disk.tables.course_runs!)).toHaveLength(2)
    })

    it('opens an old v1 file without additive planning tables and then persists new plans on reopening', async () => {
      const oldNodes = state.listNodes(COURSE)
      await fixture.reopen((document) => {
        expect(document.unit.version).toBe(1)
        delete document.tables.learning_paths
        delete document.tables.course_runs
      })
      state = fixture.state
      expect(state.listNodes(COURSE)).toEqual(oldNodes)
      expect(state.readPath(COURSE)).toBeUndefined()
      expect(state.readCourseRun(COURSE, SESSION)).toBeUndefined()
      expect(state.exportState(NOW)).toMatchObject({ learningPaths: [], courseRuns: [] })
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      const before = state.exportState(NOW)
      await fixture.reopen()
      state = fixture.state
      expect(state.exportState(NOW)).toEqual(before)
      expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.id).toBe(begun.attempt.id)
    })

    it('reset deletes plans and every session run durably, including teaching snapshots', async () => {
      await state.ensureLearner(NOW)
      expect(state.isInitialized()).toBe(true)
      await prepare(state)
      const begun = await beginCourseItem(state, beginInput(state))
      await bindCourseNode(state, COURSE, SESSION, begun.attempt.id, NODE)
      await recordCourseTeaching(state, COURSE, SESSION, begun.attempt.id, lesson())
      await state.selectProject(SECOND, COURSE, NOW)
      await beginCourseItem(state, beginInput(state, { sessionId: SECOND, operationId: 'b-start' }))
      await state.resetState(NOW)
      expect(state.exportState(NOW)).toMatchObject({ courses: [], nodes: [], learningPaths: [], courseRuns: [], projects: [] })
      expect(state.readPath(COURSE)).toBeUndefined()
      expect(state.readCourseRun(COURSE, SESSION)).toBeUndefined()
      expect(state.readCourseRun(COURSE, SECOND)).toBeUndefined()
      expect(state.isInitialized()).toBe(false)
      await fixture.reopen()
      state = fixture.state
      expect(state.exportState(NOW)).toMatchObject({ learningPaths: [], courseRuns: [], courses: [], nodes: [] })
      await seed(state)
      await expect(saveBrief(state, COURSE, SESSION, 0, brief())).resolves.toMatchObject({ revision: 1, briefRevision: 1 })
    })

    it('invalidates queued planning and run writes captured before reset so they cannot resurrect deleted history', async () => {
      await prepare(state)
      const pendingBrief = saveBrief(state, COURSE, SESSION, revision(state), brief({ purpose: 'A late edit.' }))
      const pendingRun = beginCourseItem(state, beginInput(state))
      const reset = state.resetState(NOW)
      const results = await Promise.allSettled([pendingBrief, pendingRun, reset])
      expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected', 'fulfilled'])
      for (const result of results.slice(0, 2)) {
        if (result.status === 'rejected') expect(String(result.reason)).toContain('project-unavailable')
      }
      expect(state.exportState(NOW)).toMatchObject({ learningPaths: [], courseRuns: [], courses: [] })
      await fixture.reopen()
      state = fixture.state
      expect(state.exportState(NOW)).toMatchObject({ learningPaths: [], courseRuns: [], courses: [] })
    })
  })
})
