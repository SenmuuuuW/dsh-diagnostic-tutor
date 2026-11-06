# Evidence semantics

This is a runtime contract, not a teaching decision. The Skill owns the judgment;
the runtime keeps observations and refuses unverified mastery.

## Terms

| Term | What it is | What it is not |
| --- | --- | --- |
| **Interaction** | A learner action recorded by the runtime: a quiz/flashcard submission, a Study position, a plan item completion | correctness, mastery |
| **Evidence** | A dated observation attached to a node (`goal-stated`, `diagnosis`, `explanation`, `practice`, `check`, `transfer`) | a score or a mastery percentage |
| **Mastery** | The tutor's own readiness judgement, bounded by the runtime's confirming-evidence floor | something the runtime computes from answers |

## What creates evidence

- `udt_map_update op=add-evidence` — the tutor's explicit observation. This is
  the only path that can create `check`, `explanation` and `transfer` evidence.
- `udt_quiz_update` / the Study answer endpoint — records a quiz/flashcard
  response and appends **one neutral `practice`** observation for that
  `(attempt, block)`. Re-submitting updates the response snapshot; it does not
  append a second practice observation.
- A `check` block answered in chat is not a block response. After the learner
  actually answers, the tutor may record a `check` observation through
  `udt_map_update` with the active attempt. Displaying the check, opening Study,
  or moving a slider creates **no** evidence.

## Mastery floor

- `practice` and `explanation` never allow `confirmed` by themselves.
- Only `check` or `transfer` can support `confirmed`, and even then the tutor
  still decides whether readiness is real.
- `confirmed` is never set by a quiz score, a completion count or a UI event.
- The runtime never advances the route, changes the next step or recalculates a
  grade because an interaction happened.

## Duplicates

- Quiz/flashcard evidence is deduplicated by the deterministic note
  `Submitted <kind> response for <blockId>.` plus `attemptId` and `sessionId`.
- A changed answer after first submission is one interaction, not two.
- The tutor should not add a second check evidence for the same answer or record
  evidence from re-reading old text.

## Current coverage

Implemented and tested for quiz/flashcard dedupe and explicit check evidence
through the existing map tool. There is no automatic grading, no per-answer
score, no FSRS/analytics and no runtime mastery inference.
