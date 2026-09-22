/**
 * The host↔browser contract.
 *
 * Types only — this module has **no runtime imports at all**, so the client
 * bundle can pull from it freely without dragging host code (or zod) into the
 * browser. That separation is deliberate: the data schema lives in
 * `lesson.ts` and `state.ts`, the renderers live in `client/`, and this file is
 * the shape they agree on.
 *
 * These are **views**, not records. The browser never receives a storage
 * record, a domain handle or a path; it receives exactly what the panel draws.
 */

export type { Block, BlockType, LessonRecord } from './lesson.js'

/** One node as the map draws it. */
export interface NodeView {
  id: string
  title: string
  /** `goal | part-of | prerequisite | related` */
  relation: string
  /**
   * The skill's seven status terms. There is no numeric field here and there
   * never will be: no percentage, no score, no stars.
   */
  state: string
  parentId: string | null
  evidenceCount: number
  updatedAt: string
}

/** One recorded observation. */
export interface EvidenceView {
  kind: string
  at: string
  note?: string
  readiness?: string
}

/** The goal the panel is showing. */
export interface CourseView {
  id: string
  title: string
  goal: string
  status: string
  createdAt: string
  updatedAt: string
}

/** `GET /overview` — `course: null` means the learner has no goal yet. */
export interface OverviewResponse {
  ok: true
  course: CourseView | null
  nodes: NodeView[]
  lessonCount: number
}

/** `GET /node?id=` */
export interface NodeDetailResponse {
  ok: true
  node: NodeView & { evidence: EvidenceView[] }
  parent: NodeView | null
  children: NodeView[]
  lessonExists: boolean
}

/** `POST /lesson { nodeId }` */
export interface LessonResponse {
  ok: true
  lesson: import('./lesson.js').LessonRecord
  /** True when an existing lesson was returned instead of a new one. */
  reused: boolean
}

/** Every failure shape the API produces. */
export interface ApiErrorResponse {
  ok: false
  error: { code: string; message?: string }
}

export type ApiResponse<T> = T | ApiErrorResponse
