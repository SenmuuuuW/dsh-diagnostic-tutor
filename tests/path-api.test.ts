import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { API_PREFIX, createApiHandler } from '../src/api.js'
import { guarded } from '../src/trust-fence.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import type { CurriculumInput, GoalBrief, PathView } from '../src/path.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const COURSE = 'linear-algebra'
const SESSION = 'conversation-a'
const SECOND = 'conversation-b'
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
    outline: ['Diagnose', 'Explain', 'Check'], topics: ['vectors'], nodeIds: [],
    practice: 'Work a vector sum.', assessment: 'Explain a new vector.', minutes: { min: 20, max: 40 } }],
  edges: [], assumptions: ['Background is self-reported.'], changeReason: 'Initial assessment.',
}
class Response {
  statusCode = 200
  body = ''
  setHeader(_name: string, _value: string): void {}
  end(chunk?: string): void { if (chunk !== undefined) this.body += chunk }
  json(): Record<string, any> { return JSON.parse(this.body) as Record<string, any> }
}
function request(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): IncomingMessage {
  return {
    method, url: `${API_PREFIX}${path}`, headers: { host: '127.0.0.1:3080', ...headers },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')
    },
  } as unknown as IncomingMessage
}

describe('guarded path HTTP API', () => {
  let harness: TestHarness
  let state: UdState
  let prompts: { sessionId: string | undefined; text: string }[]
  let promptResult: { prompted: boolean; reason?: string }

  async function call(path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) {
    const res = new Response()
    const handler = guarded(createApiHandler({ state, prompt: (sessionId, text) => {
      prompts.push({ sessionId, text })
      return promptResult
    } }))
    await handler(request(path, method, body, headers), res as unknown as ServerResponse)
    return { status: res.statusCode, json: res.json() }
  }
  function identity(revision = state.readPath(COURSE)?.revision ?? 0) {
    return { courseId: COURSE, sessionId: SESSION, expectedRevision: revision }
  }
  async function saveBrief() { return call('/path/brief', 'POST', { ...identity(), brief }) }
  async function skip() { return call('/path/skip-assessment', 'POST', identity()) }
  async function accept() { return call('/path/accept', 'POST', { ...identity(), version: 1 }) }
  async function prepareAccepted() {
    expect((await saveBrief()).status).toBe(200)
    expect((await skip()).status).toBe(200)
    await state.mutatePath(COURSE, state.readPath(COURSE)!.revision, (path) => ({
      ...path, curricula: [{ ...curriculum, version: 1, briefRevision: path.briefRevision,
        assessmentRevision: path.assessmentRevision, acceptedAt: null, createdAt: NOW }],
    }))
    expect((await accept()).status).toBe(200)
  }

  beforeEach(async () => {
    harness = await createHarness()
    state = await openUdState(harness.ctx.get('storageDomain')!)
    prompts = []
    promptResult = { prompted: true }
    await state.writeCourse({ id: COURSE, title: 'Linear Algebra', goal: 'Explain least squares',
      status: 'active', createdAt: NOW, updatedAt: NOW })
    await state.writeNode(newNode({ id: `${COURSE}:goal`, courseId: COURSE,
      title: 'Linear Algebra', relation: 'goal', now: NOW }))
    await state.selectProject(SESSION, COURSE, NOW)
  })
  afterEach(async () => { await harness.close() })

  it('reads an empty path and applies brief/skip/accept with revision CAS', async () => {
    const initial = await call(`/path?courseId=${COURSE}&sessionId=${SESSION}`)
    expect(initial.status).toBe(200)
    expect(initial.json).toMatchObject({ ok: true, path: { revision: 0, curricula: [] }, run: null })
    const saved = await saveBrief()
    expect(saved.json.path).toMatchObject({ revision: 1, brief, assessment: null })
    const stale = await call('/path/brief', 'POST', { ...identity(0), brief: { ...brief, purpose: 'stale' } })
    expect(stale).toMatchObject({ status: 409, json: { error: { code: 'revision-conflict' } } })
    expect(state.readPath(COURSE)?.brief?.purpose).toBe(brief.purpose)
    const skipped = await skip()
    expect(skipped.json.path.assessment).toMatchObject({ status: 'skipped', evidence: [], sessionId: SESSION })
    expect(skipped.json.path.assessmentRevision).toBe(1)
    await state.mutatePath(COURSE, state.readPath(COURSE)!.revision, (path) => ({
      ...path, curricula: [{ ...curriculum, version: 1, briefRevision: 1,
        assessmentRevision: 1, acceptedAt: null, createdAt: NOW }],
    }))
    expect((await accept()).json.path).toMatchObject({ acceptedVersion: 1, curricula: [{ acceptedAt: expect.any(String) }] })
    expect((await call('/path/accept', 'POST', { ...identity(0), version: 1 })).status).toBe(409)
  })

  it('reserves diagnosis and plan requests, exposes prompt text, and records prompt failure', async () => {
    expect((await saveBrief()).status).toBe(200)
    promptResult = { prompted: false, reason: 'session unavailable' }
    const diagnosis = await call('/path/request', 'POST', { ...identity(), kind: 'diagnosis', operationId: 'diagnose' })
    expect(diagnosis.json).toMatchObject({ prompted: false, promptReason: 'session unavailable',
      path: { requests: [{ id: 'diagnose', prompted: false, reason: 'session unavailable' }] } })
    expect(prompts[0]).toMatchObject({ sessionId: SESSION })
    expect(prompts[0]?.text).toContain(brief.purpose)
    expect(prompts[0]?.text).toContain('udt_path_get')
    expect(prompts[0]?.text).toContain('ask_user_question')
    expect(prompts[0]?.text).toContain('Ask 1-2 key questions')
    const replay = await call('/path/request', 'POST', { ...identity(0), kind: 'diagnosis', operationId: 'diagnose' })
    expect(replay.json.prompted).toBe(false)
    expect(prompts).toHaveLength(1)
    expect((await call('/path/request', 'POST', { ...identity(), kind: 'plan', operationId: 'too-early' })).json.error.code).toBe('diagnosis-first')
    await skip()
    promptResult = { prompted: true }
    const plan = await call('/path/request', 'POST', { ...identity(), kind: 'plan', operationId: 'plan' })
    expect(plan.json).toMatchObject({ prompted: true, path: { requests: [expect.any(Object), { id: 'plan', prompted: true }] } })
    expect(prompts[1]?.text).toContain('EVERY lesson Overview')
    expect(prompts[1]?.text).toContain('draft for me to accept')
  })

  it('starts the requested lesson without a fabricated node, retries failed prompt, and isolates sessions', async () => {
    await prepareAccepted()
    await state.selectProject(SECOND, COURSE, NOW)
    promptResult = { prompted: false, reason: 'tutor busy' }
    const start = await call('/path/start', 'POST', { ...identity(), version: 1, itemId: 'vectors', operationId: 'start-1' })
    const run = (start.json as unknown as PathView).run!
    const attempt = run.attempts[0]!
    expect(start.json).toMatchObject({ prompted: false, promptReason: 'tutor busy' })
    expect(attempt).toMatchObject({ itemId: 'vectors', nodeId: null, prompted: false, status: 'requested' })
    expect(state.readFocus(SESSION, COURSE)).toBeUndefined()
    expect(state.listNodes(COURSE)).toHaveLength(1)
    expect(prompts[0]?.text).toContain(`attemptId=${attempt.id}`)
    expect(prompts[0]?.text).toContain('Lesson Overview:')
    expect(prompts[0]?.text).toContain('udt_course_run_update(action=bind-node')
    expect((await call(`/path?courseId=${COURSE}&sessionId=${SECOND}`)).json.run).toBeNull()
    promptResult = { prompted: true }
    const retried = await call('/path/start', 'POST', { ...identity(), version: 1, itemId: 'vectors', operationId: 'start-2' })
    expect(retried.json).toMatchObject({ prompted: true, run: { activeAttemptId: attempt.id,
      attempts: [{ id: attempt.id, prompted: true, nodeId: null }] } })
    expect(prompts).toHaveLength(2)
    await call('/path/start', 'POST', { ...identity(), version: 1, itemId: 'vectors', operationId: 'start-2' })
    expect(prompts).toHaveLength(2)
    expect(state.readCourseRun(COURSE, SECOND)).toBeUndefined()
  })

  it('rejects unsupported methods, routes, invalid bodies, unselected writes, and untrusted origins', async () => {
    expect((await call('/path', 'PUT')).json.error.code).toBe('method-not-allowed')
    expect((await call('/path/brief', 'GET')).status).toBe(405)
    expect((await call('/path/unknown', 'POST', identity())).json.error.code).toBe('no-such-path-route')
    expect((await call('/path/brief', 'POST', '{broken')).status).toBe(400)
    expect((await call('/path/brief', 'POST', { ...identity(), brief: {} })).status).toBe(400)
    expect((await call('/path/brief', 'POST', { ...identity(), sessionId: SECOND, brief })).json.error.code).toBe('project-selection-changed')
    expect(await call(`/path?courseId=${COURSE}`, 'GET', undefined, { origin: 'https://external.invalid' }))
      .toEqual({ status: 403, json: { ok: false, error: { code: 'forbidden' } } })
    expect(state.readPath(COURSE)).toBeUndefined()
  })

  it('reset removes paths, runs, and history from temporary persistence', async () => {
    await prepareAccepted()
    await call('/path/start', 'POST', { ...identity(), version: 1, itemId: 'vectors', operationId: 'start-1' })
    expect(state.exportState(NOW).courseRuns).toHaveLength(1)
    expect((await call('/reset', 'POST')).json).toMatchObject({ ok: true, reset: true })
    expect(state.exportState(NOW)).toMatchObject({ learningPaths: [], courseRuns: [], courses: [], nodes: [] })
    expect((await call(`/path?courseId=${COURSE}&sessionId=${SESSION}`)).status).toBe(404)
  })
})
