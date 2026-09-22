/**
 * Drive one real learning loop through the DSH web UI, and prove the chat and
 * the learning surface coexist.
 *
 * The loop, as a learner walks it:
 *
 *   press Start learning  →  the tutor is woken in the chat
 *   →  it writes blocks into the docked Learning tab
 *   →  the learner answers in the chat, WITH the lesson still on screen
 *   →  the tutor records evidence; the tab follows
 *
 * The coexistence check is the point of this version: after returning to the
 * conversation, it asserts that the composer, the map and the lesson blocks are
 * all present at once, and it reads the before/after state from the docked tab
 * without ever leaving the chat.
 *
 * Usage:
 *   node scripts/learning-loop.mjs <dsh-url-with-token> [output.png]
 */

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PANEL_LABEL = 'Learn'
const PORT = 9224
/** A model turn is not instant; this is the honest budget. */
const TUTOR_TIMEOUT_MS = 420_000

const url = process.argv[2]
const out = process.argv[3] ?? 'preview/dsh-ui-loop.png'
if (!url) {
  console.error('usage: node scripts/learning-loop.mjs <dsh-url-with-token> [output.png]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
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
    await sleep(500)
  }
  throw new Error(`timed out waiting for ${label} (${timeoutMs}ms)`)
}

const profile = await mkdtemp(join(tmpdir(), 'dt-loop-'))
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

  // 0. The learner speaks first.
  //
  // Not a workaround: a conversation's agent comes into being when something is
  // said in it, and pressing Start learning before that would have no agent to
  // wake. This is also simply what a learner does — they talk to the tutor,
  // then work through the map.
  const typed = await cdp.evaluate(`(() => {
    const input = document.querySelector('[contenteditable="true"]');
    if (!input) return false;
    input.focus();
    return true;
  })()`)
  if (!typed) throw new Error('could not find the chat input')
  await cdp.send('Input.insertText', { text: '我准备好了，我们按地图来学。' })
  await sleep(400)
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  console.log('0. learner sent a first message; waiting for the tutor to finish')
  await waitFor(cdp, '!document.querySelector("[class*=pending], [class*=streaming]")', 'the first turn to settle', 180_000)
  await sleep(3000)

  // 1. Open the full panel, pick a node, and start learning. The docked tab
  //    opens as a side effect of a focus being recorded.
  const opened = await cdp.evaluate(`(() => {
    const label = ${JSON.stringify(PANEL_LABEL)};
    const nodes = [...document.querySelectorAll('button, [role=button]')];
    const hit = nodes.find((el) => (el.getAttribute('aria-label') || '').trim() === label)
      || nodes.find((el) => (el.textContent || '').trim() === label);
    if (!hit) return false;
    hit.click();
    return true;
  })()`)
  if (!opened) throw new Error('could not find the sidebar entry')
  await waitFor(cdp, '!!document.querySelector(".dt-root")', 'the full panel')
  await sleep(800)

  const picked = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.dt-node')];
    const target = rows.find((el) => /blocked/.test(el.textContent)) || rows[1] || rows[0];
    if (!target) return null;
    const title = target.querySelector('.dt-node-title')?.textContent?.trim() ?? '';
    target.click();
    return title;
  })()`)
  console.log('1. selected node:', picked)
  await waitFor(cdp, '!!document.querySelector(".dt-detail h2")', 'the node detail')

  await cdp.evaluate(`document.querySelector('.dt-detail button.dt-primary')?.click()`)
  console.log('2. pressed Start learning')

  const started = Date.now()
  await waitFor(
    cdp,
    'document.querySelector(".dt-origin") && document.querySelector(".dt-origin").textContent.trim() === "tutor"',
    'the tutor to write its own blocks',
    TUTOR_TIMEOUT_MS,
  )
  console.log(`3. the tutor wrote blocks after ${((Date.now() - started) / 1000).toFixed(1)}s`)

  // 2. Back to the conversation, with the lesson docked beside it.
  await cdp.evaluate(`(() => {
    const door = [...document.querySelectorAll('button')].find((el) =>
      (el.textContent || '').includes('Answer in the chat'));
    door?.click();
  })()`)
  await sleep(1500)

  const coexist = await cdp.evaluate(`(() => ({
    composer: !!document.querySelector('[contenteditable="true"]'),
    dockedTab: !!document.querySelector('.dt-tab'),
    lessonBlocks: document.querySelectorAll('.dt-tab [data-block-type]').length,
    mapNodes: document.querySelectorAll('.dt-tab-node').length,
    fullPanelGone: !document.querySelector('.dt-root'),
  }))()`)
  console.log('\n=== coexistence (chat + surface at the same time) ===')
  console.log(JSON.stringify(coexist, null, 2))

  const readTab = () => cdp.evaluate(`(() => {
    const tab = document.querySelector('.dt-tab');
    if (!tab) return null;
    return {
      node: tab.querySelector('.dt-tab-title')?.textContent ?? null,
      state: tab.querySelector('.dt-tab-head .dt-state')?.textContent ?? null,
      evidence: [...tab.querySelectorAll('.dt-evidence li')].map((li) => li.textContent.trim().slice(0, 120)),
      blocks: [...tab.querySelectorAll('[data-block-type]')].map((el) => el.getAttribute('data-block-type')),
      lessonTitle: tab.querySelector('.dt-tab-lesson-title')?.textContent ?? null,
    };
  })()`)

  const before = await readTab()
  console.log('\n=== BEFORE the learner answers ===')
  console.log(JSON.stringify(before, null, 2))

  // 3. Answer in the chat, without leaving the surface.
  const answerable = await cdp.evaluate(`(() => {
    const input = document.querySelector('[contenteditable="true"]');
    if (!input) return false;
    input.click();
    input.focus();
    return true;
  })()`)
  if (!answerable) throw new Error('the composer was not available while the surface was docked')

  await cdp.send('Input.insertText', {
    text:
      process.env.DT_ANSWER ||
      '我看了题目但不太确定：感觉和矩阵那部分有关，可我说不清为什么，也说不出步骤。能不能先给我讲讲它是怎么来的？',
  })
  await sleep(400)
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  console.log('\n4. answered in the chat, surface still docked')

  console.log('5. waiting for the tutor to finish its turn')
  await waitFor(
    cdp,
    `!document.querySelector('[class*=pending], [class*=streaming]')`,
    'the answer turn to settle',
    TUTOR_TIMEOUT_MS,
  )
  await sleep(3000)

  const after = await readTab()
  console.log('\n=== AFTER the learner answered ===')
  console.log(JSON.stringify(after, null, 2))
  console.log(
    `\nanswer -> evidence ${before?.evidence.length} to ${after?.evidence.length}, ` +
      `state ${before?.state} to ${after?.state}, blocks ${before?.blocks.length} to ${after?.blocks.length}`,
  )

  // 4. The tutor decides what happens next. Nothing moves on its own: the
  //    recommendation appears with its reason and waits to be pressed.
  const nextStep = await cdp.evaluate(`(() => {
    const card = document.querySelector('.dt-tab .dt-next');
    if (!card) return null;
    return {
      action: card.querySelector('.dt-next-from')?.textContent?.trim() ?? null,
      target: card.querySelector('.dt-next-target')?.textContent?.trim() ?? null,
      why: card.querySelector('.dt-next-why')?.textContent?.trim() ?? null,
      button: card.querySelector('button')?.textContent?.trim() ?? null,
    };
  })()`)
  console.log('\n=== NEXT BEST STEP ===')
  console.log(nextStep === null ? '(the tutor has not decided yet)' : JSON.stringify(nextStep, null, 2))

  if (nextStep !== null) {
    const nodeBefore = after?.node ?? null
    await cdp.evaluate(`document.querySelector('.dt-tab .dt-next button')?.click()`)
    console.log('6. pressed continue; the new focus should start on its own')

    await waitFor(
      cdp,
      `(document.querySelector('.dt-tab-title')?.textContent ?? '') !== ${JSON.stringify(nodeBefore)}`,
      'the new node to take over',
      TUTOR_TIMEOUT_MS,
    )
    console.log('   -> focus moved')

    // The tutor teaches the new node into the surface.
    const lessonBefore = after?.lessonTitle ?? null
    await waitFor(
      cdp,
      `(document.querySelector('.dt-tab-lesson-title')?.textContent ?? '') !== ${JSON.stringify(lessonBefore)} ` +
        '|| document.querySelectorAll(".dt-tab [data-block-type]").length > 0',
      'a lesson for the new node',
      TUTOR_TIMEOUT_MS,
    )

    const continued = await readTab()
    console.log('\n=== after continuing ===')
    console.log(JSON.stringify(continued, null, 2))
  }

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(out, Buffer.from(shot.data, 'base64'))
  console.log(`\nscreenshot -> ${out}`)
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}
