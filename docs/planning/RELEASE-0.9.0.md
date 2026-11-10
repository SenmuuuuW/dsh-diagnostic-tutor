# 0.9.0 release readiness (local, not published)

Status: local development candidate on `feat/v0.9.0-scene-quality`.
**No push, tag, npm publish, GitHub Release or real-profile update.**

## Included

- shared Visual Quality Gate and browser frame inspector;
- human-only local Review/Approval CLI + read-only browser review;
- local digest registry with revocation, audit and warning acknowledgement;
- client read-only `/scene-config` approved list; no approve HTTP route;
- Generation v3 real-model research with 10 new cases and honest no-scene
  decisions;
- Scene→Quiz teaching boundary tests.

## Verification

| Gate | Result |
| --- | --- |
| typecheck | pass |
| tests | **744 / 67 files** |
| Node 22.19 | 744 pass (final run pending in notes if not repeated) |
| Node 24.16 | 744 pass |
| build | pass |
| browser path-check | 31 / 31 |
| v3 browser render | 6 / 6 scenes |
| visual browser inspection | approved 6 frames; bad v2 11 frames; 0 exceptions |
| DSH 0.2.2-rc.1 package E2E | flag on playback/restore/continue; flag-off fallback; evidence [] |
| no-approve HTTP | `POST /scene-config` → 404 |
| CLI approve | real interactive approval; non-TTY refused |

## Package

- `dsh-diagnostic-tutor-0.9.0.tgz`
- 194 files
- packed 657,902 bytes
- unpacked 3,089,468 bytes
- npm shasum `a04a80f65722ccad587c9a62bea17856bd15af4a`
- SHA-256 `0d65843224649af8a4613a788a50a6c9b2076c6da6ab80789c6a7600f29b46b9`

Recreate the tarball if source changes after this note.

## Not done

- publish/tag/push;
- real learner study;
- approval of any AI-generated v3 scene into production;
- v1.0 Learning Workspace work.

## Recommendation

- Scene playback: **Go for controlled RC** with reviewed scenes and default-off
  flag.
- Local approval workflow: **conditional Go** for developer/local use; no
  multi-user auth claim.
- AI auto-generation: **No-Go** for production.
- v1.0 Learning Workspace: **No-Go currently**; finish learner evidence and
  content operations first.
