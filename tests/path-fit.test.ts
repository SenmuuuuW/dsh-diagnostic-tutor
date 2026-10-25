/** Route effort is compared with the learner's session and weekly budget. */

import { describe, expect, it } from 'vitest'

import { routeFit } from '../src/client/path-fit.js'
import type { Curriculum, GoalBrief } from '../src/path.js'

const brief: GoalBrief = {
  purpose: 'x', outcomes: ['y'], background: '', timeZone: 'UTC', targetDate: null, durationWeeks: null,
  deadline: 'none', weeklyMinutes: 300, sessionMinutes: 60, preferences: '',
}

function plan(durations: [number, number][]): Curriculum {
  return {
    version: 1, briefRevision: 1, assessmentRevision: 1, createdAt: '2026-01-01T00:00:00.000Z', acceptedAt: null,
    title: 'Plan', summary: '', modules: [], assumptions: [], changeReason: 'test',
    edges: [],
    items: durations.map(([min, max], index) => ({
      id: `l${index + 1}`, moduleId: 'm', title: `Lesson ${index + 1}`, overview: '', outcomes: [],
      outline: [], topics: [], nodeIds: [], practice: '', assessment: '', minutes: { min, max },
    })),
  }
}

describe('route fit', () => {
  it('totals the plan and compares it with the weekly budget', () => {
    const fit = routeFit(plan([[90, 120], [150, 180]]), brief)
    expect(fit).toMatchObject({ lessons: 2, totalMin: 240, totalMax: 300, weeksMin: 0.8, weeksMax: 1 })
    expect(fit.longLessons.map((lesson) => lesson.id)).toEqual(['l1', 'l2'])
  })

  it('does not invent a budget or a mismatch when the brief omits them', () => {
    const fit = routeFit(plan([[90, 120]]), { ...brief, sessionMinutes: null, weeklyMinutes: null })
    expect(fit).toMatchObject({ sessionMinutes: null, weeklyMinutes: null, weeksMin: null, weeksMax: null, longLessons: [] })
  })

  it('only flags lessons whose longest estimate exceeds the session', () => {
    const fit = routeFit(plan([[20, 55], [20, 65]]), brief)
    expect(fit.longLessons).toEqual([{ id: 'l2', title: 'Lesson 2', max: 65 }])
  })
})
