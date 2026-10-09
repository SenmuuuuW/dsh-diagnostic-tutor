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

import { useState } from 'react'

import { LearningPanel } from './app.js'
import { LearningTab, LearningTabTitle } from './tab.jsx'
import { useCurrentSessionId } from './use-session.js'
import { injectStyles } from './styles.js'

/** Client module name; distinct from the host plugin's name. */
export const name = 'diagnostic-tutor-client'

/**
 * `slots` is the only service needed.
 *
 * Declared here rather than in the host half because it is a *client* service:
 * the browser half runs in its own Cordis context against the page's registry.
 */
export const inject = ['slots', 'layout', 'sidebarRightTabs', 'uiSession']

/**
 * The key the full Learning Panel registers under in `main`.
 *
 * Nothing selects it by default. It is reached only by pressing *Open full
 * view* from the docked tab, because taking over the main column is a decision
 * the learner should make rather than one the sidebar makes for them.
 */
export const PANEL_ID = 'diagnostic-tutor'

/** What the sidebar says when there is no conversation to learn in. */
export const NO_SESSION_NOTICE = 'Open or create a conversation to start learning.'

/**
 * The sidebar's Learn entry.
 *
 * It opens the docked tab and never the main column. The conversation is where
 * the teaching happens, so a control that made it disappear was answering a
 * question — "show me my learning" — with an answer nobody asked for.
 *
 * With no conversation open there is nothing to dock beside, so it says so
 * rather than opening an empty surface: the tutor teaches in the chat, and a
 * panel with no chat next to it has nowhere to teach.
 */
export function LearnAction({
  wide,
  uiSession,
  onOpen,
}: {
  wide: boolean
  uiSession: unknown
  onOpen: () => void
}): ReactNode {
  const sessionId = useCurrentSessionId(uiSession)
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <div className="dt-learn-wrap" data-wide={wide}>
      <button
        type="button"
        className="dt-learn"
        // No `aria-current` and no active fill. The native row's active state
        // is defined as "this panel is selected in the main column", and this
        // control deliberately never selects one — borrowing the state would
        // claim something untrue. `:focus-visible` gives keyboard users the
        // same ring the native row shows.
        aria-label={wide ? undefined : 'Learn'}
        title={sessionId === undefined ? NO_SESSION_NOTICE : 'Learn'}
        onClick={() => {
          if (sessionId === undefined) {
            // Not a disabled button with no explanation: the reason is the
            // whole message, and it is short enough to just say.
            setNotice(NO_SESSION_NOTICE)
            return
          }
          setNotice(null)
          onOpen()
        }}
      >
        {/* The panellist sizes its glyph 16 wide / 18 collapsed. */}
        <PanelIcon size={wide ? 16 : 18} />
        <span className="dt-learn-label">Learn</span>
      </button>
      {wide && notice !== null && <p className="dt-learn-notice">{notice}</p>}
    </div>
  )
}

/**
 * The docked tab's identity.
 *
 * A tab type has two names: `id` is the implementation's own identity and is
 * what its body and title register under; `kind` is the discriminator `openTab`
 * names. They are the same string here because this plugin ships exactly one
 * implementation of exactly one kind.
 */
export const TAB_ID = 'diagnostic-tutor'

/** The mark: a small node graph, drawn inline so it needs no assets. */
function PanelIcon({ size, active = false }: { size: number; active?: boolean }): ReactNode {
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
 * The conversation it is looking at comes from the session scope adapter, not
 * from the slot props: `main` is root-scoped, and only session-scoped seats are
 * handed a `sessionId`. See `use-session.ts` for why that distinction matters.
 */
function MainPanel({
  uiSession,
  onOpenChat,
  onFocusStarted,
}: {
  uiSession?: unknown
  onOpenChat?: (() => void) | undefined
  onFocusStarted?: (() => void) | undefined
}): ReactNode {
  // The conversation the learner has open — not the first row of the session
  // list, which is a different conversation as soon as anything newer exists.
  const sessionId = useCurrentSessionId(uiSession)
  return (
    <LearningPanel
      {...(sessionId === undefined ? {} : { sessionId })}
      {...(onOpenChat === undefined ? {} : { onOpenChat })}
      {...(onFocusStarted === undefined ? {} : { onFocusStarted })}
    />
  )
}

/** Props the slot supplies; re-declared for the bound wrapper. */
interface MainPanelProps {
  /** Standard root props; present but unused now that identity comes from the
   * scope adapter. Declared so a future reader does not reintroduce a list scan. */
  useSessions?: unknown
}

/**
 * Load the browser half.
 *
 * @param ctx - the client Cordis context.
 */
export function apply(ctx: Context): void {
  // The sheet is injected once and removed with the plugin.
  ctx.effect(() => injectStyles())

  // Captured once: the panel needs *actions*, and the standard props a slot
  // receives only expose reads.
  const layout = ctx.get('layout')
  // Read, not injected as a prop: the session scope adapter is how a
  // root-scoped seat learns which conversation is open.
  const uiSession = ctx.get('uiSession')

  /**
   * `PANEL_ID` as the layout names it.
   *
   * `MainPanelId` is a compile-time-only brand — the value is the same string
   * at runtime — so a plugin that owns the id constant can name it here instead
   * of depending on the brand package. Derived from the service rather than
   * imported, so this file still pulls in no `@deepseek-ai/*` value.
   */
  type PanelRef = Parameters<NonNullable<typeof layout>['selectPanel']>[0]
  const panelRef = PANEL_ID as unknown as PanelRef

  // ---------------------------------------------------------------------------
  // The sidebar entry.
  //
  // This is a `sidebar.footer.action`, NOT a `sidebar.panellist` entry, and the
  // difference is the whole point. A panellist `id` is documented as the
  // "matching main panel key" and the shell's click handler is
  // `layout.selectPanel(id)` — so a panellist entry CANNOT do anything except
  // replace the main column. Putting Learn there is what made pressing it
  // replace the conversation, which reads as the chat having been lost.
  //
  // This action opens the docked tab instead and leaves the main column alone.
  // ---------------------------------------------------------------------------
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({ name: 'sidebar.footer.action', id: 'diagnostic-tutor-learn', order: 40 }, function BoundLearn(props: {
      wide: boolean
    }): ReactNode {
      return <LearnAction wide={props.wide} uiSession={uiSession} onOpen={openDockedTab} />
    }),
  )

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
            uiSession={uiSession}
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
    ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, function BoundTab(
      props: PropsRuntime<'sidebar.right.pane.tab'>,
    ): ReactNode {
      return (
        <LearningTab
          {...props}
          uiSession={uiSession}
          onOpenFullView={() => {
            // Show the full panel, which means giving up the main column. The
            // tab stays docked, so the way back is the panel's own header.
            layout?.selectPanel(panelRef)
          }}
        />
      )
    }),
  )
  ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, LearningTabTitle),
  )

  // The surface is NOT docked on load.
  //
  // An earlier version opened it whenever a focus existed, on the theory that
  // resuming should be visible. In practice it meant installing this plugin
  // silently added a column to the layout of anyone with learning state — the
  // first thing a returning user sees is their window rearranged by something
  // they did not ask for. The tab opens when the learner acts: pressing
  // *Start learning*, or continuing to a next step.
}

export { LearningPanel } from './app.js'
export { LearningTab, LearningTabTitle } from './tab.jsx'
export { LessonBody, BlockView, BLOCK_RENDERERS } from './blocks.js'
export type { PanelClient } from './app.js'
