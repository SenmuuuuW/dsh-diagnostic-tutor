/**
 * What happens after a node: the decision, and the focus lifecycle it turns.
 *
 * The runtime's whole role here is structural. It does not choose a next step,
 * it does not fill in a target the tutor left out, and it cannot promote a node
 * — it validates the shape of a decision the teaching brain made, stores it,
 * turns the focus over if the decision is a move, and shows the learner why.
 *
 * These tests drive the real tools and read through the real API, so what they
 * pin is the behaviour a learner would actually get.
 */

import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import * as plugin from '../src/index.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { guarded } from '../src/trust-fence.js'
import { READINESS_OUTCOMES, targetRequirement } from '../src/vocabulary.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const NOW = '2026-01-01T00:00:00.000Z'

interface Wired {
  state: UdState
  tool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
  api(path: string, init?: { method?: string; body?: unknown }): Promise<{ status: number; json: Record<string, unknown> }>
}

async function wire(harness: TestHarness, state: UdState): Promise<Wired> {
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

  const handler = guarded(
    createApiHandler({ state, prompt: () => ({ prompted: true }) }),
  )

  return {
    state,
    async tool(name, args) {
      const definition = registered.get(name)
      if (!definition) throw new Error(`tool "${name}" is not registered`)
      return (await definition.execute(args, {})) as Record<string, unknown>
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

/** A course with a goal and two children: a blocked node and a fresh one. */
async function seed(state: UdState): Promise<{ goalId: string; mathId: string; laId: string }> {
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

  const goal = newNode({ id: 'ml:goal', courseId, title: 'Machine Learning', relation: 'goal', now: NOW })
  const math = newNode({
    id: 'ml:math',
    courseId,
    title: 'Math Foundations',
    relation: 'part-of',
    parentId: goal.id,
    state: 'blocked',
    evidence: [{ kind: 'diagnosis', at: NOW, readiness: 'step-down', note: 'shaky maths' }],
    now: NOW,
  })
  const la = newNode({
    id: 'ml:la',
    courseId,
    title: 'Linear Algebra',
    relation: 'prerequisite',
    parentId: math.id,
    state: 'unconfirmed',
    now: NOW,
  })
  for (const node of [goal, math, la]) await state.writeNode(node)
  return { goalId: goal.id, mathId: math.id, laId: la.id }
}

describe('the action vocabulary is the skill\'s, not a second one', () => {
  it('uses exactly the six readiness outcomes', () => {
    expect([...READINESS_OUTCOMES]).toEqual([
      'advance',
      'advance-with-caution',
      'review-first',
      'step-down',
      'diagnose-again',
      'more-practice',
    ])
  })

  it('knows which outcomes name a target', () => {
    expect(targetRequirement('advance')).toBe('required')
    expect(targetRequirement('advance-with-caution')).toBe('required')
    expect(targetRequirement('step-down')).toBe('required')
    expect(targetRequirement('review-first')).toBe('optional')
    expect(targetRequirement('more-practice')).toBe('forbidden')
    expect(targetRequirement('diagnose-again')).toBe('forbidden')
  })
})

describe('a move ends the focus and carries the recommendation', () => {
  it('ends the focus, links the step, and reports both', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId, laId } = await seed(state)
      const wired = await wire(harness, state)

      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })
      const decided = await wired.tool('udt_decide_next', {
        action: 'step-down',
        targetNodeId: laId,
        reason: 'Vectors and matrix shapes come before anything built on them.',
      })

      expect(decided.focusEnded).toBe(true)
      expect(decided.targetNodeId).toBe(laId)

      // The focus really is over, with the recommendation attached.
      const focus = state.readFocus('ml')
      expect(focus?.status).toBe('ended')
      expect(focus?.endedAt).toBeTruthy()
      expect(focus?.nextStepId).toBe(mathId)
      // Nothing is active, so nothing auto-advances.
      expect(state.activeFocus()).toBeUndefined()

      const overview = await wired.api('/overview')
      expect(overview.json.focus).toBeNull()
      expect(overview.json.nextStep).toMatchObject({
        fromNodeId: mathId,
        targetNodeId: laId,
        targetNodeTitle: 'Linear Algebra',
        action: 'step-down',
        reason: 'Vectors and matrix shapes come before anything built on them.',
      })
    } finally {
      await harness.close()
    }
  })

  it('starts the new focus only when the learner acts on it', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId, laId } = await seed(state)
      const wired = await wire(harness, state)

      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })
      await wired.tool('udt_decide_next', {
        action: 'advance',
        targetNodeId: laId,
        reason: 'Ready to move on.',
      })

      // Still nothing focused: the recommendation is an offer, not a jump.
      expect(state.activeFocus()).toBeUndefined()

      await wired.api('/focus', { method: 'POST', body: { nodeId: laId } })

      expect(state.activeFocus()?.node.id).toBe(laId)
      // Acting on it clears it: a new focus writes a fresh record.
      expect((await wired.api('/overview')).json.nextStep).toBeNull()
    } finally {
      await harness.close()
    }
  })
})

describe('staying keeps the focus open', () => {
  it('does not end the focus for more-practice or diagnose-again', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)

      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })
      const decided = await wired.tool('udt_decide_next', {
        action: 'more-practice',
        reason: 'The idea is there but the manipulation is not yet reliable.',
      })

      expect(decided.focusEnded).toBe(false)
      // The learner has not moved, and the panel must not say they have.
      expect(state.readFocus('ml')?.status).toBe('active')
      expect(state.activeFocus()?.node.id).toBe(mathId)

      const overview = await wired.api('/overview')
      expect(overview.json.focus).toMatchObject({ nodeId: mathId })
      expect(overview.json.nextStep).toMatchObject({ targetNodeId: null, action: 'more-practice' })
    } finally {
      await harness.close()
    }
  })

  it('treats review-first without a target as staying', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)

      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })
      const decided = await wired.tool('udt_decide_next', {
        action: 'review-first',
        reason: 'One locally repairable gap — worth fixing here.',
      })
      expect(decided.focusEnded).toBe(false)
    } finally {
      await harness.close()
    }
  })

  it('treats review-first with a target as a move', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId, laId } = await seed(state)
      const wired = await wire(harness, state)

      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })
      const decided = await wired.tool('udt_decide_next', {
        action: 'review-first',
        targetNodeId: laId,
        reason: 'Go back to the earlier node before continuing.',
      })
      expect(decided.focusEnded).toBe(true)
      expect(state.readFocus('ml')?.status).toBe('ended')
    } finally {
      await harness.close()
    }
  })
})

describe('the runtime validates the shape and never supplies a target', () => {
  it('refuses a move with no target', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      await expect(
        wired.tool('udt_decide_next', { action: 'advance', reason: 'move on' }),
      ).rejects.toThrow(/must name targetNodeId/)
      // And nothing was recorded.
      expect(state.latestNextStep('ml')).toBeUndefined()
    } finally {
      await harness.close()
    }
  })

  it('refuses a stay that names a target', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId, laId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      await expect(
        wired.tool('udt_decide_next', {
          action: 'more-practice',
          targetNodeId: laId,
          reason: 'practise',
        }),
      ).rejects.toThrow(/must be omitted/)
    } finally {
      await harness.close()
    }
  })

  it('refuses a target that does not exist, or lives in another course', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      await expect(
        wired.tool('udt_decide_next', { action: 'advance', targetNodeId: 'ghost', reason: 'x' }),
      ).rejects.toThrow(/no node "ghost"/)

      // A second course's node must be refused too.
      await state.writeCourse({
        id: 'la',
        title: 'Linear Algebra',
        goal: 'brush up',
        status: 'paused',
        createdAt: NOW,
        updatedAt: NOW,
      })
      const foreign = newNode({ id: 'la:goal', courseId: 'la', title: 'LA', relation: 'goal', now: NOW })
      await state.writeNode(foreign)

      await expect(
        wired.tool('udt_decide_next', { action: 'advance', targetNodeId: foreign.id, reason: 'x' }),
      ).rejects.toThrow(/belongs to course/)
    } finally {
      await harness.close()
    }
  })

  it('refuses a target equal to the current node', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      await expect(
        wired.tool('udt_decide_next', { action: 'advance', targetNodeId: mathId, reason: 'x' }),
      ).rejects.toThrow(/omit targetNodeId/)
    } finally {
      await harness.close()
    }
  })

  it('has no way to move a node\'s state, so it cannot confirm anything', async () => {
    // The decision tool takes no state at all. That is deliberate: mastery is
    // recorded through udt_map_update, where the evidence rules apply.
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId, laId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })

      await wired.tool('udt_decide_next', {
        action: 'advance',
        targetNodeId: laId,
        reason: 'moving on',
      })
      expect(state.readNode(laId)?.state).toBe('unconfirmed')
      expect((await wired.api(`/node?id=${encodeURIComponent(laId)}`)).json.node).toMatchObject({
        state: 'unconfirmed',
      })
    } finally {
      await harness.close()
    }
  })
})

describe('a decision survives a restart', () => {
  it('keeps the recommendation and the ended focus', async () => {
    const first = await createHarness()
    const storeRoot = first.storeRoot
    try {
      const state = await openUdState(first.ctx.get('storageDomain')!)
      const { mathId, laId } = await seed(state)
      const wired = await wire(first, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: mathId } })
      await wired.tool('udt_decide_next', {
        action: 'step-down',
        targetNodeId: laId,
        reason: 'Prerequisite first.',
      })
    } finally {
      await first.close({ keepStore: true })
    }

    const second = await createHarness({ storeRoot })
    try {
      const state = await openUdState(second.ctx.get('storageDomain')!)
      const wired = await wire(second, state)

      expect(state.readFocus('ml')?.status).toBe('ended')
      const overview = await wired.api('/overview')
      expect(overview.json.focus).toBeNull()
      expect(overview.json.nextStep).toMatchObject({
        targetNodeId: 'ml:la',
        action: 'step-down',
        reason: 'Prerequisite first.',
      })
    } finally {
      await second.close()
    }
  })
})

describe('unload still leaves no residue', () => {
  it('retracts every tool, including the decision tool', async () => {
    const harness = await createHarness()
    try {
      const fiber = await harness.ctx.plugin(plugin)
      expect(harness.ctx.get('tools')?.get('udt_decide_next')).toBeDefined()
      await fiber.dispose()
      expect(harness.ctx.get('tools')?.schemas() ?? []).toEqual([])
      expect(harness.ctx.get('storageDomain')?.get('udt')).toBeUndefined()
    } finally {
      await harness.close()
    }
  })
})
