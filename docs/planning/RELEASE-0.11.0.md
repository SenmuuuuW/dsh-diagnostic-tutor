# 0.11.0 Release Readiness (local, not published)

Status: local development candidate on `feat/v0.11.0-generative-teaching`.
No git push, tag, npm publish, GitHub Release, or real-profile update.

## Verification

| Gate | Result |
| --- | --- |
| Tests | **758 / 71 files** |
| Node 24.16 | pass |
| Node 22.19 | pass |
| typecheck / build | pass |
| Browser path-check | 31/31 |
| v11 staged browser render | 5/5 |
| DSH 0.2.2-rc.1 final package | plugin 0.11.0, domain v1, 21 tools |
| Final package Study E2E | code-approved scene rendered; final tarball hash above |
| 0.4.1 -> 0.11 upgrade | course/nodes/project retained, UI visible |
| Feature flag | default off |
| AI auto-approval | none |
| Real learner study | **0 participants** |
| Independent human review | **0** |

## Package

- `dsh-diagnostic-tutor-0.11.0.tgz`
- 198 files
- 198 files
- packed 661,458 bytes
- unpacked 3,102,352 bytes
- npm shasum `f9d38e1875d0b356e770807451eed786566f03ce`
- SHA-256 `6e89a7e6af0ce0b4a050c5c894e9915e84bd42f92d38d901dd128cabfcac6e55`

## Release recommendation

**Not yet public-RC.**

Reasons:

- raw strict generation still fails (v4 0/11; staged 1/5);
- real Tutor -> Scene bridge incomplete;
- semantic coverage narrow (1/5 staged; 1/11 v4);
- no independent human review;
- no learner study;
- legacy fixture only covers course/node/evidence;
- rollback not exercised end-to-end.

Recommended public strategy remains a direct latest-stable release after the
blockers close, not sequential development releases. Dynamic scenes stay
default-off.
