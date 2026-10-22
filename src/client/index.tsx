/**
 * dsh-diagnostic-tutor — browser half.
 *
 * Registers the whole navigation story, which is now two destinations:
 *
 *   - **Learning map**: an icon in the left sidebar (`sidebar.panellist`, a
 *     `list`) whose `id` addresses the matching main panel, plus that panel
 *     (`main`, a `keyed` slot, key `diagnostic-tutor-map`);
 *   - **Current lesson**: a sidebar action (`sidebar.footer.action`) that opens
 *     a session-scoped tab in the right sidebar, `LearningTab`, plus that tab's
 *     body and title.
 *
 * There is no full-page lesson panel: one page for browsing and one surface for
 * learning keeps the chat in the main column and avoids a second place that
 * renders the same lesson. The framework supplies the button chrome and the
 * panel switching; this module only says what the icons look like and what each
 * surface renders. No DSH component is re-implemented and no DSH internal is
 * reached into.
 *
 * Every registration goes through `ctx.slots.inject(...)`, which is mandatory
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

import { enableLanguagePersistence, getLang, hydrateLanguage } from './i18n.js'
import { tabTitleFor, useLearningText } from './learning-text.js'
import { LearningMapPanel, MAP_PANEL_ID } from './map-panel.js'
import { LearningTab, LearningTabTitle } from './tab.jsx'
import { useCurrentSessionId } from './use-session.js'
import { injectStyles } from './styles.js'
import { MapPageIcon } from './visuals.jsx'

/** Client module name; distinct from the host plugin's name. */
export const name = 'diagnostic-tutor-client'

/**
 * `slots` is the only service needed.
 *
 * Declared here rather than in the host half because it is a *client* service:
 * the browser half runs in its own Cordis context against the page's registry.
 */
export const inject = ['slots', 'layout', 'sidebarRightTabs', 'uiSession']

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
  const text = useLearningText()
  // Whether the reason is on screen, not the sentence itself: a language switch
  // must not leave an English notice behind.
  const [missingSession, setMissingSession] = useState(false)

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
        aria-label={wide ? undefined : text.learnAria}
        title={sessionId === undefined ? text.noSessionNotice : text.learnLabel}
        onClick={() => {
          if (sessionId === undefined) {
            // Not a disabled button with no explanation: the reason is the
            // whole message, and it is short enough to just say.
            setMissingSession(true)
            return
          }
          setMissingSession(false)
          onOpen()
        }}
      >
        {/* The panellist sizes its glyph 16 wide / 18 collapsed. */}
        <PanelIcon size={wide ? 16 : 18} />
        <span className="dt-learn-label">{text.learnLabel}</span>
      </button>
      {wide && missingSession && <p className="dt-learn-notice">{text.noSessionNotice}</p>}
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

/** Props the `main` slot supplies; identity comes from the session scope adapter. */
interface MainPanelProps {
  /** Standard root props; declared so a future reader does not reintroduce a list scan. */
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

  // Read the saved interface language once, from the real host only. The
  // preview's stub context has no layout service, which is precisely how this
  // stays out of the fixture harness (and out of its no-API-request check).
  if (layout) {
    enableLanguagePersistence()
    void hydrateLanguage()
  }

  /**
   * `MAP_PANEL_ID` as the layout names it.
   *
   * `MainPanelId` is a compile-time-only brand — the value is the same string
   * at runtime — so a plugin that owns the id constant can name it here instead
   * of depending on the brand package. Derived from the service rather than
   * imported, so this file still pulls in no `@deepseek-ai/*` value.
   */
  type PanelRef = Parameters<NonNullable<typeof layout>['selectPanel']>[0]
  const mapPanelRef = MAP_PANEL_ID as unknown as PanelRef

  // ---------------------------------------------------------------------------
  // The map page's sidebar entry.
  //
  // A panellist id addresses a main panel, so this one replaces the main column
  // with the diagnosis map — which is the point of a separate page. It is
  // deliberately NOT the Learn action: Learn opens the docked tab and leaves
  // the conversation alone, while this entry is the learner choosing to go and
  // look at the map.
  // ---------------------------------------------------------------------------
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: MAP_PANEL_ID, order: 41, label: 'Learning map' },
      function BoundMapIcon(props: { size: number; active: boolean }): ReactNode {
        return <MapPageIcon size={props.size} active={props.active} />
      },
    ),
  )

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

  // ---------------------------------------------------------------------------
  // The docked tab.
  //
  // This is the only lesson surface now. An earlier version also offered a
  // full-page panel in the main column; that was a second way to read the same
  // lesson and a third destination to choose from, so it was removed. The
  // conversation keeps the main column; the lesson sits beside it here, where
  // answering a check never means leaving the lesson.
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
    // Evaluated when the tab chrome renders; the title seat below is a live
    // component so an in-place language switch updates the visible chip too.
    title: () => tabTitleFor(getLang()),
    priority: 'extension',
  })

  /**
   * Dock the tab, retrying briefly.
   *
   * The right sidebar hosts **session-scoped** tabs, so it can only accept one
   * while a session surface is mounted. Returning to the conversation mounts
   * one, so the useful moment to dock is just after that. Retrying covers the
   * gap between the click and the surface mounting.
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

  /**
   * Switch to the conversation a project's learning belongs to.
   *
   * Resolved by the host from stored focus/run/selection records, then handed
   * to the shell's own session navigation (`uiWorkspace.openSession`). The
   * service is optional: a profile without it keeps the old behaviour of
   * opening the project in the current conversation.
   *
   * @returns whether navigation was actually requested; false means fall back.
   */
  const openLearningSession = (target: string): boolean => {
    const uiWorkspace = (() => {
      try {
        return ctx.reflect.get('uiWorkspace') as { openSession?: (sessionId: string) => void } | undefined
      } catch {
        return undefined
      }
    })()
    if (uiWorkspace?.openSession === undefined) return false
    try {
      uiWorkspace.openSession(target)
    } catch {
      return false
    }
    // The tab is session-scoped: dock it once the target conversation's surface
    // is mounted, so "enter learning" lands on the lesson too.
    setTimeout(() => openDockedTab(), 600)
    return true
  }

  // The map page: the plugin's only main panel.
  //
  // Route and knowledge live here; the lesson lives in the docked tab. "Open
  // current lesson" therefore leaves this page and returns to the conversation
  // with the lesson tab open, instead of replacing one main column with another.
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: MAP_PANEL_ID as unknown as NonNullable<PanelRef> },
      function BoundMapPanel(props: MainPanelProps): ReactNode {
        const sessionId = useCurrentSessionId(uiSession)
        return (
          <LearningMapPanel
            {...props}
            {...(sessionId === undefined ? {} : { sessionId })}
            onOpenChat={() => layout?.selectPanel(null)}
            onOpenLesson={() => {
              layout?.selectPanel(null)
              openDockedTab()
            }}
            onOpenSession={openLearningSession}
          />
        )
      },
    ),
  )

  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, function BoundTab(
      props: PropsRuntime<'sidebar.right.pane.tab'>,
    ): ReactNode {
      return (
        <LearningTab
          {...props}
          uiSession={uiSession}
          onOpenMapPage={() => layout?.selectPanel(mapPanelRef)}
          onOpenSession={openLearningSession}
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
export { LearningMapPanel, MAP_PANEL_ID } from './map-panel.js'
export { PathPage } from './path-page.js'
export { LearningTab, LearningTabTitle } from './tab.jsx'
export { LessonBody, BlockView, BLOCK_RENDERERS } from './blocks.js'
export type { PanelClient } from './app.js'
