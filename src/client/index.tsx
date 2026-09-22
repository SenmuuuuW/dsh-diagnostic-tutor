/**
 * dsh-diagnostic-tutor — browser half.
 *
 * Registers two things, which together are the whole navigation story:
 *
 *   - an icon in the left sidebar (`sidebar.panellist`, a `list`), whose `id`
 *     addresses the matching main panel;
 *   - the panel itself (`main`, a `keyed` slot) under that same id.
 *
 * The framework supplies the button chrome and the panel switching; this module
 * only says what the icon looks like and what the panel renders. No DSH
 * component is re-implemented and no DSH internal is reached into.
 *
 * Both registrations go through `ctx.slots.inject(...)`, which is mandatory
 * rather than stylistic: registering into a slot before its owner has declared
 * it throws.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only side-effect imports. `ctx.slots` is declared by ui-renderer, and
// each UI package contributes its own `SlotMap` rows through its `/client`
// subpath — so these are what make `ctx.slots` and the slot keys typecheck.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ReactNode } from 'react'

import { LearningPanel } from './app.js'
import { fetchOverview } from './api.js'
import { LearningTab, LearningTabTitle } from './tab.jsx'
import { injectStyles } from './styles.js'

/** Client module name; distinct from the host plugin's name. */
export const name = 'diagnostic-tutor-client'

/**
 * `slots` is the only service needed.
 *
 * Declared here rather than in the host half because it is a *client* service:
 * the browser half runs in its own Cordis context against the page's registry.
 */
export const inject = ['slots', 'layout', 'sidebarRightTabs']

/**
 * Identifier shared by the sidebar entry and the main panel.
 *
 * These two must match — the sidebar's list `id` is what the layout uses to
 * select the `main` key — so they are derived from one constant.
 */
export const PANEL_ID = 'diagnostic-tutor'

/**
 * The docked tab's identity.
 *
 * A tab type has two names: `id` is the implementation's own identity and is
 * what its body and title register under; `kind` is the discriminator `openTab`
 * names. They are the same string here because this plugin ships exactly one
 * implementation of exactly one kind.
 */
export const TAB_ID = 'diagnostic-tutor'

/** The sidebar icon: a small node graph, drawn inline so it needs no assets. */
function PanelIcon({ size, active }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.6 : 1.3}
      aria-hidden="true"
    >
      <circle cx="8" cy="3" r="2" />
      <circle cx="3.5" cy="12" r="2" />
      <circle cx="12.5" cy="12" r="2" />
      <path d="M8 5v2.2M8 7.2 4.6 10.3M8 7.2l3.4 3.1" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The panel body, with the session the tutor should be woken in threaded
 * through, plus a way back to the conversation.
 *
 * That last part matters more than it looks. The map, the node detail and the
 * learning surface occupy the **main** column, which is the same column the
 * conversation lives in — so while the panel is open the learner cannot type.
 * Checks are answered in the chat, so the surface needs a door back to it, and
 * `ctx.layout.selectPanel(null)` is the documented way to show the conversation
 * again.
 *
 * `useSessions` is part of the standard kit every root-scoped slot receives, so
 * the panel can name the session it is looking at without any plumbing of its
 * own. The host needs it to reach the right agent when the learner presses
 * Start learning.
 */
function MainPanel({
  useSessions,
  onOpenChat,
  onFocusStarted,
}: {
  useSessions?: ((select: (state: SessionListLike) => unknown) => unknown) | undefined
  onOpenChat?: (() => void) | undefined
  onFocusStarted?: (() => void) | undefined
}): ReactNode {
  const sessionId = useSessions?.((state) => state.ids[0])
  return (
    <LearningPanel
      {...(typeof sessionId === 'string' ? { sessionId } : {})}
      {...(onOpenChat === undefined ? {} : { onOpenChat })}
      {...(onFocusStarted === undefined ? {} : { onFocusStarted })}
    />
  )
}

/** The slice of the session-list snapshot this panel reads. */
interface SessionListLike {
  ids: string[]
}

/** Props the slot supplies; re-declared for the bound wrapper. */
interface MainPanelProps {
  useSessions?: ((select: (state: SessionListLike) => unknown) => unknown) | undefined
}

/**
 * Load the browser half.
 *
 * @param ctx - the client Cordis context.
 */
export function apply(ctx: Context): void {
  // The sheet is injected once and removed with the plugin.
  ctx.effect(() => injectStyles())

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 40,
        label: 'Learn',
      },
      PanelIcon,
    ),
  )

  // Captured once: the panel needs *actions*, and the standard props a slot
  // receives only expose reads.
  const layout = ctx.get('layout')

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
      },
      function BoundMainPanel(props: MainPanelProps): ReactNode {
        return (
          <MainPanel
            {...props}
            onOpenChat={() => {
              // Show the conversation, then dock: the session surface that the
              // right sidebar needs comes back with it.
              layout?.selectPanel(null)
              openDockedTab()
            }}
            onFocusStarted={() => openDockedTab()}
          />
        )
      },
    ),
  )

  // ---------------------------------------------------------------------------
  // The docked tab.
  //
  // This is what lets the chat and the learning surface coexist. The full panel
  // takes the main column — the same column the conversation lives in — so with
  // only that panel the learner must leave the lesson to answer a check. The
  // right sidebar is a separate column, so the same runtime sits beside the
  // chat.
  //
  // Registration is two stages, and the order is enforced by the framework:
  // declare the tab type, then register the body and title under the type's own
  // `id`, because that is the key the seats dispatch on.
  // ---------------------------------------------------------------------------
  ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: TAB_ID,
    // A page type, not a resource viewer: it has no address globs, so it is
    // opened by kind and never competes to render someone else's resource.
    title: () => 'Learning',
    priority: 'extension',
  })

  /**
   * Dock the tab, retrying briefly.
   *
   * The right sidebar hosts **session-scoped** tabs, so it can only accept one
   * while a session surface is mounted — and while the full panel occupies the
   * main column, no session surface exists. Returning to the conversation
   * mounts one, so the useful moment to dock is just after that. Retrying
   * covers the gap between the click and the surface mounting.
   */
  const openDockedTab = (attempt = 0): void => {
    // Resolved with `get`, not read as a property: this plugin injects the
    // *registry*, not the navigation controller, and reading a service that was
    // never injected throws rather than returning undefined.
    const sidebarRight = ctx.get('sidebarRight')
    if (!sidebarRight) return
    try {
      sidebarRight.openTab(TAB_ID)
    } catch {
      if (attempt < 8) setTimeout(() => openDockedTab(attempt + 1), 400)
    }
  }

  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, LearningTab),
  )
  ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, LearningTabTitle),
  )

  // Resume: if a focus is already active — a session being picked back up —
  // have the surface docked and waiting rather than hidden behind a click.
  void fetchOverview()
    .then((overview) => {
      if (overview.course !== null && overview.focus !== null) openDockedTab()
    })
    .catch(() => {
      // The API may not be mounted (a client-only page); nothing to open.
    })
}

export { LearningPanel } from './app.js'
export { LearningTab, LearningTabTitle } from './tab.jsx'
export { LessonBody, BlockView, BLOCK_RENDERERS } from './blocks.js'
export type { PanelClient } from './app.js'
