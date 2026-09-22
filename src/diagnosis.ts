/**
 * Diagnosis-map rules.
 *
 * Everything here is a pure function over records: no IO, no `ctx`, no clock.
 * That is deliberate — this is the module that decides what the runtime is
 * *allowed* to store, so it must be trivially testable and impossible to
 * bypass from the tool layer.
 *
 * The rules exist to make two failures structurally impossible:
 *
 *   1. **Unverified mastery.** `confirmed` is unreachable without evidence the
 *      skill itself considers strong enough. A model cannot simply assert it.
 *   2. **A curriculum in disguise.** Nodes must attach to a node that already
 *      exists, batches are small, and a course is capped. There is no call that
 *      plants a finished syllabus.
 *
 * These are floors, not pedagogy. Clearing them makes a state *permissible*;
 * whether it is *right* remains the skill's judgement.
 */

import {
  INITIAL_NODE_STATE,
  isConfirmingEvidence,
} from './vocabulary.js'
import type { Evidence, NodeRecord } from './state.js'
import type { NodeState } from './vocabulary.js'

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Most nodes one `udt_map_update` call may add.
 *
 * A diagnosis reveals a small cluster near the blocker, not a term's worth of
 * material. The skill's own guidance for a broad goal is "the first one to
 * three nodes"; eight leaves room for a genuine cluster while making a
 * thirty-node dump impossible in one call.
 */
export const MAX_NODES_PER_UPDATE = 8

/** Most nodes one course may accumulate. A map is a diagnosis aid, not a textbook. */
export const MAX_NODES_PER_COURSE = 40

/* -------------------------------------------------------------------------- */
/* Violations                                                                 */
/* -------------------------------------------------------------------------- */

export type ViolationCode =
  | 'confirmed-without-evidence'
  | 'goal-node-confirmed'
  | 'goal-node-has-parent'
  | 'goal-node-not-root'
  | 'multiple-goal-nodes'
  | 'missing-parent'
  | 'parent-in-other-course'
  | 'self-parent'
  | 'parent-cycle'
  | 'batch-too-large'
  | 'course-too-large'
  | 'duplicate-node-id'

export interface Violation {
  readonly code: ViolationCode
  /** Learner-safe-ish explanation, aimed at the model that made the call. */
  readonly message: string
  readonly nodeId?: string
}

function violation(code: ViolationCode, message: string, nodeId?: string): Violation {
  return nodeId === undefined ? { code, message } : { code, message, nodeId }
}

/* -------------------------------------------------------------------------- */
/* Single-node rules                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Whether this node's state is permitted by its evidence.
 *
 * @param node - the record to check.
 * @returns a violation, or `undefined` when the state is permissible.
 */
export function checkNodeState(node: NodeRecord): Violation | undefined {
  if (node.state === 'confirmed') {
    // The goal is the frame the learner is working inside, not a claim about
    // what they can do; there is nothing to confirm about it.
    if (node.relation === 'goal') {
      return violation(
        'goal-node-confirmed',
        'A goal node is the frame of the map, not a mastery claim, so it cannot be "confirmed".',
        node.id,
      )
    }
    const confirming = node.evidence.filter((entry) => isConfirmingEvidence(entry.kind))
    if (confirming.length === 0) {
      return violation(
        'confirmed-without-evidence',
        'A node cannot be "confirmed" without at least one check or transfer evidence entry. ' +
          'Explanation or practice alone never confirms.',
        node.id,
      )
    }
  }
  return undefined
}

/* -------------------------------------------------------------------------- */
/* Map-level rules                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Validate one course's map as a whole.
 *
 * @param nodes - the nodes that would exist after the proposed change.
 * @returns every violation found, in node order.
 */
export function validateMap(nodes: readonly NodeRecord[]): Violation[] {
  const violations: Violation[] = []
  const byId = new Map<string, NodeRecord>()

  for (const node of nodes) {
    if (byId.has(node.id)) {
      violations.push(violation('duplicate-node-id', `Duplicate node id "${node.id}".`, node.id))
    }
    byId.set(node.id, node)

    const stateViolation = checkNodeState(node)
    if (stateViolation) violations.push(stateViolation)
  }

  const goals = nodes.filter((node) => node.relation === 'goal')
  for (const goal of goals) {
    if (goal.parentId !== undefined) {
      violations.push(
        violation('goal-node-has-parent', 'A goal node is the root of its course and has no parent.', goal.id),
      )
    }
  }

  // Scoped per course: several courses coexist in one domain.
  const goalCountByCourse = new Map<string, number>()
  for (const goal of goals) {
    goalCountByCourse.set(goal.courseId, (goalCountByCourse.get(goal.courseId) ?? 0) + 1)
  }
  for (const [courseId, count] of goalCountByCourse) {
    if (count > 1) {
      violations.push(
        violation('multiple-goal-nodes', `Course "${courseId}" has ${count} goal nodes; exactly one is allowed.`),
      )
    }
  }

  for (const node of nodes) {
    if (node.relation === 'goal') continue
    if (node.parentId === undefined) {
      violations.push(
        violation(
          'goal-node-not-root',
          'Every node other than a course goal must attach to an existing node via parentId.',
          node.id,
        ),
      )
      continue
    }
    if (node.parentId === node.id) {
      violations.push(violation('self-parent', 'A node cannot be its own parent.', node.id))
      continue
    }
    const parent = byId.get(node.parentId)
    if (!parent) {
      violations.push(
        violation('missing-parent', `Parent node "${node.parentId}" does not exist in this map.`, node.id),
      )
      continue
    }
    if (parent.courseId !== node.courseId) {
      violations.push(
        violation(
          'parent-in-other-course',
          `Parent "${parent.id}" belongs to another course.`,
          node.id,
        ),
      )
    }
  }

  // Cycle detection over the parent chain, bounded by the node count.
  for (const node of nodes) {
    const seen = new Set<string>([node.id])
    let cursor = node.parentId
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        violations.push(violation('parent-cycle', 'The parent chain forms a cycle.', node.id))
        break
      }
      seen.add(cursor)
      cursor = byId.get(cursor)?.parentId
    }
  }

  return violations
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build the record for a proposed new node and check it against the map.
 *
 * @param existing - the course's current nodes.
 * @param proposed - the node as supplied, already shaped by `newNode`.
 * @returns either the accepted record or the violations that rejected it.
 */
export function acceptNewNodes(
  existing: readonly NodeRecord[],
  proposed: readonly NodeRecord[],
): { ok: true; nodes: NodeRecord[] } | { ok: false; violations: Violation[] } {
  const violations: Violation[] = []

  if (proposed.length === 0) {
    violations.push(violation('batch-too-large', 'No nodes were supplied.'))
  }
  if (proposed.length > MAX_NODES_PER_UPDATE) {
    violations.push(
      violation(
        'batch-too-large',
        `A single update may add at most ${MAX_NODES_PER_UPDATE} nodes, received ${proposed.length}. ` +
          'A diagnosis reveals a small cluster, not a whole course.',
      ),
    )
  }
  if (existing.length + proposed.length > MAX_NODES_PER_COURSE) {
    violations.push(
      violation(
        'course-too-large',
        `A course may hold at most ${MAX_NODES_PER_COURSE} nodes (${existing.length} + ${proposed.length}).`,
      ),
    )
  }

  const existingIds = new Set(existing.map((node) => node.id))
  for (const node of proposed) {
    if (existingIds.has(node.id)) {
      violations.push(violation('duplicate-node-id', `Node "${node.id}" already exists.`, node.id))
    }
  }

  if (violations.length > 0) return { ok: false, violations }

  // Validate the resulting map as a whole, so parent lookups and cycles are
  // checked against what would actually exist after the write.
  const next = [...existing, ...proposed]
  const mapViolations = validateMap(next)
  if (mapViolations.length > 0) return { ok: false, violations: mapViolations }

  return { ok: true, nodes: next }
}

/**
 * Move a node to a new state without recording new evidence.
 *
 * Used when the *reading* of existing evidence changes — the skill re-grades
 * what it already saw. The resulting record is validated by the same rule as
 * everything else, so this is not a bypass: a bare assertion still cannot
 * promote a node to `confirmed`.
 *
 * @param node - the node being updated.
 * @param next - the proposed state.
 * @param now - ISO timestamp for `updatedAt`.
 * @returns either the updated record or the violation that rejected it.
 */
export function setNodeState(
  node: NodeRecord,
  next: NodeState,
  now: string,
): { ok: true; node: NodeRecord } | { ok: false; violations: Violation[] } {
  const candidate: NodeRecord = { ...node, state: next, updatedAt: now }
  const stateViolation = checkNodeState(candidate)
  if (stateViolation) return { ok: false, violations: [stateViolation] }
  return { ok: true, node: candidate }
}

/**
 * Append one evidence entry and optionally move the node's state.
 *
 * A state change that is not permitted by the resulting evidence is refused
 * outright, so the stored record can never be inconsistent.
 *
 * @param node - the node being updated.
 * @param evidence - the observation to record.
 * @param options.now - ISO timestamp for `updatedAt`.
 * @param options.state - optional new state.
 * @returns either the updated record or the violation that rejected it.
 */
export function recordEvidence(
  node: NodeRecord,
  evidence: Evidence,
  options: { now: string; state?: NodeState },
): { ok: true; node: NodeRecord } | { ok: false; violations: Violation[] } {
  const next: NodeRecord = {
    ...node,
    evidence: [...node.evidence, evidence],
    state: options.state ?? node.state,
    updatedAt: options.now,
  }

  const stateViolation = checkNodeState(next)
  if (stateViolation) return { ok: false, violations: [stateViolation] }

  return { ok: true, node: next }
}

/**
 * The state a node is allowed to be created in when the caller supplies none.
 *
 * @returns the born state.
 */
export function bornState(): NodeState {
  return INITIAL_NODE_STATE
}
