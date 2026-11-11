# Testing

## Local

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm doctor
```

Node 22.19 and Node 24.x are both expected to pass.

## Browser regression

```bash
pnpm preview
node scripts/path-check.mjs http://127.0.0.1:8391/ /tmp/udt-browser
```

## Real DSH E2E

Use an isolated `DSH_HOME`; never the real profile:

```bash
DSH_HOME=/tmp/udt-e2e dsh --profile e2e --no-open --port 8523
```

Install the Skill in the temporary workspace `.agents/skills/`, install the
candidate tarball, and drive the browser. Scripted learner answers must be
labelled scripted, not real participants.

## Upgrade/rollback

1. Install `0.4.1` in an isolated profile.
2. Seed data with the 0.4.1 state module.
3. Back up `storages/`.
4. Install the new tarball and verify counts.
5. Restore the backup and reinstall 0.4.1 to exercise rollback.

## Release gate

- typecheck/tests/build
- Node 22.19 + 24.x
- browser path-check
- final tarball DSH E2E
- feature flag off
- 0.4.1 upgrade + rollback
- public registry install smoke
