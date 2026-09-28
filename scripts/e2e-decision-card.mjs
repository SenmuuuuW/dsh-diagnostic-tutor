/**
 * One real run: does the learner actually get a card they can press?
 *
 * The question this answers is narrow, and it is the one the previous round got
 * wrong. That round polled `/overview` while a *different* script run had
 * already cleared the decision with a fresh Start learning, and reported the
 * card as missing. So this run is deliberately single-threaded, polls both the
 * API and the DOM, and never presses Start learning after the first time.
 *
 * Whatever the tutor decides — stay or move — the card must appear, and the
 * button on it must be really clickable. Both are recorded.
 *
 * Usage:
 *   node scripts/e2e-decision-card.mjs <url-with-token> [nodeTitleFragment]
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9331
const url = process.argv[2]
const preferNode = process.argv[3] ?? 'Python'
const outDir = '/tmp/e2e-decision'
if (!url) {
  console.error('usage: node scripts/e2e-decision-card.mjs <url-with-token> [nodeTitleFragment]')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(outDir, { recursive: true })
const t0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`)
const apiBase = new URL(url).origin
const overview = async () => (await fetch(`${apiBase}/diagnostic-tutor/api/overview`)).json()

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
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
  close() { this.#socket?.close() }
}

const transcript = (cdp) =>
  cdp.evaluate(`document.body.innerText.length + ':' + document.body.innerText.slice(-300)`)

/** Wait for a turn: the transcript must change, then stop changing. */
async function turnFinished(cdp, before, timeoutMs = 600_000) {
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

async function say(cdp, text) {
  await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.focus()`)
  await cdp.send('Input.insertText', { text })
  await sleep(400)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}

const openLearn = (cdp) => cdp.evaluate(`(() => {
  const hit = [...document.querySelectorAll('button, [role=button]')].find((el) => (el.textContent || '').trim() === 'Learn');
  if (!hit) return false;
  hit.click();
  return true;
})()`)

/** The card as the learner sees it. */
const readCard = (cdp) => cdp.evaluate(`(() => {
  const card = document.querySelector('.dt-next');
  if (!card) return null;
  const button = card.querySelector('button');
  return {
    target: card.querySelector('.dt-next-target')?.textContent?.trim() ?? '',
    why: (card.querySelector('.dt-next-why')?.textContent ?? '').trim().slice(0, 90),
    button: button?.textContent?.trim() ?? null,
    enabled: button ? button.disabled === false : false,
  };
})()`)

const ANSWER = `我按规则逐条做完，并且自己验算过。

内维决定能不能乘：
- (5,3)·(3,1)：内维 3=3，能乘 → (5,1)
- (3,1)·(5,3)：内维 1≠5，不能乘
- (4,2)·(2,1)：内维 2=2，能乘 → (4,1)

转置把顺序整个翻过来：(AB)ᵀ = BᵀAᵀ。我验过 wᵀXᵀ 能乘而 Xᵀwᵀ 不能乘，所以「内维相等」是唯一判据，与顺序无关——这句我上次说错了，收回。

我已经能自己举例、自己验证、自己抓错了。如果这还不算稳，请直接告诉我缺哪一块，我马上补。`

const profile = await mkdtemp(join(tmpdir(), 'dt-decision-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' })

const record = { rounds: [] }
let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(9000)

  // A conversation with an agent, so the followup has somewhere to land.
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'New Session');
    hit?.click();
  })()`)
  await sleep(2500)
  const warm = await transcript(cdp)
  await say(cdp, '我们继续。我会认真答题，请照常判断我是否可以往下走。')
  await turnFinished(cdp, warm)
  log('conversation ready')

  // Learn → node → Start learning (the ONLY time we press it).
  await openLearn(cdp)
  await sleep(3000)
  const picked = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.dt-node')];
    const hit = rows.find((el) => (el.textContent || '').includes(${JSON.stringify(preferNode)})) ?? rows[1] ?? rows[0];
    const title = hit?.querySelector('.dt-node-title')?.textContent?.trim() ?? '';
    hit?.click();
    return title;
  })()`)
  log(`node: ${picked}`)
  await sleep(1500)

  let armed = 'absent'
  for (let a = 0; a < 20 && armed !== 'ready'; a += 1) {
    armed = await cdp.evaluate(`(() => {
      const wanted = ['Start learning', 'Learning in progress'];
      const hit = [...document.querySelectorAll('button')].find((el) => wanted.includes((el.textContent || '').trim()));
      return hit ? (hit.disabled ? 'disabled' : 'ready') : 'absent';
    })()`)
    if (armed !== 'ready') await sleep(700)
  }
  if (armed !== 'ready') throw new Error(`Start learning is ${armed}`)

  await cdp.evaluate(`(() => {
    const wanted = ['Start learning', 'Learning in progress'];
    [...document.querySelectorAll('button')].find((el) => wanted.includes((el.textContent || '').trim()))?.click();
  })()`)
  log('pressed Start learning (once, and never again)')
  await sleep(4000)

  const nodeA = (await overview()).focus?.nodeId ?? null
  record.fromNodeId = nodeA
  log(`focus = ${nodeA}`)

  // The lesson has to exist before answering it.
  for (let a = 0; a < 150; a += 1) {
    const l = (await fetch(`${apiBase}/diagnostic-tutor/api/lesson?nodeId=${encodeURIComponent(nodeA)}`)).json
    void l
    const body = await (await fetch(`${apiBase}/diagnostic-tutor/api/lesson?nodeId=${encodeURIComponent(nodeA)}`)).json()
    if (body.lesson !== null) { record.lessonTitle = body.lesson.title; break }
    await sleep(2000)
  }
  log(`lesson: ${record.lessonTitle ?? '(none)'}`)

  // Answer, up to three real rounds, looking for the card after each one.
  for (let round = 1; round <= 3; round += 1) {
    // Answer from the chat…
    await cdp.evaluate(`(() => {
      const hit = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('Answer in the chat'));
      hit?.click();
    })()`)
    await sleep(1500)

    log(`round ${round}: answering`)
    const before = await transcript(cdp)
    await say(cdp, round === 1 ? ANSWER : `${ANSWER}\n\n（我再补一句：上面每一类我都给了结论和理由，请据此判断。）`)
    const ok = await turnFinished(cdp, before)
    log(`  turn finished: ${ok}`)
    await sleep(1500)

    // …then look at the panel, which is where the card lives.
    await openLearn(cdp)
    await sleep(2500)

    const card = await readCard(cdp)
    const view = await overview()
    const step = view.nextStep
    log(`  API nextStep: ${step ? `${step.action} → ${step.targetNodeId ?? 'stay'}` : 'null'}`)
    log(`  DOM card:     ${card ? `${card.button} (enabled=${card.enabled})` : 'null'}`)
    record.rounds.push({ round, apiAction: step?.action ?? null, apiTarget: step?.targetNodeId ?? null, card })

    if (card === null) continue

    // The card is up. Press it — for real, once.
    record.action = step?.action ?? null
    record.targetNodeId = step?.targetNodeId ?? null
    record.focusNextStepId = (await overview()).focus?.nextStepId ?? null
    record.button = card.button

    const focusBefore = (await overview()).focus?.nodeId ?? null
    await cdp.evaluate(`document.querySelector('.dt-next button')?.click()`)
    log(`  clicked "${card.button}"`)
    await sleep(6000)

    const after = await overview()
    record.focusBefore = focusBefore
    record.focusAfter = after.focus?.nodeId ?? null
    record.cardAfterClick = await readCard(cdp)
    log(`  focus ${focusBefore} → ${record.focusAfter}`)
    log(`  card after click: ${record.cardAfterClick ? record.cardAfterClick.button : 'gone'}`)

    // For a move, the next lesson is the proof it worked.
    if (record.targetNodeId) {
      for (let a = 0; a < 150; a += 1) {
        const body = await (await fetch(`${apiBase}/diagnostic-tutor/api/lesson?nodeId=${encodeURIComponent(record.targetNodeId)}`)).json()
        if (body.lesson !== null) { record.nextLessonTitle = body.lesson.title; break }
        await sleep(2000)
      }
      log(`  next lesson: ${record.nextLessonTitle ?? '(none)'}`)
    }
    break
  }

  console.log('\n=== DECISION CARD ===')
  const checks = [
    ['the tutor recorded a decision', record.rounds.some((r) => r.apiAction !== null)],
    ['the card appeared in the UI', record.rounds.some((r) => r.card !== null)],
    ['the card carried a clickable button', record.button !== undefined && record.button !== null],
    ['pressing it moved the focus or cleared the card', record.cardAfterClick === null || record.focusAfter !== record.focusBefore],
    ['a move produced a lesson on the target', record.targetNodeId === null || record.nextLessonTitle !== undefined],
  ]
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}`)
  console.log('\n--- record ---')
  console.log(JSON.stringify(record, null, 1))
  const failed = checks.filter(([, ok]) => !ok)
  console.log(`\n${checks.length} checks, ${failed.length} failed`)
  process.exitCode = failed.length === 0 ? 0 : 1
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}
