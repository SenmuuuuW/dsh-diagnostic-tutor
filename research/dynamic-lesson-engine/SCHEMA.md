# SceneSpec v0 — research schema

This is a research format, not a production Lesson Block. It is interpreted by a
bounded validator/renderer; model-generated JavaScript, HTML, CSS, URLs and
event handlers are never accepted.

## Shape

```json
{
  "version": "0.1",
  "viewport": { "width": 800, "height": 420, "background": "#ffffff" },
  "metadata": {
    "title": "…",
    "subject": "…",
    "objective": "…",
    "learner": "…",
    "misconceptions": ["…"],
    "expectedUnderstanding": ["…"]
  },
  "properties": [
    { "id": "angle", "label": "angle", "min": 0, "max": 6.28, "step": 0.01, "default": 0.7, "unit": "rad" }
  ],
  "primitives": [
    { "id": "point", "type": "circle", "cx": 180, "cy": 180, "r": 6, "fill": "#dc2626" },
    { "id": "height", "type": "line", "x1": 180, "y1": 180, "x2": 180, "y2": { "expr": "180 - 110*sin(angle)" }, "stroke": "#dc2626", "strokeWidth": 3 }
  ],
  "timeline": {
    "duration": 6,
    "tracks": [
      { "target": { "primitive": "point", "property": "cy" },
        "keyframes": [{ "at": 0, "value": 180 }, { "at": 6, "value": 100, "easing": "ease-in-out" }] }
    ]
  },
  "controls": [{ "id": "angle-control", "kind": "slider", "propertyId": "angle", "label": "angle" }],
  "checkpoints": [{ "id": "cp1", "at": 3, "title": "Predict", "body": "What is the height here?", "pause": true, "learnerAction": "answer" }],
  "narration": [{ "at": 0, "text": "The point traces the circle." }],
  "fallback": { "text": "A static description of the relationship." },
  "accessibility": { "alt": "…", "reducedMotion": "static", "keyboard": true },
  "sourceRefs": [{ "sourceId": "src_...", "locator": "p. 3", "page": 3 }]
}
```

## Primitives

`rect` — `x,y,width,height`; optional `fill,stroke,strokeWidth,opacity,rx`.

`circle` — `cx,cy,r`; optional fill/stroke/opacity.

`line` — `x1,y1,x2,y2`; optional fill/stroke/opacity, `dash`.

`path` — bounded SVG path `d` (M/L/H/V/C/S/Q/T/A/Z commands, numbers, no tags); optional fill/stroke/strokeWidth/opacity.

`text` — `x,y,text`; optional `fontSize` (default 16), fill, anchor (`start|middle|end`), opacity.

`arrow` — `x1,y1,x2,y2`; optional stroke/strokeWidth/opacity. The renderer draws a line plus arrow head; no marker URL.

Numeric fields may be a finite number or `{ "expr": "…" }`. Expression variables are the property ids plus `t` and `duration`; only numbers, `+ - * / ^`, parentheses, commas, `sin cos tan sqrt abs exp log ln floor ceil round pow min max`, `pi`, `e`. Maximum 240 characters.

## Timeline

- `duration`: 0.5–120 seconds; no loop field.
- `tracks`: target exactly one numeric primitive property; 2–100 keyframes per track; keyframes nondecreasing; total keyframes ≤ 800.
- Each keyframe has `at` (seconds), a number/expression `value`, optional `easing` (`linear|ease-in|ease-out|ease-in-out|step`).
- Explicit time only; the renderer has no infinite loop.

## Learning controls

- `properties`: at most 8 numeric sliders; each has id/label/min/max/step/default; optional unit. Reserved ids: `t`, `duration`.
- `controls`: optional slider entries referencing a property.
- `checkpoints`: at most 12; `at`, `title`, `body`, `pause` boolean, optional `learnerAction` `continue|answer`. A pause checkpoint stops playback.
- `narration`: at most 20 cues with `at` + text.
- `fallback.text`: required static description.
- `accessibility`: `alt`, `reducedMotion` (`static|no-autoplay`), `keyboard` boolean.
- `sourceRefs`: at most 6 optional citations; page/pageEnd are positive integers.

## Hard limits

- viewport width 240–1600, height 180–1000.
- 1–120 primitives; 80 tracks; 12 checkpoints; 20 narration cues.
- text 1–200 characters; path 1–4000 characters; expression 1–240.
- colors: named basics, hex, rgb()/hsl() only. No `url()`, `var()`, CSS blocks.
- no scripts, event handlers, external URLs, images/foreignObject, arbitrary HTML/CSS, or unsafe SVG paths.


## Compatibility aliases observed during the AI benchmark

These aliases are accepted by the v0.1 validator and normalized before render.
They are documented schema behavior, not edits to model output:

- IDs may start with a digit: `^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$`.
- Expression identifiers are matched case-insensitively; property IDs keep their
  original spelling in metadata.
- `accessibility.reducedMotion` accepts `true`/`false` as `static`/
  `no-autoplay`.
- `controls` accepts `{type:"slider", target:"propertyId", label?, min?, max?, step?}`
  and normalizes it to `{kind:"slider", propertyId, id?}`.
- A checkpoint without `id` receives a stable array-scoped id; missing `pause`
  defaults to `false`.
- `rect.rx` defaults to 0 and `text.fontSize` defaults to 16.

The strict pre-revision schema produced a 2/20 first-pass rate; these documented
compatibility rules raised the observed first-pass rate to 8/20 without
script execution or external resources. See the research report for both
numbers. They do not turn an invalid first attempt into a successful generation;
raw attempts are retained.
