# Universal Diagnostic Tutor for DeepSeek Harness

> **From a Tutor Skill to a Learning Runtime.**

A diagnosis-first learning app that runs inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):
it works out where you are stuck, decides the next best teaching step, and turns
the whole process into a living learning map you can click through.

> [!IMPORTANT]
> **Status: `v0.0.4` — there is now a UI.**
> The DSH web GUI gets a three-pane learning panel: the course, its diagnosis
> map, the selected node, and a learning surface. Lessons are **prototypes** —
> deterministic projections of stored state, not generated teaching content.
> There is no quiz engine and no model-written lesson yet. See [Roadmap](#roadmap).

---

## What this is (and is not)

This is **not** a prompt wrapper, and it is **not** a re-implementation of a
tutor. It is the runtime half of a two-part system:

| Part | Owns | Lives in |
| --- | --- | --- |
| **[Universal Diagnostic Tutor](https://github.com/SenmuuuuW/universal-diagnostic-tutor-skill) skill** | *What to teach next* — diagnosis, teaching moves, pacing, mastery judgement | that repository (v2.0, MIT) |
| **This plugin** | *State, artifacts and presentation* — persistent learner state, the learning map, structured lessons, the UI | here |

The plugin deliberately contains **no teaching logic**. Teaching decisions stay
in the skill, which this plugin treats as the canonical teaching brain and
depends on rather than duplicates.

Its state vocabulary is not invented here either: nodes carry the skill's own
seven status terms, and checks carry its six readiness outcomes.

### Why a map does not contradict diagnosis-first

The skill is explicit that a broad goal must **never** become a pre-expanded
curriculum or a course outline. This plugin does not produce one. Nodes appear
only as diagnosis reveals them, every node is `unconfirmed` until a check
produces evidence, and the map is reversible — new evidence moves it. What you
see is a *diagnosis map*, not a syllabus.

---

## Compatibility

A DSH profile can resolve **more than one harness version at once** (the running
host, the shared profile fallback, and each plugin's own store). Treat this
matrix as load-bearing, not decoration.

| This plugin | Verified against DSH | Node |
| --- | --- | --- |
| `0.0.4` | `0.1.6-alpha.2` (also composed under `0.1.5-rc.1`) | `^22.19.0 \|\| >=24.0.0` |

Rules this repository enforces mechanically:

- **Named exports only.** A `export default` plugin makes Cordis' loader prefer
  `.default` and **silently drop `inject`** — a documented DSH outage. Pinned by
  a test that fails if a default export is ever introduced.
- **`@deepseek-ai/*` is imported `type`-only**, so the compiler erases it and no
  second runtime copy can be resolved. Enforced by `verbatimModuleSyntax`, and
  verified on the built artifact (it contains zero imports).
- **No `instanceof` across package boundaries.** Take runtime objects from `ctx`.
- Peer ranges are wide (`<0.2.0`); dev dependencies pin one exact cohort.

---

## Install (development only)

Requires a DSH install and pnpm. `--profile` is **mandatory** — `dsh plugin add`
without it exits non-zero, because `dsh plugin` is a thin pnpm forwarder.

```sh
pnpm install && pnpm build

# use an absolute path: `dsh plugin` runs pnpm inside the profile directory,
# so a relative path would resolve against the profile, not your checkout.
dsh plugin --profile <profile> add "$PWD"

dsh --profile <profile> --dump-config | grep -A2 dsh-diagnostic-tutor
```

A `github:` install additionally requires the user to approve the package's
build script in the profile's `pnpm-workspace.yaml` — which is permission for
that code to run on your machine at install time. **Prebuilt artifacts are the
supported path from `v0.1.0` onward**, so that this step disappears.

---

## Learner state and the diagnosis map

State lives in one Cordis **storage domain** (`udt`, version 1) over the
official `storageDomain` seam. The profile chooses the medium — the standard
profiles route it through `dsh-storage-json` under `dshHomePath('storages')` —
so this plugin never hardcodes a path.

With the json backend you get exactly one document, `<storage root>/udt.json`
(`~/.dsh/storages/udt.json` for a default install):

```json
{
  "unit": { "name": "udt", "version": 1 },
  "global": { "initializedAt": "…", "updatedAt": "…", "activeCourseId": "…" },
  "tables": { "courses": { "…": {} }, "nodes": { "…": {} } }
}
```

| Slot | Holds |
| --- | --- |
| `global` | the learner singleton — preferences, active goal, `initializedAt` |
| `tables.courses` | one record per learning goal, in the learner's own words |
| `tables.nodes` | the diagnosis map: `id`, `courseId`, `title`, `parentId?`, `relation`, `state`, `evidence[]` |

Two deliberate rules:

- **zod is the contract.** Every record is validated at the durable boundary, so
  a hand-edited or corrupt document fails loudly instead of entering memory.
- **No scores, ever.** There is no field for points, grades or percentages —
  the skill forbids turning mastery into a score, and a test asserts that no
  such key exists anywhere in the persisted document.

Records are never mutated in place; writes go through `put`/`set` on one
per-domain write chain, so concurrent writers cannot interleave.

### How the map is kept from becoming a syllabus

The rules are enforced in `src/diagnosis.ts` as pure functions, so no tool can
route around them:

- a node is **born `unconfirmed`**, and stays there without evidence;
- `confirmed` requires a **`check` or `transfer`** evidence entry. Explanation
  or practice alone never confirms — the skill is explicit that "explanation
  alone and one lucky answer never confirm readiness";
- a **goal node can never be confirmed**: it is the frame of the map, not a
  claim about the learner;
- every non-goal node must attach to a **parent that already exists** in the
  same course, and there are no cycles — so the map grows outward from what has
  been diagnosed, one step at a time;
- **at most 8 nodes per call and 40 per course.** A single call cannot plant a
  term's worth of material;
- `relation` is `goal | part-of | prerequisite | related`. There is deliberately
  no `next-in-course`, because nothing in this runtime knows a teaching order.

### Tools

Four, and none of them decides anything about teaching.

| Tool | Does |
| --- | --- |
| `udt_status` | reports the runtime: domain, version, learner profile, goals, node count |
| `udt_goal_create` | records a goal and plants the map root — and nothing else |
| `udt_map_get` | reads the map with each node's relation, state and evidence |
| `udt_map_update` | `add-nodes` · `set-state` · `add-evidence` |

### Teaching-brain detection

At load the plugin asks the platform's own skill registry whether the
Universal Diagnostic Tutor skill is installed — no path is hardcoded, no skill
root is assumed, and nothing is copied. A missing catalog, a missing skill and
an unreadable body each degrade to a reported status rather than an error.

Compatibility is probed by **capability**, not by a version string: the skill's
maintenance contract permits only `name` and `description` in frontmatter, so
it cannot declare a version. The result carries a short content digest as a
version hint.

Detection results stay **internal** — logged at `debug`, absent from every tool
output. The skill forbids naming its files, versions or repository in
learner-facing text, and this runtime will not be what leaks them.

### The temporary runtime adapter

The skill's guardrails say mastery tracking must never become "scores,
databases, hidden memory, or a curriculum roadmap". This runtime deliberately
persists state and renders a map, so it tells the teaching brain which reading
is in force: one short system-prompt section noting that state here is explicit
and user-visible, that stored state is evidence to be re-checked rather than
truth, and that the map is diagnosis-driven and reversible.

It carries no teaching logic, names no file or version, and is contributed only
when the teaching brain is present. It is a **v0.0.x bridge** — the intent is to
resolve the tension in the skill itself before v0.1.0.

## The panel

The browser half registers two things and nothing else: a sidebar icon
(`sidebar.panellist`, a `list`) and the page it opens (`main`, a `keyed` slot).
The sidebar `id` and the panel `key` come from one constant — a drift between
them would leave the icon opening nothing.

It reads as one sentence, left to right:

```
[ Course + Diagnosis Map ]  →  [ Selected node ]  →  [ Learning surface ]
```

There is no dashboard: three panes, and the map is the navigation.

### Learning Blocks

A block is `{ id, type, content, metadata? }`. The **schema is host-side**
(zod-validated at the durable boundary) and the **renderers are browser-side**,
keyed by `type`:

| Type | Content |
| --- | --- |
| `text` | `md` — markdown, with the skill's `\(...\)` math convention |
| `example` | `title`, `steps[]`, `takeaway?` |
| `diagram` | `format` (`ascii` \| `mermaid`), `spec`, `caption?` |
| `check` | `prompt`, `expect?`, `hint?` — the stop-and-wait surface |

Adding Formula, Code, Comparison, Practice or Resource later means adding one
registry entry, never rewriting the lesson renderer. An **unknown type renders a
readable placeholder** rather than throwing, so a lesson authored by a newer
host still renders here.

### Browser API

Three calls, at `/diagnostic-tutor/api`:

| Route | Returns |
| --- | --- |
| `GET /overview` | the current course and its whole map (`course: null` on a first run) |
| `GET /node?id=` | one node with its evidence, parent and children |
| `POST /lesson {nodeId}` | the prototype lesson, built once and reused after that |

Every request passes a **trust fence**: a bare `ctx.webServer.register()` route
inherits no authentication, so the route checks that the request arrived at a
loopback `Host`, from a loopback `Origin`, and is not marked cross-site. Anything
else gets `403` and no body. The browser receives **views only** — no storage
path, no domain handle, no raw record.

## Preview

The panel takes its API as a prop, so the UI runs with no DSH and no agent:

```sh
pnpm build && pnpm preview     # then open the printed URL
```

`preview/index.html` loads the **real built bundle** through a
`__ModuleLoader__` shim over `preview/fixture.js`, which models a learner who
said "I want to learn machine learning" with shaky maths:

```
Machine Learning            [goal, unconfirmed]
├─ Math Foundations         [prerequisite, blocked]
│  ├─ Linear Algebra        [part-of, unconfirmed]
│  ├─ Calculus              [part-of, unconfirmed]
│  └─ Probability           [part-of, unconfirmed]
└─ Python                   [prerequisite, unconfirmed]
```

To capture the panel from a *live* profile instead:

```sh
pnpm screenshot "<dsh-url-with-token>" preview/dsh-ui.png
```

## Development

```sh
pnpm install
pnpm typecheck   # tsc --noEmit  (host and client)
pnpm test        # unit, guard, DOM, and real-composition tests
pnpm build       # tsc -> lib/ (host) + tsdown -> lib/client.js
```

`tests/harness.ts` mounts the **same storage stack the standard profiles use**
(`systemPrompt` → `tools`, and `storage` → `storage-json` → `storage-domain`)
over a temporary root. Persistence tests therefore exercise a real
serialize → file → reparse → validate round trip rather than a fake, and
`--dump-config` is never mistaken for proof that a plugin loads: that only
shows a loader row exists.

## Roadmap

| Version | Ships |
| --- | --- |
| `v0.0.1` | installable bundle, plugin loads, guard + composition tests |
| `v0.0.2` | `udt` storage domain, learner round-trip, `udt_status` tool |
| `v0.0.3` | teaching-brain detection, `udt_goal_create`, the diagnosis map (`udt_map_get` / `udt_map_update`), runtime adapter |
| `v0.0.4` | **current** — the client half: slot-mounted panel, clickable map, node detail, Learning Blocks, prototype lesson, browser API |
| `v0.0.5` | model-written lessons and the check → mastery update → next best lesson loop |
| `v0.0.6` | state export/reset, settings, i18n |
| `v0.1.0` | **first playable MVP** — Goal → Map → Lesson → Check → Progress → Next |

## Trust

DSH does not sandbox plugin code: an installed plugin runs in-process with your
privileges, and a bare `ctx.webServer.register()` route inherits no
authentication. This plugin's commitments:

- reads and writes only its own storage domain;
- serves its browser half only from loopback-fenced routes it checks itself;
- makes no outbound network requests;
- writes no files outside the harness's own storage;
- keeps learner state visible, exportable and deletable — never hidden memory.

## License

MIT. The Universal Diagnostic Tutor skill is a separate MIT project by the same
author and is not vendored here.

Planning and architecture research for this project live in
[`docs/planning/`](docs/planning/).
