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

const CSS = `
.dt-root {
  --dt-bg: var(--dsw-alias-bg-base, #ffffff);
  --dt-surface: var(--dsw-alias-bg-elevated, #f7f8fa);
  --dt-border: var(--dsw-alias-border-secondary, #e3e6ea);
  --dt-text: var(--dsw-alias-label-primary, #1c1f23);
  --dt-muted: var(--dsw-alias-label-secondary, #6b7280);
  --dt-accent: var(--dsw-alias-brand-primary, #4f46e5);

  display: grid;
  grid-template-columns: minmax(260px, 300px) minmax(280px, 1fr) minmax(320px, 1.15fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  background: var(--dt-bg);
  color: var(--dt-text);
  font-size: 13px;
  line-height: 1.55;
  text-align: left;
}
@media (max-width: 1080px) {
  .dt-root { grid-template-columns: 1fr; height: auto; }
}

.dt-pane { min-width: 0; min-height: 0; overflow: auto; padding: 16px 18px 32px; }
.dt-pane + .dt-pane { border-left: 1px solid var(--dt-border); }
@media (max-width: 1080px) {
  .dt-pane + .dt-pane { border-left: 0; border-top: 1px solid var(--dt-border); }
}

/* ---- course header ---- */
.dt-eyebrow {
  font-size: 10px; letter-spacing: .09em; text-transform: uppercase;
  color: var(--dt-muted); margin: 0 0 6px;
}
.dt-course-title { font-size: 17px; font-weight: 620; margin: 0 0 6px; }
.dt-goal {
  margin: 0 0 14px; padding: 8px 10px; border-radius: 8px;
  background: var(--dt-surface); border: 1px solid var(--dt-border);
  color: var(--dt-muted); font-size: 12px;
}
.dt-goal b { color: var(--dt-text); font-weight: 560; }

/* ---- map ---- */
.dt-section-title {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 11px; letter-spacing: .07em; text-transform: uppercase;
  color: var(--dt-muted); margin: 18px 0 8px;
}
.dt-section-title span { text-transform: none; letter-spacing: 0; font-size: 11px; }

.dt-node {
  display: grid;
  /* Mark, then title, then the state pill pinned right. The pill stays out of
     the title's way: in a narrow column a leading pill wrapped every row. */
  grid-template-columns: auto 1fr auto;
  align-items: baseline; gap: 7px; width: 100%;
  padding: 6px 9px; margin: 2px 0; border-radius: 7px;
  border: 1px solid transparent; background: transparent;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dt-node:hover { background: var(--dt-surface); }
.dt-node[aria-current="true"] {
  background: var(--dt-surface); border-color: var(--dt-accent);
}
.dt-node-title { min-width: 0; }
.dt-node-rel {
  display: block;
  color: var(--dt-muted); font-size: 10px; margin-top: 1px;
}

/* State is shown as a word and a dot -- never a number. */
.dt-dot {
  width: 9px; height: 9px; align-self: center;
  border-radius: 50%; border: 1.5px solid currentColor; box-sizing: border-box;
}
.dt-dot[data-filled="true"] { background: currentColor; }
.dt-state {
  font-size: 10px; padding: 1px 6px; border-radius: 999px;
  border: 1px solid currentColor; white-space: nowrap;
}

.dt-state-unconfirmed { color: #8b93a1; }
.dt-state-explained   { color: #2f6feb; }
.dt-state-practiced   { color: #5b53d6; }
.dt-state-checked     { color: #0f8f8f; }
.dt-state-weak        { color: #b7791f; }
.dt-state-blocked     { color: #c0392b; }
.dt-state-confirmed   { color: #1f8b4c; }

/* ---- node detail ---- */
.dt-detail h2 { font-size: 16px; margin: 0 0 8px; font-weight: 620; }
.dt-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.dt-chip {
  font-size: 10px; padding: 2px 7px; border-radius: 999px;
  border: 1px solid var(--dt-border); color: var(--dt-muted);
  background: var(--dt-surface);
}
.dt-why {
  border-left: 2px solid var(--dt-border); padding: 2px 0 2px 10px;
  color: var(--dt-muted); margin: 0 0 14px;
}
.dt-evidence { list-style: none; margin: 0; padding: 0; }
.dt-evidence li {
  padding: 7px 9px; margin-bottom: 6px; border-radius: 7px;
  background: var(--dt-surface); border: 1px solid var(--dt-border);
}
.dt-evidence .kind { font-weight: 560; }
.dt-evidence .when { color: var(--dt-muted); font-size: 11px; }
.dt-empty { color: var(--dt-muted); font-style: italic; }

.dt-primary {
  margin-top: 16px; width: 100%; padding: 9px 12px;
  border-radius: 8px; border: 1px solid var(--dt-accent);
  background: var(--dt-accent); color: #fff;
  font: inherit; font-weight: 560; cursor: pointer;
}
.dt-primary:disabled { opacity: .55; cursor: default; }
.dt-secondary {
  margin-top: 8px; width: 100%; padding: 8px 12px;
  border-radius: 8px; border: 1px solid var(--dt-border);
  background: transparent; color: var(--dt-muted);
  font: inherit; cursor: pointer;
}
.dt-secondary:hover { background: var(--dt-surface); }

/* ---- lesson ---- */
.dt-lesson-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 4px;
}
.dt-origin {
  font-size: 10px; padding: 2px 7px; border-radius: 999px;
  border: 1px dashed var(--dt-border); color: var(--dt-muted);
}
.dt-block { margin: 0 0 14px; }
.dt-block-md { white-space: pre-wrap; }
.dt-block-md strong { font-weight: 620; }
/* Math is set apart from prose. Styling, not typesetting -- see blocks.tsx. */
.dt-math {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .95em; padding: 0 2px; border-radius: 4px;
  background: var(--dt-surface);
}
.dt-math-block {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; line-height: 1.6; white-space: pre-wrap;
  margin: 8px 0; padding: 8px 10px; border-radius: 8px;
  background: var(--dt-surface); border: 1px solid var(--dt-border);
  overflow-x: auto;
}
.dt-block-example {
  border: 1px solid var(--dt-border); border-radius: 8px;
  background: var(--dt-surface); padding: 10px 12px;
}
.dt-block-example h4 { margin: 0 0 8px; font-size: 12px; }
.dt-block-example ol { margin: 0; padding-left: 18px; }
.dt-block-example li { margin-bottom: 4px; }
.dt-takeaway { margin: 8px 0 0; color: var(--dt-muted); font-size: 12px; }
.dt-pre {
  margin: 0; padding: 10px 12px; overflow: auto;
  border: 1px solid var(--dt-border); border-radius: 8px;
  background: var(--dt-surface);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; line-height: 1.5;
}
.dt-caption { color: var(--dt-muted); font-size: 11px; margin: 6px 0 0; }
.dt-block-check {
  border: 1px solid var(--dt-accent); border-radius: 8px;
  padding: 10px 12px; background: var(--dt-surface);
}
.dt-check-tag {
  font-size: 10px; letter-spacing: .07em; text-transform: uppercase;
  color: var(--dt-accent); margin-bottom: 4px;
}
/* ---- next best step ---------------------------------------------------- */
/* The recommendation reads as a conclusion, not a notification: it says where
   the last node landed, where it sends the learner, and why. */
.dt-next {
  margin: 20px 0 4px; padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--dt-accent, #4f46e5);
  background: var(--dt-surface, #f7f8fa);
}
.dt-next-label {
  font-size: 10px; letter-spacing: .09em; text-transform: uppercase;
  color: var(--dt-accent, #4f46e5); margin: 0 0 8px;
}
.dt-next-from { margin: 0 0 6px; color: var(--dt-muted, #6b7280); font-size: 12px; }
.dt-next-tick { color: #1f8b4c; margin-right: 5px; }
.dt-next-target { margin: 0 0 8px; font-size: 13px; }
.dt-next-why { margin: 0 0 4px; font-size: 12px; color: var(--dt-text, #1c1f23); }
.dt-next-why-label { color: var(--dt-muted, #6b7280); }
.dt-next .dt-primary { margin-top: 12px; }

/* ---- docked tab -------------------------------------------------------- */
/* Narrow-first: the right column is often a few hundred pixels, so this is one
   scrolling stack rather than columns. */
.dt-tab { padding: 12px 12px 28px; font-size: 12.5px; color: var(--dt-text, #1c1f23); text-align: left; }
.dt-tab-head { display: flex; align-items: baseline; gap: 8px; justify-content: space-between; }
.dt-tab-title { font-size: 15px; font-weight: 620; margin: 0; }
.dt-tab-meta { color: var(--dt-muted, #6b7280); font-size: 11px; margin: 4px 0 8px; }
.dt-tab-action { margin-top: 10px; }
.dt-tab-section {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 10px; letter-spacing: .07em; text-transform: uppercase;
  color: var(--dt-muted, #6b7280);
  margin: 18px 0 6px; padding-top: 12px;
  border-top: 1px solid var(--dt-border, #e3e6ea);
}
.dt-tab-section span { text-transform: none; letter-spacing: 0; }
.dt-tab-node {
  display: grid; grid-template-columns: auto 1fr auto;
  align-items: baseline; gap: 6px; width: 100%;
  padding: 5px 6px; margin: 1px 0; border-radius: 6px;
  border: 1px solid transparent; background: transparent;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dt-tab-node:hover { background: var(--dt-surface, #f7f8fa); }
.dt-tab-node[aria-current="true"] { background: var(--dt-surface, #f7f8fa); border-color: var(--dt-accent, #4f46e5); }
.dt-tab-node-title { min-width: 0; overflow-wrap: anywhere; }
.dt-tab-lesson-title { font-weight: 600; }

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
