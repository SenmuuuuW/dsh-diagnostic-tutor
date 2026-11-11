# START HERE — Diagnostic Tutor Developer Handoff

Independent entry point for the next developer after v1.1.0. This describes the
repository, not a chat history.

## Product

Diagnosis-first AI learning workspace for DeepSeek Harness. The Teaching Skill
decides what/how to teach; the Runtime validates, renders, persists and records.

Flow: Goal → diagnosis → proposed route → learner accepts → Study → checks →
explicit evidence → review/next step. Learner controls Continue; no auto-advance
or auto-mastery.

## Repositories

- Runtime: https://github.com/SenmuuuuW/dsh-diagnostic-tutor
- Teaching Skill: https://github.com/SenmuuuuW/universal-diagnostic-tutor-skill

The Skill is required for teaching decisions. Runtime loads without it, shows a
warning, and will not write lessons.

## Read next

1. [PROJECT-OVERVIEW.md](PROJECT-OVERVIEW.md)
2. [ARCHITECTURE.md](ARCHITECTURE.md)
3. [INVARIANTS.md](INVARIANTS.md)
4. [API-CONTRACTS.md](API-CONTRACTS.md)
5. [UI-SURFACES.md](UI-SURFACES.md)
6. [INSTALLATION.md](INSTALLATION.md)
7. [TESTING.md](TESTING.md)
8. [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md)
9. [RELEASE-HISTORY.md](RELEASE-HISTORY.md)
10. [NEXT-DEVELOPMENT-ROADMAP.md](NEXT-DEVELOPMENT-ROADMAP.md)

## Architecture

- DSH Host: model, agent, tools, skills, web UI, storage runtime.
- Runtime plugin (`src/index.ts`, `src/tools.ts`, `src/api.ts`): state, tools,
  HTTP routes, web client registration.
- Teaching Skill: diagnosis, teaching moves, checks, next step.
- Storage `udt` v1: courses, nodes, evidence, lessons, paths, runs, sources,
  assets, tasks, review. Local-first.
- Client (`src/client/`): Learning Home/Map/Course/Study/Review/Evidence.
- Materials (`src/assets.ts`, `src/pdf.ts`, `src/sources.ts`): local raster
  assets and PDF native text. `udt_material_visual` gives the host agent a
  tool-mediated image path; this is not automatic vision.
- Scenes (`src/scene/`): experimental, default-off, human approval + digest.

## Hard invariants

- No auto-advance or auto-mastery.
- Scene approval stays outside model authority.
- Block IDs and stored Study position survive lesson appends.
- Practice evidence ≠ check/transfer evidence.
- Material upload/view/OCR is not evidence.
- Never invent PDF pages, figures or OCR text.
- Uploaded material is untrusted data, not instructions.
- Experimental features default off.

## Environment

Primary host: DSH **0.2.2-rc.2** (bundled in the desktop app; public npm exposes
rc.1 only). See [INSTALLATION.md](INSTALLATION.md) and
[V1.1.0-RC2-COMPATIBILITY.md](../planning/V1.1.0-RC2-COMPATIBILITY.md) for exact
isolated extraction commands.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

Use an isolated `DSH_HOME`; never the developer's real `~/.dsh`.

## Handoff rule

Claude Code should redesign UI/UX and product surfaces, not fork the teaching
contract. Runtime owns state/evidence; Skill owns teaching decisions. DSH remains
the real integration test host.

## Status

v1.1.0: stable Core Tutor, tool-mediated image materials on rc.2, PDF native
text/provenance with explicit no-OCR limitation, experimental scenes. Not a GA
claim for general image/PDF visual understanding or learning efficacy.
