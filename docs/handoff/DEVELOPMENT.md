# Development

## Runtime repository

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
node preview/serve.mjs          # http://127.0.0.1:8391
node scripts/path-check.mjs http://127.0.0.1:8391/ /tmp/path-check
```

Node 22.19+ or Node 24.x. The package is ESM TypeScript.

## DSH integration

- Install the packed tarball into an **isolated** `DSH_HOME` profile.
- Use `DSH_DIAGNOSTIC_TUTOR_DYNAMIC_SCENES=1` only for explicit scene tests.
- Never modify the user's primary profile for experiments.
- Use `scripts/seed-scene-dsh.mjs` for a validated Study fixture; add
  `--scene <candidate.json>` for a locally approved AI scene.
- Local review CLI: `scripts/scene-review.mjs`.
  Registry defaults to `$DSH_HOME/storages/diagnostic-tutor-approved-scenes.json`.

## Research

- Scene Lab: `preview/scene-lab/`.
- Visual review: `preview/scene-review/`.
- v4 benchmark/repair: `research/dynamic-lesson-engine/v4/`.
- v11 staged generation: `research/dynamic-lesson-engine/v11/`.
- Browser checks: `scripts/scene-visual-inspect.mjs`,
  `scripts/scene-v4-check.mjs`.
- Real-model runs require temporary credentials/profile; never commit them.

## Collaboration

- One writer per worktree at a time.
- Feature branches; no remote publication without explicit approval.
- Keep production and research commits separate.
- DSH/Codex retains integration/E2E; Claude owns future UI/UX branches.

## Candidate bridge (experimental, v0.12)

Enable only in an isolated profile:

```bash
DSH_DIAGNOSTIC_TUTOR_SCENE_CANDIDATES=1 \
DSH_DIAGNOSTIC_TUTOR_DYNAMIC_SCENES=1 \
DSH_DIAGNOSTIC_TUTOR_SCENE_REGISTRY=$DSH_HOME/storages/approved.json \
  dsh --profile tutor
```

- Tutor tool: `udt_scene_candidate_create` (request only).
- External worker: `scripts/scene-candidate-worker.mjs` (validated scene into
  `needs-review`; no approval).
- Human CLI: `scripts/scene-candidate-review.mjs` list/show/approve/reject/revoke
  (TTY + `APPROVE`).
- Tutor tool: `udt_scene_candidate_attach` (approved + digest + active attempt).
- Real E2E notes: `docs/planning/V0.12.0-TEACHING-E2E.md`.
- The worker is a controlled development bridge, not a production generation
  service.

## v0.13 release/state notes

- Study unit selection: `src/client/lesson-units.ts` picks the unit containing
  the stored Study block; appended units for other nodes do not steal the scene.
- Candidate worker daemon: `scripts/scene-candidate-worker-daemon.mjs` (local
  development bridge; external generator command; no approval/attach/evidence).
- Release: npm `dsh-diagnostic-tutor@0.13.0` latest; tag `v0.13.0`; main CI
  verifies Node 22.19/24.x.
- Dynamic scenes remain default-off and human-approved only.

## v1.0 installation/import

```bash
npx dsh-diagnostic-tutor-doctor
POST /diagnostic-tutor/api/import
npx dsh-diagnostic-tutor-import --root <storages> --file <export.json>
```

State import validates before clearing and restores the previous snapshot on
failure. Asset bytes are exported separately.
