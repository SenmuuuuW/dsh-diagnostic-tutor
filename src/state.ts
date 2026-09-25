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
import { HandoffSchema } from './handoff.js'
import type { HandoffKey, HandoffRecord } from './handoff.js'

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
  /** The recommendation produced when this focus ended. */
  nextStepId: z.string().optional(),
})
export type FocusRecord = z.infer<typeof FocusSchema>
export type FocusKey = string

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
}

export type CourseKey = string
export type NodeKey = string

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
export const COURSES_TABLE = 'courses'
export const NODES_TABLE = 'nodes'
export const LESSONS_TABLE = 'lessons'
export const FOCUS_TABLE = 'focus'
export const NEXT_STEPS_TABLE = 'next_steps'
export const HANDOFFS_TABLE = 'handoffs'

/** Sentinel meaning "the global slot has never been written". */
export const UNINITIALIZED = ''

export const udtDomain = defineDomain({
  name: UDT_DOMAIN_NAME,
  version: UDT_DOMAIN_VERSION,
  // Declared so that one unreadable record does not cost the learner the rest:
  // the backend moves the record's document aside, logs the cause, and opens
  // without it. The platform gates this on the unit being able to move a
  // per-record document, and this domain uses the default `single` layout —
  // one `udt.json` for everything — where there is no such document, so the
  // option currently falls back to the rejecting default. It is declared
  // anyway because it is the correct intent and becomes live the moment the
  // layout changes; see the damaged-store note in the README for what this
  // costs today.
  invalidRecords: 'backup-and-skip',
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
  /** Number of nodes across every course. */
  nodeCount(): number
  /** The course plus its map. */
  readMap(courseId: CourseKey): CourseMap | undefined

  /* focus ------------------------------------------------------------------ */
  /** The recorded focus for one course, if any. */
  readFocus(courseId: CourseKey): FocusRecord | undefined
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
  startFocus(courseId: CourseKey, nodeId: NodeKey, now: string): Promise<FocusRecord>
  /** Mark the course's focus as ended. No-op when there is none. */
  endFocus(courseId: CourseKey, now: string): Promise<void>
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
  }): Promise<{ nextStep: NextStepRecord; focus: FocusRecord }>
  /** The most recent recommendation recorded for a course, if any. */
  latestNextStep(courseId: CourseKey): NextStepRecord | undefined
  /** A recommendation by key. */
  readNextStep(id: NextStepKey): NextStepRecord | undefined
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
  readHandoff(targetNodeId: HandoffKey): HandoffRecord | undefined
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
    targetNodeId: HandoffKey,
    transform: (record: HandoffRecord) => HandoffRecord,
  ): Promise<HandoffRecord>
  /** The handoff for whichever node is currently focused, if any. */
  activeHandoff(): HandoffRecord | undefined
  /** Every handoff, for diagnostics and tests. */
  listHandoffs(): HandoffRecord[]
  /** The focus of the learner's active course, joined with its course and node. */
  activeFocus(): { focus: FocusRecord; course: CourseRecord; node: NodeRecord } | undefined

  /* lessons ---------------------------------------------------------------- */
  readLesson(id: LessonKey): LessonRecord | undefined
  /** The lesson already stored for a node, if any. */
  lessonForNode(nodeId: NodeKey): LessonRecord | undefined
  /** Insert or fully replace one lesson. */
  writeLesson(record: LessonRecord): Promise<LessonRecord>
  /** Number of lessons across every course. */
  lessonCount(): number

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
  const learner: DomainGlobal<LearnerProfile> = domain.global

  const listNodesFor = (courseId: CourseKey): NodeRecord[] =>
    [...nodes.entries()].map(([, record]) => record).filter((record) => record.courseId === courseId)

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

    nodeCount: () => nodes.size,

    readMap(courseId) {
      const course = courses.get(courseId)
      if (!course) return undefined
      return { course, nodes: listNodesFor(courseId) }
    },

    readFocus: (courseId) => focus.get(courseId),

    async startFocus(courseId, nodeId, now) {
      const course = courses.get(courseId)
      if (!course) throw new Error(`no course "${courseId}"`)
      const node = nodes.get(nodeId)
      if (!node) throw new Error(`no node "${nodeId}"`)
      if (node.courseId !== courseId) {
        throw new Error(`node "${nodeId}" belongs to course "${node.courseId}", not "${courseId}"`)
      }
      const record: FocusRecord = { courseId, nodeId, startedAt: now, status: 'active', updatedAt: now }
      await focus.put(courseId, record)
      return record
    },

    async endFocus(courseId, now) {
      const current = focus.get(courseId)
      if (!current || current.status === 'ended') return
      await focus.put(courseId, { ...current, status: 'ended', endedAt: now, updatedAt: now })
    },

    async decideNext(input) {
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
      await nextSteps.put(input.fromNodeId, nextStep)

      // A move ends the focus; staying keeps it, because the learner has not
      // moved and the panel must not say they have.
      const moves = endsFocus(input.action, input.targetNodeId !== undefined)
      const current = focus.get(input.courseId) ?? {
        courseId: input.courseId,
        nodeId: input.fromNodeId,
        startedAt: input.now,
        status: 'active' as const,
        updatedAt: input.now,
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
      await focus.put(input.courseId, nextFocus)

      return { nextStep, focus: nextFocus }
    },

    latestNextStep(courseId) {
      return [...nextSteps.entries()]
        .map(([, record]) => record)
        .filter((record) => record.courseId === courseId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
    },

    readNextStep: (id) => nextSteps.get(id),

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
      }
    },

    async resetState(now) {
      // Table by table, on the domain's own write chain, so a reset cannot
      // interleave with a write that is already queued.
      for (const table of [courses, nodes, lessons, focus, nextSteps, handoffs]) {
        for (const key of [...table.keys()]) await table.delete(key)
      }
      await learner.set({ initializedAt: UNINITIALIZED, updatedAt: now })
    },

    readHandoff: (targetNodeId) => handoffs.get(targetNodeId),

    async writeHandoff(record) {
      await handoffs.put(record.targetNodeId, record)
      return record
    },

    async updateHandoff(targetNodeId, transform) {
      const current = handoffs.get(targetNodeId)
      if (current === undefined) throw new Error(`no handoff for "${targetNodeId}"`)
      return handoffs.update(targetNodeId, (record) => transform(record))
    },

    listHandoffs: () => [...handoffs.entries()].map(([, record]) => record),

    activeHandoff() {
      const courseId = learner.get().activeCourseId
      const record = courseId === undefined ? undefined : focus.get(courseId)
      if (record === undefined) return undefined
      return handoffs.get(record.nodeId)
    },

    activeFocus() {
      const courseId = learner.get().activeCourseId
      if (courseId === undefined) return undefined
      const record = focus.get(courseId)
      if (record === undefined || record.status !== 'active') return undefined
      const course = courses.get(courseId)
      const node = nodes.get(record.nodeId)
      if (!course || !node) return undefined
      return { focus: record, course, node }
    },

    readLesson: (id) => lessons.get(id),

    lessonForNode: (nodeId) =>
      [...lessons.entries()].map(([, record]) => record).find((record) => record.nodeId === nodeId),

    async writeLesson(record) {
      await lessons.put(record.id, record)
      return record
    },

    lessonCount: () => lessons.size,

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
