/**
 * Drive one real learning loop through the DSH web UI.
 *
 * The point is to exercise the loop the way a learner does — with a real
 * harness, a real agent and the real teaching brain — and to report what
 * actually happened rather than what should have:
 *
 *   click the sidebar entry  →  pick a node  →  Start learning
 *   →  the tutor is woken in the chat  →  blocks appear in the surface
 *
 * It waits for the tutor with a real timeout, because a model turn takes
 * seconds, and prints what the panel ended up showing.
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
const TUTOR_TIMEOUT_MS = 180_000

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

  // 1. open the panel
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
  await waitFor(cdp, '!!document.querySelector(".dt-root")', 'the panel')
  await sleep(800)

  // 2. pick a node that is actually blocked
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

  // 3. Start learning
  const focusBefore = await cdp.evaluate(
    `!!document.querySelector('button.dt-primary')`,
  )
  if (!focusBefore) throw new Error('no Start learning button')
  await cdp.evaluate(`document.querySelector('button.dt-primary').click()`)
  console.log('2. pressed Start learning')

  // 4. wait for the tutor to write something
  const started = Date.now()
  // Wait for the TUTOR's blocks specifically. Any block would match the v0.0.4
  // scaffold, and mistaking that for teaching would make this check worthless.
  await waitFor(
    cdp,
    'document.querySelector(".dt-origin") && document.querySelector(".dt-origin").textContent.trim() === "tutor"',
    'the tutor to write its own blocks',
    TUTOR_TIMEOUT_MS,
  )
  console.log(`3. the tutor wrote blocks after ${((Date.now() - started) / 1000).toFixed(1)}s`)

  await sleep(1500)

  const report = await cdp.evaluate(`(() => {
    const root = document.querySelector('.dt-root');
    const lesson = {
      origin: root.querySelector('.dt-origin')?.textContent ?? null,
      title: root.querySelector('.dt-pane:last-of-type h2')?.textContent ?? null,
      blocks: [...root.querySelectorAll('[data-block-type]')].map((el) => el.getAttribute('data-block-type')),
    };
    const detail = root.querySelector('.dt-detail');
    const focused = root.querySelector('.dt-node[data-focused="true"]');
    return {
      course: root.querySelector('.dt-course-title')?.textContent ?? null,
      focusedNode: focused?.querySelector('.dt-node-title')?.textContent?.trim() ?? null,
      selectedNode: detail?.querySelector('h2')?.textContent ?? null,
      state: detail?.querySelector('.dt-state')?.textContent ?? null,
      note: detail?.querySelector('.dt-caption')?.textContent ?? null,
      evidence: [...(detail?.querySelectorAll('.dt-evidence li') ?? [])].map((li) => li.textContent.trim().slice(0, 100)),
      lesson,
      chatTail: [...document.querySelectorAll('[class*=message], [class*=Message]')]
        .slice(-3).map((el) => (el.textContent || '').trim().slice(0, 160)),
    };
  })()`)

  console.log('\\n=== what the panel shows ===')
  console.log(JSON.stringify(report, null, 2))

  console.log('4. the learner answers the check in the chat')
  const before = report.evidence.length
  // The panel fills the main column, which is also where the chat lives, so
  // the surface offers a door back to it. Without this the learner could read
  // the lesson but never answer the check.
  const doorClicked = await cdp.evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const door = buttons.find((el) => (el.textContent || '').includes('Answer in the chat'));
    if (!door) return false;
    door.click();
    return true;
  })()`)
  if (!doorClicked) console.log('   (no "Answer in the chat" button; trying the composer directly)')
  await sleep(800)

  // The composer is re-mounted when the conversation comes back.
  await waitFor(cdp, `!!document.querySelector('[contenteditable="true"]')`, 'the chat input')
  const answerable = await cdp.evaluate(`(() => {
    const input = document.querySelector('[contenteditable="true"]');
    if (!input) return false;
    input.click();
    input.focus();
    return document.activeElement === input || input.contains(document.activeElement);
  })()`)
  if (!answerable) throw new Error('could not focus the chat input for the answer')
  await cdp.send('Input.insertText', {
    // Deliberately generic: the check is written by the model at run time, so a
    // canned answer cannot match it. An honest "not sure" is a real learner
    // answer and a real evidence signal either way.
    text:
      process.env.DT_ANSWER ||
      '我看了题目但不太确定：感觉和矩阵那部分有关，可我说不清为什么，也说不出步骤。能不能先给我讲讲它是怎么来的？',
  })
  await sleep(400)
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })

  // 5. The tutor judges the answer and records what it observed. The panel
  //    should follow with no user action -- that is the whole loop.
  console.log('5. waiting for the tutor to record its judgement')
  // While the conversation is showing, the panel is not in the DOM at all, so
  // the only honest way to observe the result is to let the turn settle and
  // then open the panel again.
  console.log('5. waiting for the tutor to finish its turn')
  await waitFor(
    cdp,
    `!document.querySelector('[class*=pending], [class*=streaming]')`,
    'the answer turn to settle',
    TUTOR_TIMEOUT_MS,
  )
  await sleep(3000)

  const reopened = await cdp.evaluate(`(() => {
    const label = ${JSON.stringify(PANEL_LABEL)};
    const nodes = [...document.querySelectorAll('button, [role=button]')];
    const hit = nodes.find((el) => (el.getAttribute('aria-label') || '').trim() === label)
      || nodes.find((el) => (el.textContent || '').trim() === label);
    if (!hit) return false;
    hit.click();
    return true;
  })()`)
  if (!reopened) throw new Error('could not reopen the panel after answering')
  await waitFor(cdp, '!!document.querySelector(".dt-root")', 'the panel again')
  await sleep(1200)

  const after = await cdp.evaluate(`(() => {
    const root = document.querySelector('.dt-root');
    // The panel opens with nothing selected; pick the focused node to read it.
    const focused = root.querySelector('.dt-node[data-focused="true"]');
    if (focused) focused.click();
    return { focusedTitle: focused?.querySelector('.dt-node-title')?.textContent?.trim() ?? null };
  })()`)
  await sleep(1200)

  const detail = await cdp.evaluate(`(() => {
    const pane = document.querySelector('.dt-detail');
    return {
      state: pane?.querySelector('.dt-state')?.textContent ?? null,
      evidence: [...(pane?.querySelectorAll('.dt-evidence li') ?? [])].map((li) =>
        li.textContent.trim().slice(0, 150),
      ),
      blocks: [...document.querySelectorAll('[data-block-type]')].map((el) => el.getAttribute('data-block-type')),
      lessonTitle: document.querySelector('.dt-pane:last-of-type h2')?.textContent ?? null,
    };
  })()`)
  console.log('\n=== after the learner answered ===')
  console.log(JSON.stringify({ ...after, ...detail }, null, 2))
  console.log(`evidence went from ${before} to ${detail.evidence.length}`)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(out, Buffer.from(shot.data, 'base64'))
  console.log(`\\nscreenshot → ${out}`)
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}
