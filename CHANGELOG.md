# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.6] — chat and the learning surface coexist

No new features. This release fixes the one thing that made the loop awkward:
the learning surface and the conversation could not be on screen together.

### Changed

- **The learning surface is now a docked tab in the right sidebar**
  (`sidebarRightTabs.register` + the `sidebar.right.pane.tab` seat), not only a
  full-page panel. The full panel fills the main column — *the same column the
  conversation lives in* — so with only that panel, answering a check meant
  leaving the lesson. The right sidebar is a separate column, so the map, the
  chat and the lesson are visible at once and the composer never disappears.
- Both surfaces run on one shared `useLearning` state, so they cannot disagree
  about what is focused or what the tutor wrote. The full panel is now the
  "focus mode" view; the tab is the everyday one.
- The tab docks on demand and retries briefly. The right sidebar hosts
  **session-scoped** tabs, so it can only accept one while a session surface is
  mounted — and while the full panel occupies the main column there is none.
  The useful moment is just after returning to the conversation.

### Fixed

- **`ctx.sidebarRight` was read as a property while only `sidebarRightTabs` was
  injected.** Reading a service that was never injected throws, and the
  surrounding `catch` swallowed it, so the tab silently never opened. It is now
  resolved with `ctx.get`, and the failure path is no longer silent.
- The docked tab accepts an `initialOverview`, so a static render shows real
  content instead of a loading state.

### Math

Researched and **deliberately not done**. DSH ships no math renderer to reuse
(no KaTeX, MathJax or Temml anywhere in the installed tree, and no mermaid
either), and adding KaTeX would break the client bundle's contract: the module
table serves one JavaScript file per plugin, so the CSS and web fonts KaTeX
needs have nowhere to live. The styled-but-untypeset fallback from v0.0.5
stays, and this is recorded rather than hidden.

### Tests

186 across seventeen files. New: the tab's own suite — it renders node, map and
lesson in one column; it selects a node on arrival; clicking another switches
the shown node; starting learning surfaces the tutor's lesson; blocks written
afterwards arrive by polling; it leaves no DOM residue; and its layout is a
single column with no fixed widths, so there is no width at which it breaks.

### Verified against DSH 0.1.6-alpha.2 with the real skill

One real session, chat and surface on screen together:

```
before the answer   evidence 1   state blocked    blocks text, diagram, text, check
after the answer    evidence 2   state explained  blocks unchanged
```

The new evidence is a real tutor entry (`explanation · more-practice`), and the
answer was typed into the chat **while the lesson stayed docked** — no
switching. Screenshot: `preview/dsh-ui-coexist.png`.


## [0.0.5] — the learning loop

The runtime now teaches. Pressing **Start learning** wakes the tutor, the tutor
writes real lesson blocks, and the panel follows the evidence and state changes
it records. Still no quiz engine, no RAG, no flashcards.

### Added

- **Learning focus** (`focus` table, keyed by course): `courseId`, `nodeId`,
  `startedAt`, `status`. A pointer, not a measure — there is deliberately no
  progress field. Readable by both sides: `udt_status` reports it to the tutor,
  `/overview` reports it to the panel.
- **`POST /focus { nodeId, sessionId? }`** — records the focus, then wakes the
  tutor with one user-role turn attributing the request to this plugin. Order
  matters: the record exists even when no agent can be reached, and a failed
  wake is reported rather than rolled back.
- **`udt_lesson_update`** — the tool the tutor writes teaching with. Blocks are
  validated twice: the declared `oneOf` parameter schema rejects a bad block
  before `execute` runs, and zod validates again in the body with a message
  naming the offending index. Caps: 6 blocks per call, 24 per lesson, plus
  per-field length limits, so an oversized payload is a rejection rather than a
  rendering problem.
- **`origin: 'tutor'`** — lesson blocks written by the teaching brain. The
  v0.0.4 `prototype` origin is retained so old records still parse, but the
  runtime no longer produces it.
- **Panel polling** while a focus is active, so blocks, evidence and state
  appear without user action. Nothing polls when idle.
- **"Answer in the chat"** — the panel fills the main column, which is also
  where the conversation lives, so the surface needed a door back to it.
  Supplied through `ctx.layout.selectPanel(null)`.

### Changed

- `apply` no longer mounts a lesson for a node; teaching is the tutor's.
- `udt_status` reports the focus, which is how the tutor learns what to teach.

### Fixed

- **The panel never saw its own focus.** Pressing Start learning did not refetch
  the overview, so the focus the server had just recorded was invisible and the
  polling effect — which keys off it — never started.
- **A parent cycle made nodes vanish from the map** (found in v0.0.4, kept
  fixed here): unreachable nodes render as roots rather than disappearing.
- **LaTeX was printed raw.** The teaching brain writes `\(...\)` and `\[...\]`
  by convention, and a STEM surface showing the delimiters is unreadable. Inline
  and display math are now set apart (styling, not typesetting — KaTeX is a
  later decision, recorded rather than hidden).

### Verified against DSH 0.1.6-alpha.2 with the real skill

One real session, on a real stored course:

1. the learner pressed **Start learning** on a `blocked` node;
2. the tutor was woken and wrote its own lesson — `origin: tutor`, five blocks,
   31s for the first unit;
3. the panel showed the blocks without any user action;
4. the tutor recorded evidence on its own (1 → 3 entries, with its readiness
   vocabulary: `step-down`, `diagnose-again`, `more-practice`) and the panel
   followed live;
5. it also moved the map: a child node went to `explained` with 4 evidence.

Screenshot: `preview/dsh-ui-loop.png`.

### Honest gap

The learner's typed answer producing a *new* evidence entry is covered by tests
(`tests/lesson-loop.test.ts`) rather than by the screen capture above — whether
an answer deserves an observation is the teaching brain's judgement, and in the
recorded runs it chose to re-teach before recording. The mechanism is the same
one proven in step 4.


## [0.0.4] — the learning UI

The runtime now has a real interface. A three-pane panel in the DSH web GUI
shows the course, its diagnosis map, the selected node, and a learning surface
— and the map, the panel and the API are all exercised against real persisted
state. Still no model-generated lessons and no quiz engine.

### Added

- **Client half** — `dsh.client` + `exports["./client"]`, built by tsdown into a
  single classic script registered through `window.__ModuleLoader__.load({ id })`
  with `id` equal to the package name. React and the Cordis service stay
  external and come from DSH's shared module table; nothing else is required,
  there is no dynamic import, and no host code (zod, storage) reaches the
  browser.
- **The panel**, registered into two stable slots: `sidebar.panellist` (a `list`,
  which draws the sidebar icon) and `main` (a `keyed` slot, which is the page).
  The sidebar `id` and the panel `key` come from one constant, because a drift
  between them means the icon opens nothing.
- **Diagnosis map rendering** — the flat node list becomes a tree, drawn with
  per-state marks and words. State is always a word from the skill's vocabulary;
  there is no percentage, score, star or progress bar anywhere.
- **Node detail** — state, relation, parent and child context, the evidence
  trail, and a plain-language explanation of what the state means.
- **`Start learning`** → a **learning surface**.
- **Learning Block schema** (host) and **renderer registry** (browser),
  deliberately separate. v0.0.4 supports `text`, `example`, `diagram`, `check`;
  an unknown block type renders a readable placeholder instead of throwing, so a
  lesson authored by a newer host still renders in an older browser half, and
  adding a type means adding one registry entry.
- **Lesson record** — `id`, `courseId`, `nodeId`, `title`, `blocks`, `origin`,
  timestamps. `origin` is `prototype` for everything this release produces: the
  lesson is a **deterministic projection of stored state**, not generated
  teaching content, and the record says so rather than relying on convention.
- **Host API** at `/diagnostic-tutor/api` (`overview`, `node`, `lesson`) with
  the browser trust fence: loopback Host, loopback Origin, and no cross-site
  `sec-fetch-site`. Views only — no storage path, no domain handle, no raw
  record crosses the wire.
- **`preview/`** — a standalone page that runs the *real built bundle* over
  fixture data, with no DSH and no agent, so the UI can be iterated without
  booting anything.
- **`scripts/screenshot.mjs`** — drives Chrome over the DevTools Protocol to
  capture the panel from a live profile, including the node → lesson flow.

### Fixed

- **A node caught in a parent cycle vanished from the map.** A cycle has no
  root, so the tree walk reached nothing and the node was silently dropped.
  Unreachable nodes are now rendered as roots: showing a node in the wrong place
  beats hiding it.
- **A missing web server left the panel's route mount non-deterministic.** The
  route is now registered eagerly when `webServer` is already present, with the
  deferred injection kept only as the fallback for a late provider.
- Map rows no longer squeeze the title: the state pill occupies its own grid
  column, which matters most in the narrow sidebar width.

### Tests

160 tests across fifteen files. New in this release: the map model and
vocabulary (pure), panel and block rendering via `renderToStaticMarkup`,
interaction in a real DOM (mount → click a node → detail updates → `Start
learning` → the surface, and unmount leaving no residue), the built bundle's
loader contract (single file, right id, only allowlisted requires, no host
imports) plus **executing it through a simulated module loader** and asserting
both slot registrations, the API and every trust-fence rule, and that the plugin
mounts one prefix route and disposes it on unload.

### Verified by hand against DSH 0.1.6-alpha.2

- DSH serves the built bundle **byte-for-byte identical** to `lib/client.js`;
- the module appears in the boot manifest as
  `{"id":"dsh-diagnostic-tutor","url":"/plugins/??dsh-diagnostic-tutor/client.js&rev=…"}`;
- the panel renders the real persisted course with its six nodes, and clicking
  the blocked node then `Start learning` produces a lesson carrying all four
  block types. Screenshots in `preview/`: `dsh-ui.png`, `dsh-ui-detail.png`,
  `dsh-ui-lesson.png`.

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
