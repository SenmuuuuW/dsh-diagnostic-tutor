/** Course planning is separate from the evidence-backed diagnosis graph. */
import { z } from 'zod'
import { LessonSchema } from './lesson.js'

const text = z.string().trim().min(1).max(2000)
const short = z.string().trim().min(1).max(200)
const texts = z.array(text).max(20)
export const EvidenceRefSchema = z.object({ nodeId: short, evidenceIndex: z.number().int().min(0) }).strict()
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>

export const GoalBriefSchema = z.object({
  purpose: z.string().max(2000),
  outcomes: texts,
  background: z.string().max(4000),
  timeZone: short.refine((value) => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }, 'Use an IANA time zone'),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().refine((v) => {
    if (v === null) return true
    const stamp = Date.parse(`${v}T12:00:00Z`)
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === v
  }, 'Use a valid date'),
  durationWeeks: z.number().int().min(1).max(260).nullable(),
  deadline: z.enum(['none', 'flexible', 'fixed']),
  weeklyMinutes: z.number().int().min(15).max(10080).nullable(),
  sessionMinutes: z.number().int().min(5).max(480).nullable(),
  preferences: z.string().max(2000),
}).strict().superRefine((brief, ctx) => {
  if (brief.targetDate !== null && brief.durationWeeks !== null) ctx.addIssue({ code: 'custom', message: 'Choose a target date or duration, not both' })
  if (brief.deadline !== 'none' && brief.targetDate === null && brief.durationWeeks === null) ctx.addIssue({ code: 'custom', message: 'Specify a target date or duration' })
  if (brief.deadline === 'none' && (brief.targetDate !== null || brief.durationWeeks !== null)) ctx.addIssue({ code: 'custom', message: 'No deadline must not include a hidden date or duration' })
})
export type GoalBrief = z.infer<typeof GoalBriefSchema>

export const AssessmentSchema = z.object({
  status: z.enum(['in-progress', 'ready', 'skipped']),
  summary: text,
  strengths: texts,
  gaps: texts,
  uncertainties: texts,
  evidence: z.array(EvidenceRefSchema).max(40),
  briefRevision: z.number().int().min(1),
  sessionId: short,
  updatedAt: z.string(),
}).strict()
export type Assessment = z.infer<typeof AssessmentSchema>

export const CurriculumModuleSchema = z.object({ id: short, title: short, overview: text, outcomes: texts, milestone: text }).strict()
export const CurriculumItemSchema = z.object({
  id: short,
  moduleId: short,
  title: short,
  overview: text,
  outcomes: texts.min(1),
  outline: texts.min(1),
  topics: texts.min(1),
  nodeIds: z.array(short).max(20),
  practice: text,
  assessment: text,
  minutes: z.object({ min: z.number().int().min(5).max(1440), max: z.number().int().min(5).max(2880) }).strict().refine((v) => v.max >= v.min, 'Maximum time must be at least minimum time'),
}).strict()
export type CurriculumItem = z.infer<typeof CurriculumItemSchema>
export const CurriculumEdgeSchema = z.object({ from: short, to: short, kind: z.enum(['required', 'optional']) }).strict()
export const CurriculumInputSchema = z.object({
  title: short,
  summary: text,
  modules: z.array(CurriculumModuleSchema).min(1).max(16),
  // This array is the complete recommended lesson order, independent of node creation order.
  items: z.array(CurriculumItemSchema).min(1).max(80),
  edges: z.array(CurriculumEdgeSchema).max(240),
  assumptions: texts,
  changeReason: text,
}).strict().superRefine((plan, ctx) => {
  const moduleIds = new Set(plan.modules.map((m) => m.id))
  const ids = new Set(plan.items.map((item) => item.id))
  if (moduleIds.size !== plan.modules.length || ids.size !== plan.items.length) ctx.addIssue({ code: 'custom', message: 'Module and lesson IDs must be unique' })
  const index = new Map(plan.items.map((item, i) => [item.id, i]))
  for (const item of plan.items) if (!moduleIds.has(item.moduleId)) ctx.addIssue({ code: 'custom', message: `Unknown module for ${item.id}` })
  for (const module of plan.modules) if (!plan.items.some((item) => item.moduleId === module.id)) ctx.addIssue({ code: 'custom', message: `Empty module ${module.id}` })
  const edges = new Set<string>()
  for (const edge of plan.edges) {
    const key = JSON.stringify([edge.from, edge.to])
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to || edges.has(key)) ctx.addIssue({ code: 'custom', message: 'Edges must be unique and reference two different lessons in this plan' })
    edges.add(key)
    // Requiring every hard prerequisite to precede its target also proves acyclicity.
    if (edge.kind === 'required' && (index.get(edge.from) ?? Infinity) >= (index.get(edge.to) ?? -1)) ctx.addIssue({ code: 'custom', message: 'Required prerequisites must precede their targets in recommended order; cycles are refused' })
  }
})
export type CurriculumInput = z.infer<typeof CurriculumInputSchema>
export const CurriculumSchema = z.object({
  ...CurriculumInputSchema.shape,
  version: z.number().int().min(1),
  briefRevision: z.number().int().min(1),
  assessmentRevision: z.number().int().min(1),
  createdAt: z.string(),
  acceptedAt: z.string().nullable(),
}).superRefine((route, ctx) => {
  const { version: _version, briefRevision: _brief, assessmentRevision: _assessment, createdAt: _created, acceptedAt: _accepted, ...proposal } = route
  const parsed = CurriculumInputSchema.safeParse(proposal)
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
})
export type Curriculum = z.infer<typeof CurriculumSchema>
export const PathRequestSchema = z.object({
  id: short, sessionId: short, kind: z.enum(['diagnosis', 'plan']), briefRevision: z.number().int(),
  createdAt: z.string(), prompted: z.boolean(), reason: z.string().nullable(),
  /** Set when the prompted turn failed after the request was accepted, so the UI can retry after a restart. */
  failure: z.string().max(2000).nullable().optional(),
})
export const LearningPathSchema = z.object({
  courseId: short,
  revision: z.number().int().min(0),
  briefRevision: z.number().int().min(0),
  assessmentRevision: z.number().int().min(0),
  brief: GoalBriefSchema.nullable(),
  assessment: AssessmentSchema.nullable(),
  curricula: z.array(CurriculumSchema).max(40),
  acceptedVersion: z.number().int().min(1).nullable(),
  requests: z.array(PathRequestSchema).max(100),
  updatedAt: z.string(),
})
export type LearningPath = z.infer<typeof LearningPathSchema>

export const CourseAttemptSchema = z.object({
  id: short, operationId: short, operations: z.array(short).max(100), dispatchId: short.nullable(), version: z.number().int().min(1), itemId: short,
  status: z.enum(['requested', 'working', 'completed', 'interrupted']),
  nodeId: short.nullable(),
  startedAt: z.string(), updatedAt: z.string(),
  prompted: z.boolean(), promptReason: z.string().nullable(),
  outcome: z.string().max(2000).nullable(), evidence: z.array(EvidenceRefSchema).max(40),
  // Snapshot each teaching write. A later replace or another conversation cannot rewrite history.
  units: z.array(z.object({ id: short, writtenAt: z.string(), lesson: LessonSchema })).max(160),
})
export type CourseAttempt = z.infer<typeof CourseAttemptSchema>
export const CourseRunSchema = z.object({
  courseId: short, sessionId: short, revision: z.number().int().min(0),
  activeAttemptId: short.nullable(), attempts: z.array(CourseAttemptSchema).max(200),
  updatedAt: z.string(),
})
export type CourseRun = z.infer<typeof CourseRunSchema>
export interface PathView { ok: true; path: LearningPath; run: CourseRun | null; now: string }
export function emptyPath(courseId: string, now: string): LearningPath {
  return { courseId, revision: 0, briefRevision: 0, assessmentRevision: 0, brief: null, assessment: null, curricula: [], acceptedVersion: null, requests: [], updatedAt: now }
}
export function emptyRun(courseId: string, sessionId: string, now: string): CourseRun {
  return { courseId, sessionId, revision: 0, activeAttemptId: null, attempts: [], updatedAt: now }
}
export function activeAttempt(run: CourseRun | null | undefined): CourseAttempt | undefined {
  return run?.attempts.find((attempt) => attempt.id === run.activeAttemptId)
}
export function briefReady(brief: GoalBrief | null): boolean {
  return !!brief?.purpose.trim() && brief.outcomes.length > 0
}
export function pathBudget(brief: GoalBrief | null, plan: Curriculum | CurriculumInput | null, now: string) {
  const total = plan?.items.reduce((sum, item) => ({ min: sum.min + item.minutes.min, max: sum.max + item.minutes.max }), { min: 0, max: 0 }) ?? { min: 0, max: 0 }
  let weeks = brief?.durationWeeks ?? null
  if (brief?.targetDate) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: brief.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
    weeks = Math.max(0, (Date.parse(`${brief.targetDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 604800000)
  }
  const available = weeks === null || !brief?.weeklyMinutes ? null : Math.floor(weeks * brief.weeklyMinutes)
  return { ...total, available, conflict: available !== null && total.min > available, tight: available !== null && total.max > available }
}
