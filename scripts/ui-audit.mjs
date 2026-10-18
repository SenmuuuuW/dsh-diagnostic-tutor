/**
 * Audit the panel's presentation, and capture what it looks like.
 *
 * `responsive-check.mjs` answers "does anything overflow". This answers the
 * questions a polish pass actually needs, at every width and in both themes:
 *
 *   - **contrast** of every control's own text against its own fill. A token
 *     that resolves to near-white in dark mode makes a primary button vanish;
 *     nothing else in the toolchain notices, because the page still renders.
 *   - **dead classes** — class names present in the DOM that no rule in the
 *     injected sheet matches. This is how a renamed selector turns into an
 *     unstyled list without anyone editing a stylesheet to say so.
 *   - **button hierarchy** — how many primary-weight controls share a view.
 *     Two "primary" buttons in one column is not a style preference, it is an
 *     unanswered question about what the learner should press.
 *   - **tap targets and type floor** — controls under 28px, text under 10px.
 *   - **clipping** — elements whose content is wider than their own box.
 *
 * It never fails the run on a finding: it prints a table and saves images, so a
 * human can disagree with it. Exit is non-zero only if the panel does not
 * mount at all.
 *
 * Usage:
 *   node scripts/ui-audit.mjs <url-with-token|preview-url> [outdir] [--surface=panel|tab|map]
 *
 * For a live profile, pass the tokenised URL it prints. For the standalone
 * preview, `pnpm preview` then pass http://127.0.0.1:8391/.
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9281
const PANEL_LABEL = 'Learn'

const url = process.argv[2]
const outDir = process.argv[3] ?? '/tmp/ui-audit'
const surface = (process.argv.find((a) => a.startsWith('--surface=')) ?? '--surface=panel').split('=')[1]
if (!url) {
  console.error('usage: node scripts/ui-audit.mjs <url-with-token|preview-url> [outdir] [--surface=panel|tab|map]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await mkdir(outDir, { recursive: true })

/**
 * The widths that decide each surface.
 *
 * The panel owns the main column, so it is measured at the two window widths
 * this project targets and at the width where its three columns collapse. The
 * docked tab lives in the right sidebar, which is 300–520px wide whatever the
 * window is — measuring it at 1440 would report on a layout that never ships.
 */
const SIZES =
  surface === 'tab'
    ? [
        { name: 'sidebar-320', width: 320, height: 900 },
        { name: 'sidebar-400', width: 400, height: 900 },
        // One tall pass: the map, the evidence and the recommendation card all
        // sit below the fold at a real sidebar height, and a screenshot that
        // stops at the lesson proves nothing about them.
        { name: 'sidebar-400-tall', width: 400, height: 2400 },
      ]
    : [
        { name: '1264', width: 1264, height: 860 },
        { name: '1440', width: 1440, height: 900 },
        { name: 'narrow', width: 900, height: 800 },
        { name: '1440-tall', width: 1440, height: 1800 },
      ]

class Cdp {
  #socket
  #next = 1
  #pending = new Map()

  static async attach(port) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        const page = targets.find((target) => target.type === 'page')
        if (page?.webSocketDebuggerUrl) {
          const cdp = new Cdp()
          await cdp.#open(page.webSocketDebuggerUrl)
          return cdp
        }
      } catch {
        /* still starting */
      }
      await sleep(250)
    }
    throw new Error('could not attach to Chrome')
  }

  #open(wsUrl) {
    return new Promise((resolve, reject) => {
      this.#socket = new WebSocket(wsUrl)
      this.#socket.addEventListener('open', () => resolve())
      this.#socket.addEventListener('error', reject)
      this.#socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data)
        const pending = this.#pending.get(message.id)
        if (!pending) return
        this.#pending.delete(message.id)
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
        else pending.resolve(message.result)
      })
    })
  }

  send(method, params = {}) {
    const id = this.#next++
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) return { __error: result.exceptionDetails.text }
    return result.result?.value
  }

  close() {
    this.#socket?.close()
  }
}

/**
 * Everything this script checks, evaluated in the page.
 *
 * Kept as one expression so a single round trip covers a whole view; the
 * helpers it needs are inlined because it is serialised, not imported.
 */
const AUDIT = `(() => {
  /* One root per surface. The tab lives in the right sidebar and the panel in
     the main column, and a live profile can have both mounted at once — so
     picking "whichever exists" silently audits the other one. */
  const ROOT = ${JSON.stringify(surface)} === 'tab'
    ? document.querySelector('.dt-tab')
    : ${JSON.stringify(surface)} === 'map'
      ? (document.querySelector('.dt-map-root-wrap') || document.querySelector('.dt-map-root'))
      : (document.querySelector('.dt-root-wrap') || document.querySelector('.dt-root'));
  if (!ROOT) return { mounted: false, rootClass: null };

  /* --- colour ---------------------------------------------------------- */
  const parse = (value) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(value || '');
    if (!m) return null;
    const parts = m[1].split(',').map((n) => parseFloat(n));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  /* Walk up for the first opaque background: a transparent button is judged
     against what is actually behind it. */
  const fill = (el) => {
    let node = el;
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.9) return c;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
  };

  const controls = [...ROOT.querySelectorAll('button, [role=button]')].filter((el) => el.getBoundingClientRect().width > 0);
  const contrast = [];
  for (const el of controls) {
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    // A disabled control is dimmed on purpose; judged separately below.
    const r = ratio(fg, fill(el));
    contrast.push({
      label: (el.textContent || '').trim().slice(0, 22) || el.className,
      cls: (el.className || '').toString().split(' ').find((c) => c.startsWith('dt-')) || '',
      ratio: r,
      disabled: el.disabled === true,
      h: Math.round(el.getBoundingClientRect().height),
      size: parseFloat(cs.fontSize),
    });
  }

  /* Bands whose own text sits on the band's own solid fill. */
  const bands = [...ROOT.querySelectorAll('.dt-check-head, .dt-next-label, .dt-danger')].map((el) => {
    const cs = getComputedStyle(el);
    return {
      cls: el.className,
      text: (el.textContent || '').trim().slice(0, 20),
      ratio: ratio(parse(cs.color) || { r: 0, g: 0, b: 0 }, fill(el)),
    };
  });

  /* The panels that carry the reading, with the two values that decide whether
     they can be read: the surface they sit on and the surface they are. */
  const surfaces = ['.dt-root', '.dt-bar', '.dt-foot', '.dt-goal', '.dt-lesson-body', '.dt-block-check',
    '.dt-check-head', '.dt-check-body', '.dt-next', '.dt-block-example', '.dt-pre', '.dt-now',
    '.dt-welcome-sample']
    .map((sel) => {
      const el = ROOT.querySelector(sel) || document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { sel, bg: cs.backgroundColor, fg: cs.color };
    })
    .filter(Boolean);

  /* --- dead classes ---------------------------------------------------- */
  const defined = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const rule of list) {
        /* selectorText first: with CSS nesting, a plain style rule also
           exposes an (empty) cssRules, so testing that first recurses into
           nothing and reports every class in the DOM as undefined. */
        const sel = rule.selectorText;
        if (sel) for (const m of sel.matchAll(/\\.([\\w-]+)/g)) defined.add(m[1]);
        if (rule.cssRules && rule.cssRules.length > 0) walk(rule.cssRules);
      }
    };
    walk(rules);
  }
  /* Every class the panel puts in the DOM, ours and the framework's alike:
     a class with no rule is a rename that silently lost its styling, which is
     how a JSX edit turns into an unstyled list. */
  const used = new Set();
  for (const el of ROOT.querySelectorAll('*')) {
    for (const c of el.classList) used.add(c);
  }
  const dead = [...used].filter((c) => !defined.has(c)).sort();

  /* --- geometry -------------------------------------------------------- */
  const doc = document.documentElement;
  const overflowX = doc.scrollWidth > doc.clientWidth + 1;
  const spill = [...ROOT.querySelectorAll('*')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > doc.clientWidth + 2 || r.left < -2);
    })
    .slice(0, 5)
    .map((el) => ((el.className || el.tagName) + '').slice(0, 46));
  const clipped = [...ROOT.querySelectorAll('*')]
    .filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'hidden')
    .slice(0, 5)
    .map((el) => ((el.className || el.tagName) + '').slice(0, 46));

  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const primary = [...ROOT.querySelectorAll('.dt-primary')].filter(visible)
    .map((el) => (el.textContent || '').trim().slice(0, 24));
  const small = controls
    .filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.height < 28; })
    .map((el) => ((el.textContent || '').trim().slice(0, 20) || el.className) + ':' + Math.round(el.getBoundingClientRect().height));

  const tiny = [...ROOT.querySelectorAll('*')]
    .filter((el) => visible(el) && el.children.length === 0 && (el.textContent || '').trim().length > 0)
    .map((el) => parseFloat(getComputedStyle(el).fontSize))
    .filter((n) => n > 0 && n < 10.5);

  const body = getComputedStyle(document.body);
  const panel = getComputedStyle(ROOT);
  return {
    mounted: true,
    rootClass: (ROOT.className || '').toString(),
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    bg: panel.backgroundColor,
    bodyBg: body.backgroundColor,
    overflowX,
    spill,
    clipped,
    dead,
    primary,
    small,
    tinyCount: tiny.length,
    tinyMin: tiny.length ? Math.min(...tiny) : null,
    contrast,
    bands,
    surfaces,
    nodes: ROOT.querySelectorAll('.dt-node, .dt-tab-node').length,
    blocks: ROOT.querySelectorAll('[data-block-type]').length,
    panes: ROOT.querySelectorAll('.dt-pane').length,
  };
})()`

const profile = await mkdtemp(join(tmpdir(), 'dt-uiaudit-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const findings = []
const note = (kind, detail) => findings.push({ kind, detail })

let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(9000)

  // A live profile opens with the harness's own "Internal Testing Notice"
  // modal, which covers the panel and would make every screenshot useless.
  // Dismissed by its own heading, so this cannot press the panel's Continue.
  const notice = await cdp.evaluate(`(() => {
    const heading = [...document.querySelectorAll('h1, h2, h3, [role=heading], div')]
      .find((el) => (el.textContent || '').trim() === 'Internal Testing Notice');
    if (!heading) return false;
    const box = heading.closest('[role=dialog], dialog, div');
    const hit = [...(box?.parentElement ?? document.body).querySelectorAll('button')]
      .find((el) => (el.textContent || '').trim() === 'Continue');
    hit?.click();
    return !!hit;
  })()`)
  if (notice) await sleep(1200)

  // The panel is behind a sidebar entry in DSH; in the preview it is already
  // mounted, so a miss here is not fatal.
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button, [role=button]')]
      .find((el) => ((el.getAttribute('aria-label') || el.textContent || el.title || '').trim()) === ${JSON.stringify(PANEL_LABEL)});
    if (hit) { hit.click(); return true; }
    return !!document.querySelector('.dt-root, .dt-tab, .dt-map-root');
  })()`)
  await sleep(3000)

  if (surface === 'tab') {
    /*
     * Three ways the tab can appear, tried in order:
     *
     *   1. it is already mounted (the standalone preview renders it directly);
     *   2. a tab chip labelled Learning is sitting in the right sidebar;
     *   3. nothing is docked — so start learning, which is the action that
     *      docks it.
     *
     * The third is the real path a learner takes, and it is the only one that
     * works on a fresh profile: the plugin deliberately does not dock the tab
     * on load.
     */
    const dock = async (expression) => {
      await cdp.evaluate(expression)
      await sleep(2500)
    }
    if (!(await cdp.evaluate(`!!document.querySelector('.dt-tab')`))) {
      await dock(`(() => {
        const hit = [...document.querySelectorAll('button, [role=button]')]
          .find((el) => (el.textContent || '').trim() === 'Learning');
        hit?.click();
      })()`)
    }
    if (!(await cdp.evaluate(`!!document.querySelector('.dt-tab')`))) {
      await dock(`(() => {
        const hit = [...document.querySelectorAll('.dt-primary')]
          .find((el) => /Start learning|Keep going|Continue|Learning in progress/.test(el.textContent || ''));
        hit?.click();
      })()`)
      await sleep(4000)
    }
    /*
     * The fourth step is the one that actually docks on a real profile, and it
     * is not obvious: the right sidebar only accepts a session-scoped tab while
     * a session surface is mounted, and the panel occupies the column the
     * conversation lives in. So the tab can only appear *after* leaving the
     * panel — which is the whole reason the "Answer in the chat" door exists.
     */
    if (!(await cdp.evaluate(`!!document.querySelector('.dt-tab')`))) {
      await dock(`(() => {
        const hit = [...document.querySelectorAll('button, [role=button]')]
          .find((el) => /Answer in the chat|Back to the conversation/.test(el.textContent || ''));
        hit?.click();
      })()`)
      await sleep(6000)
      // The plugin retries the docking for a few seconds after the session
      // surface mounts; once the chip is there, it is the reliable way in.
      await dock(`(() => {
        const hit = [...document.querySelectorAll('button, [role=button], [role=tab]')]
          .find((el) => (el.textContent || '').trim() === 'Learning');
        hit?.click();
      })()`)
      await sleep(3000)
    }
  }

  if (surface === 'map' && !(await cdp.evaluate(`!!document.querySelector('.dt-map-root')`))) {
    // The map page is a main panel: its sidebar entry is labelled, not a tab.
    await cdp.evaluate(`(() => {
      const hit = [...document.querySelectorAll('button, [role=button]')]
        .find((el) => ((el.getAttribute('aria-label') || el.textContent || el.title || '').trim()) === 'Learning map');
      hit?.click();
    })()`)
    await sleep(3000)
  }

  const rootSelector = surface === 'tab' ? '.dt-tab' : surface === 'map' ? '.dt-map-root' : '.dt-root'
  const mounted = await cdp.evaluate(`!!document.querySelector(${JSON.stringify(rootSelector)})`)
  if (!mounted) throw new Error(`${surface} never mounted`)

  for (const theme of ['light', 'dark']) {
    await cdp.evaluate(`(() => {
      if (${JSON.stringify(theme)} === 'dark') document.body.setAttribute('data-ds-dark-theme', '');
      else document.body.removeAttribute('data-ds-dark-theme');
    })()`)
    await sleep(600)

    for (const size of SIZES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: size.width,
        height: size.height,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await sleep(700)
      const result = await cdp.evaluate(AUDIT)
      if (!result || result.mounted !== true) {
        throw new Error(`${surface} not mounted during ${theme}/${size.name} audit`)
      }

      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await writeFile(join(outDir, `${surface}-${theme}-${size.name}.png`), Buffer.from(shot.data, 'base64'))

      const worst = result.contrast
        .filter((c) => !c.disabled && c.ratio < 4.5)
        .sort((a, b) => a.ratio - b.ratio)
        .slice(0, 3)
      console.log(
        `\n[${surface} ${theme} ${size.name}] root=${result.rootClass} panes=${result.panes} nodes=${result.nodes} blocks=${result.blocks} overflowX=${result.overflowX} dead=${result.dead.length} primary=${result.primary.length}`,
      )
      if (result.bg !== result.bodyBg) console.log(`  bg panel=${result.bg} body=${result.bodyBg}  <-- frame mismatch`)
      if (result.spill.length) console.log(`  spill:   ${result.spill.join(' | ')}`)
      if (result.clipped.length) console.log(`  clipped: ${result.clipped.join(' | ')}`)
      if (result.dead.length) console.log(`  dead classes: ${result.dead.join(', ')}`)
      for (const s of result.surfaces) console.log(`  surface ${s.sel.padEnd(20)} bg=${s.bg.padEnd(26)} fg=${s.fg}`)
      if (result.primary.length > 1) console.log(`  ${result.primary.length} primary buttons: ${result.primary.join(' / ')}`)
      if (result.small.length) console.log(`  under 28px: ${result.small.join(' | ')}`)
      if (result.tinyCount) console.log(`  text under 10.5px: ${result.tinyCount} nodes, min ${result.tinyMin}px`)
      for (const c of worst) console.log(`  low contrast: "${c.label}" (${c.cls}) ${c.ratio}:1 at ${c.size}px`)
      for (const b of result.bands.filter((b) => b.ratio < 4.5)) {
        console.log(`  low contrast band: ${b.cls} "${b.text}" ${b.ratio}:1`)
      }

      if (result.overflowX) note('overflow', `${surface}/${theme}/${size.name}`)
      if (result.dead.length) note('dead-classes', `${surface}/${theme}/${size.name}: ${result.dead.join(', ')}`)
      if (result.primary.length > 1) note('two-primaries', `${surface}/${theme}/${size.name}: ${result.primary.join(' / ')}`)
      for (const c of worst) note('contrast', `${surface}/${theme}/${size.name}: "${c.label}" ${c.ratio}:1`)
      for (const b of result.bands.filter((b) => b.ratio < 4.5)) {
        note('contrast', `${surface}/${theme}/${size.name}: ${b.cls} "${b.text}" ${b.ratio}:1`)
      }
      if (result.spill.length) note('spill', `${surface}/${theme}/${size.name}: ${result.spill.join(' | ')}`)
    }
  }

  console.log('\n=== FINDINGS ===')
  if (findings.length === 0) console.log('none')
  for (const f of findings) console.log(`${f.kind.padEnd(15)} ${f.detail}`)
  console.log(`\nscreenshots → ${outDir}`)
  await writeFile(join(outDir, `findings-${surface}.json`), JSON.stringify(findings, null, 2))
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}
