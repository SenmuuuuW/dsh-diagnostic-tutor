# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] — goal → detection → diagnosis map

The runtime now carries real product semantics. A goal can be recorded, the
teaching brain is detected, and a diagnosis map grows one observation at a
time. Still no lesson page and no UI.

### Added

- **Teaching-brain detection** (`src/udt.ts`). Asks the platform's own skill
  registry (`ctx.skills`) rather than the filesystem, so no path is hardcoded
  and no skill root is assumed. Never throws: an absent catalog, an absent
  skill, and an unreadable body each return a status with a reason.
  Compatibility is probed by **capability**, not by a version string — the
  skill's maintenance contract forbids extra frontmatter fields, so it cannot
  declare a version even if we wanted one. The result carries a short content
  digest as a version hint and stays **internal**: it is logged at `debug` and
  appears in no tool output, because the skill forbids naming its files and
  versions in learner-facing text.
- **`udt_goal_create`** — records a goal in the learner's own words and plants
  exactly one node: the map root. It never generates an outline. Creating a
  goal focuses it and pauses the previously active one.
- **Diagnosis map** (`nodes` table) — `id`, `courseId`, `title`, `parentId?`,
  `relation`, `state`, `evidence[]`, timestamps. Relations are
  `goal | part-of | prerequisite | related`: they describe diagnosis, and there
  is deliberately no `next-in-course`, because nothing here knows a teaching
  order.
- **`udt_map_get`** and **`udt_map_update`** (`add-nodes` | `set-state` |
  `add-evidence`).
- **Diagnosis rules** (`src/diagnosis.ts`), all pure functions: `confirmed`
  requires a `check` or `transfer` evidence entry — explanation or practice
  alone never confirms; a goal node can never be confirmed, because it is the
  frame of the map rather than a claim; every non-goal node must attach to an
  existing parent in the same course; no cycles; at most 8 nodes per call and
  40 per course.
- **Temporary runtime adapter** (`src/adapter.ts`) — one short system-prompt
  section stating that this runtime's state is explicit and user-visible, that
  stored state is evidence rather than truth, and that the map is
  diagnosis-driven rather than a syllabus. Contributed only when the teaching
  brain is present. This is the v0.0.x bridge for the skill's
  anti-persistence guardrail and is expected to be superseded by an upstream
  protocol before v0.1.0.
- `src/vocabulary.ts` — every closed word list in one place, mirrored from the
  skill and never re-invented.

### Fixed

- **A broken store no longer takes the plugin tree down.** A rejection from
  `apply` is a fatal composition error for the loader, so an unreadable
  document would stop every unrelated plugin in the profile from loading. The
  storage open is now guarded: the plugin stays loaded but inert, registers no
  tools, and logs the cause.
- **Non-Latin titles produced useless ids.** An ASCII-only slug collapsed
  `机器学习入门` to the literal fallback `node`, and dropped the Chinese half of
  `ML / 机器学习`. Slugs are now Unicode-aware, so ids still read like what they
  name.

### Notes on domain versioning

The domain stays at **version 1**. v0.0.3 added the `nodes` table, which is
additive: an old document simply has none, and the facility builds its table
set from the spec. Bumping the version would have made every existing store
unopenable — the `single` layout enforces the stamped version strictly and
rejects a mismatch before `compatibleVersions` is consulted, which only
`per-record` layouts honour. This was found by a real boot, not by review.

### Tests

85 tests across nine files, including a real-composition harness that mounts
the same stack the standard profiles use (`systemPrompt` → `tools` → skill
catalog, and `storage` → `storage-json` → `storage-domain`):

- detection present / absent / present-but-unrecognised / no catalog at all;
- detection against the **real installed skill** through the real filesystem
  provider, in a test that skips itself when the skill is absent;
- the four tools register exactly, and the goal produces exactly one node;
- unverified mastery is refused, repeatedly and by name;
- evidence appends without losing earlier entries;
- the whole map survives a restart;
- **no score, grade or progress field exists anywhere in the persisted
  document** — asserted against the file, not the plugin's report;
- unload retracts every tool and frees the domain, three rounds running;
- a version-mismatched document degrades to inert instead of failing the tree.

### Verified by hand against DSH 0.1.6-alpha.2

- detection found the real skill: `compatible`, provider `filesystem`,
  fingerprint `a8e8805c3de2`;
- a real headless session turned「我想学机器学习，Python 会一点，数学基础不太稳」
  into a course `机器学习` with 6 nodes — one goal root, a `blocked` maths node,
  a Python node, and three `part-of` children each carrying its own diagnosis
  evidence — with nothing marked `confirmed`;
- the pre-existing v0.0.2 document opened unchanged.

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
