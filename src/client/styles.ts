/**
 * The panel's stylesheet.
 *
 * Injected as a `<style data-plugin>` element rather than imported as CSS,
 * because styles never travel through the client bundler: the module table
 * serves one JavaScript file per plugin, so a separate CSS artifact has nowhere
 * to live. This is what the published UI plugins do too.
 *
 * The web styling guide forbids Tailwind and component libraries here, and
 * recommends the design system's semantic custom properties. Every one of those
 * tokens is used with a fallback, so the same stylesheet renders correctly in
 * the standalone preview where no DSH theme is present.
 */

/** Marker attribute so the sheet is injected exactly once, and is findable. */
export const STYLE_ATTR = 'data-diagnostic-tutor-style'

const CSS = `.dt-root {
  --dt-bg: var(--dsw-alias-bg-base, #ffffff);
  --dt-surface: var(--dsw-alias-bg-elevated, #f7f8fa);
  --dt-sunken: var(--dsw-alias-bg-sunken, #f1f3f6);
  --dt-border: var(--dsw-alias-border-secondary, #e3e6ea);
  --dt-border-strong: var(--dsw-alias-border-primary, #cfd4dc);
  --dt-text: var(--dsw-alias-label-primary, #1c1f23);
  --dt-muted: var(--dsw-alias-label-secondary, #6b7280);
  --dt-accent: var(--dsw-alias-brand-primary, #4f46e5);
  --dt-good: #1f8b4c;
  --dt-warn: #b7791f;
  --dt-stop: #c0392b;
  --dt-radius: 10px;

  display: grid;
  grid-template-columns: minmax(260px, 300px) minmax(280px, 1fr) minmax(320px, 1.15fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  background: var(--dt-bg);
  color: var(--dt-text);
  font-size: 13px;
  line-height: 1.6;
  text-align: left;
}
@media (max-width: 1080px) {
  .dt-root { grid-template-columns: 1fr; height: auto; }
}

.dt-pane { min-width: 0; min-height: 0; overflow: auto; padding: 16px 18px 40px; }
.dt-pane + .dt-pane { border-left: 1px solid var(--dt-border); }
@media (max-width: 1080px) {
  .dt-pane + .dt-pane { border-left: 0; border-top: 1px solid var(--dt-border); }
}

/* ---- shared type ------------------------------------------------------- */
.dt-eyebrow,
.dt-tab-section,
.dt-now-eyebrow,
.dt-welcome-eyebrow,
.dt-block-label,
.dt-next-label {
  font-size: 10px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--dt-muted);
  margin: 0;
}

.dt-course-title { font-size: 17px; font-weight: 640; margin: 0 0 6px; letter-spacing: -.01em; }
.dt-goal {
  margin: 0 0 16px; padding: 9px 11px; border-radius: var(--dt-radius);
  background: var(--dt-surface); border: 1px solid var(--dt-border);
  color: var(--dt-muted); font-size: 12px;
}
.dt-goal b { color: var(--dt-text); font-weight: 560; }

.dt-section-title {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--dt-muted); margin: 22px 0 8px;
}
.dt-section-title span { text-transform: none; letter-spacing: 0; font-size: 11px; }

.dt-caption { color: var(--dt-muted); font-size: 11px; margin: 6px 0 0; }
.dt-empty { color: var(--dt-muted); font-size: 12.5px; margin: 8px 0; }
.dt-cta-hint { margin-top: 14px; line-height: 1.6; }

/* ---- first use --------------------------------------------------------- */
/* The full-page variant has no columns to fill, so the question centres. */
.dt-root-welcome { grid-template-columns: 1fr; place-items: center; }
.dt-root-welcome .dt-welcome { max-width: 520px; padding: 8px 24px; }
.dt-welcome { padding: 28px 4px 8px; }
.dt-welcome-eyebrow { color: var(--dt-accent); }
.dt-welcome-title {
  font-size: 21px; font-weight: 660; letter-spacing: -.015em;
  margin: 8px 0 10px; line-height: 1.25;
}
.dt-welcome-body { margin: 0 0 18px; color: var(--dt-muted); font-size: 13px; line-height: 1.65; }
.dt-welcome-sample {
  border: 1px solid var(--dt-accent); border-radius: var(--dt-radius);
  background: var(--dt-surface); padding: 11px 13px;
}
.dt-welcome-sample-label {
  display: block; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--dt-accent); margin-bottom: 6px;
}
.dt-welcome-sample-text { font-size: 13px; line-height: 1.55; }
.dt-welcome-note {
  margin: 18px 0 0; padding-top: 14px; border-top: 1px solid var(--dt-border);
  color: var(--dt-muted); font-size: 11.5px; line-height: 1.6;
}

/* Shown when nothing will teach: honest, actionable, and not a crash. */
.dt-notice {
  margin: 16px 0 0; padding: 11px 13px; border-radius: var(--dt-radius);
  border: 1px solid var(--dt-warn);
  background: color-mix(in srgb, var(--dt-warn) 8%, var(--dt-bg));
  color: var(--dt-text); font-size: 12px; line-height: 1.6;
}
.dt-notice b { font-weight: 640; }

/* ---- now learning ------------------------------------------------------ */
.dt-now {
  padding: 13px 14px 14px;
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius);
  background: var(--dt-surface);
}
/* The state is the headline fact about the node, so it colours the card edge. */
.dt-now[data-state="blocked"] { border-left: 3px solid var(--dt-stop); }
.dt-now[data-state="weak"] { border-left: 3px solid var(--dt-warn); }
.dt-now[data-state="confirmed"] { border-left: 3px solid var(--dt-good); }
.dt-now[data-state="checked"] { border-left: 3px solid #0f8f8f; }
.dt-now[data-state="practiced"] { border-left: 3px solid #5b53d6; }
.dt-now[data-state="explained"] { border-left: 3px solid #2f6feb; }
.dt-now[data-state="unconfirmed"] { border-left: 3px solid var(--dt-border-strong); }

.dt-now-eyebrow { color: var(--dt-muted); }
.dt-now-title {
  font-size: 17px; font-weight: 650; letter-spacing: -.015em;
  margin: 6px 0 8px; line-height: 1.28; overflow-wrap: anywhere;
}
.dt-now-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 9px; }
.dt-now-rel { color: var(--dt-muted); font-size: 11.5px; }
.dt-now-note { margin: 0; color: var(--dt-muted); font-size: 12px; line-height: 1.6; }
.dt-now-action { margin-top: 13px; width: 100%; }

/* ---- diagnosis map ----------------------------------------------------- */
.dt-tree { display: flex; flex-direction: column; gap: 1px; }
.dt-tab-node {
  display: grid; grid-template-columns: auto 1fr auto;
  align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; margin: 0; border-radius: 7px;
  border: 1px solid transparent; border-left: 3px solid transparent;
  background: transparent; color: inherit; font: inherit;
  text-align: left; cursor: pointer; position: relative;
}
/* Depth as a drawn guide rather than only as indentation: a nested node should
   read as nested at a glance. */
.dt-tab-node[data-depth]::before {
  content: ''; position: absolute; left: 4px; top: 0; bottom: 0;
  width: 1px; background: var(--dt-border);
}
.dt-tab-node[data-depth="2"]::before { left: 18px; }
.dt-tab-node[data-depth="3"]::before { left: 32px; }
.dt-tab-node:hover { background: var(--dt-surface); }
.dt-tab-node[aria-current="true"] {
  background: var(--dt-surface); border-color: var(--dt-border-strong);
  border-left-color: var(--dt-accent);
}
/* A blocker should be findable without reading every row. */
.dt-tab-node[data-attention] { background: rgba(192, 57, 43, .05); }
.dt-tab-node[data-attention]:hover { background: rgba(192, 57, 43, .09); }
.dt-tab-node-title { min-width: 0; overflow-wrap: anywhere; line-height: 1.45; }
.dt-tab-node[data-depth="0"] > .dt-tab-node-title { font-weight: 600; }

.dt-dot {
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid currentColor; background: transparent; flex: none;
}
.dt-dot[data-filled="true"] { background: currentColor; }

.dt-state-unconfirmed { color: #8b93a1; }
.dt-state-explained   { color: #2f6feb; }
.dt-state-practiced   { color: #5b53d6; }
.dt-state-checked     { color: #0f8f8f; }
.dt-state-weak        { color: var(--dt-warn); }
.dt-state-blocked     { color: var(--dt-stop); }
.dt-state-confirmed   { color: var(--dt-good); }

/* A tinted chip scans far better than coloured words alone. */
.dt-tab-state {
  font-size: 10.5px; font-weight: 560; letter-spacing: .01em;
  padding: 1px 7px; border-radius: 999px;
  border: 1px solid currentColor; white-space: nowrap;
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.dt-state { font-style: normal; }

/* ---- node detail (full panel) ------------------------------------------ */
.dt-detail h2 { font-size: 16px; margin: 0 0 8px; font-weight: 650; letter-spacing: -.01em; }
.dt-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; }
.dt-chip {
  font-size: 11px; color: var(--dt-muted);
  border: 1px solid var(--dt-border); border-radius: 999px; padding: 1px 8px;
}
.dt-why { margin: 0 0 14px; color: var(--dt-muted); font-size: 12.5px; line-height: 1.6; }
.dt-node {
  display: grid; grid-template-columns: auto 1fr auto;
  align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; margin: 1px 0; border-radius: 7px;
  border: 1px solid transparent; background: transparent;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dt-node:hover { background: var(--dt-surface); }
.dt-node[aria-current="true"] { background: var(--dt-surface); border-color: var(--dt-border-strong); }
.dt-node-title { min-width: 0; overflow-wrap: anywhere; }
.dt-node-rel { display: block; color: var(--dt-muted); font-size: 11px; font-weight: 400; }

/* ---- evidence ---------------------------------------------------------- */
/* Compact on purpose: this is a record, not a reading surface. One row per
   entry, with the note clamped so a long one cannot bury the next. */
.dt-evidence { list-style: none; margin: 0; padding: 0; }
.dt-evidence li {
  display: grid; grid-template-columns: auto 1fr; gap: 2px 8px;
  padding: 7px 0 7px 10px; border-left: 2px solid var(--dt-border);
  font-size: 11.5px; line-height: 1.5;
}
.dt-evidence li + li { margin-top: 2px; }
.dt-ev-kind {
  font-weight: 600; font-size: 11px; color: var(--dt-text);
  text-transform: capitalize;
}
.dt-ev-readiness {
  font-size: 10.5px; color: var(--dt-muted);
  border: 1px solid var(--dt-border); border-radius: 999px; padding: 0 6px;
  justify-self: start;
}
.dt-ev-note {
  grid-column: 1 / -1; color: var(--dt-muted);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ---- buttons ----------------------------------------------------------- */
.dt-primary {
  padding: 7px 14px; border-radius: 8px; border: 1px solid transparent;
  background: var(--dt-accent); color: #fff;
  font: inherit; font-weight: 550; cursor: pointer;
}
.dt-primary:hover { filter: brightness(1.07); }
.dt-primary:disabled { opacity: .5; cursor: default; filter: none; }
.dt-secondary {
  margin-top: 8px; padding: 6px 12px; border-radius: 8px;
  border: 1px solid var(--dt-border); background: transparent;
  color: inherit; font: inherit; font-size: 12px; cursor: pointer;
}
.dt-secondary:hover { background: var(--dt-surface); }

/* ---- lesson ------------------------------------------------------------ */
.dt-lesson { margin-top: 20px; }
.dt-lesson-body {
  border: 1px solid var(--dt-border); border-radius: var(--dt-radius);
  background: var(--dt-bg); padding: 16px 16px 6px;
}
.dt-lesson-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  padding-bottom: 10px; margin-bottom: 14px;
  border-bottom: 1px solid var(--dt-border);
}
.dt-lesson-title { font-size: 15px; font-weight: 650; margin: 0; letter-spacing: -.01em; line-height: 1.35; }
.dt-tab-lesson-title { font-weight: 600; }
.dt-origin {
  flex: none; font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--dt-muted); border: 1px solid var(--dt-border);
  border-radius: 999px; padding: 1px 7px;
}

/* ---- blocks ------------------------------------------------------------ */
.dt-block { margin: 0 0 18px; }
/* A readable measure: full-width prose in a docked panel is tiring. */
.dt-block-md { margin: 0 0 11px; line-height: 1.66; max-width: 62ch; }
.dt-block-md:last-child { margin-bottom: 0; }
.dt-block-md strong { font-weight: 640; }

/* Headings the teaching brain writes inline as ### become real headings. */
.dt-md-h2 {
  font-size: 15px; font-weight: 650; letter-spacing: -.01em;
  margin: 20px 0 9px; line-height: 1.35;
}
.dt-md-h2:first-child, .dt-md-h3:first-child { margin-top: 0; }
.dt-md-h3 {
  font-size: 13.5px; font-weight: 650; color: var(--dt-text);
  margin: 18px 0 7px; line-height: 1.4;
}
.dt-md-ul, .dt-md-ol { margin: 0 0 12px; padding-left: 20px; max-width: 62ch; }
.dt-md-ul li, .dt-md-ol li { margin-bottom: 5px; line-height: 1.6; }
.dt-md-ul { list-style: none; padding-left: 4px; }
.dt-md-ul li { position: relative; padding-left: 16px; }
.dt-md-ul li::before {
  content: ''; position: absolute; left: 3px; top: .62em;
  width: 4px; height: 4px; border-radius: 50%; background: var(--dt-border-strong);
}
.dt-md-ol { list-style: decimal; }
.dt-md-ol li::marker { color: var(--dt-muted); font-variant-numeric: tabular-nums; }

.dt-block-label {
  color: var(--dt-accent); margin-bottom: 7px;
}

/* Worked example: a distinct panel, because it is a different kind of reading
   from the prose around it. */
.dt-block-example {
  border: 1px solid var(--dt-border); border-left: 3px solid var(--dt-border-strong);
  border-radius: var(--dt-radius); background: var(--dt-surface);
  padding: 12px 14px 13px;
}
.dt-block-example h4 { margin: 0 0 9px; font-size: 13px; font-weight: 620; line-height: 1.4; }
.dt-block-example ol { margin: 0; padding-left: 19px; max-width: 62ch; }
.dt-block-example li { margin-bottom: 6px; line-height: 1.6; }
.dt-block-example li::marker { color: var(--dt-muted); font-variant-numeric: tabular-nums; }
.dt-takeaway {
  margin: 11px 0 0; padding-top: 9px; border-top: 1px dashed var(--dt-border);
  font-size: 12px; color: var(--dt-text);
}

/* Diagram: monospace deserves its own frame so it reads as a figure. */
.dt-block-diagram { padding: 0; }
.dt-pre {
  margin: 0; padding: 12px 14px; overflow-x: auto;
  background: var(--dt-sunken); border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; line-height: 1.6; white-space: pre;
}

/* Check: this is the moment the lesson hands over to the learner, so it gets
   the strongest treatment on the surface. */
.dt-block-check {
  border: 1px solid var(--dt-accent); border-radius: var(--dt-radius);
  background: color-mix(in srgb, var(--dt-accent) 5%, var(--dt-bg));
  padding: 0; overflow: hidden;
}
.dt-check-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 9px 14px; background: var(--dt-accent); color: #fff;
}
.dt-check-tag {
  font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 650;
}
.dt-check-where { font-size: 11px; opacity: .9; }
.dt-check-body { padding: 13px 14px 4px; }
.dt-check-body .dt-block-md:last-child { margin-bottom: 11px; }
.dt-check-hint {
  margin: 0; padding: 9px 14px 11px; border-top: 1px dashed var(--dt-border);
  font-size: 11.5px; color: var(--dt-muted);
}
.dt-check-hint span {
  font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
  margin-right: 7px; color: var(--dt-accent);
}

/* ---- math (styled, not typeset) ---------------------------------------- */
.dt-math {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .95em; padding: 0 3px; border-radius: 4px;
  background: var(--dt-sunken); white-space: nowrap;
}
.dt-math-block {
  margin: 0 0 12px; padding: 11px 13px; overflow-x: auto;
  background: var(--dt-sunken); border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; white-space: pre-wrap;
}

/* ---- handoff progress -------------------------------------------------- */
.dt-handoff {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin: 0 0 12px; padding: 8px 11px; border-radius: 8px;
  background: var(--dt-surface); border: 1px solid var(--dt-border);
  font-size: 12px;
}
.dt-handoff-dot {
  width: 7px; height: 7px; border-radius: 50%; background: var(--dt-accent);
  animation: dt-pulse 1.4s ease-in-out infinite;
}
.dt-handoff[data-phase="lesson-ready"] {
  border-color: color-mix(in srgb, var(--dt-good) 45%, var(--dt-border));
  background: color-mix(in srgb, var(--dt-good) 7%, var(--dt-bg));
}
.dt-handoff[data-phase="lesson-ready"] .dt-handoff-dot { background: var(--dt-good); animation: none; }
.dt-handoff[data-phase="failed"] .dt-handoff-dot,
.dt-handoff[data-phase="stalled"] .dt-handoff-dot { background: var(--dt-stop); animation: none; }
@keyframes dt-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
.dt-handoff-label { font-weight: 550; }
.dt-handoff-time, .dt-handoff-try, .dt-handoff-detail { color: var(--dt-muted); font-size: 11px; }
.dt-handoff-detail { flex-basis: 100%; }
.dt-handoff-retry {
  margin-left: auto; padding: 3px 10px; border-radius: 6px;
  border: 1px solid var(--dt-border); background: transparent;
  color: inherit; font: inherit; font-size: 11px; cursor: pointer;
}
.dt-handoff-retry:hover { background: var(--dt-bg); }
@media (prefers-reduced-motion: reduce) { .dt-handoff-dot { animation: none } }

/* ---- next best step ---------------------------------------------------- */
/* The conclusion of a node. It should be the most deliberate thing on the
   surface: what just finished, where it sends you, why, and one button. */
.dt-next {
  margin: 20px 0 4px; padding: 14px 15px 15px; border-radius: var(--dt-radius);
  border: 1px solid var(--dt-accent);
  background: color-mix(in srgb, var(--dt-accent) 6%, var(--dt-bg));
  box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
}
.dt-next-label {
  display: flex; align-items: center; gap: 6px;
  color: var(--dt-accent); font-weight: 650; margin-bottom: 10px;
}
.dt-next-arrow { font-size: 12px; }
.dt-next-from { margin: 0 0 8px; color: var(--dt-muted); font-size: 11.5px; }
.dt-next-tick { color: var(--dt-good); margin-right: 5px; }
.dt-next-target {
  margin: 0 0 10px; font-size: 14.5px; line-height: 1.4; letter-spacing: -.01em;
}
.dt-next-target b { font-weight: 660; }
.dt-next-why { margin: 0; font-size: 12px; line-height: 1.6; color: var(--dt-text); }
.dt-next-why-label { color: var(--dt-muted); }
.dt-next .dt-primary { margin-top: 14px; width: 100%; }

/* ---- docked tab -------------------------------------------------------- */
.dt-tab { padding: 14px 14px 40px; font-size: 12.5px; color: var(--dt-text); text-align: left; }
.dt-tab-head { display: flex; align-items: baseline; gap: 8px; justify-content: space-between; }
.dt-tab-title { font-size: 15px; font-weight: 650; margin: 0; }
.dt-tab-meta { color: var(--dt-muted); font-size: 11px; margin: 4px 0 8px; }
.dt-tab-action { margin-top: 10px; }
.dt-tab-section {
  display: flex; align-items: baseline; gap: 8px;
  margin: 24px 0 8px; padding-top: 14px;
  border-top: 1px solid var(--dt-border);
}
.dt-tab-section span { text-transform: none; letter-spacing: 0; font-size: 11px; }

.dt-block-unknown {
  border: 1px dashed var(--dt-border); border-radius: 8px;
  padding: 10px 12px; color: var(--dt-muted);
}

`

/**
 * Inject the stylesheet once.
 *
 * @returns a disposer that removes the element, so an unload leaves no residue.
 */
export function injectStyles(): () => void {
  const existing = document.querySelector(`style[${STYLE_ATTR}]`)
  if (existing) return () => {}

  const element = document.createElement('style')
  element.setAttribute(STYLE_ATTR, '')
  element.textContent = CSS
  document.head.appendChild(element)
  return () => element.remove()
}
