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
import { resolveLearningSession } from './project-session.js'
import { buildDiagnostics } from './diagnostics.js'
import type { Journal } from './journal.js'
import { guarded } from './trust-fence.js'
import { handlePathApi } from './path-api.js'
import { buildIcs, sortTasks, taskView } from './plan.js'
import { buildInsights } from './insights.js'
import { REVIEW_RATINGS, dueCards, scheduleReview } from './review.js'
import type { ReviewCard } from './review.js'
import type { ReviewCardView } from './contract.js'

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
 * The focus this conversation is working on, or nothing.
 *
 * Learning state belongs to a conversation, not to a course. The course and its
 * map and its lessons are shared knowledge and stay visible to everyone; where
 * *this* conversation has got to is not. A focus carrying a different
 * conversation's id — or none at all, which means it predates the field — is
 * not this panel's to show, so it reports nothing rather than someone else's
 * lesson under the learner's chat.
 *
 * @param state - the runtime.
 * @param courseId - the course being viewed.
 * @param sessionId - the conversation asking, when it said.
 * @returns the focus record, or undefined.
 */
function focusBelongingTo(state: UdState, courseId: string, sessionId: string | undefined): FocusRecord | undefined {
  // No conversation named means no conversation's state: guessing is what let
  // one conversation's lesson appear under another's chat.
  if (sessionId === undefined || sessionId.length === 0) return undefined
  return state.readFocus(sessionId, courseId)
}

/** The project a conversation has open, if any. */
function projectFor(state: UdState, sessionId: string | undefined): CourseRecord | undefined {
  return state.resolveProject(sessionId).course
}

/**
 * Every Learning Project, with the numbers the library shows on a card.
 *
 * Learner-level, like the maps and lessons themselves: this is what the
 * learner has, not what this conversation is doing with it.
 */
function libraryOf(state: UdState): {
  id: string
  title: string
  goal: string
  confirmed: number
  total: number
  updatedAt: string
  status: 'accepted' | 'active' | 'legacy'
  acceptedVersion: number | null
}[] {
  return state
    .listCourses()
    .map((course) => {
      const nodes = state.listNodes(course.id)
      const learningPath = state.readPath(course.id)
      const status: 'accepted' | 'active' | 'legacy' = learningPath?.acceptedVersion != null
        ? 'accepted'
        : learningPath !== undefined && (learningPath.brief !== null || learningPath.assessment !== null || learningPath.curricula.length > 0)
          ? 'active'
          : 'legacy'
      return {
        id: course.id,
        title: course.title,
        goal: course.goal,
        confirmed: nodes.filter((node) => node.state === 'confirmed').length,
        total: nodes.length,
        updatedAt: course.updatedAt,
        status,
        acceptedVersion: learningPath?.acceptedVersion ?? null,
      }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function reviewView(card: ReviewCard): ReviewCardView {
  return {
    id: card.id, front: card.front, back: card.back, dueAt: card.dueAt,
    ...(card.courseId === undefined ? {} : { courseId: card.courseId }),
    ...(card.nodeId === undefined ? {} : { nodeId: card.nodeId }),
    ...(card.sourceRefs === undefined ? {} : { sourceRefs: card.sourceRefs }),
  }
}

async function handleOverview(state: UdState, deps: ApiDeps, sessionId: string | undefined, res: ServerResponse): Promise<void> {
  // Availability belongs to the requesting conversation and can change while
  // the plugin stays loaded. A failed observation is inconclusive.
  let teachingBrain: boolean | null = null
  try {
    teachingBrain = typeof deps.teachingBrain === 'function'
      ? await deps.teachingBrain(sessionId)
      : deps.teachingBrain ?? null
  } catch {
    // The runtime remains readable if discovery is temporarily unavailable.
  }
  const { selection, course } = state.resolveProject(sessionId)
  const library = libraryOf(state)
  if (course === undefined) {
    // No project open in this conversation. That is the library, not an error,
    // and not an empty runtime: the projects it lists are real and shared.
    sendJson(res, 200, {
      ok: true,
      selection,
      course: null,
      nodes: [],
      focus: null,
      nextStep: null,
      handoff: null,
      teachingBrain,
      lessonCount: state.lessonCount(),
      tasks: sortTasks(state.listTasks()).map(taskView),
      library,
    })
    return
  }
  const mine = focusBelongingTo(state, course.id, sessionId)
  sendJson(res, 200, {
    ok: true,
    selection,
    course: courseView(course),
    nodes: state.listNodes(course.id).map(nodeView),
    focus: mine === undefined ? null : focusOf(state, sessionId ?? '', course.id),
    // A decision is attached to a focus, so it follows the same rule.
    nextStep: mine === undefined ? null : nextStepOf(state, sessionId ?? '', course.id),
    teachingBrain,
    // The handoff for whichever node is focused, so a reload or a restart
    // rebuilds the progress line instead of showing a blank wait.
    handoff: mine === undefined ? null : handoffFor(state, sessionId ?? '', mine.nodeId, Date.now()),
    lessonCount: state.lessonCount(),
    tasks: sortTasks(state.listTasks()).map(taskView),
    library,
  })
}

/** The active focus for one course, joined with its node, as a view. */
function focusOf(state: UdState, sessionId: string, courseId: string): FocusView | null {
  const focus = state.readFocus(sessionId, courseId)
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
function nextStepOf(state: UdState, sessionId: string, courseId: string): NextStepView | null {
  const focus = state.readFocus(sessionId, courseId)
  if (focus?.nextStepId === undefined) return null
  const step = state.readNextStep(sessionId, focus.nextStepId)
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

/**
 * The focus this conversation is working on, or nothing.
 *
 * Learning state belongs to a conversation, not to a course. The course and its
 * map and its lessons are shared knowledge and stay visible to everyone; where
 * *this* conversation has got to is not. A focus carrying a different
 * conversation's id — or none at all, which means it predates the field — is
 * not this panel's to show, so it reports nothing rather than someone else's
 * lesson under the learner's chat.
 *
 * @param state - the runtime.
 * @param courseId - the course being viewed.
 * @param sessionId - the conversation asking, when it said.
 * @returns the focus record, or undefined.
 */
/**
 * `POST /project { sessionId, courseId? }` — choose what this conversation learns.
 *
 * The choice is the conversation's, and that is the whole point of the route:
 * the projects are shared, but opening one is a decision a conversation makes
 * and keeps. Sending no `courseId` selects "start something new", which is a
 * deliberate state — it stops the library being shown and stops any project
 * being opened, until the tutor creates one here.
 *
 * Selecting never fabricates execution state. There is no focus until the
 * learner starts a node, so switching projects shows "no learning focus yet"
 * rather than pretending the previous project's position carried over.
 */
async function handleSelectProject(
  state: UdState,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req)
  if (body === undefined) return fail(res, 400, 'bad-body')
  const sessionId = stringField(body, 'sessionId')
  if (sessionId === undefined) return fail(res, 400, 'missing-session-id')

  const courseId = stringField(body, 'courseId')
  if (courseId !== undefined && state.readCourse(courseId) === undefined) {
    return fail(res, 404, 'no-such-course')
  }

  const record = await state.selectProject(sessionId, courseId, new Date().toISOString())
  sendJson(res, 200, { ok: true, project: record })
}

/** `GET /lesson?nodeId=` — the lesson the tutor has written for a node, if any. */
function handleLesson(state: UdState, nodeId: string, res: ServerResponse): void {
  // Resolved from the node, not from the caller's project: a lesson belongs to
  // the learner, and asking for one should not depend on what this conversation
  // happens to have open.
  const node = state.readNode(nodeId)
  if (node === undefined || state.readCourse(node.courseId) === undefined) {
    return fail(res, 404, 'no-such-node')
  }
  sendJson(res, 200, { ok: true, lesson: state.lessonForNode(nodeId) ?? null })
}

function handleNode(state: UdState, nodeId: string, res: ServerResponse): void {
  const node = state.readNode(nodeId)
  const course = node === undefined ? undefined : state.readCourse(node.courseId)
  if (node === undefined || course === undefined) return fail(res, 404, 'no-such-node')

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
function handoffFor(state: UdState, sessionId: string, nodeId: string, nowMs: number): HandoffView | null {
  const record = state.readHandoff(sessionId, nodeId)
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
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req)
  if (body === undefined) return fail(res, 400, 'bad-body')
  const nodeId = stringField(body, 'nodeId')
  if (nodeId === undefined) return fail(res, 400, 'missing-node-id')
  const sessionId = stringField(body, 'sessionId')
  // Required: a focus that cannot say whose it is cannot be shown to anyone,
  // so accepting one would create state nobody could ever see.
  if (sessionId === undefined) return fail(res, 400, 'missing-session-id')

  // The course comes from the NODE, not from what this conversation had open.
  // Starting a node in a project is choosing that project — the other
  // direction is the one that must not happen, and does not: selecting a
  // project never invents a focus.
  const node = state.readNode(nodeId)
  const course = node === undefined ? undefined : state.readCourse(node.courseId)
  if (node === undefined || course === undefined) return fail(res, 404, 'no-such-node')
  const chosen = state.readProject(sessionId)
  if (chosen?.courseId !== course.id) {
    await state.selectProject(sessionId, course.id, new Date().toISOString())
  }

  const now = new Date()
  const previous = state.readHandoff(sessionId, nodeId)

  // Double-click protection: the same target, still in flight and recent, is
  // the same handoff. Not an error — just nothing new to do.
  if (
    previous !== undefined &&
    previous.status !== 'failed' &&
    now.getTime() - Date.parse(previous.requestedAt) < HANDOFF_DEDUPE_MS
  ) {
    const focus = state.readFocus(sessionId, course.id)
    sendJson(res, 200, {
      ok: true,
      focus: focus === undefined ? null : focusView(focus, node),
      prompted: previous.promptedAt !== undefined,
      handoff: handoffFor(state, sessionId, nodeId, now.getTime()),
      deduped: true,
    })
    return
  }

  let handoff = beginHandoff({
    courseId: course.id,
    fromNodeId: previous?.fromNodeId ?? state.readFocus(sessionId, course.id)?.nodeId ?? nodeId,
    targetNodeId: nodeId,
    now: now.toISOString(),
    sessionId,
    ...(previous === undefined ? {} : { previous }),
  })
  await state.writeHandoff(handoff)

  let focus: FocusRecord
  try {
    focus = await state.startFocus(course.id, nodeId, now.toISOString(), sessionId)
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
    handoff: handoffFor(state, sessionId, nodeId, Date.now()),
  })
}

/**
 * `GET /export` — everything the learner owns, as one file.
 *
 * Served as an attachment with a dated filename so a browser saves it rather
 * than rendering it. The document is self-describing (`format` + `version`), so
 * it explains itself on a disk years from now without this plugin installed.
 */
function handleExport(state: UdState, res: ServerResponse): void {
  const now = new Date()
  const document = state.exportState(now.toISOString())
  const body = JSON.stringify(document, null, 2)
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-disposition', `attachment; filename="dsh-diagnostic-tutor-${now.toISOString().slice(0, 10)}.json"`)
  res.setHeader('cache-control', 'no-store')
  res.statusCode = 200
  res.end(body)
}

/**
 * `POST /reset` — delete everything and return to first run.
 *
 * Destructive and irreversible on purpose. An undo would mean keeping a copy of
 * exactly what the learner asked to remove, which defeats the request. The
 * surface asks twice; the route does as it is told.
 */
async function handleReset(state: UdState, res: ServerResponse): Promise<void> {
  await state.resetState(new Date().toISOString())
  await state.ensureLearner(new Date().toISOString())
  sendJson(res, 200, { ok: true, reset: true })
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
  const sessionId = stringField(body, 'sessionId')
  if (sessionId === undefined) return fail(res, 400, 'missing-session-id')

  const record = state.readHandoff(sessionId, nodeId)
  if (record === undefined) return fail(res, 404, 'no-handoff')

  await state.writeHandoff(withObserved(record, new Date().toISOString()))
  sendJson(res, 200, { ok: true, handoff: handoffFor(state, sessionId, nodeId, Date.now()) })
}

/**
 * `GET /preferences` — the learner's interface language, if one is saved.
 *
 * The value lives on the learner singleton rather than in the browser so it
 * survives DSH restarts (the web port changes, and browser storage does not
 * follow it) and applies to every conversation. It is a display preference
 * only: nothing about the diagnosis, teaching or stored evidence changes.
 */
function handlePreferences(state: UdState, res: ServerResponse): void {
  const language = state.readLearner().preferredLanguage
  sendJson(res, 200, {
    ok: true,
    language: language === 'en' || language === 'zh' ? language : null,
  })
}

/** One of the two languages this build ships copy for. */
const LANGUAGES = ['en', 'zh'] as const

/**
 * `POST /preferences/language { language }` — remember the interface language.
 *
 * Validated here rather than trusted from the body: an unknown value would
 * leave the UI without copy after the next load, so it is rejected instead of
 * stored.
 */
async function handleSetLanguage(state: UdState, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req)
  if (body === undefined) return fail(res, 400, 'bad-body')
  const language = body.language
  if (typeof language !== 'string' || !LANGUAGES.includes(language as (typeof LANGUAGES)[number])) {
    return fail(res, 400, 'unsupported-language')
  }
  const now = new Date().toISOString()
  await state.updateLearner({ preferredLanguage: language }, now)
  sendJson(res, 200, { ok: true, language })
}

/**
 * `GET /project/session?courseId=&sessionId=` — which conversation resumes a project.
 *
 * A project is shared, but where it was last studied is not. The browser asks
 * this before "entering learning" so continuing a project opens the
 * conversation that actually holds its focus/run instead of rebinding the
 * project to whichever conversation happens to be on screen. Read-only: no
 * selection is written by answering it.
 */
function handleProjectSession(state: UdState, url: URL, res: ServerResponse): void {
  const courseId = url.searchParams.get('courseId')
  if (courseId === null || courseId.length === 0) return fail(res, 400, 'missing-course-id')
  const resolved = resolveLearningSession(state, courseId, url.searchParams.get('sessionId') ?? undefined)
  if (resolved === null) return fail(res, 404, 'no-such-course')
  sendJson(res, 200, { ok: true, sessionId: resolved.sessionId, reason: resolved.reason })
}

export interface ApiDeps {
  readonly state: UdState
  /**
   * Wake the tutor for a session. Injected rather than reached for, so the API
   * can be exercised without an agent registry.
   */
  readonly prompt: (sessionId: string | undefined, text: string) => FocusPromptResult
  /**
   * Observe availability for the requesting session on each overview. A
   * constant is accepted by standalone callers; omitted means inconclusive.
   */
  readonly teachingBrain?: boolean | null | ((sessionId: string | undefined) => Promise<boolean | null>)
  /** Local content-free event journal. Absent in tests and in older callers. */
  readonly journal?: Journal | undefined
  /** Installed plugin version, for the diagnostics header. */
  readonly pluginVersion?: string | undefined
  /** Fire-and-forget lifecycle hook used by the journal (never awaited). */
  readonly onEvent?: ((event: string, fields?: Readonly<Record<string, unknown>>) => void) | undefined
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
    if (await handlePathApi(route, req, res, deps, url)) return
    // Read per request, not once: a conversation's project is its own, and the
    // route that changes it must not be answered from a value captured before.
    const asker = url.searchParams.get('sessionId') ?? undefined
    const course = projectFor(state, asker)

    if (method === 'GET' && route === '/overview') {
      return handleOverview(state, deps, url.searchParams.get('sessionId') ?? undefined, res)
    }
    if (method === 'GET' && route === '/project/session') return handleProjectSession(state, url, res)
    if (method === 'GET' && route === '/diagnostics') {
      if (deps.journal === undefined) return fail(res, 503, 'diagnostics-disabled')
      try {
        sendJson(res, 200, await buildDiagnostics(state, deps.journal, { ...(deps.pluginVersion === undefined ? {} : { pluginVersion: deps.pluginVersion }) }))
      } catch (cause) {
        deps.onEvent?.('diagnostics.error', { error: (cause as Error).message.slice(0, 240) })
        return fail(res, 500, 'diagnostics-unavailable')
      }
      return
    }
    if (method === 'POST' && route === '/project') return await handleSelectProject(state, req, res)
    if (method === 'GET' && route === '/export') return handleExport(state, res)
    if (method === 'POST' && route === '/reset') return await handleReset(state, res)
    if (method === 'POST' && route === '/plan/task') {
      const input = await readJsonBody(req)
      const taskId = input === undefined ? undefined : stringField(input, 'taskId')
      if (taskId === undefined) return fail(res, 400, 'missing-task-id')
      const task = state.readTask(taskId)
      if (task === undefined) return fail(res, 404, 'no-such-task')
      const status = input?.status === 'open' || input?.status === 'archived' ? input.status : 'done'
      await state.writeTask({ ...task, status, updatedAt: new Date().toISOString() })
      return sendJson(res, 200, { ok: true, tasks: sortTasks(state.listTasks()).map(taskView) })
    }
    if (method === 'GET' && route === '/insights') {
      const courseId = url.searchParams.get('courseId') ?? course?.id
      if (courseId === undefined || courseId.length === 0) return fail(res, 404, 'no-such-course')
      const target = state.readCourse(courseId)
      if (target === undefined) return fail(res, 404, 'no-such-course')
      return sendJson(res, 200, buildInsights(state, target, new Date().toISOString()))
    }
    if (method === 'POST' && route === '/review/undo') {
      const input = await readJsonBody(req)
      const cardId = input === undefined ? undefined : stringField(input, 'cardId')
      if (cardId === undefined) return fail(res, 400, 'missing-card-id')
      const card = state.readReviewCard(cardId)
      if (card === undefined) return fail(res, 404, 'no-such-review-card')
      const log = state.listReviewLog().filter((entry) => entry.cardId === cardId).sort((left, right) => left.at.localeCompare(right.at)).at(-1)
      if (log === undefined || log.previousIntervalDays === undefined || log.previousEase === undefined || log.previousReps === undefined || log.previousLapses === undefined) return fail(res, 409, 'cannot-undo')
      const restored = {
        ...card, dueAt: log.previousDue, intervalDays: log.previousIntervalDays, ease: log.previousEase,
        reps: log.previousReps, lapses: log.previousLapses, updatedAt: new Date().toISOString(),
      }
      await state.writeReviewCard(restored)
      await state.deleteReviewLog(log.id)
      return sendJson(res, 200, { ok: true, card: reviewView(restored), remaining: dueCards(state.listReviewCards()).length })
    }
    if (method === 'GET' && route === '/review') {
      const cards = dueCards(state.listReviewCards()).slice(0, 20).map(reviewView)
      return sendJson(res, 200, { ok: true, cards, count: cards.length })
    }
    if (method === 'POST' && route === '/review/grade') {
      const input = await readJsonBody(req)
      const cardId = input === undefined ? undefined : stringField(input, 'cardId')
      const rating = input === undefined ? undefined : stringField(input, 'rating')
      if (cardId === undefined) return fail(res, 400, 'missing-card-id')
      if (rating === undefined || !(REVIEW_RATINGS as readonly string[]).includes(rating)) return fail(res, 400, 'invalid-rating')
      const card = state.readReviewCard(cardId)
      if (card === undefined) return fail(res, 404, 'no-such-review-card')
      const graded = scheduleReview(card, rating as (typeof REVIEW_RATINGS)[number])
      await state.writeReviewCard(graded.card)
      await state.writeReviewLog(graded.log)
      return sendJson(res, 200, { ok: true, card: reviewView(graded.card), remaining: dueCards(state.listReviewCards()).length })
    }
    if (method === 'GET' && route === '/plan/ics') {
      const calendar = buildIcs(state.listTasks(), new Date())
      res.statusCode = 200
      res.setHeader('content-type', 'text/calendar; charset=utf-8')
      res.setHeader('content-disposition', 'attachment; filename="dsh-diagnostic-tutor-plan.ics"')
      res.setHeader('cache-control', 'no-store')
      res.end(calendar)
      return
    }
    if (method === 'GET' && route === '/source') {
      const sourceId = url.searchParams.get('id')
      if (sourceId === null || sourceId.length === 0) return fail(res, 400, 'missing-id')
      const source = state.readSource(sourceId)
      if (source === undefined) return fail(res, 404, 'no-such-source')
      return sendJson(res, 200, { ok: true, source })
    }
    if (method === 'GET' && route === '/node') {
      const nodeId = url.searchParams.get('id')
      if (nodeId === null || nodeId.length === 0) return fail(res, 400, 'missing-id')
      return handleNode(state, nodeId, res)
    }
    if (method === 'GET' && route === '/lesson') {
      const nodeId = url.searchParams.get('nodeId')
      if (nodeId === null || nodeId.length === 0) return fail(res, 400, 'missing-node-id')
      return handleLesson(state, nodeId, res)
    }
    if (method === 'POST' && route === '/focus') {
      return handleStartFocus(state, deps, req, res)
    }
    if (method === 'POST' && route === '/handoff/observed') {
      return handleObserved(state, req, res)
    }
    if (method === 'GET' && route === '/preferences') {
      return handlePreferences(state, res)
    }
    if (method === 'POST' && route === '/preferences/language') {
      return await handleSetLanguage(state, req, res)
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
