# 0.13.0 Release Readiness

Status: local release candidate; publication follows only after gates.

| Gate | Result |
| --- | --- |
| Tests | **764 / 73 files** |
| Node 24.16 / 22.19 | pass / pass |
| typecheck / build | pass |
| Browser path-check | 31/31 |
| Scene continuity + controls | pass (final 0.13 package) |
| Feature flag off | pass (no SVG, fallback) |
| DSH 0.2.2-rc.1 final package | pass |
| Candidate lifecycle | pass |
| Worker daemon | pass (development bridge) |
| 0.4.1 upgrade | pass |
| Rollback backup restore | pass |
| Real Tutor E2E | pass with scripted learner |
| Independent review | **not performed** |
| Real learner | **0 participants** |

## Package

- `dsh-diagnostic-tutor-0.13.0.tgz`
- 202 files
- packed 669,668 bytes
- unpacked 3,149,309 bytes
- shasum `6e4e4f2c2e20c120155ee96aeb0b15937b57dc4a`
- SHA-256 `a096c65f0059cc323d9002688e17c64f39649c16e1eafb2f81bcbc3b32c9dba7`

## Scope

Stable core Tutor; experimental Dynamic Scene remains default-off and
human-approved only. Auto-generation is a local dev worker, not a public
feature. No claim of learning gains.

## Publish sequence

Git integration → final package → npm publish → dist-tag check → isolated install
of the registered package → tag / GitHub release.
