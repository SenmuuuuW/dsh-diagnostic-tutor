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

/** Short, non-learner-facing explanation of what a state means, for the detail pane. */
export function stateExplanation(state: string): string {
  switch (state) {
    case 'unconfirmed':
      return 'No evidence yet — nothing has been observed for this node.'
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
