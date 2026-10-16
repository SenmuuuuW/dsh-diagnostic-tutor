/**
 * Pure map model for the panel.
 *
 * Kept free of React and of `fetch` so the interesting logic — turning a flat
 * node list into a tree, ordering it, labelling states — is testable in a plain
 * node environment. The component below it is then mostly rendering.
 */

import type { NodeView } from '../contract.js'

/** One node plus its children, in render order. */
export interface MapTreeNode {
  node: NodeView
  children: MapTreeNode[]
  depth: number
}

/**
 * Build the map tree from a flat node list.
 *
 * Ordering is insertion order within each level, which is the order the nodes
 * were diagnosed in — the map reads as a history, not as a syllabus.
 *
 * Nodes whose parent is missing are promoted to roots rather than dropped: a
 * dangling reference is a data problem, and silently hiding the node would be
 * worse than showing it at the top level.
 *
 * @param nodes - the flat node views.
 * @returns the roots, each with its subtree.
 */
export function buildMapTree(nodes: readonly NodeView[]): MapTreeNode[] {
  const byId = new Map<string, NodeView>()
  for (const node of nodes) byId.set(node.id, node)

  const childrenOf = new Map<string | null, NodeView[]>()
  for (const node of nodes) {
    const parent = node.parentId !== null && byId.has(node.parentId) ? node.parentId : null
    const bucket = childrenOf.get(parent) ?? []
    bucket.push(node)
    childrenOf.set(parent, bucket)
  }

  const rendered = new Set<string>()

  const build = (parentId: string | null, depth: number, ancestors: ReadonlySet<string>): MapTreeNode[] =>
    (childrenOf.get(parentId) ?? [])
      // A cycle would otherwise recurse forever. The store forbids one, but the
      // panel must not hang if it ever meets one.
      .filter((node) => !ancestors.has(node.id))
      .map((node) => {
        rendered.add(node.id)
        const nextAncestors = new Set(ancestors).add(node.id)
        return { node, depth, children: build(node.id, depth + 1, nextAncestors) }
      })

  const roots = build(null, 0, new Set())

  // Anything unreachable from a root is rendered as a root of its own. Without
  // this, a node caught in a parent cycle is never visited and disappears from
  // the panel entirely — dropping a node silently is worse than showing it in
  // the wrong place.
  for (const node of nodes) {
    if (rendered.has(node.id)) continue
    rendered.add(node.id)
    roots.push({ node, depth: 0, children: build(node.id, 1, new Set([node.id])) })
  }

  return roots
}

/**
 * Flatten a tree back into render order, carrying depth.
 *
 * @param roots - the tree.
 * @returns every node in top-down, left-to-right order.
 */
export function flattenTree(roots: readonly MapTreeNode[]): MapTreeNode[] {
  const out: MapTreeNode[] = []
  const walk = (nodes: readonly MapTreeNode[]): void => {
    for (const entry of nodes) {
      out.push(entry)
      walk(entry.children)
    }
  }
  walk(roots)
  return out
}

/** Human label for a relation, in the map's own terms. */
export function relationLabel(relation: string): string {
  switch (relation) {
    case 'goal':
      return 'goal'
    case 'part-of':
      return 'part of'
    case 'prerequisite':
      return 'prerequisite'
    case 'related':
      return 'related'
    default:
      return relation
  }
}

/**
 * Only `confirmed` reads as a filled mark; every other state is an outline.
 *
 * There are deliberately no numeric or graded progressions here — the seven
 * words are the entire vocabulary.
 */
export function isFilledState(state: string): boolean {
  return state === 'confirmed'
}

/**
 * Short, non-learner-facing explanation of what a state means, for the detail pane.
 *
 * `unconfirmed` used to read "No evidence yet — nothing has been observed for
 * this node", which the panel then printed directly above a list headed
 * "Evidence 3". Both sentences were about the same node and only one of them
 * could be true. The state definition is the skill's — no evidence *that
 * establishes the concept* — while observations of other kinds (a diagnosis,
 * a stated goal) are recorded against a node all the time and simply do not
 * move it. So the explanation now describes the state rather than counting
 * what is on the page.
 */
export function stateExplanation(state: string): string {
  switch (state) {
    case 'unconfirmed':
      return 'Not established yet — nothing recorded here has moved it off this state.'
    case 'explained':
      return 'It has been explained, but that alone does not prove understanding.'
    case 'practiced':
      return 'Something was attempted at least once.'
    case 'checked':
      return 'A check or near-transfer question was asked.'
    case 'weak':
      return 'Partial or unstable — worth repairing before moving on.'
    case 'blocked':
      return 'Cannot proceed: something here is missing or misunderstood.'
    case 'confirmed':
      return 'Supported by a check or transfer observation. Re-checked, not assumed.'
    default:
      return 'Unknown state.'
  }
}

/**
 * When something was recorded, in words rather than in ISO 8601.
 *
 * The surfaces used to print `entry.at` verbatim, so the evidence list — the
 * part of the panel whose whole job is to make the record legible — was
 * punctuated by `2026-09-28T05:27:53.946Z`. Milliseconds and a `Z` are for
 * machines; a learner reading their own history wants "3 days ago", and wants
 * the exact moment only when it is close enough to matter.
 *
 * Pure and clock-injectable, so the tests are not a race against the calendar.
 *
 * @param at - the ISO timestamp from the record.
 * @param now - the reference instant; defaults to the current time.
 * @returns a relative phrase for anything recent, otherwise a plain date.
 */
export function formatWhen(at: string, now: number = Date.now()): string {
  const then = Date.parse(at)
  if (Number.isNaN(then)) return at
  const seconds = Math.round((now - then) / 1000)
  // A clock skew between the host and the browser shows up as a negative age;
  // "in 3 seconds" on a recorded observation is worse than saying nothing.
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`
  const date = new Date(then)
  const sameYear = new Date(now).getFullYear() === date.getFullYear()
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/**
 * A wait, in units a person reads.
 *
 * The handoff line counts seconds, which is right while a model turn is in
 * flight and wrong the moment a record outlives its turn: a restored session
 * printed "Lesson ready 119803s", which is thirty-three hours rendered as a
 * number nobody converts. Past a minute, the unit changes.
 *
 * @param ms - elapsed milliseconds.
 * @returns a short duration string, or an empty string when there is nothing
 *   meaningful to show yet.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 1) return ''
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    const rest = seconds % 60
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
  }
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`
}

/** The seven states, in the order the skill introduces them. */
export const STATE_ORDER = [
  'unconfirmed',
  'explained',
  'practiced',
  'checked',
  'weak',
  'blocked',
  'confirmed',
] as const
