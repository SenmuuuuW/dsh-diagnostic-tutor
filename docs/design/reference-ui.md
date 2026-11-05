# Reference UI direction

Derived from the supplied calculus dashboard reference.

## Tokens

- Background: cool grey `#f4f6f8`; surfaces white.
- Ink `#111827`; muted `#6b7280`; border `#e5e7eb`.
- Accent blue `#2563eb` / ink `#1d4ed8`.
- Compact typography: 10–12px labels, 12–13px body, 22–28px page titles, sans-serif.
- Thin borders, 8–12px radii, no heavy shadows.
- One primary action per surface; secondary actions as text links.
- Dense but calm; no KPI dashboard, no gamification, no fake mastery.

## Page direction

- **Today**: title + subtitle; current course card; deadline card; plan; review; courses.
- **Course**: title/goal header; one primary continue; course-scoped tabs `Modules & lessons / Knowledge & evidence / Insights`; module list left, course information/current lesson/actions right.
- **Course generation**: stepper, focused card, save/accept primary.
- **Study**: step rail + content + visual/interaction panel; full screen or split.
- **Review / Knowledge / Insights**: same card and density language.

## Interactive blocks

- `slider`: a safe single-variable expression in `x`, evaluated by a client-side parser (no eval); range, step and initial value are validated by zod. The renderer draws the curve and a live point, and never records an answer.
- `step-through`: 2–12 frames with previous/next controls; learner-paced, never auto-advanced, and not graded.
- Inline checks remain the existing `quiz` block: options, record-answer through `/path/answer`, no score or automatic advancement.
- `figure`: sanitized inline SVG only (shapes, paths, text, gradients), optional fade/pulse/draw animation. Scripts, event handlers, external URLs, images, foreignObject and style attributes are stripped by the client sanitizer; there is no remote image loading.

## DSH constraints

The dark global sidebar in the reference belongs to DeepSeek Harness, not this plugin. The plugin styles the main panel and right study panel to sit inside that shell; it must not recreate shell navigation.

## Not yet ported

- Study interactive block schemas and visuals beyond the current block renderer

- Study full/split visual shell beyond current layout rules
- Interactive block schemas (slider, step-through)
- Image/animation block types
