# 0.8.0 release readiness (local, not published)

Status: development candidate on `feat/v0.8.0-scene-engine`. **No git push,
npm publish, tag, GitHub Release or real-profile update was performed.**

## Included

- `scene` lesson block (additive) with bounded SceneSpec and mandatory fallback;
- approved-scene production Study player behind a default-off feature flag;
- code-reviewed approval registry and canonical digest boundary;
- presentation-only scene progress in existing Study persistence;
- research SceneSpec state extension and AI Generation v2 benchmark data.

## Verification evidence

| Gate | Result |
| --- | --- |
| typecheck | pass |
| tests | **731 / 65 files** |
| Node 22.19 | 731 pass |
| Node 24.16 | 731 pass |
| build | pass |
| browser path-check | 31 / 31 |
| DSH `0.2.2-rc.1` isolated package smoke | plugin 0.8.0, domain v1, 21 tools, issues [], scene-config enabled |
| real DSH scene E2E | approved scene, checkpoint, params, save, refresh, manual Continue, flag-off fallback; evidence unchanged |

## Package candidate

- `dsh-diagnostic-tutor-0.8.0.tgz`
- files: 186
- packed: 633,523 bytes
- unpacked: 2,985,352 bytes
- npm shasum: `befab14937024f5e62fc6b0ee9c3e0f50e1a68d0`
- SHA-256: `1adfa57cbb048cc8feb217a82c10874629b944a17633c5b2e1b364741f8b2c93`

The tarball must be re-created if source changes after this note.

## Not done

- publish/tag/push;
- real learner evaluation;
- approval of AI-generated scenes;
- typed Tutor→Scene synchronization (v0.9 host dependency).

## Release recommendation

**Production scene playback: Conditional Go to RC**, for the one approved scene
catalog and default-off flag. **AI auto-generation: No-Go** for production.
