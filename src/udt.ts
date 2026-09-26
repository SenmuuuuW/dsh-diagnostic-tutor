/**
 * Detection of the Universal Diagnostic Tutor skill.
 *
 * This module answers one question — "is the teaching brain present in this
 * environment, and does it look like the one we mirror?" — and nothing else.
 *
 * How detection works, and what it deliberately avoids:
 *   - it asks the **skill registry** (`ctx.skills`), the platform's own
 *     discovery service, rather than looking at the filesystem. No path is
 *     hardcoded and no skill root is assumed;
 *   - it never copies, vendors or imports the skill's logic;
 *   - it never constructs a DSH runtime object; the registry arrives from `ctx`;
 *   - if anything is missing it returns an unavailable status with a reason
 *     instead of throwing, so a profile without the skill degrades rather than
 *     crashes.
 *
 * **Leakage rule.** `path` and `fingerprint` exist for the plugin's own
 * diagnostics and for a future state panel. They must never reach
 * learner-facing text: the skill's own protocol forbids naming its files,
 * versions or repository in a tutoring reply, and this runtime will not be the
 * thing that leaks them. Detection results are logged at `debug` and are
 * deliberately absent from every tool's output schema.
 */

import { createHash } from 'node:crypto'

import type { SkillRegistry } from '@deepseek-ai/dsh-skill'

/** The skill's canonical name, as declared in its frontmatter. */
export const UDT_SKILL_NAME = 'universal-diagnostic-tutor'

/** How much we were able to verify about the detected skill. */
export const UDT_COMPATIBILITIES = ['compatible', 'unknown', 'unavailable'] as const
export type UdtCompatibility = (typeof UDT_COMPATIBILITIES)[number]

export interface UdtSkillStatus {
  /** Whether the skill was found in the catalog. */
  readonly available: boolean
  /**
   * Whether the catalog could be read well enough to conclude anything.
   *
   * `false` means the skill was not found **in a catalog that demonstrably has
   * entries**, so its absence is a real finding. `true` means entries were
   * visible and the search was meaningful.
   *
   * This distinction exists because the registry's `list()` reads **the global
   * layer alone** unless given a viewing `scope`, and the standard web profile
   * mounts the filesystem skill provider inside a nested agent layer. From a
   * plugin at the profile root the catalog is therefore *empty* even when the
   * skill is installed and the tutor is using it — a miss that says nothing.
   * Treating that as "not installed" produced a confident, wrong answer.
   */
  readonly catalogVisible: boolean
  /** The name we looked for. */
  readonly name: string
  readonly compatibility: UdtCompatibility
  /** Discovery source label reported by the registry (provider-specific). */
  readonly source?: string
  /** Owning provider's name. */
  readonly provider?: string
  /** Directory the skill was loaded from. INTERNAL — never learner-facing. */
  readonly path?: string
  /** Short content digest; a version hint that needs no version field. INTERNAL. */
  readonly fingerprint?: string
  /** Why the status is what it is. Safe to log. */
  readonly reason?: string
}

/**
 * Vocabulary that must appear in the skill body for us to call it compatible.
 *
 * The skill cannot declare a version — its maintenance contract permits only
 * `name` and `description` in frontmatter — so compatibility is probed by
 * *capability* instead: the terms this runtime mirrors must actually be there.
 * That is more robust than a version string and needs no upstream change.
 *
 * These are deliberately few and structural: the Core Loop's `Diagnose` step
 * and two ends of the seven-term status vocabulary.
 */
export const CAPABILITY_ANCHORS = ['Diagnose', 'unconfirmed', 'blocked'] as const

/** Stable short digest of a skill body, used as a version hint. */
export function fingerprintContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 12)
}

function unavailable(name: string, reason: string, catalogVisible = false): UdtSkillStatus {
  return { available: false, name, compatibility: 'unavailable', reason, catalogVisible }
}

/**
 * Detect the teaching brain.
 *
 * @param skills - the skill registry taken from `ctx`, or `undefined` when the
 *   profile does not mount one.
 * @returns the detection status; never throws.
 */
export async function detectUdtSkill(skills: SkillRegistry | undefined): Promise<UdtSkillStatus> {
  if (!skills) {
    return unavailable(UDT_SKILL_NAME, 'no skill catalog is mounted in this profile')
  }

  let summaries
  try {
    summaries = await skills.list()
  } catch (error) {
    return unavailable(UDT_SKILL_NAME, `skill discovery failed: ${(error as Error).message}`)
  }

  const summary = summaries.find((entry) => entry.name === UDT_SKILL_NAME)
  if (!summary) {
    // An empty catalog proves nothing: see `catalogVisible`. Report the miss
    // either way, but only claim absence when entries were actually visible.
    return summaries.length === 0
      ? unavailable(
          UDT_SKILL_NAME,
          'no skills are visible from this profile scope; the catalog is mounted per agent ' +
            'in some profiles, so nothing can be concluded about what is installed',
          false,
        )
      : unavailable(UDT_SKILL_NAME, `not among the ${summaries.length} skills visible in this scope`, true)
  }

  const base = {
    available: true,
    catalogVisible: true,
    name: UDT_SKILL_NAME,
    source: summary.source,
    provider: summary.provider,
  } as const

  // `list()` gives a cheap location via `resourceBase`; only a directory-based
  // provider has a path at all, and a remote provider legitimately has none.
  const listedPath =
    summary.resourceBase?.kind === 'directory' ? summary.resourceBase.path : undefined

  let definition
  try {
    definition = await skills.get(UDT_SKILL_NAME)
  } catch (error) {
    return {
      ...base,
      compatibility: 'unknown',
      reason: `listed but its body could not be loaded: ${(error as Error).message}`,
      ...(listedPath === undefined ? {} : { path: listedPath }),
    }
  }

  if (!definition) {
    return {
      ...base,
      compatibility: 'unknown',
      reason: 'listed but its body could not be loaded',
      ...(listedPath === undefined ? {} : { path: listedPath }),
    }
  }

  const path = definition.path ?? listedPath
  const fingerprint = fingerprintContent(definition.content)
  const missing = CAPABILITY_ANCHORS.filter((anchor) => !definition.content.includes(anchor))

  if (missing.length > 0) {
    return {
      ...base,
      compatibility: 'unknown',
      fingerprint,
      reason: `body is missing expected vocabulary: ${missing.join(', ')}`,
      ...(path === undefined ? {} : { path }),
    }
  }

  return {
    ...base,
    compatibility: 'compatible',
    fingerprint,
    ...(path === undefined ? {} : { path }),
  }
}

/**
 * Render a detection status as one log line.
 *
 * Kept here so the one place that knows about paths is also the one place that
 * formats them, and so that callers cannot accidentally interpolate this into
 * learner-facing text.
 *
 * @param status - the detection result.
 * @returns a single line suitable for the harness log.
 */
export function describeUdtStatus(status: UdtSkillStatus): string {
  if (!status.available) return `unavailable (${status.reason ?? 'unknown reason'})`
  const where = status.provider === undefined ? '' : ` via ${status.provider}`
  const digest = status.fingerprint === undefined ? '' : ` [${status.fingerprint}]`
  return `${status.compatibility}${where}${digest}`
}
