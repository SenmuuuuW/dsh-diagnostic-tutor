/**
 * The learning loop, end to end.
 *
 * This file drives the runtime the way the real participants do: the **tools**
 * stand in for the tutor writing teaching and recording judgement, the **API**
 * stands in for the panel reading and acting, and the **store on disk** is what
 * both of them are actually talking to.
 *
 * That combination is the thing v0.0.5 exists to prove — not that any one piece
 * works, but that a click, a teaching turn, a check and a state change form one
 * connected loop that survives a restart.
 *
 * The plugin itself is not loaded here: a storage domain can only be open once,
 * so the tests open it directly and wire both halves to the same handle.
 */

import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { MAX_BLOCKS_PER_LESSON, MAX_BLOCKS_PER_UPDATE } from '../src/lesson.js'
import * as plugin from '../src/index.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const NOW = '2026-01-01T00:00:00.000Z'

/* -------------------------------------------------------------------------- */
/* Wiring: tools + API over one state handle                                  */
/* -------------------------------------------------------------------------- */

interface Wired {
  state: UdState
  /** Invoke a tool exactly as the runtime would. */
  tool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
  /** Call the API exactly as the panel would. */
  api(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ status: number; json: Record<string, unknown> }>
  prompts: { sessionId: string | undefined; text: string }[]
}

async function wire(harness: TestHarness, state?: UdState): Promise<Wired> {
  const shared = state ?? (await openUdState(harness.ctx.get('storageDomain')!))

  const registered = new Map<string, { execute: (args: unknown, exec: unknown) => Promise<unknown> }>()
  const host: ToolsHost = {
    tools: {
      register(definition) {
        registered.set(definition.name, definition as never)
        return () => {}
      },
    },
  }
  registerTools(host, shared)

  const prompts: Wired['prompts'] = []
  const handler = guarded(
    createApiHandler({
      state: shared,
      prompt: (sessionId, text) => {
        prompts.push({ sessionId, text })
        return { prompted: true }
      },
    }),
  )

  return {
    state: shared,
    prompts,
    async tool(name, args) {
      const definition = registered.get(name)
      if (!definition) throw new Error(`tool "${name}" is not registered`)
      return (await definition.execute(args, {})) as Record<string, unknown>
    },
    async api(path, init = {}) {
      const url = `${API_PREFIX}${path}`
      const body = init.body === undefined ? undefined : JSON.stringify(init.body)
      const req = {
        method: init.method ?? 'GET',
        url,
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
      return {
        status: res.statusCode,
        json: res.body.length > 0 ? (JSON.parse(res.body) as Record<string, unknown>) : {},
      }
    },
  }
}

/** Seed a course with a goal node and one blocked prerequisite, as diagnosis would. */
async function seed(state: UdState): Promise<{ courseId: string; goalId: string; mathId: string }> {
  const courseId = 'ml'
  await state.writeCourse({
    id: courseId,
    title: 'Machine Learning',
    goal: 'Learn ML from weak math foundations',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await state.activateCourse(courseId, NOW)

  const goal = newNode({
    id: `${courseId}:goal`,
    courseId,
    title: 'Machine Learning',
    relation: 'goal',
    evidence: [{ kind: 'goal-stated', at: NOW, note: 'learn ml' }],
    now: NOW,
  })
  await state.writeNode(goal)

  const math = newNode({
    id: `${courseId}:math`,
    courseId,
    title: 'Math Foundations',
    relation: 'prerequisite',
    parentId: goal.id,
    state: 'blocked',
    evidence: [{ kind: 'diagnosis', at: NOW, readiness: 'step-down', note: 'shaky maths' }],
    now: NOW,
  })
  await state.writeNode(math)

  return { courseId, goalId: goal.id, mathId: math.id }
}

/**
 * The registry names a rejected argument's path; the tool body names it too.
 * Both forms are accepted so the assertion is about *which* block was refused,
 * not about which layer refused it.
 */
const NAMES_INDEX = /blocks?\[\d+\]/

const textBlock = (id: string, md: string) => ({ id, type: 'text', content: { md } })
const checkBlock = (id: string, prompt: string) => ({ id, type: 'check', content: { prompt } })

/* -------------------------------------------------------------------------- */
/* 1. Start learning establishes a focus                                      */
/* -------------------------------------------------------------------------- */

describe('Start learning', () => {
  it('records the focus and wakes the tutor with the node named', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)

      const { status, json } = await wired.api('/focus', {
        method: 'POST',
        body: { nodeId: mathId, sessionId: 'sess-1' },
      })

      expect(status).toBe(200)
      expect(json.prompted).toBe(true)
      expect(json.focus).toMatchObject({ nodeId: mathId, nodeTitle: 'Math Foundations' })

      // Real state, readable by both sides.
      expect(wired.state.activeFocus()?.node.id).toBe(mathId)
      expect((await wired.api('/overview')).json.focus).toMatchObject({ nodeId: mathId })

      // The tutor was told which node and asked to teach — not handed teaching.
      expect(wired.prompts).toHaveLength(1)
      expect(wired.prompts[0]?.sessionId).toBe('sess-1')
      expect(wired.prompts[0]?.text).toContain('Math Foundations')
    } finally {
      await harness.close()
    }
  })

  it('refuses to focus a node that does not exist', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const wired = await wire(harness, state)

      const { status } = await wired.api('/focus', { method: 'POST', body: { nodeId: 'ghost' } })
      expect(status).toBe(404)
      expect(wired.state.activeFocus()).toBeUndefined()
    } finally {
      await harness.close()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 2-4. The tutor writes blocks, and bad input is refused                     */
/* -------------------------------------------------------------------------- */

describe('udt_lesson_update', () => {
  it('writes blocks the panel can then read', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      // No lessonId given: it binds to the focus.
      const written = await wired.tool('udt_lesson_update', {
        blocks: [
          textBlock('intro', 'A vector is a list of numbers with a direction.'),
          {
            id: 'ex',
            type: 'example',
            content: { title: 'Two features', steps: ['x = (x1, x2)', 'w = (w1, w2)'] },
          },
          checkBlock('check', 'What is the shape of x?'),
        ],
      })

      expect(written.origin).toBe('tutor')
      expect(written.blockCount).toBe(3)
      expect(written.addedCount).toBe(3)

      // Read back through the API, which is what the surface does.
      const served = await wired.api(`/lesson?nodeId=${encodeURIComponent(mathId)}`)
      const lesson = served.json.lesson as { blocks: { type: string }[]; origin: string }
      expect(served.status).toBe(200)
      expect(lesson.origin).toBe('tutor')
      expect(lesson.blocks.map((block) => block.type)).toEqual(['text', 'example', 'check'])
    } finally {
      await harness.close()
    }
  })

  it('appends the next unit rather than replacing the lesson', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      await wired.tool('udt_lesson_update', { blocks: [textBlock('a', 'First unit.')] })
      const second = await wired.tool('udt_lesson_update', {
        blocks: [textBlock('b', 'Second unit, after the check.')],
      })

      expect(second.mode).toBe('append')
      expect(second.blockCount).toBe(2)
      const lesson = (await wired.api(`/lesson?nodeId=${mathId}`)).json.lesson as {
        blocks: { id: string }[]
      }
      expect(lesson.blocks.map((block) => block.id)).toEqual(['a', 'b'])
    } finally {
      await harness.close()
    }
  })

  it('refuses a block bound to no node, or to a node outside the course', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)

      // No focus yet and no nodeId: there is nothing to bind to.
      await expect(
        wired.tool('udt_lesson_update', { blocks: [textBlock('a', 'x')] }),
      ).rejects.toThrow(/no nodeId/)

      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })
      await expect(
        wired.tool('udt_lesson_update', { nodeId: 'ghost', blocks: [textBlock('a', 'x')] }),
      ).rejects.toThrow(/no node/)
    } finally {
      await harness.close()
    }
  })

  it('rejects malformed blocks, naming the offending one', async () => {
    // The declared `oneOf` parameter schema rejects a bad block before
    // `execute` runs, and the registry names its path. The zod pass in the
    // tool body is the second layer, for anything the DSL cannot express.
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      // An example with no steps, at index 1.
      await expect(
        wired.tool('udt_lesson_update', {
          blocks: [
            textBlock('ok', 'fine'),
            { id: 'bad', type: 'example', content: { title: 'no steps', steps: [] } },
          ],
        }),
      ).rejects.toThrow(NAMES_INDEX)

      // A type/content mismatch: `text` requires `md`.
      await expect(
        wired.tool('udt_lesson_update', {
          blocks: [{ id: 'bad', type: 'text', content: { body: 'wrong key' } }],
        }),
      ).rejects.toThrow(NAMES_INDEX)

      // Unknown block type.
      await expect(
        wired.tool('udt_lesson_update', {
          blocks: [{ id: 'bad', type: 'formula', content: { latex: 'x' } }],
        }),
      ).rejects.toThrow(NAMES_INDEX)

      // And nothing was written.
      expect(wired.state.lessonForNode(mathId)).toBeUndefined()
    } finally {
      await harness.close()
    }
  })

  it('rejects an oversized call, and an oversized lesson', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      const tooMany = Array.from({ length: MAX_BLOCKS_PER_UPDATE + 1 }, (_, index) =>
        textBlock(`b${index}`, 'x'),
      )
      await expect(wired.tool('udt_lesson_update', { blocks: tooMany })).rejects.toThrow(
        /at most 6 blocks/,
      )

      // A single block past the text ceiling is refused too.
      await expect(
        wired.tool('udt_lesson_update', {
          blocks: [textBlock('huge', 'x'.repeat(7000))],
        }),
      ).rejects.toThrow(NAMES_INDEX)

      // Fill the lesson to its ceiling, then confirm the next call is refused.
      for (let round = 0; round < MAX_BLOCKS_PER_LESSON / MAX_BLOCKS_PER_UPDATE; round += 1) {
        await wired.tool('udt_lesson_update', {
          blocks: Array.from({ length: MAX_BLOCKS_PER_UPDATE }, (_, index) =>
            textBlock(`r${round}-${index}`, 'unit'),
          ),
        })
      }
      await expect(
        wired.tool('udt_lesson_update', { blocks: [textBlock('overflow', 'x')] }),
      ).rejects.toThrow(/at most 24 blocks/)
    } finally {
      await harness.close()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 6-8. The check loop                                                        */
/* -------------------------------------------------------------------------- */

describe('the check loop', () => {
  it('records evidence and moves the state the tutor judges', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      // The learner answered; the tutor records what it observed.
      const recorded = await wired.tool('udt_map_update', {
        op: 'add-evidence',
        nodeId: mathId,
        evidenceKind: 'check',
        readiness: 'advance-with-caution',
        evidenceNote: 'Explained shapes correctly but hesitated on broadcasting.',
        state: 'checked',
      })
      expect(recorded.state).toBe('checked')
      expect(recorded.evidenceCount).toBe(2)

      // The panel sees it without being told.
      const detail = await wired.api(`/node?id=${encodeURIComponent(mathId)}`)
      const node = detail.json.node as { state: string; evidence: { kind: string }[] }
      expect(node.state).toBe('checked')
      expect(node.evidence.map((entry) => entry.kind)).toContain('check')
    } finally {
      await harness.close()
    }
  })

  it('still refuses `confirmed` without check or transfer evidence', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)

      // `explanation` is a real observation and still not enough.
      await wired.tool('udt_map_update', {
        op: 'add-evidence',
        nodeId: mathId,
        evidenceKind: 'explanation',
        state: 'explained',
      })
      await expect(
        wired.tool('udt_map_update', { op: 'set-state', nodeId: mathId, state: 'confirmed' }),
      ).rejects.toThrow(/confirmed-without-evidence/)

      // A transfer observation is enough for the runtime to permit it.
      const promoted = await wired.tool('udt_map_update', {
        op: 'add-evidence',
        nodeId: mathId,
        evidenceKind: 'transfer',
        readiness: 'advance',
        state: 'confirmed',
      })
      expect(promoted.state).toBe('confirmed')
      expect((wired.state.readNode(mathId)?.evidence ?? []).length).toBe(3)
    } finally {
      await harness.close()
    }
  })

  it('lets a newly found blocker extend the map', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)

      // Diagnosis during teaching turned up a prerequisite that was not on the
      // map. Growing it is a legal, incremental act — a prerequisite must
      // attach to a node that already exists.
      const added = await wired.tool('udt_map_update', {
        op: 'add-nodes',
        nodes: [{ title: 'Matrix shapes', relation: 'prerequisite', parentId: mathId }],
      })
      expect(added.addedNodeIds).toHaveLength(1)

      const overview = await wired.api('/overview')
      const nodes = overview.json.nodes as { title: string; state: string; parentId: string }[]
      const found = nodes.find((node) => node.title === 'Matrix shapes')
      expect(found?.state).toBe('unconfirmed')
      expect(found?.parentId).toBe(mathId)

      // And the new node carries no evidence yet, so it cannot be confirmed.
      await expect(
        wired.tool('udt_map_update', {
          op: 'set-state',
          nodeId: (added.addedNodeIds as string[])[0] as string,
          state: 'confirmed',
        }),
      ).rejects.toThrow(/confirmed-without-evidence/)
    } finally {
      await harness.close()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 9-10. Durability and residue                                               */
/* -------------------------------------------------------------------------- */

describe('durability', () => {
  it('keeps the focus, the lesson and the evidence across a restart', async () => {
    const first = await createHarness()
    const storeRoot = first.storeRoot
    try {
      const state = await openUdState(first.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(first, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })
      await wired.tool('udt_lesson_update', {
        blocks: [textBlock('intro', 'Vectors first.'), checkBlock('check', 'Shape of x?')],
      })
      await wired.tool('udt_map_update', {
        op: 'add-evidence',
        nodeId: mathId,
        evidenceKind: 'check',
        state: 'checked',
      })
    } finally {
      await first.close({ keepStore: true })
    }

    const second = await createHarness({ storeRoot })
    try {
      const state = await openUdState(second.ctx.get('storageDomain')!)
      const wired = await wire(second, state)

      // The focus survives, so the panel resumes where it left off.
      expect(state.activeFocus()?.node.id).toBe('ml:math')

      const lesson = (await wired.api('/lesson?nodeId=ml%3Amath')).json.lesson as {
        blocks: { type: string }[]
        origin: string
      }
      expect(lesson.origin).toBe('tutor')
      expect(lesson.blocks.map((block) => block.type)).toEqual(['text', 'check'])

      const node = (await wired.api('/node?id=ml%3Amath')).json.node as {
        state: string
        evidence: unknown[]
      }
      expect(node.state).toBe('checked')
      expect(node.evidence).toHaveLength(2)
    } finally {
      await second.close()
    }
  })
})

describe('unload leaves no residue', () => {
  it('retracts every tool and frees the domain, repeatably', async () => {
    const harness = await createHarness()
    try {
      for (let round = 0; round < 3; round += 1) {
        const fiber = await harness.ctx.plugin(plugin)
        const names = harness.ctx
          .get('tools')
          ?.schemas()
          .map((schema) => schema.name)
          .sort()
        expect(names).toContain('udt_lesson_update')
        expect(harness.ctx.get('storageDomain')?.get('udt')).toBeDefined()

        await fiber.dispose()

        expect(harness.ctx.get('tools')?.schemas() ?? []).toEqual([])
        expect(harness.ctx.get('storageDomain')?.get('udt')).toBeUndefined()
      }
    } finally {
      await harness.close()
    }
  })
})
