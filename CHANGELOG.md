# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
