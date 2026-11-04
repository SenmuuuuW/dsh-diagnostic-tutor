# Study layout rules

Study has three presentations. The choice is explicit; nothing switches on its own.

| Mode | Where | Used for | Not used for |
| --- | --- | --- | --- |
| **Half (side panel)** | Right sidebar beside the conversation | Reading the current lesson while talking to the tutor; checking a reference; glancing at a quiz | Deep practice, long animation, immersive reading |
| **Main area** | Main column | Home, Course, route and course setup | Running a lesson |
| **Full screen** | Right panel expanded to cover the frame | Focused Study: one block at a time, interactive practice, rich visual content | Keeping chat visible, browsing courses |

## Transitions

- **Home / Course → Continue/Start** requests Study in **full screen**.
- **Sidebar lesson → Start focused study** enters Study in **half**.
- The Study header exposes an explicit **Full screen / Leave full screen** toggle. This is the only other way to change presentation.
- **Exit study** returns to the half presentation; closing the tab restores the sidebar geometry.
- Narrow frames follow DSH's own right-panel fullscreen rule; the plugin does not force a breakpoint of its own.

## Invariants

- Chat and reference stay available in half mode.
- Full screen never hides the exit control.
- Entering or exiting Study must not change the current lesson, attempt, step or recorded answers.
- The runtime still records only what the learner submits; layout is presentation, not learning state.
