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
 *   - if discovery is inconclusive it returns a status with a reason instead
 *     of throwing, so a profile without the skill degrades gracefully.
 *
 * **Leakage rule.** `path` and `fingerprint` are internal diagnostics. They
 * must never reach learner-facing text: the skill's own protocol forbids
 * naming its files, versions or repository in a tutoring reply. Only the
 * tri-state availability reaches the overview; no detail reaches tool output.
 */

import { createHash } from 'node:crypto'

import { symbols, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SkillRegistry, SkillViewOptions } from '@deepseek-ai/dsh-skill'

/** The skill's canonical name, as declared in its frontmatter. */
export const UDT_SKILL_NAME = 'universal-diagnostic-tutor'

/** How much we were able to verify about the detected skill. */
export const UDT_COMPATIBILITIES = ['compatible', 'unknown', 'unavailable'] as const
export type UdtCompatibility = (typeof UDT_COMPATIBILITIES)[number]

export interface UdtSkillStatus {
  /** Whether the skill was found in the catalog. */
  readonly available: boolean
  /**
   * Whether a complete scoped discovery supports a definite negative result.
   * An unloadable body or empty snapshot is still inconclusive. A global Office
   * catalog proves nothing about an Agent's scoped filesystem provider.
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
 * @param options - the explicit Agent viewing scope and workspace to inspect.
 * @returns the detection status; discovery and loading failures degrade gracefully.
 */
export async function detectUdtSkill(
  skills: SkillRegistry | undefined,
  options: SkillViewOptions = {},
): Promise<UdtSkillStatus> {
  if (!skills) {
    return unavailable(UDT_SKILL_NAME, 'no skill catalog is mounted in this profile')
  }
  if (options.scope === undefined) {
    return unavailable(UDT_SKILL_NAME, 'no Agent viewing scope is available; nothing can be concluded')
  }
  // Older registries cannot report incomplete provider discovery. Do not turn
  // an unqualified list into a confident absence on those hosts.
  if (typeof skills.snapshot !== 'function') {
    return unavailable(UDT_SKILL_NAME, 'the skill catalog cannot report discovery completeness')
  }

  let snapshot
  try {
    snapshot = await skills.snapshot(options)
  } catch (error) {
    return unavailable(UDT_SKILL_NAME, `skill discovery failed: ${(error as Error).message}`)
  }
  if (!snapshot.complete) {
    return unavailable(UDT_SKILL_NAME, 'skill discovery is incomplete; nothing can be concluded')
  }

  const summaries = snapshot.skills
  const summary = summaries.find((entry) => entry.name === UDT_SKILL_NAME)
  if (!summary) {
    // An empty catalog can precede provider registration. Retry next request.
    return summaries.length === 0
      ? unavailable(UDT_SKILL_NAME, 'no skills are visible yet; nothing can be concluded')
      : unavailable(UDT_SKILL_NAME, `not among the ${summaries.length} skills visible in this scope`, true)
  }
  if (!summary.invocation.modelInvocable) {
    return unavailable(UDT_SKILL_NAME, 'the skill is not model-invocable in this scope', true)
  }

  const base = {
    available: true,
    catalogVisible: true,
    name: UDT_SKILL_NAME,
    source: summary.source,
    provider: summary.provider,
  } as const

  // The snapshot gives a location via `resourceBase`; only a directory-based
  // provider has a path at all, and a remote provider legitimately has none.
  const listedPath =
    summary.resourceBase?.kind === 'directory' ? summary.resourceBase.path : undefined

  let definition
  try {
    definition = await skills.get(UDT_SKILL_NAME, options)
  } catch (error) {
    return {
      ...base,
      available: false,
      catalogVisible: false,
      compatibility: 'unknown',
      reason: `listed but its body could not be loaded: ${(error as Error).message}`,
      ...(listedPath === undefined ? {} : { path: listedPath }),
    }
  }

  if (!definition) {
    return {
      ...base,
      available: false,
      catalogVisible: false,
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

// Cordis creates a fresh traceable proxy on service reads. Compare its
// underlying instance, while continuing to call through the scoped proxy.
function serviceIdentity(service: object | undefined): object | undefined {
  return service === undefined ? undefined : Reflect.get(service, symbols.original) ?? service
}

/**
 * Observe the exact live Agent addressed by an overview request. Optional
 * services are resolved anew so registration, removal and rebinding are seen
 * without reloading this plugin. Agent handles are the official scope keys.
 */
export async function teachingBrainForSession(
  ctx: Context,
  sessionId: string | undefined,
): Promise<boolean | null> {
  if (!sessionId) return null
  try {
    const agents = ctx.reflect.get('agents')
    const skills = ctx.reflect.get('skills')
    const key = sessionId as Agent['id']
    if (!agents || !skills) return null
    const agent = agents.get(key)
    if (!agent) return null
    const cwd = agent.session.header.cwd
    const status = await detectUdtSkill(skills, { scope: agent, ...(cwd === undefined ? {} : { cwd }) })
    // A provider may yield while a preset replaces the Agent or a service is
    // rebound. Such a response no longer describes the requested live scope.
    if (
      serviceIdentity(ctx.reflect.get('agents')) !== serviceIdentity(agents) ||
      agents.get(key) !== agent ||
      serviceIdentity(ctx.reflect.get('skills')) !== serviceIdentity(skills) ||
      agent.session.header.cwd !== cwd
    ) return null
    return status.available ? true : status.catalogVisible ? false : null
  } catch {
    return null
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
