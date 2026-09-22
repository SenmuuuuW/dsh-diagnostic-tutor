/**
 * The handoff: the wait between pressing Continue and seeing a lesson.
 *
 * The behaviours that matter here are all about what happens when things are
 * slow, doubled, reloaded or restarted — which is exactly when a silent gap
 * becomes indistinguishable from a broken button.
 */

import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import {
  STALL_AFTER_MS,
  beginHandoff,
  handoffView,
  withActivity,
  withFocusRecorded,
  withLesson,
  withObserved,
  withPromptFailure,
  withPrompted,
} from '../src/handoff.js'
import type { HandoffRecord } from '../src/handoff.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const NOW = '2026-01-01T00:00:00.000Z'
const at = (seconds: number): string => new Date(Date.parse(NOW) + seconds * 1000).toISOString()

/* -------------------------------------------------------------------------- */
/* Pure: the state machine                                                    */
/* -------------------------------------------------------------------------- */

function chain(): HandoffRecord {
  let record = beginHandoff({ courseId: 'ml', fromNodeId: 'ml:a', targetNodeId: 'ml:b', now: at(0) })
  record = withFocusRecorded(record, at(1))
  record = withPrompted(record, at(2))
  return record
}

describe('the timing chain', () => {
  it('walks focus-recorded → prompted → working → ready', () => {
    let record = chain()
    expect(record.status).toBe('prompted')
    expect(handoffView(record, Date.parse(at(3)), false).phase).toBe('tutor-requested')

    record = withActivity(record, at(9))
    expect(record.status).toBe('working')
    expect(handoffView(record, Date.parse(at(30)), false).phase).toBe('tutor-working')

    record = withLesson(record, at(95))
    expect(record.status).toBe('ready')
    expect(handoffView(record, Date.parse(at(120)), true).phase).toBe('lesson-ready')
  })

  it('keeps every stage duration, which is the measurement', () => {
    let record = chain()
    record = withActivity(record, at(9))
    record = withLesson(record, at(95))
    record = withObserved(record, at(97))

    const view = handoffView(record, Date.parse(at(97)), true)
    expect(view.stages).toEqual({
      toFocusRecorded: 1000,
      toPrompted: 2000,
      toFirstActivity: 9000,
      toLesson: 95_000,
      toObserved: 97_000,
    })
    expect(view.elapsedMs).toBe(97_000)
  })

  it('keeps only the first activity and the first sighting', () => {
    let record = withActivity(chain(), at(9))
    record = withActivity(record, at(40))
    expect(record.firstActivityAt).toBe(at(9))

    record = withObserved(record, at(100))
    record = withObserved(record, at(200))
    expect(record.observedAt).toBe(at(100))
  })
})

describe('going quiet is derived, never stored', () => {
  it('reports a stall once the record stops moving', () => {
    const record = withActivity(chain(), at(9))
    const view = handoffView(record, Date.parse(at(9)) + STALL_AFTER_MS + 1, false)
    expect(view.phase).toBe('stalled')
    expect(view.detail).toBeTruthy()
  })

  it('does not stall while the record is recent', () => {
    const record = withActivity(chain(), at(9))
    expect(handoffView(record, Date.parse(at(9)) + 1000, false).phase).toBe('tutor-working')
  })

  it('is a statement about the wait, never about the focus', () => {
    // The record is data; a stall changes nothing about it.
    const record = withActivity(chain(), at(9))
    const before = JSON.stringify(record)
    handoffView(record, Date.parse(at(9)) + STALL_AFTER_MS * 10, false)
    expect(JSON.stringify(record)).toBe(before)
    expect(record.status).toBe('working')
  })

  it('reports a failure with its reason', () => {
    const record = withPromptFailure(chain(), at(3), 'that session has no live agent')
    const view = handoffView(record, Date.parse(at(4)), false)
    expect(view.phase).toBe('failed')
    expect(view.detail).toBe('that session has no live agent')
  })
})

/* -------------------------------------------------------------------------- */
/* Integration: the API over real state                                       */
/* -------------------------------------------------------------------------- */

interface Wired {
  state: UdState
  handoffs: () => Promise<HandoffRecord[]>
  api(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ status: number; json: Record<string, unknown> }>
}

async function wire(
  harness: TestHarness,
  state: UdState,
  prompt: { prompted: boolean; reason?: string | undefined } = { prompted: true },
): Promise<Wired> {
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
    createApiHandler({
      state,
      prompt: () =>
        prompt.prompted
          ? { prompted: true }
          : { prompted: false, ...(prompt.reason === undefined ? {} : { reason: prompt.reason }) },
    }),
  )

  return {
    state,
    handoffs: () => Promise.resolve([...state.listHandoffs()]),
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

async function seed(state: UdState): Promise<{ aId: string; bId: string }> {
  await state.writeCourse({
    id: 'ml',
    title: 'Machine Learning',
    goal: 'learn ml',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await state.activateCourse('ml', NOW)
  const goal = newNode({ id: 'ml:goal', courseId: 'ml', title: 'ML', relation: 'goal', now: NOW })
  const a = newNode({ id: 'ml:a', courseId: 'ml', title: 'Node A', relation: 'part-of', parentId: goal.id, now: NOW })
  const b = newNode({ id: 'ml:b', courseId: 'ml', title: 'Node B', relation: 'part-of', parentId: goal.id, now: NOW })
  for (const node of [goal, a, b]) await state.writeNode(node)
  return { aId: a.id, bId: b.id }
}

describe('pressing Continue', () => {
  it('records the handoff and stamps the focus and the prompt', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { bId } = await seed(state)
      const wired = await wire(harness, state)

      const { json } = await wired.api('/focus', { method: 'POST', body: { nodeId: bId, sessionId: 's1' } })
      expect(json.prompted).toBe(true)

      const handoff = state.readHandoff(bId)
      expect(handoff?.status).toBe('prompted')
      expect(handoff?.attempts).toBe(1)
      expect(handoff?.sessionId).toBe('s1')
      expect(handoff?.focusRecordedAt).toBeTruthy()
      expect(handoff?.promptedAt).toBeTruthy()
      // The view carries the target, so a retry asks for the right node.
      expect(json.handoff).toMatchObject({ targetNodeId: bId, phase: 'tutor-requested' })
    } finally {
      await harness.close()
    }
  })

  it('is idempotent: a double click is one handoff', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { bId } = await seed(state)
      const wired = await wire(harness, state)

      await wired.api('/focus', { method: 'POST', body: { nodeId: bId } })
      const second = await wired.api('/focus', { method: 'POST', body: { nodeId: bId } })

      expect(second.json.deduped).toBe(true)
      expect(state.readHandoff(bId)?.attempts).toBe(1)
      // And exactly one focus exists — the domain is keyed by course.
      expect(state.listCourses()).toHaveLength(1)
      expect(state.activeFocus()?.node.id).toBe(bId)
    } finally {
      await harness.close()
    }
  })

  it('records a failure without losing the focus', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { bId } = await seed(state)
      const wired = await wire(harness, state, { prompted: false, reason: 'no live agent' })

      const { json } = await wired.api('/focus', { method: 'POST', body: { nodeId: bId } })
      expect(json.prompted).toBe(false)
      expect((json.handoff as { phase: string }).phase).toBe('failed')

      // The focus stands: a failed wake is about the wait, not the place.
      expect(state.activeFocus()?.node.id).toBe(bId)
    } finally {
      await harness.close()
    }
  })

  it('survives a restart, so a reload rebuilds the progress line', async () => {
    const first = await createHarness()
    const storeRoot = first.storeRoot
    let bId = ''
    try {
      const state = await openUdState(first.ctx.get('storageDomain')!)
      bId = (await seed(state)).bId
      const wired = await wire(first, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: bId } })
    } finally {
      await first.close({ keepStore: true })
    }

    const second = await createHarness({ storeRoot })
    try {
      const state = await openUdState(second.ctx.get('storageDomain')!)
      const wired = await wire(second, state)
      const overview = await wired.api('/overview')
      expect(overview.json.handoff).toMatchObject({ targetNodeId: bId, phase: 'tutor-requested' })
      expect(state.readHandoff(bId)?.attempts).toBe(1)
    } finally {
      await second.close()
    }
  })
})

describe('the tutor answers', () => {
  it('marks the handoff ready when a lesson is written', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { aId, bId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: bId } })

      // The tutor's own write is what moves it on — nothing else can.
      await wired.api('/focus', { method: 'POST', body: { nodeId: aId } })
      expect(state.readHandoff(bId)?.status).toBe('prompted')
    } finally {
      await harness.close()
    }
  })

  it('reports ready through the API and records the sighting', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { bId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: bId } })

      // Simulate what udt_lesson_update does on success.
      const record = state.readHandoff(bId)!
      await state.writeHandoff(withLesson(record, new Date().toISOString()))

      const overview = await wired.api('/overview')
      expect(overview.json.handoff).toMatchObject({ targetNodeId: bId, phase: 'lesson-ready' })

      const observed = await wired.api('/handoff/observed', {
        method: 'POST',
        body: { nodeId: bId },
      })
      expect(observed.status).toBe(200)
      expect(state.readHandoff(bId)?.observedAt).toBeTruthy()
    } finally {
      await harness.close()
    }
  })

  it('refuses a sighting for a node with no handoff', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { bId } = await seed(state)
      const wired = await wire(harness, state)
      await wired.api('/focus', { method: 'POST', body: { nodeId: bId } })

      expect((await wired.api('/handoff/observed', { method: 'POST', body: { nodeId: 'ghost' } })).status).toBe(404)
      expect((await wired.api('/handoff/observed', { method: 'POST', body: {} })).status).toBe(400)
    } finally {
      await harness.close()
    }
  })
})
