# Scene Lab (v0.7 research)

A standalone browser prototype for the declarative SceneSpec v0. Interprets
validated JSON into SVG with deterministic time; it does not import the
production plugin bundle or write learning state.

```bash
pnpm preview
# http://127.0.0.1:8391/preview/scene-lab/index.html
```

The default page loads `research/dynamic-lesson-engine/examples/gradient-descent.json`.
Paste a generated JSON file from
`research/dynamic-lesson-engine/benchmark/generated/` to inspect it. The
validator rejects unknown fields, URLs, HTML, event handlers, unsafe paths,
unsupported expressions and over-budget scenes.

Controls: Play/Pause (Space), replay, step ±0.5s (Arrow keys), timeline seek,
property sliders, checkpoint jumps, narration, static fallback. With
`prefers-reduced-motion: reduce`, a `reducedMotion: "static"` scene shows its
fallback and disables autoplay.

Research only: no production `scene` block exists.
