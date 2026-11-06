# 0.5.0 Release preparation

> Status: **prepared locally, not published**. Creating a git tag, pushing,
> publishing to npm, or updating a real DSH profile requires explicit approval.
> Current npm release remains `0.4.1`.

## 1. Scope

0.5.0 is a two-part release:

- **Runtime:** focused-Study position persistence and safe resume.
- **Teaching Skill:** the structured lesson-block contract used by the
  external `universal-diagnostic-tutor` Skill.

No `udt` domain version bump is required. `CourseAttempt.study` and
`POST /path/study` are additive; a pre-0.5.0 v1 document opens unchanged.

## 2. Verification gate

Completed on `release/0.5.0` before packaging:

```text
pnpm typecheck                  OK
pnpm test                       683 passed (60 files)
pnpm build                      OK
scripts/path-check.mjs          31 browser cases passed
real DSH 0.2.2-rc.1 E2E         full Goal → Diagnosis → Route → Lesson →
                                Study → quiz/flashcard → Review → Insights
```

The real-model run is recorded in `V0.5.0-E2E.md`. It used an isolated
`DSH_HOME`; the learner's real storage was untouched. Credentials and temporary
profiles from that run were deleted after verification.

## 3. Pre-publication checklist

- [x] Audit both repositories for clean branches and matching contracts.
- [x] `package.json` version → `0.5.0`.
- [x] CHANGELOG release section.
- [x] README status, compatibility row and release notes link.
- [x] Skill contract committed on its own branch.
- [x] Re-run the verification gate on the release commit.
- [x] `npm pack`; inspect file list and sizes.
- [x] Install the tarball in an isolated DSH 0.2.2-rc.1 profile; check
      `/diagnostics` version and domain v1.
- [ ] Confirm no uncommitted files.
- [ ] Obtain explicit approval to merge/push/tag/publish.

## 3.1 Local package evidence

- file: `dsh-diagnostic-tutor-0.5.0.tgz`
- version: `0.5.0`
- files: 146
- packed size: 547,414 bytes
- unpacked size: 2,556,110 bytes
- npm shasum: `1ea00908b4c4458a343d2df1237de2deeb00788d`
- SHA-256: `fe2bcf5fe169abf00e399d2e23a1003f82f385a31875816ffd319aa25a86347f`

Isolated DSH `0.2.2-rc.1` profile (`DSH_HOME=/tmp/udt-release-home`):

- `/diagnostic-tutor/api/diagnostics` → 200
- plugin `0.5.0`, domain `udt` v1, `issues: []`, 18 tools registered
- `/overview` → 200
- `/review` → 200

## 4. Package contents

The npm package ships:

- `lib/` (host half + browser bundle)
- `cordis.patch.yml`
- `README.md`
- `LICENSE`
- `package.json` (npm always includes it)

No source, tests, preview assets or screenshots are included. `zod` and
`katex` remain runtime dependencies; all `@deepseek-ai/*` packages are peers.

## 5. Compatibility

| Item | Prepared version |
| --- | --- |
| plugin | `0.5.0` |
| DSH verified | `0.2.2-rc.1` |
| Node | `^22.19.0 || >=24.0.0` |
| `udt` domain | v1 (unchanged) |
| Skill contract | `lesson_block_contract.md`, committed as Skill branch `feat/dsh-lesson-block-contract` |

The Skill and runtime are separate installs. A Runtime-only 0.5.0 upgrade is
compatible with an older Skill; the Skill contract only adds guidance for
models when a structured lesson surface exists.

## 6. Rollback

If publication is rolled back, `npm dist-tag latest` can point back to `0.4.1`
and the plugin can be pinned to `0.4.1`; no storage downgrade is needed because
the only schema additions are optional.
