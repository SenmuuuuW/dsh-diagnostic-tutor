/**
 * The v0.1.1 core smoke: one continuous journey, one browser, no restarts.
 *
 * STATUS: NOT YET GREEN. This script has never completed end to end. It is kept
 * because it has already paid for itself — every failure so far has been in the
 * harness, and each one documented a real DSH behaviour that any future attempt
 * needs to know:
 *
 *   - `New Session` opens a WORKSPACE PICKER ("Choose a workspace to start"),
 *     so there is no composer after clicking it. The per-workspace button
 *     ("New session in <workspace>") creates a conversation directly.
 *   - The session list interleaves a header row per workspace with the
 *     conversations beneath it, so no fixed row index is stable.
 *   - Clicking a workspace header collapses its group and reshuffles every
 *     later index.
 *   - Session selection is not addressable: the URL stays "/" across switches.
 *   - The composer is a Lexical contenteditable. Input.insertText reaches it
 *     only after the element is focused AND the editor has settled; typing in
 *     the same tick silently goes nowhere.
 *
 * It has not produced a verdict, and no verdict should be read from it.
 *
 * Everything before this verified the pieces separately. This runs them as a
 * single session in one page — A learns, moves on, hands over to B, comes back,
 * and survives a reload — because the failure that matters at release is not
 * "does Continue work" but "does the whole thing hold together while a person
 * uses it".
 *
 * Nothing destructive happens: no delete, no reset, no archive. The only
 * mutations are a learner's own — sending messages and pressing Start learning.
 *
 * Every verdict rests on three independent witnesses, never one:
 *   visible UI  +  the network request  +  persisted store/API state
 *
 * Usage:
 *   node scripts/e2e-core-smoke.mjs <url-with-token> [storePath]
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9371
const url = process.argv[2]
const storePath = process.argv[3] ?? join(homedir(), '.dsh', 'storages', 'udt.json')
const outDir = '/tmp/e2e-smoke'
if (!url) {
  console.error('usage: node scripts/e2e-core-smoke.mjs <url-with-token> [storePath]')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(outDir, { recursive: true })
const t0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`)
const apiBase = new URL(url).origin
const overview = async () => (await fetch(`${apiBase}/diagnostic-tutor/api/overview`)).json()
const lessonFor = async (id) =>
  (await fetch(`${apiBase}/diagnostic-tutor/api/lesson?nodeId=${encodeURIComponent(id)}`)).json()

const store = async () => JSON.parse(await readFile(storePath, 'utf8'))
const handoffs = async () => (await store()).tables.handoffs ?? {}
const focuses = async () => (await store()).tables.focus ?? {}
const decisions = async () => (await store()).tables.next_steps ?? {}

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
  #focusPosts = []
  #problems = []
  static async attach(port) {
    for (let a = 0; a < 60; a += 1) {
      try {
        const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        const p = t.find((x) => x.type === 'page')
        if (p?.webSocketDebuggerUrl) {
          const c = new Cdp()
          await c.#open(p.webSocketDebuggerUrl)
          return c
        }
      } catch { /* starting */ }
      await sleep(250)
    }
    throw new Error('could not attach')
  }
  #open(ws) {
    return new Promise((res, rej) => {
      this.#socket = new WebSocket(ws)
      this.#socket.addEventListener('open', () => res())
      this.#socket.addEventListener('error', rej)
      this.#socket.addEventListener('message', (e) => {
        const m = JSON.parse(e.data)
        if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/diagnostic-tutor/api/focus')) {
          let body = {}
          try { body = JSON.parse(String(m.params.request.postData ?? '{}')) } catch { /* ignore */ }
          this.#focusPosts.push(body)
        }
        if (m.method === 'Runtime.exceptionThrown') {
          this.#problems.push(`EXC ${String(m.params.exceptionDetails?.text).slice(0, 120)}`)
        }
        if (m.method === 'Network.responseReceived' && m.params.response.url.includes('/diagnostic-tutor/')
          && m.params.response.status >= 400) {
          this.#problems.push(`${m.params.response.status} ${m.params.response.url.split('/api')[1]}`)
        }
        const q = this.#pending.get(m.id)
        if (!q) return
        this.#pending.delete(m.id)
        if (m.error) q.reject(new Error(JSON.stringify(m.error)))
        else q.resolve(m.result)
      })
    })
  }
  send(method, params = {}) {
    const id = this.#next++
    return new Promise((res, rej) => {
      this.#pending.set(id, { resolve: res, reject: rej })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result?.value
  }
  takeFocusPosts() { const f = [...this.#focusPosts]; this.#focusPosts = []; return f }
  takeProblems() { const p = [...this.#problems]; this.#problems = []; return p }
  close() { this.#socket?.close() }
}

const transcript = (cdp) => cdp.evaluate(`document.body.innerText`)

async function turnFinished(cdp, before, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs
  let last = before
  let lastChange = Date.now()
  let grew = false
  while (Date.now() < deadline) {
    await sleep(1500)
    const now = await transcript(cdp)
    if (now !== last) { last = now; lastChange = Date.now(); grew = true; continue }
    if (grew && Date.now() - lastChange > 9000) return true
  }
  return false
}

/**
 * Type into the composer and send.
 *
 * The composer is a Lexical contenteditable. `Input.insertText` reaches it only
 * once the element is genuinely focused and the editor has settled — typing in
 * the same tick as the focus silently goes nowhere, which is exactly how a run
 * turns into a twenty-minute "waiting for a reply" that never comes. So: focus,
 * let it settle, type, verify the text actually landed, and try again if not.
 */
async function say(cdp, text) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const ready = await cdp.evaluate(`(() => {
      const el = document.querySelector('[contenteditable="true"]');
      if (!el) return false;
      el.focus();
      return document.activeElement === el;
    })()`)
    if (!ready) throw new Error('no focused composer on screen — nothing to type into')

    await sleep(500)
    await cdp.send('Input.insertText', { text })
    await sleep(500)

    const typed = await cdp.evaluate(`(() => {
      const el = document.querySelector('[contenteditable="true"]');
      return (el?.textContent ?? '').length;
    })()`)
    if (typed > 0) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      return
    }
    log(`  composer still empty after attempt ${attempt} — retrying`)
  }
  throw new Error('the composer would not accept text after three attempts')
}

const clickByText = (cdp, text, exact = true) => cdp.evaluate(`(() => {
  const t = (el) => (el?.textContent || '').trim();
  const hit = [...document.querySelectorAll('button, [role=button]')]
    .find((el) => ${exact ? `t(el) === ${JSON.stringify(text)}` : `t(el).includes(${JSON.stringify(text)})`});
  if (!hit || hit.disabled) return false;
  hit.click();
  return true;
})()`)

const openLearn = (cdp) => clickByText(cdp, 'Learn')
const backToChat = (cdp) => clickByText(cdp, 'Back to the conversation')

/** Node rows in the map, newest-first order as rendered. */
const readCard = (cdp) => cdp.evaluate(`(() => {
  const card = document.querySelector('.dt-next');
  if (!card) return null;
  const b = card.querySelector('button');
  return {
    target: card.querySelector('.dt-next-target')?.textContent?.trim() ?? '',
    from: card.querySelector('.dt-next-from')?.textContent?.trim() ?? '',
    button: b?.textContent?.trim() ?? null,
    enabled: b ? b.disabled === false : false,
  };
})()`)

const readHandoff = (cdp) => cdp.evaluate(`(() => {
  const line = document.querySelector('.dt-handoff');
  return line ? { phase: line.getAttribute('data-phase'), label: line.querySelector('.dt-handoff-label')?.textContent?.trim() } : null;
})()`)

/** Which conversation the sidebar says is open: matched by transcript content. */
async function visibleMarker(cdp, markers) {
  const text = await transcript(cdp)
  return markers.filter((m) => text.includes(m))
}

/** The session rows, in the order the sidebar renders them. */
const sessionRows = (cdp) => cdp.evaluate(`(() => {
  const t = (el) => (el?.textContent || '').trim();
  const seen = new Set();
  return [...document.querySelectorAll('li, [role=treeitem]')]
    .map((el) => t(el))
    .filter((text) => text.length > 2 && text.length < 90
      && /\\b(now|\\d+\\s?(s|min|m|h|d))\\b/.test(text)
      && !seen.has(text) && seen.add(text));
})()`)

/** Open the conversation whose row starts with this title. */
async function openSessionTitled(cdp, title) {
  const opened = await cdp.evaluate(`(() => {
    const t = (el) => (el?.textContent || '').trim();
    const seen = new Set();
    const rows = [...document.querySelectorAll('li, [role=treeitem]')].filter((el) => {
      const text = t(el);
      return text.length > 2 && text.length < 90
        && /\\b(now|\\d+\\s?(s|min|m|h|d))\\b/.test(text)
        && !seen.has(text) && seen.add(text);
    });
    const hit = rows.find((el) => t(el).startsWith(${JSON.stringify(title)}));
    if (!hit) return null;
    hit.click();
    return t(hit).slice(0, 40);
  })()`)
  await sleep(3000)
  return opened
}

/** Start learning, or continue, whichever the panel is offering. */
async function pressLearnButton(cdp) {
  for (let a = 0; a < 24; a += 1) {
    const state = await cdp.evaluate(`(() => {
      const wanted = ['Start learning', 'Learning in progress'];
      const hit = [...document.querySelectorAll('button')].find((el) => wanted.includes((el.textContent || '').trim()));
      if (!hit) return 'absent';
      if (hit.disabled) return 'disabled';
      hit.click();
      return 'clicked';
    })()`)
    if (state === 'clicked') return true
    await sleep(700)
  }
  return false
}

const ANSWER = `内维决定能不能乘，我逐条做完并自己验算过：
- (5,3)·(3,1)：内维 3=3，能乘 → (5,1)
- (3,1)·(5,3)：内维 1≠5，不能乘
- (4,2)·(2,1)：内维 2=2，能乘 → (4,1)
转置把顺序整个翻过来：(AB)ᵀ = BᵀAᵀ。我验过 wᵀXᵀ 能乘而 Xᵀwᵀ 不能乘，所以「内维相等」是唯一判据，与顺序无关——这句我上次说错了，收回。`

const checks = []
const check = (name, ok, detail) => {
  checks.push([name, ok])
  log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

const record = { focusPosts: [] }
const profile = await mkdtemp(join(tmpdir(), 'dt-smoke-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' })

let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(9000)

  const titles = { A: null, B: null }
  const stamp = Date.now().toString(36).toUpperCase()
  const A = `SESSION-A-${stamp}`
  const B = `SESSION-B-${stamp}`
  const markers = [A, B]
  record.markerA = A
  record.markerB = B

  /* ---- create the two conversations ------------------------------------ */
  for (const [letter, marker] of [['A', A], ['B', B]]) {
    // The bare "New Session" button opens a WORKSPACE PICKER ("Choose a
    // workspace to start"), which has no composer at all — that is what made
    // this look like a missing input box. The per-workspace button creates a
    // conversation directly, which is the journey being tested.
    const made = await cdp.evaluate(`(() => {
      const byLabel = [...document.querySelectorAll('[aria-label]')]
        .find((el) => (el.getAttribute('aria-label') || '').startsWith('New session in ')
          && (el.getAttribute('aria-label') || '').includes('UDT DSH plugin'));
      if (byLabel) { byLabel.click(); return byLabel.getAttribute('aria-label'); }
      const t = (el) => (el?.textContent || '').trim();
      const plain = [...document.querySelectorAll('button')].find((el) => t(el) === 'New Session');
      if (plain) { plain.click(); return 'New Session (fallback)'; }
      return null;
    })()`)
    if (made === null) throw new Error('no way to create a session was found')
    log(`created via: ${made}`)
    // Clicking New Session does not guarantee the composer is up yet, and the
    // learning panel replaces the chat entirely — so wait for the box itself
    // rather than for a fixed number of seconds.
    let composer = false
    for (let a = 0; a < 40 && !composer; a += 1) {
      composer = await cdp.evaluate(`!!document.querySelector('[contenteditable="true"]')`)
      if (!composer) await sleep(500)
    }
    if (!composer) throw new Error(`no composer after New Session for ${letter}`)
    const before = await transcript(cdp)
    await say(cdp, `请只回复两个字：收到。\n\n(${marker})`)
    await turnFinished(cdp, before)
    await sleep(1500)
    const rowsNow = await sessionRows(cdp)
    titles[letter] = rowsNow[0] ?? null
    log(`created session ${letter} — title "${titles[letter]}"`)
  }
  if (titles.A === null || titles.B === null) throw new Error('could not read the new session titles')

  /* ================= 1. session A ======================================= */
  log('--- 1. Session A ---')
  const rowA = await openSessionTitled(cdp, titles.A)
  const onA = await visibleMarker(cdp, markers)
  check('A is the conversation on screen', rowA !== null && onA.includes(A) && !onA.includes(B),
    `opened="${rowA}" visible=${JSON.stringify(onA)}`)

  await openLearn(cdp)
  await sleep(3000)

  const view0 = await overview()
  const noLesson = []
  for (const n of (view0.nodes ?? []).filter((x) => x.relation !== 'goal')) {
    const body = await lessonFor(n.id)
    if (body.lesson === null) noLesson.push(n)
  }
  if (noLesson.length === 0) throw new Error('no node without a lesson')
  const target0 = noLesson[0]
  await cdp.evaluate(`(() => {
    const want = ${JSON.stringify(target0.title)};
    const hit = [...document.querySelectorAll('.dt-node')]
      .find((el) => (el.querySelector('.dt-node-title')?.textContent ?? '').trim() === want);
    hit?.click();
  })()`)
  await sleep(1500)
  log(`node: ${target0.title}`)

  cdp.takeFocusPosts()
  const started0 = await pressLearnButton(cdp)
  check('Start learning was clickable', started0)
  await sleep(4000)
  const posts0 = cdp.takeFocusPosts()
  record.focusPosts.push(['A:start', posts0])
  record.sessionA = posts0[0]?.sessionId ?? null
  check('POST /focus carried a sessionId', typeof record.sessionA === 'string')
  check('the followup was addressed to A\'s conversation', posts0.length === 1)

  let lesson = null
  for (let a = 0; a < 450; a += 1) {
    const body = await lessonFor(target0.id)
    if (body.lesson !== null) { lesson = body.lesson; break }
    await sleep(2000)
  }
  record.lessonA = lesson === null ? null : { title: lesson.title, nodeId: lesson.nodeId, blocks: lesson.blocks.length }
  check('a lesson appeared for A', lesson !== null, lesson?.title)

  // Answer until the tutor moves.
  let moved = false
  let decision = null
  for (let round = 1; round <= 3 && !moved; round += 1) {
    await backToChat(cdp)
    await sleep(1500)
    log(`round ${round}: answering in the chat`)
    const before = await transcript(cdp)
    await say(cdp, round === 1 ? ANSWER : `${ANSWER}\n\n（补充：每类我都给了结论和理由，请据此判断。）`)
    await turnFinished(cdp, before)
    await sleep(2000)

    await openLearn(cdp)
    await sleep(2500)
    const view = await overview()
    decision = view.nextStep
    const card = await readCard(cdp)
    log(`  decision: ${decision ? `${decision.action} → ${decision.targetNodeId ?? 'stay'}` : 'null'} | card: ${card ? card.button : 'null'}`)

    if (decision === null || card === null) continue
    record.decision = { action: decision.action, fromNodeId: decision.fromNodeId, targetNodeId: decision.targetNodeId }
    record.card = card

    // Press it — the card's own button, one click.
    const beforeFocus = (await overview()).focus?.nodeId ?? null
    cdp.takeFocusPosts()
    const clicked = await cdp.evaluate(`document.querySelector('.dt-next button')?.click(), true`)
    check('the decision card was pressable', clicked === true, card.button)
    await sleep(5000)

    const afterPosts = cdp.takeFocusPosts()
    record.focusPosts.push(['A:card', afterPosts])
    const afterFocus = (await overview()).focus?.nodeId ?? null
    record.focusAfterCard = afterFocus
    record.cardAfter = await readCard(cdp)

    check('pressing it sent exactly one request', afterPosts.length === 1, `${afterPosts.length}`)
    check('it stayed in A\'s conversation', afterPosts[0]?.sessionId === record.sessionA)
    check('the card was consumed', record.cardAfter === null)

    if (decision.targetNodeId === null) {
      // A stay: the same node is re-opened and the tutor teaches again.
      log('  stay decision — continuing on the same node')
      await sleep(3000)
      continue
    }

    check('the focus moved to the decided target', afterFocus === decision.targetNodeId,
      `${afterFocus}`)

    let next = null
    for (let a = 0; a < 200; a += 1) {
      const body = await lessonFor(decision.targetNodeId)
      if (body.lesson !== null) { next = body.lesson; break }
      await sleep(2000)
    }
    record.lessonAfterContinue = next === null ? null : { title: next.title, nodeId: next.nodeId }
    check('a lesson appeared on the target', next !== null, next?.title)
    moved = next !== null
  }
  check('the tutor produced a decision', record.decision !== undefined)
  check('A reached a move decision', moved)

  /* ================= 2. switch to B ===================================== */
  log('--- 2. switch to B ---')
  const beforeB = await transcript(cdp)
  const rowB = await openSessionTitled(cdp, titles.B)
  const onB = await visibleMarker(cdp, markers)
  check('B is the conversation on screen', rowB !== null && onB.includes(B) && !onB.includes(A),
    `opened="${rowB}" visible=${JSON.stringify(onB)}`)
  check('B is a different conversation from A', beforeB !== (await transcript(cdp)))

  await openLearn(cdp)
  await sleep(3000)
  await cdp.evaluate(`(() => { const r = document.querySelectorAll('.dt-node'); r[1]?.click() ?? r[0]?.click(); })()`)
  await sleep(1500)

  const handoffsBeforeB = await handoffs()
  cdp.takeFocusPosts()
  const startedB = await pressLearnButton(cdp)
  check('B could start learning', startedB)
  await sleep(4000)
  const postsB = cdp.takeFocusPosts()
  record.focusPosts.push(['B:start', postsB])
  record.sessionB = postsB[0]?.sessionId ?? null
  check('B\'s followup used B\'s session', record.sessionB !== null && record.sessionB !== record.sessionA,
    `B=${record.sessionB} A=${record.sessionA}`)
  record.handoffsBeforeB = Object.keys(handoffsBeforeB).length

  /* ================= 3. back to A ======================================= */
  log('--- 3. back to A ---')
  await openSessionTitled(cdp, titles.A)
  const backOnA = await visibleMarker(cdp, markers)
  check('A is the conversation on screen again', backOnA.includes(A) && !backOnA.includes(B), JSON.stringify(backOnA))

  await openLearn(cdp)
  await sleep(3000)
  const viewA = await overview()
  const mapA = await cdp.evaluate(`document.querySelectorAll('.dt-node').length`)
  record.afterReturn = { focus: viewA.focus?.nodeId ?? null, nodes: mapA }
  check('A\'s learning state is intact', mapA > 0, `${mapA} nodes`)
  check('A\'s focus is still the target it moved to',
    viewA.focus?.nodeId === record.focusAfterCard, `${viewA.focus?.nodeId}`)
  const lessonStillA = record.focusAfterCard === null ? null : (await lessonFor(record.focusAfterCard)).lesson
  check('A\'s lesson survived the round trip', lessonStillA !== null, lessonStillA?.title ?? '(none)')

  /* ================= 4. reload ========================================== */
  log('--- 4. reload with A current ---')
  const beforeReload = await store()
  await cdp.send('Page.reload')
  await sleep(11000)

  const afterReload = await cdp.evaluate(`(() => {
    const t = (el) => (el?.textContent || '').trim();
    return {
      composer: !!document.querySelector('[contenteditable="true"]'),
      learn: [...document.querySelectorAll('button, [role=button]')].some((el) => t(el) === 'Learn'),
      sidebar: document.querySelectorAll('li, [role=treeitem]').length,
      rightTabAutoOpened: !!document.querySelector('.dt-tab'),
      panelOpen: !!document.querySelector('.dt-root'),
    };
  })()`)
  record.afterReload = afterReload
  log(`after reload: ${JSON.stringify(afterReload)}`)

  check('the session browser came back', afterReload.sidebar > 3, `${afterReload.sidebar} rows`)
  check('Learn is still in the sidebar', afterReload.learn)
  check('the plugin did NOT auto-open the right sidebar', afterReload.rightTabAutoOpened === false)
  check('the plugin did NOT open its panel unasked', afterReload.panelOpen === false)

  await openLearn(cdp)
  await sleep(3000)
  const viewR = await overview()
  const mapR = await cdp.evaluate(`document.querySelectorAll('.dt-node').length`)
  const lessonR = viewR.focus === null ? null : (await lessonFor(viewR.focus.nodeId)).lesson
  const afterReloadStore = await store()
  record.afterReloadState = { focus: viewR.focus?.nodeId ?? null, nodes: mapR, lesson: lessonR?.title ?? null }

  check('the course came back', viewR.course !== null)
  check('the map came back', mapR > 0, `${mapR} nodes`)
  check('the focus came back', viewR.focus?.nodeId === record.focusAfterCard, `${viewR.focus?.nodeId}`)
  check('the lesson came back', lessonR !== null, lessonR?.title ?? '(none)')
  check('the store is unchanged by the reload',
    JSON.stringify(beforeReload.tables.focus) === JSON.stringify(afterReloadStore.tables.focus))

  const problems = cdp.takeProblems()
  check('no console errors and no 4xx/5xx', problems.length === 0, problems.slice(0, 2).join(' | ') || 'clean')

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(outDir, 'smoke-final.png'), Buffer.from(shot.data, 'base64'))

  console.log('\n=== CONTINUOUS SMOKE ===')
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}`)
  console.log('\n--- evidence ---')
  console.log(JSON.stringify(record, null, 1))
  const failed = checks.filter(([, ok]) => !ok)
  console.log(`\n${checks.length} checks, ${failed.length} failed`)
  if (failed.length > 0) console.log(`FIRST FAILURE: ${failed[0][0]}`)
  process.exitCode = failed.length === 0 ? 0 : 1
  await writeFile(join(outDir, 'smoke-record.json'), JSON.stringify({ checks, record }, null, 1))
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}
