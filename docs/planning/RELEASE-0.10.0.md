# 0.10.0 Release Readiness (local, not published)

Status: local development candidate on `feat/v0.10.0-generation-reliability`.
No git push, tag, npm publish, GitHub Release, or real-profile update.

## Verification

| Gate | Result |
| --- | --- |
| Tests | **756 / 70 files** |
| Node 24.16 | pass |
| Node 22.19 | pass |
| typecheck / build | pass |
| Browser path-check | 31/31 |
| v4 browser render | 11/11 |
| DSH 0.2.2-rc.1 | plugin 0.10.0, domain v1, 21 tools |
| Vertical slice | real AI scene -> local approval -> Study -> text -> quiz; evidence [] |
| Approval | CLI-only, non-TTY refused, digest/audit |
| Feature flag | default off; code/local approved only |

## Package

- `dsh-diagnostic-tutor-0.10.0.tgz`
- 198 files
- packed 661,207 bytes
- unpacked 3,101,291 bytes
- npm shasum `423d4102f9dd00811e87c012377c1b46b9e027a2`
- SHA-256 `77960195f48f28f5dea94cd82eeb2619625297926f82ae91cf997bd0454a05b6`

## Release strategy recommendation

Use a **direct latest-stable release** (0.10.0) with the full CHANGELOG and
migration notes, rather than publishing every historical development version.

Rationale:

- storage domain remains v1 and additive;
- release branches 0.5/0.6 are preserved but not linear prerequisites for users;
- 0.7-0.10 are research/development milestones, not independently supported
  npm releases;
- dynamic scene rendering remains default-off and AI generation is not exposed;
- a direct release gives users one coherent compatibility surface.

Before any release:

- independent human review of the local approval workflow;
- real learner pilot;
- final tarball E2E (already used for vertical slice);
- legacy 0.4.1 storage upgrade smoke on a real profile snapshot;
- explicit approval for remote publication.

## Not done

- publish/tag/push;
- independent human approval;
- real learner study;
- v1.0.
