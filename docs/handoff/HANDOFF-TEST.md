# Handoff Reproduction Test

Run in a fresh clone/worktree; never the developer's home profile.

```bash
git clone https://github.com/SenmuuuuW/dsh-diagnostic-tutor.git /tmp/udt-handoff
cd /tmp/udt-handoff
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

Then, separately:

```bash
npx -y @electron/asar extract \
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar' \
  /tmp/dsh-rc2-extract
RC2=/tmp/dsh-rc2-extract/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js
mkdir -p /tmp/udt-handoff-workspace/.agents/skills
cp -R /path/to/universal-diagnostic-tutor \
  /tmp/udt-handoff-workspace/.agents/skills/
DSH_HOME=/tmp/udt-handoff-home node "$RC2" \
  --profile e2e --from-default-profile web --dump-config
DSH_HOME=/tmp/udt-handoff-home node "$RC2" \
  plugin --profile e2e add /tmp/udt-handoff/dsh-diagnostic-tutor-1.1.0.tgz
```

Open the printed URL, verify Learning surface and Skill warning absent, then run
one Goal/diagnosis/lesson with a real model.

The tester must configure their own DeepSeek account/API key. No credentials are
committed. Without a model, unit/browser fixture tests still run; real Tutor E2E
is blocked and must be reported as blocked.

Record: commands, host version, model, Skill commit, screenshots, failures.

## Actual run (2026-11-11)

- Fresh detached worktree at the v1.1 release commit.
- `pnpm install --frozen-lockfile`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: 769 / 73 pass.
- `pnpm build`: pass.
- `pnpm preview` + `scripts/path-check.mjs`: 31/31.
- Isolated DSH rc.2 install of the worktree tarball: plugin 1.1.0 booted, 0 learner state, no private credentials used in the installed profile.
- Package hash differences between builds are expected when source-map paths differ; runtime behavior was the same.
