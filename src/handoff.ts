/**
 * The handoff: what happens between pressing Continue and seeing a lesson.
 *
 * Moving from one node to another is not instant — the runtime records a focus,
 * an agent is woken, a model turn runs, and only then does a lesson exist. That
 * gap used to be silent, which is the worst thing a gap can be: the learner
 * cannot tell "working" from "broken", and a seven-minute turn is
 * indistinguishable from a dead button.
 *
 * So the handoff is a **persisted record with timestamps**, and everything the
 * UI shows about progress is derived from it. Persisting it is what makes the
 * behaviours that matter possible at all:
 *
 *   - **idempotent** — keyed by target node, so pressing Continue twice is one
 *     handoff, not two;
 *   - **refresh-proof** — a reload re-reads the same record;
 *   - **restart-proof** — the record outlives the process;
 *   - **retryable** — the attempt count and timestamps say whether the tutor
 *     ever answered, so a retry is informed rather than blind;
 *   - **non-destructive on timeout** — a timeout is a statement about the
 *     *wait*, never about the focus. The record goes stale; the focus stands.
 *
 * The timestamps are also the measurement. `requestedAt → focusRecordedAt →
 * promptedAt → firstActivityAt → lessonAt → observedAt` is the whole chain, so
 * "where did the time go" is a question with an answer rather than an
 * argument.
 */

import { z } from 'zod'

/**
 * Where a handoff has got to.
 *
 * `requested`  the button was pressed; nothing has been persisted yet
 * `prompted`   the focus is recorded and the tutor was woken
 * `working`    the agent has produced its first event since being woken
 * `ready`      a lesson exists for the target node
 * `failed`     the tutor could not be reached
 *
 * There is deliberately no `timeout` status: a timeout is the *reader's*
 * judgement about a record that has stopped moving, and storing it would mean
 * writing to a record because time passed. The UI derives it from `updatedAt`.
 */
export const HANDOFF_STATUSES = ['requested', 'prompted', 'working', 'ready', 'failed'] as const
export const HandoffStatusSchema = z.enum(HANDOFF_STATUSES)
export type HandoffStatus = z.infer<typeof HandoffStatusSchema>

export const HandoffSchema = z.object({
  /** The node being moved to. The key, which is what makes this idempotent. */
  targetNodeId: z.string().min(1),
  courseId: z.string().min(1),
  fromNodeId: z.string().min(1),
  status: HandoffStatusSchema,
  /** How many times the tutor has been asked. A retry increments this. */
  attempts: z.number().int().min(1),
  /**
   * The session the tutor was asked in.
   *
   * Kept so the first-activity listener can ignore events from every other
   * conversation: a busy session elsewhere must not make this handoff look like
   * it has started.
   */
  sessionId: z.string().optional(),
  /** When the request reached the host. */
  requestedAt: z.string(),
  /** When the focus was durably recorded. */
  focusRecordedAt: z.string().optional(),
  /** When `followup` was accepted. */
  promptedAt: z.string().optional(),
  /** The first session event after the prompt — the tutor actually started. */
  firstActivityAt: z.string().optional(),
  /** When a lesson for the target node was written. */
  lessonAt: z.string().optional(),
  /** When a surface first rendered that lesson. */
  observedAt: z.string().optional(),
  failedAt: z.string().optional(),
  failureReason: z.string().optional(),
  updatedAt: z.string(),
})
export type HandoffRecord = z.infer<typeof HandoffSchema>
export type HandoffKey = string

/* -------------------------------------------------------------------------- */
/* Pure transitions                                                           */
/* -------------------------------------------------------------------------- */

/** Start (or restart) a handoff for a target node. */
export function beginHandoff(input: {
  courseId: string
  fromNodeId: string
  targetNodeId: string
  now: string
  sessionId?: string | undefined
  /** A previous record for this node, when this is a retry. */
  previous?: HandoffRecord | undefined
}): HandoffRecord {
  return {
    courseId: input.courseId,
    fromNodeId: input.fromNodeId,
    targetNodeId: input.targetNodeId,
    status: 'requested',
    attempts: (input.previous?.attempts ?? 0) + 1,
    requestedAt: input.now,
    updatedAt: input.now,
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  }
}

export function withFocusRecorded(record: HandoffRecord, now: string): HandoffRecord {
  return { ...record, focusRecordedAt: now, updatedAt: now }
}

export function withPrompted(record: HandoffRecord, now: string): HandoffRecord {
  return { ...record, status: 'prompted', promptedAt: now, updatedAt: now }
}

export function withPromptFailure(record: HandoffRecord, now: string, reason: string): HandoffRecord {
  return { ...record, status: 'failed', failedAt: now, failureReason: reason, updatedAt: now }
}

/**
 * Record the tutor's first sign of activity.
 *
 * Only the first one is kept: this answers "how long until it started", and a
 * later event would answer a different question.
 */
export function withActivity(record: HandoffRecord, now: string): HandoffRecord {
  if (record.firstActivityAt !== undefined) return record
  return { ...record, status: 'working', firstActivityAt: now, updatedAt: now }
}

export function withLesson(record: HandoffRecord, now: string): HandoffRecord {
  return {
    ...record,
    status: 'ready',
    lessonAt: record.lessonAt ?? now,
    firstActivityAt: record.firstActivityAt ?? now,
    updatedAt: now,
  }
}

export function withObserved(record: HandoffRecord, now: string): HandoffRecord {
  if (record.observedAt !== undefined) return record
  return { ...record, observedAt: now, updatedAt: now }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** What the UI should say. */
export type HandoffPhase = 'focus-recorded' | 'tutor-requested' | 'tutor-working' | 'lesson-ready' | 'failed' | 'stalled'

/**
 * How long a surface waits before calling a quiet handoff stalled.
 *
 * Long, on purpose: a real model turn on a large node has taken minutes here,
 * and telling a learner the tutor is broken while it is still thinking is worse
 * than a longer wait. A stall is a prompt to retry, never a verdict.
 */
export const STALL_AFTER_MS = 150_000

export interface HandoffView {
  /** The node being moved to — what a retry asks for again. */
  targetNodeId: string
  phase: HandoffPhase
  /** Plain-language line for the learner. */
  label: string
  /** Milliseconds since the request, for the timing readout. */
  elapsedMs: number
  attempts: number
  /**
   * How long after the request each stage was reached, in milliseconds.
   *
   * Cumulative from `requestedAt`, not deltas: the question a learner and a
   * maintainer both ask is "when did it get here", and cumulative numbers stay
   * readable when a stage is skipped.
   */
  stages: Record<string, number>
  /** Present when the phase is `failed` or `stalled`. */
  detail?: string
}

function offset(from: string | undefined, requestedMs: number): number | undefined {
  if (from === undefined) return undefined
  const at = Date.parse(from)
  return Number.isNaN(at) ? undefined : Math.max(0, at - requestedMs)
}

/**
 * Derive what a surface should show.
 *
 * `stalled` is computed, not stored: a record that has stopped moving is not a
 * different record, and writing to it because time passed would make the store
 * a clock.
 *
 * @param record - the handoff.
 * @param nowMs - current time, injected so this is testable.
 * @param hasLesson - whether a lesson for the target node already exists.
 * @returns the phase, a label, the elapsed time and the stage breakdown.
 */
export function handoffView(record: HandoffRecord, nowMs: number, hasLesson: boolean): HandoffView {
  const stages: Record<string, number> = {}
  const requested = Date.parse(record.requestedAt)
  const add = (name: string, from: string | undefined): void => {
    if (Number.isNaN(requested)) return
    const offsetMs = offset(from, requested)
    if (offsetMs !== undefined) stages[name] = offsetMs
  }
  add('toFocusRecorded', record.focusRecordedAt)
  add('toPrompted', record.promptedAt)
  add('toFirstActivity', record.firstActivityAt)
  add('toLesson', record.lessonAt)
  add('toObserved', record.observedAt)

  const elapsedMs = Math.max(0, nowMs - (Number.isNaN(requested) ? nowMs : requested))

  const base = { targetNodeId: record.targetNodeId, elapsedMs, attempts: record.attempts, stages }

  if (record.status === 'failed') {
    return {
      ...base,
      phase: 'failed',
      label: 'Could not reach the tutor',
      ...(record.failureReason === undefined ? {} : { detail: record.failureReason }),
    }
  }
  if (hasLesson || record.status === 'ready') {
    return { ...base, phase: 'lesson-ready', label: 'Lesson ready' }
  }
  if (record.status === 'working' || record.firstActivityAt !== undefined) {
    if (nowMs - Date.parse(record.updatedAt) > STALL_AFTER_MS) {
      return { ...base, phase: 'stalled', label: 'The tutor has gone quiet', detail: 'Still working, or stopped — you can ask again.' }
    }
    return { ...base, phase: 'tutor-working', label: 'Tutor working…' }
  }
  if (record.status === 'prompted') {
    if (nowMs - Date.parse(record.updatedAt) > STALL_AFTER_MS) {
      return { ...base, phase: 'stalled', label: 'No answer from the tutor yet', detail: 'You can ask again without losing your place.' }
    }
    return { ...base, phase: 'tutor-requested', label: 'Tutor requested…' }
  }
  return { ...base, phase: 'focus-recorded', label: 'Focus recorded' }
}
