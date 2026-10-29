/**
 * Read-only facts for the Insights tab.
 *
 * Nothing here scores, ranks mastery or invents a weakness: every field is a
 * count or a direct projection of stored evidence, review history and attempts.
 */
import { dueCards } from './review.js'
import type { CourseRecord } from './state.js'
import type { UdState } from './state.js'

export interface InsightsView {
  ok: true
  courseId: string
  courseTitle: string
  generatedAt: string
  review: {
    due: number
    overdue: number
    total: number
    lapsed: { id: string; front: string; lapses: number; dueAt: string }[]
  }
  recentReviews: { at: string; rating: string; front: string }[]
  evidence: {
    total: number
    last7Days: number
    byKind: { kind: string; count: number }[]
  }
  weakNodes: { id: string; title: string; state: string; evidenceCount: number; updatedAt: string }[]
  recentAttempts: { attemptId: string; status: string; updatedAt: string; units: number; responses: number }[]
  tasks: { open: number; dueToday: number }
  sources: { count: number; bytes: number }
}

const DAY_MS = 86_400_000

function sortByAtDesc<T extends { at: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.at.localeCompare(left.at))
}

/** Build one course's Insights view from stored facts. */
export function buildInsights(state: UdState, course: CourseRecord, nowIso: string): InsightsView {
  const now = new Date(nowIso)
  const cards = state.listReviewCards().filter((card) => card.courseId === course.id)
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const due = dueCards(cards, now)
  const logs = state.listReviewLog().filter((log) => cardsById.has(log.cardId))
  const recentReviews = sortByAtDesc(logs).slice(0, 8).map((log) => ({
    at: log.at, rating: log.rating, front: cardsById.get(log.cardId)?.front ?? '',
  }))
  const lapsed = [...cards]
    .filter((card) => card.lapses > 0)
    .sort((left, right) => right.lapses - left.lapses)
    .slice(0, 5)
    .map((card) => ({ id: card.id, front: card.front, lapses: card.lapses, dueAt: card.dueAt }))

  const nodes = state.listNodes(course.id)
  const evidence = nodes.flatMap((node) => node.evidence)
  const weekAgo = now.getTime() - 7 * DAY_MS
  const byKind = new Map<string, number>()
  for (const entry of evidence) byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1)
  const weakNodes = nodes
    .filter((node) => node.state === 'weak' || node.state === 'blocked')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8)
    .map((node) => ({
      id: node.id, title: node.title, state: node.state,
      evidenceCount: node.evidence.length, updatedAt: node.updatedAt,
    }))

  const attempts = state.listCourseRuns()
    .filter((run) => run.courseId === course.id)
    .flatMap((run) => run.attempts)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 6)
    .map((attempt) => ({
      attemptId: attempt.id, status: attempt.status, updatedAt: attempt.updatedAt,
      units: attempt.units.length, responses: attempt.responses?.length ?? 0,
    }))

  const today = nowIso.slice(0, 10)
  const courseTasks = state.listTasks().filter((task) => task.courseId === undefined || task.courseId === course.id)
  const sources = state.listSources()

  return {
    ok: true,
    courseId: course.id,
    courseTitle: course.title,
    generatedAt: nowIso,
    review: {
      due: due.length,
      overdue: due.filter((card) => Date.parse(card.dueAt) < now.getTime()).length,
      total: cards.length,
      lapsed,
    },
    recentReviews,
    evidence: {
      total: evidence.length,
      last7Days: evidence.filter((entry) => Date.parse(entry.at) >= weekAgo).length,
      byKind: [...byKind.entries()].map(([kind, count]) => ({ kind, count })).sort((left, right) => right.count - left.count),
    },
    weakNodes,
    recentAttempts: attempts,
    tasks: {
      open: courseTasks.filter((task) => task.status === 'open').length,
      dueToday: courseTasks.filter((task) => task.status === 'open' && task.dueAt !== undefined && task.dueAt.slice(0, 10) === today).length,
    },
    sources: {
      count: sources.length,
      bytes: sources.reduce((sum, source) => sum + source.bytes, 0),
    },
  }
}
