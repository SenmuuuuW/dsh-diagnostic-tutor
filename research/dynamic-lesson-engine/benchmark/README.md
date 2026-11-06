# Dynamic Lesson Engine benchmark — raw data and method

This directory is research data, not a published fixture of "good scenes".

## Data

- `cases.json` — 20 learning cases spanning mathematics, physics, CS, economics
  and statistics. Each has objective, learner background, expected behavior,
  misconceptions, required interaction, correctness criteria and accessibility
  expectations.
- `prompts/<id>.txt` — the per-case prompt sent to the model. Batch prompts also
  contained schema summaries and exact output paths; batch boundaries are
  documented in the research report.
- `generated/<id>.attemptN.json` — **raw model output**. Attempt 1 is the first
  generation; later attempts are model repairs. Nothing here is hand-edited.
- `final-manifest.json` — per-case attempt validity, first-pass status, repair
  status and final file.
- `results.json` — machine-readable summary plus manual review fields.
- `renderings/<id>.png` — screenshots of the final valid spec in Scene Lab.
- `renderings/render-results.json` — real browser render state, nodes,
  checkpoint counts, metrics and interaction observations.

## Model and host

- DeepSeek-V4.1-Flash via DSH `0.2.2-rc.1`, isolated `DSH_HOME`.
- Real write/read tools; no remote model API key was committed.
- 20 independent learning requests, generated in batches to reduce repeated
  schema-prompt overhead.
- Repairs were sent only structured validation errors and the exact schema
  constraints; no human edited the JSON files.
- Final scenes were rendered in a real browser through `preview/scene-lab/`
  (headless Chrome CDP, 1440×1000 viewport).

## Measurements

- strict first-pass: validation before any schema compatibility changes
  (2/20);
- reviewed first-pass: validation after documented compatibility rules
  (8/20);
- repair attempted on every first-pass failure (12/20);
- repair success: final valid 20/20;
- browser rendered: 20/20, no uncaught exceptions;
- manual educational review: 15 high, 5 medium, 0 low;
- no human learner study was run, so these are design reviews, not learning
  outcomes.

## Failure preservation

The invalid first attempts are kept for all 20 cases, including the five CS
cases that used a different timeline/state model and required a full rewrite.
They are not relabeled as successful generation. See `results.json` and the
research report for the failure taxonomy and caveats.
