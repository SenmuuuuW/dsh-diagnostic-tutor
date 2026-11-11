# 1.0.0 Release Gate

Status: candidate; publish only after all gates.

| Gate | Result |
| --- | --- |
| typecheck | pass |
| tests | **767 / 73 files** |
| Node 22.19 / 24.x | pass / pass |
| build | pass |
| browser path-check | 31/31 |
| Fresh first-run E2E | pass with scripted learner; real Tutor goal/diagnosis/route/accept/lesson/check/evidence |
| Tutor goal/diagnosis/route/lesson/check/evidence | pass |
| Export/import API round trip | pass (1 course/3 nodes/1 lesson) |
| 0.4.1 → 1.0 upgrade | pass |
| 0.13.0 → 1.0 upgrade | pass |
| 1.0 → 0.13 rollback | pass |
| Rollback | pass |
| Feature flags off | pass |
| Candidate/approval isolation | pass (v0.13 tests) |
| Scene continuity/controls | pass (v0.13 final package) |
| Candidate worker | development bridge only |
| Real learner | **0** |
| Independent review | **0** |

Package: 204 files, packed 681,104 bytes, unpacked 3,225,416 bytes, shasum `f892dda5f500d372c40752dac06c6a0ba5fdc2bf`, SHA-256 `5d65d45656f601ef10e7579dfa482722d401c24fcb14637041279a0294201dd3`.

Release scope: stable Core Tutor. Dynamic Scenes and auto-generation remain
experimental, default-off, human-approved only.

## Publication result (2026-11-11)

- npm `dsh-diagnostic-tutor@1.0.0` initially; 1.0.0/1.0.1 deprecated for dependency security; **1.0.2 is latest**
- tags/releases `v1.0.0`, `v1.0.1`, `v1.0.2` on GitHub
- public main commit at release `1c5a4df0cf01447d6549c727fe6c7194263e6aea`; docs follow-up may advance Main
- Main CI success on Node 22.19 and 24.x
- public Registry install smoke passed
- package 204 files, shasum `aa925f2f6011941cfe979494cef40a0414c624a2`, SHA-256 `836c1f632bf4d1197fab82a1c3c1037d7d11a5219c5d8fcc953c76ad2f7983f5`
- Dynamic Scenes and auto-generation remain experimental/default-off
- real learners 0; independent review 0; no learning-gain claim
