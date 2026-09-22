# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] — persistence and tool seams

Learner state now persists durably and a model-callable tool reports it. Still
no map or lesson UI.

### Added

- **Storage domain `udt` v1** (`src/state.ts`) over the official
  `storageDomain` seam, with the json backend writing one document at
  `<storage root>/udt.json`. Records are validated by zod at the durable
  boundary, so corrupt data cannot enter memory.
- **`courses` table** — a learning goal in the learner's own words. The
  container the map and lessons will hang off.
- **Learner singleton** in the domain's `global` slot. `initializedAt` is the
  empty-string sentinel until the first write, which makes first-run
  initialization idempotent and a restart distinguishable from a first boot.
- **Reasoning about vocabularies**: the teaching-mode enum is mirrored from the
  skill's `teaching_modes.md` rather than re-invented, because the skill's own
  protocol forbids a second vocabulary.
- **`udt_status` tool** — read-only; reports the domain, schema version,
  whether learner state exists, the learner profile and the registered goals.
  It records no teaching decision, by design.
- `inject = ['tools', 'storageDomain']`, resolved through `ctx.get(...)` with a
  loud failure if a seam is genuinely absent.

### Changed

- `apply` is now **async** and does the storage work directly. Cordis keeps the
  fiber in `LOADING` until it settles, so `await ctx.plugin(...)` genuinely
  waits for the domain to open and for tools to register. A nested
  `ctx.inject(...)` would return its own fiber, letting the outer fiber report
  ACTIVE while the domain was still opening.
- Boot logging moved from `info` to `debug`, so a normal DSH boot stays quiet.

### Tests

26 tests across four files, including a real-composition harness that mounts
the same storage stack the standard profiles use (`systemPrompt` → `tools`,
and `storage` → `storage-json` → `storage-domain`) over a temporary root:

- export-shape guards, including a regression guard proving the build fails if
  a `default` export is ever added;
- schema and domain-declaration unit tests;
- real composition: the plugin reaches `ACTIVE` and disposes back to `DISPOSED`;
- **durability**: the tool really registers and really executes, the document
  lands on disk, and a restart recovers learner state instead of
  re-initializing it;
- **no residue on unload**: the tool registration is retracted, the domain is
  closed, and the plugin can be loaded and unloaded repeatedly without leaking
  the domain name.

### Verified by hand against DSH 0.1.6-alpha.2

- A real headless boot created `~/.dsh/storages/udt.json`;
- the model actually called `udt_status` and reported the live domain, version
  and initialized flag;
- a second boot left `initializedAt` byte-identical, proving the state was read
  back rather than re-created.

### Notes

- Deliberately absent: UDT skill detection, the client half, the learning map
  and lessons.

## [0.0.1] — bootstrap

Architecture-proving release. No user-facing features yet.

### Added

- DSH bundle manifest (`dsh.bundle.patch` → `cordis.patch.yml`) so the package
  installs as a real profile layer via `dsh plugin --profile <p> add <path>`.
- Community naming declaration (`dsh-plugin.naming.json`).
- Minimal Cordis plugin entry with **named exports only** (`name`, `apply`) —
  a `default` export would make the loader silently drop `inject`.
- `tsconfig` with `verbatimModuleSyntax`, so every `@deepseek-ai/*` type import
  must be written `import type` and is erased at compile time. The built
  artifact therefore contains zero runtime imports and cannot resolve a second
  harness cohort.
- Tests: export-shape guards (including a regression guard against a `default`
  export) and a real-Cordis composition test that proves the plugin loads,
  reaches `ACTIVE`, reports its load line, and disposes cleanly.

### Notes

- Verified against DSH `0.1.6-alpha.2`. Install/reconcile/layer-composition and
  a real headless boot were each checked by hand.
- `lib/` is not committed. `prepare`/`prepublishOnly` and prebuilt distribution
  arrive with the first publishable release; until then a `github:` install
  would ship sources without a build.
- No `inject`, no tools, no client half, no storage domain — all deferred by
  design to `v0.0.2`+.
