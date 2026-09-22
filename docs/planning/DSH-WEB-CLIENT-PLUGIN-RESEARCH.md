# DSH Web-GUI Client Plugins — Source-Grounded Research Report

Scope: DSH v0.1.5-rc.1 source checkout at `/Users/sunjungong/Documents/DSH/deepseek-harness-alpha`, plus three working third-party plugin repos (`dsh-better-sidebar-011`, `dsh-minecraft`, `dsh-whale-report`).

Everything below is read from real source. Where I could not find something, I say so explicitly.

---

## 0. TL;DR — there are TWO ways to put UI in the DSH web GUI

There is **no single "client plugin" API**. There are two distinct, unequal channels:

| | **A. Static client plugin** (npm package, `dsh.client`) | **B. Dynamic Cordis package** (`cordis_define` + `cordis_run`) |
|---|---|---|
| Ships | a built `lib/client.js` fetched by the module loader | plain-JS source text authored at runtime by the model/user |
| Build | tsdown, mono-repo preset `clientBundle()` | none — source is string-evaluated in the page |
| Can `import` React? | **yes**, from the shared module table | **no** — `React` is injected as a closure symbol; `import`/`require` throw |
| UI entry | `ctx.slots.register(...)` (full typed API, `ctx.provide`, services) | `slots.inject(...)` / `slots.register(...)` through a whitelisting guard, `key:'self'` for the run card |
| Host bridge | Typert `@Remote` + generated client, or your own `webServer` routes | `harness.handle(method, fn)` ↔ `host.call(method, args)` (client→host JSON only) |
| Lifecycle | Cordis `ctx.effect`, HMR reload | session-scoped, process-local, approval-gated, gone on restart |
| Third-party friendly? | yes, but the *whole* toolchain is monorepo-shaped | **yes, explicitly designed for it** |

The three real plugins studied all use channel **A** but **not** `ctx.slots` for their main panel — they mount their own React root into `document.body` and talk to the host over **custom `ctx.webServer` HTTP routes + polling**. `dsh-better-sidebar` additionally registers one real slot (`settings.section`) and injects into `conversation.chat.turnTail`.

---

## 1. Client-plugin concept: host half vs client half

### 1.1 Declaration in `package.json`

A package joins the web client graph by declaring `dsh.client` and exporting a `./client` subpath. Authoritative type: `DshClientManifest` in [`packages/util/package-manifest/src/types.ts:44`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/util/package-manifest/src/types.ts):

```ts
/** Client module declaration read by client-modules and the client build. */
export interface DshClientManifest {
  /** Client platform identifier; the Web consumer selects `web`. */
  platform: string
  /** Informational package-name dependencies, not Cordis service injection. */
  inject?: string[]
  /** Boot phase-one registration barrier; absent means the shared application batch. */
  immediately?: boolean
  /**
   * Exact module-table requests beyond the implicit client baseline, including
   * subpaths such as `<pkg>/client`; absent means baseline externals only.
   * Type-only imports are erased and create no module request.
   */
  external?: string[]
}
```

`dsh` also carries `bundle.patch` — the profile-install mount file:

```ts
export interface DshManifest {
  bundle?: DshBundleManifest          // { patch: string }
  profile?: DshProfileManifest
  client?: DshClientManifest
  ...
}
export interface DshBundleManifest { patch: string }
```
(`packages/util/package-manifest/src/types.ts:8-33`)

Real example, `dsh-better-sidebar-011/package.json`:

```json
"main": "lib/index.js",
"exports": {
  ".":          { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
  "./invariant":{ "types": "./lib/types/invariant.d.ts", "default": "./lib/invariant.js" },
  "./client":   { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
  ...
},
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "inject": [
      "@deepseek-ai/dsh-client-runtime",
      "@deepseek-ai/dsh-client-locale",
      "@deepseek-ai/dsh-client-ui-slots",
      "@deepseek-ai/dsh-client-ui-conversation"
    ],
    "platform": "web"
  }
}
```

`dsh-minecraft` and `dsh-whale-report` use the minimal form (`"inject": [], "platform": "web"`) **plus a legacy top-level `dshClient` block**:

```json
"dsh":       { "bundle": { "patch": "./cordis.patch.yml" },
               "client": { "inject": [], "platform": "web" } },
"dshClient": { "inject": [], "platform": "web", "immediately": true }
```

**`dshClient` is not read anywhere in v0.1.5-rc.1.** Grep of the whole checkout for `dshClient` finds only doc comments (`packages/client/ui-jobs/src/index.ts:5`, `packages/extensions/cordis-client-runner/src/index.ts:5`, `packages/extensions/ui-cordis/src/index.ts:5`); the only parser is `parseDshClient`, which reads `pkg.dsh.client` ([`packages/client/modules/src/index.ts:186-206`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/client/modules/src/index.ts)). It is dead metadata in those two repos.

**The split is therefore:**
- **Host (node) half** = `main` / `exports["."]` → `lib/index.js`, a Cordis plugin (`export const name/inject/apply/Config`), run in the DSH host process, listed as a Loader row via `cordis.patch.yml`.
- **Client (browser) half** = `exports["./client"]` → `lib/client.js`, a single CJS file whose entire body is wrapped in `window.__ModuleLoader__.load({ id, factory })`.

There is **no** `dsh.client.entry` field, no subpath other than `./client` (resolver: `clientExportOf`, [`packages/client/modules/src/index.ts:209-220`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/client/modules/src/index.ts)).

### 1.2 The scan (host side)

`ClientModuleRegistry` (`ctx.clientModules`) scans live Loader entries:

- A package is a client row iff `package.json.dsh.client.platform === 'web'` **and** `exports["./client"]` resolves; otherwise it is cached as "not a client package" (`resolveMeta`, `packages/client/modules/src/index.ts:735-780`). Declaring `dsh.client` without a `./client` export **throws**:
  `client-modules: ${packageName} declares dsh.client but exports no "./client" bundle` (line 767).
- A missing built bundle throws `MissingClientBundleError` at activation: *"client bundle not found; run `pnpm run build` before launch"* (lines 83-99).
- Scanning is incremental per `internal/plugin` emission; there is no full rescan (`docs/subsystems/client-modules.md:79`).

### 1.3 The wire: `window.__DSH_BOOT__`

[`packages/client/modules/src/client/manifest.ts:50`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/client/modules/src/client/manifest.ts):

```ts
export interface WebBootEntry {
  id: string                 // entry name == package name
  url: string                // revisioned single-resource combo endpoint (HMR)
  rev: string
  inject?: string[]          // package-name dependency edges (factory arrival)
  immediately?: boolean      // stage-one prefetch
  external?: string[]        // non-baseline module specifiers this row requests
}
export interface WebBootBatch { phase: 'bootstrap' | 'application'; url: string; rev: string; entries: string[] }
export interface WebBootGraph { rev: string; entries: WebBootEntry[]; batches: WebBootBatch[] }
```

The host injects this as `globalThis["__DSH_BOOT__"]`; the browser parser (`parseBootManifest`, same file line 167) rejects malformed rows, duplicate ids, unknown members and entries belonging to no batch — *"a page without a valid manifest cannot boot"* (`docs/subsystems/client-modules.md:11`).

**`dsh.client.inject` is only a factory-arrival hint, not Cordis service injection.** In the browser half, an unresolved inject name is silently skipped (not an error):

```ts
for (const packageName of row.inject) {
  const dependency = this.graphRows.get(packageName)
  if (dependency !== undefined) await this.arriveGraphRow(dependency, [], visited)
}
```
(`packages/client/modules/src/client/system.ts:165-168`)

This matters for stability: `dsh-better-sidebar@0.11.0`'s inject list names `@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-web-react`, `@deepseek-ai/dsh-client-schema-form` — **none of which exist in 0.1.5-rc.1** (verified: no `packages/**/package.json` declares those names). It still boots because unknown inject names are ignored.

### 1.4 The client half's shape

The browser half is an ordinary Cordis plugin, but it imports only React + platform modules and talks to `ctx`:

```ts
// dsh-minecraft/src/client/index.tsx:501
export function apply(ctx: ClientContext): void { ... }
```
where

```ts
// dsh-minecraft/src/client/index.tsx:495-498
interface ClientContext {
  effect(execute: () => () => void): unknown;
  inject(names: string[], callback: (ctx: Record<string, unknown>) => void): unknown;
}
```

`dsh-better-sidebar` types it for real and declares its hard service dependencies:

```ts
// dsh-better-sidebar-011/src/client/index.tsx:31
export const inject = ['slots', 'sessions', 'connection', 'workspaces', 'locale']
```

---

## 2. Build & serve

### 2.1 Bundler and output

Official preset: `clientBundle()` in [`packages/client/tsdown.client.ts:107`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/client/tsdown.client.ts). It emits two faces per package:

- **node half** — `lib/index.js`, ESM, `platform: 'node'`, `target: 'es2024'` (`clientLibraryConfig`, line 227).
- **browser half** — `lib/client.js`, **CJS**, `platform: 'browser'` (`clientConfig`, line 428), with:

```ts
    format: 'cjs',
    platform: 'browser',
    sourcemap: true,
    deps: { neverBundle: isRequested, alwaysBundle: (s) => !isRequested(s) },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {}; var exports = module.exports;',
    },
```
(`packages/client/tsdown.client.ts:437-570`)

Key facts:
- **Single file mandatory** — the module table only serves `/plugins/<id>/client.js`; `entryFileNames` is pinned to `client.js`.
- **Externals = requested table rows, everything else inlined.** `neverBundle: isRequested` / `alwaysBundle: !isRequested`.
- **Bundle purity gate** (`dsh-client-bundle-purity`, line 489) is a build-time error for any `@deepseek-ai/*` value import that is not (a) a module-table row, (b) a vendored library (`cosmokit|schemastery`, line 69), (c) in `INLINE_SAFE` (line 61), or (d) a generated `/remote` contribution (line 72). Error text: *"cross-plugin value imports are forbidden; declare a non-default module request or collaborate through cordis services (type-only imports are erased and never reach this gate)"*.
- **CSS handling**: `x.module.css` → hashed class map + injected `<style data-plugin>` at factory execution; `x.css?inline` → exported text; plain `.css` → global injected style. All via lightningcss inside the bundle (`styleInjectionModule`, lines 30-45). There is **no separate CSS artifact** for module-table plugins.

The baseline module table — the exact set of specifiers a client bundle may `require()` — is [`packages/client/web/src/platform.ts:8`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/client/web/src/platform.ts):

```ts
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
] as const
export const PRELOADED_CLIENT_EXTERNALS = [] as const      // currently empty
```

Note: `'cordis'` is **not** in that list; the specifier is `@deepseek-ai/cordis`. Both third-party repos externalize `"cordis"` (a no-op — they never import it) — see `dsh-minecraft/tsdown.config.ts`.

### 2.2 Do third-party repos use the official preset?

**No.** `dsh-minecraft/tsdown.config.ts` and `dsh-whale-report/tsdown.config.ts` are hand-rolled copies of the pattern (identical file content modulo the id):

```ts
import { defineConfig } from "tsdown";
const CLIENT_EXTERNALS = ["react","react/jsx-runtime","react-dom","react-dom/client","cordis"];
export default defineConfig({
  entry: { client: "src/client/index.tsx" },
  outDir: "lib", format: "cjs", platform: "browser", dts: false,
  sourcemap: true, clean: false, external: CLIENT_EXTERNALS,
  outputOptions: {
    entryFileNames: "client.js",
    banner: "window.__ModuleLoader__.load({ id: 'dsh-minecraft', factory: (require) => {",
    footer: "return module.exports; } });",
    intro: "var module = { exports: {} }; var exports = module.exports;",
  },
});
```
This is why their CSS is JS-injected (`injectStyle()` writing `<style data-mc-style>`), not piped through lightningcss.

`dsh-better-sidebar-011` has **no** `tsdown.config.ts`, `tsconfig.*`, or `AGENTS.md` in the snapshot (only `lib/`, `src/`, `package.json`, `cordis.patch.yml`, `scripts/install.*`, READMEs) — its build config was not published, though `package.json` still declares `"build": "rm -rf lib && tsc -p tsconfig.build.json && tsdown"`. Its `lib/client.js` confirms the same handoff:

```js
window.__ModuleLoader__.load({
	id: "dsh-better-sidebar",
	factory: (require) => {
		...
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives...
```

### 2.3 Exact build commands (monorepo)

From the root `package.json`:

```json
"build":              "tsx scripts/build.ts",
"build:lib":          "pnpm run build:lib:host && pnpm run build:lib:client",
"build:lib:host":     "node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc -b tsconfig.host.json && tsdown --env.DSH_BUILD_FACE host",
"build:lib:client":   "tsc -b tsconfig.client.json && tsdown --env.DSH_BUILD_FACE client",
"build:web":          "pnpm --filter @deepseek-ai/dsh-web-frontend run build",
"dev:web":            "tsx scripts/dev-web.ts --poll",
"gen-client-catalog": "tsx scripts/gen-client-catalog.ts",
"verify-client-packages": "tsx scripts/verify-client-packages.ts"
```

`apps/web` itself: `"build": "vite build"`, `"watch": "vite build --watch --no-emptyOutDir"` (`apps/web/package.json`). `apps/web` is **not standalone** — `vite.config.ts` throws on `serve`: *"apps/web is not a standalone application: bare Vite cannot inject window.__DSH_BOOT__… run `pnpm dsh web` together with `pnpm run dev:web`"* (`apps/web/vite.config.ts:11-13, 34-39`).

### 2.4 Dev loop

```sh
pnpm run build     # once — every dev stage is incremental over the previous one's output
pnpm dsh web       # terminal 1: host from source (tsx), serves apps/web/dist
pnpm run dev:web   # terminal 2: watch tsc -b tsconfig.client.json + tsdown watch + vite build --watch
```
(`docs/api-gateway.md:141-146`; `apps/web/vite.config.ts:10-13`)

`scripts/dev-web.ts` runs three stages:
1. `tsc -b tsconfig.client.json --watch --preserveWatchOutput` (line 240)
2. tsdown watch over `discoverPluginDirs()` — *every* `packages/*/*/package.json` with `dsh.client.platform === 'web'` (line 78) — plus `discoverLibraryDirs()` (line 101)
3. `pnpm --filter @deepseek-ai/dsh-web-frontend run watch` (vite build --watch)

`--poll` switches to polling watchers because *"Network mounts (weka) deliver no inotify events"* (`scripts/dev-web.ts:11-17`).

### 2.5 Serving and reload

- **Serve**: plugin bundles are served by the host from the `/plugins` combo route: `GET/HEAD /plugins/??<pkg-a>/client.js,<pkg-b>/client.js&rev=<rev>` with long-lived immutable caching; unknown/stale revs → 404, other methods → 405 (`docs/subsystems/client-modules.md:85`). The SPA shell itself is served by `packages/host/frontend-static` via `ctx.webServer.renderIndex(await readFile(distIndex,'utf8'))` (`packages/host/frontend-static/src/index.ts:121`), with index injections contributed through the `webserver/index-inject` event (`packages/host/webserver/src/index.ts:34, 347-360`; row types in `packages/host/webserver/src/injections.ts:15-31`).
- **Reload trigger**: `dsh-client-hmr`, **always mounted** in the web bundle patch but idle until something rewrites a bundle (`packages/bundle/web-app/cordis.patch.yml:163-168`). Node half stat-polls each row's `lib/client.js` from the baseline captured at startup and calls `ctx.clientModules.rebuilt(id)`; only a real rev change broadcasts. It serves the SSE channel `GET /plugins/events` (`packages/client/hmr/src/index.ts:158-200`). Browser half `new EventSource(EVENTS_ENDPOINT)` (`packages/client/hmr/src/client/index.ts:166`), then `invalidate(id, rev)` + `prefetch(id)`, then a fiber swap. React state inside the reloaded plugin is lost; session/workspace/connection state survives (`packages/client/hmr/README.md`, "What a reload does").
- HMR only reacts to a `pnpm run dev:web`-style watcher. Rewriting `lib/client.js` any other way also works.

---

## 3. The client extension API

### 3.1 The registry: `ctx.slots`

Pure core: [`packages/client/ui-slots/src/index.ts`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/client/ui-slots/src/index.ts). Cordis service wrapper: [`packages/client/ui-renderer/src/client/registry.ts:95`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/client/ui-renderer/src/client/registry.ts) (`class SlotRegistry extends Service`, `super(ctx, 'slots')` at line 134).

Declaration-merge contract ([`packages/client/ui-slots/src/index.ts:26`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/client/ui-slots/src/index.ts)):

```ts
/** Slot contract table. Owners extend via declaration merging; entries are {@link SlotEntryDef}. */
export interface SlotMap {}

export type SlotKind  = 'single' | 'list' | 'keyed' | 'chain'
export type SlotScope = 'root' | 'session-maybe' | 'session'

export interface SlotEntryDef {
  kind: SlotKind
  scope: SlotScope
  owner?: object
  keyProps?: Record<string, object>
  hookContext?: unknown
  inject?: object
}
```

Registration — two overloads (no-`inject` at line 780, `inject`-bearing at line 807); implementation at line 826. Options (`BaseOptions`, line 565):

```ts
type BaseOptions<K, EntryKey, D, H, M, N> = {
  name: K                             // target slot key (contribute INTO this)
  children?: D                        // declare + authorize child slots (one declarer each)
  store?: H                           // defineStore(...) seat
  locale?: N                          // locale namespace -> typed `t` prop
  registrant?: string                 // diagnostics label
} & KindOptions<K, EntryKey, M>
// KindOptions: keyed -> `key`; list -> `id`/`order`/`label`; chain -> `select(owner)`; all -> `priority`
```

Four composed prop shares (`docs/subsystems/slots.md:62-73`):

| Input | Declared by | Component type |
|---|---|---|
| owner + standard scope values | `SlotMap` row + scope adapters | `PropsRuntime<K>` |
| authorized child renderers | registration `children` | `PropsRenderSlots<S>` |
| selector hook + actions for shared view state | registration `store` | `PropsStore<H>` |
| private data/callbacks/observables | registration `inject` factory | `InjectFace<I>` |
| typed `t` | registration `locale` | `PropsLocale<N>` |
| chain election result | `select` return | `matched` |

**Lifecycle rule that trips people up** (and is enforced loudly): registering into an undeclared slot **throws** — *"slot "X" is not declared (a parent entry's children table must declare it)"* (line 830). So always wrap in `slots.inject`:

```ts
inject(key: keyof SlotMap & string, callback: () => SlotInjectionEffect): () => void
```
(`registry.ts:172`; `SlotInjectionEffect = (() => void) | Iterable<() => void>` at line 92). It runs now if the declaration is live, or inside the declaring `register()` once it commits; a collapse disposes and a later re-declaration re-runs.

Other service methods: `install(renderer)` (242, boot-once), `installLocale(face)` (259), `provideRoot(contribution)` (275), `installScope(scope, adapter)` (300), `bindStoreScope` (326), and the ctx-level `renderSlot('root')` guard (line 350: *"ctx-level renderSlot only renders 'root'"*).

Canonical plugin code from the shipped docs ([`docs/subsystems/slots.md:19-42`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/docs/subsystems/slots.md)):

```tsx
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

type HeaderActionProps = PropsRuntime<'conversation.session.header.actions'>

function HeaderAction({ useSession }: HeaderActionProps) {
  const running = useSession(snapshot => snapshot.running)
  return <button disabled={running}>Review</button>
}

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'review',
      order: 100,
    }, HeaderAction))
}
```

### 3.2 Complete UI contribution-point table

This is generated from `SlotMap` declarations + `slots.register()` call sites by `pnpm run gen-client-catalog` into [`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/extensions/cordis-client-runner/src/client/slot-catalog.ts) (`CLIENT_SLOT_API`, 61 entries). `risk=shadows-shipped-ui` means registering replaces shipped UI (a second entry at the same priority throws; a *dynamic* package gets an auto-lower priority so it wins).

| Slot key | kind | scope | risk | declared by (source) |
|---|---|---|---|---|
| `root` | single | root | shadows | `packages/client/ui-layout/src/client/index.ts` — **do not register** |
| `main` | keyed | root | shadows | `ui-layout/src/client/index.ts:66` (key `conversation` taken) |
| `main.conversation` | single | session-maybe | shadows | `ui-layout` |
| `sidebar` | single | root | shadows | `ui-sidebar` |
| `sidebar.panellist` | **list** | root | none | `ui-sidebar/src/client/contract/slots.ts:32` — panel icon; **each list id addresses the matching `main` keyed panel** |
| `sidebar.footer.action` | list | root | none | `ui-sidebar/src/client/contract/slots.ts:50` |
| `sidebar.brand.mark` / `.brand.name` | single | root | shadows | `ui-brand-official` |
| `sidebar.workspaces` (+ `.directoryFlow`) | single | root | shadows | `ui-workspace` |
| `sidebar.settings` | single | root | shadows | `ui-settings-general` |
| `settings.trigger` / `.header` / `.close` | single | root | shadows | `ui-settings-general` |
| `settings.section` | **list** | root | none | `ui-settings/src/client/contract/slots.ts:54` — one full settings page (`id`,`order`,`label`) |
| `settings.general.item` | **list** | root | none | `ui-settings/src/client/contract/slots.ts:89` — one preference row |
| `settings.action` | list | root | none | `ui-settings-general` |
| `settings.models.provider-card` | keyed | root | none | `ui-settings-models` |
| `settings.onboarding` | list | root | none | `ui-settings` |
| `settings.plugins.tab` / `settings.plugin.item` | list/keyed | root | none | `ui-settings-plugins(-inventory)` |
| `rightbar` | single | root | shadows | `ui-layout/src/client/index.ts:80` (right column; `RightbarOwnerProps {width, viewportWidth, canShow}`) |
| `rightbar.session` | single | session | shadows | `ui-sidebar-right/src/client/contract/slots.ts:42` |
| `sidebar.right.pane.tab` | **keyed** | session | none | `ui-sidebar-right/.../slots.ts:50` — one tab *body*, `hookContext: TabHookContext`, `inject: SidebarRightTabInjected` |
| `sidebar.right.pane.tab.title` | keyed | session | none | same file — tab chip title |
| `sidebar.right.tab.guide` | chain | session | none | same file — replace guide body |
| `sidebar.right.tab.menu.item` | list | session | none | same file |
| `sidebar.right.tab.document` | keyed | session | none | `ui-sidebar-documentpreview` |
| `conversation.session` | single | session | shadows | `ui-conversation/src/client/contract/slots.ts` |
| `conversation.session.header` | single | session | shadows | `ui-conversation` |
| `conversation.session.header.actions` | **list** | session | none | `ui-conversation` |
| `conversation.session.header.utilities` | list | session | none | `ui-conversation` |
| `conversation.session.header.lineage` / `.corner` | single | session | shadows | `ui-subagent` / `ui-sidebar-right` |
| `conversation.view` | **list** | session | none | `ui-conversation/src/client/contract/slots.ts:156` — register a whole conversation View (`id`,`order`,`label`) |
| `conversation.chat.node` | **keyed** | session | shadows | `ui-chat/src/client/contract/slots.ts:182` — message decorations; keyed by `ChatNodeKind` (`assistant-step`,`tool-call`,`turn-tail`,`user`,…) |
| `conversation.chat.assistant-actions` | **list** | session | none | `ui-chat/src/client/contract/slots.ts:213` — owner props `{messageId}` |
| `conversation.chat.commandview` | keyed | session | none | `ui-chat` |
| `conversation.chat.turnTail` | chain | session | none | `ui-chat` — occupant `client-ui-deliverables Deliverables` |
| `conversation.message.images` / `.trajectory.images` | single | session | shadows | `ui-attachment` |
| `tool.call.toolview` | **keyed** | session | shadows | `ui-tool/src/client/contract/slots.ts:26` — **custom tool-call renderer**, keyed by wire tool name |
| `tool.call.images` | single | session | shadows | `ui-attachment` |
| `tool.view.cordis` | **keyed** | session | none | `extensions/ui-cordis/src/client/slots.ts:31` — dynamic package's region inside its `cordis_run` card (`key:'self'`) |
| `conversation.composer` | chain | session | none | `ui-conversation` |
| `conversation.composer.bar` | single | session-maybe | shadows | `ui-conversation` |
| `conversation.composer.dock` | list | session | none | `ui-conversation` |
| `conversation.input.attachments` | single | session-maybe | shadows | `ui-attachment` |
| `conversation.input.model` / `.plan` | single | session | shadows | `ui-model-selection` / `ui-plan` |
| `conversation.input.dock` / `.left` / `.right` / `.overlay` | list | session | none | `ui-conversation` / `ui-commands` |
| `conversation.approval.detail` | single | session | shadows | `ui-approval/src/client/contract/slots.ts:37` |
| `conversation.hero.*` | single | root | mixed | `ui-workspace`/`ui-agent-preset`/`ui-brand-official` |
| `shell.overlay` | **list** | root | none | `ui-layout/src/client/index.ts:91` — frame-wide floating layer, click-through until your entry opts in |

Standard hook seats by scope (from the same catalog + `docs/subsystems/slots.md:79-93`):

| Availability | Props | Owner |
|---|---|---|
| every scope | `useSessions`, `useSessionPendingInteraction`, `useWorkspaces`, `usePanelInfo`, `useResource` | `ui-session`/`ui-workspace`/`ui-layout`/`resources` |
| `session` | `sessionId`, `useSession`, `useProjection`, `useConversation`, `useInput`, `inputActions`, `useChat`, `useTrajectory` | `ui-session`/`ui-conversation`/`ui-chat`/`ui-trajectory` |
| `session-maybe` | the same, optionally present | same |

### 3.3 Component library / styling

- **No Tailwind, no component library.** [`docs/web-styling.md:16`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/docs/web-styling.md): *"Use CSS Modules and `clsx`; do not add a component library or Tailwind."*
- Design system = [`packages/client/ui-theme`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/client/ui-theme/README.md): six sheets in `src/styles/` (`base.css`, `corner-shape.css`, `design-platform.css`, `scrollbar.css`, `gradient-shadow-text.css`, `shiki.css`), exposing `--dsw-*` tokens. Feature components use **semantic aliases** `--dsw-alias-*` (e.g. `var(--dsw-alias-bg-layer-1)`, `var(--dsw-alias-label-primary)`), never literal colors (`docs/web-styling.md:17`).
- Shared controls live in `ui-primitives` (module-table row, so importable). `docs/web-styling.md:15`: *"the ui-primitives component catalog is the only channel that crosses feature packages."*
- Third-party theme registration: `ctx.theme` alias-token overrides (`packages/client/ui-theme/README.md`, "Registering a theme").
- **Dynamic packages** cannot import `ui-primitives`: `styles.insert(css)` + `React.createElement` only, with the same `--dsw-*` variables (`slot-catalog.ts` `CLIENT_NOTES[3]`).

### 3.4 Reacting to session/agent state; sending actions back

**Reading** (static plugin): use the standard hooks granted by the slot's scope — the component never receives `ctx`:

```ts
const running = useSession(snapshot => snapshot.running)
const current = useSessions(state => state.current)
```
(`docs/subsystems/slots.md:27-29`; `slot-catalog.ts` CLIENT_NOTES[4]).

Alternatively register an `inject` factory returning a reserved `hooks` compartment of bare `{getSnapshot, subscribe}` sources; the renderer turns `hooks: { status }` into a `useStatus(selector)` prop and caches by source identity. *"Components do not receive the source itself and do not call `useSyncExternalStore` directly"* (`docs/subsystems/slots.md:101`; `HooksSources` at `ui-slots/src/index.ts:384`).

**Writing back to the agent** — three real mechanisms:

1. `ctx.sessions` client model: the `Session` object exposes `prompt(content, mode: 'queue'|'steer', signal?, requestId?)` returning `RemoteResult<{accepted:true}>` ([`packages/api/session-controller/src/client/sessions/session.ts:232`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/packages/api/session-controller/src/client/sessions/session.ts)). It validates `sessionId`, `mode`, `content`, `clientTimeZone` and calls `this.remote.session.prompt(...)`.
2. The composer's `inputActions` (only on `session`/`session-maybe` slots): `setDraft(text)`, `addAttachments(ids)`, `removeAttachment(id)`, `pruneAttachments(ids)`, `submit()` (`packages/client/ui-conversation/src/client/contract/input.ts:229-241`).
3. A custom client→host call: a generated Remote method, an exact Fetch route, or (dynamic packages) `host.call`.

**Host-side** action back into the loop is the ordinary Cordis one: `agent.followup(...)` / `agent.steer(...)` (`docs/cookbook/extension-cookbook.md:57-60, 110`).

---

## 4. Host ↔ client communication

### 4.1 What exists

| Transport | Where | Use |
|---|---|---|
| **HTTP POST `/api/<ns>/<method>`** (unary RPC) | Typert API Gateway + `packages/client/connection` | generated `ctx.remote.<namespace>.<method>(...)` |
| **WebSocket `/api/remote.mux`** | `packages/client/connection` | logical streams (`RemoteStream`), incl. the internal `$events` generation source |
| **Forwarded events** | `ctx.remote.$on()` | allowlisted ordinary events → root ctx; scoped waterfall events → session ctx |
| **Exact Fetch routes** | `ctx.webServer.register({kind:'exact'|'prefix', path, handler})` | non-JSON responses, downloads, uploads, your own JSON API |
| **HTTP upgrade** | `ctx.webServer.registerUpgrade({path, handler})` | WebSockets (terminals, etc.) |
| **SSE `GET /plugins/events`** | `packages/client/hmr` only | dev-only plugin reload frames |
| **`harness.handle` / `host.call`** | dynamic packages only | package-private client→host JSON RPC |

### 4.2 The first-party path (typert `@Remote`)

Host declares:

```ts
export class NotesController extends TypertRemoteService {
  constructor(ctx: Context) { super(ctx, 'notesController', { namespace: 'notes' }) }

  @Remote('list')
  async remoteExportList(agent: Agent, signal: AbortSignal): Promise<NoteRow[]> { ... }
}
```
([`docs/cookbook/adding-a-remote-api.md:11-49`](/Users/sunjungong/Documents/DSH/deepseek-harness-alpha/docs/cookbook/adding-a-remote-api.md))

Client calls (no Proxy, no hand-written signature):

```ts
export const inject = ['remote', 'remote.notes']
const result = await ctx.remote.notes.list()
if (!result.ok) { if (result.error.code === 'note/not-found') return []; throw result.error }
```
(`docs/cookbook/adding-a-remote-api.md:113-130`)

Transport detail: *"The Client Remote calls `connection.rpc.call('/api', '<namespace>/<method>', { args }, signal)`; the HTTP carrier maps this to `POST /api/<namespace>/<method>`, with a payload containing only a named `args` object."* (`docs/api-gateway.md:121`). Trust: Host must be loopback or in `trustedHosts`, Origin must equal Host, `sec-fetch-site: cross-site` refused → 403; token-authenticated via a signed cookie, missing/expired → 401 (`packages/client/connection/README.md:35-39`).

**Generation is host-only and monorepo-coupled.** `pnpm run build:lib:host` runs `tsc -b tsconfig.host.json` then `tsdown --env.DSH_BUILD_FACE host`, and Typert generates `typert.host.*` / `typert.remote-client.*` per contributing package (`docs/api-gateway.md:97-113`). **A third-party package outside this workspace cannot run that generator.** No standalone `dsh typert` CLI was found.

### 4.3 The third-party path actually used: `ctx.webServer` routes

**Every one of the three real plugins** uses this. Host contract (minimal structural view, as the plugins type it):

```ts
export interface WebServerLike {
  register(route: {
    kind: "prefix";                     // or "exact"
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
  }): () => void;
}
```
(`dsh-minecraft/src/api.ts:26-32`; identical in `dsh-whale-report/src/api.ts:76-81`)

Real host service surface: `WebRouteKind = 'exact' | 'prefix'`; duplicate paths throw; `registerUpgrade` for upgrades; longest-prefix-wins after exact miss; `registerFallback` (one owner) — `packages/host/webserver/src/index.ts:38-50, 165-186, 317-324`.

Route registration (minecraft):

```ts
disposers.push(
  server.register({ kind: "prefix", path: "/minecraft/api/status",   handler: guarded(handleStatus) }),
  server.register({ kind: "prefix", path: "/minecraft/api/textures", handler: guarded((req,res)=>handleTextures(svc,req,res)) }),
  server.register({ kind: "prefix", path: "/minecraft/api/sketch",   handler: guarded((req,res)=>handleSketch(svc,req,res)) }),
  server.register({ kind: "prefix", path: "/minecraft/api/clear",    handler: guarded((req,res)=>handleClear(svc,req,res)) }),
);
```
(`dsh-minecraft/src/api.ts:238-262`; `guarded` applies `isTrustedApiRequest` at line 218-227)

Mounted lazily on service availability, with `ctx.effect` cleanup:

```ts
ctx.inject(["webServer"], (c) => tryRegister(c as Context & { webServer?: unknown }));
ctx.inject(["httpServer"], (c) => tryRegister(c as Context & { httpServer?: unknown }));
```
(`dsh-minecraft/src/index.ts:111-112`)

Every plugin re-implements its own trust fence because the official one is package-internal: `dsh-minecraft/trust-fence.ts` documents it as *"语义与官方 /api 网关的 fence 一致（@deepseek-ai/dsh-client-connection 的 api-request-trust.ts / loopback-hostname.ts），按行为复刻"* — a **behavioral re-implementation**, not an import. `dsh-better-sidebar`'s fence additionally reads `trustedHosts` live from the loader's `connection` row (`dsh-better-sidebar-011/src/index.ts:78-86`).

Client side is plain `fetch` (minecraft), with a handler for `!response.ok`:

```ts
const res = await fetch("/minecraft/api/status", { headers: { accept: "application/json" } });
```
(`dsh-minecraft/src/client/index.tsx:252`)

whale-report wraps it:

```ts
export async function api<T>(method: string, payload?: unknown): Promise<T> {
  const response = await fetchWithTimeout(`/whale/api/${method}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: payload === undefined ? undefined : { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  }, FETCH_TIMEOUT_MS.light);
  const body = (await response.json()) as { ok: boolean; error?: { message?: string } } & T;
  if (!response.ok || body.ok === false) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  return body;
}
```
(`dsh-whale-report/src/client/api.ts:7-20`)

### 4.4 Pushing host → client

There is **no generic server-push primitive for third-party plugins.** Observed options:

- **Polling** (what minecraft does): `setInterval(() => void poll(), 3000)` (`dsh-minecraft/src/client/index.tsx:261`).
- **WebSocket upgrade** (better-sidebar terminals): `ctx.webServer.registerUpgrade({...})` (`dsh-better-sidebar-011/src/index.ts:665, 687`) + `new WebSocket(new URL('/sidebar/ws/terminal', location.origin))` (`dsh-better-sidebar-011/src/client/TerminalView.tsx:114`).
- **Resource model** (`useResource`, first-party-ish but in module table): register a provider once and components read `dsh-resource://<type>/…` addresses; `open(address,{signal})` returns an `AsyncIterable<RemoteResult<T>>` — *"the current state first, then one frame per change"* (`docs/subsystems/client-resources.md:23`). The provider is free to poll internally. This is the sanctioned *"push into any component"* seam. `useResource` is on **every** slot component.
- **HMR's SSE** is dev-only and plugin-reload specific — do not repurpose it.

### 4.5 Dynamic packages: `harness.handle` ↔ `host.call`

Host half:
```js
return { apply(ctx) { harness.handle('read-state', async (args) => ({ value: args.key })) } }
```
Client half:
```js
return { async apply(ctx) { const r = await host.call('read-state', { key: 'demo' }); console.log(r.value) } }
```
(`packages/preset/agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md:323-345`)

Rules: *"Arguments and return values must be lossless JSON. Do not pass functions, React elements, class instances, Contexts, Services… Do not register a public Remote Service or use `ctx.remote` for Package-private communication."* Each call is associated with `pluginId + pluginRunId`; stale runs are rejected (`packages/extensions/cordis-host-runner/src/guard.ts:595-620`; `snapshots/.../system-prompt.expected.md:122`).

**The direction is Client→Host only.** Host→Client push inside a dynamic package is not part of this channel — the client half must poll via the `timer` service or react to slot props/events.

---

## 5. How `mc__show_sketch` renders — end to end

Exact chain in [`dsh-minecraft`](/Users/sunjungong/Documents/DSH/dsh-minecraft):

**1. Tool definition (host).** `dsh-minecraft/src/tools.ts:48-49`:

```ts
return defineTool({
  name: "mc__show_sketch",
  description: "Render an architectural sketch to the Minecraft sidebar (the scoreboard panel …)"
    + " … Call mc__list_players first to confirm someone is online to see it.",
  parameters: { sketch: { type: "object", required: true, properties: { name, style, size,
    grids: { front/side/top: string[][] }, palette: {…}, materials, steps, tip } }, view: {...} },
```

**2. Execute (host).** `dsh-minecraft/src/tools.ts:120-160`: sanitize (`pickViews`/`pickGrids`/`sanitizePalette`) → `checkSketch` → `renderSketch` → RCON push → **and the panel write**:

```ts
svc.onSketch?.(sketch, view, layout.title, layout.lines);
```
The tool returns a structured result either way (RCON failure degrades to `ok:true` + `detail`, preview still works).

**3. Host state.** `dsh-minecraft/src/state.ts` — a module-level singleton, explicitly documented as *"当前草图内存态：宿主 half 与 Web 面板之间的单一事实源"*:

```ts
let current: CurrentSketch | null = null;
export function getCurrentSketch(): CurrentSketch | null { return current }
export function setCurrentSketch(value: CurrentSketch): void { current = value }
export function clearCurrentSketch(): void { current = null }
```

**4. Wiring.** `dsh-minecraft/src/index.ts:91-98`:

```ts
const services: MinecraftServices = {
  rcon, limits,
  onSketch: (sketch, view, titleJson, lines) => {
    setCurrentSketch({ sketch, view, titleJson, lines, updatedAt: Date.now() });
  },
  onClear: () => { clearCurrentSketch(); },
};
registerMinecraftTools(ctx as unknown as ToolsHost, services);
```

**5. Transport.** `dsh-minecraft/src/api.ts:63-79` serves `GET /minecraft/api/status`:

```ts
function handleStatus(_req, res): void {
  const current = getCurrentSketch();
  writeJson(res, 200, { ok: true, sketch: current ? { name, style, size, view, titleJson, lines, updatedAt } : null });
}
```

**6. Client poll.** `dsh-minecraft/src/client/index.tsx:245-266`:

```ts
useEffect(() => {
  let alive = true;
  const poll = async () => {
    const res = await fetch("/minecraft/api/status", { headers: { accept: "application/json" } });
    if (!res.ok) return;
    const data = await res.json() as { ok: boolean; sketch: StatusSketch | null };
    if (alive) setSketch(data.sketch);
  };
  void poll();
  const timer = setInterval(() => void poll(), 3000);
  return () => { alive = false; clearInterval(timer); };
}, []);
```

**7. Client UI mount.** There is **no `ctx.slots` call anywhere in dsh-minecraft** (verified by grep). Instead, `dsh-minecraft/src/client/index.tsx:501-532`:

```ts
export function apply(ctx: ClientContext): void {
  injectStyle();                                     // <style data-mc-style> into document.head
  ctx.effect(() => {                                 // fallback: own React root on <body>
    const host = document.createElement("div");
    host.setAttribute("data-mc-panel-root", "");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    root.render(<FallbackDrawer />);
    return () => { root.unmount(); host.remove(); };
  });
  ctx.inject(["betterSidebar"], (injected) => {       // preferred: another plugin's service
    const service = injected.betterSidebar as BetterSidebarLike | undefined;
    if (service === undefined) return;
    ctx.effect(() => service.registerTab({
      id: "dsh-minecraft:sketch", title: "MC 草图", order: 80, single: true,
      component: () => <SidebarTab />,
    }));
    setTabRegistered(true);
  });
}
```

**8. Client → host action.** "推送到游戏" does `POST /minecraft/api/sketch { sketch, view, push: true }` (`dsh-minecraft/src/client/index.tsx:279-283`) → `handleSketch` re-validates, re-renders server-side, optionally RCON-pushes, and re-writes the same state.

**Pattern summary (model for a roadmap/lesson UI):**
`tool.execute` → module-level host state → guarded `ctx.webServer` prefix route → client `fetch` on an interval → local React root (or another plugin's `betterSidebar` service) → action posts back over the same route.

`dsh-whale-report` is structurally identical: host `/whale/api` prefix route (`dsh-whale-report/src/api.ts:281-283`), client `fetch` wrapper (`src/client/api.ts`), own React root + `ctx.inject(["betterSidebar"])` tab (`src/client/index.tsx:109-141`).

---

## 6. Minimal UI plugin skeleton

### 6.1 Channel B — dynamic Cordis package (no build, no npm, third-party-native)

This is the **smallest faithful** UI plugin. Verified against the generated catalog's own `example` field and the shipped skill.

**Host half** (`code.host`, plain JS, returns a plugin):

```js
return {
  apply(ctx) {
    harness.handle('read-state', async (args) => {   // Client→Host JSON RPC
      return { title: 'Roadmap', items: ['M1', 'M2'], key: args.key }
    })
  },
}
```

**Client half** (`code.client`, plain JS — **no JSX, no import, no fetch**):

```js
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const off = styles.insert(`
      .rm { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1);
            padding: 8px; border-radius: 8px; font-size: 13px }
    `)
    ctx.effect(() => off)
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'my-roadmap', order: 100 },
      () => React.createElement(Roadmap),
    ))
    function Roadmap() {
      const [state, setState] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        host.call('read-state', { key: 'demo' }).then(v => { if (alive) setState(v) })
        return () => { alive = false }
      }, [])
      if (state === null) return React.createElement('div', { className: 'rm' }, 'loading…')
      return React.createElement('div', { className: 'rm' },
        React.createElement('b', null, state.title),
        React.createElement('ul', null, state.items.map((t, i) => React.createElement('li', { key: i }, t))))
    }
  },
}
```

Provenance of each piece:
- `harness.handle` + `host.call` — `SKILL.md:323-345`; signature `packages/extensions/cordis-host-runner/src/sandbox.ts:33`.
- `ctx.get('slots')` with absence check (do **not** write `ctx.slots` without `inject:['slots']`) — `SKILL.md:288-305`.
- `slots.inject(key, () => slots.register(...))` — `SKILL.md:246-258`; `registry.ts:172`.
- `styles.insert(css)` + `--dsw-*` variables — `slot-catalog.ts` `CLIENT_NOTES[3]`; `evaluator.ts:88-100`.
- `React.createElement` only — `SKILL.md:99-118`; closure symbols `['React','console','styles','host','harness',…traps,'process','Buffer']` at `evaluator.ts:177`.
- `shell.overlay` is additive and click-through — `slot-catalog.ts` doc for `shell.overlay`.
- For a card inside the run itself use `slots.register({ name:'tool.view.cordis', key:'self' }, ...)` — guard rewrites `'self'` to `${pluginId}.${packageId}` (`guard.ts:148-152`).

Delivered via `cordis_define` (validate only) → `cordis_run` (may return `awaiting-approval`; the human approves on the run card) → `cordis_stop` / `cordis_undefine` (`packages/extensions/tool-cordis/README.md`).

### 6.2 Channel A — packaged static client plugin (what better-sidebar/whale/minecraft do)

```
my-plugin/
  package.json          # main lib/index.js, exports["./client"], dsh.bundle.patch, dsh.client
  cordis.patch.yml      # - insert: [{ id: my-plugin, name: 'my-plugin' }]
  tsdown.config.ts      # CJS single-file + __ModuleLoader__ banner
  src/index.ts          # host: name/inject/Config/apply; ctx.webServer.register(...)
  src/client/index.tsx  # client: export const inject=[]; export function apply(ctx){...}
```

Client half, slot-based variant (the *sanctioned* one):

```tsx
// src/client/index.tsx
import { useEffect, useState, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar'   // brings the SlotMap merge in

export const name = 'my-plugin-client'
export const inject = ['slots']

type Props = PropsRuntime<'sidebar.footer.action'>

export function apply(ctx: Context): void {
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'my-plugin',
    order: 100,
    label: 'Roadmap',
  }, Panel))
}

function Panel({ wide, useSession }: Props): ReactNode {
  const running = useSession?.(s => s.running)
  const [items, setItems] = useState<string[]>([])
  useEffect(() => { fetch('/my-plugin/api/roadmap').then(r => r.json()).then(d => setItems(d.items)) }, [])
  return <div className="my-panel">{wide ? items.map(i => <p key={i}>{i}</p>) : '…'}</div>
}
```

Every piece traced to source:
- `export const inject = ['slots']` — `docs/subsystems/slots.md:32`.
- `ctx.slots.inject(key, () => ctx.slots.register(options, Component))` — `docs/subsystems/slots.md:34-41`; `registry.ts:172-234`.
- `name`/`id`/`order`/`label` semantics per cardinality — `slot-catalog.ts` `REGISTER_OPTIONS`.
- `PropsRuntime<'sidebar.footer.action'>` with `{wide: boolean}` — `ui-sidebar/src/client/contract/slots.ts:50`.
- `useSession` availability depends on `scope: 'session'`; `sidebar.footer.action` is `root`, so use `useSessions`/owner props instead — a real trap worth restating (`docs/subsystems/slots.md:79-93`).
- `fetch('/my-plugin/api/...')` + `ctx.webServer.register({kind:'prefix', path:'/my-plugin/api', handler})` — `dsh-minecraft/src/api.ts:26-32, 238-262`.
- For a left-sidebar **panel** (icon + `main` keyed panel), register `sidebar.panellist` with your `id` and then `main` with `key: '<your id>'` — the catalog doc says *"Each list id addresses the matching main panel"*.

---

## 7. Stability assessment (v0.1.5-rc.1)

### 7.1 Public / stable-ish

| API | Evidence |
|---|---|
| `package.json.dsh.client` (`platform`,`inject`,`external`,`immediately`) + `exports["./client"]` | typed in `packages/util/package-manifest/src/types.ts`; verified by `scripts/verify-client-packages.ts`; documented in `docs/subsystems/client-modules.md:77` |
| `window.__ModuleLoader__.load({id, factory})` bundle contract | `packages/client/modules/src/client/manifest.ts:283-293`; pinned by the purity gate |
| `ctx.slots.register` / `ctx.slots.inject` / `SlotMap` merges | `docs/subsystems/slots.md` is a first-class subsystem reference; `verify-client-catalog` gates the generated contract |
| Standard slot props (`useSession`, `useSessions`, `useWorkspaces`, `usePanelInfo`, `useResource`, `inputActions`) | `docs/subsystems/slots.md:79-93`; carried in the generated catalog |
| `ctx.webServer.register` / `registerUpgrade` / fallback | `packages/host/webserver`; used by 3/3 third-party plugins |
| `ctx.effect`, `ctx.provide`, `ctx.inject`, `ctx.get` | Cordis core; `requireUser`-free |
| Dynamic packages (`cordis_define`/`cordis_run`, `harness.handle`/`host.call`, `styles.insert`, `ctx.get('slots')`) | dedicated packages `extensions/*`, a shipped agent-preset **skill**, generated catalogs, snapshot-tested system prompt |
| `--dsw-*` / `--dsw-alias-*` theme variables | `docs/web-styling.md`; ui-theme README |
| `pnpm run dev:web`, `/plugins/events` HMR | documented in `packages/client/hmr/README.md` + `docs/api-gateway.md:139-148` |

### 7.2 Internal / unstable

| API | Why |
|---|---|
| `ctx.clientModules` (`ClientModuleRegistry`) | kernel machinery; `docs/subsystems/client-modules.md` frames it as the web plugin table, not an extension point |
| `WebBootGraph` internals, combo URLs, rev hashing | wire between two first-party halves |
| `packages/client/ui-dockkit` | explicitly *"an internal dependency of ui-sidebar-right, not a stable interface"* (`docs/subsystems/sidebar-right.md:17`) |
| `ctx.sidebarRight` layout snapshot/subscription | *"the service exposes operations only, and `LayoutState`/`LayoutOp` are internal"* (`docs/subsystems/sidebar-right.md:141`) |
| `SlotCore` (pure core) vs `SlotRegistry` | register through the service; `SlotCore.snapshot()`/`entries()`/`declarationEpoch()` are engine reads |
| `packages/sdk/*` | **unrelated to the GUI**: `DeepSeekHarness` / `HarnessClient` spawn a runtime subprocess over stdio JSON-RPC (`packages/sdk/client/README.md`). Not a browser transport. |
| `packages/web` | **not** the GUI — it is web tools (fetch/search). The GUI frontend is `apps/web` + `packages/client/*`. |
| `ctx.remote` Typert generation for third parties | requires the workspace `ts.Program`; no standalone generator found |

### 7.3 Version-drift evidence (concrete)

- `dsh-better-sidebar@0.11.0` declares peer deps `@deepseek-ai/dsh-client-*@^0.1.0-rc.6` and injects module rows `@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-web-react`, `@deepseek-ai/dsh-client-schema-form` — **none exist in 0.1.5-rc.1**. It survives only because unknown `dsh.client.inject` names are ignored (`system.ts:165-168`).
- `dsh-minecraft@0.2.0` / `dsh-whale-report@0.6.1` peer-depend on `@deepseek-ai/dsh-tools@^0.1.0-rc.6` / `>=0.1.1-rc.2 <0.2.0` while the checkout is `0.1.5-rc.1` — the ranges are pre-1.0 and pin differently in each repo.
- `dsh-minecraft`/`dsh-whale-report` carry a dead top-level `dshClient` block.
- Three separate copies of the trust fence exist across the repos, each a *behavioral re-implementation* of an internal package.
- All three repos hand-roll the tsdown config instead of importing `packages/client/tsdown.client.ts` (which lives in the monorepo and is not published as a preset for outsiders — it imports `./modules/src/client/manifest.ts`, `./web/src/platform.ts` and `../../scripts/client-build-environment.ts` by relative path).

### 7.4 Does the client-extension API look designed for third parties?

**Split answer.**

- **Dynamic packages: yes, emphatically.** There is a shipped skill (`packages/preset/agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md`), a machine-readable slot catalog (61 entries with register options, owner props, occupants, replace risk, and a ready-made `example` per slot), an API catalog, a run-approval UX, teaching error messages for every guard rejection, and an explicit design note that the dynamic façade mirrors the static one. This is the intended third-party (and model-authored) extension surface.
- **Static npm client plugins: yes in principle, no in tooling.** The contract is documented and stable-shaped, and `dsh plugin --profile add` + `cordis.patch.yml` is a real install path (better-sidebar's README documents it end to end). But: the slot *type* declarations live in first-party packages you must peer-depend on (`@deepseek-ai/dsh-client-ui-slots`, `...-ui-sidebar`, `...-ui-conversation`), the build preset is monorepo-relative, the trust fence and Remote generator are not exported, and the RC-version drift above shows the peer surface moving fast. Practically, a third party must depend on `@deepseek-ai/*@0.1.x-rc.*` and re-verify per release.

---

## 8. Possible vs impossible (current state)

### Possible today
- Add a frame-wide overlay/pill/toast: `shell.overlay` (list, additive, click-through).
- Add a left-sidebar entry + its main panel: `sidebar.panellist` (list) + `main` (keyed).
- Add a right-sidebar tab with its own body/title/menu: `ctx.sidebarRightTabs.register(...)` + `sidebar.right.pane.tab` / `.title` / `.tab.menu.item`.
- Add a **settings page**: `settings.section` (list) or a single row via `settings.general.item`. (`dsh-better-sidebar` does exactly this at `src/client/index.tsx:228`.)
- Replace or add a **conversation view**: `conversation.view`.
- Add **message decorations / assistant actions**: `conversation.chat.assistant-actions`; keyed node renderers via `conversation.chat.node`.
- Add a **custom tool-call renderer**: `tool.call.toolview`, keyed by wire tool name.
- Add **composer-side UI**: `conversation.input.left` / `.right` / `.dock` / `.overlay` / `.composer.dock`.
- Read session/agent state in any component via standard hooks or `inject` `hooks` sources; push your own state via `ctx.resources` providers and `useResource`.
- Send actions back: `ctx.sessions.<session>.prompt(content,'queue'|'steer')`, `inputActions.submit()`, a Remote method, or your own route that calls `agent.followup()`.
- Ship UI with **zero packaging** via `cordis_define` + `cordis_run`, with a private host bridge (`harness.handle`/`host.call`) and `styles.insert`.
- Iterate live with `pnpm dsh web` + `pnpm run dev:web`; hot-swap on every `lib/client.js` rewrite.

### Not possible / not found
- **No client-side router / page / URL route contribution point.** Grep of `SlotMap` and the generated catalog shows no route/page slot. "Pages" are `main` keyed panels + sidebar entries.
- **No standalone Typert Remote generator for out-of-workspace packages.** A third party cannot generate `ctx.remote.<ns>` contracts; use `ctx.webServer` routes (what all three plugins do) or dynamic-package `harness.handle`.
- **No official, exported browser-trust fence.** Each plugin re-implements loopback/Origin/`sec-fetch-site` checks.
- **No generic host→client push for third-party plugins.** Choose polling, an upgrade WebSocket, or a `ctx.resources` provider that polls.
- **No published tsdown preset.** `clientBundle()`/`staticLinked()` are monorepo-internal; outsiders hand-roll the CJS + `__ModuleLoader__` banner.
- **No separate CLI or docs for `dsh plugin add`** in this checkout — I found `cordis.patch.yml` mount semantics (`packages/boot/app-boot/src/profile.ts:794-809`, `packages/bundle/*/package.json` `dsh.bundle.patch`) and the install flow only in `dsh-better-sidebar-011/README.md:155-190`. Treat the CLI wording there as unverified against 0.1.5-rc.1 source.
- **`ctx.slots.register('root', …)` is forbidden** — it shadows `AppFrame` and deletes every seat. Use `shell.overlay` (`registry.ts:27-45`).
- Dynamic packages: **cannot** import modules, use `fetch`/`setTimeout`, use JSX/TS, cross JSON-unsafe values, or persist (`tool-cordis/README.md`; `evaluator.ts:38-63, 177`).
