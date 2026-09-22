# Universal Diagnostic Tutor for DeepSeek Harness

> **From a Tutor Skill to a Learning Runtime.**

A diagnosis-first learning app that runs inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):
it works out where you are stuck, decides the next best teaching step, and turns
the whole process into a living learning map you can click through.

> [!IMPORTANT]
> **Status: `v0.0.2` — persistence and tool seams proven. Nothing user-facing yet.**
> Learner state now persists to disk and a model-callable `udt_status` tool
> reports it. There is still no learning map and no lesson page. See
> [Roadmap](#roadmap) for what lands when.

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
| `0.0.2` | `0.1.6-alpha.2` (also composed under `0.1.5-rc.1`) | `^22.19.0 \|\| >=24.0.0` |

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

## Learner state

State lives in one Cordis **storage domain** (`udt`, version 1) over the
official `storageDomain` seam. The profile chooses the medium — the standard
profiles route it through `dsh-storage-json` under `dshHomePath('storages')` —
so this plugin never hardcodes a path.

With the json backend you get exactly one document, `<storage root>/udt.json`
(`~/.dsh/storages/udt.json` for a default install):

```json
{
  "unit": { "name": "udt", "version": 1 },
  "global": { "initializedAt": "…", "updatedAt": "…" },
  "tables": { "courses": {} }
}
```

| Slot | Holds |
| --- | --- |
| `global` | the learner singleton — preferences, active goal, `initializedAt` |
| `tables.courses` | one record per learning goal, in the learner's own words |

Two deliberate rules:

- **zod is the contract.** Every record is validated at the durable boundary, so
  a hand-edited or corrupt document fails loudly instead of entering memory.
- **No scores, ever.** There is no field for points, grades or percentages —
  the skill forbids turning mastery into a score, and the schema enforces it.

Records are never mutated in place; writes go through `put`/`set` on one
per-domain write chain, so concurrent writers cannot interleave.

## Development

```sh
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # unit, guard, and real-composition tests
pnpm build       # tsc -> lib/ (ESM + .d.ts)
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
| `v0.0.2` | **current** — `udt` storage domain, learner round-trip, `udt_status` tool |
| `v0.0.3` | UDT skill detection; goal creation; the learning map (clickable nodes, prerequisite edges, next-best highlight) |
| `v0.0.4` | lesson page composed of Learning Blocks (text / formula / example / quiz / check) |
| `v0.0.5` | check → mastery update → next best lesson (the closed loop) |
| `v0.0.6` | state export/reset, settings, i18n, docs |
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
