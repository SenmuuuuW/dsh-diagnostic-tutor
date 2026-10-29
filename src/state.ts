/**
 * The persistence contract for dsh-diagnostic-tutor.
 *
 * This module owns one Cordis **storage domain** — the official DSH
 * persistence seam — and nothing else. It contains no teaching logic: it
 * stores what was observed, never what should happen next.
 *
 * Why a storage domain rather than files of our own:
 *   - it is the supported seam; the profile routes it to a backend (the
 *     standard profiles use `dsh-storage-json` under `dshHomePath('storages')`);
 *   - **the zod schema is the contract** — every record is validated at the
 *     durable boundary, so corrupt or hand-edited data cannot enter memory;
 *   - reads are synchronous from memory and writes ride one per-domain write
 *     chain, so concurrent writers cannot interleave;
 *   - unmounting is clean: `Domain.close()` releases the backend unit.
 *
 * ---------------------------------------------------------------------------
 * A refinement of the cross-version discipline (verified against source)
 * ---------------------------------------------------------------------------
 * The rule "import `@deepseek-ai/*` as types only" is about **stateful
 * objects** — services, classes, instances. A second harness cohort must never
 * supply those, because identity checks and `instanceof` would silently fail.
 *
 * `defineDomain` and `domainTable` are a different category: **pure builder
 * functions**. `domainTable(schema)` is literally `{ valueSchema: schema }`,
 * and `defineDomain(spec)` validates a spec and returns it unchanged. They
 * take plain data and return plain data, carry no identity, and are re-exported
 * by the host for exactly this use — the same pattern every published DSH
 * plugin follows.
 *
 * The rules that still hold absolutely: never `instanceof` a returned object,
 * and take every service instance (`DomainFacility`, `Domain`, tables) from
 * `ctx`. Here `DomainFacility` is imported as a **type**, and the `Domain` we
 * use is whatever the host's facility handed back.
 */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  Domain,
  DomainFacility,
  DomainGlobal,
  KvTable,
} from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

import { endsFocus } from './vocabulary.js'
import {
  EvidenceKindSchema,
  INITIAL_NODE_STATE,
  NodeRelationSchema,
  NodeStateSchema,
  ReadinessSchema,
  TeachingModeSchema,
} from './vocabulary.js'
import type { NodeRelation, NodeState, Readiness } from './vocabulary.js'
import { LessonSchema } from './lesson.js'
import type { LessonKey, LessonRecord } from './lesson.js'
import { SOURCES_TABLE, SourceRecordSchema } from './source-schema.js'
import type { SourceRecord } from './source-schema.js'
import { HandoffSchema } from './handoff.js'
import type { HandoffKey, HandoffRecord } from './handoff.js'
import { focusKey, handoffKey, isLegacyExecutionKey, nextStepKey } from './execution-key.js'
import { CourseRunSchema, LearningPathSchema, emptyPath, emptyRun } from './path.js'
import type { CourseRun, LearningPath } from './path.js'

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The learner singleton. Stored in the domain's **global** slot rather than a
 * one-row table, because the global slot exists precisely for a single
 * document and its `initial` value gives a well-defined "never written" state.
 *
 * `initializedAt` is the sentinel that distinguishes "the stored profile" from
 * "the spec's default": it is the empty string until the first write, which is
 * what makes first-run initialization idempotent and restart-detectable.
 *
 * Note there is no field for proficiency, level or score. Preferences only.
 */
export const LearnerProfileSchema = z.object({
  preferredLanguage: z.string().min(1).optional(),
  mode: TeachingModeSchema.optional(),
  activeCourseId: z.string().min(1).optional(),
  initializedAt: z.string(),
  updatedAt: z.string(),
})
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>

/** Lifecycle of a learning goal. Not a mastery status. */
export const COURSE_STATUSES = ['active', 'paused', 'archived'] as const
export const CourseStatusSchema = z.enum(COURSE_STATUSES)
export type CourseStatus = z.infer<typeof CourseStatusSchema>

/**
 * A learning goal in the learner's own words.
 *
 * `goal` is the verbatim statement that started the course; `title` is a short
 * label for display. Neither is ever auto-expanded into a syllabus.
 */
export const CourseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  status: CourseStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CourseRecord = z.infer<typeof CourseSchema>

/**
 * One observation attached to a node.
 *
 * Evidence records *what happened*, never how good it was. There is no score,
 * no weight and no correctness flag — a `readiness` outcome is the skill's own
 * six-term vocabulary, and it is optional because not every observation rises
 * to a readiness judgement.
 */
export const EvidenceSchema = z.object({
  kind: EvidenceKindSchema,
  at: z.string(),
  note: z.string().min(1).optional(),
  readiness: ReadinessSchema.optional(),
  /** Runtime-stamped provenance for observations made during a planned attempt. */
  sessionId: z.string().min(1).optional(),
  attemptId: z.string().min(1).optional(),
})
export type Evidence = z.infer<typeof EvidenceSchema>

/**
 * One node of the diagnosis map.
 *
 * Nodes are born `unconfirmed` and stay that way until evidence supports
 * something else; see `diagnosis.ts` for the transition rules. There is no
 * `progress`, no `weight`, no `order` and no `dueAt`: nothing here describes a
 * schedule or a completion percentage, because the map is not a syllabus.
 */
export const NodeSchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1),
  /** Absent only for the course's single `goal` node. */
  parentId: z.string().min(1).optional(),
  relation: NodeRelationSchema,
  state: NodeStateSchema,
  evidence: z.array(EvidenceSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type NodeRecord = z.infer<typeof NodeSchema>

/**
 * The one node being learned right now, per course.
 *
 * This is what makes "Start learning" an explicit act rather than an implicit
 * one: the runtime records which node the learner asked to work on and when,
 * and both the tutor and the panel read it from here instead of guessing.
 *
 * There is deliberately no `progress` field. A focus is a pointer, not a
 * measure; how far along the learner is lives in the node's state and evidence.
 */
export const FOCUS_STATUSES = ['active', 'ended'] as const
export const FocusStatusSchema = z.enum(FOCUS_STATUSES)
export type FocusStatus = z.infer<typeof FocusStatusSchema>

export const FocusSchema = z.object({
  courseId: z.string().min(1),
  nodeId: z.string().min(1),
  startedAt: z.string(),
  status: FocusStatusSchema,
  updatedAt: z.string(),
  /** Set when the status becomes `ended`; absent while the focus is active. */
  endedAt: z.string().optional(),
  /**
   * The conversation this focus belongs to.
   *
   * Learning state is per-conversation, not per-course. A learner can be
   * working on one node in one conversation and a different node in another,
   * and a focus that does not say which one it is cannot be shown to either
   * without risking showing the wrong one — which is exactly what happened:
   * starting a node in conversation B silently replaced A's, and returning to A
   * showed B's lesson under A's chat.
   *
   * Optional because records written before this field existed have no
   * conversation to claim. Such a focus belongs to nobody and is shown to
   * nobody; the evidence and lessons it produced are untouched.
   */
  sessionId: z.string().optional(),
  /** The recommendation produced when this focus ended. */
  nextStepId: z.string().optional(),
})
export type FocusRecord = z.infer<typeof FocusSchema>
export type FocusKey = string

/**
 * The Learning Project one conversation has selected.
 *
 * `courseId` is the project: a course record IS a learning project, and the UI
 * calls it that. There is deliberately no separate project entity — a second
 * one would have to be kept in step with the first, and the first already
 * carries the map, the evidence and the lessons.
 */
export const ProjectSchema = z.object({
  /** The conversation that made the choice. */
  sessionId: z.string().min(1),
  /** The course it chose, or absent for "start something new". */
  courseId: z.string().min(1).optional(),
  /** When it chose. */
  selectedAt: z.string(),
})
export type ProjectRecord = z.infer<typeof ProjectSchema>
export type ProjectKey = string

/** The conversation-local project state shared by the API and model tools. */
export const PROJECT_SELECTIONS = ['none', 'new', 'project'] as const
export type ProjectSelection = (typeof PROJECT_SELECTIONS)[number]

export interface SessionProjectResolution {
  selection: ProjectSelection
  sessionAvailable: boolean
  course?: CourseRecord
  reason?: 'missing-session-id' | 'ambiguous-session-project' | 'stale-project'
  /** In-process choice revision, used to reject a late adoption after a UI choice. */
  revision: number
}

export const PROJECT_BINDINGS = ['adopted', 'already-selected', 'not-selected', 'missing-session-id'] as const
export type ProjectBinding = (typeof PROJECT_BINDINGS)[number]
export interface ProjectBindingResult {
  projectAdopted: boolean
  projectBinding: ProjectBinding
}

/**
 * The tutor's decision about where the learner should go after this node.
 *
 * `action` is one of the skill's six readiness outcomes, reused rather than
 * re-invented: the words for "what this concept showed" and "where that sends
 * the learner" are the same words. See `vocabulary.ts` for what each one
 * implies about a target.
 *
 * `targetNodeId` absent means **stay here**. That is the only encoding of
 * "stay" — a named target is always a move — so the runtime never has to guess
 * what a decision meant.
 *
 * `reason` is required and is written for the learner: the panel shows it
 * verbatim, which is what makes the recommendation explicable instead of
 * mysterious.
 */
export const NextStepSchema = z.object({
  /** Keyed by `fromNodeId`: the latest decision made on leaving that node. */
  fromNodeId: z.string().min(1),
  courseId: z.string().min(1),
  action: ReadinessSchema,
  targetNodeId: z.string().min(1).optional(),
  reason: z.string().min(1),
  createdAt: z.string(),
})
export type NextStepRecord = z.infer<typeof NextStepSchema>
export type NextStepKey = string

/**
 * Identifies the document, so a file found on a disk years later explains
 * itself without this project having to be installed.
 */
export const EXPORT_FORMAT = 'dsh-diagnostic-tutor/state'
export const EXPORT_VERSION = 1

/**
 * Everything the learner owns.
 *
 * Plain data, no handles and no methods: an export that needed this plugin to
 * read it would not be an export. `format` and `version` are first so the file
 * is self-describing, and there is no `handoffs` key on purpose — a handoff is
 * operational timing for a wait in progress, not learning state.
 */
export interface UdExport {
  readonly format: typeof EXPORT_FORMAT
  readonly version: number
  readonly exportedAt: string
  readonly domain: { readonly name: string; readonly version: number }
  readonly learner: LearnerProfile
  readonly courses: readonly CourseRecord[]
  readonly nodes: readonly NodeRecord[]
  readonly lessons: readonly LessonRecord[]
  readonly nextSteps: readonly NextStepRecord[]
  readonly focus: readonly FocusRecord[]
  /** Which Learning Project each conversation had open. */
  readonly projects: readonly ProjectRecord[]
  /** Planning and actual course attempts are learner-owned history too. */
  readonly learningPaths: readonly LearningPath[]
  readonly courseRuns: readonly CourseRun[]
  /** Learner-supplied source material, with citations pointing into it. */
  readonly sources: readonly SourceRecord[]
}

export type CourseKey = string
export type NodeKey = string
export type SourceKey = string

/* -------------------------------------------------------------------------- */
/* Domain declaration                                                         */
/* -------------------------------------------------------------------------- */

/** Domain name. Must match the storage hub's `UNIT_NAME_RE` (`^[a-z][a-z0-9_]*$`). */
export const UDT_DOMAIN_NAME = 'udt'
/**
 * Still 1, and that is a deliberate finding rather than an oversight.
 *
 * v0.0.3 added the `nodes` table. That is **additive**: a v1 document simply
 * has no `nodes` map, and the facility builds its table set from the spec, so
 * an old document opens with an empty map.
 *
 * The version must NOT be bumped for an additive change, because the `single`
 * layout enforces it strictly: `dsh-storage-json`'s `openSingleUnit` rejects a
 * document whose stamped version differs from the spec before any compatibility
 * list is consulted (`StorageError: unit 'udt': stored version 1 != expected 2`,
 * `code: 'version-mismatch'`). `compatibleVersions` is honoured by `per-record`
 * backends only. Bumping here would make every existing store unopenable —
 * an outage in exchange for nothing.
 *
 * So: bump this only when a stored *record* can no longer be read as-is, and
 * ship a migration in the same release.
 */
export const UDT_DOMAIN_VERSION = 1

/**
 * Legacy keys seen during reads, so a support dump can explain the orphans.
 *
 * Records written before execution state was session-scoped are left on disk
 * untouched. They are never read, because a record that cannot say which
 * conversation it belongs to cannot be shown to one without risking showing it
 * to the wrong one. Logged once per table: a poll every two seconds would
 * otherwise fill the log with the same line.
 */
const legacySeen = new Set<string>()

function logIgnoredLegacy(table: string, key: string): void {
  if (legacySeen.has(table)) return
  legacySeen.add(table)
  console.debug(
    `[diagnostic-tutor] ignoring pre-session-scoped record in "${table}" (key "${key}"): ` +
    'it predates per-conversation state and is not attributed to any conversation',
  )
}
export const COURSES_TABLE = 'courses'
export const NODES_TABLE = 'nodes'
export const LESSONS_TABLE = 'lessons'
export const FOCUS_TABLE = 'focus'
export const NEXT_STEPS_TABLE = 'next_steps'
export const HANDOFFS_TABLE = 'handoffs'
/**
 * Which Learning Project each conversation is looking at.
 *
 * The projects themselves are learner-level: the course, its map, its evidence
 * and its lessons are shared by every conversation, and this table adds nothing
 * to them. What it records is a *choice* — which of those projects this
 * conversation has open — and a choice belongs to the conversation that made
 * it. Without this the runtime had to guess, and the guess was "the most
 * recently updated course", which is how a brand-new chat opened onto the
 * learner's old machine-learning project.
 *
 * Keyed by session id. A conversation with no row here has selected nothing,
 * and that is a real state rather than a missing one.
 */
export const PROJECTS_TABLE = 'session_projects'

/** Sentinel meaning "the global slot has never been written". */
export const UNINITIALIZED = ''

export const udtDomain = defineDomain({
  name: UDT_DOMAIN_NAME,
  version: UDT_DOMAIN_VERSION,
  // Storage architecture is FROZEN for v0.1.0: `single` layout, no per-record,
  // no id migration. One `udt.json` holding every record is what the learner
  // can read, copy and export.
  //
  // `invalidRecords: 'backup-and-skip'` was declared here and deliberately
  // removed. The platform only honours it when the store can move a per-record
  // document aside, so under this layout it never ran — a declaration that
  // reads like a recovery guarantee while doing nothing. What is true instead:
  // a damaged record fails the open, is reported with its table and key, is
  // **not deleted**, and the plugin loads inert rather than failing the
  // profile. `GET /export` on a healthy store is how you keep a copy. See the
  // storage section of the README, which states the same limit.
  global: {
    schema: LearnerProfileSchema,
    initial: { initializedAt: UNINITIALIZED, updatedAt: UNINITIALIZED },
  },
  tables: {
    [COURSES_TABLE]: domainTable<CourseKey, CourseRecord>(CourseSchema),
    [NODES_TABLE]: domainTable<NodeKey, NodeRecord>(NodeSchema),
    [LESSONS_TABLE]: domainTable<LessonKey, LessonRecord>(LessonSchema),
    // Keyed by course, so a course has at most one focus and starting a new
    // one is an upsert rather than an accumulation.
    [FOCUS_TABLE]: domainTable<FocusKey, FocusRecord>(FocusSchema),
    [NEXT_STEPS_TABLE]: domainTable<NextStepKey, NextStepRecord>(NextStepSchema),
    // Keyed by target node, which is what makes "press Continue twice" one
    // handoff rather than two.
    [HANDOFFS_TABLE]: domainTable<HandoffKey, HandoffRecord>(HandoffSchema),
    [PROJECTS_TABLE]: domainTable<ProjectKey, ProjectRecord>(ProjectSchema),
    // Additive v1 tables: older v1 documents open with empty planning maps.
    learning_paths: domainTable<string, LearningPath>(LearningPathSchema),
    course_runs: domainTable<string, CourseRun>(CourseRunSchema),
    [SOURCES_TABLE]: domainTable<SourceKey, SourceRecord>(SourceRecordSchema),
  },
})

export type UdtDomain = typeof udtDomain

/* -------------------------------------------------------------------------- */
/* Open handle                                                                */
/* -------------------------------------------------------------------------- */

/** Read-only diagnostics for the `udt_status` tool and for tests. */
export interface UdStateSnapshot {
  readonly domain: string
  readonly version: number
  /** Whether the global slot holds a written profile (false ⇒ never initialized). */
  readonly initialized: boolean
  readonly learner: LearnerProfile
  readonly courseCount: number
  readonly nodeCount: number
  readonly lessonCount: number
  readonly courses: readonly { id: string; title: string; status: CourseStatus }[]
}

/** The map for one course, as returned by `udt_map_get`. */
export interface CourseMap {
  readonly course: CourseRecord
  readonly nodes: readonly NodeRecord[]
}

/**
 * The plugin's whole persistence surface.
 *
 * Nothing outside this module touches the `Domain` handle, so changing the
 * storage layout later is a change in one file. Every write returns the stored
 * record so callers never have to re-read.
 */
export interface UdState {
  readonly name: string
  readonly version: number

  /* learner ---------------------------------------------------------------- */
  /** Synchronous read of the learner singleton. */
  readLearner(): LearnerProfile
  /** Whether the learner singleton has ever been written. */
  isInitialized(): boolean
  /**
   * Write the learner singleton on first open, and do nothing on later opens.
   * @param now - ISO timestamp supplied by the caller so the write is testable.
   */
  ensureLearner(now: string): Promise<LearnerProfile>
  /**
   * Merge a patch into the learner singleton and write it durably.
   * @param patch - fields to overwrite; omitted fields are preserved.
   * @param now - ISO timestamp for `updatedAt`.
   */
  updateLearner(
    patch: Partial<Omit<LearnerProfile, 'initializedAt' | 'updatedAt'>>,
    now: string,
  ): Promise<LearnerProfile>

  /* courses ---------------------------------------------------------------- */
  listCourses(): CourseRecord[]
  readCourse(id: CourseKey): CourseRecord | undefined
  /** Insert or fully replace one course. */
  writeCourse(record: CourseRecord): Promise<CourseRecord>
  /**
   * Make one course active: it becomes `active`, every other course that was
   * active becomes `paused`, and the learner's `activeCourseId` points at it.
   *
   * Only one goal is in focus at a time. Pausing is reversible — the other
   * courses keep their records and all of their nodes.
   *
   * @param courseId - the course to focus.
   * @param now - ISO timestamp.
   * @returns the activated course.
   */
  activateCourse(courseId: CourseKey, now: string): Promise<CourseRecord>

  /* nodes ------------------------------------------------------------------ */
  /** Every node of one course, in insertion order. */
  listNodes(courseId: CourseKey): NodeRecord[]
  readNode(id: NodeKey): NodeRecord | undefined
  /** Insert or fully replace one node. */
  writeNode(record: NodeRecord): Promise<NodeRecord>
  /** Read, validate, and commit a node change on the project/planning queue. The transform must not enqueue writes. */
  mutateNode(courseId: CourseKey, nodeId: NodeKey, change: (current: NodeRecord) => NodeRecord): Promise<NodeRecord>
  /** Number of nodes across every course. */
  nodeCount(): number
  /** The course plus its map. */
  readMap(courseId: CourseKey): CourseMap | undefined

  /* focus ------------------------------------------------------------------ */
  /** The recorded focus for one course, if any. */
  readFocus(sessionId: string, courseId: CourseKey): FocusRecord | undefined
  /**
   * The Learning Project this conversation has selected.
   *
   * @returns the record, or undefined when it has chosen nothing — which is
   *   the state every new conversation starts in.
   */
  readProject(sessionId: string): ProjectRecord | undefined
  /** Resolve only this conversation's project; never use learner.activeCourseId. */
  resolveProject(sessionId?: string): SessionProjectResolution
  /**
   * Record this conversation's choice.
   *
   * @param sessionId - the conversation.
   * @param courseId - the project it picked, or undefined for "start
   *   something new" — a deliberate state, not an absence of one.
   * @param now - ISO timestamp.
   */
  selectProject(sessionId: string, courseId: string | undefined, now: string): Promise<ProjectRecord>
  /** Adopt after a successful write only if the conversation's choice has not changed. */
  adoptProject(
    sessionId: string | undefined,
    courseId: string,
    now: string,
    expected: SessionProjectResolution,
    allowNew?: boolean,
  ): Promise<ProjectBindingResult>
  /** Every conversation's choice, for export. */
  listProjects(): ProjectRecord[]
  /**
   * Record that learning is starting on one node of one course.
   *
   * Fails loudly when the course or the node does not exist, or when the node
   * belongs to another course — a focus pointing at nothing would leave the
   * tutor teaching a node the map does not have.
   *
   * @param courseId - the course.
   * @param nodeId - the node to focus.
   * @param now - ISO timestamp.
   * @returns the stored focus.
   */
  startFocus(courseId: CourseKey, nodeId: NodeKey, now: string, sessionId?: string): Promise<FocusRecord>
  /** Mark this conversation's focus as ended. No-op when there is none. */
  endFocus(sessionId: string, courseId: CourseKey, now: string): Promise<void>
  /**
   * Record the tutor's decision about where to go next.
   *
   * This is the one place the focus lifecycle turns over: a decision that names
   * a target ends the focus and links the recommendation to it; a decision that
   * does not leaves the focus active, because the learner has not moved.
   *
   * The runtime validates the *shape* of the decision — the nodes must exist,
   * belong to the course, and match what the action implies — and never invents
   * a target. Choosing where to go is the tutor's.
   *
   * @param input - the decision.
   * @returns the stored recommendation and the focus after the decision.
   */
  decideNext(input: {
    courseId: CourseKey
    fromNodeId: NodeKey
    action: Readiness
    targetNodeId?: NodeKey
    reason: string
    now: string
    sessionId: string
  }): Promise<{ nextStep: NextStepRecord; focus: FocusRecord }>
  /** A recommendation by the conversation that reached it. */
  readNextStep(sessionId: string, fromNodeId: NodeKey): NextStepRecord | undefined
  /** Every recommendation, for export. */
  listNextSteps(): NextStepRecord[]
  /** Every lesson, for export. */
  listLessons(): LessonRecord[]
  /** Every focus, for export. */
  listFocus(): FocusRecord[]

  /* whole-state operations ------------------------------------------------- */
  /**
   * Everything the learner owns, as one plain document.
   *
   * Handoffs are deliberately **not** included: they are operational timing
   * for a wait in progress, not learning state, and restoring them would mean
   * restoring a claim about a model turn that is no longer running.
   */
  exportState(now: string): UdExport
  /**
   * Delete everything and return to first-run.
   *
   * Irreversible by design — an undo would mean keeping a copy of what the
   * learner asked to delete, which is the opposite of the point.
   */
  resetState(now: string): Promise<void>

  /* handoffs --------------------------------------------------------------- */
  readHandoff(sessionId: string, targetNodeId: HandoffKey): HandoffRecord | undefined
  /** Insert or replace one handoff. */
  writeHandoff(record: HandoffRecord): Promise<HandoffRecord>
  /**
   * Apply a transition atomically.
   *
   * Two writers touch a handoff concurrently in normal operation — the
   * first-activity listener and the tool that writes a lesson — and a plain
   * read-modify-write loses one of them. The domain's `update` runs the
   * transform on its single write chain, so the transitions serialise.
   *
   * @param targetNodeId - the handoff.
   * @param transform - pure transform from current to next.
   * @returns the stored record.
   */
  updateHandoff(
    sessionId: string,
    targetNodeId: HandoffKey,
    transform: (record: HandoffRecord) => HandoffRecord,
  ): Promise<HandoffRecord>
  /** The handoff for whichever node this conversation is currently focused on. */
  activeHandoff(sessionId: string): HandoffRecord | undefined
  /** Every handoff, for diagnostics and tests. */
  listHandoffs(): HandoffRecord[]
  /** This conversation's focus, joined with its course and node. */
  activeFocus(sessionId: string): { focus: FocusRecord; course: CourseRecord; node: NodeRecord } | undefined

  /* lessons ---------------------------------------------------------------- */
  readLesson(id: LessonKey): LessonRecord | undefined
  /** The lesson already stored for a node, if any. */
  lessonForNode(nodeId: NodeKey): LessonRecord | undefined
  /** Insert or fully replace one lesson. */
  writeLesson(record: LessonRecord): Promise<LessonRecord>
  /** Read, merge, and commit a node's lesson on the project/planning queue. The transform must not enqueue writes. */
  mutateLesson(courseId: CourseKey, nodeId: NodeKey, change: (current: LessonRecord | undefined) => LessonRecord): Promise<LessonRecord>
  /** Number of lessons across every course. */
  lessonCount(): number

  /* sources --------------------------------------------------------------- */
  /** Learner-supplied material, newest first is not guaranteed; callers sort if needed. */
  listSources(): SourceRecord[]
  readSource(id: SourceKey): SourceRecord | undefined
  writeSource(record: SourceRecord): Promise<SourceRecord>

  /** Immutable planning snapshots; writes are validated and revision checked inside one queue. */
  readPath(courseId: string): LearningPath | undefined
  mutatePath(courseId: string, expectedRevision: number, change: (current: LearningPath) => LearningPath): Promise<LearningPath>
  readCourseRun(courseId: string, sessionId: string): CourseRun | undefined
  /** Every planned run across conversations, for resolving "continue learning". */
  listCourseRuns(): CourseRun[]
  mutateCourseRun(courseId: string, sessionId: string, change: (current: CourseRun) => CourseRun): Promise<CourseRun>
  snapshot(): UdStateSnapshot
  /** Release the backend unit. Idempotent. */
  close(): Promise<void>
}

/**
 * Build a fresh node in its born state.
 *
 * Kept here rather than in the tool layer so the "nothing is born confirmed"
 * rule has exactly one implementation.
 *
 * @param input - the fields the caller supplies.
 * @returns a complete, valid record.
 */
export function newNode(input: {
  id: string
  courseId: string
  title: string
  relation: NodeRelation
  parentId?: string
  state?: NodeState
  evidence?: Evidence[]
  now: string
}): NodeRecord {
  const record: NodeRecord = {
    id: input.id,
    courseId: input.courseId,
    title: input.title,
    relation: input.relation,
    state: input.state ?? INITIAL_NODE_STATE,
    evidence: input.evidence ?? [],
    createdAt: input.now,
    updatedAt: input.now,
  }
  if (input.parentId !== undefined) record.parentId = input.parentId
  return record
}

/**
 * Open the plugin's domain over the host's facility.
 *
 * The caller owns the returned handle and must `close()` it — see `apply`,
 * which does so from a `ctx.effect` disposer so an unload leaves no residue.
 *
 * @param facility - the `storageDomain` service taken from `ctx`.
 * @returns the open handle.
 */
export async function openUdState(facility: DomainFacility): Promise<UdState> {
  const domain: Domain<UdtDomain> = await facility.open(udtDomain)
  const courses: KvTable<CourseKey, CourseRecord> = domain.table(COURSES_TABLE)
  const nodes: KvTable<NodeKey, NodeRecord> = domain.table(NODES_TABLE)
  const lessons: KvTable<LessonKey, LessonRecord> = domain.table(LESSONS_TABLE)
  const focus: KvTable<FocusKey, FocusRecord> = domain.table(FOCUS_TABLE)
  const nextSteps: KvTable<NextStepKey, NextStepRecord> = domain.table(NEXT_STEPS_TABLE)
  const handoffs: KvTable<HandoffKey, HandoffRecord> = domain.table(HANDOFFS_TABLE)
  const projects: KvTable<ProjectKey, ProjectRecord> = domain.table(PROJECTS_TABLE)
  const paths: KvTable<string, LearningPath> = domain.table('learning_paths')
  const runs: KvTable<string, CourseRun> = domain.table('course_runs')
  const sources: KvTable<SourceKey, SourceRecord> = domain.table(SOURCES_TABLE)
  let planningGeneration = 0
  const runKey = (courseId: string, sessionId: string) => JSON.stringify([sessionId, courseId])
  const learner: DomainGlobal<LearnerProfile> = domain.global

  const listNodesFor = (courseId: CourseKey): NodeRecord[] =>
    [...nodes.entries()].map(([, record]) => record).filter((record) => record.courseId === courseId)

  const projectRevisions = new Map<string, number>()
  let projectWrites: Promise<unknown> = Promise.resolve()
  const withProjectWrite = <T>(write: () => Promise<T>): Promise<T> => {
    const result = projectWrites.then(write)
    projectWrites = result.catch(() => undefined)
    return result
  }

  const resolveProjectFor = (sessionId?: string): SessionProjectResolution => {
    const revision = sessionId === undefined ? 0 : projectRevisions.get(sessionId) ?? 0
    if (sessionId === undefined || sessionId.length === 0) {
      return { selection: 'none', sessionAvailable: false, reason: 'missing-session-id', revision }
    }
    const chosen = projects.get(sessionId)
    if (chosen !== undefined) {
      if (chosen.courseId === undefined) return { selection: 'new', sessionAvailable: true, revision }
      const course = courses.get(chosen.courseId)
      return course === undefined
        ? { selection: 'none', sessionAvailable: true, reason: 'stale-project', revision }
        : { selection: 'project', sessionAvailable: true, course, revision }
    }

    // Ended focuses still name the project a legacy conversation was working
    // in. Multiple projects are ambiguous; a learner-global pointer is no help.
    const candidates = [...courses.entries()]
      .map(([, course]) => course)
      .filter((course) => focus.get(focusKey(sessionId, course.id)) !== undefined)
    if (candidates.length === 1) return { selection: 'project', sessionAvailable: true, course: candidates[0]!, revision }
    if (candidates.length > 1) {
      return { selection: 'none', sessionAvailable: true, reason: 'ambiguous-session-project', revision }
    }
    return { selection: 'none', sessionAvailable: true, revision }
  }

  const activeFocusFor = (sessionId: string) => {
    const course = resolveProjectFor(sessionId).course
    if (course === undefined) return undefined
    const record = focus.get(focusKey(sessionId, course.id))
    if (record === undefined || record.status !== 'active') return undefined
    const node = nodes.get(record.nodeId)
    return node === undefined || node.courseId !== course.id ? undefined : { focus: record, course, node }
  }

  const selectProjectFor = async (sessionId: string, courseId: string | undefined, now: string) => {
    if (sessionId.length === 0) throw new Error('a project choice must name a conversation')
    if (courseId !== undefined && courses.get(courseId) === undefined) throw new Error(`no course "${courseId}"`)
    const record: ProjectRecord = {
      sessionId,
      selectedAt: now,
      ...(courseId === undefined ? {} : { courseId }),
    }
    await projects.put(sessionId, record)
    projectRevisions.set(sessionId, (projectRevisions.get(sessionId) ?? 0) + 1)
    return record
  }

  return {
    name: domain.name,
    version: UDT_DOMAIN_VERSION,

    readLearner: () => learner.get(),

    isInitialized: () => learner.get().initializedAt !== UNINITIALIZED,

    async ensureLearner(now) {
      const current = learner.get()
      if (current.initializedAt !== UNINITIALIZED) return current
      const initialized: LearnerProfile = { initializedAt: now, updatedAt: now }
      await learner.set(initialized)
      return initialized
    },

    async updateLearner(patch, now) {
      const current = learner.get()
      // Preserve the original initialization marker; only the first write sets it.
      const next: LearnerProfile = {
        ...current,
        ...patch,
        initializedAt: current.initializedAt || now,
        updatedAt: now,
      }
      await learner.set(next)
      return next
    },

    listCourses: () => [...courses.entries()].map(([, record]) => record),

    readCourse: (id) => courses.get(id),

    async writeCourse(record) {
      await courses.put(record.id, record)
      return record
    },

    async activateCourse(courseId, now) {
      const target = courses.get(courseId)
      if (!target) throw new Error(`no course "${courseId}"`)

      // Pause whatever was in focus, then promote the target. Both writes ride
      // the domain's single chain, so a reader never sees two active goals.
      for (const [key, record] of [...courses.entries()]) {
        if (key === courseId || record.status !== 'active') continue
        await courses.put(key, { ...record, status: 'paused', updatedAt: now })
      }
      const activated: CourseRecord = { ...target, status: 'active', updatedAt: now }
      await courses.put(courseId, activated)
      await learner.set({ ...learner.get(), activeCourseId: courseId, updatedAt: now })
      return activated
    },

    listNodes: listNodesFor,

    readNode: (id) => nodes.get(id),

    async writeNode(record) {
      await nodes.put(record.id, record)
      return record
    },

    mutateNode(courseId, nodeId, change) {
      const generation = planningGeneration
      return withProjectWrite(async () => {
        if (generation !== planningGeneration || !courses.get(courseId)) throw new Error('project-unavailable: refresh the selected project')
        const current = nodes.get(nodeId)
        if (!current || current.courseId !== courseId) throw new Error('node-unavailable: use an existing node in this project')
        const proposed = change(structuredClone(current))
        if (proposed.id !== nodeId || proposed.courseId !== courseId) throw new Error('node identity cannot change')
        const next = NodeSchema.parse(proposed)
        await nodes.put(nodeId, next)
        return structuredClone(next)
      })
    },

    nodeCount: () => nodes.size,

    readMap(courseId) {
      const course = courses.get(courseId)
      if (!course) return undefined
      return { course, nodes: listNodesFor(courseId) }
    },

    readFocus: (sessionId, courseId) => {
      const record = focus.get(focusKey(sessionId, courseId))
      if (record !== undefined) return record
      // A record under the bare course key predates session scoping. It cannot
      // say whose it is, so it is not returned to anyone — see
      // execution-key.ts. Left where it is; never migrated on a guess.
      if (focus.get(courseId) !== undefined) {
        logIgnoredLegacy('focus', courseId)
      }
      return undefined
    },

    async startFocus(courseId, nodeId, now, sessionId) {
      if (sessionId === undefined || sessionId.length === 0) {
        throw new Error('a focus must name the conversation it belongs to')
      }
      const course = courses.get(courseId)
      if (!course) throw new Error(`no course "${courseId}"`)
      const node = nodes.get(nodeId)
      if (!node) throw new Error(`no node "${nodeId}"`)
      if (node.courseId !== courseId) {
        throw new Error(`node "${nodeId}" belongs to course "${node.courseId}", not "${courseId}"`)
      }
      const record: FocusRecord = { courseId, nodeId, startedAt: now, status: 'active', updatedAt: now, sessionId }
      await focus.put(focusKey(sessionId, courseId), record)
      return record
    },

    async endFocus(sessionId, courseId, now) {
      const key = focusKey(sessionId, courseId)
      const current = focus.get(key)
      if (!current || current.status === 'ended') return
      await focus.put(key, { ...current, status: 'ended', endedAt: now, updatedAt: now })
    },

    async decideNext(input) {
      if (input.sessionId === undefined || input.sessionId.length === 0) {
        throw new Error('a decision must name the conversation it was reached in')
      }
      const course = courses.get(input.courseId)
      if (!course) throw new Error(`no course "${input.courseId}"`)
      const from = nodes.get(input.fromNodeId)
      if (!from) throw new Error(`no node "${input.fromNodeId}"`)
      if (from.courseId !== input.courseId) {
        throw new Error(`node "${input.fromNodeId}" belongs to course "${from.courseId}"`)
      }
      if (input.targetNodeId !== undefined) {
        const target = nodes.get(input.targetNodeId)
        if (!target) throw new Error(`no node "${input.targetNodeId}"`)
        if (target.courseId !== input.courseId) {
          throw new Error(`node "${input.targetNodeId}" belongs to course "${target.courseId}"`)
        }
        if (input.targetNodeId === input.fromNodeId) {
          throw new Error('a target node equal to the current one is a stay: omit targetNodeId')
        }
      }

      const nextStep: NextStepRecord = {
        fromNodeId: input.fromNodeId,
        courseId: input.courseId,
        action: input.action,
        reason: input.reason,
        createdAt: input.now,
        ...(input.targetNodeId === undefined ? {} : { targetNodeId: input.targetNodeId }),
      }
      await nextSteps.put(nextStepKey(input.sessionId, input.fromNodeId), nextStep)

      // A move ends the focus; staying keeps it, because the learner has not
      // moved and the panel must not say they have.
      const moves = endsFocus(input.action, input.targetNodeId !== undefined)
      const current = focus.get(focusKey(input.sessionId, input.courseId)) ?? {
        courseId: input.courseId,
        nodeId: input.fromNodeId,
        startedAt: input.now,
        status: 'active' as const,
        updatedAt: input.now,
        sessionId: input.sessionId,
      }
      const nextFocus: FocusRecord = moves
        ? {
            ...current,
            status: 'ended',
            endedAt: input.now,
            nextStepId: input.fromNodeId,
            updatedAt: input.now,
          }
        : { ...current, status: 'active', nextStepId: input.fromNodeId, updatedAt: input.now }
      await focus.put(focusKey(input.sessionId, input.courseId), nextFocus)

      return { nextStep, focus: nextFocus }
    },

    readProject: (sessionId) => projects.get(sessionId),

    resolveProject: resolveProjectFor,

    selectProject: (sessionId, courseId, now) => withProjectWrite(() => selectProjectFor(sessionId, courseId, now)),

    adoptProject: (sessionId, courseId, now, expected, allowNew = false) => withProjectWrite(async () => {
      const current = resolveProjectFor(sessionId)
      if (!current.sessionAvailable) return { projectAdopted: false, projectBinding: 'missing-session-id' }
      if (current.course?.id === courseId) return { projectAdopted: false, projectBinding: 'already-selected' }
      if (
        current.revision !== expected.revision || current.selection !== expected.selection ||
        current.reason !== undefined || current.selection === 'project' ||
        (current.selection === 'new' && !allowNew)
      ) return { projectAdopted: false, projectBinding: 'not-selected' }
      await selectProjectFor(sessionId!, courseId, now)
      return { projectAdopted: true, projectBinding: 'adopted' }
    }),

    listProjects: () => [...projects.entries()].map(([, record]) => record),

    readNextStep: (sessionId, fromNodeId) => {
      const record = nextSteps.get(nextStepKey(sessionId, fromNodeId))
      if (record !== undefined) return record
      if (nextSteps.get(fromNodeId) !== undefined) logIgnoredLegacy('next_steps', fromNodeId)
      return undefined
    },

    listNextSteps: () => [...nextSteps.entries()].map(([, record]) => record),
    listLessons: () => [...lessons.entries()].map(([, record]) => record),
    listFocus: () => [...focus.entries()].map(([, record]) => record),

    exportState(now) {
      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: now,
        domain: { name: domain.name, version: EXPORT_VERSION },
        learner: learner.get(),
        courses: [...courses.entries()].map(([, record]) => record),
        nodes: [...nodes.entries()].map(([, record]) => record),
        lessons: [...lessons.entries()].map(([, record]) => record),
        nextSteps: [...nextSteps.entries()].map(([, record]) => record),
        focus: [...focus.entries()].map(([, record]) => record),
        // Which project each conversation had open. Part of what the learner
        // owns: it is a choice they made, and an export that dropped it would
        // restore them to a library with nothing selected.
        projects: [...projects.entries()].map(([, record]) => record),
        learningPaths: [...paths.entries()].map(([, record]) => structuredClone(record)),
        courseRuns: [...runs.entries()].map(([, record]) => structuredClone(record)),
        sources: [...sources.entries()].map(([, record]) => structuredClone(record)),
      }
    },

    async resetState(now) {
      // Invalidate planning work captured before reset; serialize with planning
      // and project selections so late writes cannot resurrect deleted plans.
      ++planningGeneration
      await withProjectWrite(async () => {
        for (const table of [courses, nodes, lessons, focus, nextSteps, handoffs, projects, paths, runs, sources]) {
          for (const key of [...table.keys()]) await table.delete(key)
        }
        await learner.set({ initializedAt: UNINITIALIZED, updatedAt: now })
      })
    },

    readHandoff: (sessionId, targetNodeId) => {
      const record = handoffs.get(handoffKey(sessionId, targetNodeId))
      if (record !== undefined) return record
      if (handoffs.get(targetNodeId) !== undefined) logIgnoredLegacy('handoffs', targetNodeId)
      return undefined
    },

    async writeHandoff(record) {
      if (record.sessionId === undefined || record.sessionId.length === 0) {
        throw new Error('a handoff must name the conversation it was requested in')
      }
      await handoffs.put(handoffKey(record.sessionId, record.targetNodeId), record)
      return record
    },

    async updateHandoff(sessionId, targetNodeId, transform) {
      const key = handoffKey(sessionId, targetNodeId)
      const current = handoffs.get(key)
      if (current === undefined) throw new Error(`no handoff for "${targetNodeId}" in this conversation`)
      return handoffs.update(key, (record) => transform(record))
    },

    listHandoffs: () => [...handoffs.entries()].map(([, record]) => record),

    activeHandoff(sessionId) {
      const active = activeFocusFor(sessionId)
      if (active === undefined) return undefined
      return handoffs.get(handoffKey(sessionId, active.focus.nodeId))
    },

    activeFocus: activeFocusFor,

    readLesson: (id) => lessons.get(id),

    lessonForNode: (nodeId) =>
      [...lessons.entries()].map(([, record]) => record).find((record) => record.nodeId === nodeId),

    async writeLesson(record) {
      await lessons.put(record.id, record)
      return record
    },

    mutateLesson(courseId, nodeId, change) {
      const generation = planningGeneration
      return withProjectWrite(async () => {
        if (generation !== planningGeneration || !courses.get(courseId)) throw new Error('project-unavailable: refresh the selected project')
        if (nodes.get(nodeId)?.courseId !== courseId) throw new Error('node-unavailable: use an existing node in this project')
        const current = [...lessons.entries()].map(([, record]) => record).find((record) => record.nodeId === nodeId)
        const proposed = change(current === undefined ? undefined : structuredClone(current))
        if (proposed.courseId !== courseId || proposed.nodeId !== nodeId || (current && proposed.id !== current.id)) throw new Error('lesson identity cannot change')
        const next = LessonSchema.parse(proposed)
        await lessons.put(next.id, next)
        return structuredClone(next)
      })
    },

    lessonCount: () => lessons.size,

    listSources: () => [...sources.entries()].map(([, record]) => structuredClone(record)),

    readSource: (id) => {
      const record = sources.get(id)
      return record === undefined ? undefined : structuredClone(record)
    },

    async writeSource(record) {
      await sources.put(record.id, record)
      return record
    },

    readPath: (courseId) => {
      const record = paths.get(courseId)
      return record === undefined ? undefined : structuredClone(record)
    },

    mutatePath(courseId, expectedRevision, change) {
      const generation = planningGeneration
      return withProjectWrite(async () => {
        if (generation !== planningGeneration || !courses.get(courseId)) throw new Error('project-unavailable: refresh the selected project')
        const current = structuredClone(paths.get(courseId) ?? emptyPath(courseId, new Date().toISOString()))
        if (current.revision !== expectedRevision) throw new Error('revision-conflict: learning plan changed; refresh before writing')
        const proposed = change(current)
        if (proposed.courseId !== courseId) throw new Error('planning project identity cannot change')
        const next = LearningPathSchema.parse({ ...proposed, revision: current.revision + 1 })
        await paths.put(courseId, next)
        return structuredClone(next)
      })
    },

    readCourseRun: (courseId, sessionId) => {
      const record = runs.get(runKey(courseId, sessionId))
      return record === undefined ? undefined : structuredClone(record)
    },

    listCourseRuns: () => [...runs.entries()].map(([, record]) => structuredClone(record)),

    mutateCourseRun(courseId, sessionId, change) {
      const generation = planningGeneration
      return withProjectWrite(async () => {
        if (!sessionId || generation !== planningGeneration || !courses.get(courseId)) throw new Error('project-unavailable: refresh the selected project')
        const key = runKey(courseId, sessionId)
        const current = structuredClone(runs.get(key) ?? emptyRun(courseId, sessionId, new Date().toISOString()))
        const proposed = change(current)
        if (proposed.courseId !== courseId || proposed.sessionId !== sessionId) throw new Error('course run identity cannot change')
        const next = CourseRunSchema.parse({ ...proposed, revision: current.revision + 1 })
        await runs.put(key, next)
        return structuredClone(next)
      })
    },

    snapshot() {
      const profile = learner.get()
      return {
        domain: domain.name,
        version: UDT_DOMAIN_VERSION,
        initialized: profile.initializedAt !== UNINITIALIZED,
        learner: profile,
        courseCount: courses.size,
        nodeCount: nodes.size,
        lessonCount: lessons.size,
        courses: [...courses.entries()].map(([id, record]) => ({
          id,
          title: record.title,
          status: record.status,
        })),
      }
    },

    close: () => domain.close(),
  }
}
