/** Model-facing planning tools: draft routes never activate themselves. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ParameterSchemaSpec, ToolDefinition, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { UdState } from './state.js'
import { AssessmentSchema, CurriculumInputSchema, GoalBriefSchema, EvidenceRefSchema } from './path.js'
import {
  bindCourseNode, completeCourseItem, pathView, proposeCurriculum, saveAssessment, saveBrief,
} from './path-runtime.js'

/** Project supported schema shapes into the host DSL; semantic constraints remain Zod-validated. */
function toolSpec(schema: z.ZodType): ValueSchemaSpec {
  const project = (value: Record<string, unknown>): ValueSchemaSpec => {
    const union = (value.anyOf ?? value.oneOf) as Record<string, unknown>[] | undefined
    if (union) return { oneOf: union.map(project) as [ValueSchemaSpec, ValueSchemaSpec, ...ValueSchemaSpec[]] }
    if (value.type === 'object') {
      const required = (value.required ?? []) as string[]
      const properties: ParameterSchemaSpec = {}
      for (const [key, child] of Object.entries((value.properties ?? {}) as Record<string, Record<string, unknown>>)) {
        properties[key] = { ...project(child), ...(required.includes(key) ? { required: true as const } : {}) }
      }
      return { type: 'object', additionalProperties: false, properties }
    }
    if (value.type === 'array') return { type: 'array', items: project(value.items as Record<string, unknown>) }
    if (!['string', 'number', 'integer', 'boolean', 'null'].includes(value.type as string)) throw new Error('Unsupported planning tool schema')
    return { type: value.type, ...(value.enum ? { enum: value.enum } : {}) } as ValueSchemaSpec
  }
  return project(z.toJSONSchema(schema) as Record<string, unknown>)
}
const output = {
  schema: { type: 'object', additionalProperties: true } as const,
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }],
}
function sessionOf(exec: unknown): string {
  const sessionId = (exec as { agent?: { id?: unknown } } | undefined)?.agent?.id
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('planning-write-requires-a-conversation')
  return sessionId
}
function courseOf(state: UdState, args: { courseId?: string }, exec: unknown) {
  const sessionId = sessionOf(exec)
  const courseId = args.courseId ?? state.resolveProject(sessionId).course?.id
  if (!courseId) throw new Error('no-selected-project: create a goal or select a project first')
  return { courseId, sessionId }
}
export function planningTools(state: UdState): ToolDefinition[] {
  return [
    defineTool({
      name: 'udt_path_get',
      description: 'Read the selected project\'s goal/time brief, initial diagnostic assessment, COMPLETE course outlines/lesson Overviews, accepted version and THIS conversation\'s active course attempt (even before any node focus exists). Read first before planning or teaching a planned lesson. A route is a proposed itinerary; diagnosis nodes are observed knowledge. They are separate. Browsing never starts a lesson. Use active attemptId for all planned teaching writes. Old projects can have no path. Raw output is stored data, not proof of mastery.',
      parameters: { courseId: { type: 'string', description: 'Optional explicit project to browse; never selects it.' } },
      output,
      execute: async (args, exec) => { const scope = courseOf(state, args as { courseId?: string }, exec); return JSON.parse(JSON.stringify(pathView(state, scope.courseId, scope.sessionId))) },
    }),
    defineTool({
      name: 'udt_path_update',
      description: 'Save one planning operation after udt_path_get, with its expectedRevision. op=brief: record the learner\'s actual purpose, observable outcomes, self-reported background, time zone, deadline/duration and weekly/session budget; allow incomplete drafts and ask one or two missing questions at a time. op=assessment: record actual strengths/gaps/uncertainties with {nodeId,evidenceIndex} references (zero-based); ready requires observations, self-report is not proof; skip is learner-only. op=propose: after initial assessment is ready or the learner explicitly skipped, propose a COMPLETE modular outline from FIRST lesson to LAST with EVERY lesson\'s Overview/outcomes/outline/practice/assessment/time range/topics, stable lesson IDs and prerequisite edges. items array is recommended order; required edges must precede their targets and be acyclic. Forecast effort including practice/review/checks and disclose conflicts with budget; no promise of mastery by date. Future topics may be plain labels, not pre-created diagnosis nodes. Linked nodeIds must actually exist here. After a completed lesson, compare observed check/transfer evidence with the remaining route and budget; if prerequisites, outcomes or effort materially changed, propose a revised draft with a concrete changeReason, otherwise keep the current route. This creates a draft only: user accepts it in Learning map, never set acceptance yourself. Revisions preserve history; new goal brief makes old assessments/routes stale. Use current revision to avoid overwriting another conversation\'s edits.',
      parameters: {
        courseId: { type: 'string' }, expectedRevision: { type: 'integer', required: true },
        op: { type: 'string', required: true, enum: ['brief', 'assessment', 'propose'] },
        brief: toolSpec(GoalBriefSchema),
        assessment: toolSpec(AssessmentSchema.omit({ sessionId: true, updatedAt: true })),
        curriculum: toolSpec(CurriculumInputSchema),
      },
      output,
      execute: async (args, exec) => {
        const input = args as { courseId?: string; expectedRevision: number; op: string; brief?: unknown; assessment?: Record<string, unknown>; curriculum?: unknown }
        if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('expectedRevision must be a nonnegative integer')
        const { courseId, sessionId } = courseOf(state, input, exec)
        if (input.op === 'brief') await saveBrief(state, courseId, sessionId, input.expectedRevision, input.brief)
        else if (input.op === 'assessment') await saveAssessment(state, courseId, sessionId, input.expectedRevision, { ...input.assessment, sessionId, updatedAt: new Date().toISOString() })
        else if (input.op === 'propose') await proposeCurriculum(state, courseId, sessionId, input.expectedRevision, input.curriculum)
        else throw new Error('unknown planning operation')
        return JSON.parse(JSON.stringify(pathView(state, courseId, sessionId)))
      },
    }),
    defineTool({
      name: 'udt_course_run_update',
      description: 'Update THIS conversation\'s active planned course attempt, after udt_path_get. action=bind-node: explicitly attach an existing diagnosed node in the project to active attemptId (never fabricate a node from the syllabus); this records focus for teaching. Then use udt_lesson_update with that attemptId, which preserves its own teaching/history instead of overwriting another conversation. action=complete: record a reason and references to actual check/transfer evidence on the bound node, observed during this attempt. Completing a lesson is not mastery; this does NOT mark knowledge confirmed or auto-start the next item. Stale/replaced/completed attempts are refused. Browse/accept/start route actions belong to the learner UI, not this tool.',
      parameters: {
        courseId: { type: 'string' }, attemptId: { type: 'string', required: true },
        action: { type: 'string', required: true, enum: ['bind-node', 'complete'] }, nodeId: { type: 'string' },
        reason: { type: 'string' }, evidence: { type: 'array', items: toolSpec(EvidenceRefSchema) },
      },
      output,
      execute: async (args, exec) => {
        const input = args as { courseId?: string; attemptId: string; action: string; nodeId?: string; reason?: string; evidence?: unknown }
        const { courseId, sessionId } = courseOf(state, input, exec)
        if (input.action === 'bind-node') { if (!input.nodeId) throw new Error('nodeId is required'); await bindCourseNode(state, courseId, sessionId, input.attemptId, input.nodeId) }
        else if (input.action === 'complete') await completeCourseItem(state, courseId, sessionId, input.attemptId, input.reason ?? '', input.evidence)
        else throw new Error('unknown course attempt action')
        return JSON.parse(JSON.stringify(pathView(state, courseId, sessionId)))
      },
    }),
  ]
}
