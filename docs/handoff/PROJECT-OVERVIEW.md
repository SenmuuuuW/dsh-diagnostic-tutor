# Project Overview

Diagnostic Tutor turns DeepSeek Harness into a diagnosis-first learning workspace.
The product loop is:

Goal → Diagnosis → Course → Interactive Teaching → Check → Evidence → Next Step.

Differentiators:

- diagnosis before content generation;
- evidence is recorded, not inferred from animation playback;
- the Teaching Skill decides what/how to teach; the Runtime validates, renders,
  persists and records;
- learners control Continue; runtime never declares mastery;
- dynamic scenes are default-off and require local human approval.

Long-term target: an open-source AI Learning Workspace with generated interactive
explanations, but production must remain safe. AI auto-generation is still
research-only.

Handoff plan: DSH/Codex owns the engine through v1.1; after v1.1 Claude owns
UI/UX, Course Workspace and Interactive Classroom. This directory is the
baseline for that handoff, not the final handoff package.
