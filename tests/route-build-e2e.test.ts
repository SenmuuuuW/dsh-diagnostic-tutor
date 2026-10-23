/**
 * Can a Learning Route be built end to end?
 *
 * One conversation walks the real path: create the goal, save the brief,
 * diagnose and record evidence, save the assessment, propose a curriculum,
 * accept it through the browser API, start the first lesson and receive
 * teaching written against that attempt. Every step uses the production
 * server-side path (tools, path runtime, HTTP routes, storage boundary); only
 * the model prompt is a capturing fake, so "the tutor was woken" is observable
 * without calling a model.
 *
 * This is the acceptance run for "建立学习路线": if it fails, a learner cannot
 * reach a route in the UI either.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import type { CurriculumInput, GoalBrief } from '../src/path.js'
import { openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const SESSION = 'session-route-build'
const NOW = '2026-02-01T12:00:00.000Z'

const brief: GoalBrief = {
  purpose: 'Be ready for AP Physics 1 problem sets in May.',
  outcomes: ['Draw and reason with a free-body diagram.', 'Solve a 2D kinematics problem unaided.'],
  background: 'Algebra is solid; calculus and trigonometry are shaky.',
  timeZone: 'America/New_York', targetDate: '2026-05-01', durationWeeks: null, deadline: 'fixed',
  weeklyMinutes: 240, sessionMinutes: 45, preferences: 'Small numeric checks after each idea.',
}

const curriculum: CurriculumInput = {
  title: 'Mechanics with a diagnostic spine',
  summary: 'Repair the maths prerequisites, then build force and motion reasoning.',
  modules: [
    { id: 'foundations', title: 'Maths foundations', overview: 'Vectors and slopes.', outcomes: ['Read a slope as a rate.'], milestone: 'Translate a graph into words.' },
    { id: 'mechanics', title: 'Motion and force', overview: 'Kinematics, then Newton.', outcomes: ['Solve one 2D motion problem.'], milestone: 'Explain a free-body diagram.' },
  ],
  items: [
    {
      id: 'vectors', moduleId: 'foundations', title: 'Vectors and components',
      overview: 'Split a vector into components and put it back together.', outcomes: ['Resolve a vector at an angle.'],
      outline: ['Diagnose', 'Explain components', 'Practise', 'Check'], topics: ['vector components'],
      nodeIds: [], practice: 'Resolve three vectors.', assessment: 'Resolve a new vector and explain why.', minutes: { min: 25, max: 40 },
    },
    {
      id: 'kinematics', moduleId: 'mechanics', title: 'Kinematics graphs',
      overview: 'Read position, velocity and acceleration from graphs.', outcomes: ['Sketch v(t) from x(t).'],
      outline: ['Diagnose', 'Explain slope', 'Practise', 'Check'], topics: ['velocity from graph'],
      nodeIds: [], practice: 'Sketch one velocity graph.', assessment: 'Explain one segment of a new graph.', minutes: { min: 30, max: 45 },
    },
    {
      id: 'newton', moduleId: 'mechanics', title: 'Newton’s second law',
      overview: 'Turn a free-body diagram into an equation.', outcomes: ['Write F = ma for a 2D case.'],
      outline: ['Diagnose', 'Explain free body', 'Practise', 'Check'], topics: ['free-body diagrams'],
      nodeIds: [], practice: 'Draw one free-body diagram.', assessment: 'Solve a new block-on-ramp case.', minutes: { min: 35, max: 55 },
    },
  ],
  edges: [
    { from: 'vectors', to: 'kinematics', kind: 'required' },
    { from: 'kinematics', to: 'newton', kind: 'required' },
  ],
  assumptions: ['The learner can rearrange a linear equation.'],
  changeReason: 'Initial route after a short diagnostic.',
}

interface Wired {
  tool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
  api(path: string, init?: { method?: string; body?: unknown }): Promise<{ status: number; json: Record<string, any> }>
}

function wire(harness: TestHarness, state: UdState, prompts: { sessionId: string; text: string }[]): Wired {
  const registered = new Map<string, { execute: (args: unknown, context: unknown) => Promise<unknown> }>()
  const host: ToolsHost = {
    tools: {
      register(definition) {
        registered.set(definition.name, definition as never)
        return () => {}
      },
    },
  }
  registerTools(host, state)
  const handler = guarded(createApiHandler({
    state,
    prompt: (sessionId: string | undefined, text: string) => {
      if (sessionId !== undefined) prompts.push({ sessionId, text })
      return { prompted: true }
    },
  }))

  return {
    async tool(name, args) {
      const definition = registered.get(name)
      if (!definition) throw new Error(`tool "${name}" is not registered`)
      return (await definition.execute(args, { agent: { id: SESSION } })) as Record<string, unknown>
    },
    async api(path, init = {}) {
      const body = init.body === undefined ? undefined : JSON.stringify(init.body)
      const req = {
        method: init.method ?? 'GET',
        url: `${API_PREFIX}${path}`,
        headers: { host: '127.0.0.1:3080' },
        async *[Symbol.asyncIterator]() {
          if (body !== undefined) yield Buffer.from(body, 'utf8')
        },
      }
      const res = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: '',
        setHeader(name: string, value: string) {
          this.headers[name.toLowerCase()] = value
        },
        end(chunk?: string) {
          if (chunk !== undefined) this.body += chunk
        },
      }
      await handler(req as never, res as never)
      return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : {} }
    },
  }
}

describe('building a learning route', () => {
  let harness: TestHarness
  let state: UdState
  let api: Wired
  let prompts: { sessionId: string; text: string }[]

  beforeEach(async () => {
    harness = await createHarness()
    state = await openUdState(harness.ctx.get('storageDomain')!)
    prompts = []
    api = wire(harness, state, prompts)
  })

  afterEach(async () => {
    await harness.close()
  })

  it('walks goal → brief → diagnosis → route → accept → first lesson through the real runtime', async () => {
    // 1. The tutor creates the project and its single goal node.
    const created = await api.tool('udt_goal_create', {
      title: 'AP Physics 1',
      goal: 'I want to be ready for AP Physics 1 problem sets in May.',
    })
    const courseId = created.courseId as string
    expect(courseId).toBe('ap-physics-1')
    expect(created.projectAdopted).toBe(true)
    expect(state.readProject(SESSION)?.courseId).toBe(courseId)

    // 2. The learner saves purpose, outcomes and budget.
    let path = await api.tool('udt_path_get', {}) as Record<string, any>
    expect(path.path).toMatchObject({ revision: 0, briefRevision: 0, brief: null })
    await api.tool('udt_path_update', { op: 'brief', expectedRevision: 0, brief })
    path = await api.tool('udt_path_get', {}) as Record<string, any>
    expect(path.path.briefRevision).toBe(1)
    expect(path.path.brief).toMatchObject({ purpose: brief.purpose, weeklyMinutes: 240 })

    // 3. A short diagnosis adds two nodes and records one observation.
    const added = await api.tool('udt_map_update', {
      op: 'add-nodes',
      nodes: [
        { title: 'Vector components', relation: 'prerequisite', parentId: created.goalNodeId },
        { title: 'Reading kinematics graphs', relation: 'prerequisite', parentId: created.goalNodeId },
      ],
    })
    const [vectorsNode] = added.addedNodeIds as string[]
    expect(vectorsNode).toBeDefined()
    await api.tool('udt_map_update', {
      op: 'add-evidence', nodeId: vectorsNode!, evidenceKind: 'diagnosis',
      evidenceNote: 'Resolved a 10 N force at 30° by guessing the cosine; no component method.',
    })

    // 4. The assessment refers to that observation, not to a self-report.
    path = await api.tool('udt_path_get', {}) as Record<string, any>
    await api.tool('udt_path_update', {
      op: 'assessment', expectedRevision: path.path.revision,
      assessment: {
        status: 'ready',
        summary: 'Motion graphs read well; vector components are guessed rather than derived.',
        strengths: ['Chooses the right graph qualitatively.'],
        gaps: ['Cannot resolve components without help.'],
        uncertainties: ['Transfer to inclined planes is untested.'],
        evidence: [{ nodeId: vectorsNode!, evidenceIndex: 0 }],
        briefRevision: path.path.briefRevision,
      },
    })

    // 5. The tutor proposes a complete, ordered route.
    path = await api.tool('udt_path_get', {}) as Record<string, any>
    await api.tool('udt_path_update', { op: 'propose', expectedRevision: path.path.revision, curriculum })

    const proposed = await api.api(`/path?courseId=${courseId}&sessionId=${SESSION}`)
    expect(proposed.status).toBe(200)
    expect(proposed.json.path.curricula).toHaveLength(1)
    expect(proposed.json.path.curricula[0]).toMatchObject({ version: 1, acceptedAt: null })
    expect(proposed.json.path.curricula[0].items.map((item: { id: string }) => item.id))
      .toEqual(['vectors', 'kinematics', 'newton'])
    expect(proposed.json.path.acceptedVersion).toBeNull()
    expect(state.readCourseRun(courseId, SESSION)).toBeUndefined()

    // 6. The learner accepts explicitly in the UI; the browser route does it.
    const accepted = await api.api('/path/accept', {
      method: 'POST',
      body: { courseId, sessionId: SESSION, expectedRevision: proposed.json.path.revision, version: 1 },
    })
    expect(accepted.status).toBe(200)
    expect(accepted.json.path.acceptedVersion).toBe(1)
    expect(accepted.json.path.curricula[0].acceptedAt).toBeTypeOf('string')
    expect(prompts).toHaveLength(0)

    // 7. Starting the first lesson creates the per-conversation run and wakes the tutor.
    const acceptedRevision = accepted.json.path.revision as number
    const started = await api.api('/path/start', {
      method: 'POST',
      body: { courseId, sessionId: SESSION, expectedRevision: acceptedRevision, version: 1, itemId: 'vectors', operationId: 'route-e2e-start' },
    })
    expect(started.status).toBe(200)
    expect(started.json.prompted).toBe(true)
    expect(prompts).toHaveLength(1)
    const attemptId = started.json.run.activeAttemptId as string
    expect(attemptId).toBeTypeOf('string')
    expect(started.json.run.attempts[0]).toMatchObject({ id: attemptId, itemId: 'vectors', status: 'requested' })

    // 8. The tutor binds the diagnostic node and writes the first unit into the plan.
    const bound = await api.tool('udt_course_run_update', { action: 'bind-node', attemptId, nodeId: vectorsNode! })
    expect(bound).toMatchObject({ ok: true })
    const lesson = await api.tool('udt_lesson_update', {
      attemptId, nodeId: vectorsNode,
      blocks: [
        { id: 'unit', type: 'text', content: { md: 'A vector is a length and a direction; resolve it before you multiply.' } },
        { id: 'check', type: 'check', content: { prompt: 'Resolve 10 N at 30° into components, and say which axis your sine belongs to.' } },
      ],
    })
    expect(lesson).toMatchObject({ addedCount: 2, blockCount: 2, mode: 'append' })

    // 9. The stored run is the record of what was taught in this conversation.
    const final = await api.tool('udt_path_get', {}) as Record<string, any>
    expect(final.run.activeAttemptId).toBe(attemptId)
    expect(final.run.attempts[0]).toMatchObject({
      id: attemptId, itemId: 'vectors', nodeId: vectorsNode, status: 'working',
    })
    expect(final.run.attempts[0].units).toHaveLength(1)
    expect(final.run.attempts[0].units[0].lesson.blocks).toHaveLength(2)

    console.log(`ROUTE BUILD OK: ${courseId} v1, ${proposed.json.path.curricula[0].items.length} lessons, accepted, attempt ${attemptId.slice(0, 12)}… with 2 blocks`)
  })
})
