/**
 * A conversation chooses its Learning Project; it is not given one.
 *
 * Before this, the runtime had no idea what a conversation was doing, so it
 * guessed — "the learner's most recently updated course" — and a brand-new chat
 * opened onto whatever they had last touched. These tests pin the replacement
 * at the seams a caller actually uses: state, the HTTP API, and the tools.
 *
 * The two halves of the model, which the tests keep apart on purpose:
 *
 *   learner-level    the projects, their maps, evidence and lessons — shared
 *   conversation     which project is open, the focus, the decision, the handoff
 */

import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const NOW = '2026-01-01T00:00:00.000Z'
const A = 'session-a'
const B = 'session-b'

interface Wired {
  tool(name: string, args: Record<string, unknown>, as?: string): Promise<Record<string, unknown>>
  api(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ status: number; json: Record<string, unknown> }>
}

function wire(harness: TestHarness, state: UdState): Wired {
  const registered = new Map<string, { execute: (a: unknown, e: unknown) => Promise<unknown> }>()
  const host: ToolsHost = {
    tools: {
      register(definition) {
        registered.set(definition.name, definition as never)
        return () => {}
      },
    },
  }
  registerTools(host, state)
  const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: true }) }))

  return {
    async tool(name, args, as = A) {
      const definition = registered.get(name)
      if (!definition) throw new Error(`tool "${name}" is not registered`)
      return (await definition.execute(args, { agent: { id: as } })) as Record<string, unknown>
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

/** Two historical projects, as a learner who has used this before would have. */
async function seeded(): Promise<{ harness: TestHarness; state: UdState; wired: Wired }> {
  const harness = await createHarness()
  const state = await openUdState(harness.ctx.get('storageDomain')!)

  for (const [id, title, goal] of [
    ['ml', 'Machine Learning', 'learn ml'],
    ['calc', 'Calculus', 'brush up'],
  ] as const) {
    await state.writeCourse({ id, title, goal, status: 'active', createdAt: NOW, updatedAt: NOW })
    const root = newNode({ id: `${id}:goal`, courseId: id, title, relation: 'goal', now: NOW })
    await state.writeNode(root)
    for (let i = 1; i <= 2; i += 1) {
      await state.writeNode(
        newNode({
          id: `${id}:n${i}`,
          courseId: id,
          title: `${title} ${i}`,
          relation: 'part-of',
          parentId: root.id,
          now: NOW,
        }),
      )
    }
  }
  return { harness, state, wired: wire(harness, state) }
}

const libraryOf = async (wired: Wired, sessionId: string) =>
  (await wired.api(`/overview?sessionId=${sessionId}`)).json.library as { id: string; total: number }[]

describe('a fresh conversation is given nothing', () => {
  it('has no selected project even though projects exist', async () => {
    const { harness, state, wired } = await seeded()
    try {
      expect(state.listCourses()).toHaveLength(2)
      expect(state.readProject(A)).toBeUndefined()

      const view = await wired.api(`/overview?sessionId=${A}`)
      expect(view.json.course, 'a fresh session was handed a course').toBeNull()
      expect(view.json.focus).toBeNull()
      expect(view.json.nodes).toEqual([])
    } finally {
      await harness.close()
    }
  })

  it('is shown the library instead, with the projects it could open', async () => {
    const { harness, wired } = await seeded()
    try {
      const library = await libraryOf(wired, A)
      expect(library.map((c) => c.id).sort()).toEqual(['calc', 'ml'])
      // The count is the learner's progress through the project, which is
      // theirs and shared — unlike which one is open, which is not.
      expect(library.find((c) => c.id === 'ml')?.total).toBe(3)
    } finally {
      await harness.close()
    }
  })

  it('does not auto-select the most recently updated project', async () => {
    const { harness, state, wired } = await seeded()
    try {
      // Make one plainly the newest: the old fallback would have picked it.
      await state.writeCourse({
        id: 'calc',
        title: 'Calculus',
        goal: 'brush up',
        status: 'active',
        createdAt: NOW,
        updatedAt: '2026-06-01T00:00:00.000Z',
      })
      const view = await wired.api(`/overview?sessionId=${A}`)
      expect(view.json.course).toBeNull()
    } finally {
      await harness.close()
    }
  })
})

describe('two conversations hold two projects', () => {
  it('keeps each selection to itself', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })
      await wired.api('/project', { method: 'POST', body: { sessionId: B, courseId: 'calc' } })

      expect(state.readProject(A)?.courseId).toBe('ml')
      expect(state.readProject(B)?.courseId).toBe('calc')
      expect((await wired.api(`/overview?sessionId=${A}`)).json.course).toMatchObject({ id: 'ml' })
      expect((await wired.api(`/overview?sessionId=${B}`)).json.course).toMatchObject({ id: 'calc' })
    } finally {
      await harness.close()
    }
  })

  it('restores each one after switching back and forth', async () => {
    const { harness, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })
      await wired.api('/project', { method: 'POST', body: { sessionId: B, courseId: 'calc' } })

      // A -> B -> A -> B, reading each time.
      for (const [who, expected] of [[A, 'ml'], [B, 'calc'], [A, 'ml'], [B, 'calc']] as const) {
        const view = await wired.api(`/overview?sessionId=${who}`)
        expect(view.json.course, `${who} lost its project`).toMatchObject({ id: expected })
      }
    } finally {
      await harness.close()
    }
  })

  it('keeps the maps shared: both conversations see the same nodes', async () => {
    const { harness, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })
      await wired.api('/project', { method: 'POST', body: { sessionId: B, courseId: 'ml' } })

      const a = await wired.api(`/overview?sessionId=${A}`)
      const b = await wired.api(`/overview?sessionId=${B}`)
      expect(a.json.nodes).toEqual(b.json.nodes)
      expect((a.json.nodes as unknown[]).length).toBe(3)
    } finally {
      await harness.close()
    }
  })
})

describe('selecting a project does not fabricate a position', () => {
  it('leaves the conversation with no focus', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })

      const view = await wired.api(`/overview?sessionId=${A}`)
      expect(view.json.course).toMatchObject({ id: 'ml' })
      // Opening a project is not starting one.
      expect(view.json.focus, 'selecting invented a focus').toBeNull()
      expect(view.json.nextStep).toBeNull()
      expect(view.json.handoff).toBeNull()
      expect(state.readFocus(A, 'ml')).toBeUndefined()
    } finally {
      await harness.close()
    }
  })

  it('gives the project back with no focus after a switch away and back', async () => {
    const { harness, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'calc' } })
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })

      const view = await wired.api(`/overview?sessionId=${A}`)
      expect(view.json.course).toMatchObject({ id: 'ml' })
      expect(view.json.focus).toBeNull()
    } finally {
      await harness.close()
    }
  })
})

describe('starting a node chooses its project', () => {
  it('opens the course the node belongs to, not one that was already open', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })

      // The learner starts a node in the OTHER project.
      const started = await wired.api('/focus', { method: 'POST', body: { nodeId: 'calc:n1', sessionId: A } })
      expect(started.status).toBe(200)

      // The choice follows the node — that is the one direction that is not a
      // guess, because the learner just acted inside it.
      expect(state.readProject(A)?.courseId).toBe('calc')
      const view = await wired.api(`/overview?sessionId=${A}`)
      expect(view.json.course).toMatchObject({ id: 'calc' })
      expect(view.json.focus).toMatchObject({ nodeId: 'calc:n1' })
    } finally {
      await harness.close()
    }
  })
})

describe('conversations from before the table keep their project', () => {
  it('infers it from the focus they already have', async () => {
    const { harness, state, wired } = await seeded()
    try {
      // No /project call at all: a focus written directly, as an older build
      // would have left it.
      await state.startFocus('ml', 'ml:n1', NOW, B)
      expect(state.readProject(B)).toBeUndefined()

      const view = await wired.api(`/overview?sessionId=${B}`)
      expect(view.json.course, 'an existing focus did not restore its project').toMatchObject({ id: 'ml' })
      expect(view.json.focus).toMatchObject({ nodeId: 'ml:n1' })
    } finally {
      await harness.close()
    }
  })

  it('never infers a project for a conversation with no execution state', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await state.startFocus('ml', 'ml:n1', NOW, B)
      // A is untouched, so it gets the library even though a focus exists
      // elsewhere that could be borrowed.
      expect((await wired.api(`/overview?sessionId=${A}`)).json.course).toBeNull()
    } finally {
      await harness.close()
    }
  })
})

describe('"start something new" is a decision, not a blank', () => {
  it('survives the inference that would otherwise fill it in', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await state.startFocus('ml', 'ml:n1', NOW, A)
      // The learner deliberately clears the project.
      await wired.api('/project', { method: 'POST', body: { sessionId: A } })

      const view = await wired.api(`/overview?sessionId=${A}`)
      expect(view.json.course, 'the explicit empty choice was overridden').toBeNull()
      expect(view.json.focus).toBeNull()
      // And it is recorded as a choice, so it is distinguishable from never
      // having chosen.
      expect(state.readProject(A)).toBeDefined()
      expect(state.readProject(A)?.courseId).toBeUndefined()
    } finally {
      await harness.close()
    }
  })

  it('binds the project the tutor creates next', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A } })
      await wired.tool('udt_goal_create', { title: 'Linear Algebra', goal: 'start over' }, A)

      const created = state.listCourses().find((c) => c.title === 'Linear Algebra')
      expect(created, 'the tutor did not create a course').toBeDefined()
      expect(state.readProject(A)?.courseId).toBe(created?.id)

      const view = await wired.api(`/overview?sessionId=${A}`)
      expect(view.json.course).toMatchObject({ id: created?.id })
      // The historical projects are untouched and still listed.
      expect((view.json.library as { id: string }[]).map((c) => c.id)).toContain('ml')
    } finally {
      await harness.close()
    }
  })

  it('does not touch another conversation', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: B, courseId: 'calc' } })
      await wired.api('/project', { method: 'POST', body: { sessionId: A } })
      await wired.tool('udt_goal_create', { title: 'Linear Algebra', goal: 'x' }, A)

      expect(state.readProject(B)?.courseId).toBe('calc')
      expect((await wired.api(`/overview?sessionId=${B}`)).json.course).toMatchObject({ id: 'calc' })
    } finally {
      await harness.close()
    }
  })
})

describe('a caller that names no conversation selects nothing', () => {
  it('gets the library and no project', async () => {
    const { harness, wired } = await seeded()
    try {
      const view = await wired.api('/overview')
      expect(view.json.course).toBeNull()
      expect(view.json.focus).toBeNull()
      expect((view.json.library as unknown[]).length).toBe(2)
    } finally {
      await harness.close()
    }
  })

  it('is refused when it tries to choose one anyway', async () => {
    const { harness, wired } = await seeded()
    try {
      const res = await wired.api('/project', { method: 'POST', body: { courseId: 'ml' } })
      expect(res.status).toBe(400)
      expect(JSON.stringify(res.json)).toContain('missing-session-id')
    } finally {
      await harness.close()
    }
  })

  it('is refused for a project that does not exist', async () => {
    const { harness, wired } = await seeded()
    try {
      const res = await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ghost' } })
      expect(res.status).toBe(404)
    } finally {
      await harness.close()
    }
  })
})

describe('the selection is learner data like anything else', () => {
  it('travels in the export', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })
      const exported = state.exportState(NOW)
      expect(exported.projects).toHaveLength(1)
      expect(exported.projects[0]).toMatchObject({ sessionId: A, courseId: 'ml' })
    } finally {
      await harness.close()
    }
  })

  it('is cleared by a reset, leaving nothing dangling', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })
      const removed = await wired.api('/reset', { method: 'POST' })
      expect(removed.status).toBe(200)

      // No row pointing at a course that no longer exists — and no course.
      expect(state.listProjects()).toHaveLength(0)
      expect(state.listCourses()).toHaveLength(0)
      const view = await wired.api(`/overview?sessionId=${A}`)
      expect(view.json.course).toBeNull()
      expect(view.json.library).toEqual([])
    } finally {
      await harness.close()
    }
  })

  it('leaves a selection alone when a DIFFERENT conversation exports or reads', async () => {
    const { harness, state, wired } = await seeded()
    try {
      await wired.api('/project', { method: 'POST', body: { sessionId: A, courseId: 'ml' } })
      await wired.api(`/overview?sessionId=${B}`)
      await wired.api(`/overview?sessionId=${B}`)
      expect(state.readProject(A)?.courseId).toBe('ml')
    } finally {
      await harness.close()
    }
  })
})
