# Installation (v1.0.0)

## Requirements

- Node.js `^22.19.0 || >=24.0.0`
- DeepSeek Harness `0.2.2-rc.1` (officially tested; other versions are not
  claimed)
- The `universal-diagnostic-tutor` Skill, installed separately in the
  workspace/profile where the agent runs

## Runtime

```bash
npx -y @deepseek-ai/dsh@0.2.2-rc.1 plugin --profile web add dsh-diagnostic-tutor@1.0.0
```

## Teaching Skill

The Skill is a separate repository and is required for teaching decisions:

```bash
mkdir -p .agents/skills
git clone https://github.com/SenmuuuuW/universal-diagnostic-tutor-skill /tmp/udt-skill
cp -R /tmp/udt-skill/skills/universal-diagnostic-tutor .agents/skills/
```

A profile may place it under `~/.dsh/.agents/skills/universal-diagnostic-tutor`
instead; the runtime may detect it through the DSH Skill catalog.

## Verify

```bash
npx dsh-diagnostic-tutor-doctor
# or, in a checkout:
pnpm doctor
```

Expected output includes:

- Node supported
- Skill found
- storage writable (or first-write guidance)
- feature flags (`dynamicScenes=false`, `sceneCandidates=false` by default)

`doctor --json` is safe: it does not print lesson, goal, evidence or secrets.

## First run

1. Open a conversation in DSH.
2. Tell the Tutor what you want to learn, in your own words.
3. The Tutor creates a goal and diagnoses before teaching.
4. Accept the proposed route when it appears.
5. Enter Study; use Continue and complete checks.
6. Export your data from the Learning surface.

If the Skill is missing, the Learning surface shows a warning and the Tutor
cannot write lessons. The runtime remains usable and your state is intact.

## Data

- All learner data is local under the DSH storage root.
- Export/Delete are available in the Learning surface.
- Import a previously exported state document with
  `POST /diagnostic-tutor/api/import` or
  `npx dsh-diagnostic-tutor-import --root <storages> --file <export.json>`.
- Local image asset bytes are exported separately from state metadata.

## Experimental features

```bash
DSH_DIAGNOSTIC_TUTOR_DYNAMIC_SCENES=1   # render approved scenes only
DSH_DIAGNOSTIC_TUTOR_SCENE_CANDIDATES=1 # request/worker lifecycle only
```

Both default off. There is no automatic approval.
