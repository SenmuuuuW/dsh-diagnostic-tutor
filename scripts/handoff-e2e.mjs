/**
 * The handoff acceptance run: A → Next Best Step → Continue → B.
 *
 * This script never touches the store. It drives the real UI, reads the
 * runtime's own timestamps back through the API, and prints where the time
 * actually went — which is the whole point of the handoff record existing.
 *
 * It reports the chain the runtime measured:
 *
 *   Continue click → focus persisted → followup accepted
 *   → first tutor activity → udt_lesson_update → UI observed
 *
 * Usage:
 *   node scripts/handoff-e2e.mjs <dsh-url-with-token> [output.png]
 */

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PANEL_LABEL = 'Learn'
const PORT = 9231
/** A real model turn on a real node has taken minutes here; do not be shy. */
const TURN_TIMEOUT_MS = 600_000

const url = process.argv[2]
const out = process.argv[3] ?? 'preview/dsh-ui-handoff.png'
/** Resume an existing focus instead of starting one: proves the state outlives a reload. */
const resume = process.argv.includes('--resume')
const apiBase = new URL(url).origin
if (!url) {
  console.error('usage: node scripts/handoff-e2e.mjs <dsh-url-with-token> [output.png]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const t0 = Date.now()
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const log = (message) => console.log(`[${since().padStart(7)}] ${message}`)

/** Read the runtime's own view of the current handoff. */
async function overview() {
  const response = await fetch(`${apiBase}/diagnostic-tutor/api/overview`)
  return response.json()
}

/** Print the timing chain the runtime recorded. */
function reportChain(label, handoff) {
  if (!handoff) {
    console.log(`  ${label}: no handoff`)
    return
  }
  const ms = (value) => (value === undefined ? '—' : `${(value / 1000).toFixed(1)}s`)
  console.log(`  ${label}: phase=${handoff.phase} attempts=${handoff.attempts} elapsed=${ms(handoff.elapsedMs)}`)
  const stages = handoff.stages ?? {}
  console.log(
    `    focus persisted ${ms(stages.toFocusRecorded)} → followup accepted ${ms(stages.toPrompted)}` +
      ` → first activity ${ms(stages.toFirstActivity)} → lesson written ${ms(stages.toLesson)}` +
      ` → UI observed ${ms(stages.toObserved)}`,
  )
}

class Cdp {
  #socket
  #next = 1
  #pending = new Map()

  static async attach(port) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`)
        const targets = await response.json()
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

/** Watch the handoff until it reaches a terminal phase, printing transitions. */
async function watchHandoff(nodeId, until, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    const view = (await overview()).handoff
    if (view && view.targetNodeId === nodeId && view.phase !== last) {
      last = view.phase
      log(`handoff phase → ${view.phase} (${(view.elapsedMs / 1000).toFixed(1)}s)`)
    }
    if (view && view.targetNodeId === nodeId && until.includes(view.phase)) return view
    await sleep(1000)
  }
  throw new Error(`handoff for ${nodeId} never reached ${until.join('/')} within ${timeoutMs}ms`)
}

const profile = await mkdtemp(join(tmpdir(), 'dt-handoff-'))
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
  await waitFor(cdp, '!!document.querySelector("button, [role=button]")', 'the app shell')
  await sleep(2500)

  // 0. The learner speaks, so the conversation has an agent to wake.
  await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.focus()`)
  await cdp.send('Input.insertText', { text: '继续按地图学。' })
  await sleep(300)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  log('warm-up message sent; waiting for that turn to settle')
  await waitFor(cdp, `!document.querySelector('[class*=pending], [class*=streaming]')`, 'the warm-up turn', TURN_TIMEOUT_MS)
  await sleep(2500)

  /** The node being learned; set by whichever branch ran. */
  let nodeA = null
  /** Wall-clock start of the A handoff, when this run started one. */
  let started = Date.now()

  if (resume) {
    log('resume mode: using the focus the runtime already holds')
    await cdp.evaluate(`(() => {
      const label = ${JSON.stringify(PANEL_LABEL)};
      const nodes = [...document.querySelectorAll('button, [role=button]')];
      const hit = nodes.find((el) => (el.getAttribute('aria-label') || '').trim() === label)
        || nodes.find((el) => (el.textContent || '').trim() === label);
      hit?.click();
    })()`)
    await waitFor(cdp, '!!document.querySelector(".dt-root")', 'the panel')
    const state0 = await overview()
    nodeA = state0.focus?.nodeId ?? null
    log(`resumed focus = ${nodeA ?? '(none)'} handoff=${state0.handoff?.phase ?? '(none)'}`)
    reportChain('resumed chain', state0.handoff)
    if (nodeA === null) throw new Error('resume mode found no focus to continue')
    await cdp.evaluate(`(() => {
      const door = [...document.querySelectorAll('button')].find((el) =>
        (el.textContent || '').includes('Answer in the chat'));
      door?.click();
    })()`)
    await sleep(1200)
    await waitFor(cdp, `!!document.querySelector('[contenteditable="true"]')`, 'the composer')
    await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.focus()`)
    await cdp.send('Input.insertText', {
      text:
        process.env.DT_ANSWER ||
        '我试一下：(2,3)·(3,4) 内维都是 3，所以能做，结果形状是 (2,4)。(2,3)·(2,4) 我觉得不能做，' +
          '因为中间对不上。后面两组我还不确定，想听你怎么判断。',
    })
    await sleep(300)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    log('answered the check; waiting for the tutor to judge and decide')
    await waitFor(cdp, `!document.querySelector('[class*=pending], [class*=streaming]')`, 'the answer turn', TURN_TIMEOUT_MS)
  }

  // 1. Open the panel and pick a LEAF node — the smallest real unit, so the
  //    acceptance run is about the handoff and not about a model marathon.
  if (!resume) {
  await cdp.evaluate(`(() => {
    const label = ${JSON.stringify(PANEL_LABEL)};
    const nodes = [...document.querySelectorAll('button, [role=button]')];
    const hit = nodes.find((el) => (el.getAttribute('aria-label') || '').trim() === label)
      || nodes.find((el) => (el.textContent || '').trim() === label);
    hit?.click();
  })()`)
  await waitFor(cdp, '!!document.querySelector(".dt-root")', 'the panel')
  await sleep(1000)

  const wanted = process.env.DT_NODE
  const picked = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.dt-node')];
    const want = ${JSON.stringify(wanted ?? null)};
    let best = rows[0], bestDepth = -1;
    if (want) {
      // Honour an explicit request: some nodes are better first subjects than
      // others, and picking by name is how the run stays reproducible.
      const hit = rows.find((row) => (row.textContent || '').includes(want));
      if (hit) best = hit;
    } else {
      for (const row of rows) {
        const depth = parseInt(row.style.marginLeft || '0', 10);
        if (depth > bestDepth) { bestDepth = depth; best = row; }
      }
    }
    const title = best?.querySelector('.dt-node-title')?.textContent?.trim() ?? '';
    best?.click();
    return title;
  })()`)
  log(`selected a leaf node: ${picked}`)
  await waitFor(cdp, '!!document.querySelector(".dt-detail h2")', 'the node detail')

  // 2. Start learning, and watch the runtime's own progress record.
  await cdp.evaluate(`document.querySelector('.dt-detail button.dt-primary')?.click()`)
  started = Date.now()
  log('pressed Start learning')

  // The POST is in flight; wait for the runtime to report the focus rather
  // than racing it.
  for (let attempt = 0; attempt < 40 && nodeA === null; attempt += 1) {
    const state = await overview()
    nodeA = state.focus?.nodeId ?? null
    if (nodeA === null) await sleep(250)
  }
  if (nodeA === null) throw new Error('no focus was recorded')
  log(`focus on A = ${nodeA}`)
  }

  if (resume) {
    log('A was already ready on resume; skipping the wait')
  } else {
    const first = await watchHandoff(nodeA, ['lesson-ready'], TURN_TIMEOUT_MS)
    log(`A is ready after ${((Date.now() - started) / 1000).toFixed(1)}s of wall clock`)
    reportChain('A chain', first)
  }

  // 2b. The lesson ends in a check, and the tutor's protocol is to stop there
  //     and wait. So the learner answers — in the chat, with the lesson still
  //     docked — and only then does a decision follow.
  await cdp.evaluate(`(() => {
    const door = [...document.querySelectorAll('button')].find((el) =>
      (el.textContent || '').includes('Answer in the chat'));
    door?.click();
  })()`)
  await sleep(1200)
  await waitFor(cdp, `!!document.querySelector('[contenteditable="true"]')`, 'the composer')
  await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.focus()`)
  await cdp.send('Input.insertText', {
    text:
      process.env.DT_ANSWER ||
      '我试一下：(2,3)·(3,4) 内维都是 3，所以能做，结果形状是 (2,4)。(2,3)·(2,4) 我觉得不能做，' +
        '因为中间对不上。后面两组我还不确定，想听你怎么判断。',
  })
  await sleep(300)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  log('answered the check in the chat; waiting for the tutor to judge and decide')
  await waitFor(cdp, `!document.querySelector('[class*=pending], [class*=streaming]')`, 'the answer turn', TURN_TIMEOUT_MS)

  // 3. Wait for the tutor to decide what is next, then act on it.
  log('waiting for the tutor to record its decision')
  let nextStep = null
  const decisionDeadline = Date.now() + TURN_TIMEOUT_MS
  while (Date.now() < decisionDeadline) {
    const view = await overview()
    if (view.nextStep) {
      nextStep = view.nextStep
      break
    }
    await sleep(1500)
  }
  if (nextStep === null) throw new Error('the tutor never recorded a decision')

  console.log('\n=== NEXT BEST STEP ===')
  console.log(JSON.stringify(nextStep, null, 2))

  const nodeB = nextStep.targetNodeId ?? nextStep.fromNodeId
  if (nextStep.targetNodeId === null) {
    log('the decision was to stay; the acceptance run needs a move to prove B')
  }

  // 4. Press Continue in the surface, and watch the second handoff.
  const clicked = await cdp.evaluate(`(() => {
    const card = document.querySelector('.dt-next') || document.querySelector('.dt-tab .dt-next');
    const button = card?.querySelector('button');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!clicked) throw new Error('no Continue button to press')
  const continued = Date.now()
  log(`pressed Continue → ${nodeB}`)

  const second = await watchHandoff(nodeB, ['lesson-ready', 'failed'], TURN_TIMEOUT_MS)
  log(`B is ${second.phase} after ${((Date.now() - continued) / 1000).toFixed(1)}s of wall clock`)
  reportChain('B chain', second)

  const final = await overview()
  console.log('\n=== final runtime state ===')
  console.log(
    JSON.stringify(
      {
        course: final.course?.title ?? null,
        focus: final.focus ? { node: final.focus.nodeTitle, status: final.focus.status } : null,
        lessons: final.lessonCount,
        handoff: final.handoff?.phase ?? null,
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
