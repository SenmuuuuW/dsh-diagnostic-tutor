/**
 * Execution state is per-conversation.
 *
 * The knowledge a learner accumulates — course, map, evidence, lessons — is
 * theirs and is shared by every conversation they open. Where they have *got
 * to* is not. This file pins that split, table by table, because the bug it
 * guards against was found in a real journey: a node started in one
 * conversation replaced another's focus, and switching back showed the wrong
 * lesson under the right chat.
 *
 * Each table is checked for the three properties that matter:
 *
 *   coexist   two conversations can hold state for the same course, node or
 *             target without one overwriting the other
 *   isolate   neither can read the other's
 *   anonymous a caller that does not name a conversation gets nothing
 */

import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { executionKey, focusKey, handoffKey, isLegacyExecutionKey, nextStepKey } from '../src/execution-key.js'
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
      // A tool call runs on behalf of one agent, and an agent is session-backed.
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

async function seeded(): Promise<{ harness: TestHarness; state: UdState; wired: Wired; x: string; y: string }> {
  const harness = await createHarness()
  const state = await openUdState(harness.ctx.get('storageDomain')!)
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
  const x = newNode({ id: 'ml:x', courseId: 'ml', title: 'Node X', relation: 'part-of', parentId: goal.id, now: NOW })
  const y = newNode({ id: 'ml:y', courseId: 'ml', title: 'Node Y', relation: 'prerequisite', parentId: x.id, now: NOW })
  for (const node of [goal, x, y]) await state.writeNode(node)
  return { harness, state, wired: wire(harness, state), x: x.id, y: y.id }
}

const start = (wired: Wired, nodeId: string, sessionId: string) =>
  wired.api('/focus', { method: 'POST', body: { nodeId, sessionId } })

/**
 * Clear the double-click window before a genuine retry.
 *
 * `POST /focus` treats a second request within HANDOFF_DEDUPE_MS as the same
 * handoff — that is what makes a double click harmless — so a test about
 * attempts has to get past it. Real retries are minutes apart.
 */
const RETRY_WINDOW_MS = 3_100
const afterDedupeWindow = () => new Promise((resolve) => setTimeout(resolve, RETRY_WINDOW_MS))

describe('the key helper', () => {
  it('is deterministic', () => {
    expect(focusKey(A, 'ml')).toBe(focusKey(A, 'ml'))
    expect(nextStepKey(A, 'ml:x')).toBe(nextStepKey(A, 'ml:x'))
    expect(handoffKey(A, 'ml:x')).toBe(handoffKey(A, 'ml:x'))
  })

  it('separates conversations', () => {
    expect(focusKey(A, 'ml')).not.toBe(focusKey(B, 'ml'))
    expect(nextStepKey(A, 'ml:x')).not.toBe(nextStepKey(B, 'ml:x'))
    expect(handoffKey(A, 'ml:x')).not.toBe(handoffKey(B, 'ml:x'))
  })

  it('separates the logical ids within one conversation', () => {
    expect(focusKey(A, 'ml')).not.toBe(focusKey(A, 'other'))
    expect(nextStepKey(A, 'ml:x')).not.toBe(nextStepKey(A, 'ml:y'))
  })

  it('keeps the kinds apart, so one table cannot alias another', () => {
    expect(focusKey(A, 'ml')).not.toBe(nextStepKey(A, 'ml'))
    expect(nextStepKey(A, 'ml')).not.toBe(handoffKey(A, 'ml'))
  })

  it('cannot be forged by a session id that contains the separator', () => {
    // The separator is a unit separator, which no session id contains — so
    // ('a', 'b·c') and ('a·b', 'c') cannot collide.
    expect(executionKey('focus', 'a', 'b\u001fc')).not.toBe(executionKey('focus', 'a\u001fb', 'c'))
  })

  it('recognises a key that predates session scoping', () => {
    expect(isLegacyExecutionKey('ml')).toBe(true)
    expect(isLegacyExecutionKey('ml:x')).toBe(true)
    expect(isLegacyExecutionKey(focusKey(A, 'ml'))).toBe(false)
  })
})

describe('focus is per conversation', () => {
  it('lets two conversations hold different nodes of the same course', async () => {
    const { harness, state, wired, x, y } = await seeded()
    try {
      await start(wired, x, A)
      await start(wired, y, B)

      expect(state.readFocus(A, 'ml')?.nodeId).toBe(x)
      expect(state.readFocus(B, 'ml')?.nodeId).toBe(y)
    } finally {
      await harness.close()
    }
  })

  it('gives each conversation its own focus back after a round trip', async () => {
    const { harness, wired, x, y } = await seeded()
    try {
      await start(wired, x, A)
      await start(wired, y, B)

      // A -> B -> A
      const back = await wired.api(`/overview?sessionId=${A}`)
      expect(back.json.focus).toMatchObject({ nodeId: x })
      const b = await wired.api(`/overview?sessionId=${B}`)
      expect(b.json.focus).toMatchObject({ nodeId: y })
    } finally {
      await harness.close()
    }
  })

  it('lets two conversations work the SAME node without collision', async () => {
    const { harness, state, wired, x } = await seeded()
    try {
      await start(wired, x, A)
      await start(wired, x, B)
      expect(state.readFocus(A, 'ml')?.nodeId).toBe(x)
      expect(state.readFocus(B, 'ml')?.nodeId).toBe(x)
      // Two records, not one shared one.
      expect(state.listFocus().filter((record) => record.nodeId === x)).toHaveLength(2)
    } finally {
      await harness.close()
    }
  })
})

describe('decisions are per conversation', () => {
  it('lets two conversations decide differently about the same node', async () => {
    const { harness, state, wired, x, y } = await seeded()
    try {
      await start(wired, x, A)
      await start(wired, x, B)

      await wired.tool('udt_decide_next', { action: 'advance', targetNodeId: y, reason: 'A moves on.' }, A)
      await wired.tool('udt_decide_next', { action: 'more-practice', reason: 'B stays.' }, B)

      expect(state.readNextStep(A, x)?.action).toBe('advance')
      expect(state.readNextStep(A, x)?.targetNodeId).toBe(y)
      expect(state.readNextStep(B, x)?.action).toBe('more-practice')
      expect(state.readNextStep(B, x)?.targetNodeId).toBeUndefined()

      const forA = await wired.api(`/overview?sessionId=${A}`)
      const forB = await wired.api(`/overview?sessionId=${B}`)
      expect(forA.json.nextStep).toMatchObject({ action: 'advance', targetNodeId: y })
      expect(forB.json.nextStep).toMatchObject({ action: 'more-practice', targetNodeId: null })
    } finally {
      await harness.close()
    }
  })
})

describe('handoffs are per conversation', () => {
  it('records one per conversation for the same target, with its own attempts', { timeout: 20_000 }, async () => {
    const { harness, state, wired, x } = await seeded()
    try {
      await start(wired, x, A)
      await start(wired, x, B)
      // A retries once, past the double-click window.
      await afterDedupeWindow()
      await start(wired, x, A)

      const forA = state.readHandoff(A, x)
      const forB = state.readHandoff(B, x)
      expect(forA?.sessionId).toBe(A)
      expect(forB?.sessionId).toBe(B)
      expect(forA?.attempts).toBe(2)
      expect(forB?.attempts).toBe(1)
      expect(state.listHandoffs().filter((record) => record.targetNodeId === x)).toHaveLength(2)
    } finally {
      await harness.close()
    }
  })

  it('treats a double click as one attempt, not two', async () => {
    const { harness, state, wired, x } = await seeded()
    try {
      await start(wired, x, A)
      await start(wired, x, A)
      expect(state.readHandoff(A, x)?.attempts).toBe(1)
    } finally {
      await harness.close()
    }
  })

  it('leaves the other conversation alone when one retries', { timeout: 20_000 }, async () => {
    const { harness, state, wired, x } = await seeded()
    try {
      await start(wired, x, A)
      await start(wired, x, B)
      const bBefore = JSON.stringify(state.readHandoff(B, x))

      await afterDedupeWindow()
      await start(wired, x, A)
      await afterDedupeWindow()
      await start(wired, x, A)

      expect(state.readHandoff(A, x)?.attempts).toBe(3)
      expect(JSON.stringify(state.readHandoff(B, x))).toBe(bBefore)
    } finally {
      await harness.close()
    }
  })
})

describe('a caller that names no conversation gets nothing', () => {
  it('reports no focus, no decision and no handoff', async () => {
    const { harness, wired, x } = await seeded()
    try {
      await start(wired, x, A)
      await wired.tool('udt_decide_next', { action: 'more-practice', reason: 'Stay.' }, A)

      const anonymous = await wired.api('/overview')
      expect(anonymous.json.focus).toBeNull()
      expect(anonymous.json.nextStep).toBeNull()
      expect(anonymous.json.handoff).toBeNull()

      // The shared half is still shared: the course and its map are knowledge.
      expect(anonymous.json.course).toMatchObject({ id: 'ml' })
      expect((anonymous.json.nodes as unknown[]).length).toBe(3)
    } finally {
      await harness.close()
    }
  })

  it('refuses to open a focus that names no conversation', async () => {
    const { harness, wired, x } = await seeded()
    try {
      const res = await wired.api('/focus', { method: 'POST', body: { nodeId: x } })
      expect(res.status).toBe(400)
      expect(res.status).toBe(400)
      expect(JSON.stringify(res.json)).toContain('missing-session-id')
    } finally {
      await harness.close()
    }
  })
})

describe('nothing here touches the shared half', () => {
  it('shows both conversations the same course, map and lessons', async () => {
    const { harness, state, wired, x } = await seeded()
    try {
      await start(wired, x, A)
      await wired.tool(
        'udt_lesson_update',
        { nodeId: x, blocks: [{ id: 'b1', type: 'text', content: { md: 'Shared teaching.' } }] },
        A,
      )

      for (const who of [A, B]) {
        const view = await wired.api(`/overview?sessionId=${who}`)
        expect(view.json.course, `${who} lost the course`).toMatchObject({ id: 'ml' })
        expect((view.json.nodes as unknown[]).length, `${who} lost the map`).toBe(3)
        const lesson = await wired.api(`/lesson?nodeId=${encodeURIComponent(x)}`)
        expect(lesson.json.lesson, `${who} lost the lesson`).not.toBeNull()
      }
      void state
    } finally {
      await harness.close()
    }
  })
})
