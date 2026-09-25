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

import type { CourseView, FocusView, NextStepView, NodeView } from './contract.js'
import {
  beginHandoff,
  handoffView,
  withFocusRecorded,
  withObserved,
  withPromptFailure,
  withPrompted,
} from './handoff.js'
import type { HandoffView } from './handoff.js'
import type { FocusPromptResult } from './prompt.js'
import { focusPromptText } from './prompt.js'
import type { CourseRecord, FocusRecord, NodeRecord, UdState } from './state.js'
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

function focusView(focus: FocusRecord, node: NodeRecord): FocusView {
  return {
    courseId: focus.courseId,
    nodeId: focus.nodeId,
    nodeTitle: node.title,
    startedAt: focus.startedAt,
    status: focus.status,
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

/** The active focus for one course, joined with its node, as a view. */
function focusOf(state: UdState, courseId: string): FocusView | null {
  const focus = state.readFocus(courseId)
  if (focus === undefined || focus.status !== 'active') return null
  const node = state.readNode(focus.nodeId)
  if (node === undefined) return null
  return focusView(focus, node)
}

/**
 * The recommendation attached to the current focus, if it has one and the
 * learner has not acted on it.
 *
 * "Attached to the focus" is the whole test: starting a new focus writes a
 * fresh record without `nextStepId`, so acting on a recommendation clears it
 * without anything having to remember that it did.
 */
function nextStepOf(state: UdState, courseId: string): NextStepView | null {
  const focus = state.readFocus(courseId)
  if (focus?.nextStepId === undefined) return null
  const step = state.readNextStep(focus.nextStepId)
  if (step === undefined) return null
  const from = state.readNode(step.fromNodeId)
  const target = step.targetNodeId === undefined ? undefined : state.readNode(step.targetNodeId)
  return {
    fromNodeId: step.fromNodeId,
    fromNodeTitle: from?.title ?? step.fromNodeId,
    targetNodeId: step.targetNodeId ?? null,
    targetNodeTitle: target?.title ?? null,
    action: step.action,
    reason: step.reason,
    createdAt: step.createdAt,
  }
}

function handleOverview(state: UdState, deps: ApiDeps, res: ServerResponse): void {
  const course = currentCourse(state)
  if (course === undefined) {
    // An empty state is a normal state, not an error: the panel says so.
    sendJson(res, 200, { ok: true, course: null, nodes: [], focus: null, nextStep: null, lessonCount: 0 })
    return
  }
  sendJson(res, 200, {
    ok: true,
    course: courseView(course),
    nodes: state.listNodes(course.id).map(nodeView),
    focus: focusOf(state, course.id),
    nextStep: nextStepOf(state, course.id),
    teachingBrain: deps.teachingBrain ?? true,
    // The handoff for whichever node is focused, so a reload or a restart
    // rebuilds the progress line instead of showing a blank wait.
    handoff: (() => {
      const focus = state.readFocus(course.id)
      return focus === undefined ? null : handoffFor(state, focus.nodeId, Date.now())
    })(),
    lessonCount: state.lessonCount(),
  })
}

/** `GET /lesson?nodeId=` — the lesson the tutor has written for a node, if any. */
function handleLesson(
  state: UdState,
  course: CourseRecord | undefined,
  nodeId: string,
  res: ServerResponse,
): void {
  if (course === undefined) return fail(res, 404, 'no-course')
  const node = state.readNode(nodeId)
  if (node === undefined || node.courseId !== course.id) return fail(res, 404, 'no-such-node')
  sendJson(res, 200, { ok: true, lesson: state.lessonForNode(nodeId) ?? null })
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

/** How long a handoff is left alone before another request is treated as a retry. */
const HANDOFF_DEDUPE_MS = 3000

/** Build the handoff view, which is what a surface renders. */
function handoffFor(state: UdState, nodeId: string, nowMs: number): HandoffView | null {
  const record = state.readHandoff(nodeId)
  if (record === undefined) return null
  return handoffView(record, nowMs, state.lessonForNode(nodeId) !== undefined)
}

/**
 * `POST /focus { nodeId, sessionId? }` — what Start learning and Continue do.
 *
 * Three steps, in this order and deliberately:
 *
 *   1. **record the handoff and the focus** — this is the durable part, and it
 *      must exist even when no agent can be reached;
 *   2. **wake the tutor** — a failure here is reported, never rolled back, since
 *      the focus is what both sides read;
 *   3. **stamp the prompt** — so the timing chain has a start and the UI has
 *      something to say while the model runs.
 *
 * Idempotent by target node. A second request while the same handoff is fresh
 * returns it untouched, which is what makes a double click harmless; a request
 * after it has gone quiet is a retry and bumps the attempt count.
 */
async function handleStartFocus(
  state: UdState,
  deps: ApiDeps,
  course: CourseRecord | undefined,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (course === undefined) return fail(res, 404, 'no-course')

  const body = await readJsonBody(req)
  if (body === undefined) return fail(res, 400, 'bad-body')
  const nodeId = stringField(body, 'nodeId')
  if (nodeId === undefined) return fail(res, 400, 'missing-node-id')
  const sessionId = stringField(body, 'sessionId')

  const node = state.readNode(nodeId)
  if (node === undefined || node.courseId !== course.id) return fail(res, 404, 'no-such-node')

  const now = new Date()
  const previous = state.readHandoff(nodeId)

  // Double-click protection: the same target, still in flight and recent, is
  // the same handoff. Not an error — just nothing new to do.
  if (
    previous !== undefined &&
    previous.status !== 'failed' &&
    now.getTime() - Date.parse(previous.requestedAt) < HANDOFF_DEDUPE_MS
  ) {
    const focus = state.readFocus(course.id)
    sendJson(res, 200, {
      ok: true,
      focus: focus === undefined ? null : focusView(focus, node),
      prompted: previous.promptedAt !== undefined,
      handoff: handoffFor(state, nodeId, now.getTime()),
      deduped: true,
    })
    return
  }

  let handoff = beginHandoff({
    courseId: course.id,
    fromNodeId: previous?.fromNodeId ?? state.readFocus(course.id)?.nodeId ?? nodeId,
    targetNodeId: nodeId,
    now: now.toISOString(),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(previous === undefined ? {} : { previous }),
  })
  await state.writeHandoff(handoff)

  let focus: FocusRecord
  try {
    focus = await state.startFocus(course.id, nodeId, now.toISOString())
  } catch (error) {
    // Covers an unknown node and a node from another course alike.
    return fail(res, 404, 'no-such-node', (error as Error).message)
  }
  handoff = withFocusRecorded(handoff, new Date().toISOString())
  await state.writeHandoff(handoff)

  const outcome: FocusPromptResult = deps.prompt(sessionId, focusPromptText(course, node))
  handoff = outcome.prompted
    ? withPrompted(handoff, new Date().toISOString())
    : withPromptFailure(handoff, new Date().toISOString(), outcome.reason ?? 'the tutor was not reached')
  await state.writeHandoff(handoff)

  sendJson(res, 200, {
    ok: true,
    focus: focusView(focus, node),
    prompted: outcome.prompted,
    ...(outcome.reason === undefined ? {} : { promptReason: outcome.reason }),
    handoff: handoffFor(state, nodeId, Date.now()),
  })
}

/** `POST /handoff/observed { nodeId }` — a surface has rendered the lesson. */
async function handleObserved(
  state: UdState,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req)
  if (body === undefined) return fail(res, 400, 'bad-body')
  const nodeId = stringField(body, 'nodeId')
  if (nodeId === undefined) return fail(res, 400, 'missing-node-id')

  const record = state.readHandoff(nodeId)
  if (record === undefined) return fail(res, 404, 'no-handoff')

  await state.writeHandoff(withObserved(record, new Date().toISOString()))
  sendJson(res, 200, { ok: true, handoff: handoffFor(state, nodeId, Date.now()) })
}

export interface ApiDeps {
  readonly state: UdState
  /**
   * Wake the tutor for a session. Injected rather than reached for, so the API
   * can be exercised without an agent registry.
   */
  readonly prompt: (sessionId: string | undefined, text: string) => FocusPromptResult
  /**
   * Whether a teaching brain was detected. Defaults to `true` so a caller that
   * does not model one is not made to claim it is missing.
   */
  readonly teachingBrain?: boolean
}

/**
 * Build the request handler.
 *
 * @param deps - the open state handle and the prompt hook.
 * @returns a handler suitable for `webServer.register`.
 */
export function createApiHandler(deps: ApiDeps) {
  const { state } = deps
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    const course = currentCourse(state)

    if (method === 'GET' && route === '/overview') return handleOverview(state, deps, res)
    if (method === 'GET' && route === '/node') {
      const nodeId = url.searchParams.get('id')
      if (nodeId === null || nodeId.length === 0) return fail(res, 400, 'missing-id')
      return handleNode(state, course, nodeId, res)
    }
    if (method === 'GET' && route === '/lesson') {
      const nodeId = url.searchParams.get('nodeId')
      if (nodeId === null || nodeId.length === 0) return fail(res, 400, 'missing-node-id')
      return handleLesson(state, course, nodeId, res)
    }
    if (method === 'POST' && route === '/focus') {
      return handleStartFocus(state, deps, course, req, res)
    }
    if (method === 'POST' && route === '/handoff/observed') {
      return handleObserved(state, req, res)
    }

    return fail(res, method === 'GET' || method === 'POST' ? 404 : 405, 'no-such-route')
  }
}

/**
 * Mount the API on the web server.
 *
 * @param server - the `webServer` service taken from `ctx`.
 * @param deps - the open state handle and the prompt hook.
 * @returns the route disposer.
 */
export function registerApi(server: WebServerLike, deps: ApiDeps): () => void {
  return server.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: guarded(createApiHandler(deps)),
  })
}
