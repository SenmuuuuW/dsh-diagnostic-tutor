/** HTTP planning actions; acceptance and skipping diagnosis are explicit UI actions. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import type { ApiDeps } from './api.js'
import { activeAttempt } from './path.js'
import {
  acceptCurriculum, beginCourseItem, pathView, reservePathRequest, saveAssessment,
  saveBrief, selectedProject, stampCoursePrompt, stampPathRequest,
} from './path-runtime.js'

const identity = z.object({ courseId: z.string().min(1), sessionId: z.string().min(1), expectedRevision: z.number().int().min(0) })
function send(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(value))
}
async function body(req: IncomingMessage) {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const part = Buffer.from(chunk as Uint8Array)
    if ((size += part.length) > 65536) throw new Error('body-too-large')
    chunks.push(part)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
export async function handlePathApi(route: string, req: IncomingMessage, res: ServerResponse, deps: ApiDeps, url: URL): Promise<boolean> {
  if (route !== '/path' && !route.startsWith('/path/')) return false
  try {
    if (req.method === 'GET' && route === '/path') {
      const sessionId = url.searchParams.get('sessionId') || undefined
      const courseId = url.searchParams.get('courseId') || deps.state.resolveProject(sessionId).course?.id
      if (!courseId) throw new Error('no-selected-project')
      send(res, 200, pathView(deps.state, courseId, sessionId))
      return true
    }
    if (req.method !== 'POST') { send(res, 405, { ok: false, error: { code: 'method-not-allowed' } }); return true }
    const raw = await body(req)
    const base = identity.parse(raw)
    const state = deps.state
    selectedProject(state, base.courseId, base.sessionId)
    if (route === '/path/brief') {
      const input = identity.extend({ brief: z.unknown() }).parse(raw)
      const saved = await saveBrief(state, base.courseId, base.sessionId, base.expectedRevision, input.brief)
      deps.onEvent?.('path.brief', { courseId: base.courseId, sessionId: base.sessionId, revision: saved.revision })
    } else if (route === '/path/skip-assessment') {
      const path = pathView(state, base.courseId, base.sessionId).path
      const saved = await saveAssessment(state, base.courseId, base.sessionId, base.expectedRevision, {
        status: 'skipped', summary: 'The learner chose to start with unverified foundations.', strengths: [], gaps: [],
        uncertainties: ['Foundations have not been checked; early lessons need diagnostic checks.'], evidence: [],
        briefRevision: path.briefRevision, sessionId: base.sessionId, updatedAt: new Date().toISOString(),
      }, true)
      deps.onEvent?.('path.skip-diagnosis', { courseId: base.courseId, sessionId: base.sessionId, revision: saved.revision })
    } else if (route === '/path/accept') {
      const input = identity.extend({ version: z.number().int().positive() }).parse(raw)
      const accepted = await acceptCurriculum(state, base.courseId, base.sessionId, base.expectedRevision, input.version)
      deps.onEvent?.('path.accept-route', { courseId: base.courseId, sessionId: base.sessionId, version: input.version, revision: accepted.revision })
    } else if (route === '/path/request') {
      const input = identity.extend({ kind: z.enum(['diagnosis', 'plan']), operationId: z.string().min(1).max(200) }).parse(raw)
      const request = await reservePathRequest(state, input)
      let prompted = request.request.prompted
      let reason: string | undefined = request.request.reason ?? undefined
      if (request.shouldPrompt && state.resolveProject(base.sessionId).course?.id === base.courseId) {
        try { const result = deps.prompt(base.sessionId, request.prompt); prompted = result.prompted; reason = result.reason }
        catch (cause) { prompted = false; reason = (cause as Error).message }
        await stampPathRequest(state, base.courseId, base.sessionId, input.operationId, prompted, reason)
      }
      deps.onEvent?.('path.request', {
        courseId: base.courseId, sessionId: base.sessionId, kind: input.kind, requestId: input.operationId,
        prompted, ...(reason === undefined ? {} : { reason: reason.slice(0, 240) }),
      })
      send(res, 200, { ...pathView(state, base.courseId, base.sessionId), prompted, ...(reason ? { promptReason: reason } : {}) })
      return true
    } else if (route === '/path/start') {
      const input = identity.extend({ version: z.number().int().positive(), itemId: z.string().min(1).max(200), operationId: z.string().min(1).max(200), review: z.boolean().optional() }).parse(raw)
      const result = await beginCourseItem(state, input)
      let prompted = result.attempt.prompted
      let reason: string | undefined = result.attempt.promptReason ?? undefined
      if (result.shouldPrompt && activeAttempt(state.readCourseRun(base.courseId, base.sessionId))?.id === result.attempt.id && state.resolveProject(base.sessionId).course?.id === base.courseId) {
        try { const outcome = deps.prompt(base.sessionId, result.prompt); prompted = outcome.prompted; reason = outcome.reason }
        catch (cause) { prompted = false; reason = (cause as Error).message }
        await stampCoursePrompt(state, input, result.attempt.id, prompted, reason)
      }
      deps.onEvent?.('path.start-lesson', {
        courseId: base.courseId, sessionId: base.sessionId, version: input.version, itemId: input.itemId,
        attemptId: result.attempt.id, prompted, ...(reason === undefined ? {} : { reason: reason.slice(0, 240) }),
      })
      send(res, 200, { ...pathView(state, base.courseId, base.sessionId), prompted, ...(reason ? { promptReason: reason } : {}) })
      return true
    } else { send(res, 404, { ok: false, error: { code: 'no-such-path-route' } }); return true }
    send(res, 200, pathView(state, base.courseId, base.sessionId))
  } catch (cause) {
    const message = cause instanceof z.ZodError ? cause.issues.map((entry) => `${entry.path.join('.')}: ${entry.message}`).join('; ') : (cause as Error).message
    const code = message.split(':')[0] ?? 'invalid-planning-request'
    deps.onEvent?.('path.error', { route, code: code.slice(0, 80) })
    const status = code === 'revision-conflict' || code === 'project-selection-changed' || code === 'stale-curriculum' ? 409 : code === 'no-such-course' ? 404 : 400
    send(res, status, { ok: false, error: { code, message } })
  }
  return true
}
