/** Validated planning operations. The Agent proposes; only UI acceptance activates a route. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { UdState } from './state.js'
import { LessonSchema } from './lesson.js'
import { isKnownBlock } from './block-types.js'
import type { LessonRecord } from './lesson.js'
import {
  activeAttempt, AssessmentSchema, briefReady, CurriculumInputSchema, emptyPath,
  EvidenceRefSchema, GoalBriefSchema,
} from './path.js'
import type { Assessment, CourseAttempt, CourseRun, Curriculum, CurriculumInput, EvidenceRef, GoalBrief, LearningPath, PathView } from './path.js'

export function pathView(state: UdState, courseId: string, sessionId?: string): PathView {
  if (!state.readCourse(courseId)) throw new Error('no-such-course')
  return { ok: true, path: state.readPath(courseId) ?? emptyPath(courseId, new Date().toISOString()), run: sessionId ? state.readCourseRun(courseId, sessionId) ?? null : null, now: new Date().toISOString() }
}
export function selectedProject(state: UdState, courseId: string, sessionId: string | undefined): asserts sessionId is string {
  if (!sessionId) throw new Error('missing-session-id: open a conversation to change its learning path')
  const selected = state.resolveProject(sessionId)
  if (selected.course?.id !== courseId || selected.selection !== 'project') throw new Error('project-selection-changed: open this project in the current conversation first')
}
function evidenceRefs(state: UdState, courseId: string, refs: EvidenceRef[]) {
  return refs.map((ref) => {
    const node = state.readNode(ref.nodeId)
    const entry = node?.evidence[ref.evidenceIndex]
    if (!node || node.courseId !== courseId || !entry) throw new Error('invalid-evidence-reference: use an actual observation in this project')
    return { node, entry }
  })
}
function linkedNodes(state: UdState, courseId: string, route: CurriculumInput) {
  for (const item of route.items) for (const nodeId of item.nodeIds) {
    if (state.readNode(nodeId)?.courseId !== courseId) throw new Error('foreign-node-reference: planned topics can be labels; linked node IDs must exist in this project')
  }
}
function currentAssessment(path: LearningPath) {
  return briefReady(path.brief) && path.assessment && path.assessment.briefRevision === path.briefRevision && ['ready', 'skipped'].includes(path.assessment.status)
}
function assessmentEvidence(state: UdState, courseId: string, assessment: Assessment) {
  if (assessment.status === 'ready' && assessment.evidence.length === 0) throw new Error('assessment-needs-evidence: self-report alone is not a diagnostic result')
  evidenceRefs(state, courseId, assessment.evidence)
}
export async function saveBrief(state: UdState, courseId: string, sessionId: string, expectedRevision: number, raw: unknown) {
  const brief = GoalBriefSchema.parse(raw)
  return state.mutatePath(courseId, expectedRevision, (current) => {
    selectedProject(state, courseId, sessionId)
    return { ...current, brief, briefRevision: current.briefRevision + 1, updatedAt: new Date().toISOString() }
  })
}
export async function saveAssessment(state: UdState, courseId: string, sessionId: string, expectedRevision: number, raw: unknown, allowSkip = false) {
  const assessment = AssessmentSchema.parse(raw)
  return state.mutatePath(courseId, expectedRevision, (current) => {
    selectedProject(state, courseId, sessionId)
    if (!briefReady(current.brief) || current.briefRevision !== assessment.briefRevision || assessment.sessionId !== sessionId) throw new Error('stale-assessment: read the current goal brief and conversation')
    if (assessment.status === 'skipped' && !allowSkip) throw new Error('only-the-learner-can-skip-assessment')
    if (assessment.status === 'ready' && assessment.evidence.length === 0) throw new Error('assessment-needs-evidence: self-report alone is not a diagnostic result')
    evidenceRefs(state, courseId, assessment.evidence)
    return { ...current, assessment, assessmentRevision: current.assessmentRevision + 1, updatedAt: new Date().toISOString() }
  })
}
export async function proposeCurriculum(state: UdState, courseId: string, sessionId: string, expectedRevision: number, raw: unknown) {
  const proposal = CurriculumInputSchema.parse(raw)
  return state.mutatePath(courseId, expectedRevision, (current) => {
    selectedProject(state, courseId, sessionId)
    if (!currentAssessment(current)) throw new Error('diagnosis-first: complete or explicitly skip the current initial assessment before proposing the route')
    assessmentEvidence(state, courseId, current.assessment!)
    linkedNodes(state, courseId, proposal)
    if (current.curricula.length >= 40) throw new Error('curriculum-history-limit: export history before adding more versions; no versions were deleted')
    const curriculum: Curriculum = { ...proposal, version: (current.curricula.at(-1)?.version ?? 0) + 1, briefRevision: current.briefRevision, assessmentRevision: current.assessmentRevision, createdAt: new Date().toISOString(), acceptedAt: null }
    return { ...current, curricula: [...current.curricula, curriculum], updatedAt: curriculum.createdAt }
  })
}
export async function acceptCurriculum(state: UdState, courseId: string, sessionId: string, expectedRevision: number, version: number) {
  return state.mutatePath(courseId, expectedRevision, (current) => {
    selectedProject(state, courseId, sessionId)
    const route = current.curricula.find((entry) => entry.version === version)
    if (!route || !currentAssessment(current) || route.briefRevision !== current.briefRevision || route.assessmentRevision !== current.assessmentRevision) throw new Error('stale-curriculum: request a route for the current goal and assessment')
    assessmentEvidence(state, courseId, current.assessment!)
    linkedNodes(state, courseId, route)
    const now = new Date().toISOString()
    return { ...current, acceptedVersion: version, curricula: current.curricula.map((entry) => entry.version === version ? { ...entry, acceptedAt: entry.acceptedAt ?? now } : entry), updatedAt: now }
  })
}

function briefContext(brief: GoalBrief | null) {
  return brief === null ? 'No goal brief saved yet.' : JSON.stringify(brief)
}
export async function reservePathRequest(state: UdState, input: { courseId: string; sessionId: string; expectedRevision: number; kind: 'diagnosis' | 'plan'; operationId: string }) {
  const priorRequest = (path: LearningPath | undefined) => {
    const prior = path?.requests.find((request) => request.id === input.operationId)
    if (prior) {
      selectedProject(state, input.courseId, input.sessionId)
      if (path?.courseId !== input.courseId || prior.id !== input.operationId || prior.sessionId !== input.sessionId || prior.kind !== input.kind) throw new Error('operation-id-conflict')
    }
    return prior
  }
  const prior = priorRequest(state.readPath(input.courseId))
  if (prior) return { shouldPrompt: false, prompt: '', request: prior }
  let replay = false
  let path: LearningPath
  try {
    path = await state.mutatePath(input.courseId, input.expectedRevision, (path) => {
      selectedProject(state, input.courseId, input.sessionId)
      if (priorRequest(path)) { replay = true; return path }
      if (!briefReady(path.brief)) throw new Error('missing-goal-outcome: save a purpose and an observable target first')
      if (input.kind === 'plan' && !currentAssessment(path)) throw new Error('diagnosis-first')
      return { ...path, requests: [...path.requests, { id: input.operationId, sessionId: input.sessionId, kind: input.kind, briefRevision: path.briefRevision, createdAt: new Date().toISOString(), prompted: false, reason: 'Queued for the tutor' }] }
    })
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('revision-conflict:')) throw error
    // A competing reservation may have committed the same operation while we queued.
    const committed = priorRequest(state.readPath(input.courseId))
    if (!committed) throw error
    return { shouldPrompt: false, prompt: '', request: committed }
  }
  const project = state.readCourse(input.courseId)!
  const prompt = input.kind === 'diagnosis'
    ? `Quick initial diagnosis for "${project.title}" (courseId=${input.courseId}). My saved goal: ${path.brief?.purpose ?? 'not saved yet'}. Read udt_path_get first.\nAsk 1-2 key questions with ask_user_question (options, plus free text when I should explain), then one or two short checks. Record actual observations with udt_map_update and save an evidence-referenced assessment with udt_path_update. If I do not know my level, help me work it out; do not dump a syllabus into the diagnosis map. When the evidence is enough, propose a complete route with udt_path_update op=propose; I will review and accept it in Learning map.`
    : `Propose my full learning route for "${project.title}" (courseId=${input.courseId}). Read udt_path_get first, then use my goal, outcomes, deadline/time zone, weekly budget and initial assessment.\nIn udt_path_update op=propose, put the complete module/lesson outline and EVERY lesson Overview from the first lesson through the final check: observable outcomes, outline, practice, assessment method, time range and prerequisite edges. Size each lesson for my session-minutes budget when you can, and flag any lesson that genuinely needs a longer block. State assumptions and time-budget conflicts, and offer scope/time adjustments. This is a draft for me to accept in Learning map, not permission to mark mastery or pre-generate every lesson body. Keep planned topics separate from diagnosed knowledge nodes.`
  return { shouldPrompt: !replay, prompt, request: path.requests.find((request) => request.id === input.operationId)! }
}
/**
 * Record that the tutor turn behind a path request failed.
 *
 * The browser's own session snapshot is memory-only, so it cannot explain a
 * failed turn after a restart. This stamps the durable request record instead:
 * only the newest prompted request from that conversation, and only while its
 * result is still missing. A diagnosis that was already recorded, or another
 * conversation's request, is never touched — a later unrelated agent error in
 * the same chat must not mislabel a finished diagnosis.
 *
 * @param state - state handle.
 * @param sessionId - the conversation whose turn failed.
 * @param reason - the error message shown to the learner.
 */
export async function stampPathRequestFailure(state: UdState, sessionId: string, reason: string): Promise<void> {
  const courseId = state.resolveProject(sessionId).course?.id
  if (courseId === undefined) return
  for (let attempt = 0; attempt < 3; ++attempt) {
    const path = state.readPath(courseId)
    if (path === undefined) return
    const request = path.requests.at(-1)
    if (request === undefined || request.sessionId !== sessionId || !request.prompted || request.failure === reason) return
    const resolved = request.kind === 'diagnosis'
      ? path.assessment !== null && path.assessment.status !== 'in-progress'
      : path.curricula.some((entry) => entry.createdAt >= request.createdAt)
    if (resolved) return
    try {
      await state.mutatePath(courseId, path.revision, (current) => ({
        ...current,
        requests: current.requests.map((entry) => entry.id === request.id && entry.sessionId === sessionId ? { ...entry, failure: reason } : entry),
      }))
      return
    } catch (error) {
      if (!(error as Error).message.startsWith('revision-conflict')) throw error
    }
  }
}
export async function stampPathRequest(state: UdState, courseId: string, sessionId: string, id: string, prompted: boolean, reason?: string) {
  // The Agent may already have updated the plan; retry a CAS stamp on latest only.
  for (let attempt = 0; attempt < 3; ++attempt) {
    const path = state.readPath(courseId)
    if (!path || state.resolveProject(sessionId).course?.id !== courseId) return
    try {
      await state.mutatePath(courseId, path.revision, (current) => ({ ...current, requests: current.requests.map((request) => request.id === id && request.sessionId === sessionId ? { ...request, prompted, reason: reason ?? null } : request) }))
      return
    } catch (error) { if (!(error as Error).message.startsWith('revision-conflict')) throw error }
  }
}

export interface BeginItemInput { courseId: string; sessionId: string; expectedRevision: number; version: number; itemId: string; operationId: string; review?: boolean | undefined; resume?: boolean | undefined; checkin?: boolean | undefined; teachBack?: boolean | undefined }
export async function beginCourseItem(state: UdState, input: BeginItemInput) {
  let shouldPrompt = false
  const now = new Date().toISOString()
  const run = await state.mutateCourseRun(input.courseId, input.sessionId, (run) => {
    selectedProject(state, input.courseId, input.sessionId)
    const replay = run.attempts.find((attempt) => attempt.operations.includes(input.operationId))
    if (replay) {
      if (replay.version !== input.version || replay.itemId !== input.itemId) throw new Error('operation-id-conflict')
      return run
    }
    const path = state.readPath(input.courseId)
    if (!path || path.revision !== input.expectedRevision) throw new Error('revision-conflict: refresh the learning path')
    const plan = path.curricula.find((route) => route.version === input.version)
    if (!plan?.items.some((item) => item.id === input.itemId)) throw new Error('no-such-course-item')
    linkedNodes(state, input.courseId, plan)
    const current = activeAttempt(run)
    const continuing = current && current.version === input.version && current.itemId === input.itemId && ['requested', 'working', 'interrupted'].includes(current.status) && !input.review
    if (continuing) {
      const paused = current.status === 'interrupted'
      // A double click while a prompt is in flight is not a new teaching turn.
      // A deliberate resume may come much later: if the learner left the
      // conversation and came back, `prompted` is already true forever, so it
      // must not block the follow-up. Teach-back and check-in are explicit
      // learning actions and bypass the short cooldown once the prompt landed.
      const inflight = current.dispatchId !== null && Date.parse(now) - Date.parse(current.updatedAt) < 3000
      const explicit = input.teachBack === true || input.checkin === true
      const cooling = !paused && (inflight || (!explicit && current.prompted && Date.parse(now) - Date.parse(current.updatedAt) < 3000))
      if (cooling) {
        return { ...run, attempts: run.attempts.map((attempt) => attempt.id === current.id ? { ...attempt, operations: [...attempt.operations, input.operationId] } : attempt) }
      }
      shouldPrompt = true
      return { ...run, activeAttemptId: current.id, attempts: run.attempts.map((attempt) => attempt.id === current.id ? { ...attempt, status: 'working', operations: [...attempt.operations, input.operationId], dispatchId: input.operationId, promptReason: null, updatedAt: now } : attempt), updatedAt: now }
    }
    if (path.acceptedVersion !== input.version || !plan.acceptedAt) throw new Error('accept-the-current-route-before-starting')
    if (!briefReady(path.brief) || plan.briefRevision !== path.briefRevision || plan.assessmentRevision !== path.assessmentRevision) throw new Error('stale-curriculum: review a plan for the updated goal first')
    const attempt: CourseAttempt = { id: randomUUID(), operationId: input.operationId, operations: [input.operationId], dispatchId: input.operationId, version: input.version, itemId: input.itemId, status: 'requested', nodeId: null, startedAt: now, updatedAt: now, prompted: false, promptReason: null, outcome: null, evidence: [], units: [] }
    shouldPrompt = true
    return { ...run, activeAttemptId: attempt.id, attempts: [...run.attempts.map((entry) => ['requested', 'working'].includes(entry.status) ? { ...entry, status: 'interrupted' as const, updatedAt: now } : entry), attempt], updatedAt: now }
  })
  const attempt = run.attempts.find((entry) => entry.operations.includes(input.operationId)) ?? activeAttempt(run)!
  const path = state.readPath(input.courseId)!
  const route = path.curricula.find((entry) => entry.version === attempt.version)!
  const item = route.items.find((entry) => entry.id === attempt.itemId)!
  const prompt = input.teachBack === true
    ? teachBackPrompt(input, path, route, item, attempt)
    : input.checkin === true
      ? checkinPrompt(input, path, route, item, attempt)
      : (attempt.units.length > 0 || attempt.status === 'interrupted' || input.resume === true)
        ? resumePrompt(input, path, route, item, attempt)
        : startPrompt(input, path, route, item, attempt)
  return { run, attempt, shouldPrompt, prompt }
}

function lastUnitCheck(attempt: CourseAttempt): string | null {
  const unit = attempt.units.at(-1)
  if (unit === undefined) return null
  const check = [...unit.lesson.blocks].reverse().find((block) => isKnownBlock(block) && block.type === 'check')
  return check !== undefined && isKnownBlock(check) && check.type === 'check' ? check.content.prompt : null
}

function lessonLine(input: BeginItemInput, route: Curriculum, item: Curriculum['items'][number]): string {
  return `${item.title}, lesson ${route.items.indexOf(item) + 1} of ${route.items.length} in ${route.title}.\nCourse context: courseId=${input.courseId}, version=${route.version}, itemId=${item.id}.`
}

/** The first turn: make the chat the classroom, not a request to read the tab. */
function startPrompt(input: BeginItemInput, path: LearningPath, route: Curriculum, item: Curriculum['items'][number], attempt: CourseAttempt): string {
  return `Let's start ${lessonLine(input, route, item)}\nMy goal and budget: ${briefContext(path.brief)}\nLesson Overview: ${JSON.stringify(item)}\n\nYou lead this lesson in the conversation. In the lesson tab, write only a reference snapshot of the unit you just taught; the tab is not the lecture.\n\nFirst turn:\n1. In the chat, say in one or two sentences what I will be able to do by the end of this lesson.\n2. Teach ONE small unit: a short explanation and one concrete example.\n3. Then stop and ask me ONE check question (use ask_user_question when the answer fits a short card), and wait for my answer. Never dump the whole lesson in one turn.\n\nRead udt_path_get. Diagnose relevant knowledge before teaching; reuse a diagnosed node or add a justified node with udt_map_update, never plant the course outline in the diagnosis graph. Explicitly bind the chosen node using udt_course_run_update(action=bind-node, attemptId=${attempt.id}), then write the same small unit with udt_lesson_update(attemptId=${attempt.id}) including its check block. Update actual evidence after my response. Finish a course item only using udt_course_run_update(action=complete, attemptId=${attempt.id}) with check/transfer evidence and a reason. After completion, compare that evidence with remaining prerequisites, outcomes and time budget; if it materially changes the route, reread udt_path_get and propose a revised draft with a concrete changeReason. Do not create a redundant revision when the route still fits. Explain the suggestion; the learner must accept any proposal. Completion is not mastery and never auto-starts another lesson.`
}

/** Returning after a break: reconnect through the conversation, not by restarting. */
function resumePrompt(input: BeginItemInput, path: LearningPath, route: Curriculum, item: Curriculum['items'][number], attempt: CourseAttempt): string {
  const last = attempt.units.at(-1)
  const lastTitle = last?.lesson.title ?? item.title
  const check = lastUnitCheck(attempt)
  return `Let's continue ${lessonLine(input, route, item)}\nThis is a resume, not a restart. Attempt id: ${attempt.id}. Already written units: ${attempt.units.length}. Last unit: "${lastTitle}".${check === null ? '' : ` Last check I was asked: "${check}".`}\nMy goal and budget: ${briefContext(path.brief)}\n\nRead udt_path_get and the conversation history. Do this in the conversation:\n1. In one sentence, say where we stopped, using the context you already have.\n2. Ask me ONE short check-in question about the last unit (prefer ask_user_question). If I already answered that check in this conversation, acknowledge it briefly and ask whether to continue instead.\n3. Wait for my answer. Do not write a new unit, do not repeat old teaching, and do not restart this lesson until I answer.\n\nWhen I answer, append the next small unit with udt_lesson_update(attemptId=${attempt.id}); never replace or rewrite earlier units. Keep teaching one small unit at a time in the chat, ending with one check, and use the lesson tab only as the reference snapshot.`
}

/** The learner explains the unit back; the tutor must diagnose, not lecture. */
function teachBackPrompt(input: BeginItemInput, path: LearningPath, route: Curriculum, item: Curriculum['items'][number], attempt: CourseAttempt): string {
  const last = attempt.units.at(-1)
  const lastTitle = last?.lesson.title ?? item.title
  const check = lastUnitCheck(attempt)
  const node = attempt.nodeId === null ? '' : ` Bound node id: ${attempt.nodeId}.`
  return `Let's do a teach-back of ${lessonLine(input, route, item)}\nAttempt id: ${attempt.id}. Last unit: "${lastTitle}".${check === null ? '' : ` The check I was asked: "${check}".`}${node}\nMy goal and budget: ${briefContext(path.brief)}\n\nDo NOT explain the unit again first. Invite me to explain it in my own words, as if I were teaching it to you. When I answer, do exactly this:\n1. Name one thing I got right, specifically.\n2. Name one specific gap, fuzzy phrase, or misconception — quote my words when you can.\n3. Ask ONE follow-up question: either "why does that work?" or a new-context application. Wait for my answer.\n4. Record what I showed with udt_map_update(op=add-evidence, ${attempt.nodeId === null ? "nodeId=<the bound node>" : `nodeId=${attempt.nodeId}`}, evidenceKind='explanation', evidenceNote=<what I actually explained>, readiness=<advance|advance-with-caution|review-first|more-practice>). Explanation alone never sets state to confirmed.\n\nDo not write a new lesson unit and do not continue with new material in this turn. The point is to make my thinking visible, not to deliver more content. After the follow-up, say in one sentence what we should do next and wait for me.`
}

/** A deliberate pause-and-check before continuing. */
function checkinPrompt(input: BeginItemInput, path: LearningPath, route: Curriculum, item: Curriculum['items'][number], attempt: CourseAttempt): string {
  const check = lastUnitCheck(attempt)
  return `Let's check in on ${lessonLine(input, route, item)}\nAttempt id: ${attempt.id}. Written units: ${attempt.units.length}.${check === null ? '' : ` Last check I was asked: "${check}".`}\n\nPause new teaching. Read udt_path_get and the conversation history. Ask me ONE short check-in question about the current unit (prefer ask_user_question), then wait for my answer. Do not write a new unit and do not continue with new material until I answer.`
}

export interface PauseItemInput { courseId: string; sessionId: string; expectedRevision: number }
/** Mark the current attempt paused without ending it. `interrupted` is the existing attempt state. */
export async function pauseCourseItem(state: UdState, input: PauseItemInput): Promise<PathView> {
  selectedProject(state, input.courseId, input.sessionId)
  const path = state.readPath(input.courseId)
  if (path === undefined || path.revision !== input.expectedRevision) throw new Error('revision-conflict: refresh the learning path')
  const now = new Date().toISOString()
  await state.mutateCourseRun(input.courseId, input.sessionId, (run) => {
    const current = activeAttempt(run)
    if (current === undefined || !['requested', 'working'].includes(current.status)) throw new Error('no-active-lesson: there is no lesson to pause')
    return { ...run, attempts: run.attempts.map((attempt) => attempt.id === current.id ? { ...attempt, status: 'interrupted', dispatchId: null, updatedAt: now } : attempt), updatedAt: now }
  })
  return pathView(state, input.courseId, input.sessionId)
}
export async function stampCoursePrompt(state: UdState, input: BeginItemInput, attemptId: string, prompted: boolean, reason?: string) {
  if (!state.readCourse(input.courseId) || state.resolveProject(input.sessionId).course?.id !== input.courseId) return
  await state.mutateCourseRun(input.courseId, input.sessionId, (run) => ({ ...run, attempts: run.attempts.map((entry) => entry.id === attemptId && entry.dispatchId === input.operationId ? { ...entry, dispatchId: null, prompted, promptReason: reason ?? null, updatedAt: new Date().toISOString() } : entry) }))
}
export function requireAttempt(state: UdState, courseId: string, sessionId: string | undefined, attemptId: string) {
  selectedProject(state, courseId, sessionId)
  const attempt = activeAttempt(state.readCourseRun(courseId, sessionId))
  if (!attempt || attempt.id !== attemptId || !['requested', 'working'].includes(attempt.status)) throw new Error('stale-attempt: read udt_path_get; this attempt is no longer active')
  return attempt
}
export async function bindCourseNode(state: UdState, courseId: string, sessionId: string, attemptId: string, nodeId: string) {
  if (state.readNode(nodeId)?.courseId !== courseId) throw new Error('bind-an-existing-diagnosed-node-in-this-project')
  await state.mutateCourseRun(courseId, sessionId, (run) => {
    requireAttempt(state, courseId, sessionId, attemptId)
    return { ...run, attempts: run.attempts.map((entry) => entry.id === attemptId ? { ...entry, nodeId, status: 'working', updatedAt: new Date().toISOString() } : entry) }
  })
  requireAttempt(state, courseId, sessionId, attemptId)
  await state.startFocus(courseId, nodeId, new Date().toISOString(), sessionId)
}
function teachingSnapshot(run: CourseRun, attemptId: string, lesson: LessonRecord) {
  return { ...run, attempts: run.attempts.map((entry) => entry.id === attemptId ? { ...entry, status: 'working' as const, updatedAt: lesson.updatedAt, units: [...entry.units, { id: randomUUID(), writtenAt: lesson.updatedAt, lesson }] } : entry) }
}
export async function recordCourseTeaching(state: UdState, courseId: string, sessionId: string, attemptId: string, lesson: LessonRecord) {
  return state.mutateCourseRun(courseId, sessionId, (run) => {
    const attempt = requireAttempt(state, courseId, sessionId, attemptId)
    if (attempt.nodeId !== lesson.nodeId || lesson.courseId !== courseId || state.readNode(lesson.nodeId)?.courseId !== courseId) throw new Error('bind-the-node-before-writing-planned-teaching')
    return teachingSnapshot(run, attemptId, LessonSchema.parse(lesson))
  })
}
/** Merge against the latest committed unit while holding the run/project queue. The builder must not enqueue writes. */
export async function writeCourseTeaching(state: UdState, courseId: string, sessionId: string, attemptId: string, nodeId: string, build: (current: LessonRecord | undefined) => LessonRecord) {
  const run = await state.mutateCourseRun(courseId, sessionId, (run) => {
    const attempt = requireAttempt(state, courseId, sessionId, attemptId)
    if (attempt.nodeId !== nodeId || state.readNode(nodeId)?.courseId !== courseId) throw new Error('bind-the-node-before-writing-planned-teaching')
    const existing = [...attempt.units].reverse().find((unit) => unit.lesson.nodeId === nodeId)?.lesson
    const lesson = LessonSchema.parse(build(existing))
    if (lesson.nodeId !== nodeId || lesson.courseId !== courseId) throw new Error('bind-the-node-before-writing-planned-teaching')
    return teachingSnapshot(run, attemptId, lesson)
  })
  return run.attempts.find((entry) => entry.id === attemptId)!.units.at(-1)!.lesson
}
export async function completeCourseItem(state: UdState, courseId: string, sessionId: string, attemptId: string, reason: string, rawRefs: unknown) {
  const refs = z.array(EvidenceRefSchema).min(1).max(40).parse(rawRefs)
  if (!reason.trim() || reason.length > 2000) throw new Error('completion-needs-an-observed-reason')
  return state.mutateCourseRun(courseId, sessionId, (run) => {
    const attempt = requireAttempt(state, courseId, sessionId, attemptId)
    const observations = evidenceRefs(state, courseId, refs)
    if (!observations.every(({ node, entry }) => node.id === attempt.nodeId && entry.sessionId === sessionId && entry.attemptId === attemptId && Date.parse(entry.at) >= Date.parse(attempt.startedAt)) || !observations.some(({ entry }) => ['check', 'transfer'].includes(entry.kind))) throw new Error('completion-needs-check-or-transfer-evidence-from-this-attempt')
    return { ...run, attempts: run.attempts.map((entry) => entry.id === attemptId ? { ...entry, status: 'completed', evidence: refs, outcome: reason, updatedAt: new Date().toISOString() } : entry) }
  })
}
