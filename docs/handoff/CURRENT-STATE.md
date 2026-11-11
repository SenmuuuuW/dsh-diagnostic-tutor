# Current State

Snapshot: **v1.1.0 multimodal candidate**, 767 tests, first-run E2E, import/doctor and legacy upgrade/rollback verified; public release pending final gate.

## Capabilities

Production: diagnosis, courses, lessons, Study, Review, sources/PDF pages,
images, quizzes, evidence, local scene approval/playback behind default-off flag.

Research: SceneSpec generation v4, structured contract drift repair, limited
semantic point-on-circle and line-slope checks, staged generation v11, and a
controlled Tutor → Scene Candidate → local review → attach bridge.

## Verified

- **769 tests / 73 files** at v1.1.0; final published package 1.1.0 `aa925f2f...`.
- Study keeps the unit containing the stored `study.blockId` when the Tutor appends a lesson for another node; scene block id stays stable across appends.
- Candidate bridge: real Tutor request -> controlled research scene -> local CLI approval -> Tutor attach -> Study -> scripted check -> explicit check evidence -> Tutor next decision.
- Full state import with schema/reference validation and restore-on-failure; installation Doctor checks Node, Skill, storage and flags.
- Node 22.19 / Node 24.16.
- Browser path-check 31/31.
- v4 sealed: strict 0/11; deterministic repaired 11/11; browser 11/11.
- v10 vertical slice: real AI scene → local operator approval → Study → quiz;
  node practice evidence exists; attempt evidence stays empty by design.
- No independent human review; no real learner study.

## Known risks

- Models do not yet obey the Canonical Contract strictly.
- Deterministic repair can mask contract drift; strict/normalized/repaired are
  reported separately.
- Semantic verifier coverage is narrow; unverified is not pass.
- Local approval is CLI-only and not multi-user authenticated.
- No typed Tutor→Scene event stream.
- 0.4.1 upgrade verification is still pending.

## Branches

Runtime: `feat/v0.11.0-generative-teaching`.
Skill: `feat/dsh-lesson-block-contract` (unchanged in v0.10/v0.11 unless noted).

## v1.1 multimodal status

- DSH rc.2 is the primary tested host (bundled desktop runtime; not public npm).
- DSH rc.2 image input was tested with actual graph/geometry/chart images; the model read image content and answered ground-truth questions using tool-mediated pixel access.
- Scanned PDFs report no native text layer; OCR is not implemented.
- `udt_material_visual` provides a stored image path for the host agent; this is not a native-vision guarantee.
- Formal handoff entry: `START-HERE.md`.
