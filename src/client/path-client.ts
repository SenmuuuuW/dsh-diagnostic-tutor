/** Browser-only path transport. Keep every server-model import erased. */
import type { GoalBrief, PathView } from '../path.js'

const BASE = '/diagnostic-tutor/api/path'
const API = '/diagnostic-tutor/api'

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
export interface AnswerBlockParams extends PathWriteParams {
  attemptId: string
  blockId: string
  answers: { questionId: string; value: string }[]
}
export interface StartPathParams extends AcceptPathParams {
  itemId: string
  operationId: string
  review?: boolean
  resume?: boolean
  checkin?: boolean
  teachBack?: boolean
}
export interface SourceView {
  id: string
  kind: 'text' | 'file' | 'markdown'
  title: string
  locator: string
  sha256: string
  bytes: number
  createdAt: string
  status: 'ready' | 'error'
  content?: string
}
export interface ReviewGradeParams {
  cardId: string
  rating: 'again' | 'hard' | 'good' | 'easy'
}
export interface TaskMutation {
  taskId: string
  status?: 'open' | 'done' | 'archived'
}
export interface PlanIcs {
  filename: string
  text: string
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
  /** Record one quiz/flashcard submission; never grades or changes state. */
  answer?(params: AnswerBlockParams): Promise<PathView>
  /** Read one stored source for a footnote preview. */
  source?(sourceId: string): Promise<{ ok: true; source: SourceView }>
  /** Download the open, dated Today plan as an ICS calendar. */
  exportPlan?(): Promise<PlanIcs>
  /** Mark one plan item done (or reopen it). Plan state only; never teaching state. */
  updateTask?(params: TaskMutation): Promise<{ ok: true; tasks: import('../contract.js').TaskView[] }>
  /** Due review cards; read-only. */
  reviewNext?(): Promise<{ ok: true; cards: import('../contract.js').ReviewCardView[]; count: number }>
  /** Record one review grade and reschedule the card. */
  reviewGrade?(params: ReviewGradeParams): Promise<{ ok: true; card: import('../contract.js').ReviewCardView; remaining: number }>
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

async function requestSource(sourceId: string): Promise<{ ok: true; source: SourceView }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`${API}/source?id=${encodeURIComponent(sourceId)}`, { headers: { accept: 'application/json' }, signal: controller.signal })
    const value = await response.json() as { ok?: unknown; source?: unknown; error?: { message?: string; code?: string } }
    if (!response.ok || value?.ok !== true || value.source === undefined) {
      throw new PathClientError(value?.error?.message ?? `Source request failed (HTTP ${response.status}).`, value?.error?.code ?? 'source_failed', response.status)
    }
    return value as { ok: true; source: SourceView }
  } finally { clearTimeout(timeout) }
}

async function requestTaskMutation(params: TaskMutation): Promise<{ ok: true; tasks: import('../contract.js').TaskView[] }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`${API}/plan/task`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    })
    const value = await response.json() as { ok?: unknown; tasks?: unknown; error?: { message?: string; code?: string } }
    if (!response.ok || value?.ok !== true || !Array.isArray(value.tasks)) {
      throw new PathClientError(value?.error?.message ?? `Plan update failed (HTTP ${response.status}).`, value?.error?.code ?? 'plan_update_failed', response.status)
    }
    return value as { ok: true; tasks: import('../contract.js').TaskView[] }
  } finally { clearTimeout(timeout) }
}

async function requestReviewNext(): Promise<{ ok: true; cards: import('../contract.js').ReviewCardView[]; count: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`${API}/review`, { headers: { accept: 'application/json' }, signal: controller.signal })
    const value = await response.json() as { ok?: unknown; cards?: unknown; count?: unknown; error?: { message?: string; code?: string } }
    if (!response.ok || value?.ok !== true || !Array.isArray(value.cards)) {
      throw new PathClientError(value?.error?.message ?? `Review request failed (HTTP ${response.status}).`, value?.error?.code ?? 'review_failed', response.status)
    }
    return { ok: true, cards: value.cards as import('../contract.js').ReviewCardView[], count: typeof value.count === 'number' ? value.count : value.cards.length }
  } finally { clearTimeout(timeout) }
}

async function requestReviewGrade(params: ReviewGradeParams): Promise<{ ok: true; card: import('../contract.js').ReviewCardView; remaining: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`${API}/review/grade`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    })
    const value = await response.json() as { ok?: unknown; card?: unknown; remaining?: unknown; error?: { message?: string; code?: string } }
    if (!response.ok || value?.ok !== true || value.card === undefined) {
      throw new PathClientError(value?.error?.message ?? `Review grade failed (HTTP ${response.status}).`, value?.error?.code ?? 'review_grade_failed', response.status)
    }
    return { ok: true, card: value.card as import('../contract.js').ReviewCardView, remaining: typeof value.remaining === 'number' ? value.remaining : 0 }
  } finally { clearTimeout(timeout) }
}

async function requestPlanIcs(): Promise<PlanIcs> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`${API}/plan/ics`, { headers: { accept: 'text/calendar' }, signal: controller.signal })
    if (!response.ok) throw new PathClientError(`Calendar export failed (HTTP ${response.status}).`, 'calendar_failed', response.status)
    return { filename: 'dsh-diagnostic-tutor-plan.ics', text: await response.text() }
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
  answer: (params) => request('/answer', params),
  source: requestSource,
  exportPlan: requestPlanIcs,
  updateTask: requestTaskMutation,
  reviewNext: requestReviewNext,
  reviewGrade: requestReviewGrade,
}
