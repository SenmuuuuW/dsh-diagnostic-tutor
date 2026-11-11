# UI Surfaces (v1.0)

- **Learning Home / Library**: welcome, create/select project, export/delete.
- **Learning Map**: diagnosis map, evidence, next step, lesson dock.
- **Course**: Goal → Diagnosis → Route preview → accepted route; modules, lessons.
- **Study**: one block at a time; Continue is learner-controlled; half/main/full
  screen; quiz/flashcard; optional approved scene with static fallback.
- **Review**: due cards, grade/undo.
- **Knowledge & Evidence / Insights**: read-only status and evidence.
- **Data Footer**: export and double-confirm delete.

Stable invariants for future UI work: block identity must survive append; do not
select the latest unit blindly; never auto-advance or auto-mastery; scene
approval is outside the UI's authority.
