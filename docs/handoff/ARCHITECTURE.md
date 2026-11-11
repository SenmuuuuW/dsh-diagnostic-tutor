# Architecture

## Layers

- **Host plugin** `src/index.ts`: storage domain `udt` v1, model tools, HTTP API,
  prompt/handoff. Owns state, validation, persistence, evidence rules.
- **Teaching Skill** external repository: diagnosis, course design, teaching
  decisions, checks. It writes only through registered tools.
- **Client plugin** `src/client/`: Learning map, Course, Study, Review,
  Insights, Scene renderer. Presentation and learner actions only.
- **Research** `research/dynamic-lesson-engine/`: SceneSpec experiments,
  staged/structured generation, repair, semantic checks, benchmarks. Research
  output is not production-approved.

## Data

One domain `udt` v1 with additive tables: courses, nodes, lessons, focus,
next_steps, handoffs, session_projects, learning_paths, course_runs, sources,
assets, tasks, review_cards, review_log, plus a learner singleton. Reads are
synchronous; writes are serialized mutations.

`CourseAttempt` owns session-scoped teaching units, responses and optional Study
progress. `StudyProgress.scenes` is presentation-only. `attempt.evidence` is not
where quiz practice lives: `recordBlockResponse` appends `practice` evidence to
the attempt's bound diagnosis node, and a retry of the same block is one
observation. The attempt-level evidence list is reserved for completion
references; `[]` there is expected after a quiz.

## Scene engine

- Production validator/contract: `src/scene/spec.js`, `src/scene/contract.js`.
- Visual gate: `src/scene/visual-lint.js`.
- Approval: compiled `approved.ts` + local CLI registry
  (`src/scene/local-registry.ts`), canonical SHA-256, no HTTP approve route.
- Client renderer: `src/client/scene-player.tsx`; remote read-only
  `/scene-config` list; static fallback; no eval/remote resources.
- Research validator adds named `states`/`stateTimeline`; production rejects
  those extensions.

## API

HTTP routes are under `/diagnostic-tutor/api/` behind the DSH loopback trust
fence. `GET /scene-config` is read-only. There is deliberately no model/HTTP
scene approval endpoint; approval is interactive CLI only.

## Boundaries

- No teaching decision in Runtime.
- No direct storage mutation from Skill; tools only.
- No model-generated JS/HTML/CSS/URLs.
- Approval permits rendering, not correctness or mastery.

## Experimental Candidate Bridge (v0.12)

- Model-facing request/status/attach tools; only attach follows approval.
- Candidate records are local review artifacts under the DSH storage root, not
  `udt` evidence.
- Human CLI approval writes the local scene registry; attach recomputes the
  canonical digest and requires the dynamic-scene flag + active attempt.
- Generation itself is an external controlled development worker; no automatic
  production Tutor→model pipeline.
- Candidate/scene/attach do not create evidence; the Tutor records check
  evidence explicitly via `udt_map_update`.

## Candidate lifecycle (v0.12)

`requested -> generating -> generated -> validating -> needs-review -> approved
-> attached`, plus failed/rejected/revoked/expired/cancelled. The model may
request and attach; only the local human CLI may approve. Candidate files are
local review artifacts under the DSH storage root, separate from `udt` evidence.
Attachment recomputes the canonical digest and requires the dynamic-scene flag,
local registry approval and an active attempt.

## Study continuity (v0.13)

`writeCourseTeaching` still records attempt units. The Study client now selects
`pickActiveLessonUnit(units, attempt.study)`: the unit containing the stored
block id, else the latest unit. Appending teaching for another node therefore
does not hide the current scene, while explicit replacement still falls back.

## v1.0 import and doctor

`UdState.importState` validates the whole export against `UdExportSchema`, checks
IDs/references, then clears and rewrites all tables; a failed write restores the
previous snapshot. `POST /import` is the API; `scripts/import-state.mjs` is the
local CLI; asset bytes remain separate.

The Doctor reports Node support, Skill presence, storage writability/first-write,
feature flags and project health. Missing Skill is a warning with an install
instruction, not a crash.

## Multimodal materials (v1.1)

Images remain local raster assets. `udt_material_visual` returns the exact
content-addressed path with a caveat; the host agent must actually read it. PDF
sources preserve native text and page numbers; pages with no native text are
reported, not OCRed. Upload/display/visual access never write evidence.
