import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { activeAttempt } from '../src/path.js'
import type { CurriculumInput, GoalBrief } from '../src/path.js'
import { acceptCurriculum, beginCourseItem } from '../src/path-runtime.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const COURSE = 'linear-algebra'
const SESSION = 'conversation-a'
const SECOND = 'conversation-b'
const NODE = `${COURSE}:vectors`
const NOW = '2026-10-18T12:00:00.000Z'
const brief: GoalBrief = {
  purpose: 'Implement and explain a least-squares solver.',
  outcomes: ['Explain a projection and solve a small least-squares problem.'],
  background: 'I have used matrices but have not checked my geometric intuition.',
  timeZone: 'America/New_York', targetDate: null, durationWeeks: 4, deadline: 'flexible',
  weeklyMinutes: 120, sessionMinutes: 30, preferences: 'Use geometric examples.',
}
const curriculum: CurriculumInput = {
  title: 'From vectors to projections', summary: 'Build a solver and explain why it works.',
  modules: [{ id: 'foundations', title: 'Foundations', overview: 'Vectors and products.',
    outcomes: ['Interpret vectors.'], milestone: 'Explain the geometry.' }],
  items: [{ id: 'vectors', moduleId: 'foundations', title: 'Vector geometry',
    overview: 'Explain a vector using a new example.', outcomes: ['Interpret a vector.'],
    outline: ['Diagnose', 'Explain', 'Check'], topics: ['vectors'], nodeIds: [NODE],
    practice: 'Work a vector sum.', assessment: 'Explain a new vector.', minutes: { min: 20, max: 40 } }],
  edges: [], assumptions: ['Background is self-reported.'], changeReason: 'Initial assessment.',
}

// The host registry stores definitions after erasing tool-specific result types. Its
// output schema and renderer are the native agent-loop contract, not just execute().
describe('native planning tool integration', () => {
  let harness: TestHarness
  let state: UdState
  function definition(name: string): ToolDefinition {
    const tool = harness.ctx.get('tools')?.get(name)
    if (!tool) throw new Error(`tool ${name} was not registered`)
    return tool
  }
  function parameter(name: string, key: string): unknown {
    return (definition(name).parameters.properties as Record<string, unknown> | undefined)?.[key]
  }
  async function native(name: string, args: Record<string, unknown>, sessionId = SESSION): Promise<any> {
    const tool = definition(name)
    const value = await tool.execute(args, { agent: { id: sessionId } } as never)
    expect(validateJsonSchemaValue(tool.output.schema, value), `${name} output schema`).toEqual([])
    const rendered = tool.output.render(args, value as never)
    expect(rendered).toHaveLength(1)
    if (rendered[0]?.type !== 'text') throw new Error(`${name} did not render model-visible text`)
    const parsed: unknown = JSON.parse(rendered[0].text)
    expect(parsed, `${name} model result`).toEqual(value)
    return parsed
  }
  function revision(): number { return state.readPath(COURSE)?.revision ?? 0 }
  async function prepare() {
    await native('udt_path_update', { op: 'brief', expectedRevision: revision(), brief })
    await native('udt_path_update', {
      op: 'assessment', expectedRevision: revision(),
      assessment: { status: 'ready', summary: 'Vector interpretation needs practice.',
        strengths: ['Can add vectors.'], gaps: ['Cannot explain the geometry.'],
        uncertainties: ['Transfer to projections is untested.'], evidence: [{ nodeId: NODE, evidenceIndex: 0 }],
        briefRevision: state.readPath(COURSE)!.briefRevision },
    })
    return native('udt_path_update', { op: 'propose', expectedRevision: revision(), curriculum })
  }
  async function start(sessionId: string, operationId: string) {
    const result = await beginCourseItem(state, {
      courseId: COURSE, sessionId, expectedRevision: revision(), version: 1, itemId: 'vectors', operationId,
    })
    return result.attempt.id
  }

  beforeEach(async () => {
    harness = await createHarness()
    state = await openUdState(harness.ctx.get('storageDomain')!)
    registerTools({ tools: harness.ctx.get('tools')! }, state)
    await state.writeCourse({ id: COURSE, title: 'Linear Algebra', goal: brief.purpose,
      status: 'active', createdAt: NOW, updatedAt: NOW })
    await state.writeNode(newNode({ id: `${COURSE}:goal`, courseId: COURSE,
      title: 'Linear Algebra', relation: 'goal', now: NOW }))
    await state.writeNode(newNode({ id: NODE, courseId: COURSE, title: 'Vector geometry',
      relation: 'part-of', parentId: `${COURSE}:goal`, now: NOW,
      evidence: [{ kind: 'diagnosis', at: NOW, note: 'Could add, but not interpret, two vectors.' }] }))
    await state.selectProject(SESSION, COURSE, NOW)
  })
  afterEach(async () => { await harness.close() })

  it('exposes native schemas, reads planning status before a focus, and never accepts as a model action', async () => {
    for (const name of ['udt_path_get', 'udt_path_update', 'udt_course_run_update']) {
      const tool = definition(name)
      expect(tool.output.schema).toMatchObject({ type: 'object', additionalProperties: true })
      expect(tool.output.render).toBeTypeOf('function')
    }
    expect(parameter('udt_path_update', 'op')).toMatchObject({ enum: ['brief', 'assessment', 'propose'] })
    expect(parameter('udt_course_run_update', 'action')).toMatchObject({ enum: ['bind-node', 'complete'] })
    const initial = await native('udt_path_get', {})
    expect(initial).toMatchObject({ ok: true, path: { revision: 0, curricula: [] }, run: null })
    await prepare()
    const proposal = await native('udt_path_get', {})
    expect(proposal).toMatchObject({ path: { acceptedVersion: null,
      curricula: [{ version: 1, acceptedAt: null, items: [{ id: 'vectors', nodeIds: [NODE] }] }] }, run: null })
    expect(state.readFocus(SESSION, COURSE)).toBeUndefined()
    const status = await native('udt_status', {})
    expect(status).toMatchObject({ selection: 'project', courseId: COURSE })
    expect(JSON.parse(status.learningPathContext)).toMatchObject({ tool: 'udt_path_get', acceptedVersion: null, activeAttempt: null })
    expect(status).not.toHaveProperty('focus')
    await expect(native('udt_path_update', { op: 'accept', expectedRevision: revision(), version: 1 }))
      .rejects.toThrow(/invalid|enum|accept/i)
    expect(state.readPath(COURSE)?.acceptedVersion).toBeNull()
    await acceptCurriculum(state, COURSE, SESSION, revision(), 1)
    const attemptId = await start(SESSION, 'start-model-test')
    const running = await native('udt_path_get', {})
    expect(running).toMatchObject({ run: { activeAttemptId: attemptId,
      attempts: [{ id: attemptId, nodeId: null, itemId: 'vectors' }] } })
    const statusWithRun = await native('udt_status', {})
    expect(JSON.parse(statusWithRun.learningPathContext)).toMatchObject({ activeAttempt: { id: attemptId, nodeId: null } })
    expect(statusWithRun).not.toHaveProperty('focus')
  })

  it('rejects model-only skip, stale revisions, missing conversation, and unrelated nodes', async () => {
    expect(parameter('udt_path_update', 'assessment')).toMatchObject({ type: 'object' })
    await native('udt_path_update', { op: 'brief', expectedRevision: 0, brief })
    await expect(native('udt_path_update', { op: 'brief', expectedRevision: 0, brief })).rejects.toThrow(/revision-conflict/)
    await expect(native('udt_path_update', { op: 'assessment', expectedRevision: revision(),
      assessment: { status: 'skipped', summary: 'Skip from model.', strengths: [], gaps: [], uncertainties: [],
        evidence: [], briefRevision: 1 } })).rejects.toThrow(/only-the-learner-can-skip-assessment/)
    await expect(definition('udt_path_update').execute({ op: 'brief', expectedRevision: revision(), brief }, {} as never))
      .rejects.toThrow(/planning-write-requires-a-conversation/)
    expect(state.readPath(COURSE)?.assessment).toBeNull()
    await prepareAfterBrief()
    await acceptCurriculum(state, COURSE, SESSION, revision(), 1)
    const attemptId = await start(SESSION, 'start-node')
    await expect(native('udt_course_run_update', { action: 'bind-node', attemptId, nodeId: 'ghost' }))
      .rejects.toThrow(/bind-an-existing-diagnosed-node/)
    expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.nodeId).toBeNull()
  })
  async function prepareAfterBrief() {
    await native('udt_path_update', {
      op: 'assessment', expectedRevision: revision(), assessment: { status: 'ready',
        summary: 'Checked vector reasoning.', strengths: ['Adds vectors.'], gaps: ['Geometric meaning.'],
        uncertainties: ['Projection.'], evidence: [{ nodeId: NODE, evidenceIndex: 0 }], briefRevision: 1 },
    })
    await native('udt_path_update', { op: 'propose', expectedRevision: revision(), curriculum })
  }

  it('binds a diagnosed node, snapshots planned units, and completes only with attempt evidence', async () => {
    await prepare()
    await acceptCurriculum(state, COURSE, SESSION, revision(), 1)
    const legacy = await native('udt_lesson_update', { nodeId: NODE,
      blocks: [{ id: 'legacy', type: 'text', content: { md: 'Legacy standalone lesson.' } }] })
    const original = state.readLesson(legacy.lessonId)
    const attemptId = await start(SESSION, 'start-first')
    await expect(native('udt_lesson_update', { nodeId: NODE,
      blocks: [{ id: 'missing', type: 'text', content: { md: 'Not bound.' } }] }))
      .rejects.toThrow(/planned-lesson-needs-attemptId/)
    await expect(native('udt_lesson_update', { attemptId,
      blocks: [{ id: 'missing', type: 'text', content: { md: 'Not bound.' } }] }))
      .rejects.toThrow(/bind-the-node-before-writing-planned-teaching|no nodeId given/)
    const bound = await native('udt_course_run_update', { action: 'bind-node', attemptId, nodeId: NODE })
    expect(activeAttempt(bound.run)).toMatchObject({ id: attemptId, nodeId: NODE, status: 'working' })
    expect(state.activeFocus(SESSION)?.node.id).toBe(NODE)
    const first = await native('udt_lesson_update', { attemptId,
      blocks: [{ id: 'first', type: 'text', content: { md: 'First planned unit.' } }] })
    expect(first).toMatchObject({ nodeId: NODE, blockCount: 1 })
    const second = await native('udt_lesson_update', { attemptId,
      blocks: [{ id: 'second', type: 'check', content: { prompt: 'Explain a new vector.' } }] })
    expect(second).toMatchObject({ blockCount: 2 })
    const units = activeAttempt(state.readCourseRun(COURSE, SESSION))!.units
    expect(units).toHaveLength(2)
    expect(units[0]?.lesson.blocks.map((block) => block.id)).toEqual(['first'])
    expect(units[1]?.lesson.blocks.map((block) => block.id)).toEqual(['first', 'second'])
    expect(units[0]?.lesson.id).not.toBe(original?.id)
    expect(state.readLesson(legacy.lessonId)).toEqual(original)
    await expect(native('udt_course_run_update', { action: 'complete', attemptId,
      reason: 'Old diagnosis alone is insufficient.', evidence: [{ nodeId: NODE, evidenceIndex: 0 }] }))
      .rejects.toThrow(/completion-needs-check-or-transfer-evidence-from-this-attempt/)
    const evidenceIndex = state.readNode(NODE)!.evidence.length
    await native('udt_map_update', { op: 'add-evidence', nodeId: NODE, attemptId, evidenceKind: 'check',
      at: new Date(Date.now() + 1000).toISOString(), evidenceNote: 'Explained a new vector example.' })
    const completed = await native('udt_course_run_update', { action: 'complete', attemptId,
      reason: 'Explained a fresh example in the check.', evidence: [{ nodeId: NODE, evidenceIndex }] })
    expect(activeAttempt(completed.run)).toMatchObject({ status: 'completed', outcome: 'Explained a fresh example in the check.',
      evidence: [{ nodeId: NODE, evidenceIndex }] })
    expect(state.readNode(NODE)?.state).not.toBe('confirmed')
    await expect(native('udt_lesson_update', { attemptId,
      blocks: [{ id: 'late', type: 'text', content: { md: 'Late write.' } }] })).rejects.toThrow(/stale-attempt/)
  })

  it('serializes simultaneous planned appends against the latest committed lesson', async () => {
    await prepare()
    await acceptCurriculum(state, COURSE, SESSION, revision(), 1)
    const attemptId = await start(SESSION, 'append-race')
    await native('udt_course_run_update', { action: 'bind-node', attemptId, nodeId: NODE })
    const [first, second] = await Promise.all([
      native('udt_lesson_update', { attemptId, blocks: [{ id: 'parallel-a', type: 'text', content: { md: 'First concurrent append.' } }] }),
      native('udt_lesson_update', { attemptId, blocks: [{ id: 'parallel-b', type: 'text', content: { md: 'Second concurrent append.' } }] }),
    ])
    expect([first.blockCount, second.blockCount].sort()).toEqual([1, 2])
    const units = activeAttempt(state.readCourseRun(COURSE, SESSION))!.units
    expect(units).toHaveLength(2)
    const snapshots = units.map((unit) => unit.lesson.blocks.map((block) => block.id))
    expect(snapshots.filter((blocks) => blocks.length === 1)).toHaveLength(1)
    expect(snapshots.some((blocks) => blocks.length === 2 && new Set(blocks).size === 2)).toBe(true)
  })

  it('guards a legacy lesson queued behind a course-item start', async () => {
    await prepare()
    await acceptCurriculum(state, COURSE, SESSION, revision(), 1)
    const begin = beginCourseItem(state, { courseId: COURSE, sessionId: SESSION, expectedRevision: revision(), version: 1, itemId: 'vectors', operationId: 'legacy-race-start' })
    const legacy = native('udt_lesson_update', { nodeId: NODE,
      blocks: [{ id: 'legacy-race', type: 'text', content: { md: 'Must not bypass the planned attempt.' } }] })
    const [started, attemptedLegacyWrite] = await Promise.allSettled([begin, legacy])
    expect(started.status).toBe('fulfilled')
    expect(attemptedLegacyWrite.status).toBe('rejected')
    if (attemptedLegacyWrite.status === 'rejected') expect(String(attemptedLegacyWrite.reason)).toMatch(/planned-lesson-needs-attemptId/)
    expect(state.listLessons()).toEqual([])
    expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.id).toBe(started.status === 'fulfilled' ? started.value.attempt.id : '')
  })

  it('does not let one session complete another session\'s same-node check and rejects stale evidence writes', async () => {
    await prepare()
    await acceptCurriculum(state, COURSE, SESSION, revision(), 1)
    await state.selectProject(SECOND, COURSE, NOW)
    const firstId = await start(SESSION, 'evidence-session-a')
    const secondId = await start(SECOND, 'evidence-session-b')
    await native('udt_course_run_update', { action: 'bind-node', attemptId: firstId, nodeId: NODE })
    await native('udt_course_run_update', { action: 'bind-node', attemptId: secondId, nodeId: NODE }, SECOND)
    const firstIndex = state.readNode(NODE)!.evidence.length
    await native('udt_map_update', { op: 'add-evidence', nodeId: NODE, attemptId: firstId, evidenceKind: 'check', evidenceNote: 'Conversation A answered its check.' })
    await expect(native('udt_course_run_update', { action: 'complete', attemptId: secondId,
      reason: 'Try to reuse the other session check.', evidence: [{ nodeId: NODE, evidenceIndex: firstIndex }] }, SECOND))
      .rejects.toThrow(/completion-needs-check-or-transfer-evidence-from-this-attempt/)
    const secondIndex = state.readNode(NODE)!.evidence.length
    await native('udt_map_update', { op: 'add-evidence', nodeId: NODE, attemptId: secondId, evidenceKind: 'check', evidenceNote: 'Conversation B answered its own check.' }, SECOND)
    await native('udt_course_run_update', { action: 'complete', attemptId: secondId,
      reason: 'Conversation B explained a fresh example.', evidence: [{ nodeId: NODE, evidenceIndex: secondIndex }] }, SECOND)
    const replacement = await beginCourseItem(state, { courseId: COURSE, sessionId: SESSION, expectedRevision: revision(), version: 1, itemId: 'vectors', operationId: 'review-after-evidence', review: true })
    await expect(native('udt_map_update', { op: 'add-evidence', nodeId: NODE, attemptId: firstId, evidenceKind: 'check', evidenceNote: 'Late response from old attempt.' }))
      .rejects.toThrow(/stale-attempt/)
    expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.id).toBe(replacement.attempt.id)
    expect(state.readNode(NODE)!.evidence).toHaveLength(secondIndex + 1)
    expect(state.readNode(NODE)!.evidence.slice(-2)).toEqual([
      expect.objectContaining({ sessionId: SESSION, attemptId: firstId }),
      expect.objectContaining({ sessionId: SECOND, attemptId: secondId }),
    ])
  })

  it('does not share teaching units between two sessions on the same course', async () => {
    await prepare()
    await acceptCurriculum(state, COURSE, SESSION, revision(), 1)
    await state.selectProject(SECOND, COURSE, NOW)
    const firstId = await start(SESSION, 'start-a')
    const secondId = await start(SECOND, 'start-b')
    expect(secondId).not.toBe(firstId)
    await native('udt_course_run_update', { action: 'bind-node', attemptId: firstId, nodeId: NODE })
    await native('udt_course_run_update', { action: 'bind-node', attemptId: secondId, nodeId: NODE }, SECOND)
    await native('udt_lesson_update', { attemptId: firstId,
      blocks: [{ id: 'a', type: 'text', content: { md: 'Conversation A.' } }] })
    await native('udt_lesson_update', { attemptId: secondId,
      blocks: [{ id: 'b', type: 'text', content: { md: 'Conversation B.' } }] }, SECOND)
    expect(activeAttempt(state.readCourseRun(COURSE, SESSION))?.units[0]?.lesson.blocks[0]?.id).toBe('a')
    expect(activeAttempt(state.readCourseRun(COURSE, SECOND))?.units[0]?.lesson.blocks[0]?.id).toBe('b')
    expect((await native('udt_path_get', {}, SECOND)).run.activeAttemptId).toBe(secondId)
    await expect(native('udt_course_run_update', { action: 'bind-node', attemptId: firstId, nodeId: NODE }, SECOND))
      .rejects.toThrow(/stale-attempt/)
  })
})
