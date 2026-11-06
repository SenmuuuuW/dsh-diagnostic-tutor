# 0.6.0 development readiness

> Status: **release-gate passed with documented limitations, not published**. Branch
> `feat/v0.6.0-learning-materials`, based on the prepared 0.5.0 release.
> No git push, npm publish, tag or GitHub Release has been performed.

## Included

- one-block incremental lesson writes with stable ids, idempotent retries,
  conflicts, optional run-revision checks and full validation;
- local PDF extraction with page-aware sources and citations;
- local PNG/JPEG/WebP assets, backup/restore and an `image` lesson block;
- evidence dedupe and explicit interaction/evidence contract;
- Study save ordering / page-hide hardening.

## Release gate

Full gate evidence: `V0.6.0-RELEASE-GATE.md` (Node 22.19 + 24.16, real arXiv PDF quality, package/DSH smoke test).

## Verification gate

```text
pnpm typecheck                  OK
pnpm test                       704 passed (62 files)
pnpm build                      OK
scripts/path-check.mjs          31 browser cases passed
real DSH 0.2.2-rc.1 E2E         PDF + image import, append, figure/image,
                                quiz answer, practice evidence, review, insights
isolated tarball load            plugin 0.6.0, udt v1, issues []
```

Detailed real-model evidence: `V0.6.0-E2E.md`. Design: `V0.6.0-ARCHITECTURE.md`.
Evidence rules: `EVIDENCE-SEMANTICS.md`.

## Package

- `dsh-diagnostic-tutor-0.6.0.tgz` (built from this branch; not published)
- files: 162
- packed size: 575,815 bytes
- unpacked size: 2,722,768 bytes
- npm shasum: `5bf36d1bc721892d40641de1c70b9f526371c6a2`
- SHA-256: `b77b5abea21513d158efb6195c9b2549ae4f411394634d151ce55bad60327f79`
- isolated DSH `0.2.2-rc.1` load: 200, 21 tools, domain `udt` v1, no issues.

The final tarball must be re-created after the final commit; the values above are
the verified local candidate built before the last doc/test-only changes.

## Outstanding before a formal release

- [ ] Re-run the full gate on the final commit.
- [ ] Re-create and re-hash the tarball.
- [ ] Test the packaged tarball in a clean DSH profile.
- [ ] Update the real user-installed Skill if desired.
- [ ] Explicit approval for push/tag/publish.
- [ ] Optional: human review of PDF extraction quality on real textbooks and
      image rendering across viewports.
