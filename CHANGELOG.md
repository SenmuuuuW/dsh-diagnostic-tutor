# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.10] — your data is yours

The runtime claimed learner state was "visible, exportable and deletable". Two
of those three did not exist. This closes that gap, and pins the limit that is
left.

### Added

- **`GET /export`** — everything the learner owns as one self-describing JSON
  file (`format` + `version` first, so it explains itself years later without
  this plugin installed), served as an attachment with a dated filename.
  Handoffs are deliberately excluded: a handoff is timing for a model turn in
  progress, not learning state, and restoring one would restore a claim about
  something that is no longer running.
- **`POST /reset`** — deletes everything and returns to first run. Irreversible
  on purpose; an undo would mean keeping a copy of exactly what was asked to be
  removed. Refused over GET, so a link cannot delete anyone's work.
- **Both in the panel**, on both surfaces: *Export my data* and *Delete
  everything*, the second behind a second click rather than a dialog to dismiss
  by reflex.

### Found, and not fixed

The runtime declares `invalidRecords: 'backup-and-skip'` — the platform's
recovery path for a record that fails its schema. **It has no effect here.** The
facility only honours it when the unit can move a *per-record* document aside,
and this domain uses the default `single` layout, where every record lives in
one `udt.json`. The declaration is correct but inert.

The consequence is contained rather than catastrophic: one malformed record
rejects the open, the plugin reports it and stays inert instead of failing the
profile, and nothing is destroyed — removing the record by hand restores
everything else. Both halves are pinned by tests, including one asserting the
rejection so the limit stays visible instead of being assumed away. The fix is
`layout: 'per-record'`, which the JSON backend seeds from the existing single
file; it changes the on-disk format, so it is left as a deliberate decision.

### Tests

250 across twenty-one files. New (`state-export.test.ts`, 9): the export serves
an attachment with the right headers, carries everything, is self-describing,
omits handoffs, round-trips through JSON unchanged, and survives an empty state;
reset clears every table and returns to *first run* rather than "initialized
with nothing in it", leaves a working runtime behind, and is refused over GET;
and the damaged-store limit is asserted in both directions.


## [0.0.9] — DSH 0.1.7 compatibility, and a real A → B

Three compatibility fixes against harness **0.1.7-alpha.2**, and the first
complete two-node learning run against **UDT v2.1**.

### Fixed

- **The message source.** 0.1.6 accepted `{ kind: 'plugin', plugin: 'x' }`.
  0.1.7 removed the shared catch-all `plugin` kind entirely: `MessageSourceMap`
  is merge-extensible and every producer declares its own name in its own
  module — `dsh-schedule`, `dsh-webhook` and `agent-team` all do this. The
  plugin now declares

  ```ts
  declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
      'diagnostic-tutor': { readonly kind: 'diagnostic-tutor' }
    }
  }
  ```

  and sends `{ kind: 'diagnostic-tutor' }`. The old shape is not deprecated but
  *absent from the union*, so `pnpm typecheck` fails on it — which is the
  regression test.
- **Node identity for the model.** `udt_map_get` returned nodes under `id` and
  `parentId` while every tool that *takes* a node argument spells it `nodeId`,
  and `udt_status.pendingNextStep` returned only display titles — so a model
  reading its own last decision had to derive an identifier from a string that
  is neither unique nor a key. Nodes are now `nodeId` / `parentNodeId`, the
  pending decision carries `fromNodeId` and `targetNodeId`, and four tests
  assert the output schema promises exactly the names the value delivers.

### Removed

- **`src/adapter.ts` and its system-prompt section**, the `installRuntimeAdapter`
  call, and `tests/adapter.test.ts`. It existed to explain this runtime's
  storage semantics to a skill whose guardrails read as forbidding them. UDT
  v2.1's `learning_runtime_contract.md` now says all of that in the skill's own
  words and in more detail, so the bridge is a second voice rather than a
  missing one.
- **The two compensating hints in `tools.ts`** that told the tutor *when* to
  record a decision. That judgement is the skill's, and v2.1 owns it. Genuine
  tool/API descriptions — block caps, `append` vs `replace`, and the real
  mechanic that a check block has no input box so the learner answers in the
  chat — all stay, guarded by a test.

### Product polish and demo quality (same release)

The loop worked; it did not yet look like a product. No new capability was
added, and no block type — the four that exist are the four that render.

**Lessons read as lessons.** The teaching brain writes ordinary light markdown
inside its blocks — `###` headings, `-` bullets, `1.` steps — and the renderer
printed the markers verbatim, so a lesson looked like a Markdown source file.
Headings, bullet lists and ordered steps are now recognised and rendered, with
no new block type. Worked examples, diagrams and checks each gained a label;
the check in particular now reads as an invitation (*Your turn — answer in the
chat →*) rather than a question sitting in a dead panel.

**The surface is ordered by what a learner needs next:** the lesson, then the
recommendation, then the map, then the evidence. The lesson leads because it is
the teaching; the map and the evidence are reference.

**`NOW LEARNING` is a card, not an eyebrow**, edged in the colour of the node's
state so the most important fact is the first thing seen. The diagnosis map
draws depth guides and tints blocker rows, so `blocked` is findable without
reading every line. Evidence became a compact record — kind, readiness,
timestamp, and a clamped note — instead of three stacked lines per entry. The
next-best-step card is now the most deliberate thing on the surface.

**First use is a question, not a blank page.** With no goal yet, both surfaces
ask *What do you want to learn?*, show the exact sentence that starts
everything, and say what happens to your data. No wizard.

**A missing teaching brain is now visible.** It used to be a `debug` line: the
plugin loaded, the panel sat empty, and nothing said why. It is a `warn` in the
log and a notice in the panel — deliberately worded without the skill's files or
version, because its own protocol forbids naming those in learner-facing text.

**Fixed:** a damaged store could take the whole plugin tree down. `apply` guarded
the domain *open* but not the first-run learner write, so a partial or
hand-edited file rejected `apply` — which the loader treats as a fatal
composition error, failing every unrelated plugin in the profile with nothing
registered to report it. Both are inside the guard now, and a regression test
drives the damaged-store path.

**README** rewritten for a public audience: what it is, why it is not just
another AI tutor, the teaching-brain/runtime split, the seven-stage loop as a
diagram, an honest *early development* notice that names what does **not** exist,
and the demo scenario with real screenshots. Caught while writing it: a stale
"temporary runtime adapter" section describing a file deleted in `v0.0.9`, and a
duplicated `v0.1.0` row in the roadmap.

### Verified: a real A → B on 0.1.7 + v2.1

No store editing, no hand-called tools, no re-hooked `nextStepId`. Everything
below happened through the composer and the Continue button:

```
A = Python 与 NumPy 基础
  learner answers the check in the chat
  → evidence: check · advance-with-caution
  → udt_decide_next records the move
       action  advance-with-caution
       target  微积分与优化：导数、梯度直觉与 loss 下降方向
       reason  「形状这一层你在 NumPy 里已经能自己说清楚了（连广播都推得出来），
                基础不用再停留。下一站补的是『loss 往哪边调会变小』…」
  → NEXT BEST STEP appears with that reason
  → Continue pressed
  → B becomes the active focus
  → B's tutor woken             first activity  0.2s
  → B's lesson written                          20.2s
  → B's lesson on screen                        20.3s
```

Chain, from the runtime's own record:
`focus persisted 0.0s → followup accepted 0.0s → first activity 0.2s → lesson written 20.2s → UI observed 20.3s`

Screenshot: `preview/dsh-ui-v0107-ab.png` — B under **NOW LEARNING**, the
progress line reading `Lesson ready 21s`, both finished nodes marked `checked`.

### The v2.1 contract closed the v0.0.8 gap

v0.0.8 ended with the tutor never calling `udt_decide_next`: it judged answers
correctly and went on teaching. Across this release it recorded a decision on
**every** judged answer — four `more-practice` stays while a node was being
consolidated, then the `advance-with-caution` move above. Nothing in the plugin
changed to cause that; the skill now treats a judged answer as an unfinished
turn. The plugin-side hints that tried to compensate were deleted, and the
behaviour got *better*, which is the evidence that they were in the wrong place.

### Tests

241 across twenty files. New (`model-contract.test.ts`, 12): the source value
and its absence of a `plugin` field; a compile-time guard that fails if the
module augmentation is removed; the platform's own `createUserMessage` accepting
the message; a refusal to wake the wrong session; node ids in `udt_map_get`,
`udt_status` focus and pending decision; the declared schemas matching the
values; and the deleted bridge staying deleted while the real API descriptions
survive.


## [0.0.8] — reliable handoff and latency UX

No new learning features. This release makes the wait between pressing Continue
and seeing a lesson visible, measurable and survivable — and measures where the
time actually goes.

### The measurement (this is the headline)

Instrumented from the runtime's own timestamps, on a real run against
DSH 0.1.6-alpha.2 and the real skill:

```
focus persisted    0.0s
followup accepted  0.0s
first tutor activity 1.0s
lesson written    26.1s
UI observed       26.1s
```

**The plugin costs about one second. 25 of the 26 seconds is the model writing
the lesson.** The earlier seven-minute turns were the same thing at a larger
node: a long generation, not a stuck runtime. That is now a number rather than
a suspicion.

### Added

- **`handoffs` table**, keyed by target node — which is what makes pressing
  Continue twice one handoff instead of two. Every stage carries a timestamp:
  `requestedAt → focusRecordedAt → promptedAt → firstActivityAt → lessonAt →
  observedAt`. The record is the progress display *and* the measurement.
- **The progress line** on both surfaces: `focus recorded` → `tutor requested`
  → `tutor working` → `lesson ready`, with the elapsed seconds shown. A silent
  wait is indistinguishable from a broken button, and a tutor that takes ninety
  seconds should look like a tutor that takes ninety seconds.
- **Retry** on `failed` and on a stall, and **the focus is never touched**:
  a timeout is a statement about the wait, not about where the learner is.
- **`POST /handoff/observed`** — the last leg, which only the browser can
  answer: when a surface first rendered the lesson.
- The `udt_lesson_update` description now asks for **a short first unit sent as
  soon as it is known**, so the surface fills in early instead of staying blank
  while the whole lesson is composed. The plugin still generates nothing.

### Changed

- **A stall is derived, never stored.** `handoffView` computes it from
  `updatedAt`; writing a timeout into the record would make the store a clock,
  and a quiet record is not a different record.

### Fixed

- **A read-modify-write race between the first-activity listener and the lesson
  write.** Both read the record, transformed it, and wrote it back; the loser's
  write was lost, so a handoff could read `working` while a lesson existed.
  Transitions now go through the domain's atomic `update`, with the condition
  re-checked inside the transform, and a lesson can only move a handoff forward.
- The runtime adapter now states that a turn which reaches a conclusion ends by
  recording the next step. That is runtime semantics — what the runtime holds
  and which artifact a finished turn produces — not teaching content.

### Tests

217 across nineteen files. New (`handoff.test.ts`, 14): the stage offsets are
cumulative from the request; only the first activity and the first sighting are
kept; a stall is derived and changes nothing about the record; a failure keeps
its reason; a double click is one handoff with one attempt; a failed wake leaves
the focus standing; the record and its chain survive a restart; a lesson write
moves the handoff to ready; `observed` is recorded once and refused for a node
with no handoff.

### The acceptance run — what completed and what did not

Completed, with no store editing:

- A focus recorded, tutor woken, lesson written and observed — chain measured
  above;
- the page fully reloaded, and the progress line rebuilt from the persisted
  record with the same stage offsets (`--resume`), which is refresh and restart
  proof;
- `POST /focus` twice → one handoff, one attempt.

**Not completed: the tutor never called `udt_decide_next`.** In three
consecutive runs it judged the learner's answer correctly — writing real
evidence (`check · advance-with-caution`) and moving the node to `explained` —
and then went on teaching, never recording a decision. So the run stops at "A is
finished, B is not chosen", and the A → Continue → B acceptance is **not met**.

That is a finding about the teaching brain, not about the runtime: the handoff
machinery it depends on is measured, tested and working, and v0.0.7 already
demonstrated a real `step-down` decision with a prerequisite target recorded
through the same tool. What is missing is that the skill does not treat
"record the next step" as part of its own loop — its protocol says *decide the
next move*, and it does that in the conversation rather than through the
runtime's artifact. A tool description and a runtime-semantics sentence were not
enough to change that.

The fix belongs upstream, in the skill's protocol, which is the v2.1 amendment
already planned before v0.1.0 — now with evidence for why it matters.


## [0.0.7] — decide, then move

No new surface. This release makes "what happens after this node" a real step:
the tutor decides, the runtime stores the decision, and the learner sees why
before anything moves.

### Added

- **`focus.status` is now used.** A decision that names a target ends the focus
  and stamps `endedAt`; a decision that does not leaves it active, because the
  learner has not moved and the panel must not say they have.
- **`next_steps` table** — `fromNodeId`, `courseId`, `action`, `targetNodeId?`,
  `reason`, `createdAt`, keyed by the node the decision was made from. The focus
  carries `nextStepId`, so "a recommendation the learner has not acted on" is
  exactly "the current focus links to one" — starting a new focus writes a fresh
  record and the link is gone, with nothing having to remember that it was.
- **`udt_decide_next`** — the tool the tutor says where to go with.

  `action` is the skill's **six readiness outcomes, reused**. Inventing a second
  vocabulary for "what happens next" is the duplication this project exists to
  avoid, and the six already say it. `vocabulary.ts` records the only structural
  thing the runtime needs: whether an outcome names a target —
  `advance`/`advance-with-caution`/`step-down` require one, `more-practice`/
  `diagnose-again` forbid one, `review-first` allows either.

  `targetNodeId` absent is the **only** encoding of "stay", so the runtime never
  has to interpret a decision. It validates that the nodes exist, belong to the
  course, and agree with the outcome; it never fills in a target the tutor left
  out. `reason` is required because the panel shows it verbatim.
- **NEXT BEST STEP card** on both surfaces: what the last node landed on, where
  it sends the learner, why, and a button. Nothing moves on its own.

### Notes

- `udt_decide_next` takes no node state at all, so it cannot confirm anything.
  Mastery still goes through `udt_map_update`, where the evidence rules apply —
  the separation is structural, not conventional.

### Tests

203 across eighteen files. New (`next-step.test.ts`, 14): the action vocabulary
is the skill's six; a move ends the focus, stamps `endedAt` and links the step;
a stay keeps it open; `review-first` is a stay without a target and a move with
one; a move without a target is refused and records nothing; a stay that names
one is refused; a target that does not exist, belongs to another course, or
equals the current node is refused; the tool cannot change a node's state; the
recommendation and the ended focus survive a restart. Plus three card-rendering
tests, including that it shows no percentage, score, XP or stars.

### Verified against DSH 0.1.6-alpha.2 with the real skill

A real session produced a real decision — and it took the prerequisite branch:

```
action   step-down          (a move, so the focus ended)
target   线性代数：向量、矩阵、形状与矩阵乘法直觉
reason   「数学基础」这一格太大，先落到最底下、后面每个公式都要用的那一小块：
         数据表怎么变成矩阵，形状为什么要对齐。学完这一小块，我们再回到上面那一格。
```

The panel rendered it as `✓ 数学基础（ML 最小集） — step down / Next: 线性代数… /
Why: … / [Continue learning]`. Screenshot: `preview/dsh-ui-next.png`.

### Honest note on the run

The scripted capture of the *follow-through* — pressing Continue and watching the
new focus take over — did not complete: the tutor's turn outran the script's
wait budget twice (>7 minutes of model time on a large node). The record above,
the ended focus and the card are all real; the click-through is covered by
`next-step.test.ts` rather than by a screen recording.


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
