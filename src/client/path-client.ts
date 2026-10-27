/** Browser-only path transport. Keep every server-model import erased. */
import type { GoalBrief, PathView } from '../path.js'

const BASE = '/diagnostic-tutor/api/path'

export interface PathWriteParams {
  sessionId: string
  courseId: string
  expectedRevision: number
}
export interface SaveBriefParams extends PathWriteParams { brief: GoalBrief }
export interface PathRequestParams extends PathWriteParams {
  kind: 'diagnosis' | 'plan'
  operationId: string
}
export interface AcceptPathParams extends PathWriteParams { version: number }
export interface StartPathParams extends AcceptPathParams {
  itemId: string
  operationId: string
  review?: boolean
  resume?: boolean
  checkin?: boolean
}
export interface PromptedPathView extends PathView {
  prompted: boolean
  promptReason?: string
}
export interface PathClient {
  get(courseId: string, sessionId?: string): Promise<PathView>
  saveBrief(params: SaveBriefParams): Promise<PathView>
  request(params: PathRequestParams): Promise<PromptedPathView>
  skipAssessment(params: PathWriteParams): Promise<PathView>
  accept(params: AcceptPathParams): Promise<PathView>
  start(params: StartPathParams): Promise<PromptedPathView>
  /** Pause the active attempt without ending it. */
  pause?(params: PathWriteParams): Promise<PathView>
}

/** Retain HTTP status so a stale write can refresh without losing form edits. */
export class PathClientError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message)
    this.name = 'PathClientError'
  }
}

async function request<T extends PathView>(suffix: string, body?: unknown): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`${BASE}${suffix}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined
        ? { accept: 'application/json' }
        : { accept: 'application/json', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    })
    let value: unknown
    try { value = await response.json() } catch {
      throw new PathClientError(`Unreadable server response (HTTP ${response.status}).`, 'invalid_response', response.status)
    }
    const envelope = value as { ok?: unknown; error?: { code?: string; message?: string }; path?: unknown }
    if (!response.ok || envelope?.ok === false) {
      throw new PathClientError(envelope?.error?.message ?? `Request failed (HTTP ${response.status}).`, envelope?.error?.code ?? 'request_failed', response.status)
    }
    if (envelope?.ok !== true || !envelope.path) {
      throw new PathClientError('The server did not return a learning path.', 'invalid_response', response.status)
    }
    return value as T
  } finally { clearTimeout(timeout) }
}

export const defaultPathClient: PathClient = {
  get(courseId, sessionId) {
    const query = new URLSearchParams({ courseId })
    if (sessionId) query.set('sessionId', sessionId)
    return request(`?${query.toString()}`)
  },
  saveBrief: (params) => request('/brief', params),
  request: (params) => request<PromptedPathView>('/request', params),
  skipAssessment: (params) => request('/skip-assessment', params),
  accept: (params) => request('/accept', params),
  start: (params) => request<PromptedPathView>('/start', params),
  pause: (params) => request('/pause', params),
}
