/**
 * Capture the showcase: the fixed demo scenario, end to end, on real DSH.
 *
 * The scenario is fixed so the screenshots are reproducible:
 *
 *   Goal: "I want to learn machine learning. I know some Python, but my math is weak."
 *
 * and it walks the whole loop — goal → map → lesson → check → answer →
 * evidence → next best step → continue → next lesson — taking one screenshot at
 * each beat, so the same run produces both the README stills and a 30-second
 * screen recording.
 *
 * Nothing here fakes product behaviour. It types into the real composer, clicks
 * the real buttons, and reads the runtime's own API. The store is not touched.
 *
 * Usage:
 *   node scripts/demo.mjs <dsh-url-with-token> [outdir]
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9235
const GOAL = 'I want to learn machine learning. I know some Python, but my math is weak.'
const ANSWER =
  '我试一下：X 是 (5,3)，w 是 (3,1)，内维 3=3 所以能乘，结果 (5,1)——每个样本一个预测值。' +
  '反过来 wX 就不行，因为 1≠5。如果换成 (100,5)·(5,1)，结果是 (100,1)，n=100 是样本数，d=5 是特征数。' +
  '所以我理解规则是内维必须相等，结果形状取外维。'
/** A real model turn took 20–90s in this project; do not be shy. */
const TURN_TIMEOUT_MS = 480_000

const url = process.argv[2]
const outDir = process.argv[3] ?? 'preview'
const apiBase = new URL(url).origin

if (!url) {
  console.error('usage: node scripts/demo.mjs <dsh-url-with-token> [outdir]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const t0 = Date.now()
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const log = (message) => console.log(`[${since().padStart(7)}] ${message}`)

const overview = async () => (await fetch(`${apiBase}/diagnostic-tutor/api/overview`)).json()

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
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result?.value
  }

  close() {
    this.#socket?.close()
  }
}

async function waitFor(cdp, expression, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return true
    await sleep(400)
  }
  throw new Error(`timed out waiting for ${label} (${timeoutMs}ms)`)
}

/** Type into the composer and send, like a learner would. */
async function say(cdp, text) {
  await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.focus()`)
  await cdp.send('Input.insertText', { text })
  await sleep(300)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}

async function shoot(cdp, name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const path = join(outDir, name)
  await writeFile(path, Buffer.from(shot.data, 'base64'))
  log(`shot → ${path}`)
}

/** Open the Learn panel from the sidebar. */
async function openPanel(cdp) {
  await cdp.evaluate(`(() => {
    const nodes = [...document.querySelectorAll('button, [role=button]')];
    const hit = nodes.find((el) => (el.getAttribute('aria-label') || '').trim() === 'Learn')
      || nodes.find((el) => (el.textContent || '').trim() === 'Learn');
    hit?.click();
  })()`)
}

const profile = await mkdtemp(join(tmpdir(), 'dt-demo-'))
await mkdir(outDir, { recursive: true })
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
    '--force-device-scale-factor=2',
    '--window-size=1680,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url })
  await waitFor(cdp, `!!document.querySelector('[contenteditable="true"]')`, 'the app shell')
  await sleep(3000)

  // ---- mode: first use only --------------------------------------------
  // Captured against a store with no goal at all, which is the one state the
  // demo run cannot reach on its own.
  if (process.argv.includes('--first-use')) {
    await openPanel(cdp)
    await sleep(2500)
    const welcome = await cdp.evaluate(`!!document.querySelector('.dt-welcome')`)
    log(`first-use state present: ${welcome}`)
    if (!welcome) throw new Error('no first-use state: the store already holds a goal')
    await shoot(cdp, 'demo-1-first-use.png')
    process.exit(0)
  }

  // ---- 1. a fresh conversation -----------------------------------------
  // Click New Session so the run starts from an empty transcript rather than
  // whatever was last open.
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button, [role=button]')]
      .find((el) => (el.textContent || '').trim() === 'New Session');
    hit?.click();
  })()`)
  await sleep(2500)
  await waitFor(cdp, `!!document.querySelector('[contenteditable="true"]')`, 'a fresh composer')

  // ---- mode: from an already-diagnosed map -----------------------------
  // The goal-and-clarify phase costs many model turns; when the capture only
  // needs the learning loop, start from the map the tutor already built.
  if (process.argv.includes('--from-map')) {
    log('starting from the existing diagnosis map')
    await openPanel(cdp)
    await sleep(2500)
    await shoot(cdp, 'demo-3-map.png')
    const state0 = await overview()
    log(`map: ${state0.nodes.length} nodes — ${state0.nodes.map((n) => n.title).join(' | ')}`)
  } else {

  // ---- 2. the goal, in the learner's own words -------------------------
  log(`saying the goal: "${GOAL}"`)
  await say(cdp, GOAL)

  // The tutor diagnoses before it maps: UDT's clarify protocol asks what the
  // goal is *for* before deciding where to start. Answer it like a learner —
  // the questions arrive as a card with numbered options and a Next button.
  const goalDeadline = Date.now() + TURN_TIMEOUT_MS
  let afterGoal = await overview()
  let rounds = 0
  while (Date.now() < goalDeadline) {
    afterGoal = await overview()
    // A goal root is stored as soon as the learner states a goal. A diagnosis
    // map is what the tutor builds afterwards, so wait for the map — not for
    // the first node.
    if (afterGoal.course !== null && afterGoal.nodes.length >= 3) break

    // The tutor diagnoses before it maps: UDT asks what the goal is *for*
    // before deciding where to start. The question arrives as a radio group
    // with a Next button that stays disabled until a choice is checked, so the
    // click is verified rather than assumed.
    const card = await cdp.evaluate(`(() => {
      const radios = [...document.querySelectorAll('[role=radio]')];
      if (radios.length === 0) return null;
      const next = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Next');
      return {
        choices: radios.map((el) => (el.textContent || '').trim().slice(0, 70)),
        nextDisabled: next ? next.disabled === true : null,
      };
    })()`)

    if (card === null) {
      await sleep(1500)
      continue
    }

    if (card.nextDisabled === false) {
      // Already answered on a previous pass; just advance.
      await cdp.evaluate(`(() => {
        const next = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Next');
        next?.click();
      })()`)
      rounds += 1
      log(`advanced clarification ${rounds}`)
      await sleep(3500)
      continue
    }

    // Pick the last option: "not sure yet, show me the whole landscape", which
    // is what produces a diagnosis map rather than a single track.
    const chosen = await cdp.evaluate(`(() => {
      const radios = [...document.querySelectorAll('[role=radio]')];
      const target = radios[radios.length - 1];
      if (!target) return null;
      const text = (target.textContent || '').trim();
      target.click();
      const inner = target.querySelector('input');
      if (inner) inner.click();
      return text.slice(0, 70);
    })()`)
    await sleep(900)

    // Only advance once the harness agrees an answer is present. If clicking
    // the radio did not take — it is a controlled component — fall back to the
    // card's own text input, which is a plain textarea.
    let ready = await cdp.evaluate(`(() => {
      const next = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Next');
      return next ? next.disabled !== true : false;
    })()`)

    if (!ready) {
      const typed = await cdp.evaluate(`(() => {
        const field = [...document.querySelectorAll('textarea, input[type=text]')]
          .find((el) => (el.getAttribute('placeholder') || '').includes('Type your answer'));
        if (!field) return false;
        field.focus();
        return true;
      })()`)
      if (typed) {
        await cdp.send('Input.insertText', { text: '4' })
        await sleep(700)
        ready = await cdp.evaluate(`(() => {
          const next = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Next');
          return next ? next.disabled !== true : false;
        })()`)
      }
    }

    if (ready) {
      await cdp.evaluate(`(() => {
        const next = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Next');
        next?.click();
      })()`)
      rounds += 1
      log(`answered clarification ${rounds}`)
    } else {
      log(`card did not accept an answer: ${JSON.stringify(card.choices.slice(-1))}`)
      break
    }
    await sleep(3500)
    if (rounds >= 8) break
  }
  if (afterGoal.course === null) {
    const page = await cdp.evaluate(`document.body.innerText.slice(0, 700)`)
    console.error('--- page at failure ---\n' + page)
  }
  if (afterGoal.course === null) throw new Error('the tutor never recorded a goal')
  log(`goal: "${afterGoal.course.goal}"`)
  log(`map: ${afterGoal.nodes.length} nodes — ${afterGoal.nodes.map((node) => node.title).join(' | ')}`)
  // Let the reply finish rendering before the still.
  await waitFor(cdp, `!document.querySelector('[class*=pending], [class*=streaming]')`, 'the goal turn to settle', TURN_TIMEOUT_MS)
  await sleep(2500)
  await shoot(cdp, 'demo-2-diagnosis.png')

  await openPanel(cdp)
  await sleep(2000)
  await shoot(cdp, 'demo-3-map.png')
  }

  // ---- 3. start learning ------------------------------------------------
  // The goal root is a container, not something to teach: take the deepest
  // row that is not it, which is a leaf of the diagnosis map.
  const picked = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.dt-node')]
      .filter((row) => !/^goal\b/.test((row.querySelector('.dt-node-rel')?.textContent || '').trim()));
    const pool = rows.length > 0 ? rows : [...document.querySelectorAll('.dt-node')];
    let best = pool[0], depth = -1;
    for (const row of pool) {
      const d = parseInt(row.style.marginLeft || '0', 10);
      if (d > depth) { depth = d; best = row; }
    }
    const title = best?.querySelector('.dt-node-title')?.textContent?.trim() ?? '';
    best?.click();
    return title;
  })()`)
  log(`selected: ${picked}`)
  await sleep(1200)
  await cdp.evaluate(`document.querySelector('.dt-detail button.dt-primary')?.click()`)
  log('pressed Start learning')

  const started = Date.now()
  const nodeA = (await overview()).focus?.nodeId ?? null
  const deadline = Date.now() + TURN_TIMEOUT_MS
  let lessonA = null
  while (Date.now() < deadline) {
    const view = await overview()
    if (view.handoff?.phase === 'lesson-ready' && view.handoff.targetNodeId === nodeA) {
      lessonA = view
      break
    }
    await sleep(1000)
  }
  if (lessonA === null) throw new Error('the first lesson never arrived')
  const aChain = lessonA.handoff ?? lessonA
  log(`A ready after ${((Date.now() - started) / 1000).toFixed(1)}s`)
  await sleep(1500)
  await shoot(cdp, 'demo-4-lesson.png')

  // ---- 4. answer the check, in the chat ---------------------------------
  await cdp.evaluate(`(() => {
    const door = [...document.querySelectorAll('button')].find((el) =>
      (el.textContent || '').includes('Answer in the chat'));
    door?.click();
  })()`)
  await sleep(1500)
  log('answering the check in the chat')
  await say(cdp, ANSWER)
  await waitFor(cdp, `!document.querySelector('[class*=pending], [class*=streaming]')`, 'the answer turn', TURN_TIMEOUT_MS)
  await sleep(2500)

  // ---- 5. the decision --------------------------------------------------
  const before = await overview()
  log(`next step: ${before.nextStep?.action ?? '(none)'} → ${before.nextStep?.targetNodeId ?? 'stay'}`)
  await shoot(cdp, 'demo-5-next-step.png')

  const nodeB = before.nextStep?.targetNodeId ?? null
  if (nodeB === null) {
    log('the tutor chose to stay; no B to follow in this run')
  } else {
    const clicked = await cdp.evaluate(`(() => {
      const card = document.querySelector('.dt-next') || document.querySelector('.dt-tab .dt-next');
      const button = card?.querySelector('button');
      if (!button) return false;
      button.click();
      return true;
    })()`)
    if (!clicked) throw new Error('no Continue button')
    log(`pressed Continue → ${nodeB}`)

    const bDeadline = Date.now() + TURN_TIMEOUT_MS
    let bChain = null
    while (Date.now() < bDeadline) {
      const view = await overview()
      if (view.handoff?.targetNodeId === nodeB && view.handoff.phase === 'lesson-ready') {
        bChain = view.handoff
        break
      }
      await sleep(1000)
    }
    if (bChain === null) throw new Error('B never became ready')
    const ms = (value) => (value === undefined ? '—' : `${(value / 1000).toFixed(1)}s`)
    log(`B ready — focus ${ms(bChain.stages.toFocusRecorded)} → woken ${ms(bChain.stages.toPrompted)}` +
        ` → activity ${ms(bChain.stages.toFirstActivity)} → lesson ${ms(bChain.stages.toLesson)}`)
    await sleep(2000)
    await shoot(cdp, 'demo-6-node-b.png')
    void aChain
  }

  console.log('\n=== final ===')
  console.log(JSON.stringify(await overview(), null, 1).slice(0, 800))
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}
