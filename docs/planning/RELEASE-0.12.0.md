# 0.12.0 Release Readiness (local, not published)

Status: local candidate on `feat/v0.12.0-teaching-integration`.
No push/tag/npm/GitHub Release; no real-profile update.

## Verification

| Gate | Result |
| --- | --- |
| Tests | **762 / 72 files** |
| Node 24.16 | pass |
| Node 22.19 | pass |
| typecheck / build | pass |
| Browser path-check | 31/31 |
| v11 staged browser | 5/5 |
| DSH 0.2.2-rc.1 final package | plugin 0.12.0, 24 tools |
| Candidate lifecycle | real Tutor request → real model scene → worker → CLI approval → Tutor attach |
| Real Tutor E2E | goal, diagnosis, lesson, candidate, Study scene, scripted check, check evidence, next decision |
| 0.4.1 upgrade | pass |
| Rollback to 0.4.1 | pass |
| Real learner | **0 participants** |
| Independent education review | **0** |

## Package

- `dsh-diagnostic-tutor-0.12.0.tgz`
- 202 files
- packed 669,190 bytes
- unpacked 3,147,193 bytes
- shasum `ea55d34306538c743d2cef43decc07479e47a256`
- SHA-256 `42537f4b38f265e0a1d9ec6caf50667340bef59940a40fd3827d9ccd90a8c98a`

## Release recommendation

**Core Tutor: release candidate possible after independent review.**
**Scene Playback experimental:** flag-gated, local approval; safe but not GA.
**AI Scene Generation:** research only; not production.
**Full v1.0:** not yet; learner validation and typed generation bridge remain.

## Remaining blockers

- no independent human/education review;
- scripted learner only;
- full scene-control interaction not captured in final Study unit;
- typed SceneSpec tool bridge not implemented; candidate request tool is typed;
- no broad model-repair benchmark in this round;
- semantic coverage limited;
- upgrade fixture limited.
