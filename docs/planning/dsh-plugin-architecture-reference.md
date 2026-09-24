# DSH Backend Plugin Architecture — Code-Grounded Reference

**Source of truth:** `<dsh-checkout>`
**Version:** root `package.json` `"version": "0.1.5-rc.1"` (every workspace package carries the same version — verified by `grep -h '"version"' packages/*/*/package.json | sort -u` → one unique value)
**Vendored Cordis:** `vendor/cordis/package.json` → `@deepseek-ai/cordis@4.0.2`
**Schemastery:** `vendor/schemastery/package.json` → `@deepseek-ai/schemastery@3.18.2`
**Node:** `^22.19.0 || >=24.0.0` (root `package.json` `engines`)

Everything below is read from source. Where a claim comes from documentation rather than code, the doc is cited; where the doc and code disagree, code wins and the discrepancy is noted.

> **Note on `packages/examples`:** it exists but is **empty** (`ls -la packages/examples/` → only `.` and `..`). The real plugin examples in this checkout are `packages/extensions/tool-cordis`, `packages/extensions/cordis-host-runner`, `packages/guard/timeout-policy`, `packages/hooks/hooks-claude-code`, `packages/hooks/hooks-codex`, `packages/skill/skill-badge`, `packages/skill/skill-filesystem`. A complete *out-of-tree* plugin exists at `<local-checkout>/dsh-minecraft` (the `mc__show_sketch` author) and is used throughout as the third-party reference.

---

## 0. The one-paragraph model

A DSH plugin is a **TypeScript/JavaScript module** that exports a plugin shape. Cordis (the vendored plugin framework) loads the module, builds a **Fiber** for it, waits until every service named in `inject` exists, then calls `apply(ctx, config)`. Everything a plugin registers goes through `ctx` and is recorded as a reversible **effect**, so unloading the fiber unwinds the plugin completely (`docs/cordis-primer.md:9-13,43-45`). Distribution is a **bundle**: an npm package whose `package.json` declares `dsh.bundle.patch`, pointing at a `cordis.patch.yml` that inserts the plugin's rows into the user's profile (`docs/user/develop/basic/publish.md:13-16,35-64`).

---

## 1. Minimal plugin structure

### 1.1 The smallest possible plugin

`docs/user/develop/basic/index.md:17-29` states it verbatim: *"a plugin is a TypeScript module that exports an `apply` function … That is the complete configuration."*

```ts
// hello-plugin/src/my-plugin.ts — faithful to docs/user/develop/basic/index.md:35-44
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  console.log('[hello-plugin] plugin loaded!')
}
```

Loaded by an absolute path through a `--patch` overlay (`docs/user/develop/basic/index.md:46-64`):

```yaml
# scratch-plugin/cordis.yml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

> "The plugin path must be absolute. A patch file contributes configuration but does not change the profile directory from which the loader resolves module paths." — `docs/user/develop/basic/index.md:56`

### 1.2 The four accepted plugin shapes (real types)

`vendor/cordis/src/registry.ts:91-133`:

```ts
/** Supported plugin entrypoint shapes. */
export type Plugin<T = any> =
  | Plugin.Function<T>
  | Plugin.Constructor<T>
  | Plugin.Object<T>

export namespace Plugin {
  /** Shared metadata understood by the plugin registry and related tooling. */
  export interface Base<T = any> {
    /** Display name used for fiber diagnostics and logger names. */
    name?: string
    /** Standard-schema validator applied to config before the plugin starts. */
    Config?: StandardSchemaV1<any, T>
    /** Services the plugin requires; it only loads while all are available. */
    inject?: Inject
    /** Service name(s) the plugin provides (read by `Service` and by loaders). */
    provide?: string | string[]
    /** Service names whose intercept config the plugin declares it consumes. */
    intercept?: Dict<boolean>
  }

  /** Function plugin called with `(ctx, config)`. */
  export interface Function<T = any> extends Base<T> {
    (ctx: Context, config: T): any
  }

  /** Class plugin constructed with `(ctx, config)`. */
  export interface Constructor<T = any> extends Base<T> {
    new (ctx: Context, config: T): any
  }

  /** Object plugin with an `apply(ctx, config)` method. */
  export interface Object<T = any> extends Base<T> {
    apply(ctx: Context, config: T): any
  }
}
```

`Inject` — array form or per-service intercept-config object form (`vendor/cordis/src/registry.ts:12-19`):

```ts
export type Inject<M = Dict> = (keyof M)[] | { [K in keyof M]?: M[K] }
```

**Named namespace form is what the repository uses everywhere.** `docs/postmortem/0001-acp-default-export-drops-inject.md:29-30` calls it a *namespace plugin*: `name`, `inject`, `Config`, and `apply` as **separate named exports**, "as every other plugin in the repo does (`invariants`, `llm-deepseek`, `tool-bash`, `tui`, …)". Object form (`export default { name, inject, apply }`) and class form are documented at `docs/user/develop/basic/index.md:105-138`.

### 1.3 Class form and `provide`

Class form is for plugins that **provide a service** (`docs/user/develop/basic/index.md:123-136`, `docs/user/develop/framework/service.md:38-53`):

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MetricsService extends Service {
  static inject = ['llm']

  constructor(ctx: Context) {
    super(ctx, 'metrics')            // 'metrics' is the service name
  }

  record(event: string, value: number) { /* ... */ }
}
```

* `Service` is `vendor/cordis/src/service.ts:11`; its constructor (`:42-59`) calls `ctx.reflect.provide(name, self, check)` — so the service is **automatically unregistered when the owning fiber unloads**. Services with a `[Service.invoke]` body are made callable (e.g. `ctx.logger()`).
* Declaration merging types `ctx.metrics` (`docs/user/develop/framework/service.md:68-85`):

```ts
declare module '@deepseek-ai/cordis' {
  interface Context { metrics: MetricsService }
}
```

### 1.4 `package.json` contract — the `dsh` key

The authored manifest type is `DshManifest`, `packages/util/package-manifest/src/types.ts:7-24`:

```ts
/** The `dsh` property of an npm manifest; a package may declare several roles. */
export interface DshManifest {
  /** Bundle metadata consumed by the profile launcher. */
  bundle?: DshBundleManifest
  /** Profile metadata consumed by the profile launcher. */
  profile?: DshProfileManifest
  /** Client module loading and build metadata. */
  client?: DshClientManifest
  /** Config directories consumed by the experimental deployment-image packer. */
  configTrees?: DshConfigTreeDeclaration[]
  /** Adjacent Session migration metadata consumed by the workspace catalog generator. */
  sessionFormatMigration?: DshSessionFormatMigrationManifest
  /** Launcher-generated module proxy metadata, not an author configuration entry. @internal */
  moduleFallback?: DshModuleFallbackManifest
}
```

The two roles a plugin author cares about:

| Key | Interface | Meaning |
|---|---|---|
| `dsh.bundle.patch` | `DshBundleManifest` (`types.ts:26-30`) | Path to the `cordis.patch.yml` this package contributes |
| `dsh.client` | `DshClientManifest` (`types.ts:43-57`) | Browser half: `platform`, `inject`, `immediately`, `external` |
| `dsh.profile.bundles` | `DshProfileManifest` (`types.ts:32-38`) | Written by `dsh plugin`, not by hand |

`DshSessionFormatMigrationManifest` (`types.ts:69-90`) carries an explicit warning that it is **not** for external plugins:

> "The catalog generator discovers only `packages/session/session-format-vN-to-vN+1`, not external plugins." — `packages/util/package-manifest/src/types.ts:70-72`

`dsh.client.inject` is explicitly **not** Cordis injection (`types.ts:47`): *"Informational package-name dependencies, not Cordis service injection."*

### 1.5 Real third-party manifest (the ground truth)

`<local-checkout>/dsh-minecraft/package.json` (**abridged** — the real file also exports `./rcon`, `./sidebar`, `./sketch` and carries a legacy `dshClient` block plus `devDependencies`/`scripts`):

```json
{
  "name": "dsh-minecraft",
  "version": "0.2.0",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": [], "platform": "web" }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.6",
    "@deepseek-ai/schemastery": "^3.18.1"
  }
}
```

Its `cordis.patch.yml`:

```yaml
- insert:
    - id: minecraft-core
      name: 'dsh-minecraft'
      config:
        host: 127.0.0.1
        port: 25575
        password: !!js process.env.MC_RCON_PASSWORD
```

**Observations that generalize:**
* Package names are free-form; `dsh-<name>` is the de-facto convention (`dsh-minecraft`, the tutorial's `dsh-hello-plugin` at `publish.md:37`). The `@deepseek-ai/dsh-*` prefix is reserved for in-box packages.
* Third-party plugins use **`peerDependencies`** on `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery` — *not* `workspace:^` (that is the in-repo convention; see `packages/core/tools/package.json` `peerDependencies`).
* The patch row's `name` is the **package name**, so Node resolution finds the installed code (`publish.md:56`). `!!js` expressions are evaluated against the plugin context (`docs/cordis-primer.md:39`).
* The `id` is stable and mandatory in practice — `docs/cordis-tutorial/06-composition-and-hmr.md:59`: *"an entry without one gets a generated id on every read, so after any config-file edit it counts as removed-plus-added and remounts."*

### 1.6 In-repo package invariants (only if you contribute to the monorepo)

`docs/cookbook/adding-a-package.md:25` — enforced by `scripts/check-workspace-constraints.ts`:
`private: true`, `version` matching root, `type: module`, `main: "lib/index.js"`, `types: "lib/types/index.d.ts"`, `exports["."].types/default`, `@deepseek-ai/cordis` in **both** peerDependencies and devDependencies at the same range, every dsh peer dependency mirrored in devDependencies, `@deepseek-ai/schemastery` in `dependencies`, and a whitelisted `files` list. In-package relative imports use explicit `.ts` specifiers in source (`adding-a-package.md:27`).

---

## 2. Plugin lifecycle & context (`ctx`) API

### 2.1 Fiber state machine

`docs/user/develop/framework/index.md:9-24`:

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| State | Meaning |
|---|---|
| PENDING | Declared, but required dependencies are not ready |
| LOADING | Dependencies are ready and `apply` is running |
| ACTIVE | The plugin is running |
| FAILED | `apply` threw an error |
| UNLOADING | The plugin is unloading and disposing resources |
| DISPOSED | The plugin is fully unloaded |

**Dependency-driven loading** (`framework/index.md:26-38`): a plugin with `inject` waits until every required service exists; if a required service disappears the plugin unloads automatically and **reloads when the service returns**. A PENDING plugin prints nothing — it is a legal state, not an error (`docs/cordis-tutorial/06-composition-and-hmr.md:61-63`). Diagnosis snippet using `ctx.registry.values()` + `FiberState.PENDING` is at `06-composition-and-hmr.md:65-83`.

### 2.2 The `Context` type

`vendor/cordis/src/context.ts:16-33` — the public interface, augmented by every service package:

```ts
export interface Context {
  /** Isolation map: service name → scope label. Lookups for a name resolve within its label. */
  [symbols.isolate]: Dict<symbol>
  /** Intercept map: service name → config merged into that service's per-plugin config. */
  [symbols.intercept]: Dict
  /** The root context of the application (every child context shares it). @experimental */
  root: this
  /** Base URL used to resolve relative plugin/module specifiers, if the runtime sets one. */
  baseUrl?: string
  /** The event bus. Its methods are also mixed onto `ctx` (`ctx.on`, `ctx.emit`, ...). */
  events: EventsService
  /** The logging service. Call `ctx.logger(name)` for a named logger. */
  logger: LoggerService
  /** The reflection layer backing the context proxy (`ctx.get`, `ctx.provide`, ...). */
  reflect: ReflectService
  /** The plugin registry. Its methods are mixed onto `ctx` (`ctx.plugin`, `ctx.inject`). */
  registry: RegistryService
}
```

Note the only `@experimental` marker in the whole framework surface is on `Context.root` (`vendor/cordis/src/context.ts:21`, echoed in `docs/cordis-api/context.md:101`).

Child contexts (`vendor/cordis/src/context.ts:99-145`):
* `ctx.extend(meta)` — prototypal child carrying extra own properties.
* `ctx.isolate(name, label?)` — child with an independent service scope for `name` (`:121-125`).
* `ctx.intercept(name, config)` — child whose plugins see extra service config merged (`:139-145`, merge semantics in `service.ts:86-102`).

`docs/user/develop/framework/service.md:111-139` shows two `cordis-plugin-group` rows each isolating `shell` so `plugin-a` and `plugin-b` see different `Bash` instances.

### 2.3 Service access: `ctx.get` / `ctx.set` / `ctx.provide` / `ctx.accessor` / `ctx.mixin`

Verbatim from `vendor/cordis/src/reflect.ts:7-70`:

```ts
/**
 * Read a service from the store without the inject requirement.
 *
 * @param name — the service name.
 * @param strict — when `true` (default), only return implementations
 *   whose providing fiber is currently active.
 * @returns the service value, or `undefined` when not (yet) provided.
 */
get<K extends string & keyof this>(name: K, strict?: boolean): undefined | this[K]

/**
 * Overwrite a provided service's value.
 *
 * Only the fiber that provided the service may set it; setting an
 * unprovided name throws.
 */
set<K extends string & keyof this>(name: K, value: undefined | this[K]): void

/**
 * Register a service implementation owned by the current fiber.
 *
 * The service becomes visible to dependents in the same isolation scope
 * once the fiber is active; it is unregistered (waking dependents) when
 * the returned disposer runs or the fiber unloads. Throws if the name is
 * already provided in this scope or declared as an accessor.
 */
provide<K extends string & keyof this>(name: K, value: undefined | this[K]): () => void

/** Define a computed context property backed by get/set hooks. */
accessor(name: string, options: Omit<Property.Accessor, 'type'>): void

/** Expose selected members of a service directly on `ctx`. */
mixin<K extends string & keyof this>(name: K, mixins: (keyof this & keyof this[K])[] | Dict<string>): void
```

`ctx.on`, `ctx.emit`, `ctx.plugin`, `ctx.effect`, `ctx.get`, … are **mixins** forwarded to the backing services (`reflect.ts:218-220`: `this.mixin('reflect', [...]); this.mixin('fiber', ['runtime','effect'])`; the full inherited list is generated at `docs/cordis-api/inherited.md:12-21`).

**Critical distinction** — `ctx.<name>` (property) vs `ctx.get(name)`:
* Property access walks the fiber ancestor chain and **throws** `cannot get property "X" without inject` if `X` is not in your declared `inject` set.
* `ctx.get(name)` is the **topology-independent** lookup; it returns `undefined` for an absent/inactive service.
* The distinction bites through *shadow proxies*: `docs/postmortem/0001-acp-default-export-drops-inject.md:56-87` documents a real production crash where `this.ctx.sessionPersistence` inside a service method reached the root fiber and threw, while `this.ctx.get('sessionPersistence')` worked. The postmortem's rule (`:111`): *"For a service a plugin reads opportunistically but does NOT declare in `static inject`, use `ctx.get(name)`, never `ctx.<name>`."*

### 2.4 Effects, disposal, and cleanup

Everything registered through `ctx` is an effect and is undone on unload (`docs/user/develop/framework/index.md:40-63`). The framework tracks at minimum:

```
ctx.on(event, handler)                  — event listener
ctx.tools.register(tool)                — tool registration
ctx.llm.registerAdapter(names, adapter) — LLM adapter registration
ctx.effect(() => cleanup)               — custom resource
```

Disposal ordering (`framework/index.md:63`): *"disposer invocation starts in reverse registration order, but multiple async disposers run concurrently and have no serial completion guarantee. Put order-dependent cleanup in one disposer returned from a single `ctx.effect()` and await its steps serially there."*

Effect body shapes (`vendor/cordis/src/fiber.ts:70-93`):

```ts
export type Disposable<T = any> = () => T

export type Effect<T = any> = SyncEffect<T> | AsyncEffect<T>
type SyncEffect<T = any>  = Disposable<T> | Iterable<Disposable<T>, void, void>
type AsyncEffect<T = any> = Promise<Disposable<T>> | AsyncIterable<Disposable<T>, void, void>
```

`ctx.effect(execute, label?)` overloads at `vendor/cordis/src/fiber.ts:415-418`; it **throws `CordisError('INACTIVE_EFFECT')`** if the fiber is already disposed.

Explicit cleanup example (`docs/user/develop/basic/index.md:70-85`):

```ts
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => { console.log('heartbeat') }, 5000)
    return () => clearInterval(timer)   // runs when the plugin unloads
  })
}
```

`ctx.plugin()` / `ctx.inject()` (`vendor/cordis/src/registry.ts:164-187`):

```ts
/**
 * Run a callback once the requested services are available.
 * Shorthand for `ctx.plugin({ inject, apply: callback })`: the callback
 * is unloaded and re-run whenever a required service changes.
 */
inject(deps: Inject, callback: Plugin.Function<void>): Fiber & PromiseLike<Fiber>

/**
 * Load a plugin in the current context.
 * @returns the fiber; awaiting it settles once loading finished
 * (rejecting on config or startup errors).
 */
plugin<P extends Plugin>(plugin: P, ...args: Spread<GetPluginConfig<P>>): Fiber & PromiseLike<Fiber>
```

Child fiber + manual dispose (`docs/user/develop/framework/index.md:67-97`):

```ts
export function apply(ctx: Context) {
  ctx.plugin(childPlugin)     // child fiber, unloads with its parent
}

const fiber = ctx.plugin(myPlugin)
await fiber.dispose()          // registrations removed, children recursively unloaded, async cleanup awaited
```

**Optional-dependency pattern in real code** (`dsh-minecraft/src/index.ts:105-107`) — this is how to consume a service that may not be mounted:

```ts
ctx.inject(['webServer'], (c) => tryRegister(c as Context & { webServer?: unknown }))
ctx.inject(['httpServer'], (c) => tryRegister(c as Context & { httpServer?: unknown }))
```

### 2.5 Hot reload (HMR)

`docs/user/develop/framework/index.md:99-107`: with `@deepseek-ai/cordis-plugin-hmr` in the composition, editing a plugin source file triggers unload → reload → `apply` again. *"Because plugin registrations clean themselves up, hot replacement does not retain registrations from the old instance."* A **config edit** also hot-replaces the plugin (`docs/user/develop/basic/config.md:98-100`). The cookbook's mechanism map records: *"Plugin hot-reload | every registration is a `ctx.effect` → vendored HMR just works"* (`docs/cookbook/extension-cookbook.md:132`). HMR needs the `timer` service for debouncing and the console logger to be visible at all (`docs/cordis-tutorial/06-composition-and-hmr.md:42`).

---

## 3. Registering tools

### 3.1 The API

Confidence: **highest**. This is the most heavily documented surface — `docs/cookbook/adding-a-tool.md`, `docs/user/develop/basic/tool.md`, `docs/cordis-tutorial/07-into-the-harness.md`, `packages/core/tools/README.md`, and the generated `docs/tool-catalog.md`.

* Service: `ctx.tools` → `ToolRuntime extends Service` (`packages/core/tools/src/index.ts:780`).
* Method: `register(definition: ToolDefinition): () => void` (`packages/core/tools/src/index.ts:1027`).
* Typed helper: `defineTool` (`packages/core/tools/src/schema.ts:545`), re-exported from the package root (`packages/core/tools/src/index.ts:71-95`).

`register` — the annoted real body (`packages/core/tools/src/index.ts:1022-1051`):

```ts
/**
 * Register globally or in the calling agent scope. Scoped tools shadow
 * globals; duplicates within one layer and the reserved `run_code` name fail.
 * @param definition - tool schema, execution, and optional finalization/presentation callbacks.
 * @returns the exact disposer that unregisters the tool.
 */
register(definition: ToolDefinition): () => void {
  const name = definition.name
  const output = (definition as Partial<ToolDefinition>).output
  if (output === undefined || typeof output !== 'object'
    || typeof output.render !== 'function'
    || (output.presentationMeta !== undefined && typeof output.presentationMeta !== 'function')) {
    throw new TypeError(`tool "${name}" must declare output { schema, render, presentationMeta? }`)
  }
  assertSupportedJsonSchema(output.schema)
  const timeoutMs = definition.timeoutMs
  if (timeoutMs !== undefined
    && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new TypeError(`tool "${name}" timeoutMs must be a positive finite number`)
  }
  // Reserved unconditionally: any agent may select a code mode for itself,
  // so a name free to take under the deployment default would become a
  // collision the moment a preset mounted.
  if (name === RUN_CODE_NAME) {
    throw new Error(`tool name "${RUN_CODE_NAME}" is reserved for the PTC mode presentation transport and cannot be registered or shadowed`)
  }
  return this.layers.effect(
    this.ctx,
    layer => layer.tools.insert(name, definition),
    { label: 'tools.register()' },
  )
}
```

Note what `register` does **not** validate: there is no required-name-regex check and no length check beyond the non-empty assertion in `packages/core/tools/src/invariant.ts:27`. An invalid name reaches the provider and fails there. Registering is an effect — the returned disposer is `tools.register()`'s, and fiber disposal unregisters (`docs/cookbook/adding-a-tool.md:38`).

### 3.2 Minimal working tool (copy-pasteable)

`docs/user/develop/basic/tool.md:11-34`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

### 3.3 `defineTool` — the full option contract

`packages/core/tools/src/schema.ts:483-536`:

```ts
export interface DefineToolOptions<S extends ParameterSchemaSpec, O extends ValueSchemaSpec> {
  /** Tool name (must be unique). */
  readonly name: string
  /** Human-readable description sent to the model. */
  readonly description: string
  /** Per-property parameter schema compiled to an implicit open object root. */
  readonly parameters: S
  /** Canonical output schema plus pure Native and presentation projections. */
  readonly output: {
    /** Schema enforced against every successful body or policy-replaced value. */
    readonly schema: O
    /** Pure Native/model rendering of one validated canonical value. */
    render(args: InferArgs<S>, value: InferValue<NoInfer<O>>): ContentBlock[]
    /** Pure replayable presentation metadata for direct top-level calls. */
    presentationMeta?(args: InferArgs<S>, value: InferValue<NoInfer<O>>): JsonValue
  }
  /** Optional positive cooperative timeout budget in milliseconds. */
  readonly timeoutMs?: number
  /** Pure classifier for sibling overlap. */
  isConcurrencySafe?(args: InferArgs<S>): boolean
  /** Execute the tool after argument validation. */
  execute(args: InferArgs<S>, exec: ToolRunContext): Promise<InferValue<NoInfer<O>>>
  /** Optional last-mile content transform for every normalized outcome. */
  finalizeContent?(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined
  /** Pure pending-state presenter. */
  presentCall?(args: InferArgs<S>): ToolCallView | undefined
  /** Pure completed-state presenter. */
  presentResult?(args: InferArgs<S>, result: ToolResult): ToolResultView | undefined
}
```

`defineTool` implementation highlights (`packages/core/tools/src/schema.ts:545-617`): it compiles `parameters` and `output.schema` to JSON Schema (`:566-567`), validates model args before `execute` (`:585-589`, throwing `ToolArgsError`), and **soft-validates presenters** so replay of older logged args returns `undefined` instead of throwing (`:594-609`).

### 3.4 Schema language: **not zod, not typebox**

Tools use a **bespoke lossless-JSON DSL** (`packages/core/tools/src/schema.ts:11-107`). Node kinds: `string`, `number`, `integer`, `boolean`, `null`, `array`, `object` (with **mandatory** `additionalProperties: boolean`), author-only `json`, and exact-one `oneOf`. Annotations: `description`, `title`, `default`, `examples` (`:13-19`). The parameters map is *"an implicit open object root; requiredness remains a per-property `required: true` annotation"* (`:96-102`).

`packages/core/tools/README.md:48-50`:

> The unified schema DSL supports `string`, `number`, `integer`, `boolean`, `null`, `array`, `object`, author-only `json`, and exact-one `oneOf`; `InferValue` preserves exact types through 16 container levels before widening to `JsonValue`. **A raw JSON Schema (`JsonSchemaNode`) is the wire-level counterpart shared with subagents, workflows, and MCP.**

Raw JSON Schema is accepted directly by `ctx.tools.register()` (`docs/cookbook/extension-cookbook.md:9`): *"Raw JSON-Schema `ToolDefinition`s are also accepted by `ctx.tools.register()` directly (that is how MCP-sourced tools arrive); `defineTool` is the typed helper for first-party tools."*

`zod` is **not** used for tools. It is used only for storage-domain record schemas (`packages/storage/storage-domain/src/spec.ts:5,10`). Schemastery is used for plugin `Config` — the two validators are deliberately separate (`spec.ts:1-7`: *"Record schemas are zod … plugin `Config` stays schemastery."*).

### 3.5 Execution context: `ToolExecution` / `ToolRunContext`

`packages/core/tools/src/index.ts:372-414`:

```ts
export interface ToolExecution extends ToolExecutionInput {
  /** Root model-requested call, resolved for every root and nested execution. */
  readonly rootCallId: ToolCallId
  /** Registry-assigned identity shared with nested calls only as their opaque `parent` token. */
  readonly token: ToolExecutionToken
}

export interface ToolRunContext extends ToolExecution {
  /** Defer one context … until this tool's final result reaches the agent loop. */
  deferContext(context: UserMessage): void
  /** Mark a successful final result as terminal for the current agent turn. */
  concludeTurn(): void
}
```

Per `docs/cookbook/adding-a-tool.md:44`: `callId`, `name`, `arguments`, `agent`, `token`, the required caller-owned `signal`, and an optional `parent` token are **immutable** through dispatch. Only an around-dispatch `tools/execute` wrapper receives a mutable view and may replace/restore `exec.signal`.

`docs/cookbook/adding-a-tool.md:45` — **declare and return one canonical JSON value**: `output.schema` may have an object, array, scalar, or null root; `execute` returns only the inferred value; the registry snapshots it as lossless JSON, validates, freezes, and passes it to `output.render(args, value)`. *"Do not return content blocks from the body or make callers parse prose for ids and fields."*

Throwing or returning an invalid value ⇒ `isError` (`adding-a-tool.md:46`). Non-JSON-serializable data throws (`packages/core/tools/src/index.ts:703-712` in `Session.append`; the tool registry does the same materialization before policy — `adding-a-tool.md:44`).

### 3.6 Namespacing — where `mc__` comes from

**There is no automatic namespacing for plugin-registered tools.** `dsh-minecraft` simply names its tools by hand (`dsh-minecraft/src/tools.ts:49,208,242`):

```ts
export function registerMinecraftTools(ctx: ToolsHost, svc: MinecraftServices): void {
  ctx.tools.register(showSketchTool(svc));
  ctx.tools.register(listPlayersTool(svc));
  ctx.tools.register(clearSketchTool(svc));
}

function showSketchTool(svc: MinecraftServices): ToolDefinition {
  return defineTool({
    name: "mc__show_sketch",
    description: "Render an architectural sketch to the Minecraft sidebar …",
    ...
```

The only *convention* is the MCP driver's, which is a local helper, not registry behavior (`packages/mcp/mcp-client/src/tools.ts:100-118`):

```ts
/**
 * Derive the model-facing public name for one MCP tool.
 *
 * Deterministic pure function of `(serverName, rawName)`: the clean case is
 * `mcp__<serverName>__<rawName>` verbatim. When character replacement or
 * truncation to the DeepSeek function-name contract (64 chars,
 * `[A-Za-z0-9_-]`) changes the name, a 12-hex-char SHA-256 hash of the
 * identity is appended so distinct MCP identities never collapse into the
 * same public name.
 */
export function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}
```

Constants: `MAX_PUBLIC_NAME_LENGTH = 64`, `INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g` (`mcp-client/src/tools.ts:50,53`). **Practical rule for a plugin author: hand-namespace with `<slug>__<verb>` and stay within `[A-Za-z0-9_-]{1,64}`.** The registry will not enforce it; the provider will.

### 3.7 Tool schemas reach the model automatically

`packages/core/tools/README.md:30`: *"Registering a tool is enough to make it visible — the registry feeds its schemas into the system-prompt assembly automatically."* The wire shape is `ToolSchema` (`packages/llm/llm/src/types.ts:411-416`): `{ name, description, parameters }` — `output`, `execute`, `finalizeContent`, `timeoutMs`, and presentation callbacks **never leak onto the wire** (`packages/core/tools/README.md:107`).

Also note (`packages/core/tools/src/index.ts:243`): `schemas()` *"whitelists only name/description/parameters"*.

### 3.8 Policy / observation extension points (all real, all cited)

| Event | Mode | Declared at | Purpose |
|---|---|---|---|
| `tools/pre-execute` | waterfall | `packages/core/tools/src/index.ts:144` | extensible allow / deny / ask |
| `tools/execute` | waterfall | `:155` | around-dispatch: timeout, retry, metrics |
| `tools/post-execute` | waterfall | `:167` | accept / replace / block / attach context |
| `tools/ptc-dispatch-log` | waterfall | `:181` | rewrite the logged copy of a `run_code` sub-result |
| `tools/result` | emit | `:189` | observe the frozen final outcome |
| `tools/change` | emit | `:199` | available tool set changed |

Decision types (`packages/core/tools/src/index.ts:581-593`):

```ts
export type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string }

export type PostToolDecision =
  | { kind: 'accept'; content?: ContentBlock[]; value?: never; additionalContexts?: UserMessage[] }
  | { kind: 'accept'; value: JsonValue; content?: never; additionalContexts?: UserMessage[] }
  | { kind: 'block'; feedback: ContentBlock[]; additionalContexts?: UserMessage[] }
```

Monotonic guard (`packages/core/tools/src/index.ts:697-704`):

```ts
/**
 * A monotonic execution guard evaluated after every `tools/pre-execute`
 * listener: any guard may deny by returning a reason, and no guard can turn a
 * denial back into permission. `undefined` leaves it unchanged.
 */
export type ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined
```

Real guard-plugin example — the full `packages/guard/timeout-policy/src/index.ts:57-80`:

```ts
export const name = 'timeout-policy'
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next): Promise<ToolExecutionResult> => {
    const timeoutMs = ctx.tools.get(exec.name, exec.agent)?.timeoutMs
    if (timeoutMs === undefined) return next()

    using d = deadline(exec.signal, timeoutMs, TOOL_TIMEOUT)
    const upstream = exec.signal
    exec.signal = d.signal
    try {
      const result = await next()
      if (timeoutOf(d.signal, TOOL_TIMEOUT) !== undefined) return toolTimeoutResult(timeoutMs)
      return result
    } finally {
      exec.signal = upstream
    }
  })
}
```

Permission-gate example from the cookbook (`docs/cookbook/extension-cookbook.md:15-31`):

```ts
export const name = 'permission-gate'

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) {
      return { kind: 'deny', reason: 'Denied by policy.' }
    }
    return next()
  })
}
```

Selection rule (`docs/cookbook/extension-cookbook.md:33`): *"Use `ctx.tools.guard()` when an invariant needs a monotonic final denial, `tools/execute` when a plugin must wrap the dispatch lifetime (timeouts/retries/metrics; only `exec.signal` is replaceable), `tools/post-execute` for explicit result transformation, and `tools/result` for contained observation of the immutable final outcome."*

The registry's fixed pipeline (`packages/core/tools/README.md:107`): `tools/pre-execute` → registered monotonic guards → `tools/execute` → `tools/post-execute` → definition-owned `finalizeContent` → observe-only `tools/result`.

### 3.9 PTC mode is free

`docs/cookbook/adding-a-tool.md:63`: *"In PTC mode, every visible registered tool is available as `await tools.<name>(args)` without extra integration."* A tool must not design around prose parsing: *"its Native renderer may keep human prose such as `started background job bash-1`, but PTC mode must never parse that prose to recover the id"* (`adding-a-tool.md:53`).

### 3.10 Long-running tools

`docs/cookbook/adding-a-tool.md:53-55`: gate `run_in_background` with producer config, then register through `ctx.jobs.start({ kind, label, owner: exec.agent, run })`. *"Once `ctx.jobs.start()` publishes the id, use a task-owned cancellation signal rather than `exec.signal` … `job_kill`, owner disposal, and service teardown own that lifetime. Foreground work remains coupled to `exec.signal`."*

---

## 4. Registering / consuming skills

### 4.1 Layout, frontmatter, and identity

`docs/subsystems/skills.md:83-90`:

> Skill names are kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). The local provider accepts directory bundles (`<name>/SKILL.md`) and flat Markdown files (`<name>.md`). Nested recursive `**/SKILL.md` discovery is **not** supported.

Real `SKILL.md` (`.agents/skills/dsh-doc/SKILL.md:1-3`):

```markdown
---
name: dsh-doc
description: Create, restructure, review, audit, or migrate DeepSeek Harness Markdown documentation, …
---
```

Parsing rules (`packages/skill/skill-filesystem/src/index.ts`): invalid YAML / missing frontmatter / missing `name`+`description` are logged and **ignored** (`:803-813`); the invocation keys are exactly `disable-model-invocation` and `user-invocable` (`:993-997`), and legacy camelCase spellings are explicitly rejected (`:993-1006`). `whenToUse` is an optional string (`:830`).

Summary type (`packages/skill/skill/src/index.ts:57-104`, mirrored in `skills.md:106-124`):

```ts
interface SkillSummary {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly invocation: SkillInvocationPolicy
  readonly source: SkillSource
  readonly provider: string
  readonly resourceBase?: SkillResourceBase
}

interface SkillInvocationPolicy {
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}
```

### 4.2 Discovery roots (rank order)

`docs/subsystems/skills.md:66-77`:

| Rank | Source | Root |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |
| 600 | `bundled` | `Config.bundledSkillDir` when configured |

Project root = nearest ancestor containing `.git`; without one, the cwd (`skills.md:77`). Within one layer duplicates resolve by rank → provider order → local order; **a nearer scope layer wins a duplicate outright** (`skills.md:13`).

### 4.3 (a) Register a skill programmatically

Service: `ctx.skills` → `SkillRegistry extends Service` (`packages/skill/skill/src/index.ts:358`).

Two methods with exact signatures (`packages/skill/skill/src/index.ts:392,441`; also `docs/subsystems/skills.md:286,297`):

```ts
/**
 * Register a borrowed same-process provider synchronously during plugin
 * apply, into the calling context's layer …  Fiber disposal
 * unregisters the provider and invalidates catalog caches.
 * @returns the exact Cordis effect disposer that unregisters this provider
 */
registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void

/**
 * Register a borrowed readonly runtime skill into the calling context's
 * layer. Project entries outrank runtime entries, which outrank user
 * entries, within one layer. Same-name runtime entries in one layer are
 * first-wins; a duplicate logs a warning and receives a no-op disposer so
 * it cannot remove the winner.
 * @returns the exact Cordis effect disposer, preserving composite teardown order and invalidating caches.
 */
register(skill: SkillRegistration): () => void
```

`SkillRegistration` (`packages/skill/skill/src/index.ts:97-104`, and `skills.md:182-188`):

```ts
type SkillRegistration = Omit<SkillDefinition, 'invocation' | 'provider'> & {
  /** Invocation controls; omission permits both model and user surfaces. */
  readonly invocation?: SkillInvocationPolicy
  /** Provider label; omission uses the registry-owned runtime provider. */
  readonly provider?: string
}
```

So the minimum is:

```ts
ctx.skills.register({
  name: 'my-skill',
  description: 'What it does and when to use it.',
  content: 'Markdown instructions…',
  source: 'bundled',
})
```

**Note there is no `ctx.skills.register()` call site anywhere in the shipped repo** — only `registerProvider`. The method is the documented runtime-contribution path (`skills.md:178,288-297`).

### 4.4 (b) Ship your own skill files from a plugin

**Yes** — this is exactly what `packages/skill/skill-badge` does, and it is the cleanest template. Full source, `packages/skill/skill-badge/src/index.ts`:

```ts
const PROVIDER_NAME = 'dsh-badge'
const SKILL_BODY_URL = new URL('../assets/dsh-badge.md', import.meta.url)
const RESOURCE_BASE = {
  kind: 'directory',
  path: fileURLToPath(new URL('../assets/', import.meta.url)),
} as const
const INVOCATION = { modelInvocable: true, userInvocable: true } as const

const CANDIDATE: SkillCandidate = {
  name: 'dsh-badge',
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_SKILL_RANK,
  locator: SKILL_BODY_URL,
}

const provider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([CANDIDATE]),
  async get(_candidate): Promise<SkillDefinition> {
    return { name: …, description: …, invocation: …, provider: …, source: …, resourceBase: RESOURCE_BASE,
             content: await readFile(SKILL_BODY_URL, 'utf8') }
  },
}

/** Cordis plugin name. */
export const name = 'skill-badge'
/** Service required by the bundled provider. */
export const inject = ['skills']

/** Register the bundled `dsh-badge` provider on `ctx.skills`. */
export function apply(ctx: Context): void {
  ctx.skills.registerProvider(() => provider)
}
```

The three interfaces you implement (`packages/skill/skill/src/index.ts`; full text at `skills.md:31-51`):

```ts
interface SkillProvider {
  readonly name: string
  readonly list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[] | SkillProviderObservation>
  readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) => Promise<SkillDefinition | undefined>
}

interface SkillProviderControl {
  readonly signal: AbortSignal
  readonly invalidate: () => void
}
```

`list()` may return a plain array (complete-discovery shorthand) or `{ candidates, complete }` when discovery was partial (`skills.md:17,19-27`).

### 4.5 (c) Consume / reference an existing installed skill

Read APIs (`packages/skill/skill/src/index.ts:472,483,502` → generated signatures at `skills.md:299-327`):

```ts
async list(options: SkillViewOptions = {}): Promise<SkillSummary[]>
async snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot>
async get(name: string, options: SkillViewOptions = {}): Promise<SkillDefinition | undefined>
```

`SkillViewOptions` = `{ cwd?, signal?, scope? }` (`skills.md:213-216`). **Full definitions are not cached** — each `get()` calls the winning provider, so the local provider rereads the body (`skills.md:194`). `ctx.skills.get()` is described as the **trusted caller** path that ignores invocation policy (`skills.md:126`: *"setting both fields to `false` keeps the skill available only through trusted `ctx.skills.get()` callers"*).

Invalidation event (`packages/skill/skill/src/index.ts:298`, `skills.md:338-351`):

```ts
/**
 * A skill provider, runtime contribution, or provider-backed catalog may have
 * changed. This is an unfiltered invalidation notification; consumers refetch
 * the catalog for their own lookup options. Listener failures are contained and
 * cannot veto the registry mutation.
 * @mode emit
 */
'skills/change'(): void
```

It carries no diff — `ctx.on('skills/change', …)` then re-call `snapshot()` (`skills.md:15`).

### 4.6 How skills actually reach the model

`docs/subsystems/skills.md:229-235`: `dsh-tool-skill` injects a durable user-role `<system-reminder>` at the first `agent/pre-step` of a session observing a non-empty complete view; the catalog contains only sorted `name` and XML-escaped `description`. On change it appends a durable full replacement via `agent.inject()`. The model-facing `skill({ name })` tool returns `<skill_content name="...">`, `<skill_resources>`, `<skill_instructions>`.

**Consequence:** if your plugin only registers a provider, nothing appears in the prompt unless a skills consumer (`dsh-tool-skill` or the browser `SessionSkillCatalog`) is mounted. The registry is a catalog, not a prompt injector.

---

## 5. Persistence / storage

### 5.1 Architecture: hub + backends + data forms

`docs/subsystems/storage.md:5-14`:

> It is one optional capability, not part of the agent-loop spine, split as a capability seam: the hub and Service Definition (`dsh-storage`, `ctx.storage`), the Service Providers (`dsh-storage-json`, registered as `json`, and `dsh-storage-sqlite`, registered as `sqlite`), and the Consumer data form (`dsh-storage-domain`, `ctx.storageDomain`, also reachable as `ctx.storage.domain`) — the backend contract's only Consumer and the typed API everything else uses. **The hub performs no IO itself: backends own media, data forms own semantics, and product packages never touch backends directly.**

```ts
/** Data forms mountable on the hub, keyed by form name. Form owners extend this map via declaration merging. */
interface StorageForms {}
```

`ctx.storage.mount(form, facility)` / `ctx.storage.form(form)` (`packages/storage/storage/src/index.ts`, generated at `storage.md:170-190`). A second mount of the same key throws `duplicate-mount`; `form()` throws `form-not-mounted` until the owner loads.

Backend contract (`docs/subsystems/storage.md:43-55`):

```ts
interface StorageBackend {
  /** Key-value operations; absent when this backend cannot serve them. */
  readonly kv?: KvFacet
  /** Drain in-flight writes across all open units and release the medium. Idempotent. */
  close(): Promise<void>
}
```

**Only `kv` exists today** (`storage.md:52`: *"`kv` is the only shipped group"*). A plugin never talks to a backend; it talks to the **domain facility**.

### 5.2 What a third-party plugin should use: `ctx.storageDomain`

Domain spec (`docs/subsystems/storage.md:96-119`):

```ts
interface DomainSpec {
  readonly name: string                              // UNIT_NAME_RE; doubles as the backend unit name
  readonly version: number                           // current domain format version
  readonly layout?: 'single' | 'per-record'          // default 'single'
  readonly compatibleVersions?: readonly number[]
  readonly invalidRecords?: 'backup-and-skip'
  readonly global?: DomainGlobalSpec<unknown>
  readonly tables: Record<string, DomainTableSpec>
}
```

Declared once by the owning package via `defineDomain(spec)` (`packages/storage/storage-domain/src/spec.ts:107`) with `domainTable<K, V>(schema)` (`spec.ts:91`). **Record schemas are zod** (`spec.ts:10`) — deliberately different from plugin `Config` schemas, which stay schemastery (`spec.ts:1-7`).

Open it (`packages/storage/storage-domain/src/index.ts:69` `class DomainFacility`; generated signature `storage.md:196-235`):

```ts
async open<S extends DomainSpec>(spec: S): Promise<Domain<S>>
get(name: string): DomainImpl | undefined
async closeAll(): Promise<void>
```

Routing is the domain plugin's config, never the hub's (`packages/storage/storage-domain/src/index.ts:48-62`):

```ts
export interface Config {
  /** Default backend name for every domain without an explicit route. Required: there is no universally correct medium. */
  backend: string
  /** Per-domain overrides: domain name → backend name. */
  routes?: Record<string, string>
}
export const Config: z<Config> = z.object({
  backend: z.string().required(),
  routes: z.dict(z.string()).default({}),
})
```

Route resolution is at `index.ts:109`: `const backendName = this.config.routes?.[spec.name] ?? this.config.backend`.

`open()` runs a strict sequence, each step failing the whole call (`storage.md:132-136`): reject `already-open` → resolve route (`backend-not-found`) → require the `kv` facet (`facet-unsupported`) → open the unit (`version-mismatch` / `malformed-medium`) → validate every stored record and global against the spec's zod schemas (`invalid-record` with offending table and key).

**Lifecycle ownership is explicit** (`storage.md:134-136`): *"the CALLER owns the returned handle and closes it via `Domain.close()` (typically as its own `ctx.effect` disposer) — the facility does not tie the domain to any consumer fiber."*

Read/write semantics (`storage.md:118-125`):

> Reads are synchronous from authoritative in-memory state: `KvTable` exposes `get`/`entries`/`keys`/`size` … Every write — `put`, `delete`, `update`, `global.set` — queues on one per-domain chain and reaches backend durability first, then mutates memory, then emits `domain/changed`; a rejected backend write leaves memory untouched, so reads never diverge from the medium. `update(key, fn)` is an atomic read-modify-write at its chain slot (a missing key rejects `missing-key`) … **Returned records are the stored objects themselves, not copies — replace via `put`/`update`, never mutate in place.**

Change event (`packages/storage/storage-domain/src/events.ts:46`; `storage.md:344-351`):

```ts
'domain/changed'(change: DomainChanged): void   // emit; after durability; per-domain write-chain order
```

It is a notification, not a transaction participant — a throwing listener is contained with a logged warning (`storage.md:138`). In-process only.

### 5.3 Where data lives on disk

The backends own media. From `docs/subsystems/storage.md:57-58`: *"The json backend republishes one whole human-readable file per unit atomically; the sqlite backend stores one document per row in one database for frequently updated data."* Unit + table names must match `UNIT_NAME_RE` (safe as a file name **and** as a SQL identifier segment); *"record keys are arbitrary strings that never reach file paths"* (`storage.md:56`).

**Session logs are a separate seam.** `docs/subsystems/storage.md:5`: *"The storage subsystem persists everything that is not a session event log (session logs have their own seam — persistence.md)."* Session location rules (`docs/architecture.md:119`): JSONL v0 uses `session.jsonl[.zstd]`, v1+ use lowercase `session.vN.jsonl[.zstd]`, committed generation paths are never renamed/replaced/deleted.

### 5.4 Schema / versioning expectations

* **Your domain spec's `version` is yours to bump.** A `single` medium stamped with a different version rejects `version-mismatch`; a `per-record` document stamped outside the accepted set reads as absent (`storage.md:56`). `compatibleVersions` is the migration-free escape hatch — *"Older domain versions whose stored records the current record schemas also accept (the declaring owner vouches for that)"* (`storage.md:100-110`).
* **`invalidRecords: 'backup-and-skip'`** for disposable derived data; the default rejects the whole open (`storage.md:112-118`).
* A global schema that accepts `null` throws at `defineDomain` — `null` is the medium's "never written" sentinel (`storage.md:120`).
* **Authored Session-format migrations are in-box only.** `packages/util/package-manifest/src/types.ts:69-72`: *"The catalog generator discovers only `packages/session/session-format-vN-to-vN+1`, not external plugins."* The tutorial `docs/cookbook/adding-a-session-format-version.md` is for repository packages.

### 5.5 ⚠️ The big one: a third-party plugin must NOT invent a durable session event

Three independent code facts combine:

1. `SessionEventMap` is a merge-extensible interface — plugins *can* augment it. Real in-repo examples: `packages/interaction/user-approval/src/types.ts:33` (`declare module '@deepseek-ai/dsh-session/types' { interface SessionEventMap { 'approval/asked': … } }`) and `packages/hooks/hook-protocol/src/types.ts:8`.
2. But the persistence **read path** validates against a hardcoded, generated allowlist (`packages/session/session-persistence/src/storage-contract.ts:71-84`):

```ts
for (const event of events) {
  if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable !== true) {
    throw unsupported(
      `session "${meta.id}" contains event type "${event.type}" (seq ${event.seq}) unknown to this harness and not marked ignorable; refusing to interpret the log — it was likely written by a newer harness`,
      location,
    )
  }
```

3. The allowlist is generated from *this repository's* `SessionEventMap` members, and its own JSDoc says external events are outside it by construction (`packages/core/session/src/known-event-types.ts:12-20`). **And `Session.append()` cannot set `ignorable`** — the envelope is built as `{ type, seq, time, data, ...surfaceMetadata }` with no `ignorable` field (`packages/core/session/src/index.ts:724-729`); `ignorable` is only tolerated when *adopting* an event (`packages/core/session/src/index.ts:211-212,225`; persisted contract at `packages/core/session/src/types.ts:476-484`).

**Therefore:** an out-of-tree plugin that appends a new session event type produces a log the shipped harness will refuse to reopen. The architecture table row *"Add durable session state | extend `SessionEventMap`; render and replay from the log"* (`docs/architecture.md:153`) applies to in-repo packages where `KNOWN_SESSION_EVENT_TYPES` is regenerated. **A third-party plugin's durable state belongs in `ctx.storageDomain`.**

`Session.append` itself, for consumers only (`packages/core/session/src/index.ts:703`):

```ts
append<T extends SessionEventType>(
  type: T,
  data: SessionEventMap[T],
  ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent<T>] : []
): SessionEvent<T>
```

It throws unless `data` is losslessly JSON-serializable (no BigInt, function, symbol, undefined, −0, non-finite, circular, sparse array, Map/Set/Date/class instance) — `packages/core/session/src/index.ts:690-700`.

---

## 6. Config & settings

### 6.1 Declaring config: schemastery, exported as a **value** named `Config`

`docs/user/develop/basic/config.md:11-32` (the canonical example) and `docs/cookbook/adding-a-settings-card.md:23-31`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // User value or schema default.
}
```

Hard requirement (`docs/user/develop/basic/config.md:45`):

> **Do not export a plain object as `Config`; it does not implement the Standard Schema interface required by Cordis.**

That matches the type: `Config?: StandardSchemaV1<any, T>` (`vendor/cordis/src/registry.ts:104`) from `@standard-schema/spec` (imported at `registry.ts:3`). Schemastery's `Schema` satisfies it.

Validation timing (`docs/user/develop/basic/config.md:74`): *"The schema runs while the plugin loads. Invalid configuration fails the load with an actionable error."* Config is resolved after injections activate (`vendor/cordis/src/fiber.ts:50-53` `resolveConfig`, and `docs/cordis-primer.md:39`).

A real in-tree instance of the same pattern is `packages/guard/timeout-policy` — actually a **config-free** plugin (`export const inject = ['tools']`, no `Config`). A real config-bearing one with richer schema: `dsh-minecraft/src/index.ts:29-51` uses `z.union([z.const("auto"), …])`, nested `z.object({...}).default({...})`, and `z.string().default("")` — a useful demonstration that defaults can be nested objects.

### 6.2 How the user sets it

**Primary mechanism: the `config:` block on the plugin's row in a patch file.** `docs/user/develop/basic/config.md:34-43`:

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

**Layer order** — authoritative, `apps/cli/reference/README.md:9` and `docs/architecture.md:27`; the tutorial's four-step version is `docs/user/develop/basic/publish.md:112-128`:

1. Each bundle patch named in the profile's `dsh.profile.bundles`, in list order.
2. The profile's own `$DSH_HOME/profiles/<name>/cordis.patch.yml`.
3. The home-level `$DSH_HOME/cordis.patch.yml`.
4. Each `--patch <path>` overlay, in argv order.

> "Later layers win per row; **a patch replaces the targeted row's complete `config` value rather than deep-merging keys**, and may insert new rows." — `apps/cli/reference/README.md:9`

Consequence for bundle authors (`publish.md:125-126`): your row override *"must restate every key the row needs, not just the changed one."* And prefer defaults users keep.

**Other setters:**
* CLI flags — parsed by an app-owned provider plugin injecting `cmdlineArgs`; rows read them through a `!!js` expression, and the flag beats the literal beside it (`apps/cli/reference/README.md:24-30`, `publish.md:130-151`).
* GUI — the settings seam (§6.3), which is a *user-owned document* layered **under** `base` (your composition entry), not the cordis config tree.
* `dsh --dump-config` / `--dump-default-config` to inspect (`apps/cli/reference/README.md:44-51`).

`docs/subsystems/settings.md:7-10` states the boundary precisely: *"Composition config stays in `cordis.yml` — a namespace carries only the user-editable subset."*

### 6.3 The settings seam (GUI / persisted user settings)

`ctx.settings` → `SettingsProvider` (`packages/settings/settings/src/index.ts:333`), abstract seam; `dsh-settings-file` is the provider.

**`installSection` is the recommended consumer API** (`packages/settings/settings/src/index.ts:464-497`):

```ts
/**
 * Attach one optional-settings consumer to this provider. The consumer
 * registers its composition entry as the base layer while this provider is
 * present, then falls back to that entry if the provider detaches.
 * @param owner - consumer context whose unload suppresses fallback work.
 * @param ns - consumer-owned settings namespace.
 * @param schema - schema resolving the namespace.
 * @param entry - composition entry used as the base and fallback value.
 * @param hooks - source sink, change notification, and optional validation.
 * @throws {TypeError} when `ns` is not a lowercase hyphenated identifier.
 */
installSection<const Namespace extends string, T>(
  owner: Context,
  ns: Namespace & SettingsNamespaceInput<Namespace>,
  schema: z<T>,
  entry: T,
  hooks: SettingsSectionHooks<T>,
): void
```

`SettingsSectionHooks` (`index.ts:871-897`) is `{ setSource(current: () => T): void; onChange(): void; validate?: (value: T) => void }`.

The full worked pattern — `docs/cookbook/adding-a-settings-card.md:13-44`:

```ts
export const MY_PLUGIN_NS = 'my-plugin'

export function apply(ctx: Context, config: Config) {
  let source = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, MY_PLUGIN_NS, Config, config, {
      validate: value => void assertReachable(value.endpoint),
      setSource: (current) => { source = current },
      onChange: () => { rebuildFromSettings(source()) },
    })
  })
}
```

Key semantics:
* `installSection` wraps `register(ns, schema, { base: entry, validate })` (`index.ts:477-481`), wires `setSource` immediately, and on provider detach falls back to the composition entry *unless the consumer itself is unloading* (`index.ts:482-489`, guard `isUnloading` at `index.ts:865-869`).
* Owner handle `SettingsScope<T>` has `get()`, `watch(cb)`, `update(patch)`, `replace(section)` (`docs/subsystems/settings.md:54-72`).
* Resolution order: **schema defaults → registrant's composition `base` → user section** (`settings.md:7`, `SettingsScope.get` doc).
* `applies: 'live' | 'restart'` is a UI hint, not a mechanism (`settings.md` `SettingsApplies`).
* `role('secret')` strips fields from all wire surfaces; `describe({ redactSecrets: true })` is mandatory on every wire surface (`settings.md` descriptor section, and `docs/cookbook/adding-a-settings-card.md:46`).

**Browser half** (`docs/cookbook/adding-a-settings-card.md:48-70`): register a keyed card into the `settings.plugin.item` slot under the same namespace string, declared with `dsh.client` and exported as `./client`:

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings-plugins"] } }
}
```

Cost warning (`adding-a-settings-card.md:94-102`): *"No published preset exposes this package, so a package outside this repository has to reproduce the same output format itself."* The required artifact is a loader lazy-CJS factory (see §11.2).

### 6.4 Reading config at runtime

* `apply(ctx, config)` receives the validated config (`vendor/cordis/src/registry.ts:121-133`).
* Config is **not** reactive — a config edit unloads and reloads the plugin (`docs/user/develop/basic/config.md:98-100`). So the idiomatic pattern is exactly the `installSection` one: keep a mutable `source` thunk and rebuild on change.
* `ctx.intercept(name, config)` lets an ancestor context add service-specific config for plugins below it (`vendor/cordis/src/context.ts:139-145`); `Service[symbols.resolveConfig]` merges ancestors-first, prepending `base` and appending `head`, using `Config.merge` when the service declares one, else a shallow `Object.assign` (`vendor/cordis/src/service.ts:86-102`).
* The exhaustive per-package config catalog is `docs/config-catalog.md` (generated by `scripts/gen-config-catalog.ts`, verified by `pnpm run verify-config-catalog`; it cross-checks the runtime schemastery schema against the pasted TypeScript declaration — `config-catalog.md:1-11`). It also emits a `Requires:` line naming the `inject`ed services.

---

## 7. Session events & agent hooks

### 7.1 Three event domains (pick deliberately)

`docs/architecture.md:70-78`:

* **Session events** — durable facts appended to the log, broadcast through `session/event`. Use when the fact must survive a reload.
* **Agent events** (`agent/*`) — carry a live `Agent`: inbox, step, status, request, validation, continuation. Use to observe or intercept work in flight.
* **Capability events** — attach policy/adapters to a seam (`fs/*`, `tools/*`, `skills/change`, `domain/changed`) without importing the loop.

`docs/user/develop/framework/events.md:102-106` warns explicitly: **`turn/*`, `step/*`, `tool/call`, `tool/result`, `compaction/*` are durable session-event types, NOT Cordis event names.** To observe them, listen to `session/event` and inspect `event.type`.

### 7.2 Cordis dispatch modes

`docs/cordis-primer.md:15-27`:

| Mode | Awaited? | Dispatch Order | Has Return Value? |
|---|---|---|---|
| `emit` | No | listeners observe in registration order | No |
| `waterfall` | No | listeners observe in registration order | Yes |
| `parallel` | Yes | all listeners observe the event in parallel | No |
| `serial` | Yes | listeners observe in registration order | Yes |
| `bail` | No | listeners observe in registration order until one bails | Yes |

Waterfall semantics (`cordis-primer.md:29-35`):

> `ctx.waterfall` is around-middleware. A listener receives `(...args, next)`. Call `next()` to delegate the possibly wrapped result to the next service; return without `next()` to short-circuit. Values propagate through `next()`'s return value.

> "Use `prepend: true` only when the listener must run before ordinary registrations." — `cordis-primer.md:33`

Bail/serial stop values (`docs/user/develop/framework/events.md:43,58`): *"the first result other than `null`, `false`, or `undefined`"* — implemented as `isBailed` in `vendor/cordis/src/events.ts:13-15`.

Registration API (`vendor/cordis/src/events.ts:34-105`, `:107-115`):

```ts
on<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean
once<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean

export interface EventOptions {
  /** Add the listener before existing listeners for the same event. */
  prepend?: boolean
  /** Receive the event regardless of context filter checks. */
  global?: boolean
}
```

`ctx.on()` listeners are **effects** — removed automatically on unload (`docs/user/develop/framework/events.md:108-117`). Typed events use declaration merging on `interface Events` (`events.md:83-100`), whose base lives at `vendor/cordis/src/events.ts:329-352` (all `internal/*`).

### 7.3 The `agent/*` event surface (exact payloads)

Declared at `packages/core/agent/src/runtime-types.ts:246-405`:

| Event | Mode | Payload | Line |
|---|---|---|---|
| `agent/created` | emit | `{ agent: Agent }` | `runtime-types.ts:258` |
| `agent/disposed` | emit | `{ agent: Agent }` | `:267` |
| `agent/status` | emit | `{ agent: Agent; status: AgentStatus }` | `:277` |
| `agent/inbox/inserted` | emit | `{ agent; message: UserMessage }` | `:285` |
| `agent/inbox/claimed` | emit | `{ agent; message: UserMessage; turn: number }` | `:296` |
| `agent/inbox/discarded` | emit | `{ agent; message: UserMessage }` | `:304` |
| `agent/session-start` | emit | `{ agent; source: SessionStartSource }` | `:316` |
| `agent/pre-step` | **waterfall** | `{ agent; messages: UserMessage[]; turn; step; signal }` → `PreStepDecision` | `:330` |
| `agent/request` | **waterfall** | `{ agent; turn; step; signal }` → `LlmCallConfig` | `:347` |
| `agent/request-error` | **waterfall** | `{ agent; turn; step; provider; failure; retryPolicy; signal }` → `RequestErrorAction` | `:363` |
| `agent/assistant-stream` | emit | `{ agent; frame: AssistantStreamFrame }` | `:373` |
| `agent/turn-stopping` | **serial** | `{ agent; turn; signal }` → `Promise<void> \| void` | `:391` |
| `agent/error` | emit | `{ agent; turn; step; error: unknown }` | `:403` |

Decision types (`packages/core/agent/src/runtime-types.ts:112-125`):

```ts
export type PreStepDecision =
  | { kind: 'reject' }
  | {
    kind: 'enter'
    messages: UserMessage[]
    /** Start a distinct model-message series before this step's admitted messages. */
    startsRequestSeries?: true
  }

/** Action returned by a listener that owns model-request recovery. */
export type RequestErrorAction = { kind: 'retry' } | undefined

/** Why a session lifecycle began; seeded creates are `startup`, while persisted loads are `resume`. */
export type SessionStartSource = 'startup' | 'resume' | 'clear' | 'compact'
```

Most `agent/*` events are **scope-filtered**: *"agent-scoped listeners receive only that agent"* (repeated in each JSDoc, e.g. `runtime-types.ts:257`). Scope rules are owned by `@deepseek-ai/dsh-scope`.

### 7.4 The `session/*` event surface

`packages/core/session/src/index.ts:34-84`:

```ts
interface Context { sessions: SessionStore }

'session/created'(this: Scoped<Session>, session: Session): void          // emit; sync throw vetoes + rolls back
'session/disposed'(this: Scoped<Session>, session: Session): void         // emit
'session/event'(this: Scoped<Session>, session: Session, event: SessionEvent): void  // emit; post-commit, fire-and-forget
'session/flush'(this: Scoped<Session>, session: Session): Promise<void> | void       // parallel; awaited durability checkpoint
```

`session/event` is the durable observation point: *"Post-commit, fire-and-forget append feed. The listener snapshot resolves before the log push, but callbacks run after it; observer failures are logged and contained without making the committed append fail"* (`packages/core/session/src/index.ts:62-70`).

`SessionEventMap` (`packages/core/session/src/types.ts:269`) declares the durable vocabulary. Every member is listed in `packages/core/session/src/known-event-types.ts:22-79`: `agent-preset/selected`, `agent/inbox/spliced`, `approval/asked`, `approval/decided`, `approval/policy`, `assistant/attempt`, `assistant/message`, `command/done`, `command/run`, `compaction/end|prune|start|summary`, `deliverables/presented`, `feedback/message-delete|message-put|record`, `goal/change`, `hook/invoked`, `hook/result`, `llm/retry`, `llm/retry-started`, `model/selection`, `permission/preset`, `plan/mode`, `request/context`, `request/header`, `sandbox/mode`, `schedule/change`, `session-log-deepseek/delivery-accepted`, `session/end-seed`, `session/title`, `session/title-llm-request`, `step/end`, `step/start`, `subagent/catalog`, `subagent/descriptor`, `subagent/model-selection-policy`, `system/message`, `team/member|message/delivered|message/queued|task`, `todo/write`, `tool-workflow/*`, `tool/call`, `tool/ptc-dispatch`, `tool/ptc-dispatch-start`, `tool/result`, `turn/end`, `turn/start`, `user/message`, `web/deepseek-search-llm-request`.

The four **surface** types (the only ones producing model history) are `system/message`, `user/message`, `assistant/message`, `tool/result` (`packages/core/session/src/types.ts:407`, `:460-464`).

Canonical `session/event` logger from `docs/user/develop/framework/events.md:123-138`:

```ts
export const name = 'tool-logger'

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    console.log(`[tool] ${exec.name}(${JSON.stringify(exec.arguments)})`)
    const text = result.content.map(block => block.type === 'text' ? block.text : '').join('')
    console.log(`[tool result] ${text.slice(0, 100)}`)
  })
}
```

(Note the `import type {} from '@deepseek-ai/dsh-tools'` line the tutorial adds at `docs/cordis-tutorial/07-into-the-harness.md:73` — *"pulls in the package's declaration merges so `'tools/result'` and its payload are typed"*.)

### 7.5 Injecting behavior / context — the complete toolbox

**Add model-facing context: `agent.inject(message)`** (`packages/core/agent/src/runtime-types.ts:234-241`):

> Queue model-facing context for the next pre-step **without waking the driver**. A running driver claims it at the nearest later step boundary; idle drivers leave it pending until follow-up or steering wakes them. It may miss a request whose pre-step already claimed its batch.

```ts
// docs/cookbook/adding-a-tool.md:49
agent.inject({ content, source: { kind: 'plugin', plugin: '<name>' } })
```

Build the message with `createUserMessage` (`packages/llm/llm/src/message.ts:204-211`). Source kinds: `user: { kind: 'user' }` and `plugin: { kind: 'plugin'; plugin: string } & ContextFormed` (`packages/llm/llm/src/message.ts:102-104`).

**Wake the driver: `followup()` vs `steer()`** (`packages/core/agent/src/runtime-types.ts:212-231`):

```ts
/** Queue an ordinary follow-up turn and wake the driver. The item becomes the sole ordinary message of its own turn. */
followup(message: UserMessage): void

/** Submit steering for the nearest step. An idle driver starts a turn; a running driver consumes it at its next step boundary. */
steer(message: UserMessage): void
```

**Rewrite or reject a step: `agent/pre-step`.** The real wrapping pattern (preserve the downstream decision, append messages) is `packages/extensions/tool-cordis/src/index.ts:384-401`:

```ts
ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
  const decision = await next()
  if (decision.kind === 'reject') return decision
  const ids = referencedPluginIds(messages)
  if (ids.length === 0) return decision
  signal.throwIfAborted()
  const contexts = ids.map((id) => {
    const reference = ctx.dynamicCordisRunner.reference(agent, CordisDynamicPluginId(id))
    return createUserMessage({
      content: [{ type: 'text', text: reference === undefined ? renderUnavailableReference(id) : renderReference(reference) }],
      source: { kind: 'plugin', plugin: name, form: 'instructions' },
    })
  })
  return { ...decision, messages: [...decision.messages, ...contexts] }
})
```

`docs/architecture.md:109`: *"Wrapping listeners preserve that declaration with `{ ...decision, messages }`."*

**Replace the call configuration: `agent/request`** (`runtime-types.ts:347`). *"On step admission, this runs after assembly and `step/start`, before the system prompt and accepted user batch are committed… The prepared call capability governs prompt admission. **Model-visible content must use logged channels; this waterfall cannot mutate messages.**"*

**Own failure recovery: `agent/request-error`** — return `{ kind: 'retry' }` without calling `next()`, or delegate (`runtime-types.ts:352-363`, `RequestErrorAction` at `:122`).

**Stop or extend a turn: `agent/turn-stopping`** (`runtime-types.ts:381-391`):

> A listener that objects steers (`agent.steer(...)`) and the machine re-reads its inbox: fresh steering runs another step, none closes the turn. **Data decides, so listener order cannot change the outcome.** The inverse control (stop a tool loop early) is data too: a tool result carrying `concludesTurn` ends the turn at its step.

Real usage — `packages/hooks/hooks-claude-code/src/index.ts:269-274`:

```ts
ctx.on('agent/turn-stopping', async ({ agent, turn, signal }): Promise<void> => {
  …
  agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: PLUGIN_SOURCE }))
})
```

**Add system-prompt content: `ctx.systemPrompt.section()`** (`packages/core/system-prompt/src/index.ts:448-457`):

```ts
/**
 * Register an ordered prompt section in the calling context's scope. A scoped
 * section shadows a global section with the same name; duplicates within one
 * layer and non-finite orders throw.
 * @returns the exact Cordis effect disposer.
 */
section(section: PromptSection): () => void
```

`PromptSection` (`packages/core/system-prompt/src/index.ts:53-74`):

```ts
export interface PromptSection {
  readonly name: string
  readonly order: number
  readonly text: string | ((context: AssembleContext) => string)
  /** Treat this contribution as the complete system prompt. … More than one effective complete section makes assembly fail. */
  readonly complete?: boolean
}
```

Real usage (`packages/extensions/tool-cordis/src/index.ts:34-38`):

```ts
ctx.systemPrompt.section({
  name: 'tool:cordis',
  order: ctx.systemPrompt.getSectionOrder('TOOL_CORDIS'),
  text: CORDIS_SYSTEM_PROMPT,
})
```

⚠️ `getSectionOrder(name)` takes a `PromptSectionOrderName` — the repository's centrally owned placement enum (`system-prompt/src/index.ts:464-466`). A third-party plugin is not in that enum, so it must supply its own numeric `order`. For **dynamic** per-request context there is also `ctx.systemPrompt.context({ name, order, text })` (`docs/cookbook/extension-cookbook.md:112`), which `dsh-user-approval` uses to surface its policy (`packages/interaction/user-approval/src/index.ts:154-166`).

**Observe everything durably:** `ctx.on('session/event', (session, event) => …)` then switch on `event.type` (`docs/cookbook/extension-cookbook.md:79-87`).

### 7.6 The turn/step lifecycle, end to end

`docs/agent-lifecycle.md:8-81` is a generated sequence diagram; `docs/architecture.md:84-103` is the compact version:

```text
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas; project runtime context
  -> agent/pre-step                   reject | enter(messages, startsRequestSeries?)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     agent/request -> prepareCall (cancellation commits neither system nor users)
     reconcile system/message using the prepared call capability
     append entered messages as user/message; log request/header and request/context as needed
     derive and freeze model history from the log
     stream the bound prepared call -> llm/stream -> agent/assistant-stream start
       agent/assistant-stream chunk*
       assistant/message | assistant/attempt -> agent/assistant-stream end
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping
turn/end
```

**Model-visible means logged** — a runtime invariant asserts it (`docs/architecture.md:121`): *"Anything that reaches a model request must be reconstructable from the log… This is why a new model-visible input requires a new session event."* (See the third-party caveat in §5.5.)

### 7.7 Subagents, goals, compaction

* Subagents: `ctx.subagents` provider registry + `dsh-tool-subagent` (`docs/cookbook/extension-cookbook.md:123`).
* Goals: `ctx.goals` owns durable state; `dsh-goal-round-driver` schedules rounds (`extension-cookbook.md:107`).
* Compaction: `ctx.compaction` seam; automatic pressure on serial `agent/pre-step`, overflow recovery on `agent/request-error` (`extension-cookbook.md:111`).
* Scheduled tasks: timer fires → `followup(…, { source: { kind: 'plugin', plugin: 'schedule' } })` when idle, `inject()` when busy (`extension-cookbook.md:127`).

The complete feature→mechanism map is `docs/cookbook/extension-cookbook.md:104-132`, with the governing claim at `:100`: *"Every product feature maps to a listener on a documented extension point… **No row modifies the loop.**"*

---

## 8. Permissions / security

### 8.1 What the capability seams model actually says

`docs/capability-seams.md` is a **generated Mermaid graph only** — one heading at line 4 and no prose sections. The real prose lives in `docs/architecture.md:125-131`:

> A **seam** is a swappable capability with three roles: a **Service Definition** declaring the interface, a **Service Provider** implementing it, and a **Consumer** using it, commonly a model-facing tool… adding a capability means designing all three.
>
> Seams are why one provider swap changes the whole product. Filesystem and subprocess providers share one execution world, so pointing them at a remote sandbox moves Bash, PTY, and LSP with them, with no provider forks.

### 8.2 What is gated, and by what

| Capability | Service | Gate mechanism | Cited |
|---|---|---|---|
| Process confinement | `ctx.sandbox` (`SandboxProvider`) | fail-closed `confine()`; abstract service, provider required | `packages/sandbox/sandbox/src/index.ts:146-176` |
| Filesystem effects | sandbox **mode**, not a per-op API | `read-only` / `workspace-write` / `danger-full-access` | `docs/subsystems/sandbox.md:13-22` |
| Per-call tool policy | `tools/pre-execute` + `ctx.tools.guard()` | typed decisions; monotonic deny | `packages/core/tools/src/index.ts:144,704,1100` |
| Human approval | `ctx.approval` (`ApprovalService`) | fail-closed outcomes; audit pair appended to the session | `packages/interaction/user-approval/src/index.ts:142-226` |
| Credentials | `ctx.credentials` (abstract seam) + `ctx.authorization` | provider indirection; `role('secret')` redaction on the settings path | `docs/subsystems/settings.md` redaction section |
| Session log writes | `ctx.sessions` (`SessionStore`) | lossless-JSON contract + unknown-type refusal | `packages/core/session/src/index.ts:703`; `session-persistence/src/storage-contract.ts:71-84` |
| Non-session durable state | `ctx.storageDomain` | zod schema validation at open; route table | `docs/subsystems/storage.md:96-140` |
| Shell / subprocess | `ctx.shell` / `ctx.subprocess` | provider seams; a sandboxing implementation wraps argv before spawn | `docs/architecture.md:142,148` |

### 8.3 Sandbox: the real interface

`packages/sandbox/sandbox/src/index.ts:146-176`:

```ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    sandbox: SandboxProvider
  }
}

/**
 * Abstract process-sandbox service. {@link confine} must return enforcing argv
 * or fail closed at wrap or runner-execution time; silent unconfined passthrough
 * is forbidden. Functional probes arbitrate multi-runner chains and may be
 * skipped for a sole candidate, whose own refusal remains the fail-closed end.
 */
export abstract class SandboxProvider extends Service {
  constructor(ctx: Context) {
    super(ctx, 'sandbox')
  }

  /**
   * Wrap `argv` so it executes confined under `policy` on this host; the
   * caller spawns the returned argv in place of its own.
   */
  abstract confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv
}
```

`SandboxMode` (`docs/subsystems/sandbox.md:13-18`): `'read-only' | 'workspace-write' | 'danger-full-access'` — *"`SandboxMode` governs filesystem effects only… Network and process visibility are outside this vocabulary."* And (`sandbox.md:20-22`): *"Only the first two modes can be sent to a provider. A `danger-full-access` consumer spawns its original argv and does not call `ctx.sandbox`."*

Enforcement is a **reported fact**, not a boolean (`sandbox.md:29-35`): `'full' | 'partial'`. `ConfinedArgv` also carries `denialSignatures` and `runnerFailureRules` so a consumer can distinguish "runner failed" from "confinement blocked it" (`packages/sandbox/sandbox/src/index.ts:91-124`).

`SandboxUnavailableError` (`packages/sandbox/sandbox/src/index.ts:128-146`) is thrown when a requested confined mode has no usable backend, with code `SANDBOX_UNAVAILABLE` (`:113`):

> *"sandbox mode "…" is requested but no sandbox backend is usable on this host; refusing to run the command unconfined."*

### 8.4 ⚠️ Does a plugin itself run sandboxed? **No.**

The sandbox wraps **subprocess argv**, not plugin code. `SandboxProvider.confine` returns *"the argv to spawn instead"*, and the consumer spawns it (`sandbox/src/index.ts:167-174`). Nothing in the loader, fiber, or effect machinery imposes a sandbox on `apply(ctx)`. A plugin is ordinary in-process Node code with full ambient authority (`node:fs`, `node:child_process`, network) unless **you** route those operations through `ctx.fs` / `ctx.shell` / `ctx.subprocess` / `ctx.sandbox`.

Two corroborating facts:
* `apps/cli/reference/README.md:105` — MCP servers are *"trusted executable code **outside** the agent sandbox"*, which is why no MCP server ships enabled.
* `docs/user/develop/basic/publish.md:171-173` — a git-installed plugin's `prepare` script is *"**permission to execute the package's code on your machine at install time, outside any sandbox the agent runs under. Only allow packages whose source you trust, and pin a commit.**"*

**Implication for a plugin author:** installing a plugin is a trust decision equivalent to installing any npm package. There is no capability declaration that restricts what a plugin's code may do.

### 8.5 What a plugin must declare

There is **no capability/permission list** in the manifest. `DshManifest` (`packages/util/package-manifest/src/types.ts:8-24`) has no permissions field. The only declarations are:

* `inject` — services it requires (declarative dependency, not a permission grant).
* `dsh.bundle.patch` — the config layer it contributes.
* `dsh.client` — the browser half.
* `peerDependencies` — what it expects the host to supply.

### 8.6 The approval flow

`packages/interaction/user-approval/src/types.ts:39-43,85-98`:

```ts
/** Closed approval outcomes: a one-shot grant, explicit rejection, withdrawn request, or unavailable answerer. */
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

'approval/request'(
  this: Scoped<Agent>,
  req: ApprovalRequestEvent,
  next: () => Promise<ApprovalOutcome>,
): Promise<ApprovalOutcome>
```

`ApprovalRequestEvent` (`types.ts:78-88`) = `{ agent, toolName, callId?, reason?, signal? }`. Two audit events are declared into the session log by the same file (`types.ts:33-58`): `approval/asked` `{ id, toolName, callId?, reason? }` and `approval/decided` `{ id, outcome }`.

The service (`packages/interaction/user-approval/src/index.ts:142-226`):

```ts
export class ApprovalService extends Service {
  static Config: z<Config> = z.object({
    policy: z.union(['ask', 'never'] as const).default('ask'),
  })

  /**
   * @returns the closed outcome; `'allowed-once'` is the only grant.
   * @throws when no turn is open or either audit event fails before the session append commit point.
   */
  async request(req: ApprovalRequest): Promise<ApprovalOutcome> {
    const session = req.agent.session
    if (!hasOpenTurn(session)) {
      throw new Error('approval.request() outside an open turn: …')
    }
    const id = ApprovalRequestId(randomUUID())
    session.append('approval/asked', { id, toolName: req.toolName, … })
    const outcome = await this.decide(req, session)
    session.append('approval/decided', { id, outcome })
    return outcome
  }
}
```

**How a tool plugin asks:** return `{ kind: 'ask', reason }` from `tools/pre-execute`; the registry answers through `ctx.approval`, and *"missing approval support turns `ask` into denial"* (`packages/core/tools/src/index.ts:139-143`). The cookbook states the same rule (`docs/cookbook/extension-cookbook.md:121`): *"return `ask` from `tools/pre-execute` and answer through `ctx.approval`; register a separate model-facing ask tool for ordinary user questions."*

Callers **fail closed on `unavailable`** (`types.ts:41-42`). `request()` must run inside an open turn or it throws.

### 8.7 Invariants and guards

`ctx.invariants` → `InvariantRegistry` (`packages/invariants`, listed in the ctx map). Third-party expectation: the seam exists and is injectable, but the shipped invariant companions are package-owned (`packages/core/tools/src/invariant.ts`, `packages/skill/skill/src/invariant.ts`, `packages/settings/settings/src/invariant.ts`, …). Guard packages under `packages/guard/` are ordinary hook plugins — `repeat-tool-reminder` listens on `agent/pre-step` and `tools/post-execute`, `timeout-policy` wraps `tools/execute` (`docs/event-producer-consumer.md:19,65,66`). **Nothing requires a third-party plugin to register an invariant**, and doing so is not a sandbox escape or grant — it is just another extension point.

### 8.8 "Cannot / must not" list (code-grounded)

* **Cannot** bypass a `tools/guard()` denial — guards are monotonic and *"no guard can turn a denial back into permission"* (`packages/core/tools/src/index.ts:697-702`).
* **Cannot** mutate tool identity in a `tools/execute` wrapper — only `exec.signal` is replaceable, and *"the registry re-fuses the original caller signal before the body"* (`packages/core/tools/src/index.ts:151-156`).
* **Cannot** register the reserved `run_code` name — throws (`packages/core/tools/src/index.ts:1044-1046`).
* **Cannot** apply a global tool restriction — `tools.restrict()` requires a scoped context (`packages/core/tools/src/index.ts:1063-1065`).
* **Cannot** append a durable custom session event type and expect the stock harness to reopen the log (§5.5).
* **Cannot** ship an authored session-format migration from outside the repo (`packages/util/package-manifest/src/types.ts:70-72`).
* **Cannot** have two plugins both contribute a `complete: true` prompt section — assembly fails (`packages/core/system-prompt/src/index.ts:67-73`).
* **Must not** read an injected-but-optional service with `ctx.<name>` through a foreign proxy — use `ctx.get(name)` (`docs/postmortem/0001-…md:111`).
* Sandbox **fail-closed is mandatory** for providers: *"silent unconfined passthrough is forbidden"* (`packages/sandbox/sandbox/src/index.ts:158-162`).

---

## 9. API stability assessment

**Overall verdict:** the *authoring* surface (plugin shape, `ctx` core, `defineTool`/`ctx.tools.register`, `ctx.skills`, `ctx.storageDomain`, session/agent events) is **deliberately public and heavily gated by generated catalogs** — but this is a **0.1.5 release candidate**, so nothing carries a stability guarantee. There is not a single `@deprecated` tag anywhere in `packages/*/*/src`. There is exactly one `@experimental` in the framework surface (`Context.root`).

### 9.1 Signals in the code

| Signal | Evidence |
|---|---|
| Pre-1.0 RC | root `package.json:3` → `"version": "0.1.5-rc.1"`; every package identical |
| Vendored framework may be re-synced | `vendor/cordis` is pinned source with a documented sync procedure (`vendor/README.md`, cited at `docs/cordis-primer.md:5`) |
| Generated catalogs are verified fresh in CI | `pnpm run verify-cordis-catalog`, `verify-tool-catalog`, `verify-config-catalog`, `verify-persistence-catalog`, `verify-scoped-events` — all part of `doc-sync` (root `package.json` scripts) |
| Only one experimental marker | `vendor/cordis/src/context.ts:21` (`Context.root`), restated at `docs/cordis-api/context.md:101` |
| Zero deprecations in package source | `grep -rn "@deprecated" packages/*/*/src/*.ts` → no matches (the only hit repo-wide is the *generator's* regex at `packages/typert/generator/src/cordis-catalog.ts:483`) |
| "experimental" named subsystems exist | `packages/experimental/inspector`; the deployment-image packer consuming `dsh.configTrees` is called *"the experimental deployment-image packer"* (`packages/util/package-manifest/src/types.ts:15,59`); Agent Teams is *"Experimental"* (`docs/architecture.md:131`) |
| `@internal` markers on specific types | e.g. `packages/core/tools/src/index.ts:421-422` (`ScheduledToolPreparation`), `packages/util/package-manifest/src/types.ts:19-23` (`moduleFallback`) |
| Repo declares its own naming/layout rules as enforced invariants | `docs/cookbook/adding-a-package.md:25`, `scripts/check-workspace-constraints.ts` |

### 9.2 API surface → how public → where

`exports` are read from each package's `package.json`. "Root export" = importable from the bare package name.

| API surface | Public? | Stability read | File (primary) |
|---|---|---|---|
| `Plugin` shapes (`name`/`inject`/`Config`/`apply`) | Root export of `@deepseek-ai/cordis` | Stable core; the documented contract | `vendor/cordis/src/registry.ts:91-133` |
| `Context` interface | Root export of `@deepseek-ai/cordis` | Stable core; augmented by packages | `vendor/cordis/src/context.ts:16-33` |
| `ctx.get/set/provide/accessor/mixin` | Mixed onto `ctx`; declared in `reflect.ts` | Stable core | `vendor/cordis/src/reflect.ts:7-70` |
| `ctx.effect`, `Disposable`, `Effect` | Mixed onto `ctx`; root export of cordis | Stable core | `vendor/cordis/src/fiber.ts:70-93,415-418` |
| `ctx.on/emit/parallel/serial/bail/waterfall/once`, `EventOptions` | Mixed onto `ctx`; root export | Stable core; dispatch-mode table is normative | `vendor/cordis/src/events.ts:34-115` |
| `Service` base class | Root export of cordis | Stable core | `vendor/cordis/src/service.ts:11` |
| `ctx.plugin`, `ctx.inject` | Mixed onto `ctx` | Stable core | `vendor/cordis/src/registry.ts:164-187` |
| `Inject` type | Root export of cordis | Stable core | `vendor/cordis/src/registry.ts:19` |
| `dsh` manifest keys | Type-only root export of `@deepseek-ai/dsh-package-manifest` | **`configTrees`/`moduleFallback` are experimental/internal**; `bundle`/`profile`/`client` are the load-bearing ones | `packages/util/package-manifest/src/types.ts:8-24` |
| `defineTool` + schema DSL | Root export of `@deepseek-ai/dsh-tools` | **Most stable plugin-facing API**; documented in 5 places + generated tool catalog | `packages/core/tools/src/schema.ts:545`; re-export `packages/core/tools/src/index.ts:71-95` |
| `ctx.tools.register()` | Subpath-free service | Public; raw JSON Schema also accepted | `packages/core/tools/src/index.ts:1027` |
| `ctx.tools.guard/restrict/get/schemas` | Service methods | Public; documented in `README.md:79-86` | `packages/core/tools/src/index.ts:1061,1100` |
| `ToolExecution` / `ToolRunContext` / `ToolGuard` / decisions | Subpath `@deepseek-ai/dsh-tools/types` and root re-exports | Public | `packages/core/tools/src/index.ts:372-414,581-593,704` |
| `tools/*` events (6) | Declaration merges in `@deepseek-ai/dsh-tools` | Public extension points | `packages/core/tools/src/index.ts:134-200` |
| `Presentation` render intents | Subpath `@deepseek-ai/dsh-tools/presentation` + root type re-exports | Public but **UI-consumer-dependent**; the Web Client does *not* consume `presentCall`/`presentResult` | `packages/core/tools/src/presentation.ts`; `docs/cookbook/adding-a-tool.md:93-97` |
| `agent/*` events + `PreStepDecision` | Declaration merges / exports of `@deepseek-ai/dsh-agent` | Public; the interception surface | `packages/core/agent/src/runtime-types.ts:112-122,246-405` |
| `Agent` interface (`followup`/`steer`/`inject`) | `@deepseek-ai/dsh-agent` | Public | `packages/core/agent/src/runtime-types.ts:164-242` |
| `session/*` events | Declaration merges in `@deepseek-ai/dsh-session` | Public | `packages/core/session/src/index.ts:34-84` |
| `SessionEventMap` / `SessionEvent` / `SessionEventType` / surface types | Subpath `@deepseek-ai/dsh-session/types` (+ `./surface`) | **Merge-extensible but read-validated** — see §5.5. `SessionEvent.ignorable` is the compatibility mechanism | `packages/core/session/src/types.ts:269,404,465,483` |
| `Session.append()` | Service method on `ctx.sessions` | Public; **contract is strict** (lossless JSON) and the vocabulary is allowlisted for reads | `packages/core/session/src/index.ts:703` |
| `ctx.systemPrompt.section()` / `.context()` | Service methods | Public; but `getSectionOrder()`'s name enum is repository-owned | `packages/core/system-prompt/src/index.ts:448-466` |
| `ctx.skills.registerProvider()` / `.register()` / `.list()` / `.snapshot()` / `.get()` | Service methods on `ctx.skills` | Public; fully documented with `ts type-equiv` blocks | `packages/skill/skill/src/index.ts:392,441,472,483,502` |
| `SkillProvider` / `SkillCandidate` / `SkillDefinition` / `SkillRegistration` | `@deepseek-ai/dsh-skill` root | Public via type re-exports (see `docs/subsystems/skills.md:19-52` type-equiv blocks) | `packages/skill/skill/src/index.ts:57-104` |
| `skills/change` event | Declaration merge | Public invalidation notification | `packages/skill/skill/src/index.ts:298` |
| `ctx.storage.mount/form` | Service methods | Public hub; thin | `packages/storage/storage/src/index.ts`; `docs/subsystems/storage.md:170-190` |
| `ctx.storageDomain.open/get/closeAll`, `defineDomain`, `domainTable` | Service methods + `@deepseek-ai/dsh-storage-domain` exports | Public; **the sanctioned plugin-state path** | `packages/storage/storage-domain/src/index.ts:69`; `spec.ts:91,107` |
| `domain/changed` event | Declaration merge | Public | `packages/storage/storage-domain/src/events.ts:46` |
| `ctx.settings.installSection()` / `register()` | Service methods | Public; GUI path; **secret redaction is mandatory on wire surfaces** | `packages/settings/settings/src/index.ts:464-497` |
| `ctx.sandbox.confine()` / `SandboxProvider` | Service + abstract class | Public seam; fail-closed contract | `packages/sandbox/sandbox/src/index.ts:146-176` |
| `ctx.approval.request()` + `approval/request` | Service + declaration merge | Public; turn-enclosed + audit pair | `packages/interaction/user-approval/src/index.ts:207-226`, `types.ts:85-98` |
| `ctx.jobs.start()` (long-running tools) | Service method | Public; documented in `adding-a-tool.md:53-55` | `packages/jobs/*` |
| Any `@deepseek-ai/dsh-*` **`./src/*`** subpath | Exported by many packages (e.g. `@deepseek-ai/dsh-tools` `exports["./src/*"]`) | **Deep import — treated as internal.** Use only for reading source; do not depend on it | `packages/core/tools/package.json` `exports` |

### 9.3 What "public" means mechanically here

Every package follows a strict pattern (`docs/cookbook/adding-a-package.md:25`): `main: "lib/index.js"`, `types: "lib/types/index.d.ts"`, and `exports["."] = { types, default }`. Additional typed subpaths are declared deliberately (`./types`, `./presentation`, `./surface`, `./invariant`). The generated catalogs (`docs/subsystems/core.md`, `docs/tool-catalog.md`, `docs/config-catalog.md`, `docs/persistence-catalog.md`, `docs/event-producer-consumer.md`) are **derived from the TypeScript Program** and CI-verified fresh — so a doc citation in this report is a *code* citation by construction.

**Judgment:** treat the authoring surface as "public but fast-moving". The RC version, the fact that `dsh` resolves plugin peer dependencies at install time with range checks, and the absence of a `1.0` or LTS marker all mean a plugin should pin its `@deepseek-ai/*` peer ranges and re-verify against each `0.1.x` release.

---

## 10. Minimal copy-pasteable plugin skeleton

Two skeletons. **(A)** is faithful to `docs/user/develop/basic/index.md` + `tool.md`. **(B)** is faithful to `dsh-minecraft/src/index.ts` and `packages/guard/timeout-policy/src/index.ts` for a plugin with config, a tool, durable state, a hook, and cleanup.

### (A) Zero-dependency function plugin

```ts
// src/index.ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  console.log('[my-plugin] plugin loaded!')

  ctx.effect(() => {
    const timer = setInterval(() => {}, 5000)
    return () => clearInterval(timer)
  })
}
```

```json
// package.json
{
  "name": "dsh-my-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: my-plugin
      name: 'dsh-my-plugin'
```

### (B) Full-featured backend plugin

```ts
// src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
// Type-only: pulls in the `agent/*` and `session/*` declaration merges.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session'

// 1. Config: schemastery ONLY (docs/user/develop/basic/config.md:45).
export interface Config {
  endpoint: string
  verbose?: boolean
}

export const Config = z.object({
  endpoint: z.string().required(),
  verbose: z.boolean().default(false),
})

// 2. Declared dependencies; apply() does not run until all exist.
export const name = 'my-plugin'
export const inject = ['tools', 'storageDomain', 'systemPrompt']

// 3. A durable domain: zod records, versioned, opened by the caller.
const domainSpec = defineDomain({
  name: 'my-plugin',
  version: 1,
  tables: {
    notes: domainTable<'note', { text: string }>(z.object({ text: z.string() })),
  },
})

export function apply(ctx: Context, config: Config) {
  // 4. Durable state. The CALLER owns close(); wire it to the fiber.
  const opened = ctx.storageDomain.open(domainSpec)
  ctx.effect(() => () => { void opened.then(domain => domain.close()) })
  const notes = () => opened.then(domain => domain.table('notes'))

  // 5. A model-facing tool. Hand-namespace; keep it [A-Za-z0-9_-]{1,64}.
  ctx.tools.register(defineTool({
    name: 'myplugin__save_note',
    description: 'Save a short note under a key.',
    parameters: {
      key: { type: 'string', required: true, description: 'Note key' },
      text: { type: 'string', required: true, description: 'Note body' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { ok: { type: 'boolean', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.ok ? 'saved' : 'failed' }],
    },
    async execute(args) {
      await (await notes()).put(args.key, { text: args.text })
      return { ok: true }
    },
  }))

  // 6. A second tool reading the same durable state.
  ctx.tools.register(defineTool({
    name: 'myplugin__list_notes',
    description: 'List saved note keys.',
    parameters: {},
    output: {
      schema: { type: 'array', items: { type: 'string' } },
      render: (_args, value) => [{ type: 'text', text: value.join(', ') || '(none)' }],
    },
    async execute() {
      return [...(await notes()).keys()]
    },
  }))

  // 7. Inject model-facing context at session start (this does NOT wake an idle agent).
  ctx.on('agent/session-start', ({ agent }) => {
    agent.inject(createUserMessage({
      content: [{ type: 'text', text: 'my-plugin is active.' }],
      source: { kind: 'plugin', plugin: name },
    }))
  })

  // 8. Policy hook: observe, then DELEGATE (omitting next() would veto).
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (config.verbose) ctx.logger(name).info(`tool call: ${exec.name}`)
    return next()
  })

  // 9. Monotonic guard: cannot be un-denied by later listeners.
  ctx.tools.guard(exec => exec.name === 'myplugin__save_note' && !config.endpoint
    ? 'my-plugin: endpoint is not configured'
    : undefined)

  // 10. A prompt section. Supply your own numeric order — the name enum is repository-owned.
  ctx.systemPrompt.section({
    name: 'my-plugin:instructions',
    order: 5_000,
    text: 'Prefer myplugin__save_note for durable notes.',
  })

  // 11. Optional service: `ctx.inject` gates the callback; read via the callback's context.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, 'my-plugin', Config, config, {
      setSource: () => {},
      onChange: () => {},
    })
  })
}
```

```json
{
  "name": "dsh-my-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-llm": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-storage-domain": "^0.1.0-rc.6",
    "@deepseek-ai/schemastery": "^3.18.1",
    "zod": "^4.4.3"
  }
}
```

> Skeleton (B) is a composite of verified APIs, not a single copied file. Lines 1-5 of the tool registration are verbatim from `docs/user/develop/basic/tool.md:11-34`; the config block from `docs/user/develop/basic/config.md:11-32`; the domain from `packages/storage/storage-domain/src/spec.ts:91,107` + `docs/subsystems/storage.md:96-119`; `installSection` from `docs/cookbook/adding-a-settings-card.md:33-43`; the hook from `packages/guard/timeout-policy/src/index.ts:57-80`; the guard from `packages/core/tools/src/index.ts:704,1100`; `agent.inject` from `packages/core/agent/src/runtime-types.ts:234-241` + `packages/hooks/hooks-claude-code/src/index.ts:209`.

---

## 11. Gotchas / non-obvious requirements

### 11.1 Plugin export shape

1. **Never add `export default` to a namespace plugin.** `Loader.unwrapExports` prefers `.default`, discarding sibling named exports — your `inject`/`name`/`Config` vanish and `apply` runs with **no injected services**. This caused a full production outage; see `docs/postmortem/0001-acp-default-export-drops-inject.md:27-55` and the fix at `vendor/loader/src/index.ts:191-199`. The postmortem's lesson (`:110`): *"A namespace plugin and a default export are mutually exclusive under the cordis Loader."* Pick one form.
2. **A PENDING plugin fails silently.** `inject: ['timer']` with no provider prints nothing forever (`docs/cordis-tutorial/06-composition-and-hmr.md:61-63`). Inspect `ctx.registry.values()` + `FiberState.PENDING` (`:65-83`).
3. **`inject` is not a permission — it is a dependency and a *gating* mechanism.** Providing a service makes you wait; consuming a *provider* means the composition must list that provider. `@deepseek-ai/dsh-tools` itself injects `systemPrompt`, so a composition mounting tools without the prompt provider leaves it PENDING (`docs/cordis-tutorial/07-into-the-harness.md:84`).
4. **Class-form `inject` is `static inject`; function-form is a named `inject` const.** Both resolve through `Inject.resolve` (`vendor/cordis/src/registry.ts:71-88`).
5. **`provide` is a static field on the class**, used as the default service name when the constructor's `name` argument is omitted (`vendor/cordis/src/service.ts:42-44`).

### 11.2 Build tooling

6. **Two build faces exist: Host and Client.** `tsc -b tsconfig.host.json` → `tsdown --env.DSH_BUILD_FACE host` → `tsc -b tsconfig.client.json` → `tsdown --env.DSH_BUILD_FACE client` (`docs/development.md:72-82`). **Tsdown consumes only the JavaScript emitted to `lib/types` by the preceding tsc phase** (`development.md:82`). An ordinary Client plugin produces both its Node loader and browser bundle during the Client phase.
7. **`tsdown` is only mandatory for the browser half.** `dsh-minecraft`'s host half is plain `tsc` (`tsconfig.build.json` with `outDir: lib`, `declarationDir: lib/types`); its `tsdown.config.ts` builds only `src/client/index.tsx`. A backend-only plugin can ship `tsc` output.
8. **A browser bundle must be a loader lazy-CJS factory with the package name as its id.** `dsh-minecraft/tsdown.config.ts` is explicit:
   ```ts
   outputOptions: {
     entryFileNames: "client.js",
     banner: "window.__ModuleLoader__.load({ id: 'dsh-minecraft', factory: (require) => {",
     footer: "return module.exports; } });",
     intro: "var module = { exports: {} }; var exports = module.exports;",
   }
   ```
   with `format: 'cjs'`, `platform: 'browser'`, and platform externals `['react','react/jsx-runtime','react-dom','react-dom/client','cordis']`. Its comment: *"id 必须与 package.json 的 name 一致（client-modules 按包名装配）"* and *"必须保持单文件（模块表只服务 /plugins/<id>/client.js），客户端源码不能有动态 import"*.
9. **No published preset exposes the client-bundle preset.** `docs/cookbook/adding-a-settings-card.md:102`: *"No published preset exposes this package, so a package outside this repository has to reproduce the same output format itself."*
10. **Client bundle purity:** *"value imports across plugins"* are rejected by a gate (`adding-a-settings-card.md:102`); cross-plugin collaboration must go through cordis services, with type-only imports for slot declarations (`:54-56`).
11. **Git installs fetch sources, not artifacts.** `publish.md:153-178`: ship a `prepare` script that builds self-contained (no sibling-monorepo assumptions, e.g. a dedicated tsdown config transpiling `src/` without project references); the user must then allowlist the build in the profile's `pnpm-workspace.yaml`:
    ```yaml
    allowBuilds:
      dsh-hello-plugin: true
    ```
    *Treat that allowance as permission to execute package code at install time, outside any sandbox* (`publish.md:171-173`). Alternatively publish to npm with `lib/` built at `pnpm publish` time, or ship a `pnpm pack` tarball — neither needs a build allowance (`publish.md:175-178`).
12. **In-repo only:** relative imports must use explicit `.ts` specifiers (`docs/cookbook/adding-a-package.md:27`); a new package must be registered in exactly **one** aggregate — `tsconfig.host.json` or `tsconfig.client.json`, never both (`adding-a-package.md:34`, `docs/development.md:54,68`), because Host and Client both declaration-merge `Context` under the same keys and one program seeing both reports a collision (`development.md:64`).

### 11.3 Discovery / installation

13. **Nothing is discovered automatically.** A plugin becomes active only when a Loader row names it. Rows come from: a bundle's `cordis.patch.yml` (listed in the profile's `dsh.profile.bundles`), the profile's own `cordis.patch.yml`, the home-level `$DSH_HOME/cordis.patch.yml`, or a `--patch` overlay (`apps/cli/reference/README.md:9`).
14. **`dsh plugin add` forwards to pnpm in the profile directory** and then reconciles `dsh.profile.bundles`: *"each dependency resolving to a package whose manifest declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` joins the layer stack … a bundle-less dependency stays plain with a one-time warning"* (`apps/cli/reference/README.md:55`). **A package without `dsh.bundle` installs but activates nothing** (`publish.md:64`) — that form is for a *library* other plugins import.
15. **Bundle membership changes need a restart.** *"a running Profile keeps the Bundle set from its current start. Restart that Profile after adding, removing, or updating a Bundle. This startup boundary applies to Bundle membership, while ordinary edits to the Profile or home `cordis.patch.yml` take effect through hot reload."* (`apps/cli/reference/README.md:67`)
16. **Bare plugin names resolve through the profile directory's Node parent walk**, reaching `$DSH_HOME/profiles/node_modules` (`apps/cli/reference/README.md:11`). `--patch` rows with a **relative** name resolve beside the patch file (`:51`), but the tutorial insists on an **absolute** path for an out-of-tree source plugin (`docs/user/develop/basic/index.md:56`).
17. **A patch replaces the targeted row's entire `config`** — restate every key you need, not just the changed one (`apps/cli/reference/README.md:9`, `publish.md:125`).
18. **Give every row an explicit `id`.** Without one, a config-file edit regenerates the id and the row counts as removed-plus-added, so it remounts even if unchanged (`docs/cordis-tutorial/06-composition-and-hmr.md:59`).
19. **Profile boot is per-name.** `dsh --profile <name>` reads `$DSH_HOME/profiles/<name>`; `web`/`headless`/`sdk`/`sdk-minimal`/`acp` auto-initialize from shipped templates, any other missing profile fails loud with a hint to run `dsh plugin --profile <name> add <package>` (`apps/cli/reference/README.md:13`).

### 11.4 Tool-specific traps

20. **`output` is mandatory and structurally checked at register time** — `{ schema, render, presentationMeta? }`, `render` a function (`packages/core/tools/src/index.ts:1031-1035`).
21. **Object schemas must declare openness explicitly.** `additionalProperties: boolean` is required on object nodes, including `output.schema` (`packages/core/tools/src/schema.ts:74-81`).
22. **Return the canonical value, never content blocks.** `execute` returns the value declared by `output.schema`; `output.render` produces model-facing content (`docs/cookbook/adding-a-tool.md:45`).
23. **`execute` must honor `exec.signal`** (`adding-a-tool.md:47`). Cancellation before body invocation is `ABORTED_BEFORE_DISPATCH`; after invocation it replaces only a successful outcome with `ABORTED` (`packages/core/tools/README.md:123`).
24. **Non-serializable values throw.** The registry snapshots arguments/value as lossless JSON and freezes them (`adding-a-tool.md:44-45`); `Map`/`Set`/`Date`/class instances/`BigInt`/`undefined`/non-finite numbers are not allowed.
25. **Presenters run on replay and must be pure** — no I/O, no session state, no clock/random (`adding-a-tool.md:87`). `defineTool` soft-validates them so malformed old args return `undefined` rather than throwing (`:89`).
26. **`run_code` is reserved** and cannot be registered or shadowed (`packages/core/tools/src/index.ts:1044-1046`).
27. **`tools.restrict()` requires a scoped context** (`agent.ctx`), and an empty filter is rejected as almost certainly a bug (`packages/core/tools/src/index.ts:1063-1069`).
28. **Scoped tools shadow global ones; duplicates within one layer throw** (`packages/core/tools/src/index.ts:1025-1026`, error at `:720`).
29. **`ctx.tools.get(name, scope)` resolves per scope** — pass the calling agent when matching the definition that executed (`packages/core/tools/README.md:81`).
30. **A tool's schema is fed into the system prompt automatically**, so registering a tool changes the prompt (and the KV-cache prefix). `packages/core/tools/README.md:157-167` documents the model-experience/KV-cache effect per package — a plugin author should reason about the same for their tools.

### 11.5 Session / event traps

31. **`turn/*`, `step/*`, `tool/call`, `tool/result`, `compaction/*` are NOT Cordis events** (`docs/user/develop/framework/events.md:106`). Listen to `session/event`.
32. **A waterfall listener that forgets `next()` silently vetoes the pipeline.** `docs/user/develop/framework/events.md:79-81`: *"A waterfall listener must call `next()`. Omitting it short-circuits the pipeline by design."*
33. **`agent/inject()` is not a wake-up.** An idle agent stays idle (`docs/cookbook/adding-a-tool.md:49`). Use `followup()`/`steer()` to wake.
34. **`approval.request()` must be inside an open turn** or it throws, because the `approval/asked` + `approval/decided` audit pair must be turn-enclosed (`packages/interaction/user-approval/src/index.ts:209-215`).
35. **Listeners are effects** — no manual `removeListener` needed; and disposal is reverse-order but concurrent for async disposers, so keep order-dependent teardown in one effect (`docs/user/develop/framework/index.md:63`).
36. **`session/event` is post-commit and fire-and-forget**: observer failures are logged and contained; you cannot veto a committed append from it (`packages/core/session/src/index.ts:62-70`).

### 11.6 Security traps

37. **Plugin code is not sandboxed.** `ctx.sandbox` wraps subprocess argv only (`packages/sandbox/sandbox/src/index.ts:167-174`). A plugin's own `node:fs`/`node:child_process`/network calls are unsandboxed ambient authority.
38. **There is no permission manifest.** `DshManifest` has no capability list (`packages/util/package-manifest/src/types.ts:8-24`).
39. **`ask` degrades to denial** when no approval answerer is mounted (`packages/core/tools/src/index.ts:139-143`), and callers must fail closed on `'unavailable'` (`packages/interaction/user-approval/src/types.ts:41-42`).
40. **`ctx.<name>` throws; `ctx.get(name)` returns `undefined`** — and the difference is observable through foreign shadow proxies (`docs/postmortem/0001-…md:56-87`).

### 11.7 Naming / convention traps

41. **`dsh.client.inject` is informational, not injection** (`packages/util/package-manifest/src/types.ts:47`). `dshClient` (the camelCase key used by `dsh-minecraft`) is **not** in `DshManifest` — the canonical key is `dsh.client`. The presence of both in that manifest is legacy duplication, not a second contract.
42. **Tool names are not validated by the registry.** Match `[A-Za-z0-9_-]{1,64}` yourself (the constraint the MCP driver enforces at `packages/mcp/mcp-client/src/tools.ts:47-53`).
43. **Skill names are kebab-case only** (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) and nested `**/SKILL.md` is not discovered (`docs/subsystems/skills.md:85`).
44. **Skill frontmatter keys are exact**: `disable-model-invocation` and `user-invocable`; camelCase legacy keys are rejected with an error (`packages/skill/skill-filesystem/src/index.ts:993-1006`).
45. **Product spelling is `Typert`, never `TypeRT`/`typeRT`; use `SDK` only for the JSON-RPC client/server protocol** (`docs/cookbook/adding-a-package.md:70`).
46. **A namespace/settings key must be a lowercase hyphenated identifier or `installSection` throws `TypeError`** (`packages/settings/settings/src/index.ts:471-472`).
47. **Storage domain/table names must match `UNIT_NAME_RE`** — safe as a file name *and* as a SQL identifier segment; record keys may be arbitrary strings (`docs/subsystems/storage.md:56`).

---

## 12. The `ctx` service map

Enumerated from the generated headings `### \`ctx.<name>\`` across `docs/subsystems/*.md` (73 services). `(seam)` marks an abstract capability with swappable providers per `docs/architecture.md:125-131`.

| ctx key | Type | Owning subsystem doc |
|---|---|---|
| `ctx.agentDefaultModel` | `AgentDefaultModelConfig` | core |
| `ctx.agentLoop` | `AgentLoop` | core |
| `ctx.agentPresets` | `AgentPresets` | core / preset |
| `ctx.agentTeams` | `TeamService` | agent-team (**Experimental**) |
| `ctx.agents` | `AgentRegistry` | core |
| `ctx.approval` | `ApprovalService` | approval |
| `ctx.attachments` | `AttachmentStore` (seam) | attachment |
| `ctx.authorization` | `AuthorizationService` | credentials |
| `ctx.clientModules` | `ClientModuleRegistry` | client-modules |
| `ctx.codeRuntime` | `CodeRuntime` (seam) | code-runtime |
| `ctx.commands` | `CommandRuntime` | commands |
| `ctx.compaction` | `CompactionEngine` (seam) | compaction |
| `ctx.cordisInspect` | `CordisInspectRegistryService` | extensions |
| `ctx.credentials` | `CredentialProvider` (seam) | credentials |
| `ctx.credentialsController` | `CredentialsController` | credentials |
| `ctx.deepseekLlmApiExtensions` | `DeepSeekLlmApiExtensionRegistry` | llm |
| `ctx.directoryPicker` | `DirectoryPicker` (seam) | workspace |
| `ctx.directoryPickerController` | `DirectoryPickerController` | workspace |
| `ctx.dynamicCordisRunner` | `DynamicCordisRunnerService` | extensions |
| `ctx.e2b` | `E2BRuntime` | e2b |
| `ctx.fileReferences` | `FileReferenceService` (seam) | session-reference |
| `ctx.fileUploads` | `FileUploads` | attachment |
| `ctx.fs` | `FileSystem` (seam) | filesystem |
| `ctx.goals` | `GoalService` | goal |
| `ctx.inspector` | `InspectorService` | slots |
| `ctx.invariants` | `InvariantRegistry` | invariants |
| `ctx.jobs` | `JobRegistry` (seam) | jobs |
| `ctx.llm` | `LlmRuntime` | llm-streaming |
| `ctx.lsp` | `LspService` | lsp |
| `ctx.messageFeedback` | `MessageFeedbackService` | feedback |
| `ctx.permissionPresets` | `PermissionPresetService` | permission-presets |
| `ctx.planMode` | `PlanModeController` | plan |
| `ctx.sandbox` | `SandboxProvider` (seam) | sandbox |
| `ctx.sandboxPolicy` | `SandboxPolicyService` | sandbox |
| `ctx.sessionController` | `SessionController` | session-projection |
| `ctx.sessionFeedback` | `SessionFeedbackService` | feedback |
| `ctx.sessionFileReferences` | `SessionFileReferences` | session-reference |
| `ctx.sessionPersistence` | `SessionPersistence` (seam) | persistence |
| `ctx.sessionProjectionCache` | `SessionProjectionCache` | session-projection |
| `ctx.sessionProjections` | `SessionProjectionRegistry` | session-projection |
| `ctx.sessionQuery` | `SessionQueryEngine` (seam) | session-query |
| `ctx.sessionReferenceResolver` | `SessionReferenceResolver` | session-reference |
| `ctx.sessionSkillCatalog` | `SessionSkillCatalog` | skills |
| `ctx.sessionTelemetry` | `SessionTelemetryBackend` (seam) | session-telemetry |
| `ctx.sessionTitle` | `SessionTitleService` | session-title |
| `ctx.sessions` | `SessionStore` | session |
| `ctx.settings` | `SettingsProvider` (seam) | settings |
| `ctx.settingsController` | `SettingsController` | settings |
| `ctx.shell` | `ShellExecutor` (seam) | shell |
| `ctx.shellEnv` | `ShellEnvRegistry` | shell |
| `ctx.skills` | `SkillRegistry` | skills |
| `ctx.spillStore` | `SpillStore` (seam) | spill |
| `ctx.storage` | `Storage` | storage |
| `ctx.storageDomain` | `DomainFacility` | storage |
| `ctx.subagentModelSelection` | `SubagentModelSelectionConfig` | subagent |
| `ctx.subagents` | `SubagentRuntime` | subagent |
| `ctx.subprocess` | `SubprocessRuntime` (seam) | subprocess |
| `ctx.systemPrompt` | `SystemPrompt` | system-prompt |
| `ctx.terminals` | `TerminalSessionService` | terminal |
| `ctx.tokenMeter` | `TokenMeter` | token-meter |
| `ctx.toolResultPruner` | `ToolResultPruner` | compaction |
| `ctx.tools` | `ToolRuntime` | tools |
| `ctx.typert` | `TypertRegistry` | typert |
| `ctx.typertGateway` | `TypertGatewayService` | api-gateway |
| `ctx.userQuestions` | `UserQuestionService` | user-questions |
| `ctx.web` | `WebRuntime` | web |
| `ctx.webServer` | `WebServer` | web-server |
| `ctx.webhookRuntime` | `WebhookRuntime` | webhook |
| `ctx.workflowEngine` | `WorkflowEngine` (seam) | workflow |
| `ctx.workspaceController` | `WorkspaceController` | workspace |
| `ctx.workspaceFiles` | `WorkspaceFiles` | workspace |
| `ctx.workspaceRegistry` | `WorkspaceRegistry` | workspace |

**Framework-inherited members every plugin also sees** (`docs/cordis-api/inherited.md:12-21`): `ctx.on/once`, `ctx.emit/parallel/serial/bail/waterfall`, `ctx.plugin/inject`, `ctx.effect`, `ctx.get/set/provide/accessor/mixin`, `ctx.extend/isolate/intercept`, `ctx.root/fiber/registry/reflect/events/logger`, `ctx.timer (+ interval/timeout/throttle/debounce)`, `ctx.loader`, `ctx.hmr`.

The generated, authoritative service-method reference (with full JSDoc and source links) is `docs/subsystems/core.md` from line 412 onward, plus the per-subsystem `## Cordis API` region on each `docs/subsystems/*.md` page. `scripts/gen-cordis-catalog.ts` produces them and `pnpm run verify-cordis-catalog` proves they are current.

---

## 13. Where to go next in the tree

| Question | Read |
|---|---|
| First plugin, tool, config | `docs/user/develop/basic/index.md`, `tool.md`, `config.md`, `publish.md` |
| Lifecycle, services, events | `docs/user/develop/framework/index.md`, `service.md`, `events.md` |
| Framework internals | `docs/cordis-primer.md`, `docs/cordis-tutorial/01…07`, `docs/cordis-api/*` |
| Tool contract in full | `docs/cookbook/adding-a-tool.md`, `packages/core/tools/README.md`, `docs/tool-catalog.md` |
| Extension-point feature map | `docs/cookbook/extension-cookbook.md:104-132` |
| Every event + producer/consumer | `docs/event-producer-consumer.md` |
| Every `ctx` service + method | `docs/subsystems/core.md:412+` and each `docs/subsystems/*.md` |
| Every config field | `docs/config-catalog.md` |
| Persistence catalog | `docs/persistence-catalog.md`, `docs/subsystems/storage.md` |
| Real plugin to copy | `packages/guard/timeout-policy/src/index.ts`, `packages/skill/skill-badge/src/index.ts`, `packages/hooks/hooks-claude-code/src/index.ts`, `packages/extensions/tool-cordis/src/index.ts` |
| Real *out-of-tree* plugin to copy | `<local-checkout>/dsh-minecraft/` (`package.json`, `cordis.patch.yml`, `tsconfig.build.json`, `tsdown.config.ts`, `src/index.ts`, `src/tools.ts`) |
| Failure stories worth reading first | `docs/postmortem/0001-acp-default-export-drops-inject.md`, `docs/postmortem/0002-js-expression-disabled-filesystem-tools.md` |
