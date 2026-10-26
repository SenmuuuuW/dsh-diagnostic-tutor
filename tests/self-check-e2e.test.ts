/**
 * One end-to-end self-check through the *real* plugin composition.
 *
 * `apply` is mounted with a fake web server and a fake agent registry, so the
 * test exercises the same wiring production uses: tools, path API, the local
 * journal, the diagnostics report and the doctor script. The tutor's tool calls
 * are scripted (no model), but every state transition is the production one.
 */

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { API_PREFIX, type WebServerLike } from '../src/api.js'
import * as plugin from '../src/index.js'
import { openJournal } from '../src/journal.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const execFileAsync = promisify(execFile)
const doctor = fileURLToPath(new URL('../scripts/doctor.mjs', import.meta.url))
const SESSION = 'session-self-check'

const brief = {
  purpose: 'Read one paper and explain its claim.', outcomes: ['Explain one claim from a paper.'],
  background: 'Self-report.', timeZone: 'America/New_York', targetDate: null, durationWeeks: 2,
  deadline: 'flexible', weeklyMinutes: 120, sessionMinutes: 30, preferences: '',
}

const curriculum = {
  title: 'A small, complete route',
  summary: 'Three lessons.',
  modules: [{ id: 'm1', title: 'Module', overview: 'One module.', outcomes: ['One outcome.'], milestone: 'One milestone.' }],
  items: ['One', 'Two', 'Three'].map((title, index) => ({
    id: `m1-l${index + 1}`, moduleId: 'm1', title,
    overview: `${title} overview.`, outcomes: [`After ${title}.`], outline: ['Explain', 'Check'],
    topics: [`topic ${index + 1}`], nodeIds: [], practice: 'One.', assessment: 'One.',
    minutes: { min: 20, max: 30 },
  })),
  edges: [{ from: 'm1-l1', to: 'm1-l2', kind: 'required' }],
  assumptions: ['Self-report.'], changeReason: 'Initial route.',
}

let harness: TestHarness
let journalFile: string
let handler: Parameters<WebServerLike['register']>[0]['handler']
let prompts: string[] = []
let previousJournal: string | undefined

beforeEach(async () => {
  harness = await createHarness()
  journalFile = join(harness.storeRoot, 'journal.jsonl')
  previousJournal = process.env.DSH_DIAGNOSTIC_TUTOR_EVENTS
  process.env.DSH_DIAGNOSTIC_TUTOR_EVENTS = journalFile
  prompts = []
})

afterEach(async () => {
  if (previousJournal === undefined) delete process.env.DSH_DIAGNOSTIC_TUTOR_EVENTS
  else process.env.DSH_DIAGNOSTIC_TUTOR_EVENTS = previousJournal
  await harness.close()
})

async function mount(): Promise<void> {
  await harness.ctx.plugin({
    name: 'self-check-agents',
    apply(context: any): void {
      context.provide('agents', {
        get: (id: string) => id === SESSION
          ? { followup: (message: unknown) => { prompts.push(JSON.stringify(message)) } }
          : undefined,
      })
    },
  })
  await harness.ctx.plugin({
    name: 'self-check-web-server',
    apply(context: any): void {
      context.provide('webServer', {
        register(options: { handler: Parameters<WebServerLike['register']>[0]['handler'] }) {
          handler = options.handler
          return () => {}
        },
      })
    },
  })
  await harness.ctx.plugin(plugin)
}

function tool(name: string) {
  const definition = harness.ctx.get('tools')?.get(name)
  if (!definition) throw new Error(`tool ${name} is not registered`)
  return async (args: Record<string, unknown>): Promise<Record<string, any>> =>
    (await definition.execute(args, { agent: { id: SESSION } } as never)) as Record<string, any>
}

async function api(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; json: Record<string, any> }> {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body)
  const req = {
    method: init.method ?? 'GET',
    url: `${API_PREFIX}${path}`,
    headers: { host: '127.0.0.1:3080' },
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(body, 'utf8') },
  }
  const res = {
    statusCode: 200, headers: {} as Record<string, string>, body: '',
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value },
    end(chunk?: string) { if (chunk !== undefined) this.body += chunk },
  }
  await handler(req as never, res as never)
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : {} }
}

describe('self-check: goal → diagnosis → route → first lesson → diagnostics', () => {
  it('walks the real composition and leaves a usable journal, report and doctor output', async () => {
    await mount()
    const createGoal = tool('udt_goal_create')
    const mapUpdate = tool('udt_map_update')
    const pathUpdate = tool('udt_path_update')
    const courseUpdate = tool('udt_course_run_update')
    const lessonUpdate = tool('udt_lesson_update')

    const created = await createGoal({ title: 'Self Check Astronomy', goal: brief.purpose })
    const courseId = created.courseId as string
    expect(created.projectAdopted).toBe(true)

    await pathUpdate({ op: 'brief', expectedRevision: 0, brief })
    let path = await api(`/path?courseId=${encodeURIComponent(courseId)}&sessionId=${SESSION}`)
    expect(path.status).toBe(200)

    // The learner presses "request initial diagnosis".
    const requested = await api('/path/request', {
      method: 'POST',
      body: { courseId, sessionId: SESSION, expectedRevision: path.json.path.revision, kind: 'diagnosis', operationId: 'request-diagnosis' },
    })
    expect(requested.status).toBe(200)
    expect(requested.json.prompted).toBe(true)
    expect(prompts).toHaveLength(1)

    // The tutor (scripted here) builds the map and saves the assessment.
    const nodes = await mapUpdate({
      op: 'add-nodes',
      nodes: [
        { title: 'Claim and evidence', relation: 'prerequisite', parentId: created.goalNodeId },
        { title: 'Reading a paper', relation: 'part-of', parentId: created.goalNodeId },
      ],
    })
    const nodeId = (nodes.addedNodeIds as string[])[0]!
    await mapUpdate({ op: 'add-evidence', nodeId, evidenceKind: 'diagnosis', evidenceNote: 'Could name a claim but not its evidence.' })
    path = await api(`/path?courseId=${encodeURIComponent(courseId)}&sessionId=${SESSION}`)
    await pathUpdate({
      op: 'assessment', expectedRevision: path.json.path.revision,
      assessment: {
        status: 'ready', summary: 'Can name claims; evidence is the gap.', strengths: ['Names a claim.'],
        gaps: ['Cannot cite evidence.'], uncertainties: ['Transfer untested.'],
        evidence: [{ nodeId, evidenceIndex: 0 }], briefRevision: path.json.path.briefRevision,
      },
    })
    path = await api(`/path?courseId=${encodeURIComponent(courseId)}&sessionId=${SESSION}`)
    await pathUpdate({ op: 'propose', expectedRevision: path.json.path.revision, curriculum })

    const proposed = await api(`/path?courseId=${encodeURIComponent(courseId)}&sessionId=${SESSION}`)
    expect(proposed.json.path.curricula).toHaveLength(1)
    const accepted = await api('/path/accept', {
      method: 'POST',
      body: { courseId, sessionId: SESSION, expectedRevision: proposed.json.path.revision, version: 1 },
    })
    expect(accepted.json.path.acceptedVersion).toBe(1)

    const started = await api('/path/start', {
      method: 'POST',
      body: { courseId, sessionId: SESSION, expectedRevision: accepted.json.path.revision, version: 1, itemId: 'm1-l1', operationId: 'start-lesson' },
    })
    expect(started.json.prompted).toBe(true)
    expect(prompts).toHaveLength(2)
    const attemptId = started.json.run.activeAttemptId as string
    await courseUpdate({ action: 'bind-node', attemptId, nodeId })
    await lessonUpdate({ attemptId, nodeId, blocks: [{ id: 'u1', type: 'text', content: { md: 'A claim needs evidence.' } }] })

    // Diagnostics via the real HTTP route.
    const diagnostics = await api('/diagnostics')
    expect(diagnostics.status).toBe(200)
    expect(diagnostics.json).toMatchObject({
      ok: true,
      counts: { courses: 1, learningPaths: 1, courseRuns: 1 },
      projects: [{
        courseId, stage: 'learning', assessment: 'ready', curricula: 1, acceptedVersion: 1,
        completedItems: 0, totalItems: 3,
      }],
    })
    expect(diagnostics.json.projects[0].activeAttempt).toMatchObject({ attemptId, itemId: 'm1-l1', units: 1 })
    expect(diagnostics.json.issues).toEqual([])
    expect(diagnostics.json.journal.file).toBe(journalFile)

    const journal = await openJournal({ file: journalFile }).tail(50)
    const events = journal.map((event) => event.event)
    expect(events).toContain('plugin.ready')
    expect(events).toContain('path.request')
    expect(events).toContain('path.accept-route')
    expect(events).toContain('path.start-lesson')
    expect(events).toContain('tutor.prompt')

    // Doctor reads the durable file the same way a support run would.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const { stdout } = await execFileAsync(process.execPath, [doctor, '--storage', join(harness.storeRoot, 'udt.json'), '--journal', journalFile, '--json'])
    const report = JSON.parse(stdout) as { projects: { stage: string; acceptedVersion: number; totalItems: number }[]; issues: unknown[] }
    expect(report.projects[0]).toMatchObject({ stage: 'learning', acceptedVersion: 1, totalItems: 3 })
    expect(report.issues).toEqual([])

    const journalText = await readFile(journalFile, 'utf8')
    expect(journalText).toContain('"event":"path.start-lesson"')
  })
})
