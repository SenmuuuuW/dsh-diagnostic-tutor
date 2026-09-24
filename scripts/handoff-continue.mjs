/**
 * Continue an existing focus: answer the check well enough to earn a move, then
 * follow the Next Best Step to the next node.
 *
 * This is the second half of the A → B acceptance, and it is deliberately
 * separate from `handoff-e2e.mjs`: that script starts a focus, this one
 * continues one. Splitting them means the first half can be run once and the
 * follow-through retried without pretending the whole thing was one run.
 *
 * It touches no store and calls no tool: everything below happens through the
 * chat composer and the Continue button.
 *
 * Usage:
 *   node scripts/handoff-continue.mjs <dsh-url-with-token> [answer] [output.png]
 */

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9233
const DEFAULT_ANSWER =
  '① X(5,3)·w(3,1)：内维 3=3，可以乘，结果 (5,1)，也就是每个样本得到 1 个数（一个预测值）。\n' +
  '② w(3,1)·X(5,3)：第一个的内维是 1，第二个的内维是 5，1≠5，所以不能乘。\n' +
  '③ X(100,5)·w(5,1)：内维 5=5，可以乘，结果 (100,1)。这里 n=100 是样本数，d=5 是特征数。\n' +
  '规则就是：内维必须相等，结果形状取外维。'

const url = process.argv[2]
const answer = process.argv[3] ?? DEFAULT_ANSWER
const out = process.argv[4] ?? 'preview/dsh-ui-v0107-ab.png'
const apiBase = new URL(url).origin

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

const profile = await mkdtemp(join(tmpdir(), 'dt-continue-'))
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

  const before = await overview()
  const nodeA = before.focus?.nodeId ?? null
  const previousDecision = before.nextStep?.createdAt ?? null
  log(`focus A = ${nodeA}`)
  log(`decision before = ${before.nextStep?.action ?? '(none)'} → ${before.nextStep?.targetNodeId ?? 'stay'}`)

  // 1. Answer in the chat. The tutor judges it and, per its v2.1 runtime
  //    contract, records the readiness decision in the same turn.
  await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.focus()`)
  await cdp.send('Input.insertText', { text: answer })
  await sleep(400)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  log('sent a complete answer to the check; waiting for the judgement')

  // 2. Wait for a NEW decision.
  const deadline = Date.now() + 600_000
  let decision = null
  while (Date.now() < deadline) {
    const view = await overview()
    const step = view.nextStep
    if (step && step.createdAt !== previousDecision) {
      decision = step
      break
    }
    await sleep(1500)
  }
  if (decision === null) throw new Error('the tutor recorded no new decision')

  console.log('\n=== NEXT BEST STEP (after the answer) ===')
  console.log(JSON.stringify(decision, null, 2))

  const nodeB = decision.targetNodeId
  if (nodeB === null) {
    log('the decision is to STAY — no move to follow, so A → B cannot be shown from here')
  } else {
    log(`the decision is a MOVE to ${nodeB}`)
  }

  // 3. Press Continue in whatever surface is showing it.
  const clicked = await cdp.evaluate(`(() => {
    const card = document.querySelector('.dt-next') || document.querySelector('.dt-tab .dt-next');
    const button = card?.querySelector('button');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!clicked) throw new Error('no Continue button found in the UI')
  const continued = Date.now()
  log(`pressed Continue → ${nodeB ?? nodeA}`)

  // 4. Watch the new handoff: focus recorded, tutor woken, lesson written.
  const target = nodeB ?? nodeA
  let lastPhase = null
  let chain = null
  const handoffDeadline = Date.now() + 600_000
  while (Date.now() < handoffDeadline) {
    const view = (await overview()).handoff
    if (view && view.targetNodeId === target) {
      if (view.phase !== lastPhase) {
        lastPhase = view.phase
        log(`handoff phase → ${view.phase} (${(view.elapsedMs / 1000).toFixed(1)}s)`)
      }
      if (view.phase === 'lesson-ready' || view.phase === 'failed') {
        chain = view
        break
      }
    }
    await sleep(1000)
  }
  if (chain === null) throw new Error('the second handoff never settled')

  const ms = (value) => (value === undefined ? '—' : `${(value / 1000).toFixed(1)}s`)
  console.log(`\n  B chain: phase=${chain.phase} attempts=${chain.attempts}`)
  console.log(
    `    focus persisted ${ms(chain.stages.toFocusRecorded)} → followup accepted ${ms(chain.stages.toPrompted)}` +
      ` → first activity ${ms(chain.stages.toFirstActivity)} → lesson written ${ms(chain.stages.toLesson)}` +
      ` → UI observed ${ms(chain.stages.toObserved)}`,
  )
  log(`B settled after ${((Date.now() - continued) / 1000).toFixed(1)}s of wall clock`)

  // 5. Prove the lesson is actually on screen, not merely in the store.
  await cdp.evaluate(`(() => {
    const label = 'Learn';
    const nodes = [...document.querySelectorAll('button, [role=button]')];
    const hit = nodes.find((el) => (el.getAttribute('aria-label') || '').trim() === label)
      || nodes.find((el) => (el.textContent || '').trim() === label);
    hit?.click();
  })()`)
  await sleep(2500)

  const onScreen = await cdp.evaluate(`(() => {
    const root = document.querySelector('.dt-root') || document.querySelector('.dt-tab');
    return {
      surface: root ? (root.className.includes('dt-tab') ? 'docked tab' : 'full panel') : null,
      node: root?.querySelector('.dt-tab-title, .dt-detail h2')?.textContent ?? null,
      lessonTitle: root?.querySelector('.dt-tab-lesson-title, .dt-pane:nth-child(3) h2')?.textContent ?? null,
      blocks: root ? root.querySelectorAll('[data-block-type]').length : 0,
      origin: root?.querySelector('.dt-origin')?.textContent ?? null,
    };
  })()`)
  console.log('\n=== what the UI is showing ===')
  console.log(JSON.stringify(onScreen, null, 2))

  const final = await overview()
  console.log('\n=== final runtime state ===')
  console.log(
    JSON.stringify(
      {
        focus: final.focus ? { node: final.focus.nodeTitle, status: final.focus.status } : null,
        lessons: final.lessonCount,
        nextStep: final.nextStep ? { action: final.nextStep.action, target: final.nextStep.targetNodeTitle } : null,
      },
      null,
      2,
    ),
  )

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(out, Buffer.from(shot.data, 'base64'))
  console.log(`\nscreenshot → ${out}`)
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}
