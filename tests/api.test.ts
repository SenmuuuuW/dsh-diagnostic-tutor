/**
 * The browser-facing API, including the trust fence.
 *
 * A bare `ctx.webServer.register()` route inherits no authentication, so the
 * fence is the only thing standing between a panel API and any page the user
 * happens to have open. It is tested here as both a unit (header rules) and an
 * integration (a rejected request produces no data at all).
 *
 * The other half of this file asserts what the API *refuses* to say: no storage
 * path, no domain internals, no raw record.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import * as plugin from '../src/index.js'
import { isLoopbackHostname, isTrustedApiRequest, guarded } from '../src/trust-fence.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import type { NodeRelation, NodeState } from '../src/vocabulary.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

/* -------------------------------------------------------------------------- */
/* Fakes                                                                      */
/* -------------------------------------------------------------------------- */

class FakeResponse {
  statusCode = 200
  headers: Record<string, string> = {}
  body = ''

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value
  }

  end(chunk?: string): void {
    if (chunk !== undefined) this.body += chunk
  }

  json(): Record<string, unknown> {
    return JSON.parse(this.body) as Record<string, unknown>
  }
}

interface RequestInit {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}

function fakeRequest(init: RequestInit = {}): IncomingMessage {
  const { method = 'GET', url = '/', headers = {}, body } = init
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080', ...headers },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body, 'utf8')
    },
  } as unknown as IncomingMessage
}

/** Issue a request against the real handler with the real state. */
async function call(
  state: UdState,
  init: RequestInit & { path?: string } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = new FakeResponse()
  const handler = guarded(createApiHandler(state))
  await handler(
    fakeRequest({ ...init, url: `${API_PREFIX}${init.path ?? '/overview'}` }),
    res as unknown as ServerResponse,
  )
  return { status: res.statusCode, json: res.body.length > 0 ? res.json() : {} }
}

/**
 * Open the plugin's storage domain directly.
 *
 * The API tests drive the handler with a real `UdState`, so they deliberately
 * do not also load the plugin — a domain can only be open once.
 */
async function openState(harness: TestHarness): Promise<UdState> {
  const facility = harness.ctx.get('storageDomain')
  if (!facility) throw new Error('harness: no storageDomain')
  return openUdState(facility)
}

/** Seed a goal the way `udt_goal_create` would, and return its node id. */
async function seedGoal(state: UdState, title: string, goal: string): Promise<string> {
  const now = new Date().toISOString()
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  await state.writeCourse({ id, title, goal, status: 'active', createdAt: now, updatedAt: now })
  await state.activateCourse(id, now)
  const goalNode = newNode({ id: `${id}:goal`, courseId: id, title, relation: 'goal', now })
  await state.writeNode(goalNode)
  return goalNode.id
}

/** Seed one child node the way `udt_map_update` would. */
async function seedNode(
  state: UdState,
  courseId: string,
  spec: { id: string; title: string; relation: NodeRelation; parentId: string; state?: NodeState; note?: string },
): Promise<void> {
  const now = new Date().toISOString()
  const node = newNode({
    id: spec.id,
    courseId,
    title: spec.title,
    relation: spec.relation,
    parentId: spec.parentId,
    ...(spec.state === undefined ? {} : { state: spec.state }),
    ...(spec.note === undefined ? {} : { evidence: [{ kind: 'diagnosis', at: now, note: spec.note }] }),
    now,
  })
  await state.writeNode(node)
}

/* -------------------------------------------------------------------------- */
/* Fence: unit                                                                */
/* -------------------------------------------------------------------------- */

describe('loopback hostname rule', () => {
  it('accepts only this machine', () => {
    for (const host of ['localhost', '[::1]', '127.0.0.1', '127.1.2.3']) {
      expect(isLoopbackHostname(host)).toBe(true)
    }
    for (const host of ['example.com', '192.168.1.5', 'localhost.evil.com', '127.0.0.1.evil.com', '0.0.0.0']) {
      expect(isLoopbackHostname(host)).toBe(false)
    }
  })
})

describe('isTrustedApiRequest', () => {
  const rules: [string, Record<string, string>, boolean][] = [
    ['a plain loopback request', { host: '127.0.0.1:3080' }, true],
    ['localhost with a same-origin fetch', { host: 'localhost:3080', 'sec-fetch-site': 'same-origin' }, true],
    ['a direct navigation (sec-fetch-site: none)', { host: 'localhost:3080', 'sec-fetch-site': 'none' }, true],
    ['a loopback origin', { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }, true],

    ['no Host header at all', {}, false],
    ['a public host', { host: 'example.com' }, false],
    ['a DNS-rebound name', { host: 'localhost.evil.com' }, false],
    ['a cross-site fetch', { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' }, false],
    ['a foreign origin', { host: '127.0.0.1:3080', origin: 'https://evil.com' }, false],
    ['an unparseable origin', { host: '127.0.0.1:3080', origin: 'not a url' }, false],
    ['an unparseable host', { host: 'http://[bad' }, false],
  ]

  for (const [name, headers, expected] of rules) {
    it(`${expected ? 'allows' : 'rejects'} ${name}`, () => {
      expect(isTrustedApiRequest({ headers })).toBe(expected)
    })
  }
})

describe('the guard answers a rejected request without data', () => {
  it('returns 403 and no payload', async () => {
    const res = new FakeResponse()
    let reached = false
    const handler = guarded(() => {
      reached = true
    })
    await handler(fakeRequest({ headers: { host: 'evil.com' } }), res as unknown as ServerResponse)

    expect(reached).toBe(false)
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ ok: false, error: { code: 'forbidden' } })
    // Nothing about the plugin's data may leak to a rejected caller.
    expect(JSON.stringify(res.json())).not.toContain('course')
  })
})

/* -------------------------------------------------------------------------- */
/* The plugin mounts the route itself                                         */
/* -------------------------------------------------------------------------- */

describe('the plugin mounts its browser API', () => {
  interface Route {
    kind: string
    path: string
    handler: unknown
  }

  /** A stand-in web server, provided as a real Cordis service. */
  function fakeServer(routes: Route[], state: { disposed: boolean }) {
    return {
      register(route: Route) {
        routes.push(route)
        return () => {
          state.disposed = true
        }
      },
    }
  }

  it('registers one prefix route and takes it away on unload', async () => {
    const harness = await createHarness()
    const routes: Route[] = []
    const lifecycle = { disposed: false }
    try {
      // The service must be provided by an active fiber, exactly as the web
      // bundles do it.
      await harness.ctx.plugin({
        name: 'test-web-server',
        apply(c): void {
          c.provide('webServer', fakeServer(routes, lifecycle) as never)
        },
      })

      const fiber = await harness.ctx.plugin(plugin)

      expect(routes).toHaveLength(1)
      expect(routes[0]?.kind).toBe('prefix')
      expect(routes[0]?.path).toBe(API_PREFIX)

      await fiber.dispose()
      expect(lifecycle.disposed).toBe(true)
    } finally {
      await harness.close()
    }
  })

  it('loads without a web server at all', async () => {
    // Headless, TUI and SDK profiles have no web surface; the plugin must lose
    // the UI, not fail to load.
    const harness = await createHarness()
    try {
      const fiber = await harness.ctx.plugin(plugin)
      expect(fiber.state).toBe(2)
      expect(harness.ctx.get('tools')?.get('udt_status')).toBeDefined()
    } finally {
      await harness.close()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* API: integration over real state                                           */
/* -------------------------------------------------------------------------- */

describe('API over real persisted state', () => {
  it('reports an empty runtime as a normal state, not an error', async () => {
    const harness = await createHarness()
    try {
      const state = await openState(harness)
      const { status, json } = await call(state, { path: '/overview' })
      expect(status).toBe(200)
      expect(json).toMatchObject({ ok: true, course: null, nodes: [] })
    } finally {
      await harness.close()
    }
  })

  it('returns the course and every node, and nothing about storage', async () => {
    const harness = await createHarness()
    try {
      const state = await openState(harness)
      await seedGoal(state, 'Machine Learning', 'Learn ML from weak math foundations')

      const { json } = await call(state, { path: '/overview' })
      const course = json.course as Record<string, unknown>
      const nodes = json.nodes as Record<string, unknown>[]

      expect(course.title).toBe('Machine Learning')
      expect(course.goal).toBe('Learn ML from weak math foundations')
      expect(nodes).toHaveLength(1)
      expect(nodes[0]).toMatchObject({ relation: 'goal', state: 'unconfirmed', parentId: null })

      // No storage internals may cross the wire.
      const wire = JSON.stringify(json)
      for (const forbidden of ['storageDomain', 'udt.json', 'dshHomePath', '/Users/', 'unit', 'domain']) {
        expect(wire).not.toContain(forbidden)
      }
    } finally {
      await harness.close()
    }
  })

  it('serves one node with its evidence, parent and children', async () => {
    const harness = await createHarness()
    try {
      const state = await openState(harness)
      const goalId = await seedGoal(state, 'Machine Learning', 'learn ml')
      await seedNode(state, 'machine-learning', {
        id: 'machine-learning:math',
        title: 'Math Foundations',
        relation: 'prerequisite',
        parentId: goalId,
        state: 'blocked',
        note: 'shaky maths',
      })

      const { status, json } = await call(state, { path: `/node?id=${encodeURIComponent(goalId)}` })
      expect(status).toBe(200)
      const node = json.node as Record<string, unknown>
      expect(node.title).toBe('Machine Learning')
      expect(Array.isArray(node.evidence)).toBe(true)

      const child = await call(state, { path: `/node?id=${encodeURIComponent('machine-learning:math')}` })
      const childNode = child.json.node as Record<string, unknown>
      expect(childNode.state).toBe('blocked')
      expect((childNode.evidence as { kind: string; note?: string }[])[0]?.note).toBe('shaky maths')
      expect((child.json.parent as Record<string, unknown>).title).toBe('Machine Learning')
    } finally {
      await harness.close()
    }
  })

  it('404s an unknown node and 400s a missing id', async () => {
    const harness = await createHarness()
    try {
      const state = await openState(harness)
      await seedGoal(state, 'Machine Learning', 'learn ml')

      expect((await call(state, { path: '/node?id=ghost' })).status).toBe(404)
      expect((await call(state, { path: '/node' })).status).toBe(400)
    } finally {
      await harness.close()
    }
  })

  it('builds a lesson once and reuses it after that', async () => {
    const harness = await createHarness()
    try {
      const state = await openState(harness)
      const goalId = await seedGoal(state, 'Machine Learning', 'learn ml')

      const first = await call(state, {
        method: 'POST',
        path: '/lesson',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nodeId: goalId }),
      })
      expect(first.status).toBe(200)
      expect(first.json.ok).toBe(true)
      expect(first.json.reused).toBe(false)
      const lesson = first.json.lesson as { blocks: { type: string }[]; origin: string }
      expect(lesson.origin).toBe('prototype')
      expect(lesson.blocks.map((block) => block.type)).toEqual([
        'text',
        'example',
        'diagram',
        'check',
      ])

      const second = await call(state, {
        method: 'POST',
        path: '/lesson',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nodeId: goalId }),
      })
      expect(second.json.reused).toBe(true)

      // And it really was persisted, not just returned.
      expect(state.lessonCount()).toBe(1)
    } finally {
      await harness.close()
    }
  })

  it('rejects malformed input rather than guessing', async () => {
    const harness = await createHarness()
    try {
      const state = await openState(harness)
      await seedGoal(state, 'Machine Learning', 'learn ml')

      const notJson = await call(state, { method: 'POST', path: '/lesson', body: 'not json' })
      expect(notJson.status).toBe(400)

      const arrayBody = await call(state, { method: 'POST', path: '/lesson', body: '[1,2,3]' })
      expect(arrayBody.status).toBe(400)

      const noNode = await call(state, { method: 'POST', path: '/lesson', body: '{}' })
      expect(noNode.status).toBe(400)
      expect((noNode.json.error as { code: string }).code).toBe('missing-node-id')
    } finally {
      await harness.close()
    }
  })

  it('rejects an oversized body', async () => {
    const harness = await createHarness()
    try {
      const state = await openState(harness)
      await seedGoal(state, 'Machine Learning', 'learn ml')
      const huge = JSON.stringify({ nodeId: 'x'.repeat(70 * 1024) })
      expect((await call(state, { method: 'POST', path: '/lesson', body: huge })).status).toBe(400)
    } finally {
      await harness.close()
    }
  })

  it('404s an unknown route and 405s an unsupported method', async () => {
    const harness = await createHarness()
    try {
      const state = await openState(harness)
      expect((await call(state, { path: '/nope' })).status).toBe(404)
      expect((await call(state, { method: 'DELETE', path: '/overview' })).status).toBe(405)
    } finally {
      await harness.close()
    }
  })

  it('refuses every request that fails the fence, before touching state', async () => {
    const harness = await createHarness()
    try {
      const state = await openState(harness)
      await seedGoal(state, 'Machine Learning', 'learn ml')

      for (const headers of [
        { host: 'example.com' },
        { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' },
        { host: '127.0.0.1:3080', origin: 'https://evil.com' },
      ]) {
        const { status, json } = await call(state, { headers })
        expect(status).toBe(403)
        expect(json).toEqual({ ok: false, error: { code: 'forbidden' } })
      }
    } finally {
      await harness.close()
    }
  })
})
