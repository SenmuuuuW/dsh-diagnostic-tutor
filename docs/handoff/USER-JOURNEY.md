# User Journey

1. **Install** Runtime + Skill; run the Doctor.
2. **Open** a DSH conversation.
3. **State a goal** in the learner's own words.
4. **Diagnose** with the Tutor; the runtime records nodes and evidence, never
   inferred mastery.
5. **Accept a route**; the Tutor proposes, the learner accepts, the runtime
   persists.
6. **Study** one block at a time; Continue is learner-controlled.
7. **Check** understanding; quiz answers are stored as responses/practice,
   while check/transfer evidence requires an explicit Tutor decision.
8. **Leave and return**; attempt/study block identity restores the current
   lesson and scene.
9. **Review** due cards and inspect evidence.
10. **Export, import or delete** local data.

Failure paths:

- Missing Skill: warning, no lesson writes, state preserved.
- Export/import invalid: import rejected before clearing state.
- Missing scene approval: static fallback.
- Wrong answer: recorded as response/practice, not mastery.
