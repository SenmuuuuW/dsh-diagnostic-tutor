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

import {
  EvidenceKindSchema,
  INITIAL_NODE_STATE,
  NodeRelationSchema,
  NodeStateSchema,
  ReadinessSchema,
  TeachingModeSchema,
} from './vocabulary.js'
import type { NodeRelation, NodeState } from './vocabulary.js'
import { LessonSchema } from './lesson.js'
import type { LessonKey, LessonRecord } from './lesson.js'

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

/** Sentinel meaning "the global slot has never been written". */
export const UNINITIALIZED = ''

export const udtDomain = defineDomain({
  name: UDT_DOMAIN_NAME,
  version: UDT_DOMAIN_VERSION,
  global: {
    schema: LearnerProfileSchema,
    initial: { initializedAt: UNINITIALIZED, updatedAt: UNINITIALIZED },
  },
  tables: {
    [COURSES_TABLE]: domainTable<CourseKey, CourseRecord>(CourseSchema),
    [NODES_TABLE]: domainTable<NodeKey, NodeRecord>(NodeSchema),
    [LESSONS_TABLE]: domainTable<LessonKey, LessonRecord>(LessonSchema),
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
