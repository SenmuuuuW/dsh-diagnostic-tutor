/**
 * A decision the tutor made must be visible to the learner.
 *
 * This is the contract between `udt_decide_next` and the NEXT BEST STEP card,
 * and it is pinned per action because the two shapes differ:
 *
 *   a move  — the focus ends, and still carries the decision
 *   a stay  — the focus continues, and carries the decision
 *
 * Both must leave `focus.nextStepId` pointing at the record just written,
 * because that pointer is the ONLY thing the card reads. The failure these
 * tests exist for is silent: the decision is stored, the tutor is told it
 * succeeded, and the learner sees nothing — no card, no button, no way forward.
 * A store holding a decision the UI cannot reach is worse than an error,
 * because nothing looks broken.
 *
 * What prompted this: a real run recorded `advance-with-caution` and
 * `diagnose-again`, and `/overview` reported `nextStep: null`. The immediate
 * cause was a later `POST /focus` clearing the pointer — which is intended —
 * but nothing in the suite would have caught it had the pointer genuinely never
 * been written. That gap is what this file closes.
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


/**
 * The conversation these tests act as.
 *
 * `/overview` reports learning state only to the conversation it belongs to, so
 * every read has to name one. Before this, one course-wide focus was shown to
 * whoever asked, which is how a lesson started in one conversation appeared
 * under another.
 */
const SESSION = 'session-under-test'

interface Wired {
  tool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
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

/** A course with a root and two nodes, so a focus can be opened and moved. */
async function seed(state: UdState): Promise<{ a: string; b: string }> {
  await state.writeCourse({
    id: 'ml',
    title: 'Machine Learning',
    goal: 'learn',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await state.activateCourse('ml', NOW)

  const goal = newNode({ id: 'ml:goal', courseId: 'ml', title: 'Machine Learning', relation: 'goal', now: NOW })
  const a = newNode({
    id: 'ml:a',
    courseId: 'ml',
    title: 'Node A',
    relation: 'part-of',
    parentId: goal.id,
    state: 'blocked',
    evidence: [{ kind: 'diagnosis', at: NOW, readiness: 'step-down', note: 'shaky' }],
    now: NOW,
  })
  const b = newNode({
    id: 'ml:b',
    courseId: 'ml',
    title: 'Node B',
    relation: 'prerequisite',
    parentId: a.id,
    now: NOW,
  })
  for (const node of [goal, a, b]) await state.writeNode(node)
  return { a: a.id, b: b.id }
}

/** Open a focus. This is also what clears an earlier decision. */
async function focusOn(wired: Wired, nodeId: string): Promise<void> {
  const started = await wired.api('/focus', { method: 'POST', body: { nodeId, sessionId: SESSION } })
  expect(started.status).toBe(200)
}

/** Run one case against a freshly seeded store. */
async function withStore(
  body: (ctx: { state: UdState; wired: Wired; a: string; b: string }) => Promise<void>,
): Promise<void> {
  const harness = await createHarness()
  try {
    const state = await openUdState(harness.ctx.get('storageDomain')!)
    const { a, b } = await seed(state)
    await body({ state, wired: wire(harness, state), a, b })
  } finally {
    await harness.close()
  }
}

describe('a stay keeps the focus and still shows the card', () => {
  for (const action of ['more-practice', 'diagnose-again', 'review-first'] as const) {
    it(`shows it for ${action}`, async () => {
      await withStore(async ({ state, wired, a }) => {
        await focusOn(wired, a)

        const decided = await wired.tool('udt_decide_next', {
          action,
          reason: 'Not yet — one more pass at the same idea.',
        })

        expect(decided.action).toBe(action)
        expect(decided.focusEnded).toBe(false)

        // The focus continues…
        const focus = state.readFocus('ml')
        expect(focus?.status).toBe('active')
        expect(focus?.endedAt).toBeUndefined()
        expect(focus?.nodeId).toBe(a)
        // …and carries the decision. This is the assertion whose absence hides
        // the card from the learner.
        expect(focus?.nextStepId).toBe(a)

        // And the learner can see it.
        const overview = await wired.api(`/overview?sessionId=${SESSION}`)
        expect(overview.json.nextStep).toMatchObject({
          fromNodeId: a,
          targetNodeId: null,
          targetNodeTitle: null,
          action,
        })
        expect(overview.json.focus).toMatchObject({ nodeId: a, status: 'active' })
      })
    })
  }
})

describe('a move ends the focus and still shows the card', () => {
  for (const action of ['advance', 'advance-with-caution', 'step-down'] as const) {
    it(`shows it for ${action}, naming the target`, async () => {
      await withStore(async ({ state, wired, a, b }) => {
        await focusOn(wired, a)

        const decided = await wired.tool('udt_decide_next', {
          action,
          targetNodeId: b,
          reason: 'Ready to move on.',
        })

        expect(decided.targetNodeId).toBe(b)
        expect(decided.focusEnded).toBe(true)

        const focus = state.readFocus('ml')
        expect(focus?.status).toBe('ended')
        expect(focus?.endedAt).toBeTruthy()
        expect(focus?.nextStepId).toBe(a)
        // Nothing is active, so nothing advances on its own.
        expect(state.activeFocus()).toBeUndefined()

        const overview = await wired.api(`/overview?sessionId=${SESSION}`)
        expect(overview.json.focus).toBeNull()
        expect(overview.json.nextStep).toMatchObject({
          fromNodeId: a,
          targetNodeId: b,
          targetNodeTitle: 'Node B',
          action,
        })
      })
    })
  }
})

describe('acting on a decision consumes it', () => {
  it('clears the card, so it cannot be acted on twice', async () => {
    await withStore(async ({ state, wired, a, b }) => {
      await focusOn(wired, a)
      await wired.tool('udt_decide_next', { action: 'advance', targetNodeId: b, reason: 'Onwards.' })
      expect((await wired.api(`/overview?sessionId=${SESSION}`)).json.nextStep).not.toBeNull()

      // Continuing opens a new focus — which is exactly what clears the pointer.
      await focusOn(wired, b)

      const overview = await wired.api(`/overview?sessionId=${SESSION}`)
      expect(overview.json.nextStep).toBeNull()
      expect(state.readFocus('ml')?.nextStepId).toBeUndefined()
      expect(overview.json.focus).toMatchObject({ nodeId: b })
    })
  })

  it('shows the new decision, never the consumed one', async () => {
    await withStore(async ({ wired, a, b }) => {
      await focusOn(wired, a)
      await wired.tool('udt_decide_next', { action: 'advance', targetNodeId: b, reason: 'Onwards.' })
      await focusOn(wired, b)
      expect((await wired.api(`/overview?sessionId=${SESSION}`)).json.nextStep).toBeNull()

      await wired.tool('udt_decide_next', { action: 'more-practice', reason: 'Stay here.' })

      expect((await wired.api(`/overview?sessionId=${SESSION}`)).json.nextStep).toMatchObject({
        fromNodeId: b,
        targetNodeId: null,
        action: 'more-practice',
      })
    })
  })
})

describe('the invariant, stated directly', () => {
  it('never leaves a decision in the store that the UI cannot reach', async () => {
    // After any decideNext: a record exists AND the focus points at it.
    // "A record exists but nextStep is null" is the silent failure — the tutor
    // believes it decided, and the learner is given nothing to act on.
    await withStore(async ({ state, wired, a, b }) => {
      const cases: { action: string; targetNodeId?: string }[] = [
        { action: 'more-practice' },
        { action: 'diagnose-again' },
        { action: 'review-first' },
        { action: 'advance-with-caution', targetNodeId: b },
        { action: 'advance', targetNodeId: b },
        { action: 'step-down', targetNodeId: b },
      ]

      for (const input of cases) {
        // Always start from a, and name it explicitly: a move ends the focus,
        // so the next case has nothing to infer the from-node from.
        await focusOn(wired, a)
        const decided = await wired.tool('udt_decide_next', {
          fromNodeId: a,
          reason: 'Any decision at all.',
          ...input,
        })

        expect(state.readNextStep(decided.fromNodeId as string), `${input.action}: record`).toBeDefined()

        const overview = await wired.api(`/overview?sessionId=${SESSION}`)
        expect(
          overview.json.nextStep,
          `action "${input.action}" was recorded but the card would not render`,
        ).not.toBeNull()
      }
    })
  })
})

/* -------------------------------------------------------------------------- */
/* Whose learning state is this?                                              */
/* -------------------------------------------------------------------------- */

describe('learning state belongs to a conversation, not to a course', () => {
  it('never shows one conversation the node another one is working on', async () => {
    // The bug this exists for, found in a real journey: A started a node, the
    // learner switched to B and started a different one, and coming back to A
    // showed B's lesson under A's chat. The focus was keyed by course, so B's
    // Start learning had silently replaced A's — and because a focus did not
    // record which conversation it belonged to, the panel had no way to tell.
    await withStore(async ({ state, wired, a, b }) => {
      await wired.api('/focus', { method: 'POST', body: { nodeId: a, sessionId: 'session-A' } })
      const forA = await wired.api('/overview?sessionId=session-A')
      expect(forA.json.focus).toMatchObject({ nodeId: a })

      // B starts a different node. One focus per course, so this replaces it.
      await wired.api('/focus', { method: 'POST', body: { nodeId: b, sessionId: 'session-B' } })

      const bSees = await wired.api('/overview?sessionId=session-B')
      expect(bSees.json.focus).toMatchObject({ nodeId: b })

      // A must not be shown B's node — nor its lesson, nor its handoff.
      const aSees = await wired.api('/overview?sessionId=session-A')
      expect(aSees.json.focus, 'A was shown B\'s focus').toBeNull()
      expect(aSees.json.nextStep).toBeNull()
      expect(aSees.json.handoff).toBeNull()

      // The shared half is still shared: the course and the map are knowledge,
      // not a conversation's position in it.
      expect(aSees.json.course).toMatchObject({ id: 'ml' })
      expect((aSees.json.nodes as unknown[]).length).toBeGreaterThan(0)
      void state
    })
  })

  it('keeps a decision private to the conversation that earned it', async () => {
    await withStore(async ({ wired, a, b }) => {
      await wired.api('/focus', { method: 'POST', body: { nodeId: a, sessionId: 'session-A' } })
      await wired.tool('udt_decide_next', { action: 'advance', targetNodeId: b, reason: 'Onwards.' })

      expect((await wired.api('/overview?sessionId=session-A')).json.nextStep).not.toBeNull()
      expect((await wired.api('/overview?sessionId=session-B')).json.nextStep).toBeNull()
    })
  })

  it('shows nothing to a caller that does not say which conversation it is', async () => {
    // Not a fallback to "the last focus": guessing is what produced the bug.
    await withStore(async ({ wired, a }) => {
      await wired.api('/focus', { method: 'POST', body: { nodeId: a, sessionId: 'session-A' } })
      const anonymous = await wired.api('/overview')
      expect(anonymous.json.focus).toBeNull()
      expect(anonymous.json.nextStep).toBeNull()
    })
  })

  it('shows nothing for a focus that predates the field', async () => {
    // Records written before a focus carried a conversation belong to nobody,
    // so they are shown to nobody. Their evidence and lessons are untouched.
    await withStore(async ({ state, wired, a }) => {
      await state.startFocus('ml', a, NOW)
      const view = await wired.api('/overview?sessionId=session-A')
      expect(view.json.focus).toBeNull()
    })
  })
})
