/**
 * Route vs. budget fit, computed from the plan and the saved goal brief.
 *
 * The tutor proposes lesson lengths; the runtime can only compare them with
 * what the learner said they can do in one sitting and in one week. This is a
 * display/advice calculation — never an automatic trim.
 */

import type { Curriculum, GoalBrief } from '../path.js'

/** One lesson longer than the learner's preferred session. */
export interface LongLesson {
  readonly id: string
  readonly title: string
  readonly max: number
}

/** The plan's effort compared with the goal brief. */
export interface RouteFit {
  readonly lessons: number
  readonly totalMin: number
  readonly totalMax: number
  /** Null when the brief did not state a session length. */
  readonly sessionMinutes: number | null
  /** Null when the brief did not state a weekly budget. */
  readonly weeklyMinutes: number | null
  /** Whole weeks at the weekly budget, one decimal; null without a budget. */
  readonly weeksMin: number | null
  readonly weeksMax: number | null
  /** Lessons whose longest estimate exceeds the session preference. */
  readonly longLessons: readonly LongLesson[]
}

/**
 * Compare one plan with the saved goal brief.
 *
 * @param plan - the selected curriculum.
 * @param brief - the saved goal brief, when there is one.
 * @returns effort, weekly duration and lessons that do not fit a session.
 */
export function routeFit(plan: Curriculum, brief: GoalBrief | null): RouteFit {
  const totalMin = plan.items.reduce((sum, item) => sum + item.minutes.min, 0)
  const totalMax = plan.items.reduce((sum, item) => sum + item.minutes.max, 0)
  const sessionMinutes = brief?.sessionMinutes ?? null
  const weeklyMinutes = brief?.weeklyMinutes ?? null
  return {
    lessons: plan.items.length,
    totalMin,
    totalMax,
    sessionMinutes,
    weeklyMinutes,
    weeksMin: weeklyMinutes === null || weeklyMinutes <= 0 ? null : Number((totalMin / weeklyMinutes).toFixed(1)),
    weeksMax: weeklyMinutes === null || weeklyMinutes <= 0 ? null : Number((totalMax / weeklyMinutes).toFixed(1)),
    longLessons: sessionMinutes === null || sessionMinutes <= 0
      ? []
      : plan.items
        .filter((item) => item.minutes.max > sessionMinutes)
        .map((item) => ({ id: item.id, title: item.title, max: item.minutes.max })),
  }
}
