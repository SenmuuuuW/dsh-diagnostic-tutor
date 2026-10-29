/** Design-system CSS for the Learning map / route / knowledge / lesson surfaces. */
export const DESIGN_CSS = `
/* ---------- shell ---------- */
.dtx-map { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--dt-sunken,#f5f6f8); color:var(--dt-text,#1c1f23); font-size:13px; line-height:1.55; text-align:left; }
.dtx-map * { box-sizing:border-box; }
.dtx-map button { font:inherit; cursor:pointer; }
.dtx-map button:disabled { cursor:default; opacity:.5; }
.dtx-map :focus-visible { outline:2px solid var(--dt-brand,#4d6bfe); outline-offset:2px; }
.dtx-topbar { flex:none; height:64px; display:flex; align-items:center; gap:14px; padding:0 30px; background:var(--dt-bg,#fff); border-bottom:1px solid var(--dt-border,#e8eaee); }
.dtx-topbar-title { display:flex; align-items:center; gap:14px; min-width:0; }
.dtx-topbar-page { font-size:17px; font-weight:700; letter-spacing:-.01em; white-space:nowrap; }
.dtx-topbar-divider { width:1px; height:22px; background:var(--dt-border-strong,#d7dbe2); }
.dtx-topbar-project { font-size:16px; color:var(--dt-text,#1c1f23); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dtx-topbar-actions { margin-left:auto; display:flex; align-items:center; gap:12px; }
.dtx-back { display:inline-flex; align-items:center; gap:7px; height:36px; padding:0 14px; border:1px solid var(--dt-border,#dfe3ea); border-radius:10px; background:var(--dt-bg,#fff); color:var(--dt-text,#1c1f23); font-size:13px !important; }
.dtx-back:hover { background:var(--dt-surface,#f7f8fa); }
.dtx-tabs { flex:none; display:flex; gap:28px; padding:0 30px; background:var(--dt-bg,#fff); border-bottom:1px solid var(--dt-border,#e8eaee); }
.dtx-tabbtn { position:relative; height:52px; display:inline-flex; align-items:center; padding:0; border:0; background:transparent; color:var(--dt-muted,#6b7280); font-size:13.5px; font-weight:500; }
.dtx-tabbtn[aria-current] { color:var(--dt-brand-ink,#3155f5); font-weight:600; }
.dtx-tabbtn[aria-current]::after { content:''; position:absolute; left:0; right:0; bottom:0; height:3px; border-radius:3px 3px 0 0; background:var(--dt-brand,#4d6bfe); }
.dtx-scroll { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; }
.dtx-content { width:100%; max-width:1280px; margin:0 auto; padding:20px 28px 44px; }
.dtx-muted { color:var(--dt-muted,#6b7280); }
.dtx-small { font-size:12px; }
.dtx-eyebrow { margin:0; font-size:12px; font-weight:600; letter-spacing:.02em; color:var(--dt-muted,#6b7280); }
.dtx-card { background:var(--dt-bg,#fff); border:1px solid var(--dt-border,#e8eaee); border-radius:14px; }
.dtx-iconbtn { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; padding:0; border:0; border-radius:8px; background:transparent; color:var(--dt-muted,#6b7280); }
.dtx-iconbtn:hover { background:var(--dt-surface,#f3f4f6); color:var(--dt-text,#1c1f23); }
.dtx-primary { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 20px; border:1px solid var(--dt-accent,#111827); border-radius:10px; background:var(--dt-accent,#111827); color:var(--dt-on-accent,#fff); font-size:13.5px !important; font-weight:600; }
.dtx-primary:hover:not(:disabled) { filter:brightness(.94); }
.dtx-secondary { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:42px; padding:0 18px; border:1px solid var(--dt-border,#dfe3ea); border-radius:10px; background:var(--dt-bg,#fff); color:var(--dt-text,#1c1f23); font-size:13px !important; }
.dtx-secondary:hover:not(:disabled) { background:var(--dt-surface,#f7f8fa); }
.dtx-link { display:inline-flex; align-items:center; gap:5px; padding:0; border:0; background:transparent; color:var(--dt-brand-ink,#3155f5); font-size:12.5px !important; font-weight:500; }
.dtx-link:hover { text-decoration:underline; }
.dtx-pill { display:inline-flex; align-items:center; gap:5px; height:26px; padding:0 10px; border-radius:999px; border:1px solid transparent; font-size:12px; font-weight:600; white-space:nowrap; }
.dtx-pill[data-tone=green] { color:#15803d; background:#ecfdf3; border-color:#bbf7d0; }
.dtx-pill[data-tone=blue] { color:#3155f5; background:#eef2ff; border-color:#c7d2fe; }
.dtx-pill[data-tone=gray] { color:#4b5563; background:#f3f4f6; border-color:#e5e7eb; }
.dtx-pill[data-tone=amber] { color:#a16207; background:#fffbeb; border-color:#fde68a; }
.dtx-pill[data-tone=red] { color:#b91c1c; background:#fef2f2; border-color:#fecaca; }
.dtx-empty-page { min-height:calc(100vh - 190px); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 20px; }
.dtx-empty-icon { display:flex; align-items:center; justify-content:center; width:92px; height:92px; border-radius:20px; background:var(--dt-surface,#f1f2f4); color:#6b7280; margin-bottom:22px; }
.dtx-empty-title { margin:0 0 8px; font-size:24px; letter-spacing:-.02em; }
.dtx-empty-body { margin:0 0 22px; color:var(--dt-muted,#6b7280); font-size:13.5px; }

/* ---------- library ---------- */
.dtx-hero { padding:22px 24px; }
.dtx-hero h1 { margin:6px 0 8px; font-size:26px; letter-spacing:-.025em; line-height:1.25; }
.dtx-hero p { margin:0; color:var(--dt-muted,#6b7280); font-size:13.5px; }
.dtx-hero-row { display:flex; align-items:stretch; gap:16px; margin-top:18px; }
.dtx-hero-prompt { flex:1; min-width:0; display:flex; align-items:center; gap:16px; padding:18px 20px; border-radius:12px; background:var(--dt-surface,#f7f8fa); border:1px solid var(--dt-border,#eceef2); color:var(--dt-muted,#6b7280); }
.dtx-hero-prompt .dtx-hero-prompt-icon { display:flex; align-items:center; justify-content:center; width:38px; height:38px; border-radius:50%; border:1px solid #cfd4dd; color:#4b5563; flex:none; }
.dtx-hero-prompt-title { display:block; color:var(--dt-text,#1c1f23); font-size:13.5px; font-weight:600; }
.dtx-hero-prompt-sub { display:block; font-size:12.5px; margin-top:2px; }
.dtx-section-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:22px 0 12px; }
.dtx-section-head h2 { margin:0; font-size:17px; letter-spacing:-.01em; }
.dtx-project-list { display:flex; flex-direction:column; gap:10px; }
.dtx-project-row { display:flex; align-items:center; gap:14px; padding:13px 16px; background:var(--dt-bg,#fff); border:1px solid var(--dt-border,#e8eaee); border-radius:12px; text-align:left; color:inherit; }
.dtx-project-row:hover { border-color:#cfd6e2; box-shadow:0 2px 10px rgba(15,23,42,.04); }
.dtx-project-icon { display:flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:11px; flex:none; }
.dtx-project-icon[data-kind=graph] { background:#e9f9f0; color:#15803d; }
.dtx-project-icon[data-kind=planet] { background:#eef2ff; color:#3155f5; }
.dtx-project-icon[data-kind=book] { background:#f3f4f6; color:#4b5563; }
.dtx-project-main { min-width:0; display:flex; flex-direction:column; gap:3px; }
.dtx-project-title { font-size:16px; font-weight:700; letter-spacing:-.01em; color:var(--dt-text,#1c1f23); }
.dtx-project-meta { font-size:12.5px; color:var(--dt-muted,#6b7280); }
.dtx-project-status { margin-left:auto; }
.dtx-project-action { margin-left:6px; display:inline-flex; align-items:center; justify-content:center; gap:6px; height:36px; padding:0 14px; border:1px solid #c7d2fe; border-radius:9px; background:#eef2ff; color:#3155f5; font-size:12.5px !important; font-weight:600; flex:none; }
.dtx-project-action:hover { background:#e0e7ff; }

/* ---------- stage bar ---------- */
.dtx-stagebar { display:flex; align-items:center; gap:8px; padding:11px 14px; min-width:0; overflow-x:auto; scrollbar-width:none; background:var(--dt-bg,#fff); border:1px solid var(--dt-border,#e8eaee); border-radius:12px; }
.dtx-stagebar::-webkit-scrollbar { display:none; }
.dtx-stage { display:flex; align-items:center; gap:10px; min-width:0; }
.dtx-stage-num { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:50%; flex:none; border:1px solid #d3d8e0; background:#f3f4f6; color:#6b7280; font-size:12.5px; font-weight:700; }
.dtx-stage-label { font-size:13.5px; font-weight:500; color:#9aa1ac; white-space:nowrap; }
.dtx-stage[data-state=done] .dtx-stage-num { background:#22a06b; border-color:#22a06b; color:#fff; }
.dtx-stage[data-state=done] .dtx-stage-label { color:var(--dt-text,#1c1f23); font-weight:600; }
.dtx-stage[data-state=done] .dtx-stage-check { color:#22a06b; }
.dtx-stage[data-state=current] .dtx-stage-num { background:var(--dt-brand,#4d6bfe); border-color:var(--dt-brand,#4d6bfe); color:#fff; box-shadow:0 0 0 4px rgba(77,107,254,.12); }
.dtx-stage[data-state=current] .dtx-stage-label { color:var(--dt-brand-ink,#3155f5); font-weight:600; }
.dtx-stage-line { flex:1 1 40px; min-width:24px; height:1px; background:#d8dce3; }
.dtx-stagebar .dtx-stage-line:last-child { display:none; }

/* ---------- route layout ---------- */
.dtx-route { display:flex; align-items:flex-start; gap:22px; }
.dtx-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:16px; }
.dtx-rail { flex:0 0 330px; width:330px; position:sticky; top:18px; display:flex; flex-direction:column; gap:16px; }
.dtx-notice { padding:10px 14px; border-radius:10px; font-size:12.5px; background:#eef2ff; border:1px solid #c7d2fe; color:#3155f5; }
.dtx-alert { padding:10px 14px; border-radius:10px; font-size:12.5px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.dtx-alert .dtx-link { color:#b91c1c; }
.dtx-status { padding:8px 12px; border-radius:10px; font-size:12px; background:var(--dt-surface,#f7f8fa); color:var(--dt-muted,#6b7280); }

/* ---------- next step / special states ---------- */
.dtx-next { padding:18px 20px; border-radius:12px; border:1px solid #c7d2fe; background:#f5f7ff; display:flex; align-items:center; gap:18px; }
.dtx-next-copy { flex:1; min-width:0; }
.dtx-next-eyebrow { margin:0 0 6px; color:var(--dt-brand-ink,#3155f5); font-size:12.5px; font-weight:600; }
.dtx-next h2 { margin:0 0 5px; font-size:21px; line-height:1.3; letter-spacing:-.02em; color:var(--dt-text,#1c1f23); }
.dtx-next-body { margin:0; color:var(--dt-muted,#6b7280); font-size:13.5px; }
.dtx-next-note { margin:7px 0 0; color:var(--dt-muted,#6b7280); font-size:12px; }
.dtx-next-actions { flex:none; display:flex; flex-direction:column; align-items:stretch; gap:8px; min-width:172px; }
.dtx-next-actions .dtx-primary { min-height:46px; }
.dtx-next-actions .dtx-secondary { min-height:40px; }
.dtx-next-link { align-self:center; margin-top:2px; }
.dtx-next[data-kind=waiting] { border-color:#dbe3f4; background:#f7f9fc; }
.dtx-wait-box { margin-top:16px; display:flex; align-items:center; gap:14px; padding:16px 18px; border:1px solid #dfe6f3; border-radius:12px; background:var(--dt-bg,#fff); }
.dtx-spinner { width:28px; height:28px; flex:none; border-radius:50%; border:3px solid #dbe4f7; border-top-color:var(--dt-brand,#4d6bfe); animation:dtx-spin 1s linear infinite; }
@keyframes dtx-spin { to { transform:rotate(360deg); } }
.dtx-wait-title { font-size:13.5px; font-weight:600; }
.dtx-wait-sub { font-size:12px; color:var(--dt-muted,#6b7280); margin-top:2px; }
.dtx-next[data-kind=error] { background:#fff; border-color:#fecaca; }
.dtx-error-box { margin-top:16px; padding:16px 18px; border-radius:12px; border:1px solid #fecaca; background:#fff1f2; }
.dtx-error-title { display:flex; align-items:center; gap:8px; color:#b91c1c; font-size:13.5px; font-weight:700; }
.dtx-error-body { color:#b91c1c; font-size:12.5px; margin-top:4px; }
.dtx-next[data-kind=version] { background:#fff; border-color:#fde68a; }
.dtx-version-box { margin-top:16px; padding:14px 16px; border-radius:12px; border:1px solid #fde68a; background:#fffbeb; }
.dtx-version-title { color:#a16207; font-size:13px; font-weight:700; display:flex; gap:8px; align-items:center; }
.dtx-version-body { color:#92400e; font-size:12px; margin-top:4px; }
.dtx-next[data-kind=complete] { background:#f3fbf6; border-color:#bbf7d0; }
.dtx-complete-icon { display:flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:50%; background:#22a06b; color:#fff; flex:none; }
.dtx-proposal { display:flex; align-items:center; gap:16px; padding:18px 20px; border-radius:12px; border:1px solid #c7d2fe; background:#f5f7ff; }
.dtx-proposal-icon { display:flex; align-items:center; justify-content:center; width:48px; height:48px; border-radius:12px; background:#e5eaff; color:#3155f5; flex:none; }
.dtx-proposal-copy { flex:1; min-width:0; }
.dtx-proposal-copy h2 { margin:0 0 4px; font-size:18px; letter-spacing:-.015em; }
.dtx-proposal-copy p { margin:0; color:var(--dt-muted,#6b7280); font-size:12.5px; }
.dtx-proposal-stats { display:flex; align-items:center; gap:18px; padding:0 20px; border-left:1px solid #dbe3f4; flex:none; }
.dtx-stat-label { font-size:11.5px; color:var(--dt-muted,#6b7280); }
.dtx-stat-value { font-size:13px; font-weight:600; color:var(--dt-text,#1c1f23); }
.dtx-proposal-actions { flex:none; display:flex; flex-direction:column; gap:6px; align-items:stretch; }
.dtx-proposal-actions .dtx-primary { min-height:42px; }
.dtx-proposal-actions .dtx-link { align-self:center; }

/* ---------- goal form ---------- */
.dtx-form-card { padding:20px 22px; }
.dtx-form-head { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
.dtx-form-head h2 { margin:0 0 5px; font-size:22px; letter-spacing:-.025em; }
.dtx-form-head p { margin:0; color:var(--dt-muted,#6b7280); font-size:13px; }
.dtx-form { display:flex; flex-direction:column; gap:16px; margin-top:20px; }
.dtx-field label { display:block; font-size:13px; font-weight:700; margin-bottom:8px; }
.dtx-input { display:block; width:100%; min-height:46px; padding:11px 14px; border:1px solid #dfe3ea; border-radius:10px; background:var(--dt-bg,#fff); color:var(--dt-text,#1c1f23); font:inherit; font-size:13.5px; }
textarea.dtx-input { resize:vertical; min-height:78px; line-height:1.6; }
.dtx-input:focus { outline:none; border-color:var(--dt-brand,#4d6bfe); box-shadow:0 0 0 3px rgba(77,107,254,.12); }
.dtx-input:disabled { background:var(--dt-surface,#f5f6f8); opacity:.75; }
.dtx-counter { margin-top:6px; text-align:right; color:var(--dt-muted,#6b7280); font-size:11.5px; }
.dtx-field-help { margin-top:6px; color:var(--dt-muted,#6b7280); font-size:12px; }
.dtx-more { border-top:1px solid var(--dt-border,#eceef2); padding-top:16px; }
.dtx-more summary { cursor:pointer; color:var(--dt-muted,#6b7280); font-size:12.5px; font-weight:600; }
.dtx-form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.dtx-more-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-top:14px; }
.dtx-dirty { padding:12px 14px; border-radius:10px; border:1px solid #fde68a; background:#fffbeb; color:#92400e; font-size:12.5px; }

/* ---------- diagnosis info ---------- */
.dtx-info-card { padding:22px 24px; }
.dtx-info-card h3 { margin:0 0 16px; font-size:17px; letter-spacing:-.01em; }
.dtx-how-steps { display:flex; flex-direction:column; gap:0; }
.dtx-how-step { display:flex; gap:14px; padding:12px 0; position:relative; }
.dtx-how-step + .dtx-how-step { border-top:1px dashed #e5e8ee; }
.dtx-how-num { display:flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:#eef2ff; color:#3155f5; font-size:12px; font-weight:700; flex:none; }
.dtx-how-title { font-size:13.5px; font-weight:700; }
.dtx-how-body { color:var(--dt-muted,#6b7280); font-size:12.5px; margin-top:2px; }
.dtx-hint-box { display:flex; gap:12px; align-items:flex-start; margin-top:18px; padding:14px 16px; border-radius:12px; background:#f5f7ff; border:1px solid #dbe3f4; }
.dtx-hint-box .dtx-hint-icon { color:#3155f5; flex:none; margin-top:1px; }
.dtx-hint-title { font-size:12.5px; font-weight:700; }
.dtx-hint-body { color:var(--dt-muted,#6b7280); font-size:12px; margin-top:2px; }

/* ---------- route modules ---------- */
.dtx-route-card { padding:18px 20px; }
.dtx-route-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:6px; }
.dtx-route-head h3 { margin:0; font-size:18px; letter-spacing:-.015em; }
.dtx-route-meta { color:var(--dt-muted,#6b7280); font-size:12px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.dtx-route-note { margin:0 0 14px; color:var(--dt-muted,#6b7280); font-size:12px; }
.dtx-module-toggle { display:grid; grid-template-columns:auto minmax(0,1fr) auto auto; column-gap:12px; align-items:start; width:100%; padding:0; border:0; background:transparent; color:inherit; text-align:left; }
.dtx-module-toggle:hover .dtx-module-title { color:var(--dt-brand-ink,#3155f5); }
.dtx-module-main { min-width:0; display:flex; flex-direction:column; }
.dtx-module-chevron { display:inline-flex; align-items:center; color:var(--dt-muted,#6b7280); margin-top:3px; transition:transform .15s ease; }
.dtx-module[data-open=true] .dtx-module-chevron { transform:rotate(90deg); }
.dtx-module[data-current=true] { border-color:var(--dt-brand-line,#c7d2fe); background:#f7f9ff; }
.dtx-module[data-current=true] .dtx-module-num { background:var(--dt-brand,#4d6bfe); color:#fff; }
.dtx-module-desc { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.dtx-route-meta .dtx-link { margin-left:2px; font-size:12px !important; }
.dtx-modules { display:flex; flex-direction:column; gap:10px; }
.dtx-module { padding:11px 13px 13px; border-radius:11px; background:var(--dt-surface,#f6f7f9); border:1px solid var(--dt-border,#eceef2); }
.dtx-module-head { display:grid; grid-template-columns:auto minmax(0,1fr) auto; column-gap:12px; align-items:start; }
.dtx-module-num { display:flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; flex:none; background:#dfe6ff; color:#3155f5; font-size:12.5px; font-weight:700; }
.dtx-module[data-done=true] .dtx-module-num { background:#dcfce7; color:#15803d; }
.dtx-module-title { font-size:14px; font-weight:700; line-height:1.4; }
.dtx-module-desc { color:var(--dt-muted,#6b7280); font-size:12px; margin-top:2px; }
.dtx-module-meta { margin-left:auto; color:var(--dt-muted,#6b7280); font-size:12px; white-space:nowrap; padding-top:3px; }
.dtx-lessons { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 18px; margin-top:9px; }
.dtx-lesson-row { display:flex; align-items:stretch; gap:10px; }
.dtx-lesson-arrow { display:flex; align-items:center; justify-content:center; width:22px; flex:none; color:#aab1bd; }
.dtx-lesson { flex:1; min-width:0; display:flex; align-items:flex-start; gap:9px; padding:9px 11px; text-align:left; border:1px solid var(--dt-border,#e2e6ec); border-radius:9px; background:var(--dt-bg,#fff); color:inherit; }
.dtx-lesson:hover { border-color:#c8d0de; }
.dtx-lesson[data-state=current] { border-color:var(--dt-brand,#4d6bfe); box-shadow:inset 0 0 0 1px var(--dt-brand,#4d6bfe); background:#f7f9ff; }
.dtx-lesson[data-state=completed] { background:#f4fcf7; border-color:#c6ecd5; }
.dtx-lesson[data-state=interrupted] { border-color:#fde68a; background:#fffdf3; }
.dtx-lesson-state { width:18px; height:18px; border-radius:50%; border:1.6px solid #c5ccd8; flex:none; margin-top:2px; display:flex; align-items:center; justify-content:center; color:#fff; }
.dtx-lesson[data-state=current] .dtx-lesson-state { border-color:var(--dt-brand,#4d6bfe); background:var(--dt-brand,#4d6bfe); }
.dtx-lesson[data-state=completed] .dtx-lesson-state { border-color:#22a06b; background:#22a06b; }
.dtx-lesson[data-state=interrupted] .dtx-lesson-state { border-color:#d97706; background:#d97706; }
.dtx-lesson-body { min-width:0; }
.dtx-lesson-top { display:flex; align-items:baseline; gap:8px; }
.dtx-lesson-code { color:var(--dt-muted,#6b7280); font-size:11.5px; font-variant-numeric:tabular-nums; }
.dtx-lesson-title { font-size:13px; font-weight:700; color:var(--dt-text,#1c1f23); }
.dtx-lesson-minutes { margin-left:auto; flex:none; color:var(--dt-muted,#6b7280); font-size:11.5px; white-space:nowrap; }
.dtx-lesson-topics { margin-top:3px; color:var(--dt-muted,#6b7280); font-size:11.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ---------- rail ---------- */
.dtx-rail-card { padding:16px; }
.dtx-rail-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.dtx-rail-eyebrow { margin:0; color:var(--dt-muted,#6b7280); font-size:12px; font-weight:600; }
.dtx-rail-title { margin:6px 0 2px; font-size:19px; letter-spacing:-.02em; line-height:1.3; }
.dtx-rail-sub { color:var(--dt-muted,#6b7280); font-size:12.5px; }
.dtx-rail-pills { display:flex; gap:7px; flex-wrap:wrap; margin:12px 0 14px; }
.dtx-rail-progress { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 13px; border-radius:10px; background:var(--dt-surface,#f6f7f9); color:var(--dt-muted,#6b7280); font-size:12px; }
.dtx-rail-progress b { color:var(--dt-text,#1c1f23); font-weight:600; }
.dtx-rail-divider { height:1px; background:var(--dt-border,#eceef2); margin:16px 0; }
.dtx-rail-section { margin:0 0 10px; display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; }
.dtx-rail-item { display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border-radius:9px; background:var(--dt-surface,#f7f8fa); margin-bottom:7px; }
.dtx-rail-item-icon { color:#3155f5; flex:none; margin-top:1px; }
.dtx-rail-item-title { font-size:12.5px; font-weight:600; color:var(--dt-text,#1c1f23); }
.dtx-rail-item-desc { font-size:11.5px; color:var(--dt-muted,#6b7280); margin-top:2px; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; }
.dtx-rail-note { margin-top:14px; padding:12px 14px; border-radius:10px; background:#f5f7ff; border:1px solid #dbe3f4; color:#3155f5; font-size:12px; }
.dtx-answer-card { margin-top:14px; padding:14px 16px; border-radius:12px; background:#f0fdf4; border:1px solid #bbf7d0; }
.dtx-answer-title { display:flex; align-items:center; gap:8px; color:#15803d; font-size:12.5px; font-weight:700; }
.dtx-answer-body { color:#166534; font-size:12px; margin-top:3px; }
.dtx-rail-empty { min-height:360px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 22px; }
.dtx-rail-empty-icon { display:flex; align-items:center; justify-content:center; width:64px; height:64px; border-radius:16px; background:#f1f2f4; color:#6b7280; margin-bottom:16px; }
.dtx-rail-empty-title { font-size:14.5px; font-weight:600; }
.dtx-rail-empty-body { color:var(--dt-muted,#6b7280); font-size:12.5px; margin:4px 0 16px; }
.dtx-stage-steps { display:flex; flex-direction:column; gap:10px; margin:16px 0 20px; }
.dtx-stage-step { display:flex; align-items:flex-start; gap:11px; padding:9px 10px; border-radius:9px; color:var(--dt-muted,#6b7280); font-size:12.5px; }
.dtx-stage-step[data-current=true] { background:#eef2ff; color:var(--dt-brand-ink,#3155f5); font-weight:600; }
.dtx-stage-step-num { display:flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; border:1px solid #d3d8e0; font-size:10.5px; font-weight:700; flex:none; }
.dtx-stage-step[data-current=true] .dtx-stage-step-num { border-color:var(--dt-brand,#4d6bfe); background:var(--dt-brand,#4d6bfe); color:#fff; }
.dtx-tip { display:flex; gap:10px; margin-top:12px; }
.dtx-tip-icon { display:flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:10px; background:#eef2ff; color:#3155f5; flex:none; }
.dtx-tip-title { font-size:12.5px; font-weight:600; }
.dtx-tip-body { color:var(--dt-muted,#6b7280); font-size:11.5px; margin-top:1px; }
.dtx-stage-current-title { font-size:21px; font-weight:700; letter-spacing:-.02em; margin:6px 0 0; }
.dtx-stage-current-step { color:var(--dt-muted,#6b7280); font-size:12.5px; margin-top:2px; }

/* ---------- knowledge ---------- */
.dtx-knowledge { display:flex; align-items:stretch; gap:20px; }
.dtx-knowledge-list { flex:0 0 460px; display:flex; flex-direction:column; padding:0; overflow:hidden; }
.dtx-knowledge-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border-bottom:1px solid var(--dt-border,#eceef2); }
.dtx-knowledge-head h2 { margin:0; font-size:16px; }
.dtx-search { position:relative; width:220px; }
.dtx-search svg { position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--dt-muted,#6b7280); }
.dtx-search input { width:100%; height:36px; padding:0 10px 0 34px; border:1px solid var(--dt-border,#dfe3ea); border-radius:9px; background:var(--dt-bg,#fff); color:var(--dt-text,#1c1f23); font:inherit; font-size:12.5px; }
.dtx-node-list { overflow:auto; flex:1; }
.dtx-node-row { width:100%; display:flex; align-items:center; gap:10px; padding:11px 15px; border:0; border-bottom:1px solid var(--dt-border,#f0f2f5); background:transparent; text-align:left; color:inherit; }
.dtx-node-row:hover { background:var(--dt-surface,#f8f9fb); }
.dtx-node-row[aria-current] { background:#eef2ff; box-shadow:inset 3px 0 0 var(--dt-brand,#4d6bfe); }
.dtx-node-icon { width:24px; height:24px; border-radius:50%; flex:none; display:flex; align-items:center; justify-content:center; border:1.6px solid #c5ccd8; color:#fff; }
.dtx-node-icon[data-state=confirmed], .dtx-node-icon[data-state=checked], .dtx-node-icon[data-state=practiced] { border-color:#22a06b; background:#22a06b; }
.dtx-node-icon[data-state=explained] { border-color:#22a06b; color:#22a06b; }
.dtx-node-icon[data-state=weak], .dtx-node-icon[data-state=blocked] { border-color:#d97706; background:#d97706; }
.dtx-node-row[aria-current] .dtx-node-icon { border-color:var(--dt-brand,#4d6bfe); background:var(--dt-brand,#4d6bfe); }
.dtx-node-main { min-width:0; flex:1; }
.dtx-node-title { display:block; font-size:13.5px; font-weight:600; }
.dtx-node-sub { display:block; color:var(--dt-muted,#6b7280); font-size:12px; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dtx-node-row .dtx-pill { flex:none; }
.dtx-node-chevron { color:#aab1bd; flex:none; }
.dtx-knowledge-detail { flex:1; min-width:0; padding:22px 24px; overflow:auto; }
.dtx-detail-head h2 { margin:0; font-size:23px; letter-spacing:-.025em; display:inline; }
.dtx-detail-head { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.dtx-detail-desc { color:var(--dt-muted,#6b7280); font-size:13px; line-height:1.7; margin:10px 0 0; }
.dtx-detail-section { margin-top:24px; }
.dtx-detail-section h3 { margin:0 0 10px; font-size:13px; font-weight:700; }
.dtx-breadcrumb { display:flex; align-items:center; gap:8px; padding:11px 14px; border-radius:10px; background:var(--dt-surface,#f6f7f9); color:var(--dt-muted,#6b7280); font-size:12.5px; flex-wrap:wrap; }
.dtx-breadcrumb b { color:var(--dt-text,#1c1f23); font-weight:600; }
.dtx-chips { display:flex; gap:8px; flex-wrap:wrap; }
.dtx-chip { display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 12px; border-radius:8px; border:1px solid var(--dt-border,#e2e6ec); background:var(--dt-bg,#fff); font-size:12px; color:var(--dt-text,#1c1f23); }
.dtx-chip[data-state=confirmed] { border-color:#c6ecd5; background:#f4fcf7; }
.dtx-evidence { display:flex; flex-direction:column; gap:10px; }
.dtx-evidence-card { display:flex; align-items:flex-start; gap:12px; padding:14px 16px; border:1px solid var(--dt-border,#e8eaee); border-radius:12px; background:var(--dt-bg,#fff); }
.dtx-evidence-icon { width:36px; height:36px; border-radius:9px; background:#eef2ff; color:#3155f5; display:flex; align-items:center; justify-content:center; flex:none; }
.dtx-evidence-main { flex:1; min-width:0; }
.dtx-evidence-title { font-size:12.5px; font-weight:600; }
.dtx-evidence-note { color:var(--dt-muted,#6b7280); font-size:12px; margin-top:2px; }
.dtx-evidence-side { text-align:right; flex:none; }
.dtx-evidence-when { color:var(--dt-muted,#6b7280); font-size:11px; margin-top:6px; }
.dtx-info-box { display:flex; gap:11px; align-items:flex-start; margin-top:18px; padding:14px 16px; border-radius:12px; background:#f5f7ff; border:1px solid #dbe3f4; }
.dtx-info-box .dtx-info-icon { color:#3155f5; flex:none; margin-top:1px; }
.dtx-info-title { color:#3155f5; font-size:12.5px; font-weight:700; }
.dtx-info-body { color:#4b5563; font-size:12px; margin-top:2px; }
.dtx-knowledge-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--dt-muted,#6b7280); font-size:12.5px; padding:40px; text-align:center; }

/* ---------- lesson tab ---------- */
.dtx-tab { flex:1 1 auto; min-height:0; height:100%; overflow-y:auto; overflow-x:auto; overscroll-behavior:contain; background:var(--dt-bg,#fff); color:var(--dt-text,#1c1f23); font-size:13px; line-height:1.6; padding:18px 18px 30px; text-align:left; }
.dtx-tab * { box-sizing:border-box; }
.dtx-tab h2 { margin:8px 0 0; font-size:21px; letter-spacing:-.025em; line-height:1.3; }
.dtx-tab-head-meta { color:var(--dt-muted,#6b7280); font-size:12px; margin-top:3px; }
.dtx-tab-pills { display:flex; gap:7px; flex-wrap:wrap; margin-top:11px; }
.dtx-tab-progress { display:flex; margin-top:12px; padding:11px 13px; border-radius:10px; background:var(--dt-surface,#f6f7f9); color:var(--dt-muted,#6b7280); font-size:12px; justify-content:space-between; gap:10px; }
.dtx-tab-divider { height:1px; background:var(--dt-border,#eceef2); margin:18px 0; }
.dtx-tab-section { margin:20px 0 10px; display:flex; align-items:center; gap:9px; font-size:13px; font-weight:700; }
.dtx-tab-section .dtx-section-icon { color:#3155f5; }
.dtx-tab-text { color:var(--dt-text,#1c1f23); font-size:13px; line-height:1.75; }
.dtx-tab-text + .dtx-tab-text { margin-top:10px; }
.dtx-tab-concept { padding:12px 14px; border-radius:10px; background:var(--dt-surface,#f7f8fa); color:var(--dt-text,#1c1f23); font-size:12.5px; line-height:1.65; }
.dtx-tab-diagram { border-radius:10px; border:1px solid var(--dt-border,#e8eaee); background:#fafbfc; padding:14px; overflow:auto; font-size:12px; }
.dtx-tab-example { padding:13px 14px; border-radius:10px; background:#f7f8fa; border:1px solid var(--dt-border,#eceef2); }
.dtx-tab-example ol { margin:8px 0 0; padding-left:20px; color:var(--dt-muted,#6b7280); font-size:12.5px; }
.dtx-tab-check { padding:14px 16px; border-radius:12px; background:#f0fdf4; border:1px solid #bbf7d0; }
.dtx-tab-check-title { color:#15803d; font-size:12.5px; font-weight:700; display:flex; gap:8px; align-items:center; }
.dtx-tab-check-body { color:#166534; font-size:12.5px; margin-top:4px; line-height:1.65; }
.dtx-tab-empty { min-height:420px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 20px; }
.dtx-tab-empty-icon { width:78px; height:78px; border-radius:18px; background:#f1f2f4; color:#6b7280; display:flex; align-items:center; justify-content:center; margin-bottom:18px; }
.dtx-tab-empty h2 { margin:0 0 6px; font-size:18px; }
.dtx-tab-empty p { color:var(--dt-muted,#6b7280); font-size:12.5px; margin:0 0 18px; }
.dtx-tab-linkrow { display:flex; gap:10px; flex-wrap:wrap; }
.dtx-tab-outcome { margin-top:16px; padding:13px 14px; border-radius:10px; background:var(--dt-surface,#f7f8fa); }
.dtx-tab-outcome b { display:block; font-size:12px; color:var(--dt-muted,#6b7280); margin-bottom:3px; }


/* stacked next-step variants (waiting / error / version / complete) */
.dtx-next[data-layout=stack] { flex-direction:column; align-items:stretch; }
.dtx-next[data-layout=stack] .dtx-next-actions { flex-direction:row; justify-content:center; align-items:center; min-width:0; flex-wrap:wrap; }
.dtx-next[data-layout=stack] .dtx-next-copy { display:flex; flex-direction:column; }
.dtx-next[data-layout=stack] .dtx-next-body { margin-bottom:2px; }

/* a long ASCII diagram is reference material: keep the lesson short, expand on demand */
.dtx-tab-fold { margin:12px 0; padding:10px 13px; border:1px solid var(--dt-border,#e8eaee); border-radius:10px; background:var(--dt-surface,#f7f8fa); }
.dtx-tab-fold summary { cursor:pointer; color:var(--dt-brand-ink,#3155f5); font-size:12.5px; font-weight:600; }
.dtx-tab-fold[open] summary { margin-bottom:8px; }
.dtx-tab-fold .dt-block { margin:4px 0 0; }

/* override the legacy check-block chrome inside the new tab */
.dtx-tab .dt-check-head { background:transparent; color:#15803d; padding:0; }
.dtx-tab .dt-check-tag { color:#15803d; font-size:11px; letter-spacing:.04em; }
.dtx-tab .dt-check-where { color:#15803d; opacity:1; font-size:11.5px; }
.dtx-tab .dt-check-body { padding:8px 0 0; }
.dtx-tab .dt-check-body .dt-block-md:last-child { margin-bottom:0; }
.dtx-tab .dt-check-hint { margin:0; padding:9px 0 0; border-top:1px dashed #bbf7d0; background:transparent; color:#15803d; }
.dtx-tab .dt-rail-progress { display:none; }

.dtx-today { margin-bottom:12px; padding:14px 16px; background:var(--dt-surface,#f7f8fa); border:1px solid var(--dt-border,#e8eaee); border-radius:12px; }
.dtx-today-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.dtx-today-eyebrow { margin:0 0 2px; color:var(--dt-brand-ink,#3b56d9); font-size:11.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
.dtx-today h2 { margin:0; font-size:16px; }
.dtx-today-list { margin:10px 0 0; padding:0; list-style:none; }
.dtx-today-task { display:flex; align-items:baseline; gap:8px; min-height:28px; border-top:1px solid var(--dt-border,#e8eaee); padding:6px 0; font-size:12.5px; }
.dtx-today-task:first-child { border-top:0; }
.dtx-today-dot { width:7px; height:7px; border-radius:50%; background:var(--dt-brand,#4d6bfe); flex:none; }
.dtx-today-title { flex:1 1 auto; min-width:0; overflow-wrap:anywhere; }
.dtx-today-due { color:var(--dt-muted,#6b7280); font-size:11.5px; white-space:nowrap; }
.dtx-today-done { display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border:1px solid var(--dt-border,#e8eaee); border-radius:999px; background:var(--dt-bg,#fff); color:var(--dt-muted,#6b7280); font-size:11px; cursor:pointer; white-space:nowrap; }
.dtx-today-done:hover { color:var(--dt-good,#1f8b4c); border-color:var(--dt-good,#1f8b4c); }
.dtx-today-more { margin:6px 0 0; color:var(--dt-muted,#6b7280); font-size:11.5px; }
.dtx-today .dtx-link { display:inline-flex; align-items:center; gap:5px; font-size:12px; }

.dtx-tab-teachhint {.dtx-tab-teachhint { margin:8px 0 0; color:var(--dt-muted,#6b7280); font-size:12px; }
.dtx-tab-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:10px; }
.dtx-tab-actions .dtx-primary, .dtx-tab-actions .dtx-secondary { min-height:36px; padding:0 12px; font-size:12.5px !important; }
.dtx-tab-notice { margin:8px 0 0; padding:8px 10px; border-radius:8px; background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:12px; }

/* the lesson is a reading surface: cap line length when the tab is wide */
.dtx-tab-inner { width:100%; max-width:720px; margin:0 auto; }
.dtx-tab .dt-md-table-wrap { margin:12px 0 14px; overflow-x:auto; border:1px solid var(--dt-border,#e8eaee); border-radius:10px; }
.dtx-tab .dt-md-table { width:100%; border-collapse:collapse; font-size:12.5px; line-height:1.55; }
.dtx-tab .dt-md-table th, .dtx-tab .dt-md-table td { padding:8px 10px; border-bottom:1px solid var(--dt-border,#eceef2); text-align:left; vertical-align:top; }
.dtx-tab .dt-md-table th { background:var(--dt-surface,#f7f8fa); color:var(--dt-text,#1c1f23); font-weight:700; white-space:nowrap; }
.dtx-tab .dt-md-table tr:last-child td { border-bottom:0; }
.dtx-tab .dt-md-code { margin:12px 0; padding:12px 14px; border-radius:10px; background:#0f172a; color:#e2e8f0; overflow-x:auto; font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; }
.dtx-tab .dt-md-code code { font:inherit; white-space:pre; }
.dtx-tab .dt-md-h2, .dtx-tab .dt-md-h3 { margin:20px 0 8px; font-size:15px; line-height:1.4; letter-spacing:-.01em; }
.dtx-tab .dt-md-ul, .dtx-tab .dt-md-ol { margin:8px 0 12px; padding-left:20px; }
.dtx-tab .dt-md-ul li, .dtx-tab .dt-md-ol li { margin:3px 0; }
.dtx-tab .dt-block { margin:0 0 16px; }
.dtx-tab .dt-block + .dt-block { margin-top:20px; }
.dtx-tab .dt-block-label { margin-bottom:8px; }

/* lesson blocks inside the docked tab */
.dtx-tab .dt-block { margin:0 0 14px; }
.dtx-tab .dt-block-label { margin:0 0 7px; display:flex; align-items:center; gap:6px; color:#3155f5; font-size:11.5px; font-weight:700; letter-spacing:0; text-transform:none; }
.dtx-tab .dt-block-label-icon { display:inline-flex; color:#3155f5; }
.dtx-tab .dt-block-md { font-size:13px; line-height:1.75; color:var(--dt-text,#1c1f23); }
.dtx-tab .dt-block-md p { margin:0 0 10px; }
.dtx-tab .dt-block-md p:last-child { margin-bottom:0; }
.dtx-tab .dt-block-md h2, .dtx-tab .dt-block-md h3 { margin:16px 0 8px; font-size:14.5px; }
.dtx-tab .dt-block-md ul, .dtx-tab .dt-block-md ol { margin:6px 0 10px; padding-left:22px; }
.dtx-tab .dt-block-md li { margin:3px 0; }
.dtx-tab .dt-block-text { padding:0; border-radius:0; background:transparent; }
.dtx-tab .dt-block-diagram { border:1px solid var(--dt-border,#e8eaee); border-radius:10px; background:#fafbfc; padding:12px; overflow:auto; }
.dtx-tab .dt-block-diagram .dt-pre { margin:0; white-space:pre-wrap; font-size:11.5px; line-height:1.6; }
.dtx-tab .dt-block-example { border:1px solid var(--dt-border,#eceef2); border-radius:10px; background:#f7f8fa; padding:13px 14px; }
.dtx-tab .dt-block-check { border:1px solid #bbf7d0; border-radius:12px; background:#f0fdf4; padding:14px 16px; }
.dtx-tab .dt-check-head { display:flex; align-items:center; gap:8px; }
.dtx-tab .dt-check-body { color:#166534; font-size:12.5px; line-height:1.65; margin-top:4px; }
.dtx-tab .dt-check-hint { color:#15803d; font-size:11.5px; margin-top:6px; }
.dtx-tab .dt-check-where { color:#15803d; font-size:11.5px; }
.dtx-tab .dt-check-tag { color:#15803d; font-size:11.5px; font-weight:700; }
.dtx-tab .dt-caption { color:var(--dt-muted,#6b7280); font-size:11.5px; }


.dtx-tip-title, .dtx-tip-body, .dtx-hint-title, .dtx-hint-body,
.dtx-info-title, .dtx-info-body, .dtx-how-title, .dtx-how-body,
.dtx-evidence-title, .dtx-evidence-note, .dtx-rail-item-title, .dtx-rail-item-desc,
.dtx-module-title, .dtx-module-desc { display:block; }
.dtx-stagebar .dtx-stage { flex:0 0 auto; }
.dtx-stagebar .dtx-stage-line { flex:1 1 18px; min-width:14px; height:1px; background:#d8dce3; }
.dtx-next[data-kind=complete] .dtx-next-copy { display:flex; flex-direction:column; }


.dtx-main, .dtx-route-card, .dtx-module, .dtx-lesson, .dtx-next, .dtx-card, .dtx-rail-card { min-width:0; }
.dtx-lesson-top { flex-wrap:nowrap; gap:6px; align-items:baseline; }
.dtx-lesson-title { flex:1 1 auto; min-width:0; overflow-wrap:anywhere; }
.dtx-module-head, .dtx-route-head { flex-wrap:wrap; }
.dtx-module-meta { text-align:right; }
.dtx-route-meta { flex-wrap:wrap; }
.dtx-next h2 { overflow-wrap:anywhere; }

.dt-block-code .dt-pre { margin-top:6px; }
.dt-block-quiz { padding:12px 14px; }
.dt-source-refs { margin-top:8px; border-top:1px dashed var(--dt-border,#e8eaee); padding-top:8px; }
.dt-source-ref { display:inline-block; margin:2px 6px 2px 0; padding:3px 8px; border:1px solid var(--dt-border,#e8eaee); border-radius:999px; background:var(--dt-surface,#f7f8fa); color:var(--dt-brand-ink,#3155f5); font-size:11.5px; cursor:pointer; }
.dt-source-preview { margin-top:8px; padding:10px 12px; border:1px solid var(--dt-border,#e8eaee); border-radius:8px; background:var(--dt-surface,#f7f8fa); }
.dt-source-preview-title { margin:0 0 2px; font-weight:600; }
.dt-source-preview pre { max-height:240px; overflow:auto; margin:8px 0 0; white-space:pre-wrap; font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; }
.dt-quiz-option { display:flex; align-items:flex-start; gap:8px; margin:4px 0; cursor:pointer; }
.dt-quiz-option input { margin-top:4px; }
.dt-quiz-input { width:100%; margin:4px 0 8px; padding:8px 10px; border:1px solid var(--dt-border,#e8eaee); border-radius:7px; background:var(--dt-bg,#fff); color:var(--dt-text,#1c1f23); font:inherit; }
.dt-quiz-recorded { margin:8px 0 0; color:var(--dt-good,#1f8b4c); font-size:12px; }
.dt-flashcard-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.dt-flashcard-front { margin:6px 0; font-weight:600; }
.dt-block-quiz .dt-quiz-question { margin:10px 0; }
.dt-quiz-prompt { margin:0 0 6px; }
.dt-quiz-options { margin:0 0 8px; padding-left:22px; }
.dt-quiz-options li { margin:3px 0; }
.dt-block-flashcard .dt-flashcard { margin-top:6px; padding:10px 12px; border:1px solid var(--dt-border,#e8eaee); border-radius:8px; }
.dt-flashcard summary { cursor:pointer; font-weight:600; }
.dt-flashcard-back { margin:8px 0 0; color:var(--dt-muted,#6b7280); }
.dt-resource-title { margin:6px 0 2px; font-weight:600; }
.dt-block-comparison .dt-md-table-wrap { margin-top:8px; }

.dt-block-formula { padding:12px 14px; }
.dt-block-formula .dt-formula-body { margin-top:6px; overflow-x:auto; font-size:1.05em; }
.dt-block-formula .dt-formula-body math { display:block; margin:0 auto; }
.dt-math math { display:inline-block; vertical-align:middle; }
.dt-math-source { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.95em; }

/* tables and fenced code are produced by the shared block renderer, so style
   them wherever a lesson body is shown (old inline panel included). */
.dt-md-table-wrap { margin:12px 0 14px; overflow-x:auto; border:1px solid var(--dt-border,#e8eaee); border-radius:10px; }
.dt-md-table { width:100%; border-collapse:collapse; font-size:12.5px; line-height:1.55; }
.dt-md-table th, .dt-md-table td { padding:8px 10px; border-bottom:1px solid var(--dt-border,#eceef2); text-align:left; vertical-align:top; }
.dt-md-table th { background:var(--dt-surface,#f7f8fa); color:var(--dt-text,#1c1f23); font-weight:700; white-space:nowrap; }
.dt-md-table tr:last-child td { border-bottom:0; }
.dt-md-code { margin:12px 0; padding:12px 14px; border-radius:10px; background:#0f172a; color:#e2e8f0; overflow-x:auto; font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; }
.dt-md-code code { font:inherit; white-space:pre; }

/* ---------- responsive ---------- */
@media (max-width:1120px) {
  .dtx-stagebar { gap:6px; padding:10px 12px; }
  .dtx-stage { gap:7px; }
  .dtx-stage-num { width:26px; height:26px; font-size:11.5px; }
  .dtx-stage-label { font-size:12.5px; }
  .dtx-stagebar .dtx-stage-line { min-width:10px; }
  .dtx-rail { flex-basis:300px; width:300px; }
  .dtx-topbar, .dtx-tabs, .dtx-content { padding-left:22px; padding-right:22px; }
  .dtx-knowledge-list { flex-basis:400px; }
}
@media (max-width:900px) {
  .dtx-route { flex-direction:column; align-items:stretch; }
  .dtx-module-toggle { grid-template-columns:auto minmax(0,1fr) auto; }
  .dtx-module-meta { grid-column:2; grid-row:2; text-align:left; padding-top:2px; }
  .dtx-module-chevron { grid-column:3; grid-row:1; }
  .dtx-rail { position:static; width:100%; flex-basis:auto; }
  .dtx-knowledge { flex-direction:column; }
  .dtx-knowledge-list { flex-basis:auto; }
  .dtx-stage-label { font-size:12.5px; }
  .dtx-topbar-project { font-size:14.5px; }
  .dtx-next { align-items:flex-start; flex-direction:column; }
  .dtx-next-actions { width:100%; min-width:0; flex-direction:row; flex-wrap:wrap; }
  .dtx-proposal { flex-wrap:wrap; }
  .dtx-proposal-stats { border-left:0; padding:0; flex:1 1 100%; }
  .dtx-proposal-actions { flex-direction:row; width:100%; }
  .dtx-hero-row { flex-direction:column; }
}
@media (max-width:620px) {
  .dtx-topbar { height:56px; padding:0 14px; }
  .dtx-tabs { padding:0 14px; gap:18px; }
  .dtx-content { padding:16px 14px 40px; }
  .dtx-topbar-page { font-size:15px; }
  .dtx-topbar-divider { display:none; }
  .dtx-topbar-project { font-size:13.5px; }
  .dtx-back span { display:none; }
  .dtx-stagebar { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; overflow:visible; padding:10px 12px; }
  .dtx-stage { min-width:0; }
  .dtx-stage-label { font-size:11.5px; white-space:normal; }
  .dtx-stage-num { width:24px; height:24px; font-size:11px; }
  .dtx-stage-line { display:none; }
  .dtx-hero { padding:20px; }
  .dtx-hero h1 { font-size:22px; }
  .dtx-project-row { flex-wrap:wrap; gap:12px; }
  .dtx-project-action { width:100%; margin-left:0; }
  .dtx-next h2 { font-size:19px; }
  .dtx-form-card, .dtx-route-card, .dtx-info-card, .dtx-knowledge-detail { padding:18px; }
  .dtx-more-grid { grid-template-columns:1fr; }
  .dtx-lesson-topics { white-space:normal; }
  .dtx-lessons { grid-template-columns:1fr; }
  .dtx-next h2, .dtx-rail-title, .dtx-detail-head h2 { overflow-wrap:anywhere; }
}
`
