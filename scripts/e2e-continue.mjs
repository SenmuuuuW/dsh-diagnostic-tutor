/**
 * The Continue gate: a real decision, acted on, in the real profile.
 *
 * Drives the actual loop — lesson, check, answer, evidence, udt_decide_next,
 * NEXT BEST STEP, Continue — and records what the runtime did at each step. It
 * never writes the store, never fabricates a decision and never mocks a
 * response: if the tutor decides the learner should stay, that is reported and
 * another real round is played.
 *
 * The ledger it prints is the evidence:
 *   fromNodeId, targetNodeId, readiness, sessionId, the requests, the handoff
 *   timestamps, and which node the next lesson landed on.
 *
 * Usage:
 *   node scripts/e2e-continue.mjs <url-with-token> [nodeTitleFragment]
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9321
const url = process.argv[2]
const preferNode = process.argv[3] ?? 'Python'
const storePath = join(homedir(), '.dsh', 'storages', 'udt.json')
const outDir = '/tmp/e2e-continue'
if (!url) {
  console.error('usage: node scripts/e2e-continue.mjs <url-with-token> [nodeTitleFragment]')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(outDir, { recursive: true })
const t0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`)
const apiBase = new URL(url).origin
const overview = async () => (await fetch(`${apiBase}/diagnostic-tutor/api/overview`)).json()
const lessonFor = async (nodeId) =>
  (await fetch(`${apiBase}/diagnostic-tutor/api/lesson?nodeId=${encodeURIComponent(nodeId)}`)).json()

/** A complete, confident answer — the kind that earns a move rather than a stay. */
const STRONG_ANSWER = `我按你的规则完整做一遍。

判断能不能乘，只看内维：
- (5,3)·(3,1)：内维 3=3，能乘，结果取外维 (5,1)。5 个样本各得一个预测值。
- (3,1)·(5,3)：内维 1≠5，不能乘——顺序换了就乘不了，矩阵乘法不交换。
- (2,3)·(2,4)：内维 3≠2，不能乘。
- (4,2)·(2,1)：内维 2=2，能乘，结果 (4,1)。

转置会把顺序整个翻过来：(AB)ᵀ = BᵀAᵀ。我验过：wᵀXᵀ = (1,3)·(3,5) 能乘得 (1,5)，而 Xᵀwᵀ = (3,5)·(1,3) 内维 5≠3 不能乘。所以「内维相等」是唯一判据，和顺序无关这句话是我上次说错的，收回。

我已经能自己举例、自己验证、自己抓错了。`

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
  #focusBodies = []
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
        if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/focus')) {
          this.#focusBodies.push(String(m.params.request.postData ?? ''))
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
  takeFocusBodies() { const f = [...this.#focusBodies]; this.#focusBodies = []; return f }
  takeProblems() { const p = [...this.#problems]; this.#problems = []; return p }
  close() { this.#socket?.close() }
}

async function say(cdp, text) {
  await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.focus()`)
  await cdp.send('Input.insertText', { text })
  await sleep(400)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}

/**
 * Wait for a turn to run and finish, by watching the transcript.
 *
 * The obvious check — `[class*=pending], [class*=streaming]` — never matches
 * anything in this build, so a loop on it returns instantly and reports three
 * completed rounds in twelve seconds. Content is the honest signal: wait for
 * the text to change, then for it to stop changing.
 */
async function turnFinished(cdp, textBefore, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs
  let last = textBefore
  let lastChange = Date.now()
  let grew = false
  while (Date.now() < deadline) {
    await sleep(1500)
    const now = await cdp.evaluate(`document.body.innerText.length + ':' + document.body.innerText.slice(-400)`)
    if (now !== last) {
      last = now
      lastChange = Date.now()
      grew = true
      continue
    }
    // Settled: something changed, and nothing has changed for a while.
    if (grew && Date.now() - lastChange > 9000) return true
  }
  return false
}

const transcript = (cdp) => cdp.evaluate(`document.body.innerText.length + ':' + document.body.innerText.slice(-400)`)

const profile = await mkdtemp(join(tmpdir(), 'dt-continue-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' })

const ledger = {}
let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(9000)

  // A conversation that exists and has an agent: say something first, so the
  // followup has somewhere to land.
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'New Session');
    hit?.click();
  })()`)
  await sleep(2500)
  log('warm-up message (creates the agent for this conversation)')
  const beforeWarm = await transcript(cdp)
  await say(cdp, '我们继续。我会认真答题。')
  const warmOk = await turnFinished(cdp, beforeWarm)
  log(`warm-up turn finished: ${warmOk}`)
  await sleep(1500)

  // Learn → pick a node the tutor has already seen a lot of evidence on.
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button, [role=button]')].find((el) => (el.textContent || '').trim() === 'Learn');
    hit?.click();
  })()`)
  await sleep(3000)

  const picked = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.dt-node')];
    const hit = rows.find((el) => (el.textContent || '').includes(${JSON.stringify(preferNode)})) ?? rows[1] ?? rows[0];
    const title = hit?.querySelector('.dt-node-title')?.textContent?.trim() ?? '';
    hit?.click();
    return title;
  })()`)
  log(`selected: ${picked}`)
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

  cdp.takeFocusBodies()
  await cdp.evaluate(`(() => {
    const wanted = ['Start learning', 'Learning in progress'];
    [...document.querySelectorAll('button')].find((el) => wanted.includes((el.textContent || '').trim()))?.click();
  })()`)
  await sleep(4000)

  const state = await overview()
  const nodeA = state.focus?.nodeId ?? null
  ledger.fromNodeId = nodeA
  ledger.sessionId = JSON.parse(cdp.takeFocusBodies()[0] ?? '{}').sessionId ?? null
  log(`focus A = ${nodeA}`)
  log(`session  = ${ledger.sessionId}`)

  // Wait for the lesson.
  let lesson = null
  const lessonDeadline = Date.now() + 600_000
  while (Date.now() < lessonDeadline) {
    lesson = (await lessonFor(nodeA)).lesson
    if (lesson !== null) break
    await sleep(2000)
  }
  if (lesson === null) throw new Error('no lesson arrived')
  const check = lesson.blocks.find((b) => b.type === 'check')
  log(`lesson "${lesson.title}" with ${lesson.blocks.length} blocks; check: ${check ? 'yes' : 'no'}`)
  ledger.lessonNode = lesson.nodeId
  ledger.checkPrompt = check?.content?.prompt?.slice(0, 120) ?? null

  // ---- answer, and keep answering until a move is decided ---------------
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('Answer in the chat'));
    hit?.click();
  })()`)
  await sleep(1500)

  let decision = null
  for (let round = 1; round <= 3 && decision === null; round += 1) {
    log(`round ${round}: sending a complete answer`)
    const before = await transcript(cdp)
    await say(cdp, round === 1 ? STRONG_ANSWER : `${STRONG_ANSWER}\n\n（第 ${round} 轮补充：上一题我已经按规则逐条做完，请据此判断我是否可以进入下一步。）`)
    const ok = await turnFinished(cdp, before)
    log(`  round ${round} turn finished: ${ok}`)
    await sleep(2000)

    const view = await overview()
    const step = view.nextStep
    log(`  decision after round ${round}: ${step ? `${step.action} → ${step.targetNodeId ?? 'stay'}` : '(none recorded)'}`)
    if (step && step.targetNodeId !== null) decision = step
  }

  if (decision === null) {
    const stay = (await overview()).nextStep
    ledger.decision = stay ?? null
    log(`NO MOVE: the tutor stayed (${stay?.action ?? 'no decision'}). Reporting honestly rather than forcing one.`)
    console.log('\n=== CONTINUE GATE ===')
    console.log(`FAIL  no decision with a target after 3 real rounds`)
    console.log(`      last: ${JSON.stringify(ledger.decision)}`)
    process.exitCode = 1
  } else {
    ledger.decision = decision
    log(`MOVE: ${decision.action} → ${decision.targetNodeId}`)

    // The card must be on screen before it can be clicked.
    const cardShown = await cdp.evaluate(`(() => {
      const card = document.querySelector('.dt-next');
      if (!card) return null;
      return {
        target: card.querySelector('.dt-next-target')?.textContent?.trim() ?? '',
        why: card.querySelector('.dt-next-why')?.textContent?.trim()?.slice(0, 80) ?? '',
        button: card.querySelector('button')?.textContent?.trim() ?? '',
      };
    })()`)
    log(`NEXT BEST STEP on screen: ${JSON.stringify(cardShown)}`)

    const focusBefore = (await overview()).focus?.nodeId ?? null
    cdp.takeFocusBodies()

    // Double-click, to prove the second press is not a second handoff.
    await cdp.evaluate(`(() => {
      const b = document.querySelector('.dt-next button');
      b?.click();
      b?.click();
    })()`)
    log('clicked Continue twice')
    await sleep(5000)

    const bodies = cdp.takeFocusBodies()
    const focusAfter = (await overview()).focus?.nodeId ?? null
    ledger.focusBefore = focusBefore
    ledger.focusAfter = focusAfter
    ledger.continueRequests = bodies
    log(`focus ${focusBefore} → ${focusAfter}`)

    // The next lesson must land on the node the decision named.
    let nextLesson = null
    const deadline = Date.now() + 600_000
    while (Date.now() < deadline) {
      nextLesson = (await lessonFor(decision.targetNodeId)).lesson
      if (nextLesson !== null) break
      await sleep(2000)
    }
    ledger.nextLessonNode = nextLesson?.nodeId ?? null
    ledger.nextLessonTitle = nextLesson?.title ?? null
    log(`next lesson: ${nextLesson?.title ?? '(none)'} on ${nextLesson?.nodeId ?? '-'}`)

    const after = await overview()
    const handoffs = Object.keys(after.handoff ? { h: 1 } : {})
    const attempts = after.handoff?.attempts ?? null
    ledger.handoffAttempts = attempts
    ledger.nextStepAfter = after.nextStep

    const problems = cdp.takeProblems()
    ledger.problems = problems

    const checks = [
      ['NEXT BEST STEP card was shown', cardShown !== null && cardShown.button.length > 0],
      ['the card names the decided target', cardShown?.target?.includes(decision.targetNodeTitle ?? '\u0000') ?? false],
      ['focus moved to the target', focusAfter === decision.targetNodeId],
      ['exactly one handoff for the double click', bodies.length === 1],
      ['the followup named this conversation', (JSON.parse(bodies[0] ?? '{}').sessionId ?? null) === ledger.sessionId],
      ['the next lesson exists', nextLesson !== null],
      ['the next lesson is on the target node', nextLesson?.nodeId === decision.targetNodeId],
      ['the consumed Next Step is gone', after.nextStep === null],
      ['no console errors or 4xx/5xx', problems.length === 0],
    ]
    console.log('\n=== CONTINUE GATE ===')
    for (const [name, ok] of checks) console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}`)
    console.log('\n--- ledger ---')
    console.log(JSON.stringify(ledger, null, 1))
    const failed = checks.filter(([, ok]) => !ok)
    console.log(`\n${checks.length} checks, ${failed.length} failed`)
    process.exitCode = failed.length === 0 ? 0 : 1

    const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(outDir, 'continue.png'), Buffer.from(image.data, 'base64'))
  }
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}
