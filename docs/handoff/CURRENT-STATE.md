# Current State

Snapshot: v0.12.0 development, local only; npm public version remains 0.4.1.

## Capabilities

Production: diagnosis, courses, lessons, Study, Review, sources/PDF pages,
images, quizzes, evidence, local scene approval/playback behind default-off flag.

Research: SceneSpec generation v4, structured contract drift repair, limited
semantic point-on-circle and line-slope checks, staged generation v11, and a
controlled Tutor → Scene Candidate → local review → attach bridge.

## Verified

- **762 tests / 72 files** at v0.12.0.
- Candidate bridge: real Tutor request -> controlled research scene -> local CLI approval -> Tutor attach -> Study -> scripted check -> explicit check evidence -> Tutor next decision.
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
