# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — the initial diagnosis asks with the interactive question card

The diagnosis wake message now tells the tutor to ask its initial questions
through DSH's `ask_user_question` tool instead of writing them as plain chat
text. That tool renders an answerable card beside the composer: options can be
tapped, multi-select is supported, and a free-text question covers "explain in
your own words". The tutor still decides the questions and still records the
evidence and assessment; the runtime only asks for the interactive channel.
Profiles without the tool fall back to the chat, as before.


### Fixed — the diagnosis step no longer points at questions that never arrived

Requesting the initial diagnosis wakes the tutor, but the turn runs in the chat.
The route page used to say **Answer the tutor’s questions** from the moment the
request was sent, so a learner who followed the button before the tutor replied
— or after the turn failed — landed in a conversation with nothing to answer.

The page now follows the turn and keeps a durable recovery path:

- the tutor turn is running → **The tutor is preparing diagnostic questions**,
  with the honest note that the questions appear in the conversation;
- the turn ended with an agent error → **The tutor could not finish the check**,
  the actual error, and one action that **retries with the current model and
  opens the conversation**; skipping stays available. The host stamps the error
  on the durable path request, so the explanation survives an app restart (the
  browser session snapshot is memory-only);
- otherwise the card stays **Answer the tutor’s questions**, with a small
  **No questions yet? Request the diagnosis again** link for a prompted turn
  that silently produced nothing.


Skip remains available in every waiting state, and the normal answer-in-chat
flow is unchanged. The snapshot reader is optional: previews and profiles
without a Session Controller keep the previous copy.


### Compatibility — verified on DSH 0.2.1-rc.3

The desktop app moved from `0.2.1-rc.2` to `0.2.1-rc.3`. The plugin needed no
code changes: the release bumps package versions and adds a sidebar entry-actions
slot, both additive for this plugin. The dev dependency cohort is now pinned to
`0.2.1-rc.3` and the lockfile refreshed.

Re-verified against `0.2.1-rc.3`:

- `pnpm typecheck` and `pnpm build` pass; 607 tests pass across 37 files.
- 24 route browser cases pass (assessments, proposals, explicit accept/start,
  light/dark, three widths, language switch).
- A fresh isolated `0.2.1-rc.3` web profile that includes this plugin:
  - boots without plugin errors and the client bundle loads (no runtime exceptions);
  - the sidebar shows **Learning map** and **Learn**, the map page opens, and
    the docked **Current lesson** tab registers and renders its first-run state;
  - host routes answer: `GET /diagnostic-tutor/api/preferences` → `200`,
    `GET /diagnostic-tutor/api/project/session?courseId=no-such` →
    `404 no-such-course`.


### Changed — one next step, at a glance

The route page now leads with a single **Next step** card instead of making the
learner work out which card to act on. It states where they are (`Step 2 of 4`),
what to do next in one sentence, and exactly one primary action: set the goal,
request or answer the diagnosis, request the route, accept the version, start
the first lesson, or continue the current one. A secondary action appears only
when it is a real alternative (skip the diagnosis, request a revised route).

The competing repeats are gone: the diagnosis stage keeps its explanatory card
but no second action row, the route stage keeps its version browser but moves
request/accept into the Next-step card, and the empty-state cards and the
diagnosis "in progress" card were removed rather than stacked under the same
guidance. Goal-stage and route-stage pages are now just the stage bar, the next
step, and folded history. Starting or continuing a lesson from the map now also
opens the Current-lesson tab.


### Changed — "enter learning" resumes the conversation that owns it

A project is shared, but its focus, planned runs and teaching attempts belong
to a conversation. Opening a project from the library, or pressing **Open
current lesson**, used to bind the project to whichever conversation was on
screen — so continuing a project from a fresh chat started a second, empty
attempt. Those entry points now ask the host which conversation was last
learning the project (`GET /project/session`, read-only) and, when it differs,
switch there with the shell's own session navigation and dock the current-lesson
tab. Resolution order: newest active focus, newest course run with an attempt,
newest project selection; the asking conversation is only the fallback when the
project has never been touched. A profile without the navigation service keeps
the old behaviour.


### Changed — DeepSeek brand accents

The plugin's own accent is now DeepSeek's brand blue — `#4d6bfe` on the light
canvas and `#6a84ff` on the dark one — used sparingly: the stage progress bar,
the active Learning-map tab, the current/selected route node and lesson row,
focus rings, action links, and hover washes. The primary action fill keeps the
host's near-black (light) / near-white (dark) button token, because on DeepSeek
surfaces the blue marks and does not act. A new `--dt-brand*` token family
derives the soft wash and line from the accent and is restated for the dark
theme at the same level as the roots.


### Changed — the route page shows one stage at a time

The course-route page no longer stacks every card at once. A small progress bar
names the four stages (goal & time, initial diagnosis, route, learning) and the
body only shows the stage the project is actually in. Goal editing stays in the
header; the diagnosis card owns the page until it is complete or skipped; route
versions take over only after that; once a route is accepted the page leads with
the route canvas and the selected Overview.

The initial diagnosis now has an explicit **in progress** state: while the tutor
is asking questions in the conversation, the page says so and offers **Open
conversation** (and **Skip initial assessment**) instead of showing a waiting
card that looked stalled. An empty route area explains which step is missing.
Folded sections (**Initial diagnosis summary**, **Route versions and settings**)
keep the history reachable without leading the page, and the effort card only
appears when the estimate conflicts with the saved time budget.

### Changed — every surface follows one language switch

The last English-only chrome now follows the same English/Simplified-Chinese
switch as the Learning map and course route: the docked **Current lesson** tab
(welcome and library states, node map rows, focus controls, teaching region and
empty states), the standalone full-page panel used by the preview and tests, the
next-step card, the handoff progress line, the welcome feature row, and the
sidebar **Learn** action with its missing-conversation explanation. The tab chip
and panel headers switch in place.

Shared copy lives in `learning-text.ts`; the two larger surfaces keep their own
`tab-text.ts` and `panel-text.ts`. Both surfaces carry a language toggle. English
defaults are unchanged, so the existing contract is preserved.

The shared store's own status lines (started/focus recorded/export/delete
feedback) are translated too. Deliberately untranslated: node, course and
lesson content; model-written reasons; server/model error text and dynamic
handoff details as generated; the `Learning map` sidebar panellist label
(registered once when the plugin loads, so it cannot follow an in-place
switch); and the development preview's own toolbar.

Verified with 587 tests, typecheck, production build, 24 browser cases, and
clean map/tab/panel visual audits.

### Changed — one learning page and one current-lesson surface

The plugin is no longer three destinations. **Learning map** is the only
main-column page (course route, knowledge & evidence), and **Current lesson**
is the only teaching surface, docked beside the chat. The full-page learning
panel was removed from the plugin's registrations; the conversation keeps the
main column, and a check can always be answered without leaving the lesson.

The docked tab no longer offers **Open full view**, and the map page no longer
switches to a full-page lesson panel: its **Open current lesson** button returns
to the conversation and opens the lesson tab in the same step. The map's sidebar
label and its `main` key still come from one id, and the Learn action still opens
the tab without replacing the conversation.

The standalone full-page component remains exported for the preview and the
tests, but it is not reachable from the running plugin. The loader log now
reports the real number of registered tools instead of a hardcoded four.

### Added — interactive goal setup and a versioned course route

A learning project can now keep a saved goal brief (purpose, observable
outcomes, self-reported background, deadline/time zone, available weekly time,
session size and preferences), an evidence-referenced initial assessment, and
multiple immutable route proposals. The multi-step form saves incomplete drafts;
opening an Overview never starts a lesson. Initial diagnosis and route
proposals are requested from the tutor after the learner saves the brief and
explicitly completes or skips the assessment. Accepting a proposal is a
separate learner action. A route includes ordered modules and lesson Overviews
from first to final, required/optional prerequisite edges, outcomes, outline,
practice, assessment criteria and effort ranges with budget-conflict options.

The route graph and ordered lesson list are two views of the same curriculum
revision. Each project, module and lesson can be opened as an Overview; later
lessons can be browsed without being started. The current lesson is pinned to a
session's accepted route version, and a replan cannot move another conversation.
Starting a planned lesson persists a run and attempt before the tutor is woken;
it does not fabricate a diagnosis node. Teaching is stored as attempt-owned
snapshots, retries and review preserve history, and lesson completion does not
imply mastery. After each completion the tutor compares fresh evidence with the
remaining route and may propose a materially changed draft; the learner still
accepts it explicitly. A stale attempt cannot bind nodes, append teaching, or
use another conversation's evidence.

The project aggregate and per-session run are additive v1 storage tables, so
existing v1 stores open without migration. Planning records and lesson snapshots
are included in export and reset; no real learner data was used in verification.

Verified with 568 tests, typecheck, production build, 24 browser cases, and clean
map/panel/tab visual audits. A temporary DSH 0.2.1-rc.2 profile also saved a goal
draft and skipped the initial assessment through the real plugin API.

### Added — a Chinese interface, switchable in place

The Learning map page, the course route and the lesson panel now ship copy in
English and Simplified Chinese. A toggle in the map header changes the interface
language without a reload; the same choice applies to the course route and the
pinned lesson, which share one language store.

The preference is saved on the learner profile (`preferredLanguage`) through
`GET /preferences` and `POST /preferences/language`, so it survives a DSH
restart and follows the learner across conversations. The browser applies the
choice immediately and saves in the background; an unreachable host keeps the
local choice. Before the preference loads, a Chinese browser locale starts in
Chinese and everything else keeps the existing English default.

This is interface copy only. Tutor-written teaching, goal text, lesson content
and recorded evidence are not translated, and no tool contract changed.
Diagnosis-side surfaces (full learning panel, docked tab) remain English; the
new page and the course route are the translated surfaces.

Verified with 579 tests, typecheck, production build, 24 browser cases (each one
also switching to Chinese and back, with no learner-data request), and clean
map/panel visual audits.

### Added — the diagnosis map as its own page

The map and the lesson answer different questions, and sharing one column made
the map read as a footnote under the teaching. It now has a page of its own,
**Learning map**, reached from a sidebar entry of its own, from the full panel's
header, and from the docked tab's map section.

The page puts the tree on the left and the selected node's evidence on the
right, with the same state census and glyphs as the other surfaces, plus
**Open learning view** and **Back to the conversation**. It is a second main
panel rather than a replacement for the teaching panel, and it reads the same
`useLearning` state: no teaching decision, stored record or next-step copy
changes.

`?surface=map` renders it in the preview. Tests pin both main panels, the single
panellist entry (Learn stays an action seat), and the page's selection and
navigation.

### Changed — the Learning surfaces now show the map, not just list it

A presentation-only pass over both surfaces. Nothing about state semantics,
stored records, teaching decisions or the copy that says what to do next
changes; the runtime is the same one v0.1.1 shipped.

- The full panel's course header is a cover card with an orbit mark, and this
  conversation's position is its own card rather than a run of prose.
- The diagnosis map gained a **state census bar** — one segment per state
  present, sized by node count. It is a census of the seven state words, not a
  progress percentage, and it never becomes a score.
- Every map row carries a state glyph badge (a book for `explained`, a pen for
  `practiced`, a lock for `blocked`, a seal for `confirmed`), so a row is
  recognisable before it is read.
- The middle column gained **Where this sits**: parent, current node and
  children as a small selectable tree, so a node's connection is visible
  without scanning back across the page.
- Evidence is drawn on a rail, one marker per observation, instead of as
  unattached lines.
- The lesson surface gained a card treatment, type icons for worked examples and
  diagrams, a quiet reading rail on prose, and a stronger check card.
- Every empty place — first use, no project, no lesson, no evidence — now has a
  line-art figure and a short explanation rather than a bare sentence; first use
  also lists the three things that will fill the page.
- The docked tab mirrors the same language in compact form: course cover, state
  census, glyph rows and block marks.
- Motion is entrance-only and turned off under `prefers-reduced-motion`.

Verified: 455 tests, `pnpm typecheck`, `pnpm build`, UI audit with no findings on
the panel, tab and first-use states in both themes, and the 20-case browser
scroll check.

### Added — a `showcase` preview scenario

A mixed-state nine-node map (one per state word, plus nested children) so the
visual layer can be reviewed without manufacturing state by hand.

## [0.1.1] — DSH 0.2 compatibility, and one next action per surface

The first stable release after v0.1.0 keeps the same runtime and fixes what the
first real sessions exposed: conversation state leaked between chats, the next
step was offered twice, long surfaces could not scroll, and the tutor-skill check
looked at the wrong scope. It is verified on DSH `0.2.1-rc.2` and `0.2.0-rc.2`.

### Verified

- `pnpm typecheck` and `pnpm build` pass against the DSH `0.2.1-rc.2` cohort.
- 455 tests across 27 files pass on `0.2.1-rc.2`; the same suite also passes on
  `0.1.7-alpha.2`.
- `pnpm audit:ui` reports no findings on the panel and the docked tab in both
  themes; `pnpm check:scroll` passes 20 real-browser scroll cases.
- Fresh isolated profiles on DSH `0.2.1-rc.2` and `0.2.0-rc.2`: the plugin loads,
  **Learn** opens the docked tab, **Open full view** opens the main panel, and
  the browser reports no console errors.

### Changed — DSH 0.2 compatibility

Verified against DSH `0.2.1-rc.2` (the desktop line) and `0.2.0-rc.2` (the npm
`latest` line), and the full suite still passes on `0.1.7-alpha.2`. The host
pinned `zod` to `4.4.3` and moved its storage-domain and tools peers onto the
`0.2` line; the plugin now aligns its runtime `zod`, its dev cohort and its
declared peer lines with those releases. No teaching, storage or UI logic
changed.

On a fresh isolated profile running DSH `0.2.1-rc.2`, the plugin loads, the
sidebar **Learn** entry opens the docked tab, and **Open full view** opens the
main panel — with no console errors. The docked tab's scroll container and the
panel's three-column layout were checked in that host, not only in the preview.

### Fixed — the Learning UI said the wrong thing about what to do next

With a Next Best Step recorded, both surfaces still offered `Start learning`: the
panel showed it at primary weight beside `Continue learning`, and the docked tab
showed it beside the recommendation's own button. Worse, the teaching region
told the learner to press it — `Press Start learning and the teaching appears
here` — while the recommendation was the move the tutor had just recorded, and
starting a node the learner had not been sent to would quietly record a different
focus.

The control a learner sees is now derived from what is actually true rather than
re-decided per surface. With a recommendation pending there is **no start control
at all**: the card owns the next move. `Start learning` exists only before
anything is focused. A focused node says `Learning in progress` instead of
inviting a start that already happened, and the control acts on the node it
names — the focus — so browsing the map cannot retarget a press that belongs to
this conversation.

The copies that were describing the wrong state now describe the real one.
`Lesson ready` no longer prints above the lesson it is announcing, which the
docked tab did for as long as the record existed; the teaching region names the
button that is actually on the page, using that button's own verb
(`Continue learning` for a move, `Continue` for a stay, and the recommendation
outranks a stale "the tutor is preparing this node" once a decision is pending);
and the empty-focus invitation appears only when nothing is focused. Both
surfaces render all three from the same pure functions, so they cannot drift
apart again.

Regression tests pin every state — the pure helpers directly, both surfaces
through the DOM, and a live tab test that the wait line disappears once the
lesson is on the page. Reverting each rule in turn fails the matching test.

### Fixed — Learning surfaces could not scroll inside DSH

The docked tab relied on document scrolling, but DSH clips its bounded tab slot.
It now has a height-bounded, border-box scroll container, so long lessons, maps,
evidence and library lists remain reachable in both docked and expanded tabs.
The full panel scrolls as one page when stacked; its three-column layout keeps
independent pane scrolling, and long welcome/library views scroll in the wrapper.

The preview now clips its slot too, instead of hiding the defect with document
scrolling. `pnpm check:scroll` exercises real Chrome wheel input and checks bottom
content visibility, slot containment and no document/horizontal overflow across
20 viewport/theme/content combinations. It uses only local fixture data.

### Fixed — teaching-brain detection follows the live Agent

The plugin previously inspected the global Skill catalog once during activation.
A global Office provider could make that catalog nonempty and trigger a missing
tutor warning even when UDT was available in the conversation's Agent scope.
Every overview now resolves the requested live Agent and queries the official
Skill snapshot and loader with that Agent's scope and session cwd. Empty or
incomplete discovery, missing services, unsupported snapshot APIs and Agent
replacement during discovery return `null`; surfaces continue to warn only on
`false`. Existing polling sees delayed registration, removal and session changes
without plugin reload. Activation no longer logs a profile-wide absence claim.

Regression tests cover real scoped catalogs with global Office entries, both
availability states, unavailable scope, discovery errors, delayed registration,
removal and replacement, plus exact scope/cwd propagation.

### Fixed — the docked tab had no theme at all

`.dt-tab` was missing from the rule that declares the panel's design tokens. A
custom property that does not resolve does not fall back to a sensible default:
it makes the whole declaration invalid at computed-value time. So the docked
Learning tab — the surface the learner keeps open beside the chat — had no card
surfaces, no borders, and a **primary button that was white text on nothing**,
which on a light page is an invisible button. Measured at 1:1 contrast against
its own background, in the real product, in light mode. `.dt-tab` is now in the
token rule, and a test renders both surfaces and fails if any root they produce
is missing from it.

### Fixed — dark mode

`--dt-accent` was bound to `--dsw-alias-button-primary-fill`, which inverts with
the theme (near-black in light, near-white in dark), and every filled control
paired it with a hardcoded `#fff`. In dark mode the primary button and the check
block's header band were white on white — 1.05:1, verified in a live profile
before and after. The stylesheet now uses the design system's own pairing,
`--dsw-alias-label-primary-foreground`, which inverts with the fill.

### Fixed — three filled buttons, one column

The panel showed `Learning in progress`, `Continue`, and `Answer in the chat` at
once, all at primary weight. Which one to press is not a style question. The
recommendation now owns the primary weight when there is one; the door back to
the chat and the start control step down to secondary, and the start control
says `Restart this node` when the tutor is already on it — it was labelled with a
state, not an action. The docked tab had the same collision.

### Fixed — the map did not show where the learner is

`data-focused` was computed and rendered by both maps from the first release and
had no rule in the stylesheet, so the one question the map exists to answer was
the one it did not show. There is now a marker on the focused row. The panel's
map also gained the depth guides, the state chip and the blocker tint that only
the tab had had, and `data-focused={false}` no longer renders as
`data-focused="false"` — a boolean on a `data-*` attribute is a string, and it
matched every row.

### Fixed — reading

- **Raw ISO timestamps in the evidence list.** `2026-09-28T05:27:53.946Z` is now
  `19 hours ago`, or a date once a relative phrase stops being useful.
- **A handoff line that counted seconds forever.** A restored record printed
  `Lesson ready 119803s`. Past a minute the unit changes: `1m 34s`, `33h 16m`.
- **`*emphasis*` printed its own asterisks.** The inline parser handled bold,
  code and math but not the most ordinary thing a writer types.
- **Inline code had no treatment while inline math did**, so the most common
  inline token in a programming lesson was the one that looked like an accident.
- **"No evidence yet — nothing has been observed for this node"** was printed
  directly above a list headed `Evidence 3`. The state definition is the skill's;
  the sentence now describes the state instead of counting the page.
- **Contrast.** `confirmed` and `weak` were green-500 and amber-500 on white —
  2.2:1 and 2.1:1, the two hardest labels on the map to read in light mode. The
  seven state colours are now a per-theme palette, each at least 5:1 against its
  own surface.

### Fixed — the preview had been a blank page

`preview/index.html` drove `apply()` with a stub context that had no `get()`,
which `apply()` reaches for first. The call threw before the panel mounted, so
the standalone preview rendered nothing. The stub now answers every service the
entry point uses, and the page gained a scenario switch (`first-use`, `map`,
`handoff`, `next`, `stay`, `noskill`, `long`), a theme switch, and the real DSH
design tokens — without which a dark-mode bug is invisible locally.

### Added — `scripts/ui-audit.mjs`

Audits contrast, dead class names, competing primary controls, tap targets and
clipping at each target width in both themes, and saves screenshots. It found
the tab's invisible button, the dark-mode 1.05:1 controls, and two class names
(`kind`, `when`) that the JSX still used after the stylesheet had moved on.

## [0.1.0] — first stable release

The first release meant to be installed rather than built. `dsh plugin --profile
web add dsh-diagnostic-tutor` and the runtime is there: no clone, no
`pnpm install`, no `pnpm build`, no `link:` dependency.

### What it does

A diagnosis-first learning runtime for DeepSeek Harness. The teaching lives in
the [Universal Diagnostic Tutor](https://github.com/SenmuuuuW/universal-diagnostic-tutor-skill)
skill; this package is the runtime that stores what the tutor decided, shows it,
and never decides it. Goal → Diagnose → Map → Learn → Check → Decide → Next
lesson, with the learner pressing Continue.

### Closing UX

The empty state no longer asserts anything about detection. It says what the
panel works with, how to start, and what to check if nothing happens — which is
the honest thing to say from a scope that cannot always tell whether the skill
is installed.

### Known limitations, stated rather than implied

- **Skill presence cannot always be detected.** The registry reads the global
  layer unless given a viewing scope, and the standard web profile mounts skills
  per agent, so a profile-root plugin sees an empty catalog either way. Reported
  as `null` — *cannot tell* — and the panel stays quiet.
- **Math is styled, not typeset.** `\(...\)` and `\[...\]` are set apart in a
  monospace face; they are not rendered. A real typesetter needs fonts and CSS
  the single-file client bundle cannot serve.
- **Storage is a single document.** `<dsh-home>/storages/udt.json` holds every
  record. A record that fails its schema stops the plugin loading; nothing is
  deleted, the failure names the table and key, and `GET /export` on a healthy
  store is how you keep a copy.
- **The tutor does not always converge.** It can judge `more-practice` on the
  same node repeatedly, each time with a fresh check. That is its pacing, not
  the runtime's, but it decides whether a node ever finishes.

Not present, and not claimed: PDF or document ingestion, RAG, flashcards,
resource libraries, analytics, course generation.

### Tests

256 across twenty-one files.


## [0.1.0-rc.1] — packaging and clean install

The first release meant to be installed rather than built. Two storage decisions
were taken first and are now frozen; one detection bug was found by testing the
package the way a user would.

### Storage: frozen for v0.1.0

`single` layout, no `per-record`, no id migration. The
`invalidRecords: 'backup-and-skip'` declaration was **removed**: under this
layout the platform ignores it, so it read like a recovery guarantee while doing
nothing. The recovery strategy is the one the README states — precise errors
naming the table and key, nothing destroyed, export/reset, hand repair.

### Fixed: a false negative that shipped in v0.0.10

v0.0.10 added a panel notice for "no tutor is installed". It was wrong in the
standard web profile — and stayed wrong in a way that only a clean install would
show. The registry's `list()` reads **the global layer alone** unless given a
viewing `scope`, and the web profile mounts the filesystem skill provider
**inside a per-agent group** (`skill-filesystem` is `disabled: true` at the top
level and re-declared nested). From a plugin at the profile root the catalog is
therefore empty whether the skill is missing or merely out of sight.

Measured on both profiles with the skill installed and demonstrably in use:
`teachingBrain: false`. The notice would have fired for everyone.

Detection is now tri-state — `true` / `false` / `null`, where `null` means
*this scope cannot tell* — and the panel warns only on `false`.

Also fixed: `GET /overview` **omitted** `teachingBrain` and `handoff` on the
no-course path, so the notice could never have appeared in the first-use state
it was written for.

### Packaging

- Version `0.1.0-rc.1`; keywords, `repository`, `homepage`, `bugs`, `engines`,
  and a `files` allowlist of `lib`, `cordis.patch.yml`, `README.md`, `LICENSE`.
- The tarball ships **prebuilt** output. Verified contents: no `src`, `tests`,
  `preview`, `docs`, `scripts`, no store or session data, no local paths.
- Installing it pulls in **`dsh-diagnostic-tutor` and `zod` — and no
  `@deepseek-ai/*`**, so no second copy of the DSH runtime. Every harness
  package is a peer, satisfied by the installation.

### Clean-room install: verified

A profile created from the shipped `web` template, with nothing else in it:

```
dsh --profile udt-clean --from-default-profile web --dump-config
dsh plugin --profile udt-clean add dsh-diagnostic-tutor-0.1.0-rc.1.tgz
```

Bundles resolve to `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`,
`dsh-diagnostic-tutor`. The client bundle is served, **Learn** appears in the
sidebar, and the panel renders the map, the node and the lesson from a real
store. No clone, no `pnpm install`, no `pnpm build`, no `link:` dependency.

### Without the skill: verified

Skill removed, profile restarted: the plugin loads, `/overview` and `/export`
both answer 200, the panel mounts, and no local path appears in any response.
`teachingBrain` reports `null` rather than claiming an absence it cannot prove.

### README

Install is now npm-first: `dsh plugin --profile web add dsh-diagnostic-tutor`,
with `web` explained as a shipped template that is created on first use, and a
`--from-default-profile` recipe for a custom name. The checkout-and-build path
moved to Development. A new section states the no-skill behaviour and the
tri-state honestly, including that the runtime cannot always tell.

### Tests

255 across twenty-one files. New: an empty catalog is not evidence of absence
and a populated one is; the overview carries `teachingBrain` and `handoff` even
before a goal exists; and `null` survives the round trip to the browser.


## [0.0.11] — the storage layout, tested rather than flipped

The goal was to switch to `layout: 'per-record'` so that `invalidRecords:
'backup-and-skip'` would start working. It was tested against the platform
first. **It is not viable, and the switch was not made.**

### What the migration does — verified, and good

A real store was copied and opened under a `per-record` domain. Everything
seeded, nothing was lost, and the original file was left untouched:

| | before | after |
| --- | --- | --- |
| courses | 1 | 1 |
| nodes | 6 | 6 |
| lessons | 3 | 3 |
| focus | 1 | 1 |
| next dec. | 2 | 2 |

### Why the switch was not made

In `per-record`, a record key becomes a path segment and must match
`[a-zA-Z0-9_-]+`. Every write through the domain was then rejected:

```
unit 'udt': per-record key '机器学习' is not path-safe (must match /^[a-zA-Z0-9_-]+$/)
```

It is not about non-ASCII: `ml:math` is rejected too. Every node, lesson and
decision id in this plugin is `<courseId>:<slug>`, and course ids are derived
from the learner's own words. Flipping the layout would have shipped a runtime
that can read and cannot write — worse than the limit it was meant to fix.

`dsh-storage-json` is also the only backend in the tree, so there is no
alternative medium to route to.

Making the ids path-safe is a referential migration across five tables plus a
change to the ids the tutor passes back to the tools. That is a deliberate
change, not a layout flag, and it is left as a decision rather than taken as a
side effect.

### So: `single`, unchanged, with the limit stated

`layout` stays `single` and `invalidRecords: 'backup-and-skip'` stays declared —
correct intent, currently inert, and now documented as inert. The README
section on storage says plainly what is true (a damaged record fails the open,
is reported with its table and key, is not deleted, and the plugin loads inert
rather than failing the profile) and what is not (no backup-and-skip today, no
claimed recovery).

### Regression: everything else, verified on a real harness

| | |
| --- | --- |
| Goal → Map | 6 nodes, states `blocked` / `checked` / `unconfirmed` |
| Lesson | 5 blocks, read back through the API |
| Evidence / state | 3 entries on the node, `checked` |
| Focus | present, on the node the last run moved to |
| Next Best Step | correctly absent — the pending one was acted on |
| Export | 1 course, 6 nodes, 3 lessons, 1 focus, 2 decisions |
| Reset | clears everything and returns to first run |
| Restart, unload | covered by the suite; the domain closes and reopens clean |

On-disk structure, unchanged: `<dsh-home>/storages/udt.json`, one document with
`unit` / `global` / `tables`, and six tables.

### Tests

250 across twenty-one files, unchanged. **No test was added for backup-and-skip,
because it does not run** — a passing test there would have been the most
misleading artifact this release could produce.


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
