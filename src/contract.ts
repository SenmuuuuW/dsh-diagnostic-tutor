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

/** The node the learner pressed Start learning on. A pointer, not a measure. */
export interface FocusView {
  courseId: string
  nodeId: string
  nodeTitle: string
  startedAt: string
  status: string
}

/**
 * The tutor's recommendation, as the panel shows it.
 *
 * `targetNodeId` null means **stay on the current node** — the only encoding of
 * "stay", so the panel never has to guess what a decision meant.
 */
export interface NextStepView {
  fromNodeId: string
  fromNodeTitle: string
  targetNodeId: string | null
  targetNodeTitle: string | null
  /** One of the skill's six readiness outcomes. */
  action: string
  reason: string
  createdAt: string
}

/**
 * How a handoff is going, as a surface renders it.
 *
 * Every field is derived from the stored record and the clock; nothing here is
 * written to the store as a progress state.
 */
export interface HandoffView {
  /** The node being moved to — what a retry asks for again. */
  targetNodeId: string
  phase: 'focus-recorded' | 'tutor-requested' | 'tutor-working' | 'lesson-ready' | 'failed' | 'stalled'
  label: string
  elapsedMs: number
  attempts: number
  /** Per-stage durations so far, in milliseconds. Absent stages are omitted. */
  stages: Record<string, number>
  detail?: string
}

/** `GET /overview` — `course: null` means the learner has no goal yet. */
export interface OverviewResponse {
  ok: true
  course: CourseView | null
  nodes: NodeView[]
  focus: FocusView | null
  /** A decision the learner has not acted on yet, if there is one. */
  nextStep: NextStepView | null
  /** The handoff for the focused node, so a reload rebuilds the progress line. */
  handoff: HandoffView | null
  /**
   * Whether the teaching brain is installed.
   *
   * `true` found, `false` confidently absent, `null` **cannot tell** — the
   * registry reads the global layer alone without a viewing scope, and the
   * standard web profile mounts skills per agent, so an empty catalog from a
   * root-scope plugin means nothing. A surface must only warn on `false`.
   *
   * A tri-state rather than a name or version: the skill's own protocol forbids
   * naming its files or versions in learner-facing text.
   */
  teachingBrain: boolean | null
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

/** `GET /lesson?nodeId=` — `lesson: null` until the tutor has written one. */
export interface LessonResponse {
  ok: true
  lesson: import('./lesson.js').LessonRecord | null
}

/** `POST /focus { nodeId, sessionId? }` — the result of pressing Start learning. */
export interface FocusResponse {
  ok: true
  focus: FocusView
  /** Whether the tutor was actually woken. */
  prompted: boolean
  /** Why it was not, when it was not. The focus is recorded either way. */
  promptReason?: string
  /** The progress record for this target. */
  handoff: HandoffView | null
  /** True when an identical request was already in flight. */
  deduped?: boolean
}

/** Every failure shape the API produces. */
export interface ApiErrorResponse {
  ok: false
  error: { code: string; message?: string }
}

export type ApiResponse<T> = T | ApiErrorResponse
