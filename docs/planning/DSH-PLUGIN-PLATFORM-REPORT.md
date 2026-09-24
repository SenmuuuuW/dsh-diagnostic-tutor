# DSH Plugin Platform: Install, Distribution, Configuration, CLI

**Method.** Every claim below comes from source I read, not from naming intuition. Two artifacts were
read side by side:

| Tag | What it is | Path |
|---|---|---|
| **A / rc.1** | source checkout `0.1.5-rc.1` | `<dsh-checkout>` |
| **B / alpha.2** | the **running** host, npm `@deepseek-ai/dsh@0.1.6-alpha.2` via npx | `<npx-cache>/@deepseek-ai` |

Confirmed running: `ps` shows `node .../.bin/dsh web` under `npm exec @deepseek-ai/dsh@0.1.6-alpha.2 web` (pid 13285).
Where a fact exists in both I cite the rc.1 source (it has line numbers); where the running alpha.2 differs
I cite the installed file.

Real plugin repos read: `dsh-whale-report`, `dsh-minecraft`, `dsh-better-sidebar-011`, `dsh-study`.
Skill repo read in full: `dsh-plugin-upgrade-skill` (10 `SKILL.md` files + all `references/`).

---

## 1. Plugin discovery & install mechanism

### 1.1 The three-layer model (this is the whole system)

DSH has **no plugin registry client, no plugin index, and no plugin-specific resolution code.** A
"plugin" is just an npm package that ships a *patch layer*. Three concepts do all the work:

```
bundle   = an npm package whose package.json declares  dsh.bundle.patch → "./cordis.patch.yml"
profile  = $DSH_HOME/profiles/<name>/  — a package.json with dsh.profile.bundles (ordered) + its own cordis.patch.yml
loader   = Cordis' Loader, mounted over `[]` with the flattened patch list applied
```

Verbatim from the source module doc (`packages/boot/app-boot/src/profile.ts:1-24`):

> A profile is a directory under `$DSH_HOME/profiles/<name>` holding a `package.json` (out-of-tree plugin
> dependencies plus the profile manifest `dsh.profile` with its ordered `bundles` list) and a
> `cordis.patch.yml` (the user's own patch layer, applied after every bundle layer). Bundles are npm
> packages whose manifest declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; the tree is
> composed by applying each bundle's patch list in `dsh.profile.bundles` order over an empty entry list,
> then the profile's own patches, then any launcher layers (`--patch` files and flag-derived patches).

`$DSH_HOME` resolution: explicit configured path → `$DSH_HOME` → `~/.dsh`
(`@deepseek-ai/dsh-home-paths`, `DSH_HOME_ENV`/`DSH_HOME_DIR_NAME` consts, README:12).

### 1.2 Exact CLI commands

The command registry is **`apps/cli/src/args.ts`** (commander). There are exactly three launcher modes;
everything else is app-owned and parsed later by `@deepseek-ai/dsh-cmdline`.

| Command | Defined at | Meaning |
|---|---|---|
| `dsh --profile <name> [app-args...]` | `apps/cli/src/args.ts:145-161` | boot a profile |
| `dsh web [...]` | `apps/cli/src/args.ts:175-188` (rc.1) | hardcoded alias for `--profile web` |
| `dsh plugin --profile <name> <pnpm-args...>` | `apps/cli/src/args.ts:190-201` | **plugin management = raw pnpm passthrough** |
| `dsh --profile <n> --dump-config [--patch f]` | `args.ts:148-149` | print composed tree, don't boot |
| `dsh --profile <n> --dump-default-config` | `args.ts:149` | bundles-only tree (no user/home/`--patch` layers) |

**There is no `dsh plugin install` / `list` / `remove` / `upgrade` subcommand.** The whole verb set is
whatever pnpm has. From `apps/cli/src/args.ts:190`:

> `manage a profile's plugins by forwarding the remaining arguments to pnpm in the profile directory`

and `apps/cli/src/args.ts:194`: `argument('[args...]', 'pnpm arguments, forwarded verbatim (add <pkg>, remove <pkg>, why <pkg>, ...)')`.

So the actual commands a user runs:

```sh
dsh plugin --profile web add <pkg>                  # install (npm name, github:owner/repo, ./path, ./x.tgz)
dsh plugin --profile web add dsh-foo@0.3.1          # pin a version
dsh plugin --profile web add github:you/foo#<sha>   # pin a commit
dsh plugin --profile web add ./foo-0.3.1.tgz        # tarball (dev-loop recommendation, see §7)
dsh plugin --profile web list                       # list (pnpm verb)
dsh plugin --profile web remove <pkg>               # uninstall (also drops the bundle layer)
dsh plugin --profile web update <pkg>               # upgrade
dsh plugin --profile web why <pkg>                  # pnpm verb
dsh plugin --profile web install                    # reinstall from lockfile
```

Hard constraint from source: `--profile` is a **requiredOption** (`args.ts:192`), so
`dsh plugin add x` fails — there is a test asserting exit code 1 (`apps/cli/tests/args.spec.ts:116`).
`dsh plugin` also rejects `--profile desktop` (`args.ts:70`, `rejectElectronProfile`).

**The run path** — `apps/cli/src/plugin.ts:120-163` (`runPlugin`):

1. `resolveProfileDir(profile)`; if `package.json` is missing, `initProfile()` with the shipped template
   (`PROFILE_TEMPLATES`, `profile.ts:110-131`) or `DEFAULT_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base']`
   (`profile.ts:139`) (`plugin.ts:121-130`).
2. `spawnSync('pnpm', args, { cwd: profileDir, stdio: 'inherit' })` (`plugin.ts:134-138`).
   Relative specs (`.`, `../plugin`, `file:`/`link:` forms) are first anchored to the *invoking* cwd, so
   `add .` from a plugin checkout installs that checkout (`anchorPathSpec`, `plugin.ts:104-112`).
3. On exit 0, **`reconcilePlugins`** (`plugin.ts:59-91`) rewrites `dsh.profile.bundles`.

### 1.3 Where plugin packages are resolved from

Two anchors, in this order (`resolveBundleDir`, `profile.ts:751-762`):

1. the **dsh installation's own package.json** (`INSTALL_ANCHOR`) — so in-box bundles
   (`@deepseek-ai/dsh-base`, `dsh-web-app`, …) always come from the *running* installation;
2. the **profile directory's** `package.json` → `$DSH_HOME/profiles/<name>/node_modules`.

Plus a third, shared fallback for out-of-tree plugins: **`$DSH_HOME/profiles/node_modules`**, described at
`profile.ts:15-22`:

> Module resolution is two-anchor by construction … Plain Node uses symlinks for that shared fallback;
> packaged executables use ESM proxies so external plugins retain the installation's module instances.

The profile dir is initialized with `nodeLinker: hoisted` + `autoInstallPeers: false`
(`PROFILE_PNPM_WORKSPACE`, `profile.ts:155-160`) precisely so peers fall through to that shared
fallback and "every plugin shares the installation's single cordis instance".

**Measured on this machine — this is broken right now:**

```
host (running)                          @deepseek-ai/dsh              0.1.6-alpha.2   (npx tree)
$DSH_HOME/profiles/node_modules/…       @deepseek-ai/dsh-tools        0.1.5-rc.1      ← stale source checkout
    └ symlink → /Users/…/deepseek-harness-alpha/apps/cli/node_modules/…
$DSH_HOME/profiles/web (npm-installed)  dsh-better-sidebar            0.18.0-alpha.0
    └ resolves @deepseek-ai/dsh-tools  0.1.5-rc.1     @deepseek-ai/cordis 4.0.2
link-installed plugin (dsh-whale-report) resolves @deepseek-ai/dsh-tools 0.1.1-rc.2
                                                          @deepseek-ai/cordis 4.0.1
```

Three different DSH cohorts coexist in one running process. The fallback's `@deepseek-ai/*` symlinks are
dated Aug 28–Sep 10 and point into the rc.1 source checkout; `healProfilesModuleFallback`
(`profile.ts:552-565`) has the machinery to rewrite them for the current installation (alpha.2 still
exports it — `healProfilesModuleFallback` / `healIsolatedProfileModuleFallback` in
`dsh-app-boot/lib/index.js`) but it did **not** run for this boot. `$DSH_HOME/profiles/web/.dsh-module-fallback/node_modules/@deepseek-ai/`
is empty. **A plugin author cannot rely on the DSH peer a plugin imports matching the running host.**
(Flagged again in §9.)

### 1.4 Is there a marketplace / registry / index?

**No, not in DSH itself.** There is no registry client, no `dsh plugin search`, no index fetch anywhere in
the CLI or the plugin manager. All of it is npm + git + local paths.

What exists **around** DSH, all third-party and none official:

| Thing | URL | Status |
|---|---|---|
| `dsh-plugin` GitHub topic | github.com/topics/dsh-plugin | **Officially recommended** — the only discoverability hook DSH's own README names (`README.md:46`: "Add the `dsh-plugin` topic to your plugin repository for discoverability.") |
| awesome-dsh-plugin | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin | curated list + count badge site (`awesome-dsh-plugin.com`) |
| jqueryscript/awesome-dsh-plugins | https://github.com/jqueryscript/awesome-dsh-plugins | "verified, star-ranked" list |
| oh-my-dsh/dsh-plugin-registry | https://github.com/oh-my-dsh/dsh-plugin-registry | the "central registry" documented by the skill. **Its index is empty:** `{"schemaVersion":2,"contract":"dsh-plugin-registry/v2","source":"registry/entries","plugins":[]}` (fetched live) |
| majiayu000/dsh-plugin-registry | https://github.com/majiayu000/dsh-plugin-registry | another registry |
| dsh-market | https://github.com/dsh-market/dsh-market | **an in-GUI plugin market plugin** — `dsh plugin --profile web add dshmarket` |
| dsh-find-plugin | https://github.com/awesome-dsh-plugin/dsh-find-plugin | agent-driven plugin discovery |
| npm `@a_dove/dsh-plugin-registry`, `@99galaxy/dsh-plugin-market` | npm | unrelated third-party packages |

**Bottom line:** publish to npm (or push to GitHub) and add the `dsh-plugin` topic. Anything else is
optional coordination, not a gate.

### 1.5 Installed vs enabled — the exact rule

`reconcilePlugins` (`apps/cli/src/plugin.ts:59-91`):

- `exportsPatch(pkg)` returns true iff the **resolved** package's `package.json` has
  `dsh.bundle.patch !== undefined` (`plugin.ts:36-45`).
- A dependency that resolves to a `dsh.bundle` package and is not already in `dsh.profile.bundles` is
  **appended** → it becomes a layer → **enabled**.
- A dependency that no longer resolves to a bundle package (or was removed) is **spliced out** → disabled.
- A dependency with no `dsh.bundle` prints once to stderr (`plugin.ts:70-75`):
  `dsh: warning: <pkg> declares no dsh.bundle — installed as a plain dependency, not a profile layer (a later update that gains one activates it automatically)`
- Reconciliation is **by installed state, not by dependency diff** — so `dsh plugin update` on a package
  that *gained* `dsh.bundle` activates it (`plugin.ts:5-9`).

Then, at boot, a bundles entry whose package lacks `dsh.bundle` is a hard error
(`loadProfileDirectory`, `profile.ts:793-795`): `profile <n> bundle "<pkg>" declares no dsh.bundle in its package.json`.

**Two other ways to enable/disable, independent of install:**

1. **A row in the user's `cordis.patch.yml`** — either an `insert` of the plugin row (the pre-bundle
   channel) or a `disabled: true` override of a bundle's row id. `dsh-study`, `dsh-minecraft`,
   `dsh-whale-report` all ship an `insert`; `dsh-better-sidebar`'s own patch comment warns that leaving
   the old manual `insert` in the profile *and* switching to the bundle channel double-mounts.
2. **alpha.2 only:** `pluginManager.setPluginEnabled` / the Web sidebar **Plugins** page / the
   `plugin_manager` tool write a `disabled` override into the profile patch, and bundle switches rewrite
   `dsh.profile.bundles` (`dsh-plugin-manager/README.md`, and `PluginInfo`/`BundleInfo` in
   `dsh-plugin-manager/lib/types/types.d.ts`).

**Layer composition order** (later wins per row; a patch replaces a row's whole `config`, never deep-merges) —
`apps/cli/reference/README.md:9` and `apps/cli/src/profile-boot.ts:199-243`:

```
1. each bundle patch in dsh.profile.bundles order   (base first, then installed bundles in add order)
2. $DSH_HOME/profiles/<name>/cordis.patch.yml       (the profile's user layer)
3. $DSH_HOME/cordis.patch.yml                       (home-level, machine-local; outranks the profile layer)
4. each --patch <path> overlay, in argv order
```

Composition is literally
`composeEntries([bundlePatches, profile.patches, homePatches, overlays])`
(`profile-boot.ts:237`), a single `applyEntryPatches([], …, )` call — so `--dump-config` can never drift
from what boots.

---

## 2. `cordis.patch.yml` — what it is, schema, merge

### 2.1 Two different files share the name

| File | Role |
|---|---|
| `<plugin-package>/cordis.patch.yml` | the **bundle layer** the plugin ships; path declared in `package.json.dsh.bundle.patch` |
| `$DSH_HOME/profiles/<name>/cordis.patch.yml` | the **profile's user layer**; written by `dsh plugin` init, hot-reloadable |
| `$DSH_HOME/cordis.patch.yml` | the **home layer** (optional, machine-local preferences) |

`PROFILE_PATCH_FILENAME = 'cordis.patch.yml'` (`packages/boot/app-boot/src/profile.ts:45`).
The generated profile template is an empty top-level array with a comment header:

```yaml
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
[]
```
(`PROFILE_PATCH_TEMPLATE`, `profile.ts:144-148`)

### 2.2 Schema — it is not a bespoke DSH format

The file is parsed by **`@deepseek-ai/cordis-plugin-include`** (`vendor/include`, npm `1.0.7`) with
`entryListSchema = yaml.JSON_SCHEMA.extend(JsExpr)` — i.e. **JSON Schema plus a `!!js` scalar tag**
(`src/index.ts:9-25`). Hard rules from `src/index.ts:250-263`:

- the file must parse as YAML (or JSON), and
- **the top level must be an array**, else
  `ConfigFileError('validate', …, TypeError('config file must be a top-level array'))`.

Each element is a `PatchOptions` (`src/index.ts:145-156`):

```ts
export interface PatchOptions {
  id?: string
  insert?: EntryOptions[]
  name?: string
  config?: any
  group?: boolean | null
  disabled?: boolean | null
  inject?: any
  intercept?: any
  isolate?: any
  [key: string]: any      // ← any EntryOptions key is an override
}
```

Merge semantics — `applyEntryPatches`, `src/index.ts:58-128`:

| Patch shape | Behaviour |
|---|---|
| `{ insert: [rows], id?: <group> }` | with `id`: target **must exist** and **must be a group**, else warn+skip (`src/index.ts:82-92`); rows are appended to `target.config`. Without `id`: rows are appended to the **root** (`src/index.ts:94`) |
| `{ id, name?, <overrides> }` | target looked up by `id`; if `name` is given and ≠ the target's name → warn+skip (`116-119`); every other key is assigned onto the row, **replacing** the value (`121-124`) |
| missing `id` on a non-insert patch | warn + skip (`105-108`) |
| `id` not found | warn + skip (`110-114`) |

Two behaviours worth knowing:

- **Rows inserted by one patch are indexed immediately, so a later patch in the same or a later layer can
  target them** (`src/index.ts:96-101`) — this is what makes bundle-then-user override layering work.
- Every layer is `structuredClone`d before patching, so a config hot-reload can revert a removed patch
  (`src/index.ts:63` and the doc at `43-52`).

`EntryOptions` (the row type) comes from `@deepseek-ai/cordis-plugin-loader`; in practice the keys used in
real patches are `id`, `name`, `config`, `disabled`, `group`, `inject`.

### 2.3 The four real files, verbatim

**`dsh-whale-report/cordis.patch.yml`** — canonical minimal bundle layer:

```yaml
# dsh-whale-report bundle patch — 挂载「鲸鱼记事本」。
# 插件本体注入 tools + sessionQuery，两者都由默认 web profile 提供
# （sessionQuery = @deepseek-ai/dsh-session-query + sqlite 后端）。
# 零核心改动：卸载即从装配图摘除，报告数据只读、不改任何会话。

- insert:
    - id: whale-report-core
      name: 'dsh-whale-report'
```

**`dsh-minecraft/cordis.patch.yml`** — row `config` with a `!!js` expression (the one real use of the tag):

```yaml
- insert:
    - id: minecraft-core
      name: 'dsh-minecraft'
      config:
        host: 127.0.0.1
        port: 25575
        password: !!js process.env.MC_RCON_PASSWORD
```

**`dsh-better-sidebar-011/cordis.patch.yml`** — single row, plus the best in-the-wild explanation of the
bundle channel (its own comment names the CLI command and the reconciliation):

```yaml
# This file is the `dsh.bundle.patch` layer of the published npm package: when
# the plugin is installed through the official CLI —
#
#   dsh plugin --profile <name> add dsh-better-sidebar@<version>
#
# — the command reconciles `dsh.profile.bundles` against installed packages
# and, seeing this declaration, appends `dsh-better-sidebar` to the bundle
# stack. …
# If the profile still carries the old manual mount line in its own
# cordis.patch.yml, remove it before switching to the bundle channel to
# avoid double-mounting (two Node halves, two sidebars).
- insert:
    - id: better-sidebar
      name: 'dsh-better-sidebar'
```

**`dsh-study/cordis.patch.yml`**:

```yaml
- insert:
    - id: study-core
      name: 'dsh-study'
```

**Pattern: every one is a single root-level `insert` of exactly one row whose `name` equals `package.json.name`.**
Nothing else. A bundle that only *configures* an existing row (rather than inserting) would use
`- id: <existing-row-id>` + `config: {…}` instead — that is how `dsh-web-app` overrides `dsh-base` rows.

### 2.4 When it is required

- **Required for install-time activation.:** a package without `dsh.bundle.patch` still installs, but only
  as a plain dependency and never joins the layer stack (`plugin.ts:70-75`; official tutorial
  `docs/user/develop/basic/publish.md:64`).
- **Required by the loader for any name listed in `dsh.profile.bundles`** — a listed bundle without the
  declaration throws (`profile.ts:793-795`).
- **Not required** if the plugin is mounted by hand from the user's profile `cordis.patch.yml` — but then
  install is two manual edits instead of one command.

### 2.5 Writing one: the contract to satisfy

```yaml
# <pkg>/cordis.patch.yml — the bundle layer
- insert:
    - id: <stable-row-id>          # referenced by later layers; pick something namespaced
      name: '<exactly package.json "name">'   # Node resolves this as a bare module from the profile
      # optional, all EntryOptions keys are valid:
      # disabled: false
      # inject: ['tools']
      # config: { … }            # or  !!js <expr>
```

The `name` must be a **bare module specifier** so Node resolution finds the installed code — the official
tutorial calls this out explicitly (`publish.md:56`): "plugin rows reference the package by name instead of
a relative source path so Node resolution finds the installed code". Relative names resolve beside the
patch file, which is a common footgun for bundle layers.

---

## 3. Configuration surface for users

There is **no `dsh config` command.** Configuration has four doors, all file/Cordis based:

### 3.1 Door 1 — `cordis.patch.yml` (deployment config)

The row's `config:` object is validated by the plugin's exported **Schemastery** schema. This is *the*
deployment axis and the only one that works with no settings provider. Example — `dsh-minecraft`'s row
above. The generated `docs/config-catalog.md` is the authoritative index (it is generated from source by
`scripts/gen-config-catalog.ts` and verified by `pnpm run verify-config-catalog`, and it cross-checks the
runtime schemastery schema against the pasted declaration). Format per package:

```
## `@deepseek-ai/dsh-acp`
Requires: `agents` · `llm` · `sessionPersistence` · `sessions`
```ts config-catalog
export interface AcpConfig { … }
```
Source: [`packages/acp/acp/src/index.ts:75`](…)
```
`docs/config-catalog.md:1-16` explains the format; the `Requires:` line is the plugin's `inject` list.

### 3.2 Door 2 — `ctx.settings` (runtime-editable config; the right answer for a new plugin)

`@deepseek-ai/dsh-settings` is a **capability seam** (`docs/capability-seams.md`, row `ctx.settings`):
seam `settings`, implementation `settings-file`, consumers `api-settings-controller`, `llm-deepseek`,
`llm-pi-ai`. Provider mount (from the package README):

```yaml
- name: '@deepseek-ai/dsh-settings-file'
  config:
    path: /absolute/path/to/settings.yaml
```

The shipped file is **`$DSH_HOME/settings.yaml`** — it exists on this machine:

```yaml
ui-onboarding:
  welcomeNoticeVersion: 2026-08-13.1
permission:
  defaultPreset: danger-full-access
agent-default-model:
  provider: deepseek-official
  model: deepseek-flash
  reasoningEffort: high
llm-pi-ai:
  providers: {}

dsh-tui:
  easterEggs: gentle
```

API surface (from `packages/settings/settings/README.md`; namespace grammar
`^[a-z][a-z0-9-]*$`, duplicate registration fails):

```ts
ctx.settings.register('ui-theme', ThemeSchema, { base: config })  // → owner scope
scope.get()                        // deep-frozen resolved snapshot
scope.watch((next, prev) => …)     // after each committed change
scope.update({ density: 'compact' })            // deep-merge into the USER layer only
scope.replace({})                               // reset: re-inherit base + defaults
scope.mutate([{ op: 'set'|'unset', path }])     // ordered edits, for redacted callers
ctx.settings.describe({ redactSecrets: true })  // descriptors for a config UI
```

Layering: **schema defaults → registrant `base` (the composition entry config) → user document**.
Writes touch the user layer only. Events: `settings/updated(ns, next, prev, source)` and
`settings/document-updated(ns, revision)`. `role('secret')` keeps a field off every wire response.
`applies: 'restart'` marks a field only honored at next start.

The **packaged convenience** for a plugin that already has a `cordis.yml` config is
`ctx.settings.installSection(owner, ns, schema, entry, hooks)` — it registers the namespace with the
composition entry as `base`, and **degrades gracefully to the composition config when no settings
provider is mounted** (`docs/cookbook/adding-a-settings-card.md:20-45`).

**Real example — `dsh-better-sidebar-011/src/index.ts:476-501`** (a plugin with a live settings scope,
a revision-fenced write path, and feature gating driven from the setting):

```ts
ctx.inject(['settings'], (sctx) => {
  const ns: SettingsNamespace = settingsNamespace(SIDEBAR_PREFS_NS)
  const scope = sctx.settings.register(ns, PrefsSchema) as {
    get(): SidebarPrefs
    watch(callback: (next: SidebarPrefs, prev: SidebarPrefs) => void): () => void
  }
  const viewOf = (): { value?: unknown; revision?: number } => {
    const descriptor = sctx.settings.describe({ redactSecrets: true })
      .find(candidate => candidate.ns === ns)
    return descriptor === undefined
      ? { value: undefined, revision: undefined }
      : { value: descriptor.value, revision: descriptor.revision }
  }
  settingsFace = {
    get: viewOf,
    update: async (patch, expectedRevision) => {
      await sctx.settings.update(ns, patch, expectedRevision)   // revision-fenced write
      return viewOf()
    },
  }
  syncToolsGate(scope)
  scope.watch(() => { syncToolsGate(scope) })                   // setting → effect
})
```

Note the lazy-injection pattern (`ctx.inject(['settings'], …)` rather than `inject = [...]`) — that is how
you make settings **optional** so the plugin still boots without a provider. `dsh-whale-report/lib/index.js`
uses the same shape with an explicit "missing → graceful read-only degradation" comment.

### 3.3 Door 3 — GUI settings page

A plugin renders its own configuration on the Web settings page with **two halves in one package**, keyed
on the settings namespace (`docs/cookbook/adding-a-settings-card.md`):

- **Host half:** `ctx.settings.installSection(ctx, NS, Config, config, { validate, setSource, onChange })`.
- **Browser half:** exported as `./client`, declared via `dsh.client`, registering into the keyed slot
  `settings.plugin.item` under `key: <ns>`, reading/writing through `ctx.settingsScope`
  (`scope.set(field, v)` / `scope.unset(field)`).

`dsh.client` is the manifest key that matters. From `packages/util/package-manifest/src/types.ts:44-57`
(rc.1) / alpha.2 `types.d.ts:56-70`: `{ platform: 'web', inject?: string[], immediately?: boolean, external?: string[] }`.

> **Footgun found in the wild:** `dsh-whale-report/package.json` and `dsh-minecraft/package.json` both declare
> a **top-level `dshClient` key** *in addition to* `dsh.client`. Only `dsh.client` is read — the client
> scanner reads `pkg.dsh.client` (`packages/client/modules/src/index.ts:185-198`; the alpha.2 JS contains the
> literal `dsh.client` and the string `declares dsh.client but exports no "./client" bundle`). The
> `dshClient` key is dead config that survived a rename (the upgrade skill's `v0.1.1-rc.1.md` card
> documents that `dshClient` → `dsh.client` merge). **Do not copy it.**

### 3.4 Door 4 — env vars

There is a **layered `.env`** mechanism, not plugin-specific: `loadLayeredEnv(binName, cwd)`
(`packages/boot/app-boot/src/index.ts`; called from `apps/cli/src/bin.ts:35`). Layers, per
`apps/cli/reference/README.md:101`: the inherited environment, `$DSH_HOME/.credentials.yaml` (managed
document, never materialized into `process.env`), the invoking directory's `.env`, then `$DSH_HOME/.env`.
Only `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY` are additionally allowed in the home layer
(`HOME_LAYER_PROXY_NAMES`, `index.ts:126`); anything else declared there throws.

Plugins reach env vars two ways: `!!js process.env.X` in a row's `config` (the `dsh-minecraft` pattern), or
`ctx.shellEnv` for **model-visible** shell variables (declared keys only, effect-scoped, duplicate
ownership fails loudly — `packages/shell/shell-env/README.md`).

---

## 4. Packaging & publishing

### 4.1 `package.json` requirements, as actually read by the code

Only **three** things are load-bearing at install time:

1. `name` + `version` — `packageProxySource` **throws** if `version` is missing or empty:
   `installed package <p> must declare a non-empty version` (`profile.ts:364-366`).
2. `dsh.bundle.patch` — `exportsPatch` / `reconcilePlugins` (`apps/cli/src/plugin.ts:36-45`).
3. resolvable `main` (or `exports`) — `packageProxySource` throws
   `installed package <p> main entry is missing at <entry>` (`profile.ts:379`), and for client plugins
   `client-modules` throws `declares dsh.client but exports no "./client" bundle`
   (`packages/client/modules/src/index.ts:767`).

`exports` subpaths matter: `packageProxySource` (`profile.ts:382-397`) enumerates only
`.` and literal `./x` subpaths — **wildcard (`./*`) and trailing-slash subpaths are skipped**, and
`./package.json` is excluded. For a packaged (pkg) executable those subpaths become the ESM proxy's
export map, so a wildcard export silently disappears outside plain Node.

### 4.2 Scope / naming conventions

- **No enforced convention.** npm naming rules only. `dsh-study`, `dsh-minecraft`, `dsh-whale-report`,
  `dsh-better-sidebar` are all unscoped `dsh-*`. The community naming profile
  (`dsh-plugin-upgrade-skill/skills/plugin-write/references/naming-conventions.md`) accepts **unscoped
  `dsh-*` and scoped `@scope/dsh-*`**, and recommends a publisher prefix for collision resistance —
  but explicitly says official short names like `greet`/`metrics`/`hello` are valid, and that these are
  **warnings, not errors**.
- There is **no verified/official registry** and no reservation. `oh-my-dsh/dsh-plugin-registry` is a
  reviewed coordination service whose index is currently empty, explicitly "not an official DeepSeek
  Harness authority and not a global lock" (`registry-check.md:3-5`).
- ⚠️ **npm name collisions are real:** `dsh-minecraft` on npm is a *different* project (a Mineflayer bot),
  so the local `dsh-minecraft@0.2.0` repo cannot be published under its own name. Check
  `npm view <name>` before choosing.
- `engines.node`: real plugins declare `"node": "^22.19.0 || >=24.0.0"` (whale-report, minecraft, study)
  or `">=20"` (better-sidebar). **Nothing reads it** — it is npm-only metadata.

### 4.3 `files` / build output — what a published plugin actually ships

`dsh-whale-report` ships **two prebuilt tarballs in-repo**. `tar tzf dsh-whale-report-0.6.0.tgz` — 126
entries, and the non-`lib/` set is the whole story:

```
package/LICENSE
package/package.json
package/README.md
package/cordis.patch.yml          ← the bundle layer MUST be in `files`
package/assets/whale/{README.md,whale-angry.svg,whale-dazed.svg,whale-happy.svg,whale-hero.svg,whale-sleepy.svg}
package/lib/**.js + .js.map       (43 modules: index, client, core, tools, api, report, apply/*, verify/*, client/*)
package/lib/types/**.d.ts
```

So the publish contract is: **built `lib/` + `cordis.patch.yml` + `package.json` + assets**. It ships
`lib/**/*.js`, `lib/**/*.js.map`, `lib/types/**/*.d.ts` (no `.ts`), the patch file, and `assets`.

The built host half is plain Node ESM with relative imports only — no bundler needed:

```js
// dsh-whale-report/lib/index.js
import { whaleDomain } from "./state.js";
import { registerApiRoutes, registerAssetRoutes } from "./api.js";
…
export const name = "whale-report-core";
export const inject = ["tools", "sessionQuery", "storageDomain"];
export function apply(ctx) { … }
```

(`build`: `rm -rf lib && tsc -p tsconfig.build.json && tsdown`; tsdown only produces the client bundle.)

The **built client half is different**: it must be a **single classic script** that registers through
`window.__ModuleLoader__.load({ id, factory })`, pull React inside the factory via `require("react")`, and
be served from `/plugins/<pkg>/client.js` (`packages/client/modules/src/index.ts:238-241, 293`).
`dsh-whale-report/tsdown.config.ts` reproduces this with `banner`/`footer`/`intro` and
`format: "cjs"`, `external: ['react','react/jsx-runtime','react-dom','react-dom/client','cordis']`.
Output measured:

```js
// dsh-better-sidebar-011/lib/client.js
window.__ModuleLoader__.load({
	id: "dsh-better-sidebar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		…
```

The `id` **must equal `package.json.name`** — `client-modules` assembles the combo by package name. Any
top-level ESM `import` anywhere in the file breaks the whole multi-plugin `<script>` combo and takes every
plugin down (documented in `plugin-runtime-debug/SKILL.md`).

### 4.4 Peer dependencies on `@deepseek-ai/*` — what real plugins do

| Plugin | peer range style |
|---|---|
| `dsh-whale-report` | `"@deepseek-ai/dsh-tools": ">=0.1.1-rc.2 <0.2.0"` (wide), `"@deepseek-ai/cordis": "^4.0.1"`, devDeps pinned to the npm release line `0.1.1-rc.2` |
| `dsh-study` | `"^0.1.0-rc.6"` (caret on a prerelease) |
| `dsh-minecraft` | `"^0.1.0-rc.6"` |
| `dsh-better-sidebar` | `"^0.1.0-rc.6"` for 16 packages **plus stale names** |

The skill's `plugin-release/SKILL.md:30-35` codifies the mature pattern:

> devDependencies use the **npm release line** as the type baseline, so a public repository typechecks
> after `npm install` on any machine; peer ranges use a wide range (such as `<0.2.0`) to cover unpublished
> alphas/rcs.

⚠️ **All four plugins' peer ranges are currently unsatisfiable against the running host.** The npx tree
carries `@deepseek-ai/dsh-tools@0.1.6-alpha.2`; `^0.1.0-rc.6` and `>=0.1.1-rc.2 <0.2.0` both *do* admit
0.1.6-alpha.2 by semver (`0.1.6-alpha.2 > 0.1.0-rc.6`, `< 0.2.0`), so those are fine. But
`dsh-better-sidebar` peer-depends on **three packages that no longer exist anywhere**:
`@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-schema-form`, `@deepseek-ai/dsh-client-web-react`
(verified absent from both the rc.1 source tree and the alpha.2 npm tree), plus the unscoped `cordis`.
It works because nothing enforces peers at runtime — the profile is installed with `autoInstallPeers: false`
(`profile.ts:159`). **Do not copy that peer list.**

### 4.5 `dsh.*` manifest fields

rc.1 `packages/util/package-manifest/src/types.ts:8-24`:

```ts
export interface DshManifest {
  bundle?: DshBundleManifest              // { patch: string }
  profile?: DshProfileManifest            // { bundles?: string[]; patchReload?: 'live'|'startup' }
  client?: DshClientManifest
  configTrees?: DshConfigTreeDeclaration[]
  sessionFormatMigration?: DshSessionFormatMigrationManifest
  moduleFallback?: DshModuleFallbackManifest   // @internal, launcher-written
}
```

**alpha.2 changes this type materially** (see §5) — `DshPackageManifest` is new, `manifestVersion` and
`engines.dsh` are new, `configTrees`/`sessionFormatMigration`/`profile.patchReload` are gone from the
public type.

### 4.6 Publishable `package.json` template

Derived from the four real manifests + the source contracts in §4.1–4.5. Assumes a TypeScript package with
a host half and an optional Web client half.

```jsonc
{
  "name": "dsh-my-plugin",                 // or "@you/dsh-my-plugin" — see §4.2 on collisions
  "version": "0.1.0",
  "description": "One line — this is what the alpha.2 Plugins page shows on the card (BundleInfo.description).",
  "type": "module",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/you/dsh-my-plugin.git" },
  "homepage": "https://github.com/you/dsh-my-plugin",
  "keywords": ["deepseek", "dsh", "deepseek-harness", "cordis", "plugin"],

  // npm-only metadata; nothing in DSH reads it. Declare it anyway.
  "engines": { "node": "^22.19.0 || >=24.0.0" },

  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".":          { "types": "./lib/types/index.d.ts",        "default": "./lib/index.js" },
    // ONLY add "./client" if you ship a browser half — its absence is a hard error
    // once dsh.client is declared.
    "./client":   { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    // Literal subpaths only: wildcard "./*" exports are SKIPPED by the packaged-executable proxy.
    "./package.json": "./package.json"
  },

  // Every runtime file a relative import or the loader reaches, plus the patch itself.
  "files": [
    "lib/index.js",
    "lib/**/*.js",
    "lib/**/*.js.map",
    "lib/types/**/*.d.ts",
    "cordis.patch.yml"
  ],

  // The two install-relevant declarations.
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    // omit the whole "client" key when there is no browser half
    "client": { "platform": "web", "inject": [], "immediately": true }
    // "manifestVersion": 1      // NEW in 0.1.6-alpha.2; declared, not enforced (§5/§9)
  },
  // "engines": { "dsh": ">=0.1.5-rc.1 <0.2.0" }  // NEW in 0.1.6-alpha.2 under engines — NOT enforced (§5/§9)

  "dependencies": { "zod": "^4.0.0" },     // runtime deps the host does NOT provide

  // Peers = exactly the DSH packages you import. Never the ones that were removed.
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.2",
    "@deepseek-ai/dsh-tools": ">=0.1.5-rc.1 <0.2.0",
    "@deepseek-ai/dsh-session": ">=0.1.5-rc.1 <0.2.0",
    "@deepseek-ai/schemastery": "^3.18.1"
  },
  // Mirror every DSH peer as a pinned devDependency (the skill's "dual-compatibility pattern"):
  // the npm release line for typechecking, the target tag for runtime verification.
  "devDependencies": {
    "@deepseek-ai/dsh-tools": "0.1.5-rc.1",
    "@deepseek-ai/dsh-session": "0.1.5-rc.1",
    "@types/node": "^24.0.0",
    "tsdown": "^0.11.0",
    "typescript": "^5.6.3",
    "vitest": "^3.0.5"
  },

  "scripts": {
    "build": "rm -rf lib && tsc -p tsconfig.build.json && tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    // Only needed for `github:` installs — pnpm runs this after cloning (see §8).
    "prepare": "tsdown"
  }
}
```

Notes that are not obvious:

- `private: true` must **not** be set (the monorepo template has it; the skill explicitly warns not to copy it).
- `workspace:^` version ranges must **not** appear.
- `publishConfig.access: "public"` is set by `dsh-better-sidebar`; only relevant for scoped names.
- `prepare` is the git-install lifeline: `docs/user/develop/basic/publish.md:153-173` covers the whole
  trap (§8).

---

## 5. Version compatibility: `0.1.5-rc.1` vs `0.1.6-alpha.2`

Method: compared all 233 packages that exist in both trees by diffing
`packages/*/*/lib/types/index.d.ts` (rc.1, built in-tree) against
`@deepseek-ai/*/lib/types/index.d.ts` (npm). Ranked by changed lines:

| changed lines | package | rc.1 | alpha.2 |
|---|---|---|---|
| 261 | `dsh-client-ui-slots` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| 138 | `dsh-app-boot` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| 121 | `dsh-llm-deepseek` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| 85 | `dsh-permission-presets` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| 47 | `dsh-session` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| 39 | `dsh-util-values` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| 37 | `dsh-headless` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| 29 | `dsh-agent` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| 26 | `dsh-tools` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| 23 | `dsh-subagent` | 0.1.5-rc.1 | 0.1.6-alpha.2 |
| … 30 more with 4–22 lines | | | |

### 5.1 Compatibility table — what a plugin author must know

| # | Surface | rc.1 (`0.1.5-rc.1`) | alpha.2 (`0.1.6-alpha.2`) | Breaks a plugin? |
|---|---|---|---|---|
| 1 | **CLI shape** | `dsh --profile <n>`; `web` is a hardcoded subcommand (`args.ts:175`); `dsh <n>` is **not** accepted | `dsh <n>` expands to `--profile <n>` (`bin.js`, `expanded = first !== 'plugin' && !first.startsWith('-') ? ['--profile', ...argv] : argv`); a second profile selection throws `select a profile only once` | Docs/scripts only |
| 2 | **`dsh plugin` internals** | self-contained forwarder in `apps/cli/src/plugin.ts` | delegates to `@deepseek-ai/dsh-plugin-manager/operations` → `runPluginCommand`; same pnpm semantics + a profile write lock + `pendingBuilds` diagnostics | No |
| 3 | **HMR plugin package name** | `@deepseek-ai/cordis-plugin-hmr` (`packages/bundle/base/cordis.patch.yml:22`) | `@deepseek-ai/dsh-hmr` (`dsh-base/cordis.patch.yml:29`) | **YES** if your composition overrides the `hmr` row by `name`. `dsh-hmr/README.md:36`: *"Existing configurations replace the module name `@deepseek-ai/cordis-plugin-hmr` with `@deepseek-ai/dsh-hmr`"* (service key and `hmr/change`/`hmr/reload` unchanged) |
| 4 | **`agent/session-start` event** | emitted during agent creation (`dsh-agent` doc: "emits `session/created`, `agent/created`, `agent/session-start`, and the first prompt assembly") | **removed** — doc now reads "announces session creation, and awaits serial `agent/created` listeners before releasing queued work" | **YES** — a listener for `agent/session-start` silently never fires |
| 5 | **`DshManifest` type** | `@deepseek-ai/dsh-package-manifest` exports `DshManifest`, `DshBundleManifest`, `DshProfileManifest`, `DshClientManifest`, `DshConfigTreeDeclaration`, `DshSessionFormatMigrationManifest`, `ProfilePatchReload` | exports only `DshBundleManifest`, `DshClientManifest`, `DshEnginesManifest`, `DshManifest`, `DshPackageManifest`, `DshProfileManifest`. `configTrees`, `sessionFormatMigration`, `profile.patchReload` **gone** from the public type | **YES** for typecheck; `ProfileManifest` changed from an interface to `Partial<DshPackageManifest>` |
| 6 | **`DshManifest.manifestVersion`** | — | `manifestVersion?: 1` — "Manifest format version, independent of the npm package and Session format versions" | New field; **declared, never read** (grep for `manifestVersion` across alpha.2 `*/lib/*.js` → 0 hits) |
| 7 | **`engines.dsh`** | absent from the type | `DshEnginesManifest { dsh?: string; node?: string; npm?: string; [k: string]: string\|undefined }`, doc: *"Compatible DSH versions as a SemVer range, including an exact version"* / *"DSH compatibility is declarative until a reader enforces it"* | **New official-looking version pin — NOT enforced anywhere** (0 hits for `engines.dsh` in alpha.2 libs) |
| 8 | **Profile manifest** | `dsh.profile.patchReload` supported (`'live'\|'startup'`) and validated (`profile.ts:782-788`); `ProfileTemplate.patchReload` required | `patchReload` removed from `DshProfileManifest`; `ProfileTemplate` has **no** `patchReload`; `DEFAULT_PROFILE_PATCH_RELOAD` no longer exported | **YES** if you read/write `patchReload`; existing profiles keep working because the field is simply ignored |
| 9 | **Client slots** | `PropsRuntime` inlines the scope standard props; `SessionProvider` provided only for `ScopeOf<K> extends 'session'` | new `SlotFactoryMap`, `FactoryLocalSlotDef`, `SlotFactoryDef`, `SlotScopeTargetMap`, `ScopeStandardProps<S>`; `SessionProvider` now provided when scope is `'session'` **or `'session-maybe'`**; `SessionAreaProps.session?: …` is new | **YES** for any client plugin whose slot scope was `session-maybe` — the injected props shape changed |
| 10 | **Session reads** | `eventAt`, `snapshotEvents`, `eventsAfter` normal | all three marked **`@deprecated` — "new calls are prohibited"** (Agent Note `2026-09-09-deprecate-synchronous-session-event-reads`) | Deprecation, not a break yet |
| 11 | **`Session.create` / `fromRestore`** | 4 / 5 params | new trailing `projections?: readonly SessionMessageProjection[]`; new `SessionMessageProjection{,Context}` exports; throws when a seed event needs a missing interpreter | Additive |
| 12 | **`ctx.tools` pipeline** | pre-dispatch decisions `allow`/`deny`/`ask` | `allow`/`deny`/**`cancel`**/`ask`; new `ToolCall.schema?`, `ToolErrorInfo.reason?` | Additive; `cancel` is new semantics |
| 13 | **`ctx.permissionPresets`** | `Service`; `PermissionSelect` | `TypertRemoteService`; `PermissionCatalog`; new `AUTO_PRESET = 'auto'`; reserved names are now `custom` **and** `auto` | **YES** if you extend/consume `PermissionSelect` or use the name `auto` |
| 14 | **`app-boot` public API** | `DEFAULT_PROFILE_PATCH_RELOAD`, `watchUserPatches`, `assertEntriesLoaded`, `assertEntriesActivated` | removed; new `OPTIONAL_BUNDLES`, `createProfileResolutionGeneration`, `healIsolatedProfileModuleFallback`, `unlinkProfileModuleFallback`, `readProfilePatches`, `sanitizeProfile`, `readProfilePlugins`/`reconcileProfilePlugins`/`writeProfileBundles`, `reconcileProfilePatches`, `PluginPackages` | **YES** for anything importing those helpers |
| 15 | **New packages** | — | `dsh-plugin-manager`, `dsh-client-ui-plugin-manager`, `dsh-hmr`, `dsh-ptc-runtime`, `dsh-ptc-runtime-node`, `dsh-web-frontend`, `dsh-lazy-require`, `dsh-mcp-resources`, `dsh-office-to-pdf`, `dsh-workspace-changes`, `dsh-compaction-image-offload`, `dsh-api-terminal-controller`, `dsh-client-ui-{settings-unarchive-sessions,sidebar-browser,sidebar-terminal}` | Additive |
| 16 | **Removed before rc.1 already** | `dsh-client-runtime`, `dsh-client-schema-form`, `dsh-client-web-react`, `dsh-code-runtime`, `dsh-e2b`, `dsh-lsp*`, `dsh-storage-sqlite`, `dsh-subagent-{acp,claude-code,codex,dsh-sdk}`, `dsh-tool-lsp`, `dsh-tool-terminal`, `dsh-web-search-{exa,perplexity}` etc. (present in rc.1 *source* but not in the npm install closure) | absent | Not a version break, but **`dsh-better-sidebar`'s peers reference three of these** — copy nothing from it |

### 5.2 Version pins / capability checks in the four real plugins

Grep result — **there are none.** No plugin contains a `dsh --version` check, an `apiVersion`, a
`minVersion`, a semver comparison, or a capability probe. The only version signalling is:

- `peerDependencies` ranges (semver only, unenforced at runtime — `autoInstallPeers: false`);
- `engines.node` (npm only);
- README prose, e.g. `dsh-whale-report/README.md:266`:
  *"v0.6.1 的官方兼容基线是 DSH 0.1.1-rc.2（peer 范围 `>=0.1.1-rc.2 <0.2.0`；升级 dsh 后重启 web 实例即可，会话数据无需迁移）"*;
- a baked-in version constant in the client bundle for self-update chips (see §7.4 / §9).

The skill's `profile-dependency-management.md:95-118` ("Plugin version must be routed by DSH version") is
the strongest available guidance and it is a **process** answer, not a code one:

> The DSH client API is **forward-incompatible across rc.x → alpha.x**: a plugin built for the wrong DSH
> version does not degrade gracefully — it crashes at runtime with a symptom that looks unrelated to the
> plugin. **Symptom:** console `TypeError: useConversation is not a function` (or another missing slot
> seat) … **Fix**: pick the plugin version matching the DSH version. Put a one-glance version matrix at the
> top of the plugin README.

### 5.3 Guidance distilled from `dsh-plugin-upgrade-skill`

Corridors documented (`skills/plugin-upgrade/SKILL.md` reference table) cover
`0.1.1-rc.1 → 0.1.5-rc.2`. **There is no card for `0.1.5-rc.1 → 0.1.6-alpha.2`** — the newest corridor is
`v0.1.5-rc.2.md` (draft, 6 cards). The §5.1 table is therefore new information, not a restatement.

Migration discipline (from `plugin-upgrade/SKILL.md` Mode C and `plugin-write/references/version-adaptation.md`):

1. Run the **baseline first** in the repo's own dependency state and record pre-existing failures as an
   exemption list — the migration must not add or worsen them.
2. Build the corridor **in actual version order** (never by filename), read it fully, and compute the
   **final net state** — do not delete-and-re-add a field removed mid-corridor and restored at the target.
3. Scan the **seven touchpoint classes**: #1 source patch / monkey patch, #2 events, #3 services + Remote,
   #4 host filesystem (`DSH_HOME`/profiles), #5 UI/commands/tools registration, #6 custom channels
   (HTTP/WS/RPC auth), #7 subprocess/output ownership. Zero hits is a heuristic, not a clearance.
4. Keep the DSH cohort **exact and coherent** in `package.json` + lockfile; "a successful install with
   mixed old/new peers is not a migration."
5. Bump the **plugin's own** SemVer separately, and verify the packed filename *and* packed manifest carry it.
6. Validate in layers: dependency resolution → **enablement resolution** (the profile composition points at
   the expected package identity) → static (build/typecheck/tests) → runtime (cold start, entry `active`,
   no `pending` services) → behavior (one message → tool → response) → wrapper (exit codes, stderr).
7. `capability` cards are **suggestions only — never adopt them automatically.**

Alpha-era pragmatic patterns worth reusing:

- **Dual-compatibility pattern** (`publish-playbook.md:28-46`): devDependencies on the npm release line for
  a machine-independent typecheck, wide peer range for the alpha, and where a signature drifted keep the
  shape the *types* require while the runtime ignores it (worked example: `connection.rpc.handle`'s third
  argument, required by rc.2 types, ignored since 0.1.2-alpha.1). Only valid where the runtime *ignores*
  the extra argument; semantic changes must be migrated for real.
- **Unpublished-cohort install** (`publish-playbook.md:8-27`): clone the harness at the exact tag,
  `pnpm install && pnpm run build`, `pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/<ver>`, then
  pin with `file:` tarballs + `overrides` in the manifest.
- **Tarball, not `link:`/`file:`, for handing a build to someone** (`publish-playbook.md:140-164`, recipe
  R-07) — see §7.3.

---

## 6. Security, permissions, trust

### 6.1 The short answer

**There is no plugin trust prompt, no plugin capability declaration, no per-plugin sandbox, and no
per-plugin permission manifest.** Installing a plugin means installing arbitrary code that runs
**in-process, in the host, with the user's own privileges.**

Evidence:

- `docs/capability-seams.md` is a generated graph of *service seams* (`ctx.sandbox`, `ctx.fs`, `ctx.shell`,
  `ctx.approval`, …) — capability **wiring**, not capability **grants**. A plugin receives a seam by
  mounting a provider or injecting a service; nothing asks permission.
- `packages/core/scope/README.md:60`: *"The primitive routes trusted same-process plugins; **it is not a
  sandbox or an authority boundary**."*
- `packages/preset/agent-presets/README.md:12`: *"Treat every authored preset as **trusted configuration**
  because it grants the capabilities of the plugins it selects."*
- `packages/bundle/sdk-app/README.md:60` / `acp-app/README.md:62` / `sdk-minimal/README.md:95`: *"profile and
  per-launch patches are **trusted application composition**"* — a plugin can even corrupt the JSON-RPC
  stream by writing to stdout.
- `dsh-plugin-manager/README.md`: *"Profile changes persist across sessions, and **installed Host code
  executes in-process outside the workspace sandbox**."*
- The awesome list's own warning (https://github.com/awesome-dsh-plugin/awesome-dsh-plugin):
  *"Installing a plugin runs third-party code on your machine with your own permissions — it can read your
  files, use your credentials, and reach the network. **Tool approvals don't sandbox plugin code.**"*

### 6.2 The three gates that *do* exist (all outside-plugin)

1. **pnpm build-script allowlist.** pnpm ≥10/11 refuses to run a git dependency's `prepare` script until the
   user adds the exact key to the profile's `pnpm-workspace.yaml`:
   ```yaml
   allowBuilds:
     dsh-hello-plugin: true
   ```
   `docs/user/develop/basic/publish.md:164-173` states the semantics plainly: *"Treat that allowance as
   **permission to execute the package's code on your machine at install time**, outside any sandbox the
   agent runs under. Only allow packages whose source you trust, and pin a commit
   (`github:you/hello-plugin#<sha>`)."* The CLI prints this remedy itself — `apps/cli/src/plugin.ts:155-160`.

2. **The agent-facing `plugin_manager` tool needs an approval (alpha.2 only).**
   `dsh-plugin-manager/README.md`: *"Every tool action requires `danger-full-access` or approval for that
   call. Under lower sandbox modes, `ask` requests approval; `never`, rejection, cancellation, or an
   unavailable approval channel prevents execution. An approval leaves the session permission mode
   unchanged."* Approval comes from `ctx.approval` (`packages/interaction/user-approval`), which is
   **fail-closed** — a missing/throwing/non-conforming answerer becomes `unavailable`, and callers deny on
   anything but `allowed-once` (`docs/subsystems/approval.md:21,26`).
   ⚠️ The README also says the *service* "validates pending names; it does not verify conversation approval"
   for `approvedBuilds` — i.e. the tool can grant build-script permission on the user's behalf.

   **The CLI path (`dsh plugin …`) has no approval at all** — it is a plain pnpm forwarder run by a human.

3. **The model's own sandbox/approval mode**, which governs *tool calls the agent makes*, not *code the
   host loads*. `SandboxMode` is `read-only` / `workspace-write` / `danger-full-access` and, per
   `docs/subsystems/sandbox.md:11`, **governs filesystem effects only — network and process visibility are
   outside this vocabulary.** The shipped preset table (`dsh-base/cordis.patch.yml:240-248`) is
   `read-only+ask`, `workspace-write+ask`, `danger-full-access+never`.

### 6.3 `packages/guard` and `packages/sandbox`

| Package | What it is | Does a plugin declare anything? |
|---|---|---|
| `guard/repeat-tool-reminder` | advisory reminder when the model repeats an identical tool call; config = repeat counts (base enables 3/5/8) | No |
| `guard/timeout-policy` | cooperative per-tool-call time limits; **"the package has no configuration"**, enabled in the base bundle | No |
| `sandbox/sandbox` | the `ctx.sandbox` **seam**: `confine(argv, policy) → ConfinedArgv` or throws `SandboxUnavailableError` (`SANDBOX_UNAVAILABLE`). *"Silent unconfined passthrough is never legal for a confined policy."* | A plugin that spawns processes should call `ctx.sandbox.confine`; it declares nothing |
| `sandbox/sandbox-local` | the backend: Linux bwrap/Landlock, macOS Seatbelt, Windows ACL restricted token | — |
| `sandbox/sandbox-policy` | the single home for the deployment default mode + workspace root; both bash and fs read it so they cannot confine to different roots | — |
| `sandbox/sandbox-windows-acl` | the Windows backend | — |

A plugin does **not** request a mode; the deployment sets it, the user can switch it per session
(`ctx.permissionPresets`), and `ctx.approval` answers per-call escalations.

### 6.4 What a third-party plugin *should* declare / do (least privilege)

There is no enforcement, so this is author discipline — but it is what the shipped code actually does:

1. **Declare the narrowest `inject` list.** `inject` is the plugin's dependency declaration and is also
   what `docs/config-catalog.md` publishes as the `Requires:` line. `dsh-whale-report/lib/index.js`:
   `export const inject = ["tools", "sessionQuery", "storageDomain"]`.
2. **Use `ctx.inject([...], cb)` for optional capabilities, not `inject`**, so a missing service degrades
   instead of failing the boot. Whale-report's settings seam is the worked example ("缺失 → 优雅降级
   read-only，不阻塞插件树").
3. **Make every registration an effect with a disposer** — `ctx.effect(() => () => …)` — so unload/HMR
   actually cleans up. Skill rule (`plugin-write/SKILL.md:99`): *"Treat every registration as an effect …
   make plugin unload clean up every event listener, tool, timer, and other resource."*
4. **Do not mount shell/subprocess capability you don't need**, and if you do spawn, go through
   `ctx.sandbox`/`ctx.subprocess` rather than `child_process` directly.
5. **Never write outside your own storage domain.** Use `ctx.storageDomain` (as all four plugins do)
   instead of touching `$DSH_HOME` directly. If you must read the host filesystem, treat
   `DSH_HOME`/`profiles` as read-only.
6. **Fence your own HTTP routes.** `dsh-better-sidebar` does exactly this: a prefix route
   (`ctx.webServer.register({ kind: 'prefix', path: '/sidebar/api' })`) with an explicit `fence(req)` that
   answers `403 forbidden` — see `src/index.ts:503-517`. ⚠️ **A bare `ctx.webServer.register()` does not
   inherit the Web app's authentication** — only routes registered through `connection` do
   (`skills/plugin-release/references/profile-dependency-management.md:60`). This is the single most
   security-relevant undocumented trap for a plugin with a channel.
7. **Sanitize untrusted markup** before `dangerouslySetInnerHTML`
   (`skills/plugin-heavy-dep/SKILL.md:5`): strip `foreignObject`/`script`, all `on*`/`@*` attributes, and
   **all** `href`/`xlink:href`.
8. **Do not print to stdout** — the ACP/SDK profiles use stdout for JSON-RPC framing
   (`bundle/acp-app/README.md:62`).

---

## 7. Developer loop

### 7.1 Scripts that exist (from the four real repos)

| Repo | Scripts | Notes |
|---|---|---|
| `dsh-whale-report` | `build` = `rm -rf lib && tsc -p tsconfig.build.json && tsdown`; `typecheck`; `test` (vitest); `link-dsh` = `node scripts/link-dsh.mjs`; `report` | 314 unit tests across 28 files |
| `dsh-study` | `build` = `tsc -p tsconfig.build.json`; `typecheck`; `test` | no client half → no tsdown |
| `dsh-minecraft` | same as whale-report incl. `link-dsh` | |
| `dsh-better-sidebar` | `build`, `bundle` = `tsdown`, `watch` = `tsdown --watch`, `prepare` = `tsdown`, `prepublishOnly` = `pnpm build`, `typecheck`, `test` | ships shell/PS install scripts |

`scripts/link-dsh.mjs` (whale-report, ~90 lines) is the important dev tool. Its docstring:

> Link the installed DSH closure into this repo's node_modules so dev tools (tsc, vitest) can resolve
> `@deepseek-ai/dsh-*` and `cordis` — the same way a profile resolves them at runtime (healed
> `$DSH_HOME/profiles/node_modules`). … the active checkout (`~/.dsh/source/current`) is the only source.

It searches `$DSH_SOURCE/current` then `~/.dsh/source/current` for the checkout and links each
`@deepseek-ai/*` peer by matching manifest names. Note this is a **source-checkout** workflow; against the
npx install there is no such checkout, which is why the peer situation is messy (§1.3).

### 7.2 The loop, concretely

```sh
# (a) scaffold + build
pnpm install
pnpm link-dsh            # link the DSH peer closure for typecheck (source-checkout hosts only)
pnpm typecheck
pnpm test
pnpm build               # tsc → lib/ (host half), tsdown → lib/client.js (client half)

# (b) load into a running DSH — TWO options
#  b1. install the checkout as a link (source edits are the installed copy; no copy step)
dsh plugin --profile web add link:/abs/path/to/my-plugin     # or: dsh plugin --profile web add .
#  b2. install a packed artifact (recommended for realism — see 7.3)
npm pack && dsh plugin --profile web add ./my-plugin-0.1.0.tgz

# (c) verify composition without booting
dsh --profile web --dump-config | less        # your row + "# == <pkg>" layer comment
dsh --profile web --dump-default-config       # bundles only

# (d) boot and exercise
dsh web                                       # or: dsh --profile web
#    then one real  message → tool → response  flow

# (e) update
dsh plugin --profile web update my-plugin
# or remove + re-add for a tarball
dsh plugin --profile web remove my-plugin && dsh plugin --profile web add ./my-plugin-0.1.0.tgz
```

### 7.3 Reload semantics — this is where people lose hours

| Change | What is needed | Source of truth |
|---|---|---|
| `cordis.patch.yml` (profile or home layer), profile `patchReload: live` | applied live, transactionally; no restart | `apps/cli/reference/README.md:9,93` |
| `cordis.patch.yml`, `patchReload: startup` | restart | same |
| **Host-half code** (`lib/index.js`) | **full host restart** | `plugin-runtime-debug/SKILL.md`: *"Activation for a link-installed lib-only plugin: fully stop the host, restart `dsh web`, hard-refresh, then verify the loaded version marker."* |
| **Client-half code** (`lib/client.js`) | the bundle combo is assembled **once at boot** when the host is source-launched; hard refresh after a host restart | same |
| HMR of `src/` modules | opt in explicitly: `- id: hmr` / `config: { root: ["."] }`. Default shipped config is `root: []` and `ignored` includes `**/node_modules`, so an installed plugin's `lib/` is **not** watched | `dsh-hmr/README.md:33-46`, `dsh-base/cordis.patch.yml:28-33` |
| gui plugin toggle (alpha.2) | recomposes before the operation completes **when the profile has HMR**; otherwise a restart toast | `dsh-plugin-manager/README.md` |

⚠️ **`link:` installs and pnpm ≥11 `file:`/`link:` specs collide.** `publish-playbook.md:140-164`
(recipe R-07): a `link:`/`file:` specifier "is imported AS-IS by pnpm 11's default path handling and
collides with the symlink junction the profile already uses for link-installed plugins (two views of one
directory; edits leak both ways)", and `bundledDependencies` tarballs are **rejected** by the profile's
plugin pipeline. **The recipe is: ship a tarball, refresh by remove + re-add.**

### 7.4 Logs

- Install diagnostics: pnpm's own inherited stdout/stderr for the CLI (`stdio: 'inherit'`,
  `apps/cli/src/plugin.ts:135`). In alpha.2 the CLI also writes a log file and prints its path on failure:
  `dsh: pnpm failed; diagnostics: <logPath>` (`dsh/lib/plugin-DJ-rVHUS.js`). The **service** path keeps
  logs under `<profile>/.plugin-manager/logs` (`dsh-plugin-manager/README.md`).
- Loader warnings (`patch: entry <id> not found`, `patch insert: entry <id> is not a group`, …) go to the
  Cordis `loader` logger (`cordis-plugin-include/src/index.ts:268-270`) and are re-emitted during
  `--dump-config` on stderr (`apps/cli/reference/README.md:51`).
- The **Host boot manifest** (`window.__DSH_BOOT__`) advertises the client bundle entry — the release gate
  for Web plugins is to fetch that entry, prove registration and DOM mount, and assert no page errors;
  "a bare HTTP 200" is explicitly not enough (`plugin-upgrade/SKILL.md`, validation layer 4).

### 7.5 Version-constant trap (bites every plugin with an update chip)

`publish-playbook.md:106-127` + `profile-dependency-management.md:168-215`: a client bundle that inlines
`package.json.version` at build time will ship the **previous** version if you bump after building, and the
plugin then reports "update available" **to itself**. Hard-won gate:

```sh
VERSION_BUMPED=$(node -p "require('./package.json').version")
pnpm run build
grep -q "$VERSION_BUMPED" lib/client.js || { echo 'stale version constant in bundle'; exit 1; }
git commit -m "… (v$VERSION_BUMPED)" && git tag "v$VERSION_BUMPED"
```

The skill adds: a whole-bundle grep is insufficient (`0.3.1` also matches `0.3.1-rc.1`); extract the exact
constant the update check reads and require exact string equality.

---

## 8. Best install UX observed

### 8.1 What each README tells users to run

| Plugin | Command(s) | Quality |
|---|---|---|
| **dsh-whale-report** | `dsh plugin --profile web add "github:SenmuuuuW/dsh-whale-report"` + "restart dsh web"; separately documents `npm install dsh-whale-report@0.6.1` and warns it does **not** register as a plugin; states the compat baseline (`DSH 0.1.1-rc.2`, peer `>=0.1.1-rc.2 <0.2.0`) | **Best.** Two clearly-labelled tracks, an explicit "npm install doesn't register" warning, and a stated compatibility baseline with the restart requirement |
| **dsh-study** | `dsh plugin --profile web add "github:<your repo>/dsh-study"` + "restart dsh web" | Good but the repo is a **placeholder** (`<你的仓库>`) and the package is **not published to npm** |
| **dsh-minecraft** | `dsh plugin --profile web add link:~/…/dsh-minecraft` | **Bad.** A hand-written absolute path on the author's machine. Plus a genuinely valuable warning that `dependencies` and `dsh.profile.bundles` are two separate manifests, and the `disabled: true` patch recipe for pausing |
| **dsh-better-sidebar** | `curl -fsSL …/install.sh \| bash` / `irm …/install.ps1 \| iex`, then "hard-refresh" | **Most polished UX, most machinery.** Idempotent script that (1) pre-writes `allowBuilds` for node-pty/protobufjs, (2) pre-writes `minimumReleaseAgeExclude` to bypass pnpm 11's 24h quarantine, (3) runs `dsh plugin --profile web add dsh-better-sidebar`, (4) removes stale manual mount lines. Also documents plain `npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-better-sidebar`, a pinned-version form, `--restart`, `--dry-run`, and a rollback |

### 8.2 What makes install hard

1. **`--profile` is mandatory** — every README repeats it, and `dsh plugin add x` fails. There is no
   "current profile" default.
2. **Two manifests to keep in sync** — `dependencies` (install) and `dsh.profile.bundles` (load). The CLI
   reconciles them, but manual edits silently desync (`dsh-minecraft/README.md:64-67`). The pre-bundle
   channel (hand-writing an `insert` row) makes it three places (`profile-dependency-management.md:33-41`).
3. **pnpm ≥10/11 build-script blocking** — a git install of a TypeScript plugin fails on the first `add`
   unless the user allowlists `prepare`. `dsh` prints the fix; the user still has to retry. This is why
   `dsh-better-sidebar` pre-writes `allowBuilds` and why the official docs recommend publishing prebuilt.
4. **pnpm 11 `minimumReleaseAge`** — a version published under 24h ago is refused; better-sidebar pre-writes
   `minimumReleaseAgeExclude`. The first community publish will hit this.
5. **Host restart required for host-half changes** — the client half hot-reloads, the host half does not.
   Universal confusion source.
6. **Native deps** — `dsh-better-sidebar` pulls `node-pty`, `@univerjs/*`, `xlsx`, `ws`, `lightningcss`.
   That is why its peer list is stale and why its install script exists. The official note
   (`plugin-upgrade/references/v0.1.3-alpha.1.md`, A1-03): *"Windows install fails on the `fs-ext` native
   build without MSVC."*
7. **`github:` installs are mutable** — `pnpm` resolves the default-branch HEAD, and **caches that
   resolution**: a new upstream commit + `pnpm install` prints `Already up to date` with the old codeload
   commit in the lockfile (`profile-dependency-management.md:16-31`). Fix: `pnpm update <pkg>` in
   `$DSH_HOME/profiles/<name>`, then verify the 40-char commit in `pnpm-lock.yaml`.
8. **Docs' pinned tags must exist on every mirror** — `Could not resolve vN.N.N to a commit` because the
   sync script pushed branches but not tags (`profile-dependency-management.md:120-139`).
9. **Version routing is on the honor system** — nothing checks that a plugin matches the host version, and a
   mismatch crashes with an unrelated symptom (`useConversation is not a function`). `engines.dsh` now
   exists in alpha.2 but nothing reads it.
10. **Global-install footgun** — upgrading DSH itself from inside a DSH session destroys the running tree
    (`npm` removes the very package tree the session executes from); the host dies mid-install, and the
    interrupted install can leave `dsh` gone (`plugin-upgrade/SKILL.md`, "Global DSH host upgrades").

### 8.3 The UX a new plugin should copy

Whale-report's structure, plus better-sidebar's pnpm-11 pre-writes:

```markdown
## Install
Requires DSH `<x.y.z>` (peer `>=0.1.5-rc.1 <0.2.0`). Check with `dsh --version`.

    dsh plugin --profile web add <pkg-or-github-spec>@<pinned-version>
    # then restart the host (`dsh web`) — the host half does not hot-reload

Troubleshooting
| `Ignored build scripts` | pnpm ≥10 — run `pnpm approve-builds --all` in `$DSH_HOME/profiles/web`, or add
                            `allowBuilds: { <pkg>: true }` to that profile's `pnpm-workspace.yaml`, then re-run |
| version published <24h ago refused | pnpm 11 `minimumReleaseAge` — add `minimumReleaseAgeExclude: [<pkg>]` |
| nothing appears after restart | hard-refresh the browser (Cmd/Ctrl+Shift+R) |
```

---

## 9. Undocumented / fragile — read before building

**Verified-broken or verified-unenforced in the running host:**

1. **DSH peer-cohort skew (highest risk).** Measured on this machine: the host is `0.1.6-alpha.2`, the
   shared fallback `$DSH_HOME/profiles/node_modules/@deepseek-ai/*` is `0.1.5-rc.1` (symlinks into the rc.1
   source checkout, dated Aug 28–Sep 10), and a link-installed plugin resolves `0.1.1-rc.2` from its own
   pnpm store. A plugin installed via npm in the `web` profile therefore imports `@deepseek-ai/dsh-tools@0.1.5-rc.1`.
   `healProfilesModuleFallback` (`packages/boot/app-boot/src/profile.ts:552-565`) exists to keep this in
   sync and alpha.2 still ships it, but it did not run for this boot. **A plugin must not assume the
   `@deepseek-ai/*` module it imports is the running host's copy.** Practical consequence: prefer
   type-only imports of DSH packages, take runtime objects from `ctx`, and never `instanceof` a class
   imported from a `@deepseek-ai/*` package.
2. **`engines.dsh` and `dsh.manifestVersion` are declared but never read.** `@deepseek-ai/dsh-package-manifest`
   alpha.2 `lib/types/types.d.ts:21,28,37-46` defines them and documents `engines.dsh` as *"DSH compatibility
   is declarative until a reader enforces it"*. Grep for `engines.dsh` / `manifestVersion` across every
   alpha.2 `*/lib/*.js`: **0 hits.** Do not treat declaring it as protection.
3. **`dshClient` (top-level) is dead config.** Two of the four real plugins still declare it. Only
   `dsh.client` is read.
4. **`dsh-better-sidebar`'s `peerDependencies` reference three packages that no longer exist**
   (`dsh-client-runtime`, `dsh-client-schema-form`, `dsh-client-web-react`) plus the unscoped `cordis`.
   Unenforced because `autoInstallPeers: false`.
5. **No `0.1.5-rc.1 → 0.1.6-alpha.2` corridor exists** in `dsh-plugin-upgrade-skill`. The §5.1 table is
   derived from diffs, not from a curated card. `agent/session-start` removal and the `patchReload` /
   `PermissionSelect` / `ui-slots session-maybe` changes are **not documented anywhere I could find** —
   treat the §5.1 entries as first-hand findings that should be verified against the release notes before
   acting.

**Structural fragilities:**

6. **No plugin version gate anywhere.** A wrong plugin version crashes with an unrelated symptom; the only
   mitigation is a README matrix.
7. **The bundle channel and the manual `insert` channel can double-mount** the same plugin (two Node halves,
   two sidebars). Better-sidebar ships a cleanup step in its installer for exactly this.
8. **`--dump-config` proves only that a row exists.** It does not resolve the module fallback
   (`apps/cli/reference/README.md:51`), does not run app command-line providers, and never proves a client
   bundle registers. The release gate for a Web plugin needs a real boot.
9. **Any top-level ESM `import` in one client bundle takes down every plugin** — the host concatenates all
   client bundles into one classic `<script>` combo and the browser error names the *first* entry
   (`dsh-typert-registry`), not the culprit (`plugin-runtime-debug/SKILL.md`). Diagnose with
   `node --check` on each `lib/client.js`, or bisect the profile's `insert` rows.
10. **A bare `ctx.webServer.register()` inherits no authentication.** Only routes registered through
    `connection` do. A plugin HTTP route is therefore unauthenticated by default — better-sidebar hand-rolls
    a `fence()` returning 403.
11. **Wildcard `exports` subpaths are skipped** by the packaged-executable module proxy
    (`packages/boot/app-boot/src/profile.ts:382-397` enumerates only `.` and literal `./x`). Enumerate
    subpaths explicitly.
12. **`link:`/`file:` + pnpm 11 collide with the profile's own junction**; `bundledDependencies` tarballs are
    rejected. Use a tarball + remove/re-add.
13. **Global DSH upgrade from inside a DSH session is structurally fatal** — the session *is* the host
    process. Always upgrade from an external terminal with an exact pinned version.
14. **The CLI's `dsh plugin` path has no approval gate at all** — it is a human-run pnpm forwarder. Only the
    agent-facing `plugin_manager` tool is gated. Do not describe plugin installs as "approved".
15. **`ctx.settings` silently no-ops without a provider.** A plugin using it must handle the absent case
    (lazy `ctx.inject(['settings'], …)`), or use `installSection` which does.
16. **The only official discoverability hook is the GitHub `dsh-plugin` topic**; the community registries'
    indexes are empty or third-party. Budget for that: an npm publish plus a topic plus (optionally) a PR to
    an awesome list.

---

## 10. Runbook: publish a plugin and make it installable in one command

**Phase 0 — decide the identity.**
1. `npm view <candidate-name> version` (collisions are real: `dsh-minecraft` is taken).
2. Pick `dsh-<name>` or `@you/dsh-<name>`. Add the GitHub topic `dsh-plugin`.
3. Pin the exact DSH target you will test against; write the version matrix at the top of the README.

**Phase 1 — scaffold.**
4. `packages/`: `package.json` from §4.6, `tsconfig.json` + `tsconfig.build.json` (`main: lib/index.js`,
   `types: lib/types/index.d.ts`), `src/index.ts`, optional `src/client/index.tsx`,
   `cordis.patch.yml`, `README.md`, `tsdown.config.ts` if there is a client half, `vitest.config.ts`.
5. `cordis.patch.yml` = one root `insert` with `id: <ns>-core` and `name: '<exact package name>'` (§2.5).

**Phase 2 — implement to the target contract, not to memory.**
6. Read the target tag's `docs/config-catalog.md` entry for every service you inject, and the actual
   `lib/types/index.d.ts` of every DSH package you import. Take runtime services from `ctx`; keep DSH imports
   type-only where possible.
7. Config: export `interface Config` + `const Config: Schema<Config>`; add
   `ctx.settings.installSection(ctx, NS, Config, config, hooks)` so users can edit it at runtime.
8. Every registration is `ctx.effect(() => () => …)`. No `child_process` — use `ctx.subprocess` /
   `ctx.sandbox`. Any HTTP route: register through `connection` or fence it yourself.

**Phase 3 — validate.**
9. `pnpm install && pnpm typecheck && pnpm test && pnpm build`.
10. `tar tzf`/`npm pack` and inspect the artifact: `cordis.patch.yml` present, no `.ts` leftovers, `lib/`
    complete, every `files` glob actually matches something.
11. `npm pack` → `dsh plugin --profile compat add ./<name>-<ver>.tgz` into an **isolated profile**, then
    `dsh --profile compat --dump-config` (row present) and a real cold boot: entry `active`, no `pending`
    service, one message → tool → response. For a Web plugin also fetch the boot manifest's bundle entry
    and prove it registers and mounts with no page errors.

**Phase 4 — publish.**
12. Bump, **then** rebuild, then commit manifest + artifacts together; gate on the baked version constant
    (§7.5).
13. `pnpm publish --access public` (or `--tag next`/`alpha` for a prerelease; never move `latest`
    backwards).
14. Re-install once as a consumer from the registry and smoke-test.
15. `git tag v<version>` matching `package.json.version`; push tags to every mirror.
16. README: install command with a pinned version, the DSH compatibility matrix, the hard-refresh note, and
    a troubleshooting table (`Ignored build scripts`, `minimumReleaseAge`, version mismatch).
17. Optional: PR to an awesome list; optionally register in `oh-my-dsh/dsh-plugin-registry` (its index is
    currently empty, so a reviewed entry is cheap real estate).

**Phase 5 — keep it installable.**
18. Prefer prebuilt npm/tarball distribution over `github:` — it needs no `allowBuilds` permission and no
    `prepare` script.
19. Keep a `link:`/tarball dev track and a registry track; never mix pnpm/npm/bun.
20. Re-run phase 3 on every DSH minor/major boundary. Assume forward incompatibility across
    `rc.x → alpha.x` and `alpha.x → alpha.y`.
