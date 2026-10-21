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

import { PATH_CSS } from './path-styles.js'

/** Marker attribute so the sheet is injected exactly once, and is findable. */
export const STYLE_ATTR = 'data-diagnostic-tutor-style'

const CSS = `/* The tokens are declared on every root the plugin renders: the panel's
   wrapper, the panel grid, and the docked tab.

   Each of the three was added for the same reason, one at a time. The wrapper
   was added later and declared none of them, so var(--dt-bg, #ffffff) fell back
   to white on the toolbar and the footer while the columns went dark — a light
   frame around a dark panel, in dark mode only. The tab was never added at all,
   and it is the surface the learner actually keeps open beside the chat: every
   var(--dt-*) inside it resolved to nothing, so the docked tab had no card
   surfaces, no borders and no primary button. A custom property that does not
   resolve makes the whole declaration invalid at computed-value time, which is
   a silent, total loss of styling rather than a visible fallback.

   So: anything that renders as a root of the plugin belongs in this list. */
.dt-root-wrap,
.dt-root,
.dt-tab {
  /* Token names verified against the shipped design system
     (packages/client/ui-theme/src/styles/design-platform.css). Three of the
     earlier names did not exist (bg-elevated, bg-sunken, border-secondary,
     border-primary), so every one of them silently took its hardcoded light
     fallback, and the panel kept light cards inside a dark frame. A fallback
     that is a colour turns a typo into a theme bug. */
  --dt-bg: var(--dsw-alias-bg-base, #ffffff);
  --dt-surface: var(--dsw-alias-bg-layer-1, #f7f8fa);
  --dt-sunken: var(--dsw-alias-bg-module-platform, #f1f3f6);
  --dt-border: var(--dsw-alias-border-l2, #e3e6ea);
  --dt-border-strong: var(--dsw-alias-border-l3, #cfd4dc);
  --dt-text: var(--dsw-alias-label-primary, #1c1f23);
  --dt-muted: var(--dsw-alias-label-secondary, #6b7280);
  /* The brand token resolves to near-black in light mode and near-white in
     dark, which is a foreground colour — not an accent. The button fill is the
     one that stays a button. */
  --dt-accent: var(--dsw-alias-button-primary-fill, #4d6bfe);
  /* …and the fill needs the design system's own foreground, because the fill
     inverts with the theme and a hardcoded #fff does not. White on near-white
     is a blank button: that is what the primary control was in dark mode. */
  --dt-on-accent: var(--dsw-alias-label-primary-foreground, #ffffff);
  /* Accent used as a card edge rather than as ink. A full-strength accent
     border is a black outline in light mode and a white one in dark, which
     shouts louder than the content it frames. */
  --dt-accent-line: color-mix(in srgb, var(--dt-accent) 38%, var(--dt-border));
  /* DeepSeek brand accents. The host's brand token resolves to an ink in both
     themes, so it cannot carry the blue; these are the plugin's own accent and
     are used sparingly — focus, selection, the current stage, action links —
     never as a large fill. The primary *action* keeps the host's near-black
     fill: on DeepSeek surfaces the blue marks, it does not act. */
  --dt-brand: #4d6bfe;
  --dt-brand-ink: #3b56d9;
  --dt-brand-soft: color-mix(in srgb, var(--dt-brand) 10%, var(--dt-bg));
  --dt-brand-line: color-mix(in srgb, var(--dt-brand) 42%, var(--dt-border));
  --dt-good: var(--dsw-alias-state-success-primary, #1f8b4c);
  --dt-warn: var(--dsw-alias-state-warn-primary, #b7791f);
  --dt-stop: var(--dsw-alias-state-error-primary, #c0392b);

  /* ---------------------------------------------------------------------
     The seven state colours.

     These are a reading palette, not a decoration: the state word is the only
     thing that says how far a node has come, so it has to be legible at the
     10.5–12px it is actually set in. The design system's own success and warn
     tokens are green-500 and amber-500 in BOTH themes, which is 2.2:1 and
     2.1:1 on a white panel — the confirmed and weak labels were the two
     hardest things on the map to read in light mode, which is precisely
     backwards.

     So the palette is per theme: darker inks in light, brighter inks in dark.
     Every value below is at least 5:1 against its own panel background.
     --------------------------------------------------------------------- */
  --dt-st-unconfirmed: #5f6672;
  --dt-st-explained: #2563eb;
  --dt-st-practiced: #4f46e5;
  --dt-st-checked: #0f766e;
  --dt-st-weak: #b45309;
  --dt-st-blocked: #c0392b;
  --dt-st-confirmed: #15803d;

  --dt-radius: 10px;

  background: var(--dt-bg);
  color: var(--dt-text);
  font-size: 13px;
  line-height: 1.6;
  text-align: left;
}

/* The dark half of the state palette. Declared on the theme attribute itself
   rather than on the roots, so it also reaches the preview's own legend — and
   it only ever defines --dt-* names, so it cannot leak into the host's
   styling. DSH switches themes with this attribute; it is not a media query. */
body[data-ds-dark-theme] {
  /* DeepSeek's dark-theme blue steps one shade lighter so selection still reads
     on the near-black canvas. */
  --dt-brand: #6a84ff;
  --dt-brand-ink: #8fa4ff;
  --dt-st-unconfirmed: #9aa3b2;
  --dt-st-explained: #7aa2f7;
  --dt-st-practiced: #a5a0f0;
  --dt-st-checked: #4fd1c5;
  --dt-st-weak: #f0a94a;
  --dt-st-blocked: #f2706f;
  --dt-st-confirmed: #4ade80;
}

/* The roots declare their own brand tokens (below), so the dark theme has to
   restate them at the same level; an inherited body value is shadowed. */
body[data-ds-dark-theme] .dt-root-wrap,
body[data-ds-dark-theme] .dt-root,
body[data-ds-dark-theme] .dt-tab {
  --dt-brand: #6a84ff;
  --dt-brand-ink: #8fa4ff;
  --dt-brand-soft: color-mix(in srgb, var(--dt-brand) 14%, var(--dt-bg));
  --dt-brand-line: color-mix(in srgb, var(--dt-brand) 45%, var(--dt-border));
}

.dt-root {
  display: grid;
  grid-template-columns: minmax(272px, 320px) minmax(280px, 1fr) minmax(320px, 1.15fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
@media (max-width: 1080px) {
  .dt-root { grid-template-columns: 1fr; grid-template-rows: none; height: auto; overflow: visible; }
}

.dt-pane { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior-y: contain; padding: 16px 18px 40px; }
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

/* A region that has nothing in it yet.

   Pane three is empty on every arrival, and a bare grey sentence in a large
   white column reads as a failure rather than as a place waiting to be filled.
   A dashed frame says "reserved" instead, and costs nothing when it is
   replaced by the lesson. */
.dt-empty-state {
  border: 1px dashed var(--dt-border-strong); border-radius: var(--dt-radius);
  padding: 14px 15px; margin-top: 10px; background: color-mix(in srgb, var(--dt-surface) 55%, transparent);
}
.dt-empty-state .dt-empty { margin: 0; color: var(--dt-text); }
.dt-empty-state .dt-caption { margin-top: 6px; }
.dt-empty-state .dt-primary { margin-top: 12px; }
.dt-empty-title { font-size: 12.5px; font-weight: 620; margin: 0 0 5px; color: var(--dt-text); }

/* ---- the two layers ---------------------------------------------------- */
/* Shared knowledge on top, this conversation's position below. They have two
   owners, so they get two headings — one heading over both is what made a new
   chat look like the learner's old session. */
.dt-eyebrow-here { margin-top: 18px; }
.dt-shared {
  margin: 2px 0 0; font-size: 11.5px; color: var(--dt-muted);
}
.dt-here { display: block; }
.dt-here-course { margin: 2px 0 0; font-size: 17px; font-weight: 620; line-height: 1.3; }
.dt-here-empty {
  margin: 6px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--dt-muted);
}
.dt-here-focus {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 6px 0 0;
  font-size: 13px;
}
.dt-here-node { font-weight: 600; overflow-wrap: anywhere; }
.dt-here-action { margin-top: 12px; width: 100%; }

/* ---- the learning library ---------------------------------------------- */
/* Projects, not folders: each row is something the learner is part-way
   through, and the only two facts on it are its name and how far it got. */
.dt-library { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.dt-project {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
  padding: 10px 12px; border: 1px solid var(--dt-border); border-radius: 9px;
  background: var(--dt-bg); color: inherit; font: inherit; cursor: pointer;
}
.dt-project:hover { background: var(--dt-brand-soft); border-color: var(--dt-brand-line); }
.dt-project:focus-visible { outline: 2px solid var(--dt-brand, #4d6bfe); outline-offset: 2px; }
.dt-project-name { font-size: 13px; font-weight: 600; }
.dt-project-count { font-size: 11.5px; color: var(--dt-muted); }
.dt-project-go { font-size: 11.5px; color: var(--dt-muted); margin-top: 2px; }
.dt-project:hover .dt-project-go { color: var(--dt-text); }

/* One level up. Deliberately quiet: it is an escape, not an action. */
.dt-back {
  display: inline-block; margin: 0 0 10px; padding: 2px 0; border: 0;
  background: none; color: var(--dt-muted); font: inherit; font-size: 11.5px; cursor: pointer;
}
.dt-back:hover { color: var(--dt-brand-ink); text-decoration: underline; }
.dt-back:focus-visible { outline: 2px solid var(--dt-brand, #4d6bfe); outline-offset: 2px; border-radius: 4px; }

/* ---- the sidebar's Learn action ---------------------------------------- */
/* These are not "inspired by" DSH's sidebar row; they are its values, read out
   of the shipped stylesheet in the app bundle. The reference is .panelRow in
   @deepseek-ai/dsh-client-ui-sidebar — the row Plugins uses:
     border-radius var(--dsw-radius-md); min-height 36px; gap 8px;
     margin 0 2px; padding 7px 8px; line-height 22px;
     hover/active background var(--dsw-alias-interactive-bg-hover);
     focus-visible outline var(--dsw-focus-ring-width) solid
       var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))
       with outline-offset -2px
   Learn cannot BE a panelRow — a panellist entry is contractually a main-panel
   switch — so it reproduces one, in the one seat that has action semantics. */
.dt-learn-wrap { display: flex; flex-direction: column; width: 100%; min-width: 0; }
.dt-learn {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  margin: 0 2px;
  padding: 7px 8px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: none;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
}
.dt-learn:hover { background: var(--dt-brand-soft); }
.dt-learn:focus-visible {
  outline: var(--dsw-focus-ring-width) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.dt-learn > svg { flex: none; }
.dt-learn-label { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* .collapsed .panelRow is a 36px square with no margin or padding. */
.dt-learn-wrap[data-wide='false'] .dt-learn { width: 36px; height: 36px; margin: 0; padding: 0; justify-content: center; }
.dt-learn-wrap[data-wide='false'] .dt-learn-label { display: none; }
/* The reason a press did nothing, said where the press happened. */
.dt-learn-notice {
  margin: 0; padding: 0 10px 4px; font-size: 11.5px; line-height: 1.45;
  color: var(--dsw-alias-label-secondary);
}

/* ---- the two layers ---------------------------------------------------- */
/* Shared knowledge on top, this conversation's position below. They have two
   owners, so they get two headings — one heading over both is what made a new
   chat look like the learner's old session. */
.dt-eyebrow-here { margin-top: 18px; }
.dt-shared {
  margin: 2px 0 0; font-size: 11.5px; color: var(--dt-muted);
}
.dt-here { display: block; }
.dt-here-course { margin: 2px 0 0; font-size: 17px; font-weight: 620; line-height: 1.3; }
.dt-here-empty {
  margin: 6px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--dt-muted);
}
.dt-here-focus {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 6px 0 0;
  font-size: 13px;
}
.dt-here-node { font-weight: 600; overflow-wrap: anywhere; }
.dt-here-action { margin-top: 12px; width: 100%; }

/* ---- the learning library ---------------------------------------------- */
/* Projects, not folders: each row is something the learner is part-way
   through, and the only two facts on it are its name and how far it got. */
.dt-library { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.dt-project {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
  padding: 10px 12px; border: 1px solid var(--dt-border); border-radius: 9px;
  background: var(--dt-bg); color: inherit; font: inherit; cursor: pointer;
}
.dt-project:hover { background: var(--dt-brand-soft); border-color: var(--dt-brand-line); }
.dt-project:focus-visible { outline: 2px solid var(--dt-brand, #4d6bfe); outline-offset: 2px; }
.dt-project-name { font-size: 13px; font-weight: 600; }
.dt-project-count { font-size: 11.5px; color: var(--dt-muted); }
.dt-project-go { font-size: 11.5px; color: var(--dt-muted); margin-top: 2px; }
.dt-project:hover .dt-project-go { color: var(--dt-text); }

/* One level up. Deliberately quiet: it is an escape, not an action. */
.dt-back {
  display: inline-block; margin: 0 0 10px; padding: 2px 0; border: 0;
  background: none; color: var(--dt-muted); font: inherit; font-size: 11.5px; cursor: pointer;
}
.dt-back:hover { color: var(--dt-brand-ink); text-decoration: underline; }
.dt-back:focus-visible { outline: 2px solid var(--dt-brand, #4d6bfe); outline-offset: 2px; border-radius: 4px; }

/* ---- the sidebar's Learn action ---------------------------------------- */
/* It sits at the sidebar foot, above Settings, because that is the only
   action-shaped seat the sidebar offers — a panellist entry is contractually a
   main-panel switch, which is what used to replace the conversation. */
.dt-learn-wrap { display: flex; flex-direction: column; gap: 4px; width: 100%; }
.dt-learn {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 7px 9px; border: 0; border-radius: 8px; background: transparent;
  color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.dt-learn:hover { background: var(--dt-brand-soft); }
.dt-learn svg { flex: none; }
.dt-learn-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* The reason a press did nothing, said where the press happened. */
.dt-learn-notice {
  margin: 0; padding: 0 9px 4px; font-size: 11.5px; line-height: 1.45;
  color: var(--dt-muted);
}

/* ---- panel chrome ------------------------------------------------------ */
/* The page always says what it is and how to get back. The failure this
   answers is concrete: a learner clicks Learn, the conversation is replaced,
   and the first thought is "where did my chat go?". */
/* DSH bounds the slot and clips overflow. Each surface must own its scrolling. */
.dt-root-wrap {
  display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
  overflow: auto; overscroll-behavior-y: contain; background: var(--dt-bg, #fff);
}
.dt-root-wrap > .dt-root { flex: 1 1 auto; min-height: 0; }
@media (max-width: 1080px) {
  /* Stacked panes scroll together, including the toolbar and data controls. */
  .dt-root-wrap > .dt-root { flex: none; }
  .dt-pane { overflow: visible; }
}
/* Rights live under the work, not in the middle of it. */
.dt-foot {
  flex: none; padding: 0 16px 14px; background: var(--dt-bg, #fff);
}
.dt-foot .dt-data { margin-top: 0; }
.dt-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  flex: none; padding: 9px 16px; border-bottom: 1px solid var(--dt-border, #e3e6ea);
  background: var(--dt-surface, #f7f8fa);
}
.dt-bar-id { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.dt-bar-name { font-weight: 620; font-size: 13px; color: var(--dt-text, #1c1f23); }
.dt-bar-sep { color: var(--dt-border-strong, #cfd4dc); }
.dt-bar-note { color: var(--dt-muted, #6b7280); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-bar-back {
  flex: none; min-height: 28px; padding: 5px 12px; border-radius: 7px;
  border: 1px solid var(--dt-border-strong, #cfd4dc); background: var(--dt-bg, #fff);
  color: inherit; font: inherit; font-size: 12px; font-weight: 550; cursor: pointer;
}
.dt-bar-back:hover { background: var(--dt-surface, #f7f8fa); }
/* Secondary: everything in the tab works without it. */
.dt-tab-expand {
  float: right; padding: 2px 8px; border-radius: 6px;
  border: 1px solid var(--dt-border); background: var(--dt-bg);
  color: var(--dt-muted); font: inherit; font-size: 11.5px; cursor: pointer;
}
.dt-tab-expand:hover { color: var(--dt-brand-ink); border-color: var(--dt-brand-line); }
@media (max-width: 640px) { .dt-bar-note { display: none; } }

/* ---- first use --------------------------------------------------------- */
/* The full-page variant has no columns to fill, so the question centres. */
.dt-root-welcome { grid-template-columns: 1fr; grid-template-rows: auto; place-items: center; overflow: visible; }
/* A long project list must grow inside the wrapper rather than shrink and clip. */
.dt-root-wrap > .dt-root-welcome { flex: 1 0 auto; height: auto; }
.dt-root-welcome .dt-welcome { max-width: 520px; padding: 8px 24px; }
.dt-welcome { padding: 28px 4px 8px; }
.dt-welcome-eyebrow { color: var(--dt-accent); }
.dt-welcome-title {
  font-size: 21px; font-weight: 660; letter-spacing: -.015em;
  margin: 8px 0 10px; line-height: 1.25;
}
.dt-welcome-body { margin: 0 0 18px; color: var(--dt-muted); font-size: 13px; line-height: 1.65; }
.dt-welcome-sample {
  border: 1px solid var(--dt-accent-line); border-radius: var(--dt-radius);
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
  border: 1px solid color-mix(in srgb, var(--dt-st-weak) 55%, var(--dt-border));
  background: color-mix(in srgb, var(--dt-st-weak) 8%, var(--dt-bg));
  color: var(--dt-text); font-size: 12px; line-height: 1.6;
}
.dt-notice b { font-weight: 640; }

/* ---- learner data controls --------------------------------------------- */
/* Quiet by default: these are rights, not calls to action. They sit below the
   teaching so they are findable without competing with it. */
.dt-data {
  padding-top: 14px; border-top: 1px solid var(--dt-border);
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
}
.dt-quiet {
  min-height: 28px; padding: 4px 10px; border-radius: 7px; border: 1px solid var(--dt-border);
  background: transparent; color: var(--dt-muted);
  font: inherit; font-size: 11.5px; cursor: pointer;
}
.dt-quiet:hover { background: var(--dt-surface); color: var(--dt-text); }
.dt-quiet:disabled { opacity: .5; cursor: default; }
.dt-data-note { flex-basis: 100%; color: var(--dt-muted); font-size: 11px; line-height: 1.5; }
.dt-data-confirm {
  border-top-color: var(--dt-stop);
  background: color-mix(in srgb, var(--dt-stop) 6%, transparent);
  border-radius: var(--dt-radius); padding: 12px 13px;
}
.dt-data-ask { margin: 0 0 10px; font-size: 12px; line-height: 1.6; }
.dt-data-row { display: flex; gap: 8px; flex-wrap: wrap; }
.dt-danger {
  min-height: 28px; padding: 5px 12px; border-radius: 7px; border: 1px solid transparent;
  background: var(--dt-stop); color: var(--dt-on-accent);
  font: inherit; font-size: 11.5px; font-weight: 550; cursor: pointer;
}
.dt-danger:disabled { opacity: .55; cursor: default; }

/* ---- now learning ------------------------------------------------------ */
.dt-now {
  padding: 13px 14px 14px;
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-radius);
  background: var(--dt-surface);
}
/* The state is the headline fact about the node, so it colours the card edge. */
.dt-now[data-state="blocked"] { border-left: 3px solid var(--dt-st-blocked); }
.dt-now[data-state="weak"] { border-left: 3px solid var(--dt-st-weak); }
.dt-now[data-state="confirmed"] { border-left: 3px solid var(--dt-st-confirmed); }
.dt-now[data-state="checked"] { border-left: 3px solid var(--dt-st-checked); }
.dt-now[data-state="practiced"] { border-left: 3px solid var(--dt-st-practiced); }
.dt-now[data-state="explained"] { border-left: 3px solid var(--dt-st-explained); }
.dt-now[data-state="unconfirmed"] { border-left: 3px solid var(--dt-border-strong); }

.dt-now-eyebrow { color: var(--dt-muted); }
.dt-now-title {
  font-size: 17px; font-weight: 650; letter-spacing: -.015em;
  margin: 6px 0 8px; line-height: 1.28; overflow-wrap: anywhere;
}
.dt-now-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 9px; }
.dt-now-rel { color: var(--dt-muted); font-size: 11.5px; }
.dt-now-note { margin: 0; color: var(--dt-muted); font-size: 12px; line-height: 1.6; }
/* Scoped to the card so it wins over the shared button styles: the card's
   control is full-width whatever weight it is currently carrying. */
.dt-now .dt-now-action { margin-top: 13px; width: 100%; }

/* ---- diagnosis map ----------------------------------------------------- */
/* One row style for both surfaces.
 *
 * The full panel and the docked tab draw the same map from the same tree, and
 * they used to draw it differently: the tab had depth guides, a tinted state
 * chip and a blocker tint, and the panel — the surface with the most room to
 * show them — had none of it. Two presentations of one structure is how a
 * learner learns that the map means different things in different places, so
 * the row is defined once here and the panel borrows it. */
.dt-tree { display: flex; flex-direction: column; gap: 1px; }
.dt-tab-node,
.dt-node {
  display: grid; grid-template-columns: auto 1fr auto;
  align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; margin: 0; border-radius: 7px;
  border: 1px solid transparent; border-left: 3px solid transparent;
  background: transparent; color: inherit; font: inherit;
  text-align: left; cursor: pointer; position: relative;
}
/* Depth as a drawn guide rather than only as indentation: a nested node should
   read as nested at a glance. */
.dt-tab-node[data-depth]::before,
.dt-node[data-depth]::before {
  content: ''; position: absolute; left: 4px; top: 0; bottom: 0;
  width: 1px; background: var(--dt-border);
}
.dt-tab-node[data-depth="2"]::before,
.dt-node[data-depth="2"]::before { left: 18px; }
.dt-tab-node[data-depth="3"]::before,
.dt-node[data-depth="3"]::before { left: 32px; }
.dt-tab-node:hover,
.dt-node:hover { background: var(--dt-surface); }
.dt-tab-node[aria-current="true"],
.dt-node[aria-current="true"] {
  background: var(--dt-surface); border-color: var(--dt-border-strong);
  border-left-color: var(--dt-accent);
}
/* A blocker should be findable without reading every row. */
.dt-tab-node[data-attention],
.dt-node[data-attention] { background: color-mix(in srgb, var(--dt-st-blocked) 7%, transparent); }
.dt-tab-node[data-attention]:hover,
.dt-node[data-attention]:hover { background: color-mix(in srgb, var(--dt-st-blocked) 12%, transparent); }
/* A blocker that is merely selected should still look like a blocker. */
.dt-tab-node[data-attention][aria-current="true"],
.dt-node[data-attention][aria-current="true"] {
  background: color-mix(in srgb, var(--dt-st-blocked) 10%, var(--dt-surface));
}
/* Where the learner actually is.
 *
 * [data-focused] was computed and rendered by both surfaces from the start and
 * had no rule at all, so the one fact the map exists to answer — which node am
 * I working on — was the one fact it did not show. It reads as a marker rather
 * than as a selection: the selected row is where the detail pane is looking,
 * the focused row is where the tutor is teaching. */
.dt-tab-node[data-focused]:not([aria-current="true"]),
.dt-node[data-focused]:not([aria-current="true"]) { background: color-mix(in srgb, var(--dt-accent) 6%, transparent); }
.dt-tab-node[data-focused]::after,
.dt-node[data-focused]::after {
  content: ''; position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  width: 3px; height: 60%; border-radius: 2px; background: var(--dt-accent);
}
/* The marker sits where the state column ends, so the row keeps its width. */
.dt-tab-node[data-focused] > .dt-tab-state,
.dt-node[data-focused] > .dt-tab-state { margin-right: 9px; }
.dt-tab-node-title,
.dt-node-title { min-width: 0; overflow-wrap: anywhere; word-break: break-word; line-height: 1.45; }
.dt-tab-node[data-depth="0"] > .dt-tab-node-title,
.dt-node[data-depth="0"] > .dt-node-title { font-weight: 600; }

.dt-dot {
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid currentColor; background: transparent; flex: none;
}
.dt-dot[data-filled="true"] { background: currentColor; }

/* Each falls back to its light value, so a state word rendered outside the
   panel's own subtree — the preview's legend — is still the right colour. */
.dt-state-unconfirmed { color: var(--dt-st-unconfirmed, #5f6672); }
.dt-state-explained   { color: var(--dt-st-explained, #2563eb); }
.dt-state-practiced   { color: var(--dt-st-practiced, #4f46e5); }
.dt-state-checked     { color: var(--dt-st-checked, #0f766e); }
.dt-state-weak        { color: var(--dt-st-weak, #b45309); }
.dt-state-blocked     { color: var(--dt-st-blocked, #c0392b); }
.dt-state-confirmed   { color: var(--dt-st-confirmed, #15803d); }

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
/* The map row itself is defined once, under "diagnosis map" above. */
/* At narrow widths the three-column panel collapses to one, and a grid row
   that keeps its three tracks pushes the pane sideways instead of wrapping. */
@media (max-width: 1080px) {
  .dt-node { grid-template-columns: auto minmax(0, 1fr) auto; }
  .dt-node-title { max-width: 100%; }
}
/* One line, truncated rather than wrapped: the relation line is a caption on
   the title, and at the map's width it used to break after "1" and leave the
   word "evidence" alone on a third line, which reads as a layout fault. */
.dt-node-rel {
  display: block; color: var(--dt-muted); font-size: 11px; font-weight: 400;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

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
/* When it happened, in the units a person reads rather than in ISO 8601. */
.dt-ev-when {
  grid-column: 1 / -1; color: var(--dt-muted); font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

/* ---- buttons ----------------------------------------------------------- */
/* One filled control per view, and its foreground comes from the theme.
   a hardcoded white on a fill that inverts with the theme is what made the primary
   button a blank white pill in dark mode. */
.dt-primary {
  min-height: 32px; padding: 7px 14px; border-radius: 8px; border: 1px solid transparent;
  background: var(--dt-accent); color: var(--dt-on-accent);
  font: inherit; font-weight: 550; cursor: pointer;
}
.dt-primary:hover:not(:disabled) { filter: brightness(1.07); }
/* A disabled control should read as unavailable, not as a pressed black pill
   with unreadable text on it. */
.dt-primary:disabled {
  cursor: default; filter: none;
  background: var(--dt-sunken); color: var(--dt-muted);
  border-color: var(--dt-border);
}
.dt-secondary {
  margin-top: 8px; padding: 6px 12px; border-radius: 8px;
  border: 1px solid var(--dt-border-strong); background: transparent;
  color: inherit; font: inherit; font-size: 12px; cursor: pointer;
}
.dt-secondary:hover { background: var(--dt-surface); border-color: var(--dt-brand-line); }
.dt-secondary:disabled { opacity: .55; cursor: default; }

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
.dt-lesson-title { font-size: 15px; font-weight: 650; margin: 0 0 10px; letter-spacing: -.01em; line-height: 1.35; }
.dt-lesson-head .dt-lesson-title { margin: 0; }
.dt-tab-lesson-title { font-weight: 600; }
.dt-origin {
  flex: none; font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--dt-muted); border: 1px solid var(--dt-border);
  border-radius: 999px; padding: 1px 7px;
}

/* ---- blocks ------------------------------------------------------------ */
.dt-block { margin: 0 0 18px; }
/* A readable measure: full-width prose in a docked panel is tiring. */
.dt-block-md { margin: 0 0 11px; line-height: 1.66; max-width: 62ch; }
.dt-block-md:last-child { margin-bottom: 0; }
.dt-block-md strong { font-weight: 640; }
/* Emphasis the teaching brain writes as *…*. It arrives inline with the prose,
   so it has to be styled rather than stripped: left alone it prints its own
   asterisks, which is the one thing that makes a lesson look like source. */
.dt-block-md em, .dt-block-example em, .dt-check-body em { font-style: italic; }
.dt-block-text { margin-bottom: 18px; }
.dt-block-text:last-child { margin-bottom: 0; }

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

/* Inline code.

   The teaching brain writes identifiers and shapes as inline code far more often
   than it writes display math, and only the math had a treatment — so the
   most common inline token in a programming lesson was the one that looked
   like an accident. Same frame as .dt-math, because to a reader they are the
   same kind of thing: a literal. */
.dt-block-md code, .dt-block-example code, .dt-check-body code, .dt-caption code,
.dt-block-diagram code, .dt-takeaway code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .92em; padding: 1px 4px; border-radius: 4px;
  background: var(--dt-sunken); border: 1px solid var(--dt-border);
  /* Wrapping, not nowrap. A lesson writes whole expressions inline — measured
     against a real one, an expression like np.array([[1, 2, 3]]) pushed straight out of the
     pane and the check block clipped it. A chip that cannot wrap is a chip
     that has to fit, and inline code never has to fit. */
  overflow-wrap: anywhere;
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
  border: 1px solid var(--dt-accent-line); border-radius: var(--dt-radius);
  background: color-mix(in srgb, var(--dt-accent) 5%, var(--dt-bg));
  padding: 0; overflow: hidden;
}
.dt-check-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 9px 14px; background: var(--dt-accent); color: var(--dt-on-accent);
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
  margin-right: 7px; color: var(--dt-brand-ink, #3b56d9);
}

/* ---- math (styled, not typeset) ---------------------------------------- */
.dt-math {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .95em; padding: 0 3px; border-radius: 4px;
  background: var(--dt-sunken); overflow-wrap: anywhere;
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
  margin-left: auto; min-height: 28px; padding: 3px 10px; border-radius: 6px;
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
  border: 1px solid var(--dt-accent-line);
  background: color-mix(in srgb, var(--dt-accent) 6%, var(--dt-bg));
  box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
}
.dt-next-label {
  display: flex; align-items: center; gap: 6px;
  color: var(--dt-accent); font-weight: 650; margin-bottom: 10px;
}
.dt-next-arrow { font-size: 12px; }
.dt-next-from { margin: 0 0 8px; color: var(--dt-muted); font-size: 11.5px; }
.dt-next-tick { color: var(--dt-st-confirmed); margin-right: 5px; }
.dt-next-target {
  margin: 0 0 10px; font-size: 14.5px; line-height: 1.4; letter-spacing: -.01em;
}
.dt-next-target b { font-weight: 660; }
.dt-next-why { margin: 0; font-size: 12px; line-height: 1.6; color: var(--dt-text); }
.dt-next-why-label { color: var(--dt-muted); }
.dt-next .dt-primary { margin-top: 14px; width: 100%; }

/* ---- docked tab -------------------------------------------------------- */
.dt-tab {
  box-sizing: border-box; height: 100%; min-height: 0; min-width: 0;
  overflow: auto; overscroll-behavior-y: contain;
  padding: 14px 14px 40px; font-size: 12.5px; color: var(--dt-text); text-align: left;
}
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

/* ---------------------------------------------------------------------------
   Visual layer
   ---------------------------------------------------------------------------
   Everything below is presentation only: the state model, the copy and the
   structure are the ones above. The surfaces were technically complete but
   read thin — a white page, a flat list, and a lesson made of unstyled runs —
   so this layer gives the same truth a shape: a cover for the course, a glyph
   and a distribution bar for the map, a timeline for evidence, and figures for
   the states where there is nothing to show yet.

   No numbers, bars or rings represent "progress". The only bar here is a
   census of state words: how many nodes are in each of the seven states the
   skill defines. It answers "what does my map look like", not "how far am I".
   --------------------------------------------------------------------------- */

/* The whole surface sits on a very quiet field, so cards read as objects
   rather than as holes in the page. Kept near the background colour on purpose:
   a decorative wash must never compete with 12px lesson prose. */
.dt-root-wrap,
.dt-tab {
  background-image:
    radial-gradient(ellipse 60% 40% at 80% -10%, color-mix(in srgb, var(--dt-accent) 4%, transparent), transparent 70%),
    radial-gradient(ellipse 50% 35% at 0% 0%, color-mix(in srgb, var(--dt-accent) 3%, transparent), transparent 70%);
  background-repeat: no-repeat;
}

/* ---- the course cover ------------------------------------------------ */
.dt-course-card {
  position: relative; overflow: hidden;
  margin: 0 0 14px; padding: 15px 15px 13px;
  border: 1px solid var(--dt-border); border-radius: 13px;
  background:
    linear-gradient(155deg, color-mix(in srgb, var(--dt-accent) 7%, var(--dt-surface)), var(--dt-surface) 62%);
}
.dt-course-orbit {
  position: absolute; right: 0; top: -18px; width: 120px; height: 78px;
  color: var(--dt-accent); opacity: .2; pointer-events: none;
}
.dt-course-card > p,
.dt-course-card > h1 { position: relative; }
.dt-course-card .dt-eyebrow { color: var(--dt-accent); }
.dt-course-card .dt-course-title { margin-top: 6px; font-size: 18px; }
.dt-course-card .dt-goal { margin-bottom: 0; }

/* ---- this conversation, as its own object ---------------------------- */
.dt-here-card {
  padding: 12px 14px 13px; margin: 0 0 4px;
  border: 1px solid var(--dt-border); border-radius: 12px;
  background: var(--dt-surface);
}
.dt-here-card .dt-eyebrow-here { margin-top: 0; }
.dt-here-card .dt-here-empty { margin-top: 5px; }
.dt-here-card .dt-here-action { margin-top: 11px; }

/* ---- the state census ------------------------------------------------ */
.dt-statebar { margin: 10px 0 14px; }
.dt-statebar-track {
  display: flex; gap: 2px; height: 8px;
  border-radius: 999px; overflow: hidden;
  background: var(--dt-sunken);
}
.dt-statebar-seg {
  display: block; min-width: 5px; height: 100%;
  background: currentColor; border-radius: 999px;
  transition: filter .15s ease;
}
.dt-statebar-seg:hover { filter: brightness(1.12); }
.dt-statebar-legend {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  list-style: none; margin: 8px 0 0; padding: 0;
  font-size: 10.5px; color: var(--dt-muted);
}
.dt-statebar-legend li { display: inline-flex; align-items: center; gap: 4px; }
.dt-statebar-legend b { font-weight: 620; color: var(--dt-text); font-variant-numeric: tabular-nums; }
.dt-statebar-key {
  width: 7px; height: 7px; border-radius: 2px;
  background: currentColor; flex: none;
}

/* ---- the map rows ---------------------------------------------------- */
/* A state mark is a small badge, not a dot: the word says which state, the
   glyph says what kind of thing it is. */
.dt-dot {
  width: 24px; height: 24px; border-radius: 8px;
  display: grid; place-items: center;
  border: 1px solid color-mix(in srgb, currentColor 30%, var(--dt-border));
  background: color-mix(in srgb, currentColor 10%, transparent);
  flex: none;
  transition: background .15s ease, transform .15s ease;
}
.dt-dot[data-filled="true"] { background: color-mix(in srgb, currentColor 16%, transparent); }
.dt-glyph-svg { display: block; }
.dt-node:hover .dt-dot,
.dt-tab-node:hover .dt-dot { transform: scale(1.06); }

.dt-node,
.dt-tab-node {
  transition: background .15s ease, border-color .15s ease, box-shadow .15s ease;
}
.dt-node { padding-top: 7px; padding-bottom: 7px; }
.dt-node[aria-current="true"],
.dt-tab-node[aria-current="true"] { box-shadow: inset 0 0 0 1px var(--dt-border); }
.dt-node-title { font-size: 12.5px; }
.dt-node-rel { margin-top: 1px; }

/* The depth guide gets a node at its foot, so nesting reads as a branch
   rather than as indentation. */
.dt-node[data-depth]::before,
.dt-tab-node[data-depth]::before {
  background: linear-gradient(var(--dt-border), color-mix(in srgb, var(--dt-accent) 45%, var(--dt-border)));
  width: 1.5px;
}

/* ---- node detail ----------------------------------------------------- */
.dt-detail-hero { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.dt-detail-glyph {
  width: 42px; height: 42px; border-radius: 13px;
  display: grid; place-items: center; flex: none;
  border: 1px solid color-mix(in srgb, currentColor 32%, var(--dt-border));
  background: color-mix(in srgb, currentColor 9%, transparent);
}
.dt-detail-glyph .dt-glyph-svg { width: 21px; height: 21px; }
.dt-detail-hero-id { min-width: 0; }
.dt-detail .dt-detail-hero h2 { margin: 3px 0 0; font-size: 18px; }
.dt-detail .dt-why {
  margin: 0 0 4px; padding: 11px 13px;
  border: 1px solid var(--dt-border); border-radius: 11px;
  background: var(--dt-surface);
  color: var(--dt-text); font-size: 12.5px;
}

/* Evidence is a record, so it reads as a rail with entries on it rather than
   as a stack of unowned lines. */
.dt-evidence { margin-left: 2px; }
.dt-evidence li {
  position: relative; margin-left: 4px; padding-left: 15px;
  border-left: 1px solid var(--dt-border);
}
.dt-evidence li::before {
  content: ''; position: absolute; left: -4px; top: 11px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--dt-bg);
  border: 1.5px solid var(--dt-accent);
}
.dt-evidence li:first-child::before { background: var(--dt-accent); }
.dt-evidence li + li { margin-top: 4px; }

/* ---- lesson as a reading surface ------------------------------------- */
.dt-lesson-body {
  border-radius: 13px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .035), 0 8px 24px -18px rgba(0, 0, 0, .35);
}
.dt-lesson-head {
  margin-bottom: 16px;
  padding: 0 0 11px;
}
.dt-lesson-head .dt-eyebrow { color: var(--dt-accent); }
.dt-lesson-title { font-size: 16px; }

/* Prose blocks get a quiet rail: a lesson is a sequence, and a sequence with
   no edge reads as one long paragraph. */
.dt-block-text { position: relative; padding-left: 13px; }
.dt-block-text::before {
  content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 2px;
  border-radius: 2px;
  background: linear-gradient(var(--dt-border-strong), transparent);
}
.dt-block-label { display: flex; align-items: center; gap: 5px; }
.dt-block-label-icon { display: inline-flex; color: var(--dt-accent); }
.dt-block-example { border-left-color: var(--dt-accent); }
.dt-block-example .dt-block-label { color: var(--dt-accent); }
.dt-block-diagram .dt-pre {
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dt-border) 60%, transparent);
}
.dt-block-check { box-shadow: 0 6px 18px -14px color-mix(in srgb, var(--dt-accent) 70%, transparent); }

/* ---- empty places ---------------------------------------------------- */
.dt-empty-art {
  display: block; width: 92px; height: 80px; margin: 2px auto 10px;
  color: var(--dt-accent); opacity: .5;
}
.dt-empty-state .dt-empty-art { margin-top: 0; }
.dt-welcome > .dt-empty-art {
  width: 84px; height: 74px; margin: 0 0 12px; opacity: .6;
}
.dt-tab .dt-empty-art { width: 74px; height: 64px; opacity: .45; margin-bottom: 8px; }
.dt-here > .dt-empty-art { margin: 2px auto 6px; }
.dt-empty-state { background: color-mix(in srgb, var(--dt-surface) 70%, transparent); }

/* ---- first use: a place, not a form ---------------------------------- */
.dt-root-welcome { position: relative; }
.dt-root-welcome::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(circle, color-mix(in srgb, var(--dt-accent) 16%, transparent) 1px, transparent 1.6px);
  background-size: 44px 44px;
  -webkit-mask-image: radial-gradient(ellipse 56% 46% at 50% 34%, #000, transparent 78%);
  mask-image: radial-gradient(ellipse 56% 46% at 50% 34%, #000, transparent 78%);
  opacity: .55;
}
.dt-root-welcome > * { position: relative; }
.dt-root-welcome {
  background-image:
    radial-gradient(circle at 50% 12%, color-mix(in srgb, var(--dt-accent) 7%, transparent), transparent 46%),
    radial-gradient(circle at 12% 92%, color-mix(in srgb, var(--dt-accent) 4%, transparent), transparent 40%);
  background-repeat: no-repeat;
}
.dt-welcome-sample { position: relative; padding-left: 36px; }
.dt-welcome-sample::before {
  content: '“'; position: absolute; left: 13px; top: 2px;
  font-size: 30px; line-height: 1; color: var(--dt-accent); opacity: .45;
  font-family: Georgia, serif;
}

/* ---- the docked tab -------------------------------------------------- */
.dt-tab .dt-statebar { margin: 8px 0 12px; }
.dt-tab-section { position: relative; }
.dt-tab .dt-lesson-body { padding: 13px 13px 4px; box-shadow: none; }
.dt-tab .dt-block-text { padding-left: 10px; }
.dt-tab .dt-dot { width: 21px; height: 21px; border-radius: 7px; }
.dt-tab .dt-glyph-svg { width: 12px; height: 12px; }
.dt-tab .dt-detail-glyph { display: none; }

/* ---- the three things that fill this surface -------------------------- */
.dt-features {
  list-style: none; margin: 18px 0 20px; padding: 0;
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;
}
.dt-features li {
  display: flex; flex-direction: column; gap: 3px;
  padding: 11px 12px 12px;
  border: 1px solid var(--dt-border); border-radius: 11px;
  background: var(--dt-surface);
}
.dt-feature-icon { color: var(--dt-accent); margin-bottom: 2px; line-height: 0; }
.dt-features b { font-size: 12px; font-weight: 620; }
.dt-features li > span:last-child { font-size: 11px; color: var(--dt-muted); line-height: 1.45; }
@media (max-width: 620px) { .dt-features { grid-template-columns: 1fr; } }

/* ---- where this node sits -------------------------------------------- */
.dt-locator {
  margin: 14px 0 4px; padding: 12px 13px 13px;
  border: 1px solid var(--dt-border); border-radius: 12px;
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--dt-accent) 4%, var(--dt-surface)), var(--dt-surface) 70%);
}
.dt-locator .dt-eyebrow { margin-bottom: 9px; }
.dt-locator-chain {
  position: relative; display: flex; flex-direction: column; gap: 5px;
  padding-left: 3px;
}
.dt-locator-chain::before {
  content: ''; position: absolute; left: 15px; top: 9px; bottom: 9px; width: 1px;
  background: linear-gradient(var(--dt-border-strong), var(--dt-border));
}
.dt-locator-item {
  position: relative; display: flex; align-items: center; gap: 8px;
  min-width: 0; width: 100%; text-align: left;
  padding: 5px 9px 5px 6px; border-radius: 8px;
  border: 1px solid transparent; background: var(--dt-bg);
  color: inherit; font: inherit; font-size: 12px;
}
button.dt-locator-item { cursor: pointer; }
button.dt-locator-item:hover { background: var(--dt-surface); border-color: var(--dt-border); }
.dt-locator-current {
  border-color: var(--dt-border-strong);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
  font-weight: 600;
}
.dt-locator-glyph {
  width: 21px; height: 21px; border-radius: 7px;
  display: grid; place-items: center; flex: none;
  border: 1px solid color-mix(in srgb, currentColor 30%, var(--dt-border));
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.dt-locator-glyph .dt-glyph-svg { width: 13px; height: 13px; }
.dt-locator-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dt-locator-current .dt-locator-title { color: var(--dt-text); }
.dt-locator-parent .dt-locator-title,
.dt-locator-child .dt-locator-title { color: var(--dt-muted); }
.dt-locator-children { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }

/* ---- the docked tab's course cover ----------------------------------- */
.dt-tab-cover {
  position: relative; overflow: hidden;
  margin: 2px 0 14px; padding: 12px 13px 11px;
  border: 1px solid var(--dt-border); border-radius: 12px;
  background:
    linear-gradient(155deg, color-mix(in srgb, var(--dt-accent) 6%, var(--dt-surface)), var(--dt-surface) 62%);
}
.dt-tab-cover > p,
.dt-tab-cover > h2 { position: relative; }
.dt-tab-cover .dt-eyebrow { color: var(--dt-accent); }
.dt-tab-cover .dt-here-course { margin-top: 4px; font-size: 16px; }
.dt-tab-cover .dt-course-orbit { width: 104px; height: 68px; opacity: .14; }

/* ---- the map page ----------------------------------------------------- */
/* The map is a reference surface and the lesson is a reading surface, so the
   map gets the whole main column: tree on the left, the selected node's
   evidence on the right. Same components, different amount of room. */
.dt-bar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.dt-map-root-wrap { overflow: hidden; }
.dt-map-root {
  display: grid; grid-template-columns: minmax(320px, 1.15fr) minmax(300px, 1fr);
  flex: 1 1 auto; min-height: 0; min-width: 0; overflow: hidden;
}
.dt-map-pane {
  min-width: 0; min-height: 0; overflow: auto; overscroll-behavior-y: contain;
  padding: 20px 22px 40px;
}
.dt-map-detail {
  min-width: 0; min-height: 0; overflow: auto; overscroll-behavior-y: contain;
  padding: 20px 22px 40px;
  border-left: 1px solid var(--dt-border);
  background: color-mix(in srgb, var(--dt-surface) 45%, var(--dt-bg));
}
.dt-map-cover { margin-bottom: 18px; }
.dt-map-list { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
.dt-map-row { border-radius: 9px; }
.dt-map-list .dt-node { padding-top: 9px; padding-bottom: 9px; font-size: 13px; }
.dt-map-list .dt-node-title { font-size: 13px; }
.dt-map-list .dt-node-rel { font-size: 11px; }
.dt-map-pane .dt-eyebrow-here { margin-top: 14px; }
@media (max-width: 900px) {
  .dt-map-root { grid-template-columns: 1fr; overflow: visible; }
  .dt-map-pane, .dt-map-detail { overflow: visible; padding: 16px 18px 34px; }
  .dt-map-detail { border-left: 0; border-top: 1px solid var(--dt-border); }
  .dt-map-root-wrap { overflow: auto; }
}

/* ---- motion ---------------------------------------------------------- */
/* Entrance only, and only when the system allows it: this surface is read for
   minutes at a time, so nothing loops or draws attention after arrival. */
@media (prefers-reduced-motion: no-preference) {
  .dt-node,
  .dt-tab-node,
  .dt-block,
  .dt-lesson-body,
  .dt-course-card,
  .dt-here-card,
  .dt-detail-hero {
    animation: dt-rise .26s cubic-bezier(.2, .7, .3, 1) both;
  }
  @keyframes dt-rise {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: none; }
  }
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
  element.textContent = CSS + PATH_CSS
  document.head.appendChild(element)
  return () => element.remove()
}
