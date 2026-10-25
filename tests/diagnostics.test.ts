/** The health report has to reflect durable state, not a hopeful summary. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { buildDiagnostics } from '../src/diagnostics.js'
import { openJournal } from '../src/journal.js'
import type { CurriculumInput, GoalBrief } from '../src/path.js'
import {
  acceptCurriculum, beginCourseItem, proposeCurriculum, reservePathRequest, saveAssessment,
  saveBrief, stampPathRequest, stampPathRequestFailure,
} from '../src/path-runtime.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const COURSE = 'ml'
const SESSION = 'session-diagnostics'
const NOW = '2026-01-01T00:00:00.000Z'

const brief: GoalBrief = {
  purpose: 'Build a small classifier.', outcomes: ['Explain one prediction.'],
  background: 'Self-report.', timeZone: 'America/New_York', targetDate: null, durationWeeks: 2,
  deadline: 'flexible', weeklyMinutes: 120, sessionMinutes: 30, preferences: '',
}

const curriculum: CurriculumInput = {
  title: 'A route', summary: 'One lesson.', modules: [
    { id: 'm1', title: 'Module', overview: 'One module.', outcomes: ['One outcome.'], milestone: 'One milestone.' },
  ],
  items: [{
    id: 'm1-l1', moduleId: 'm1', title: 'Lesson one', overview: 'One lesson.', outcomes: ['Do one thing.'],
    outline: ['Explain', 'Check'], topics: ['topic'], nodeIds: [], practice: 'One.', assessment: 'One.',
    minutes: { min: 20, max: 30 },
  }],
  edges: [], assumptions: ['Self-report.'], changeReason: 'Initial.',
}

async function seed(state: UdState): Promise<void> {
  await state.writeCourse({ id: COURSE, title: 'Machine Learning', goal: brief.purpose, status: 'active', createdAt: NOW, updatedAt: NOW })
  await state.writeNode(newNode({ id: `${COURSE}:goal`, courseId: COURSE, title: 'Machine Learning', relation: 'goal', now: NOW }))
  await state.selectProject(SESSION, COURSE, NOW)
  await saveBrief(state, COURSE, SESSION, 0, brief)
}

describe('the diagnostics report', () => {
  let harness: TestHarness
  let state: UdState
  let journalFile: string
  let journal: ReturnType<typeof openJournal>

  beforeEach(async () => {
    harness = await createHarness()
    state = await openUdState(harness.ctx.get('storageDomain')!)
    const dir = await mkdtemp(join(tmpdir(), 'udt-diagnostics-'))
    journalFile = join(dir, 'events.jsonl')
    journal = openJournal({ file: journalFile })
    await seed(state)
  })

  afterEach(async () => {
    await harness.close()
  })

  it('reports a stale initial-diagnosis request after the grace window', async () => {
    const reserved = await reservePathRequest(state, {
      courseId: COURSE, sessionId: SESSION, expectedRevision: 1, kind: 'diagnosis', operationId: 'diag-stale',
    })
    await stampPathRequest(state, COURSE, SESSION, reserved.request.id, true)
    journal.append('path.request', { courseId: COURSE, kind: 'diagnosis', prompted: true })

    const later = new Date(Date.parse(reserved.request.createdAt) + 60 * 60_000).toISOString()
    const report = await buildDiagnostics(state, journal, { now: later, pluginVersion: 'test-version' })
    expect(report.plugin).toEqual({ name: 'dsh-diagnostic-tutor', version: 'test-version' })
    expect(report.projects).toHaveLength(1)
    expect(report.projects[0]).toMatchObject({ courseId: COURSE, stage: 'diagnosis', assessment: null, activeAttempt: null })
    expect(report.projects[0]?.requests).toMatchObject([{ kind: 'diagnosis', ageMinutes: 60, prompted: true, failure: null }])
    expect(report.issues.map((issue) => issue.code)).toContain('stale-request')
    expect(report.journal.recent.map((event) => event.event)).toContain('path.request')
  })

  it('surfaces a failed tutor turn as an error issue', async () => {
    const reserved = await reservePathRequest(state, {
      courseId: COURSE, sessionId: SESSION, expectedRevision: 1, kind: 'diagnosis', operationId: 'diag-failed',
    })
    await stampPathRequest(state, COURSE, SESSION, reserved.request.id, true)
    await stampPathRequestFailure(state, SESSION, 'OpenAI API error (403): insufficient balance')

    const report = await buildDiagnostics(state, journal)
    expect(report.projects[0]?.requests).toMatchObject([{ kind: 'diagnosis', failure: 'OpenAI API error (403): insufficient balance' }])
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'failed-turn', severity: 'error', courseId: COURSE }),
    ]))
  })

  it('shows an accepted route and a stalled first teaching attempt', async () => {
    const skipped = await saveAssessment(state, COURSE, SESSION, 1, {
      status: 'skipped', summary: 'Skipped.', strengths: [], gaps: [], uncertainties: [],
      evidence: [], briefRevision: 1, sessionId: SESSION, updatedAt: NOW,
    }, true)
    const proposed = await proposeCurriculum(state, COURSE, SESSION, skipped.revision, curriculum)
    const accepted = await acceptCurriculum(state, COURSE, SESSION, proposed.revision, 1)
    await beginCourseItem(state, {
      courseId: COURSE, sessionId: SESSION, expectedRevision: accepted.revision, version: 1,
      itemId: 'm1-l1', operationId: 'start-one',
    })

    const startedAt = state.readCourseRun(COURSE, SESSION)!.attempts[0]!.startedAt
    const report = await buildDiagnostics(state, journal, { now: new Date(Date.parse(startedAt) + 20 * 60_000).toISOString() })
    expect(report.projects[0]).toMatchObject({
      stage: 'learning', assessment: 'skipped', curricula: 1, acceptedVersion: 1,
      completedItems: 0, totalItems: 1,
    })
    expect(report.projects[0]?.activeAttempt).toMatchObject({ itemId: 'm1-l1', status: 'requested', units: 0, ageMinutes: 20 })
    expect(report.issues.map((issue) => issue.code)).toContain('stalled-attempt')
  })
})

describe('GET /diagnostics', () => {
  it('serves the report behind the trust fence, and 503 without a journal', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const dir = await mkdtemp(join(tmpdir(), 'udt-diagnostics-api-'))
      const journal = openJournal({ file: join(dir, 'events.jsonl') })
      const handler = guarded(createApiHandler({
        state,
        prompt: () => ({ prompted: true }),
        journal,
        pluginVersion: 'api-test',
      }))
      const callApi = async (url: string) => {
        const req = {
          method: 'GET',
          url: `${API_PREFIX}${url}`,
          headers: { host: '127.0.0.1:3080' },
          async *[Symbol.asyncIterator]() {},
        }
        const res = {
          statusCode: 200, headers: {} as Record<string, string>, body: '',
          setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value },
          end(chunk?: string) { if (chunk !== undefined) this.body += chunk },
        }
        await handler(req as never, res as never)
        return { status: res.statusCode, json: JSON.parse(res.body || '{}') }
      }
      const ok = await callApi('/diagnostics')
      expect(ok.status).toBe(200)
      expect(ok.json).toMatchObject({ ok: true, plugin: { version: 'api-test' }, counts: { courses: 1 } })
      await rm(dir, { recursive: true, force: true })

      const disabled = guarded(createApiHandler({ state, prompt: () => ({ prompted: true }) }))
      const res = {
        statusCode: 200, headers: {} as Record<string, string>, body: '',
        setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value },
        end(chunk?: string) { if (chunk !== undefined) this.body += chunk },
      }
      await disabled({ method: 'GET', url: `${API_PREFIX}/diagnostics`, headers: { host: '127.0.0.1:3080' }, async *[Symbol.asyncIterator]() {} } as never, res as never)
      expect(res.statusCode).toBe(503)
    } finally {
      await harness.close()
    }
  })
})
