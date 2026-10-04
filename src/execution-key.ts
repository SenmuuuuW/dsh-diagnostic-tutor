/**
 * Where execution state lives.
 *
 * The knowledge a learner accumulates — the course, the diagnosis map, the
 * evidence, the lessons — belongs to the learner and is shared by every
 * conversation they open. Where they have *got to* does not: a person can be
 * part-way through one node in one conversation and a different node in
 * another, and those two positions are not the same position.
 *
 * The store used to disagree. Focus was keyed by course, decisions and handoffs
 * by node, so a course held exactly one of each — and starting a node in one
 * conversation silently replaced another conversation's. A learner switched
 * back and found someone else's lesson under their own chat.
 *
 * So the three execution records are keyed by conversation *and* by the thing
 * they are about. This module is the only place that composition happens: a
 * key built by hand in two files is a key that will eventually be built two
 * different ways.
 *
 * Keys are storage-internal. They are never returned to the model or to a
 * surface — `udt_decide_next` takes a node id, not a key — so the separator and
 * the encoding are free to change as long as every reader changes with them.
 */

/**
 * Separator between the conversation and the logical id.
 *
 * A unit separator. Node ids are `course:subject-topic` and course ids are
 * subject names, so anything printable risks colliding with real data; this
 * cannot appear in either.
 */
const SEP = '\u001f'

/** The kinds of execution record that belong to a conversation. */
export type ExecutionKind = 'focus' | 'next' | 'handoff'

/**
 * Escape the separator inside a part, so the composition stays injective.
 *
 * Splitting on the separator is only unambiguous if no part contains one. In
 * practice none does — session ids are `session-<uuid>` and node ids are
 * `course:slug` — but "in practice none does" is an assumption about other
 * people's data, and the failure mode is silent: two conversations quietly
 * sharing one key. Doubling the separator makes the composition reversible
 * whatever the parts contain, for the cost of one string replace.
 *
 * @param part - a session id or a logical id.
 * @returns the part with any separator doubled.
 */
function escapePart(part: string): string {
  return part.split(SEP).join(SEP + SEP)
}

/**
 * Build the storage key for one conversation's execution record.
 *
 * Deterministic and injective: escaped parts mean `('a', 'b␟c')` and
 * `('a␟b', 'c')` cannot produce the same key, so two conversations can never
 * resolve to one record.
 *
 * @param kind - which table this key is for, so keys are readable in a dump.
 * @param sessionId - the conversation that owns the record.
 * @param logicalId - the course, node or target the record is about.
 * @returns the key to store under.
 */
export function executionKey(kind: ExecutionKind, sessionId: string, logicalId: string): string {
  return `${kind}${SEP}${escapePart(sessionId)}${SEP}${escapePart(logicalId)}`
}

/** The focus a conversation is working on, within one course. */
export function focusKey(sessionId: string, courseId: string): string {
  return executionKey('focus', sessionId, courseId)
}

/** The decision a conversation reached after one node. */
export function nextStepKey(sessionId: string, fromNodeId: string): string {
  return executionKey('next', sessionId, fromNodeId)
}

/** The handoff a conversation is waiting on, for one target node. */
export function handoffKey(sessionId: string, targetNodeId: string): string {
  return executionKey('handoff', sessionId, targetNodeId)
}

/**
 * Whether a stored key predates session scoping.
 *
 * Records written by an older build are keyed by the bare course or node id.
 * They are left exactly where they are: not migrated, not deleted, not
 * attributed to a conversation on a guess. They are simply never read, because
 * a record that cannot say whose it is cannot be shown to anyone without
 * risking showing it to the wrong person — which is the bug this all exists to
 * fix.
 *
 * @param key - a key found in one of the three tables.
 * @returns true when the key carries no conversation.
 */
export function isLegacyExecutionKey(key: string): boolean {
  return !key.includes(SEP)
}
