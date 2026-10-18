/**
 * Visual pieces shared by both Learning surfaces.
 *
 * The runtime is deliberately number-free — state is a word, never a score —
 * so the visual language has to carry what numbers usually would: shape,
 * colour, proportion and connection. Nothing here decides anything; these
 * components only make the state the runtime already has easier to *see*.
 *
 * Everything is inline SVG. The client ships as a single classic script with
 * nowhere to serve assets from, so an icon is a path, not a file.
 */

import type { ReactNode } from 'react'

/** The skill's seven states, ordered from settled to needing attention. */
export const STATE_ORDER = [
  'confirmed',
  'checked',
  'practiced',
  'explained',
  'weak',
  'blocked',
  'unconfirmed',
] as const

/** One node as these components need it: a state word. */
export interface StatedNode {
  state: string
}

/** Count nodes per state, in display order, omitting states with no nodes. */
export function stateCounts(nodes: readonly StatedNode[]): { state: string; count: number }[] {
  return STATE_ORDER.map((state) => ({
    state,
    count: nodes.filter((node) => node.state === state).length,
  })).filter((entry) => entry.count > 0)
}

const GLYPH_PATHS: Record<string, ReactNode> = {
  // Deliberately not a filled tick: a node is never "done" here, only observed.
  unconfirmed: (
    <>
      <circle cx="12" cy="12" r="7.5" strokeDasharray="3 3.2" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  explained: (
    <>
      <path d="M4.5 5.5h5.2c.8 0 1.3.6 1.3 1.3V19c0-.8-.5-1.3-1.3-1.3H4.5z" />
      <path d="M19.5 5.5h-5.2c-.8 0-1.3.6-1.3 1.3V19c0-.8.5-1.3 1.3-1.3h5.2z" />
    </>
  ),
  practiced: (
    <>
      <path d="M5 19l3.6-.8L18 8.8a1.9 1.9 0 0 0 0-2.7l-.6-.5a1.9 1.9 0 0 0-2.7 0L5.4 15z" />
      <path d="M14 7.2l2.9 2.8" />
    </>
  ),
  checked: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.4 12.3l2.4 2.4 4.8-5" />
    </>
  ),
  weak: (
    <>
      <path d="M12 4.6l7.6 13.4H4.4z" />
      <path d="M12 10v3.6" />
      <circle cx="12" cy="15.9" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  blocked: (
    <>
      <rect x="5.8" y="10.6" width="12.4" height="8.6" rx="2" />
      <path d="M8.8 10.6V8.2a3.2 3.2 0 0 1 6.4 0v2.4" />
    </>
  ),
  confirmed: (
    <>
      <path d="M12 3.8l2.1 1.5 2.6-.1 1 2.4 2.1 1.5-.6 2.5.6 2.5-2.1 1.5-1 2.4-2.6-.1L12 19.4l-2.1-1.5-2.6.1-1-2.4-2.1-1.5.6-2.5-.6-2.5 2.1-1.5 1-2.4 2.6.1z" />
      <path d="M8.5 12.2l2.3 2.2 4.6-4.7" />
    </>
  ),
}

/**
 * One state as a mark, not a colour swatch.
 *
 * A chip says the word; this says what kind of thing the word is. Kept to a
 * 24-unit grid so every glyph reads at the same weight in a row.
 */
export function StateGlyph({ state }: { state: string }): ReactNode {
  return (
    <svg
      className="dt-glyph-svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPH_PATHS[state] ?? GLYPH_PATHS.unconfirmed}
    </svg>
  )
}

/**
 * The shape of the map, as one bar.
 *
 * Not a progress bar: the segments are the seven states themselves, sized by
 * how many nodes are in each. A learner can see at a glance that the map is
 * mostly unconfirmed and where the blockers are, without any of it becoming a
 * percentage of "done".
 */
export function StateBar({ nodes }: { nodes: readonly StatedNode[] }): ReactNode {
  const counts = stateCounts(nodes)
  const total = counts.reduce((sum, entry) => sum + entry.count, 0)
  if (total === 0) return null
  return (
    <div className="dt-statebar">
      <div
        className="dt-statebar-track"
        role="img"
        aria-label={`${total} nodes: ${counts.map((entry) => `${entry.count} ${entry.state}`).join(', ')}`}
      >
        {counts.map((entry) => (
          <span
            key={entry.state}
            className={`dt-statebar-seg dt-state-${entry.state}`}
            style={{ flexGrow: entry.count }}
            title={`${entry.count} ${entry.state}`}
          />
        ))}
      </div>
      <ul className="dt-statebar-legend">
        {counts.map((entry) => (
          <li key={entry.state} className={`dt-state-${entry.state}`}>
            <span className="dt-statebar-key" aria-hidden="true" />
            {entry.state}
            <b>{entry.count}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One node as the locator needs it. */
export interface LocatorItem {
  id: string
  title: string
  state: string
}

/**
 * Where one node sits in the map.
 *
 * The left column already draws the whole tree; this answers the narrower
 * question the middle column is about — "what is this node connected to" —
 * without making the learner scan back across the page. Parent, node and
 * children are selectable, because seeing a neighbour is usually followed by
 * wanting to read it.
 */
export function NodeLocator({
  parent,
  node,
  children,
  onSelect,
}: {
  parent: LocatorItem | null
  node: LocatorItem
  children: readonly LocatorItem[]
  onSelect: (id: string) => void
}): ReactNode {
  if (parent === null && children.length === 0) return null
  const item = (entry: LocatorItem, kind: 'parent' | 'child' | 'current'): ReactNode =>
    kind === 'current' ? (
      <span className={`dt-locator-item dt-locator-current dt-state-${entry.state}`}>
        <span className="dt-locator-glyph" aria-hidden="true">
          <StateGlyph state={entry.state} />
        </span>
        <span className="dt-locator-title">{entry.title}</span>
      </span>
    ) : (
      <button
        key={`${kind}:${entry.id}`}
        type="button"
        className={`dt-locator-item dt-locator-${kind} dt-state-${entry.state}`}
        onClick={() => onSelect(entry.id)}
      >
        <span className="dt-locator-glyph" aria-hidden="true">
          <StateGlyph state={entry.state} />
        </span>
        <span className="dt-locator-title">{entry.title}</span>
      </button>
    )

  return (
    <div className="dt-locator">
      <p className="dt-eyebrow">Where this sits</p>
      <div className="dt-locator-chain">
        {parent !== null && item(parent, 'parent')}
        {item(node, 'current')}
        {children.length > 0 && (
          <ul className="dt-locator-children">
            {children.map((entry) => (
              <li key={entry.id}>{item(entry, 'child')}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** The three things that fill this surface, as one glance. */
export function FeatureRow(): ReactNode {
  return (
    <ul className="dt-features">
      <li>
        <span className="dt-feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="2.4" />
            <circle cx="5.5" cy="18" r="2.4" />
            <circle cx="18.5" cy="18" r="2.4" />
            <path d="M12 7.4v3.1M10.1 11.3l-3.2 4.4M13.9 11.3l3.2 4.4" />
          </svg>
        </span>
        <b>Diagnosis map</b>
        <span>grown one node at a time</span>
      </li>
      <li>
        <span className="dt-feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4.5h6c.8 0 1.3.6 1.3 1.3V20c0-.8-.5-1.3-1.3-1.3H5z" />
            <path d="M19 4.5h-6c-.8 0-1.3.6-1.3 1.3V20c0-.8.5-1.3 1.3-1.3h6z" />
          </svg>
        </span>
        <b>A lesson</b>
        <span>written beside the chat</span>
      </li>
      <li>
        <span className="dt-feature-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4v16" strokeDasharray="2 2.4" />
            <circle cx="7" cy="8" r="2.2" />
            <path d="M12 8h8M12 15h5" opacity=".7" />
            <circle cx="7" cy="15" r="1.7" strokeDasharray="1.8 1.8" />
          </svg>
        </span>
        <b>Evidence</b>
        <span>behind every state</span>
      </li>
    </ul>
  )
}

/** The kinds of empty place this surface can be in. */
export type EmptyKind = 'map' | 'lesson' | 'evidence' | 'welcome' | 'library'

const ART: Record<EmptyKind, ReactNode> = {
  // A constellation with nothing lit yet: the shape of a map before diagnosis.
  map: (
    <>
      <circle cx="32" cy="26" r="4" />
      <circle cx="18" cy="46" r="3" />
      <circle cx="46" cy="46" r="3" />
      <circle cx="50" cy="24" r="2" />
      <path d="M32 26l-14 20M32 26l14 20M46 46l4-22" strokeDasharray="2.5 3" />
      <path d="M8 60h64" opacity=".4" />
    </>
  ),
  // An open book with a spark over the page that is still blank.
  lesson: (
    <>
      <path d="M14 24h20c2 0 3 1.4 3 3v30H17c-1.7 0-3 1.3-3 3z" />
      <path d="M58 24H38c-2 0-3 1.4-3 3v30h20c1.7 0 3 1.3 3 3z" />
      <path d="M50 12l1.6 4.4L56 18l-4.4 1.6L50 24l-1.6-4.4L44 18l4.4-1.6z" strokeDasharray="2 2" />
    </>
  ),
  // A rail with one observation on it: evidence is a record, not a chart.
  evidence: (
    <>
      <path d="M22 10v44" strokeDasharray="2.5 3" />
      <circle cx="22" cy="22" r="4" />
      <path d="M32 22h26M32 33h18" opacity=".55" />
      <circle cx="22" cy="42" r="3" strokeDasharray="2 2" />
      <path d="M32 42h20" opacity=".35" />
    </>
  ),
  // The first question, drawn as a target with an orbit: aim, then diagnose.
  welcome: (
    <>
      <circle cx="40" cy="36" r="20" strokeDasharray="2.5 4" opacity=".55" />
      <circle cx="40" cy="36" r="10" />
      <circle cx="40" cy="36" r="2.4" fill="currentColor" stroke="none" />
      <path d="M40 8v7M40 57v7M12 36h7M61 36h7" opacity=".55" />
      <circle cx="62" cy="14" r="2.4" />
      <circle cx="18" cy="58" r="1.8" opacity=".7" />
    </>
  ),
  library: (
    <>
      <rect x="14" y="20" width="14" height="34" rx="2" />
      <rect x="33" y="14" width="14" height="40" rx="2" />
      <rect x="52" y="26" width="12" height="28" rx="2" strokeDasharray="3 3" />
      <path d="M10 58h52" opacity=".5" />
    </>
  ),
}

/**
 * Line art for a place that has nothing in it yet.
 *
 * Decorative and `aria-hidden` on purpose: the sentence beside it is the
 * information; this only keeps an empty column from reading as a broken one.
 */
export function EmptyArt({ kind }: { kind: EmptyKind }): ReactNode {
  return (
    <svg
      className="dt-empty-art"
      viewBox="0 0 80 70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ART[kind]}
    </svg>
  )
}

/** The map page's sidebar icon: a folded map, not another node graph. */
export function MapPageIcon({ size, active = false }: { size: number; active?: boolean }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.6 : 1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.4 3.9l3.5-1.2 4.2 1.2 3.5-1.2v9.6l-3.5 1.2-4.2-1.2-3.5 1.2z" />
      <path d="M5.9 2.7v9.6M10.1 3.9v9.6" opacity=".7" />
      <circle cx="8" cy="7.4" r="1.15" />
    </svg>
  )
}
