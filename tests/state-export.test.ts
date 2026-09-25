/**
 * The learner's data: seeing it, taking it, and deleting it.
 *
 * A project that says state is "learner-owned" owes three things: the learner
 * can look at it, carry it away, and destroy it. These tests are about the two
 * that did not exist — export and delete — and about the failure mode in
 * between, where a damaged store used to cost the learner everything.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { EXPORT_FORMAT, EXPORT_VERSION, newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const NOW = '2026-01-01T00:00:00.000Z'

interface Wired {
  state: UdState
  api(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ status: number; json: Record<string, unknown>; text: string; headers: Record<string, string> }>
}

function wire(harness: TestHarness, state: UdState): Wired {
  const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: true }) }))
  return {
    state,
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
      return {
        status: res.statusCode,
        text: res.body,
        headers: res.headers,
        json: res.body ? JSON.parse(res.body) : {},
      }
    },
  }
}

/** A course with a node, a lesson, a focus and a decision — something to export. */
async function seed(state: UdState): Promise<{ nodeId: string }> {
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
  const node = newNode({
    id: 'ml:math',
    courseId: 'ml',
    title: 'Math Foundations',
    relation: 'part-of',
    parentId: goal.id,
    state: 'blocked',
    evidence: [{ kind: 'diagnosis', at: NOW, readiness: 'step-down', note: 'shaky' }],
    now: NOW,
  })
  for (const record of [goal, node]) await state.writeNode(record)
  await state.startFocus('ml', node.id, NOW)
  await state.decideNext({
    courseId: 'ml',
    fromNodeId: node.id,
    action: 'more-practice',
    reason: 'Practise the manipulation.',
    now: NOW,
  })
  await state.writeLesson({
    id: `${node.id}:lesson`,
    courseId: 'ml',
    nodeId: node.id,
    title: 'Math Foundations',
    origin: 'tutor',
    createdAt: NOW,
    updatedAt: NOW,
    blocks: [{ id: 'a', type: 'text', content: { md: 'A first unit.' } }],
  } as never)
  return { nodeId: node.id }
}

describe('export', () => {
  it('serves everything the learner owns, as a downloadable file', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const wired = wire(harness, state)

      const res = await wired.api('/export')
      expect(res.status).toBe(200)
      // A browser should save it, not render it.
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="dsh-diagnostic-tutor-\d{4}-\d{2}-\d{2}\.json"/)
      expect(res.headers['content-type']).toContain('application/json')
      expect(res.headers['cache-control']).toBe('no-store')

      const doc = JSON.parse(res.text)
      expect(doc.format).toBe(EXPORT_FORMAT)
      expect(doc.version).toBe(EXPORT_VERSION)
      expect(doc.courses).toHaveLength(1)
      expect(doc.nodes.map((node: { id: string }) => node.id).sort()).toEqual(['ml:goal', 'ml:math'])
      expect(doc.lessons).toHaveLength(1)
      expect(doc.focus).toHaveLength(1)
      expect(doc.nextSteps).toHaveLength(1)
      expect(doc.learner.activeCourseId).toBe('ml')
    } finally {
      await harness.close()
    }
  })

  it('is self-describing and carries no operational timing', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { nodeId } = await seed(state)
      // A handoff is a claim about a model turn in progress, not learning state.
      await state.writeHandoff({
        targetNodeId: nodeId,
        courseId: 'ml',
        fromNodeId: nodeId,
        status: 'prompted',
        attempts: 1,
        requestedAt: NOW,
        updatedAt: NOW,
      })
      const wired = wire(harness, state)

      const doc = JSON.parse((await wired.api('/export')).text)
      expect(doc).not.toHaveProperty('handoffs')
      // First keys are identity, so a file found later explains itself.
      expect(Object.keys(doc).slice(0, 3)).toEqual(['format', 'version', 'exportedAt'])
    } finally {
      await harness.close()
    }
  })

  it('survives a round trip through JSON unchanged', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const wired = wire(harness, state)

      const before = state.exportState(NOW)
      const after = JSON.parse(JSON.stringify(before))
      // Plain data, no handles: an export that needed this plugin to read it
      // would not be an export.
      expect(after).toEqual(before)
    } finally {
      await harness.close()
    }
  })

  it('exports an empty state without failing', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const wired = wire(harness, state)
      const doc = JSON.parse((await wired.api('/export')).text)
      expect(doc.courses).toEqual([])
      expect(doc.nodes).toEqual([])
      expect(doc.format).toBe(EXPORT_FORMAT)
    } finally {
      await harness.close()
    }
  })
})

describe('delete', () => {
  it('removes everything and returns to first run', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const wired = wire(harness, state)

      expect((await wired.api('/reset', { method: 'POST' })).status).toBe(200)

      expect(state.listCourses()).toEqual([])
      expect(state.lessonCount()).toBe(0)
      expect(state.listNextSteps()).toEqual([])
      expect(state.listFocus()).toEqual([])
      expect(state.listHandoffs()).toEqual([])
      expect(state.nodeCount()).toBe(0)
      // Back to first run, not "initialized with nothing in it".
      expect(state.readLearner().activeCourseId).toBeUndefined()

      const overview = await wired.api('/overview')
      expect(overview.json.course).toBeNull()
      expect(overview.json.nodes).toEqual([])
    } finally {
      await harness.close()
    }
  })

  it('leaves a working runtime behind, not a broken one', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const wired = wire(harness, state)
      await wired.api('/reset', { method: 'POST' })

      // The whole point of a delete is that you can start again.
      await state.writeCourse({
        id: 'la',
        title: 'Linear Algebra',
        goal: 'start over',
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      })
      await state.activateCourse('la', NOW)
      const node = newNode({ id: 'la:goal', courseId: 'la', title: 'LA', relation: 'goal', now: NOW })
      await state.writeNode(node)

      const overview = await wired.api('/overview')
      expect(overview.json.course).toMatchObject({ title: 'Linear Algebra' })
      expect(overview.json.nodes).toHaveLength(1)
    } finally {
      await harness.close()
    }
  })

  it('refuses a GET, because a link must not be able to delete', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const wired = wire(harness, state)

      const res = await wired.api('/reset')
      expect(res.status).toBe(404)
      // And nothing was touched.
      expect(state.listCourses()).toHaveLength(1)
    } finally {
      await harness.close()
    }
  })
})

describe('a partly damaged store', () => {
  it('rejects the open, and that is a known limit of the single layout', async () => {
    // The domain declares `invalidRecords: 'backup-and-skip'`, but the platform
    // only honours it when the unit can move a per-record document aside, and
    // this domain uses the default `single` layout: one `udt.json` holds every
    // record, so there is no document to move and the option falls back to
    // rejecting.
    //
    // This test pins the actual behaviour so the limit is visible rather than
    // assumed away. Switching the spec to `layout: 'per-record'` would make the
    // declared option live — see the README's damaged-store note.
    const seedRun = await createHarness()
    const storeRoot = seedRun.storeRoot
    try {
      const state = await openUdState(seedRun.ctx.get('storageDomain')!)
      await seed(state)
    } finally {
      await seedRun.close({ keepStore: true })
    }

    const file = join(storeRoot, 'udt.json')
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    doc.tables.nodes['ml:broken'] = { title: 42, state: 'not-a-state' }
    writeFileSync(file, JSON.stringify(doc))

    const damaged = await createHarness({ storeRoot })
    try {
      await expect(openUdState(damaged.ctx.get('storageDomain')!)).rejects.toThrow(/stored record .ml:broken. in table .nodes. does not match its schema/)
    } finally {
      await damaged.close()
    }
  })

  it('leaves the rest of the file intact for a later repair', async () => {
    // The failure is contained: nothing is destroyed, so a hand repair — or a
    // future per-record switch — can still read everything else.
    const seedRun = await createHarness()
    const storeRoot = seedRun.storeRoot
    let goodId = ''
    try {
      const state = await openUdState(seedRun.ctx.get('storageDomain')!)
      goodId = (await seed(state)).nodeId
    } finally {
      await seedRun.close({ keepStore: true })
    }

    const file = join(storeRoot, 'udt.json')
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    doc.tables.nodes['ml:broken'] = { title: 42 }
    writeFileSync(file, JSON.stringify(doc))

    // Remove the one bad record the way a repair would, and everything is back.
    const repaired = JSON.parse(readFileSync(file, 'utf8'))
    delete repaired.tables.nodes['ml:broken']
    writeFileSync(file, JSON.stringify(repaired))

    const back = await createHarness({ storeRoot })
    try {
      const state = await openUdState(back.ctx.get('storageDomain')!)
      expect(state.listNodes('ml').map((node) => node.id)).toContain(goodId)
      expect(state.lessonCount()).toBe(1)
    } finally {
      await back.close()
    }
  })
})
