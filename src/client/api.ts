/**
 * The browser half's HTTP client.
 *
 * Plain `fetch` against this plugin's own prefix. No storage access, no DSH
 * internals — the browser has exactly the three calls the panel makes.
 *
 * Every response is checked for the `{ ok }` envelope, so an HTTP 200 carrying
 * a failure cannot be mistaken for data.
 */

import type {
  FocusResponse,
  HandoffView,
  LessonResponse,
  NodeDetailResponse,
  OverviewResponse,
} from '../contract.js'

/** Route prefix owned by this plugin; must match the host's `API_PREFIX`. */
const BASE = '/diagnostic-tutor/api'

/** Requests are local; anything slower than this is a problem worth surfacing. */
const TIMEOUT_MS = 8000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { accept: 'application/json', ...(init?.headers ?? {}) },
    })

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new Error(`unreadable response (HTTP ${response.status})`)
    }

    // Narrow by inspection rather than by generic: `T` is unconstrained, so a
    // union type would not discriminate.
    const envelope = body as { ok?: unknown; error?: { code?: string; message?: string } }
    if (!response.ok || envelope.ok === false) {
      throw new Error(
        envelope.error?.message ?? envelope.error?.code ?? `HTTP ${response.status}`,
      )
    }
    return body as T
  } finally {
    clearTimeout(timer)
  }
}

/** The current course and its whole diagnosis map. */
export function fetchOverview(): Promise<OverviewResponse> {
  return request<OverviewResponse>('/overview')
}

/** One node, its evidence, its parent and its children. */
export function fetchNode(nodeId: string): Promise<NodeDetailResponse> {
  return request<NodeDetailResponse>(`/node?id=${encodeURIComponent(nodeId)}`)
}

/** The lesson the tutor has written for a node; `lesson: null` until it has. */
export function fetchLesson(nodeId: string): Promise<LessonResponse> {
  return request<LessonResponse>(`/lesson?nodeId=${encodeURIComponent(nodeId)}`)
}

/**
 * Tell the host a surface has rendered the lesson.
 *
 * The last leg of the timing chain: everything before it is measured on the
 * host, and this is the only part only the browser can answer.
 */
export function reportObserved(nodeId: string): Promise<{ handoff: HandoffView | null }> {
  return request<{ handoff: HandoffView | null }>('/handoff/observed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  })
}

/**
 * What the Start learning button does.
 *
 * Records the focus and asks the host to wake the tutor. `sessionId` is the
 * session the panel is showing; without it the focus is still recorded and the
 * response says the tutor was not reached.
 */
export function startFocus(nodeId: string, sessionId?: string): Promise<FocusResponse> {
  return request<FocusResponse>('/focus', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sessionId === undefined ? { nodeId } : { nodeId, sessionId }),
  })
}
