# Invariants

Never break:

1. **Diagnosis-first**: content follows evidence about the learner, not a fixed
   syllabus.
2. **Skill/Runtime separation**: Runtime validates/renders/persists; the skill
   decides teaching and checks.
3. **Evidence integrity**: no score/mastery from animation playback; quiz answers
   are responses plus neutral practice evidence; only the tutor records
   check/transfer evidence.
4. **Learner-controlled Continue**: no auto-advance on scene playback or quiz
   submit; no auto Tutor call on restore.
5. **No automatic mastery**: runtime never sets `confirmed` from a response.
6. **Safe scenes**: no model JavaScript/HTML/CSS/URLs; strict SceneSpec + visual
   gate; default-off feature flag; static fallback.
7. **Approval security**: code-reviewed registry or interactive local human CLI;
   no Approve HTTP route; content mutation invalidates digest; no model
   self-approval.
8. **Local-first storage**: `udt` domain v1, additive migrations, no silent
   destructive migration.
9. **Research/production boundary**: research named-state DSL and AI generation
   are not production features until separately approved.
10. **No fake evidence**: do not claim learner study, human review, or model
    repair success without real records.
