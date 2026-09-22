/**
 * The persistence contract for dsh-diagnostic-tutor.
 *
 * This module owns one Cordis **storage domain** — the official DSH
 * persistence seam — and nothing else. It deliberately contains no teaching
 * logic and no map/lesson concepts yet: those arrive in v0.0.3/v0.0.4. What it
 * establishes is the shape every later table will follow.
 *
 * Why a storage domain rather than files of our own:
 *   - it is the supported seam; the profile routes it to a backend (the web
 *     profile uses `dsh-storage-json` under `dshHomePath('storages')`);
 *   - **the zod schema is the contract** — every record is validated at the
 *     durable boundary, so corrupt data cannot enter memory;
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
 * `defineDomain` and `domainTable` are a different category: they are **pure
 * builder functions**. `domainTable(schema)` is literally
 * `{ valueSchema: schema }`, and `defineDomain(spec)` validates a spec and
 * returns it unchanged. They take plain data and return plain data, carry no
 * identity, and are re-exported by the host for exactly this use. So they are
 * value-imported and declared as peer dependencies — the same pattern every
 * published DSH plugin uses.
 *
 * The rule that still holds absolutely: never `instanceof` a returned object,
 * and take every service instance (`DomainFacility`, `Domain`, stores) from
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

/* -------------------------------------------------------------------------- */
/* Closed vocabularies                                                        */
/* -------------------------------------------------------------------------- */

/**
 * These mirror vocabularies the Universal Diagnostic Tutor skill already owns.
 * They are copied verbatim rather than re-invented: the skill's own protocol
 * says "never invent a second vocabulary", and duplicating the terms here
 * would make the plugin and the teaching brain disagree over time.
 */

/** Teaching modes (skill: `references/teaching_modes.md`). */
export const TEACHING_MODES = ['auto', 'zero-base', 'standard', 'advanced'] as const
export const TeachingModeSchema = z.enum(TEACHING_MODES)
export type TeachingMode = z.infer<typeof TeachingModeSchema>

/** Lifecycle of a learning goal. Not a mastery status — see PLAN.md §5. */
export const COURSE_STATUSES = ['active', 'paused', 'archived'] as const
export const CourseStatusSchema = z.enum(COURSE_STATUSES)
export type CourseStatus = z.infer<typeof CourseStatusSchema>

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
 */
export const LearnerProfileSchema = z.object({
  preferredLanguage: z.string().min(1).optional(),
  mode: TeachingModeSchema.optional(),
  activeCourseId: z.string().min(1).optional(),
  initializedAt: z.string(),
  updatedAt: z.string(),
})
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>

/** A learning goal in the learner's own words. Container for later tables. */
export const CourseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  status: CourseStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CourseRecord = z.infer<typeof CourseSchema>

export type CourseKey = string

/* -------------------------------------------------------------------------- */
/* Domain declaration                                                         */
/* -------------------------------------------------------------------------- */

/** Domain name. Must match the storage hub's `UNIT_NAME_RE` (`^[a-z][a-z0-9_]*$`). */
export const UDT_DOMAIN_NAME = 'udt'
export const UDT_DOMAIN_VERSION = 1
export const COURSES_TABLE = 'courses'

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
  readonly courses: readonly { id: string; title: string; status: CourseStatus }[]
}

/**
 * The plugin's whole persistence surface.
 *
 * Nothing outside this module touches the `Domain` handle, so swapping the
 * storage layout later is a change in one file. Every write returns the stored
 * record so callers never have to re-read.
 */
export interface UdState {
  readonly name: string
  readonly version: number
  /** Synchronous read of the learner singleton. */
  readLearner(): LearnerProfile
  /** Whether the learner singleton has ever been written. */
  isInitialized(): boolean
  /**
   * Write the learner singleton on first open, and do nothing on later opens.
   * @param now - ISO timestamp supplied by the caller so the write is testable.
   * @returns the stored profile (freshly initialized or already present).
   */
  ensureLearner(now: string): Promise<LearnerProfile>
  /**
   * Merge a patch into the learner singleton and write it durably.
   * @param patch - fields to overwrite; omitted fields are preserved.
   * @param now - ISO timestamp for `updatedAt`.
   */
  updateLearner(patch: Partial<Omit<LearnerProfile, 'initializedAt' | 'updatedAt'>>, now: string): Promise<LearnerProfile>
  listCourses(): CourseRecord[]
  readCourse(id: CourseKey): CourseRecord | undefined
  /** Insert or fully replace one course. */
  writeCourse(record: CourseRecord): Promise<CourseRecord>
  snapshot(): UdStateSnapshot
  /** Release the backend unit. Idempotent. */
  close(): Promise<void>
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
  const learner: DomainGlobal<LearnerProfile> = domain.global

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

    snapshot() {
      const profile = learner.get()
      return {
        domain: domain.name,
        version: UDT_DOMAIN_VERSION,
        initialized: profile.initializedAt !== UNINITIALIZED,
        learner: profile,
        courseCount: courses.size,
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
