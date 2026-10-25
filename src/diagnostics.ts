/**
 * Read-only health report for the tutoring runtime.
 *
 * The report is what "doctor" shows and what the local `/diagnostics` route
 * returns. It is computed from durable state plus the recent event journal; it
 * never writes, never calls a model and never includes lesson or chat content.
 */

import { briefReady } from './path.js'
import type { Journal, JournalEvent } from './journal.js'
import type { CourseRecord, UdState } from './state.js'

/** Severity used by scripts and the UI. */
export type DiagnosticsSeverity = 'error' | 'warn' | 'info'

/** One actionable observation. */
export interface DiagnosticsIssue {
  readonly code: string
  readonly severity: DiagnosticsSeverity
  readonly courseId?: string
  readonly message: string
}

/** One pending or failed tutor request. */
export interface DiagnosticsRequest {
  readonly id: string
  readonly kind: 'diagnosis' | 'plan'
  readonly sessionId: string
  readonly createdAt: string
  readonly ageMinutes: number
  readonly prompted: boolean
  readonly failure: string | null
}

/** One course run's active attempt, when there is one. */
export interface DiagnosticsAttempt {
  readonly attemptId: string
  readonly itemId: string
  readonly status: string
  readonly startedAt: string
  readonly ageMinutes: number
  readonly units: number
  readonly nodeId: string | null
}

/** One project's stage and pending work. */
export interface DiagnosticsProject {
  readonly courseId: string
  readonly title: string
  readonly status: CourseRecord['status']
  readonly stage: 'goal' | 'diagnosis' | 'route' | 'learning' | 'legacy'
  readonly briefRevision: number
  readonly assessment: string | null
  readonly curricula: number
  readonly acceptedVersion: number | null
  readonly requests: readonly DiagnosticsRequest[]
  readonly activeAttempt: DiagnosticsAttempt | null
  readonly completedItems: number
  readonly totalItems: number
}

/** The whole report. */
export interface DiagnosticsReport {
  readonly ok: true
  readonly generatedAt: string
  readonly plugin: { readonly name: string; readonly version: string }
  readonly domain: { readonly name: string; readonly version: number }
  readonly counts: {
    readonly courses: number
    readonly nodes: number
    readonly lessons: number
    readonly focus: number
    readonly projects: number
    readonly learningPaths: number
    readonly courseRuns: number
  }
  readonly issues: readonly DiagnosticsIssue[]
  readonly projects: readonly DiagnosticsProject[]
  readonly journal: {
    readonly file: string | null
    readonly recent: readonly JournalEvent[]
  }
}

const STALE_REQUEST_MINUTES = 10
const STALLED_ATTEMPT_MINUTES = 15

function minutesBetween(now: number, iso: string): number {
  const at = Date.parse(iso)
  return Number.isFinite(at) ? Math.max(0, Math.round((now - at) / 60_000)) : 0
}

function assessmentReady(path: {
  assessment: { status: string; briefRevision: number; updatedAt: string } | null
  briefRevision: number
}): boolean {
  return path.assessment !== null
    && path.assessment.briefRevision === path.briefRevision
    && (path.assessment.status === 'ready' || path.assessment.status === 'skipped')
}

function unresolved(
  request: { kind: 'diagnosis' | 'plan'; createdAt: string },
  path: {
    assessment: { status: string; updatedAt: string } | null
    curricula: readonly { createdAt: string }[]
  },
): boolean {
  if (request.kind === 'diagnosis') {
    const assessment = path.assessment
    return assessment === null || assessment.status === 'in-progress' || assessment.updatedAt < request.createdAt
  }
  return !path.curricula.some((entry) => entry.createdAt >= request.createdAt)
}

/**
 * Build one diagnostics report.
 *
 * @param state - open state handle.
 * @param journal - journal whose recent events are included.
 * @param options - clock and plugin identity for tests.
 * @returns the report.
 */
export async function buildDiagnostics(
  state: UdState,
  journal: Journal,
  options: { readonly now?: string; readonly events?: number; readonly pluginVersion?: string } = {},
): Promise<DiagnosticsReport> {
  const now = options.now ?? new Date().toISOString()
  const nowMs = Date.parse(now)
  const exported = state.exportState(now)
  const paths = new Map(exported.learningPaths.map((path) => [path.courseId, path]))
  const runs = new Map(exported.courseRuns.map((run) => [run.courseId, run]))
  const issues: DiagnosticsIssue[] = []
  const projects: DiagnosticsProject[] = []

  for (const course of [...exported.courses].sort((left, right) => left.id.localeCompare(right.id))) {
    const path = paths.get(course.id)
    if (path === undefined) {
      projects.push({
        courseId: course.id, title: course.title, status: course.status, stage: 'legacy',
        briefRevision: 0, assessment: null, curricula: 0, acceptedVersion: null,
        requests: [], activeAttempt: null, completedItems: 0, totalItems: 0,
      })
      continue
    }

    const ready = assessmentReady(path)
    const accepted = path.acceptedVersion !== null
      && path.curricula.some((entry) => entry.version === path.acceptedVersion)
    const stage: DiagnosticsProject['stage'] = !briefReady(path.brief)
      ? 'goal'
      : !ready
        ? 'diagnosis'
        : accepted
          ? 'learning'
          : 'route'

    const run = runs.get(course.id)
    const attempt = run?.attempts.find((entry) => entry.id === run.activeAttemptId)
    const activeAttempt: DiagnosticsAttempt | null = attempt === undefined ? null : {
      attemptId: attempt.id,
      itemId: attempt.itemId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      ageMinutes: minutesBetween(nowMs, attempt.startedAt),
      units: attempt.units.length,
      nodeId: attempt.nodeId,
    }

    const pending = path.requests
      .filter((request) => request.prompted
        && ((request.failure !== null && request.failure !== undefined) || unresolved(request, path)))
      .map<DiagnosticsRequest>((request) => ({
        id: request.id,
        kind: request.kind,
        sessionId: request.sessionId,
        createdAt: request.createdAt,
        ageMinutes: minutesBetween(nowMs, request.createdAt),
        prompted: request.prompted,
        failure: request.failure ?? null,
      }))

    const acceptedPlan = path.curricula.find((entry) => entry.version === path.acceptedVersion) ?? path.curricula.at(-1)
    const completedItems = new Set((run?.attempts ?? []).filter((entry) => entry.status === 'completed').map((entry) => entry.itemId)).size

    projects.push({
      courseId: course.id,
      title: course.title,
      status: course.status,
      stage,
      briefRevision: path.briefRevision,
      assessment: path.assessment?.status ?? null,
      curricula: path.curricula.length,
      acceptedVersion: path.acceptedVersion,
      requests: pending,
      activeAttempt,
      completedItems,
      totalItems: acceptedPlan?.items.length ?? 0,
    })

    for (const request of pending) {
      if (request.failure !== null) {
        issues.push({
          code: 'failed-turn',
          severity: 'error',
          courseId: course.id,
          message: `${request.kind} request ${request.id.slice(0, 8)} failed after waking the tutor: ${request.failure.slice(0, 240)}`,
        })
      } else if (request.ageMinutes >= STALE_REQUEST_MINUTES) {
        issues.push({
          code: 'stale-request',
          severity: 'warn',
          courseId: course.id,
          message: `${request.kind} request ${request.id.slice(0, 8)} has been waiting for ${request.ageMinutes} min without advancing`,
        })
      }
    }

    if (path.acceptedVersion !== null && !accepted) {
      issues.push({
        code: 'accepted-route-missing',
        severity: 'error',
        courseId: course.id,
        message: `acceptedVersion ${path.acceptedVersion} has no matching curriculum revision`,
      })
    }

    if (activeAttempt !== null && activeAttempt.status !== 'completed' && activeAttempt.units === 0
      && activeAttempt.ageMinutes >= STALLED_ATTEMPT_MINUTES) {
      issues.push({
        code: 'stalled-attempt',
        severity: 'warn',
        courseId: course.id,
        message: `lesson attempt ${activeAttempt.attemptId.slice(0, 8)} has no teaching units after ${activeAttempt.ageMinutes} min`,
      })
    }
  }

  const courseIds = new Set(exported.courses.map((course) => course.id))
  for (const project of exported.projects) {
    if (project.courseId !== undefined && !courseIds.has(project.courseId)) {
      issues.push({
        code: 'orphan-project-selection',
        severity: 'warn',
        message: `session ${project.sessionId} is bound to missing project ${project.courseId}`,
      })
    }
  }

  return {
    ok: true,
    generatedAt: now,
    plugin: { name: 'dsh-diagnostic-tutor', version: options.pluginVersion ?? 'unknown' },
    domain: exported.domain,
    counts: {
      courses: exported.courses.length,
      nodes: exported.nodes.length,
      lessons: exported.lessons.length,
      focus: exported.focus.length,
      projects: exported.projects.length,
      learningPaths: exported.learningPaths.length,
      courseRuns: exported.courseRuns.length,
    },
    issues,
    projects,
    journal: {
      file: journal.file,
      recent: await journal.tail(options.events ?? 40),
    },
  }
}
