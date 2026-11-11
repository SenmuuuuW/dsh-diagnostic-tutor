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

## Publication result (2026-11-11)

- npm `dsh-diagnostic-tutor@0.13.0`, dist-tag `latest`
- npm tarball hash matches local final package: `6e4e4f2c2e20c120155ee96aeb0b15937b57dc4a` / `a096c65f...`
- GitHub main fast-forwarded to `655949d`; CI run `42955562962` success on Node 22.19 and 24.16
- Git tag/release: `v0.13.0`
- Fresh isolated install from the public registry reports plugin 0.13.0
- Experimental Dynamic Scenes and Candidate generation remain default-off; no automatic approval.
