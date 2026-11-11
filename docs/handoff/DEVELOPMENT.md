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
