# DSH Immersive Learning Workspace Requirements

Status: research input for v0.8+/v0.9. Based on the installed DSH
`0.2.2-rc.1` client packages and the existing Diagnostic Tutor docked-tab
integration. This document does **not** propose overriding host CSS or DOM.

## Summary

The current host already supports a useful immersive lesson surface:

- a full-viewport **right-sidebar fullscreen presentation** with the normal
  conversation track retained underneath;
- a persistent, session-scoped tab with a body/title registration point;
- a global main-panel seat for the Learning Map;
- root slots for a bottom strip and additive overlay entries;
- layout and navigation services owned by the host.

It does **not** expose a general immersive workspace mode, a host-managed
content back stack, focus trapping, or a typed client-side teaching event
stream. A production Dynamic Lesson Engine should not fake those by hiding
host columns with CSS or by capturing global keyboard/history behavior.

## What exists today

### Slots

| Slot | Kind/scope | What a plugin may do | Owner today |
| --- | --- | --- | --- |
| `main` | keyed/root | Register a global panel under a key; select it with `ctx.layout.selectPanel` | Conversation plus shipped panels |
| `sidebar.footer.action` | list/root | Add an action in the left sidebar footer | Diagnostic Tutor already does this |
| `sidebar.right.pane.tab` | keyed/session | Provide the body of a tab type | Diagnostic Tutor lesson tab |
| `sidebar.right.pane.tab.title` | keyed/session | Provide a live title for a tab type | Diagnostic Tutor |
| `rightbar` / `rightbar.session` | single/root and session | Host-owned right column; a tab body renders in it | Right Sidebar |
| `shell.bottom` | single/root | Full-width strip below all columns; plugin owns height/visibility; remains across main-panel navigation | Empty by default |
| `shell.overlay` | list/root | Additive frame-wide floating entries; layer is click-through, entries opt in to pointer events | Shipped badges/toasts |
| `shell.leading` | single/root | Window-chrome seat; occupied by the host sidebar controls | Host Sidebar |

`sidebar` is a single owner slot. Registering there replaces the entire
navigation column and the seats it declares; it is not an additive sidebar
extension point.

### Layout controller

From `@deepseek-ai/dsh-client-ui-layout` (`ctx.layout`):

```ts
interface ILayout {
  readonly panelInfo: HostObservable<{ activePanelId: MainPanelId | null }>
  selectPanel(panelId: MainPanelId | null): void
  beginNavigation(): AbortSignal
  toggleSidebar(): void
  openRightbar(track: boolean, fullscreen: boolean): void
  closeRightbar(): void
}
```

`openRightbar(track, fullscreen)` is a **presentation report**, not a general
window manager. The right-sidebar occupant uses it to request:

- a normal edge track (`track: true, fullscreen: false`);
- fullscreen overlay while retaining the wide-screen normal track
  (`track: true, fullscreen: true`);
- fullscreen with no track in narrow layouts (`track: false, fullscreen: true`).

The host hides the outer resize handle in fullscreen. On Windows Electron the
fullscreen panel stays below the caption and to the right of the expanded
sidebar; on macOS it covers the frame. This is already how the current Study
surface reaches `full` mode.

There is no `openMainFullscreen` or `enterImmersiveWorkspace` method.

### Right-sidebar tabs

The right sidebar is session-scoped. A tab type is registered in two stages:

```ts
ctx.sidebarRightTabs.register({
  id, kind, title, priority: 'extension', // optional patterns/canOpen/keepMounted
})
ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Body)
```

A body reads `useTabInfo()`:

```ts
{
  sidebar: { expanded: boolean; fullscreen: boolean },
  panel: { id: PaneId; isFloating: boolean },
  tab: {
    visible: boolean
    navigation: { address, params, revision }
    signal: AbortSignal
    actions: {
      bindCommands(commands): () => void
      openResource(address, options?): void
      openTab(kind, options?): void
      close(): void
    }
  }
}
```

`ctx.sidebarRight` (the navigation controller) exposes `openTab`,
`openResource`, `openResourceIn`, `openTabIn`, `active`, `isExpanded`,
`toggleExpanded`, `focus`, `toggleFullscreen(target)`, `split`, `float`,
`dock`, and related layout operations. A body does **not** get a direct
"make this tab fullscreen" action; the current plugin obtains the host layout
service and calls `ctx.layout.openRightbar(...)` itself.

Important limits from the host documentation:

- tab layout and presentation are saved per Session in
  `dsh.sidebar-right.v1.<sessionId>` in localStorage;
- reload restores layout before tab bodies render; tab bodies restore their own
  content/scroll/connection;
- panel widths are transient and reload to defaults;
- there is no content navigation stack; back/forward over visited tabs is not
  built;
- there is no right sidebar surface without a Session;
- fullscreen is a presentation of the right sidebar, not a new workspace route.

### Session and teaching events

The host runtime (`@deepseek-ai/dsh-agent`) publishes a process-local
`agent/assistant-stream` event with `start`, `chunk`, and `end` frames, and
session events carry durable turn/step boundaries. These are host-side agent
events, not a documented browser-plugin subscription or a semantic teaching
event projection.

The inspected client packages expose slots and session-scoped props; they do
not expose a typed `teaching event` service, scene cue subscription, or
"wait for learner" event. Raw assistant tokens are not sufficient for scene
synchronization anyway: they do not identify a scene, a checkpoint, or a
learner action.

### Existing Diagnostic Tutor use

- The Learning Map is a `main` panel.
- The lesson is a `sidebar.right.pane.tab`.
- Study calls `ctx.layout.openRightbar(mode === 'half', mode === 'full')`.
- The tab is session-scoped and docked on demand; it is not silently opened on
  load.
- Study progress is stored by the plugin, not by the host.

This is a correct use of the public API. It should be preserved.

## Capability check against the request

| Requirement | Current host evidence | Verdict |
| --- | --- | --- |
| Main slots | `main` keyed root slot; `ctx.layout.selectPanel`; `beginNavigation` | **Supported** for a global Learning Map panel |
| Rightbar | `sidebar.right.pane.tab` + `sidebar.right.pane.tab.title`; `ctx.sidebarRight.openTab` | **Supported** for a session-scoped lesson tab |
| Fullscreen | Rightbar owner reports `ctx.layout.openRightbar(track, fullscreen)`; host covers the frame and hides the outer handle | **Supported as rightbar fullscreen**, not a general workspace API |
| `shell.overlay` | Root `list` slot above all columns; click-through; entries opt into pointer events | **Supported only for additive badges/toasts**, not modals |
| Layout navigation | `ctx.layout.selectPanel` and `beginNavigation` for main panels | **Partial**: no content/back stack or plugin route |
| Sidebar visibility | `ctx.layout.toggleSidebar`; sidebar owner gets `collapsed/width/drawer` | **Partial**: no observable/restore contract outside the sidebar |
| Focus management | Rightbar/dockkit owns pane and tab focus; tab actions have bind/close/open | **Partial**: no plugin focus-trap/modal primitive |
| Browser Back | No host content navigation stack; `beginNavigation` only aborts a pending main-panel navigation | **Not supported** for scene/lesson navigation |
| Session restoration | Rightbar layout/presentation/tab IDs saved per Session in localStorage; bodies restore their own content | **Partial**: scene/time/parameter/checkpoint state must be plugin-local |

## What a plugin can implement safely now

1. **Fullscreen lesson tab** — already implemented via rightbar presentation.
   The lesson covers the frame while retaining conversation state underneath.
2. **Course map in `main`** — already implemented. Selecting `null` returns to
   the Conversation without changing the Session.
3. **A bottom transport strip** — `shell.bottom` is available for playback,
   scene timeline, or "continue lesson" controls. It must clean up on unmount,
   own its height, and not assume it is present in every composition.
4. **Overlay status/badges** — `shell.overlay` is additive and click-through.
   It is suitable for a small "scene playing" badge or toast, not a modal or a
   focus trap.
5. **Keyboard within the lesson surface** — the plugin may handle its own keys
   while its tab owns focus, but must not install a document-global handler that
   steals shortcuts from the host.
6. **Per-tab persistence** — the plugin can save its own scene/time/parameter
   state keyed by the Session ID, and restore it in the tab body. This is
   plugin-local; the host restores tab identity/layout, not the scene state.
7. **`keepMounted`** — a tab type may request `keepMounted: true` to retain body
   state across collapse/session switches. This reduces remount loss but is not
   a substitute for a persisted teaching session.

## Gaps that require host support

### G1. General immersive workspace mode

The only fullscreen presentation belongs to the right sidebar. A production
"lesson takes the whole workspace, with an optional course rail" mode needs a
host-owned state machine, not a plugin calling `openRightbar` and hiding
siblings.

Suggested API:

```ts
ctx.layout.enterImmersive({
  id: string,
  title: string,
  hideSidebar?: boolean,
  preserve?: 'conversation' | 'none',
  restoreFocus?: HTMLElement | string,
}): Promise<void>
ctx.layout.exitImmersive(): Promise<void>
ctx.layout.immersive: HostObservable<{ active: boolean; id?: string }>
```

Requirements: the host owns z-order, focus, ESC/back, restoration, and
platform chrome. Plugin must not set `display:none` on host columns.

### G2. Back/forward and deep links

`beginNavigation()` only guards an asynchronous main-panel navigation. There is
no browser-history route for a lesson/scene/checkpoint, and no public content
back stack. A learner pressing browser Back today leaves the SPA history rather
than returning to the previous scene/checkpoint.

Suggested API:

```ts
ctx.workspaceNavigation.push({ kind: 'lesson', sessionId, sceneId, checkpointId })
ctx.workspaceNavigation.back(): boolean
ctx.workspaceNavigation.onPop(listener): () => void
```

Or an explicit host route contract that plugins can register without owning
`window.history`. Must specify what Back means: exit immersive mode, return to
previous scene, or leave the Session.

### G3. Focus management and modality

The right sidebar owns pane focus, but a plugin has no supported focus-trap or
modal primitive. `shell.overlay` is deliberately click-through. A scene that
needs a checkpoint dialog/answer sheet needs a host focus contract:

```ts
ctx.focus.trap(container, { restore?: boolean }): () => void
ctx.focus.restore(target?): void
ctx.focus.activeWithin(container): boolean
```

Without this, a plugin must not trap Tab globally.

### G4. Typed teaching event stream

The host has `agent/assistant-stream` at runtime, but no documented browser
plugin projection of semantic events. Needed event shapes for a lesson engine:

```ts
type TeachingEvent =
  | { type: 'lesson/scene-ready'; sceneId; specDigest }
  | { type: 'lesson/cue'; sceneId; cueId; at; text }
  | { type: 'lesson/checkpoint'; sceneId; checkpointId; prompt; waitsForLearner: boolean }
  | { type: 'lesson/learner-action'; sceneId; checkpointId; action: 'continue'|'answer'; answerRef? }
  | { type: 'lesson/scene-ended'; sceneId; reason }
```

Requirements: session-scoped, typed, replayable/idempotent, separate from raw
token chunks, and never privileged over the durable Session log. A plugin
should be able to subscribe to a projection without reading model internals.

### G5. Session-surface restoration

The host restores tab layout and presentation, but the tab body restores only
what its provider persists. For a dynamic scene that means timeline position,
parameter values, checkpoint/answer state, and scroll. This can be plugin-local
today, but a host contract for "surface state" would avoid every plugin
inventing a storage key and reconciliation policy.

Suggested:

```ts
ctx.surfaces.registerState({
  id, sessionId,
  serialize(): JsonValue,
  restore(value: JsonValue): void,
})
```

with explicit size, versioning, failure, and stale-session semantics.

### G6. Sidebar visibility/observability from outside the sidebar

`toggleSidebar()` exists, but a plugin outside the sidebar has no stable
observable of the collapsed state to restore it correctly. The host passes
`collapsed/width/drawer` only to the sidebar owner. An immersive controller
needs a read/restore contract rather than blind toggles.

### G7. Native fullscreen / platform chrome

The web host controls fullscreen and window chrome. A plugin should not call
`document.documentElement.requestFullscreen()` as a substitute for a host
immersion mode; it breaks desktop chrome and focus rules. Expose the host
operation instead.

## Recommended sequence

1. **v0.8.0 (without host changes)**: keep the lesson inside the fullscreen
   right sidebar; add a bottom transport strip; keep scene state plugin-local
   and restore on remount; treat browser Back as "not supported" in the UI.
2. **v0.9.0 (host collaboration)**: request G1 (immersive state), G2
   (navigation/back), G3 (focus trap), and G4 (typed teaching events) as a
   minimal workspace contract. Do not build those by patching host DOM.
3. **Later**: surface-state registry (G5) and sidebar observability (G6), then
   OS/native fullscreen (G7).

## Acceptance criteria for a future host change

- The host owns z-order, focus restoration, ESC/Back, and platform chrome.
- Plugin unload restores the previous workspace and focus deterministically.
- Browser Back has a documented, testable meaning.
- No plugin sets host layout CSS, hides host columns, or captures global
  history.
- The conversation remains mounted and its draft/scroll state is preserved
  while immersive mode is active.
- A typed teaching event is session-scoped, replayed/idempotent, and distinct
  from raw assistant tokens.
