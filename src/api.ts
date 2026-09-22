/**
 * The plugin's browser-facing HTTP surface.
 *
 * Three rules shape everything here:
 *
 *   1. **Only what the UI needs.** The panel asks for an overview, one node's
 *      detail, and a lesson. There is no general query surface.
 *   2. **Views, never storage internals.** The browser receives a projection —
 *      ids, titles, relations, states, evidence — and never a raw record, a
 *      domain handle, a file path, or anything that would let it reason about
 *      where state lives. `storageDomain` is not reachable from the browser,
 *      by construction: this module is the only thing that touches it.
 *   3. **Every request passes the trust fence**, and every body is parsed and
 *      validated here. A rejected caller gets 403 and learns nothing.
 *
 * Registered lazily on `webServer`, because a profile without a web surface
 * should lose the UI rather than fail to load the plugin.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { CourseView, NodeView } from './contract.js'
import { buildPrototypeLesson } from './lesson.js'
import type { LessonRecord } from './lesson.js'
import type { CourseRecord, NodeRecord, UdState } from './state.js'
import { guarded } from './trust-fence.js'

/** The slice of `webServer` this module uses, declared structurally. */
export interface WebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void
  }): () => void
}

/** Largest request body accepted, in bytes. */
export const MAX_BODY_BYTES = 64 * 1024

/** Route prefix owned by this plugin. */
export const API_PREFIX = '/diagnostic-tutor/api'

/* -------------------------------------------------------------------------- */
/* Views — the browser never sees a storage record                            */
/* -------------------------------------------------------------------------- */

function nodeView(node: NodeRecord): NodeView {
  return {
    id: node.id,
    title: node.title,
    relation: node.relation,
    state: node.state,
    parentId: node.parentId ?? null,
    evidenceCount: node.evidence.length,
    updatedAt: node.updatedAt,
  }
}

function courseView(course: CourseRecord): CourseView {
  return {
    id: course.id,
    title: course.title,
    goal: course.goal,
    status: course.status,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  }
}

/* -------------------------------------------------------------------------- */
/* Transport helpers                                                          */
/* -------------------------------------------------------------------------- */

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  // This surface is same-origin only and must never be cached or framed.
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(payload))
}

function fail(res: ServerResponse, status: number, code: string, message?: string): void {
  sendJson(res, status, { ok: false, error: message === undefined ? { code } : { code, message } })
}

/** Read and parse a JSON body, bounded and never trusted. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  if (size === 0) return {}
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** A required non-empty string field, or `undefined` when absent/malformed. */
function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which course the panel should show: the learner's active goal, else the most
 * recently updated one. Read-only — the panel never changes focus implicitly.
 */
function currentCourse(state: UdState): CourseRecord | undefined {
  const activeId = state.readLearner().activeCourseId
  if (activeId !== undefined) {
    const active = state.readCourse(activeId)
    if (active !== undefined) return active
  }
  return state
    .listCourses()
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function handleOverview(state: UdState, res: ServerResponse): void {
  const course = currentCourse(state)
  if (course === undefined) {
    // An empty state is a normal state, not an error: the panel says so.
    sendJson(res, 200, { ok: true, course: null, nodes: [], lessonCount: 0 })
    return
  }
  sendJson(res, 200, {
    ok: true,
    course: courseView(course),
    nodes: state.listNodes(course.id).map(nodeView),
    lessonCount: state.lessonCount(),
  })
}

function handleNode(
  state: UdState,
  course: CourseRecord | undefined,
  nodeId: string,
  res: ServerResponse,
): void {
  if (course === undefined) return fail(res, 404, 'no-course')
  const node = state.readNode(nodeId)
  if (node === undefined || node.courseId !== course.id) return fail(res, 404, 'no-such-node')

  const parent = node.parentId === undefined ? undefined : state.readNode(node.parentId)
  const children = state
    .listNodes(course.id)
    .filter((candidate) => candidate.parentId === node.id)

  sendJson(res, 200, {
    ok: true,
    node: {
      ...nodeView(node),
      // The evidence trail is the whole point of a diagnosis map, so it is
      // included here and nowhere else.
      evidence: node.evidence.map((entry) => ({
        kind: entry.kind,
        at: entry.at,
        ...(entry.note === undefined ? {} : { note: entry.note }),
        ...(entry.readiness === undefined ? {} : { readiness: entry.readiness }),
      })),
    },
    parent: parent === undefined ? null : nodeView(parent),
    children: children.map(nodeView),
    lessonExists: state.lessonForNode(node.id) !== undefined,
  })
}

async function handleStartLesson(
  state: UdState,
  course: CourseRecord | undefined,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (course === undefined) return fail(res, 404, 'no-course')

  const body = await readJsonBody(req)
  if (body === undefined) return fail(res, 400, 'bad-body')
  const nodeId = stringField(body, 'nodeId')
  if (nodeId === undefined) return fail(res, 400, 'missing-node-id')

  const node = state.readNode(nodeId)
  if (node === undefined || node.courseId !== course.id) return fail(res, 404, 'no-such-node')

  // Idempotent: opening the same node twice returns the same lesson rather
  // than accumulating copies.
  const existing = state.lessonForNode(node.id)
  if (existing !== undefined) {
    sendJson(res, 200, { ok: true, lesson: existing, reused: true })
    return
  }

  const lesson: LessonRecord = buildPrototypeLesson({
    course,
    node,
    nodes: state.listNodes(course.id),
    now: new Date().toISOString(),
  })
  await state.writeLesson(lesson)
  sendJson(res, 200, { ok: true, lesson, reused: false })
}

/**
 * Build the request handler.
 *
 * @param state - the open persistence handle.
 * @returns a handler suitable for `webServer.register`.
 */
export function createApiHandler(state: UdState) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    const course = currentCourse(state)

    if (method === 'GET' && route === '/overview') return handleOverview(state, res)
    if (method === 'GET' && route === '/node') {
      const nodeId = url.searchParams.get('id')
      if (nodeId === null || nodeId.length === 0) return fail(res, 400, 'missing-id')
      return handleNode(state, course, nodeId, res)
    }
    if (method === 'POST' && route === '/lesson') return handleStartLesson(state, course, req, res)

    return fail(res, method === 'GET' || method === 'POST' ? 404 : 405, 'no-such-route')
  }
}

/**
 * Mount the API on the web server.
 *
 * @param server - the `webServer` service taken from `ctx`.
 * @param state - the open persistence handle.
 * @returns the route disposer.
 */
export function registerApi(server: WebServerLike, state: UdState): () => void {
  return server.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: guarded(createApiHandler(state)),
  })
}
