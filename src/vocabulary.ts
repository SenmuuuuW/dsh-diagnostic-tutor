/**
 * The closed vocabularies this runtime is allowed to speak.
 *
 * Every term below is **mirrored verbatim** from the Universal Diagnostic
 * Tutor skill. None is invented here, and that is a hard rule rather than a
 * preference: the skill's own mastery protocol says "The only concept-level
 * status terms are these seven … never invent a second vocabulary."
 *
 * If a term needs to change, it changes in the skill first and is mirrored
 * here second. Divergence would make the runtime and the teaching brain
 * disagree about the same learner, which is the one failure this project
 * cannot survive.
 *
 * Sources (skill `references/`):
 *   - seven node states  -> `mastery_and_decision.md`
 *   - six readiness gates -> `mastery_and_decision.md`
 *   - teaching modes      -> `teaching_modes.md`
 */

import { z } from 'zod'

/* -------------------------------------------------------------------------- */
/* Node state — the skill's seven concept-level status terms                  */
/* -------------------------------------------------------------------------- */

/**
 * The seven status terms, exactly as the skill defines them:
 *
 * | term        | meaning                                              |
 * | ----------- | ---------------------------------------------------- |
 * | unconfirmed | no evidence yet, even if related content was discussed |
 * | explained   | the tutor explained it; mastery not proven            |
 * | practiced   | the learner attempted at least one task               |
 * | checked     | a check or near-transfer question was asked           |
 * | weak        | partial understanding or unstable use                 |
 * | blocked     | cannot proceed; a prerequisite is missing or misread  |
 * | confirmed   | sound reasoning plus independent use or transfer      |
 */
export const NODE_STATES = [
  'unconfirmed',
  'explained',
  'practiced',
  'checked',
  'weak',
  'blocked',
  'confirmed',
] as const
export const NodeStateSchema = z.enum(NODE_STATES)
export type NodeState = z.infer<typeof NodeStateSchema>

/** The state a node is born in. Nothing is ever born confirmed. */
export const INITIAL_NODE_STATE: NodeState = 'unconfirmed'

/* -------------------------------------------------------------------------- */
/* Readiness — the skill's six outcomes of the readiness gate                 */
/* -------------------------------------------------------------------------- */

export const READINESS_OUTCOMES = [
  'advance',
  'advance-with-caution',
  'review-first',
  'step-down',
  'diagnose-again',
  'more-practice',
] as const
export const ReadinessSchema = z.enum(READINESS_OUTCOMES)
export type Readiness = z.infer<typeof ReadinessSchema>

/* -------------------------------------------------------------------------- */
/* Teaching mode — the skill's four modes                                     */
/* -------------------------------------------------------------------------- */

export const TEACHING_MODES = ['auto', 'zero-base', 'standard', 'advanced'] as const
export const TeachingModeSchema = z.enum(TEACHING_MODES)
export type TeachingMode = z.infer<typeof TeachingModeSchema>

/* -------------------------------------------------------------------------- */
/* Map relations — how a node attaches to the diagnosis map                   */
/* -------------------------------------------------------------------------- */

/**
 * How a node relates to its parent.
 *
 * These describe *diagnosis*, not a syllabus: `prerequisite` means "this was
 * found to block that", not "week 2 comes after week 1". There is deliberately
 * no `next-in-course` relation, because nothing in this runtime knows a
 * teaching order — the skill decides that per session.
 */
export const NODE_RELATIONS = [
  /** The single root node of a course: the goal itself, in the learner's words. */
  'goal',
  /** A component the goal decomposes into, revealed by diagnosis. */
  'part-of',
  /** Found to block its parent; must be resolved first. */
  'prerequisite',
  /** Associated knowledge that is neither a component nor a blocker. */
  'related',
] as const
export const NodeRelationSchema = z.enum(NODE_RELATIONS)
export type NodeRelation = z.infer<typeof NodeRelationSchema>

/* -------------------------------------------------------------------------- */
/* Evidence — what a state change is allowed to rest on                       */
/* -------------------------------------------------------------------------- */

/**
 * The kinds of evidence the runtime records.
 *
 * This list is intentionally about *observations*, not judgements: the runtime
 * stores what happened, and never whether it was good.
 */
export const EVIDENCE_KINDS = [
  /** The learner stated the goal themselves. */
  'goal-stated',
  /** A gap, prerequisite or blocker was identified. */
  'diagnosis',
  /** The learner explained something in their own words. */
  'explanation',
  /** The learner attempted a task. */
  'practice',
  /** A check or near-transfer question was asked and answered. */
  'check',
  /** Independent use or transfer was demonstrated. */
  'transfer',
] as const
export const EvidenceKindSchema = z.enum(EVIDENCE_KINDS)
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>

/**
 * Evidence kinds strong enough to support `confirmed`.
 *
 * The skill is explicit that the weaker signals never confirm: "a correct
 * answer is not proof of reasoning … explanation alone and one lucky answer
 * never confirm readiness." So `explanation`, `practice` and the purely
 * observational kinds cannot confirm a node, and the runtime refuses to let
 * them — see `diagnosis.ts`.
 *
 * This is a structural floor, not a pedagogical verdict: clearing it makes
 * `confirmed` *permissible*, and the skill still decides whether it is right.
 */
export const CONFIRMING_EVIDENCE_KINDS = ['check', 'transfer'] as const
export type ConfirmingEvidenceKind = (typeof CONFIRMING_EVIDENCE_KINDS)[number]

/** Whether an evidence kind may support `confirmed`. */
export function isConfirmingEvidence(kind: EvidenceKind): kind is ConfirmingEvidenceKind {
  return (CONFIRMING_EVIDENCE_KINDS as readonly string[]).includes(kind)
}

/* -------------------------------------------------------------------------- */
/* Things the runtime must never produce                                      */
/* -------------------------------------------------------------------------- */

/**
 * Field names that would turn learning state into a grade.
 *
 * The skill forbids it in prose ("Never turn mastery tracking into scores") and
 * the zod schemas already strip unknown keys, so no such field can be stored.
 * This list exists so the prohibition is asserted by tests rather than trusted
 * to review.
 */
export const FORBIDDEN_SCORE_FIELDS = [
  'score',
  'grade',
  'points',
  'percent',
  'percentage',
  'progress',
  'stars',
  'rating',
  'level',
  'xp',
] as const
