/** Append to the plugin's existing injected sheet; no separate CSS asset. */
export const PATH_CSS = `
.dt-path-tabs { display:flex; flex:none; gap:8px; padding:10px 18px; border-bottom:1px solid var(--dt-border); }
.dt-path-tabs button { font:inherit; color:var(--dt-muted); background:transparent; border:1px solid transparent; padding:7px 12px; border-radius:8px; cursor:pointer; }
.dt-path-tabs button[aria-current] { color:var(--dt-text); background:var(--dt-surface); border-color:var(--dt-border); font-weight:600; }
.dt-map-root-wrap > .dt-path-page { flex:1 1 auto; height:auto; }
.dt-course-reading { width:100%; max-width:900px; margin:0 auto; padding:22px; overflow:auto; min-height:0; box-sizing:border-box; }
.dt-course-unit { margin-bottom:18px; }
.dt-map-shortcut { width:100%; margin-top:20px; }

.dt-path-page { position:relative; display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; overflow:auto; overscroll-behavior:contain; color:var(--dt-text,#1c1f23); background:var(--dt-bg,#fff); font-size:13px; line-height:1.6; text-align:left; }
.dt-path-page * { box-sizing:border-box; }
.dt-path-page button,.dt-path-page input,.dt-path-page textarea,.dt-path-page select { font:inherit; }
.dt-path-page button { cursor:pointer; }
.dt-path-page button:disabled { cursor:default; opacity:.55; }
.dt-path-page :focus-visible { outline:2px solid var(--dt-accent,#4f46e5); outline-offset:3px; }
.dt-path-header { flex:none; display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:16px; padding:22px 24px 16px; border-bottom:1px solid var(--dt-border,#e3e6ea); }
.dt-path-header h2 { font-size:22px; letter-spacing:-.025em; line-height:1.3; margin:4px 0 7px; }
.dt-path-eyebrow { color:var(--dt-muted,#6b7280); text-transform:uppercase; letter-spacing:.1em; font-size:10px; font-weight:600; margin:0; }
.dt-path-muted { color:var(--dt-muted,#6b7280); }
.dt-path-small { font-size:12px; }
.dt-path-page p { margin:7px 0 12px; }
.dt-path-page h3 { margin:0 0 10px; font-size:17px; line-height:1.4; }
.dt-path-page h4 { margin:19px 0 6px; font-size:13px; }
.dt-path-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.dt-path-button { border:1px solid var(--dt-border-strong,#cfd4dc); border-radius:7px; padding:7px 11px; min-height:36px; background:var(--dt-bg,#fff); color:var(--dt-text,#1c1f23); text-align:center; }
.dt-path-button:hover:not(:disabled) { background:var(--dt-surface,#f7f8fa); border-color:var(--dt-accent-line,#a5a0f0); }
.dt-path-button[data-primary=true] { background:var(--dt-accent,#4f46e5); color:var(--dt-on-accent,#fff); border-color:var(--dt-accent,#4f46e5); }
.dt-path-button[data-primary=true]:hover:not(:disabled) { filter:brightness(.93); background:var(--dt-accent,#4f46e5); }
.dt-path-button[aria-pressed=true] { border-color:var(--dt-accent,#4f46e5); box-shadow:inset 0 0 0 1px var(--dt-accent,#4f46e5); }
.dt-path-link { border:0; padding:2px 0; color:var(--dt-text,#1c1f23); background:transparent; text-decoration:underline; text-underline-offset:3px; text-align:left; }
.dt-path-status,.dt-path-alert { margin:12px 24px 0; padding:11px 14px; border:1px solid var(--dt-border-strong,#cfd4dc); border-radius:8px; background:var(--dt-surface,#f7f8fa); overflow-wrap:anywhere; }
.dt-path-alert { border-left:3px solid var(--dt-st-blocked,#c0392b); }
.dt-path-tag { display:inline-flex; align-items:center; gap:5px; padding:2px 7px; border-radius:4px; border:1px solid var(--dt-border,#e3e6ea); font-size:11px; line-height:1.5; color:var(--dt-text,#1c1f23); background:var(--dt-surface,#f7f8fa); }
.dt-path-body { flex:none; padding:20px 24px 28px; display:flex; flex-direction:column; gap:18px; min-width:0; }
.dt-path-card { border:1px solid var(--dt-border,#e3e6ea); border-radius:12px; background:var(--dt-bg,#fff); padding:18px; min-width:0; }
.dt-path-card[data-current=true] { border-color:var(--dt-accent-line,#a5a0f0); background:var(--dt-surface,#f7f8fa); }
.dt-path-card-head { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:10px; }
.dt-path-card-head h3 { margin:0; }
.dt-path-wizard { background:var(--dt-surface,#f7f8fa); }
.dt-path-steps { list-style:none; padding:0; display:flex; gap:5px; margin:14px 0 20px; }
.dt-path-steps li { flex:1; min-width:0; }
.dt-path-step { width:100%; border:0; border-top:3px solid var(--dt-border-strong,#cfd4dc); padding:7px 4px; color:var(--dt-muted,#6b7280); background:transparent; text-align:left; font-size:12px; }
.dt-path-step[aria-current=step] { border-color:var(--dt-accent,#4f46e5); color:var(--dt-text,#1c1f23); font-weight:600; }
.dt-path-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin:12px 0 20px; }
.dt-path-field { display:flex; flex-direction:column; gap:5px; min-width:0; font-weight:550; }
.dt-path-field[data-wide=true] { grid-column:1/-1; }
.dt-path-field small { font-weight:400; color:var(--dt-muted,#6b7280); }
.dt-path-field input,.dt-path-field textarea,.dt-path-field select,.dt-path-search,.dt-path-version { width:100%; min-width:0; border:1px solid var(--dt-border-strong,#cfd4dc); border-radius:7px; padding:8px 10px; color:var(--dt-text,#1c1f23); background:var(--dt-bg,#fff); }
.dt-path-field textarea { min-height:96px; resize:vertical; }
.dt-path-check { display:flex; align-items:center; gap:8px; font-weight:400; }
.dt-path-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:16px 0; }
.dt-path-summary div { border-left:2px solid var(--dt-border-strong,#cfd4dc); padding-left:11px; }
.dt-path-summary strong { display:block; font-size:18px; line-height:1.5; font-weight:600; }
.dt-path-summary span { color:var(--dt-muted,#6b7280); font-size:12px; }
.dt-path-columns { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
.dt-path-columns h4 { margin-top:0; }
.dt-path-list { margin:8px 0 14px; padding-left:21px; }
.dt-path-list li { padding:2px 0; }
.dt-path-evidence { display:flex; gap:7px; flex-wrap:wrap; margin-top:10px; }
.dt-path-version-row { display:flex; align-items:end; flex-wrap:wrap; gap:12px; }
.dt-path-version-row label { flex:1; max-width:420px; display:flex; flex-direction:column; gap:5px; }
.dt-path-conflict { border-left:3px solid var(--dt-st-weak,#b45309); background:var(--dt-surface,#f7f8fa); }
.dt-path-workspace { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(280px,1fr); align-items:start; gap:18px; min-width:0; }
.dt-path-map-side { min-width:0; }
.dt-path-tools { display:flex; align-items:center; flex-wrap:wrap; gap:7px; padding:11px; border:1px solid var(--dt-border,#e3e6ea); border-radius:10px 10px 0 0; background:var(--dt-surface,#f7f8fa); }
.dt-path-search { flex:1; min-width:140px; }
.dt-path-tools .dt-path-button { padding:4px 8px; min-height:32px; font-size:12px; }
.dt-path-canvas { position:relative; height:440px; max-height:58vh; min-height:260px; width:100%; overflow:hidden; border:1px solid var(--dt-border,#e3e6ea); border-top:0; border-radius:0 0 10px 10px; background:var(--dt-sunken,#f1f3f6); touch-action:none; cursor:grab; }
.dt-path-canvas[data-panning=true] { cursor:grabbing; }
.dt-path-stage { position:absolute; top:0; left:0; transform-origin:0 0; }
.dt-path-svg { position:absolute; top:0; left:0; overflow:visible; pointer-events:none; }
.dt-path-module-bg { fill:var(--dt-bg,#fff); stroke:var(--dt-border-strong,#cfd4dc); stroke-width:1.5; }
.dt-path-edge { fill:none; stroke:var(--dt-muted,#6b7280); stroke-width:2; }
.dt-path-edge[data-optional=true] { stroke-dasharray:7 5; }
.dt-path-arrow { fill:var(--dt-muted,#6b7280); }
.dt-path-module-label { position:absolute; top:18px; width:280px; display:flex; align-items:center; justify-content:space-between; gap:6px; padding:7px; }
.dt-path-module-label .dt-path-link { font-weight:650; font-size:14px; overflow-wrap:anywhere; }
.dt-path-module-label .dt-path-button { font-size:11px; min-height:30px; padding:3px 6px; }
.dt-path-node { position:absolute; display:flex; align-items:flex-start; gap:10px; width:276px; height:92px; padding:12px; border:1.5px solid var(--dt-border-strong,#cfd4dc); border-radius:10px; color:var(--dt-text,#1c1f23); background:var(--dt-bg,#fff); text-align:left; box-shadow:0 2px 3px #00000008; }
.dt-path-node:hover { border-color:var(--dt-accent,#4f46e5); }
.dt-path-node[aria-pressed=true] { border-color:var(--dt-accent,#4f46e5); box-shadow:0 0 0 2px var(--dt-accent-line,#a5a0f0); }
.dt-path-node[data-current=true] { background:var(--dt-surface,#f7f8fa); border-width:2px; }
.dt-path-number { flex:0 0 27px; height:27px; border-radius:50%; background:var(--dt-sunken,#f1f3f6); display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:650; }
.dt-path-node-text { flex:1; min-width:0; }
.dt-path-node-title { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-weight:600; font-size:13px; line-height:1.4; }
.dt-path-node-status { display:block; font-size:11px; color:var(--dt-muted,#6b7280); margin-top:5px; }
.dt-path-legend { display:flex; gap:14px; flex-wrap:wrap; color:var(--dt-muted,#6b7280); font-size:11px; margin:9px 0; }
.dt-path-legend span { display:inline-flex; gap:5px; align-items:center; }
.dt-path-legend-line { display:inline-block; width:22px; border-top:2px solid currentColor; }
.dt-path-legend-line[data-optional=true] { border-top-style:dashed; }
.dt-path-module-controls { display:flex; gap:7px; flex-wrap:wrap; margin:12px 0; }
.dt-path-outline { max-height:360px; overflow:auto; overscroll-behavior:contain; border-top:1px solid var(--dt-border,#e3e6ea); margin-top:12px; }
.dt-path-ordered { padding-left:0; list-style:none; margin:0; }
.dt-path-ordered li { margin:0; border-bottom:1px solid var(--dt-border,#e3e6ea); }
.dt-path-row { border:0; background:transparent; color:var(--dt-text,#1c1f23); display:flex; align-items:center; gap:10px; width:100%; padding:10px 6px; text-align:left; }
.dt-path-row[aria-pressed=true] { background:var(--dt-surface,#f7f8fa); }
.dt-path-row-copy { flex:1; min-width:0; }
.dt-path-row-copy strong { display:block; font-weight:550; }
.dt-path-row-copy small { color:var(--dt-muted,#6b7280); }
.dt-path-detail { max-height:min(640px,46vh); overflow:auto; overscroll-behavior:contain; scroll-margin-top:16px; }
.dt-path-detail:focus { outline-offset:1px; }
.dt-path-detail h3 { font-size:20px; }
.dt-path-module-card { display:block; width:100%; margin:8px 0; padding:12px; border:1px solid var(--dt-border,#e3e6ea); border-radius:8px; background:var(--dt-surface,#f7f8fa); color:var(--dt-text,#1c1f23); text-align:left; }
.dt-path-module-card strong,.dt-path-module-card small { display:block; }
.dt-path-module-card small { color:var(--dt-muted,#6b7280); margin-top:4px; }
.dt-path-knowledge { padding:0; list-style:none; margin:8px 0; }
.dt-path-knowledge li { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:7px 0; border-bottom:1px solid var(--dt-border,#e3e6ea); }
.dt-path-knowledge code { font-size:11px; overflow-wrap:anywhere; }
.dt-path-history details { border:1px solid var(--dt-border,#e3e6ea); border-radius:8px; padding:10px 12px; margin:9px 0; }
.dt-path-history summary { cursor:pointer; overflow-wrap:anywhere; }
.dt-path-history summary strong { font-weight:550; }
.dt-path-snapshot { border-left:2px solid var(--dt-border-strong,#cfd4dc); padding:1px 0 1px 12px; margin:10px 0; overflow-wrap:anywhere; }
.dt-path-snapshot pre { white-space:pre-wrap; font-family:inherit; font-size:12px; max-height:240px; overflow:auto; margin:6px 0; color:var(--dt-text,#1c1f23); }
.dt-path-empty { padding:28px 16px; text-align:center; background:var(--dt-surface,#f7f8fa); border:1px dashed var(--dt-border-strong,#cfd4dc); border-radius:10px; }
.dt-path-empty h3 { margin-top:4px; }
.dt-path-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@media (max-width:1050px) { .dt-path-workspace { grid-template-columns:1fr; } .dt-path-detail { max-height:min(620px,46vh); } }

.dt-path-stagebar { border:1px solid var(--dt-border,#e3e6ea); border-radius:10px; padding:12px 14px; background:var(--dt-surface,#f7f8fa); }
.dt-path-stagebar ol { list-style:none; display:flex; flex-wrap:wrap; gap:8px 14px; margin:0; padding:0; }
.dt-path-stagebar li { display:flex; align-items:center; gap:6px; color:var(--dt-muted,#6b7280); font-size:12px; }
.dt-path-stagebar li[data-state=current] { color:var(--dt-text,#1c1f23); font-weight:600; }
.dt-path-stagebar li[data-state=done] { color:var(--dt-text,#1c1f23); }
.dt-path-stagebar li small { font-weight:400; color:var(--dt-muted,#6b7280); }
.dt-path-stagebar li[data-state=current] small { color:var(--dt-accent,#4f46e5); }
.dt-path-stage-number { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; border:1px solid var(--dt-border-strong,#cfd4dc); font-size:11px; font-weight:600; }
.dt-path-stagebar li[data-state=done] .dt-path-stage-number { background:var(--dt-accent,#4f46e5); border-color:var(--dt-accent,#4f46e5); color:var(--dt-on-accent,#fff); }
.dt-path-stagebar li[data-state=current] .dt-path-stage-number { border-color:var(--dt-accent,#4f46e5); color:var(--dt-accent,#4f46e5); }
.dt-path-stagebar p { margin:8px 0 0; }
.dt-path-fold { border:1px solid var(--dt-border,#e3e6ea); border-radius:10px; background:var(--dt-bg,#fff); }
.dt-path-fold > summary { cursor:pointer; padding:11px 14px; font-weight:550; color:var(--dt-text,#1c1f23); }
.dt-path-fold[open] > summary { border-bottom:1px solid var(--dt-border,#e3e6ea); }
.dt-path-fold > .dt-path-card { border:0; border-radius:0; }
.dt-path-pending { border-left:3px solid var(--dt-accent,#4f46e5); background:var(--dt-surface,#f7f8fa); }
@media (max-width:620px) { .dt-path-header { padding:16px; } .dt-path-body { padding:16px; } .dt-path-status,.dt-path-alert { margin:10px 16px 0; } .dt-path-fields,.dt-path-columns { grid-template-columns:1fr; } .dt-path-steps { flex-wrap:wrap; } .dt-path-steps li { flex-basis:40%; } .dt-path-summary { grid-template-columns:1fr; } .dt-path-card { padding:14px; } .dt-path-canvas { height:330px; } }
@media (prefers-reduced-motion:reduce) { .dt-path-page * { animation:none!important; transition:none!important; scroll-behavior:auto!important; } }
/* Interface-language switch: the same chrome as the bar's other buttons, and
   never wider than its own two characters. */
.dt-lang-toggle { flex:none; min-height:28px; padding:5px 12px; border-radius:7px; border:1px solid var(--dt-border-strong,#cfd4dc); background:var(--dt-bg,#fff); color:inherit; font:inherit; font-size:12px; font-weight:550; cursor:pointer; }
.dt-lang-toggle:hover { background:var(--dt-surface,#f7f8fa); }
.dt-lang-toggle:focus-visible { outline:2px solid var(--dt-accent,#4f46e5); outline-offset:3px; }
`
