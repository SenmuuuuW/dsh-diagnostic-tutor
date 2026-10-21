/**
 * Real Chrome/CDP Path regression against the built, browser-only preview.
 * Usage: node scripts/path-check.mjs [http://localhost:8391/] [outdir]
 * Start/build the preview separately. This script never starts a web server or
 * permits a request to a learner-data API. Chrome uses its own temporary profile.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = new URL(process.argv[2] ?? 'http://localhost:8391/')
const outDir = process.argv[3] ?? '/tmp/udt-path-browser'
const port = 9373
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'udt-path-'))
await mkdir(outDir, { recursive: true })
const results = []
const runtimeErrors = []
const apiRequests = []
let chrome
let cdp
let failure
let currentCase = 'startup'
let currentWidth = 0

class Cdp {
  socket
  next = 1
  pending = new Map()
  async open(url) {
    this.socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push({ case: currentCase, ...message.params.exceptionDetails })
      if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/diagnostic-tutor/api/')) apiRequests.push({ case: currentCase, url: message.params.request.url })
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
      else pending.resolve(message.result)
    })
    this.socket.addEventListener('close', () => {
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Chrome CDP connection closed')) }
      this.pending.clear()
    })
  }
  send(method, params = {}) {
    const id = this.next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
    return response.result?.value
  }
}

// Observe only the mounted preview's injected client. Intercepting the factory
// avoids adding testing globals or transport hooks to production components.
const instrumentation = `(() => {
  const records = [];
  window.__pathCheck = { records, blockedApi: [] };
  let factory;
  Object.defineProperty(window, 'createPathFixture', {
    configurable: true,
    get: () => factory,
    set: (next) => { factory = function(options) {
      const raw = next(options);
      const record = { options, calls: [], lastView: null, client: null };
      const wrapped = {};
      for (const name of ['get', 'saveBrief', 'request', 'skipAssessment', 'accept', 'start']) {
        wrapped[name] = async (...args) => {
          const call = { name, args: structuredClone(args) };
          record.calls.push(call);
          try {
            const result = await raw[name](...args);
            record.lastView = structuredClone(result);
            call.ok = true;
            return result;
          } catch (error) { call.error = String(error); throw error; }
        };
      }
      record.client = wrapped;
      records.push(record);
      return wrapped;
    }; },
  });
  const originalFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const url = String(args[0] instanceof Request ? args[0].url : args[0]);
    if (url.includes('/diagnostic-tutor/api/')) {
      window.__pathCheck.blockedApi.push(url);
      return Promise.reject(new Error('path-check refuses learner-data API access; wire fixture clients into the preview'));
    }
    return originalFetch(...args);
  };
})()`

async function waitFor(expression, description, timeout = 8000) {
  const until = Date.now() + timeout
  do {
    if (await cdp.evaluate(expression)) return
    await delay(60)
  } while (Date.now() < until)
  const text = await cdp.evaluate(`document.body?.innerText?.slice(0, 1800)`)
  throw new Error(`${currentCase}: ${description}\n${text}`)
}
async function settle() {
  await cdp.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
}
async function point(selector, index = 0) {
  await cdp.evaluate(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) throw new Error('Missing selector: ' + ${JSON.stringify(selector)});
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
  })()`)
  await settle()
  const target = await cdp.evaluate(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, disabled: !!el.disabled, reachable: !!hit && (hit === el || el.contains(hit)), text: el.textContent };
  })()`)
  assert.ok(target.reachable, `${currentCase}: clipped/unreachable ${selector}: ${JSON.stringify(target)}`)
  return target
}
async function clickSelector(selector, index = 0) {
  const p = await point(selector, index)
  assert.equal(p.disabled, false, `${currentCase}: disabled ${selector} (${p.text})`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await settle()
}
async function buttonSelector(label, scope = 'document') {
  const index = await cdp.evaluate(`(() => {
    const root = ${scope === 'document' ? 'document' : `document.querySelector(${JSON.stringify(scope)})`};
    return root ? [...root.querySelectorAll('button')].findIndex(el => el.textContent.trim() === ${JSON.stringify(label)} || el.getAttribute('aria-label') === ${JSON.stringify(label)}) : -1;
  })()`)
  assert.ok(index >= 0, `${currentCase}: missing button ${label}`)
  return { selector: scope === 'document' ? 'button' : `${scope} button`, index }
}
async function click(label, scope) {
  const found = await buttonSelector(label, scope)
  await clickSelector(found.selector, found.index)
}
async function disabled(label, scope) {
  const found = await buttonSelector(label, scope)
  return cdp.evaluate(`document.querySelectorAll(${JSON.stringify(found.selector)})[${found.index}].disabled`)
}
async function fill(selector, value) {
  await point(selector)
  await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  })()`)
  await settle()
  assert.equal(await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).value`), value, `${currentCase}: input did not update ${selector}`)
}
async function mountedState() {
  return cdp.evaluate(`(async () => {
    const record = window.__pathCheck.records.at(-1);
    if (!record) throw new Error('Preview must pass createPathFixture() as pathClient');
    return record.client.get('machine-learning', 'preview-session');
  })()`)
}
async function writes() {
  return cdp.evaluate(`window.__pathCheck.records.flatMap(record => record.calls).filter(call => call.name !== 'get').map(({ name, args, ok, error }) => ({ name, args, ok, error }))`)
}
async function screenshot(name) {
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(outDir, `${name}.png`), Buffer.from(image.data, 'base64'))
}
async function layoutCheck() {
  const layout = await cdp.evaluate(`(() => {
    const root = document.querySelector('.dt-map-root-wrap, .dt-root-wrap, .dt-tab');
    const host = document.querySelector('#host');
    return { width: innerWidth, height: innerHeight, rootHeight: root?.getBoundingClientRect().height,
      hostHeight: host?.clientHeight, pageScrollTop: document.scrollingElement.scrollTop,
      pageScrollLeft: document.scrollingElement.scrollLeft,
      documentOverflowX: document.documentElement.scrollWidth > innerWidth + 1,
      documentOverflowY: document.documentElement.scrollHeight > innerHeight + 1,
      rootOverflowX: root ? root.scrollWidth > root.clientWidth + 1 : true,
      hostOverflow: host ? getComputedStyle(host).overflow : null };
  })()`)
  assert.ok(layout.rootHeight <= layout.hostHeight + 1, `${currentCase}: root escaped clipped host ${JSON.stringify(layout)}`)
  assert.equal(layout.documentOverflowX, false, `${currentCase}: horizontal document overflow`)
  assert.equal(layout.documentOverflowY, false, `${currentCase}: document scrolling masks clipped plugin content ${JSON.stringify(layout)}`)
  assert.equal(layout.rootOverflowX, false, `${currentCase}: horizontal root overflow`)
  assert.equal(layout.pageScrollTop, 0, `${currentCase}: document scrolled vertically`)
  assert.equal(layout.pageScrollLeft, 0, `${currentCase}: document scrolled horizontally`)
  assert.equal(layout.hostOverflow, 'hidden', `${currentCase}: preview must clip its host`)
  return layout
}
async function wheelToBottom(selector, mustOverflow = true) {
  await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center', inline: 'nearest' })`)
  await settle()
  const before = await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)}), r = el.getBoundingClientRect();
    el.scrollTop = 0;
    let top = Math.max(2, r.top), bottom = Math.min(innerHeight - 20, r.bottom);
    let left = Math.max(2, r.left), right = Math.min(innerWidth - 2, r.right);
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), box = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
      if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
    }
    return { height: el.clientHeight, total: el.scrollHeight, overflow: getComputedStyle(el).overflowY,
      x: left + Math.min(60, (right - left) / 2), y: top + Math.min(80, bottom - top) / 2 };
  })()`)
  if (before.total <= before.height + 2) {
    assert.equal(mustOverflow, false, `${currentCase}: ${selector} fixture should overflow`)
    return { selector, overflow: false }
  }
  assert.ok(['auto', 'scroll'].includes(before.overflow), `${currentCase}: ${selector} lacks a scroll container`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: before.x, y: before.y, deltaX: 0, deltaY: 420 })
  await delay(140)
  const moved = await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollTop`)
  assert.ok(moved > 0, `${currentCase}: wheel did not move ${selector}; pointer (${before.x},${before.y})`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: before.x, y: before.y, deltaX: 0, deltaY: before.total * 3 })
  await delay(160)
  const after = await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)}), r = el.getBoundingClientRect();
    return { remaining: el.scrollHeight - el.clientHeight - el.scrollTop, scrollTop: el.scrollTop,
      lastBottom: el.lastElementChild?.getBoundingClientRect().bottom,
      visibleBottom: Math.min(r.bottom, innerHeight) };
  })()`)
  assert.ok(after.remaining <= 2, `${currentCase}: ${selector} bottom unreachable: ${JSON.stringify(after)}`)
  assert.ok(after.lastBottom <= after.visibleBottom + 2, `${currentCase}: last content in ${selector} is clipped: ${JSON.stringify(after)}`)
  return { selector, wheelMoved: moved, bottom: after.scrollTop }
}
async function openCase(scenario, size, theme) {
  currentCase = `${scenario}-${size.width}-${theme}`
  currentWidth = size.width
  const url = new URL(base)
  url.searchParams.set('surface', 'map')
  url.searchParams.set('scenario', scenario)
  url.searchParams.set('theme', theme)
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: url.href })
  await waitFor(`document.documentElement.hasAttribute('data-diagnostic-tutor-preview') && !!document.querySelector('.dt-path-page .dt-path-body')`, 'map curriculum route never mounted; build and wire the preview first')
  assert.ok(await cdp.evaluate(`typeof window.createPathFixture === 'function' && window.__pathCheck.records.length > 0`), `${currentCase}: missing injected Path fixture`)
  assert.equal(await cdp.evaluate(`document.body.hasAttribute('data-ds-dark-theme')`), theme === 'dark')
  const state = await mountedState()
  assert.equal(state.path.courseId, 'machine-learning')
  assert.equal(state.run.sessionId, 'preview-session')
  assert.equal(state.run.courseId, 'machine-learning')
  assert.equal(await cdp.evaluate('window.__pathCheck.blockedApi.length'), 0, 'Preview attempted a real learner-data API')
  await layoutCheck()
  return state
}

/**
 * Switch the interface language and prove both directions render.
 *
 * Translation-agnostic on purpose: every language's copy contains CJK glyphs,
 * so the check does not pin a phrase that may be reworded later. It also proves
 * the switch makes no network request — the preview has no host to store a
 * preference in, and the fixture harness refuses learner-data API calls.
 */
async function languageCheck() {
  assert.equal(await cdp.evaluate(`document.querySelector('.dt-lang-toggle')?.textContent`), '中文', `${currentCase}: language toggle missing or not offering Chinese`)
  await clickSelector('.dt-lang-toggle')
  await waitFor(`document.querySelector('.dt-lang-toggle')?.textContent === 'EN'`, 'language toggle did not switch to Chinese')
  // The map page hosts the route, but starting a lesson switches the preview to
  // the course-reading view; both are translated surfaces, so read whichever one
  // is mounted. The language toggle is removed from the copy before reading it:
  // it is labelled with the *other* language (中文), which is not translated copy.
  const surface = `(() => {
    const read = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return ''
      const clone = element.cloneNode(true)
      for (const toggle of clone.querySelectorAll('.dt-lang-toggle')) toggle.remove()
      return clone.textContent ?? ''
    }
    return read('.dt-path-page') + read('.dt-course-reading')
  })()`
  const chinese = await cdp.evaluate(surface)
  assert.match(chinese, /[\u4e00-\u9fff]/, `${currentCase}: Chinese mode rendered no Chinese copy`)
  assert.equal(await cdp.evaluate('window.__pathCheck.blockedApi.length'), 0, `${currentCase}: switching language attempted a learner-data API call`)
  if (currentCase === 'curriculum-1440-light') await screenshot(`${currentCase}-zh`)
  await clickSelector('.dt-lang-toggle')
  await waitFor(`document.querySelector('.dt-lang-toggle')?.textContent === '中文'`, 'language toggle did not switch back to English')
  const english = await cdp.evaluate(surface)
  assert.doesNotMatch(english, /[\u4e00-\u9fff]/, `${currentCase}: English mode still renders Chinese copy`)
  return { languageSwitch: true }
}

async function browseCurriculum(state) {
  const initialWrites = await writes()
  const initialAttempt = state.run.activeAttemptId
  const plan = state.path.curricula.at(-1)
  assert.equal(plan.modules.length, 3)
  assert.ok(plan.items.length >= 10 && plan.items.length <= 12)
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.dt-path-node').length`), plan.items.length)
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.dt-path-row').length`), plan.items.length)
  assert.ok(await cdp.evaluate(`document.querySelectorAll('.dt-path-edge:not([data-optional])').length > 0 && document.querySelectorAll('.dt-path-edge[data-optional=true]').length > 0`))
  const canvasOrder = await cdp.evaluate(`[...document.querySelectorAll('.dt-path-node')].map(el => el.getAttribute('aria-label').replace('Overview', 'Browse'))`)
  const listOrder = await cdp.evaluate(`[...document.querySelectorAll('.dt-path-row')].map(el => el.getAttribute('aria-label'))`)
  assert.deepEqual(canvasOrder, listOrder, `${currentCase}: canvas/list lesson order differs`)
  for (let index = 0; index < plan.items.length; index += 1) {
    const entry = plan.items[index]
    if (index === 0) await clickSelector('.dt-path-row', 0)
    else await click('Next Overview', '.dt-path-detail')
    const detail = await cdp.evaluate(`document.querySelector('.dt-path-detail').textContent`)
    for (const value of [entry.title, entry.overview, entry.practice, entry.assessment, ...entry.outcomes, ...entry.outline]) assert.ok(detail.includes(value), `${currentCase}: lesson ${index + 1} Overview misses ${value}`)
    for (const heading of ['What you should be able to do', 'Lesson outline', 'Practice', 'Assessment', 'Prerequisites', 'Linked knowledge']) assert.ok(detail.includes(heading), `${currentCase}: missing Overview section ${heading}`)
    assert.equal(await disabled('Previous Overview', '.dt-path-detail'), index === 0)
    assert.equal(await disabled('Next Overview', '.dt-path-detail'), index === plan.items.length - 1)
  }
  const last = await mountedState()
  assert.equal(last.run.activeAttemptId, initialAttempt, `${currentCase}: browsing the last Overview changed current lesson`)
  assert.deepEqual(await writes(), initialWrites, `${currentCase}: browsing caused an accept/start/request`)
  const scroll = [await wheelToBottom('.dt-path-detail'), await wheelToBottom('.dt-path-outline')]
  await screenshot(`${currentCase}-last-overview`)
  for (const module of plan.modules) {
    await click('Fit route')
    const index = plan.modules.findIndex((entry) => entry.id === module.id)
    await clickSelector('.dt-path-module-label .dt-path-link', index)
    const detail = await cdp.evaluate(`document.querySelector('.dt-path-detail').textContent`)
    for (const value of ['Module Overview', module.overview, module.milestone, ...module.outcomes]) assert.ok(detail.includes(value), `${currentCase}: module Overview misses ${value}`)
  }
  await click('Fit route')
  const transform = await cdp.evaluate(`document.querySelector('.dt-path-stage').style.transform`)
  await click('Zoom in curriculum')
  assert.notEqual(await cdp.evaluate(`document.querySelector('.dt-path-stage').style.transform`), transform, `${currentCase}: zoom in did not change route`)
  await click('Zoom out curriculum')
  await click('Fit route')
  const beforePan = await cdp.evaluate(`document.querySelector('.dt-path-stage').style.transform`)
  await cdp.evaluate(`document.querySelector('.dt-path-canvas').focus()`)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await settle()
  assert.notEqual(await cdp.evaluate(`document.querySelector('.dt-path-stage').style.transform`), beforePan, `${currentCase}: keyboard pan did not move route`)
  await click('Fit route')
  // Pan from a genuine canvas background point. On phone-width Chrome the
  // canvas is intentionally kept as a keyboard/touch-friendly fit view: mouse
  // drag is not a reliable input primitive there, while the keyboard pan above
  // still proves the same viewport state transition.
  if (currentWidth >= 500) {
    const drag = await cdp.evaluate(`(() => {
      const el = document.querySelector('.dt-path-canvas'); el.scrollIntoView({block:'center'});
      const r = el.getBoundingClientRect(); return {x:r.left+5,y:r.top+5};
    })()`)
    await settle()
    const beforeDrag = await cdp.evaluate(`document.querySelector('.dt-path-stage').style.transform`)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.x, y: drag.y, button: 'left', clickCount: 1 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x + 48, y: drag.y + 34, button: 'left', buttons: 1 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.x + 48, y: drag.y + 34, button: 'left', clickCount: 1 })
    await settle()
    assert.notEqual(await cdp.evaluate(`document.querySelector('.dt-path-stage').style.transform`), beforeDrag, `${currentCase}: pointer pan did not move route`)
  }
  await click('Fit route')
  await click(`Collapse module ${plan.modules[0].title}`)
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.dt-path-node').length`), plan.items.length - 4)
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.dt-path-row').length`), plan.items.length)
  await click('Collapse all modules')
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.dt-path-node').length`), 0)
  await fill('.dt-path-search', 'matrix shapes')
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.dt-path-row').length`), 1, `${currentCase}: topic search missed collapsed lesson`)
  await clickSelector('.dt-path-row')
  assert.equal(await cdp.evaluate(`document.querySelector('.dt-path-detail h3').textContent`), plan.items[1].title)
  await fill('.dt-path-search', 'no-such-topic-for-path-check')
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.dt-path-row').length`), 0)
  await fill('.dt-path-search', '')
  await click('Expand all modules')
  await click('Fit route')
  assert.equal(await cdp.evaluate(`document.querySelectorAll('.dt-path-node').length`), plan.items.length)
  await clickSelector('.dt-path-node', plan.items.length - 1)
  assert.equal(await cdp.evaluate(`document.querySelector('.dt-path-detail h3').textContent`), plan.items.at(-1).title, `${currentCase}: last canvas item unreachable`)
  await click('Current lesson')
  assert.equal(await cdp.evaluate(`document.querySelector('.dt-path-detail h3').textContent`), plan.items.find((entry) => entry.id === state.run.attempts[0].itemId).title)
  const currentNode = await cdp.evaluate(`(() => { const el = document.querySelector('.dt-path-node[data-current=true]'), r = el.getBoundingClientRect(), c = document.querySelector('.dt-path-canvas').getBoundingClientRect(); return { within: r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom }; })()`)
  assert.ok(currentNode.within, `${currentCase}: Current lesson did not reveal current node`)
  await click('Fit route')
  await screenshot(`${currentCase}-route`)
  scroll.push(await wheelToBottom('.dt-path-page'))
  assert.deepEqual(await writes(), initialWrites, `${currentCase}: map controls caused a write`)
  assert.equal((await mountedState()).run.activeAttemptId, initialAttempt)
  return { scroll, lessonsBrowsed: plan.items.length, modulesBrowsed: plan.modules.length }
}

async function draftAcceptStart(state) {
  const plan = state.path.curricula[0]
  assert.equal(state.path.acceptedVersion, null)
  assert.equal(state.run.attempts.length, 0)
  await clickSelector('.dt-path-row', plan.items.length - 1)
  assert.equal(await disabled('Start lesson', '.dt-path-detail'), true)
  assert.equal((await mountedState()).run.attempts.length, 0, `${currentCase}: last Overview started itself`)
  assert.equal((await writes()).length, 0)
  await click('Accept route version 1')
  await waitFor(`document.querySelector('.dt-path-version')?.selectedOptions[0]?.textContent.includes('accepted')`, 'explicit acceptance did not appear')
  const accepted = await mountedState()
  assert.equal(accepted.path.acceptedVersion, 1)
  assert.equal(accepted.run.attempts.length, 0, `${currentCase}: acceptance auto-started a lesson`)
  assert.ok(accepted.path.revision > state.path.revision)
  await clickSelector('.dt-path-row', 0)
  await click('Start lesson', '.dt-path-detail')
  await waitFor(`!!document.querySelector('.dt-course-unit .dt-block')`, 'mock start did not open CourseLearning with a teaching snapshot; share the fixture and wire onOpenChat to Learning')
  const started = await mountedState()
  assert.equal(started.run.attempts.length, 1)
  const attempt = started.run.attempts[0]
  assert.equal(attempt.itemId, plan.items[0].id)
  assert.equal(attempt.status, 'working')
  assert.ok(attempt.prompted)
  assert.ok(attempt.operations.includes(attempt.operationId))
  assert.equal(attempt.dispatchId, null)
  assert.ok(attempt.units[0].lesson.blocks.some((block) => block.type === 'text'))
  assert.ok(attempt.units[0].lesson.blocks.some((block) => block.type === 'check'))
  const text = await cdp.evaluate(`document.querySelector('#host').textContent`)
  assert.ok(text.includes(plan.items[0].title) && text.includes('Preview teaching snapshot'), `${currentCase}: CourseLearning snapshot missing`)
  assert.deepEqual((await writes()).map((entry) => entry.name), ['accept', 'start'])
  await screenshot(`${currentCase}-started`)
  return { explicitAccept: true, explicitStart: true, savedUnits: attempt.units.length }
}

async function setupWizard(state) {
  assert.equal(state.path.brief, null)
  assert.equal(state.path.assessment, null)
  assert.equal(state.path.curricula.length, 0)
  assert.ok(await cdp.evaluate(`!!document.querySelector('form[aria-label="Learning goal wizard"]')`))
  // Progressive disclosure: the diagnosis stage owns the page once the goal is saved.
  assert.equal(await cdp.evaluate(`[...document.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Request diagnosis')`), false, `${currentCase}: diagnosis action appeared before the goal was ready`)
  const purpose = `Browser fixture goal ${currentCase}`
  await fill('[id$="-purpose"]', purpose)
  await click('Save draft')
  await waitFor(`document.querySelector('.dt-path-status')?.textContent.includes('Incomplete goal draft saved')`, 'partial goal was not saved')
  await click('Close wizard')
  await click('Goal and time settings')
  assert.equal(await cdp.evaluate(`document.querySelector('[id$="-purpose"]').value`), purpose)
  await fill('[id$="-outcomes"]', 'Build a small classifier\nExplain its validation errors')
  await click('Next', '.dt-path-wizard')
  await fill('[id$="-background"]', 'Python scripts; matrix shapes need a check.')
  await click('Next', '.dt-path-wizard')
  await fill('[id$="-timeKind"]', 'weeks')
  await fill('[id$="-durationWeeks"]', '8')
  await fill('[id$="-timeZone"]', 'UTC')
  await fill('[id$="-deadline"]', 'fixed')
  await fill('[id$="-weeklyMinutes"]', '210')
  await fill('[id$="-sessionMinutes"]', '35')
  await click('Next', '.dt-path-wizard')
  await fill('[id$="-preferences"]', 'Use short numerical examples and NumPy.')
  await click('Save and close')
  await waitFor(`!document.querySelector('.dt-path-wizard') && [...document.querySelectorAll('.dt-path-status')].some(el => el.textContent.includes('Goal draft saved.'))`, 'complete goal did not save and close')
  const saved = await mountedState()
  assert.equal(saved.path.briefRevision, 2)
  assert.equal(saved.path.brief.purpose, purpose)
  assert.deepEqual(saved.path.brief.outcomes, ['Build a small classifier', 'Explain its validation errors'])
  assert.equal(saved.path.brief.durationWeeks, 8)
  assert.equal(saved.path.brief.targetDate, null)
  assert.equal(saved.path.brief.deadline, 'fixed')
  assert.equal(saved.path.brief.weeklyMinutes, 210)
  assert.equal(saved.path.brief.sessionMinutes, 35)
  assert.equal(saved.path.brief.timeZone, 'UTC')
  // Switching tabs unmounts PathPage and reads it back from the same fixture.
  await click('Knowledge & evidence')
  await waitFor(`!!document.querySelector('.dt-map-root')`, 'Knowledge tab did not mount')
  await click('Course route')
  await waitFor(`!!document.querySelector('.dt-path-body')`, 'Course route did not remount')
  await click('Goal and time settings')
  await waitFor(`!!document.querySelector('[id$="-purpose"]')`, 'wizard did not reopen after remount')
  assert.equal(await cdp.evaluate(`document.querySelector('[id$="-purpose"]').value`), purpose, `${currentCase}: save was lost when PathPage remounted`)
  assert.equal(await cdp.evaluate(`document.querySelector('[id$="-outcomes"]').value`), saved.path.brief.outcomes.join('\n'))
  await click('2. Background')
  assert.equal(await cdp.evaluate(`document.querySelector('[id$="-background"]').value`), saved.path.brief.background)
  await click('3. Time')
  for (const [field, value] of [['timeKind', 'weeks'], ['durationWeeks', '8'], ['timeZone', 'UTC'], ['deadline', 'fixed'], ['weeklyMinutes', '210'], ['sessionMinutes', '35']]) assert.equal(await cdp.evaluate(`document.querySelector('[id$="-${field}"]').value`), value)
  await click('4. Preferences')
  assert.equal(await cdp.evaluate(`document.querySelector('[id$="-preferences"]').value`), saved.path.brief.preferences)
  await screenshot(`${currentCase}-saved-wizard`)
  await click('Close wizard')
  assert.equal(await disabled('Request diagnosis'), false)
  assert.deepEqual((await mountedState()).path.brief, saved.path.brief)
  assert.deepEqual((await writes()).map((entry) => entry.name), ['saveBrief', 'saveBrief'])
  return { savedBriefRevision: saved.path.briefRevision, remountPreserved: true }
}
async function assessmentFlow(state) {
  assert.ok(state.path.brief?.outcomes.length > 0)
  assert.equal(state.path.assessment, null)
  assert.equal(state.path.curricula.length, 0)
  assert.equal(await cdp.evaluate(`[...document.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Request a route proposal')`), false, `${currentCase}: route request appeared before diagnosis`)
  await click('Request diagnosis')
  await waitFor(`!!document.querySelector('.dt-path-pending') && document.querySelector('.dt-path-pending').textContent.includes('Initial diagnosis in progress')`, 'pending-diagnosis state did not appear')
  const inProgress = await mountedState()
  assert.equal(inProgress.path.assessment.status, 'in-progress')
  assert.equal(inProgress.path.assessment.briefRevision, inProgress.path.briefRevision)
  assert.equal(await cdp.evaluate(`[...document.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Request a route proposal')`), false, `${currentCase}: route request appeared while waiting for the diagnosis`)
  await screenshot(`${currentCase}-diagnosis`)
  await click('Skip initial assessment')
  await waitFor(`document.querySelector('[aria-label="Initial diagnosis"]')?.textContent.includes('skipped')`, 'explicit skip did not save')
  assert.equal(await disabled('Request a route proposal'), false)
  await click('Request a route proposal')
  await waitFor(`document.querySelectorAll('.dt-path-row').length === 12`, 'fixture did not return full draft route')
  const proposed = await mountedState()
  assert.equal(proposed.path.acceptedVersion, null)
  assert.equal(proposed.path.assessment.status, 'skipped')
  assert.equal(proposed.path.curricula.at(-1).acceptedAt, null)
  assert.equal(proposed.run.attempts.length, 0)
  assert.deepEqual((await writes()).map((entry) => entry.name), ['request', 'skipAssessment', 'request'])
  await screenshot(`${currentCase}-proposal`)
  return { diagnosisSimulation: true, explicitSkip: true, proposedLessons: proposed.path.curricula.at(-1).items.length }
}

try {
  let occupied = false
  try { const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(700) }); occupied = response.ok } catch { /* Expected: dedicated port is unused. */ }
  assert.equal(occupied, false, `CDP port ${port} is already occupied; stop the old path-check Chrome first`)
  let startupError
  chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  chrome.on('error', (error) => { startupError = error })
  let target
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (startupError) throw startupError
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (target) break
    } catch { /* Chrome is still starting. */ }
    await delay(100)
  }
  assert.ok(target, 'Could not attach to the dedicated headless Chrome')
  cdp = new Cdp()
  await cdp.open(target.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation })
  const sizes = [{ width: 1440, height: 700 }, { width: 900, height: 650 }, { width: 400, height: 640 }]
  for (const theme of ['light', 'dark']) {
    for (const size of sizes) {
      for (const scenario of ['curriculum', 'path-draft', 'path-setup', 'path-assessment']) {
        const state = await openCase(scenario, size, theme)
        const checks = scenario === 'curriculum' ? await browseCurriculum(state)
          : scenario === 'path-draft' ? await draftAcceptStart(state)
          : scenario === 'path-setup' ? await setupWizard(state)
          : await assessmentFlow(state)
        const layout = await layoutCheck()
        const language = await languageCheck()
        assert.equal(await cdp.evaluate('window.__pathCheck.blockedApi.length'), 0, `${currentCase}: fixture tried a learner-data API`)
        assert.equal(runtimeErrors.length, 0, `${currentCase}: browser exception: ${JSON.stringify(runtimeErrors)}`)
        assert.equal(apiRequests.length, 0, `${currentCase}: learner-data network request: ${JSON.stringify(apiRequests)}`)
        results.push({ name: currentCase, ...checks, ...language, layout })
        await screenshot(currentCase)
        console.log(`PASS ${currentCase}: ${JSON.stringify(checks)}`)
      }
    }
  }
  console.log(`\n${results.length} Path browser cases passed; screenshots: ${outDir}`)
} catch (error) {
  failure = { case: currentCase, message: error?.stack ?? String(error) }
  console.error(`FAIL ${currentCase}: ${failure.message}`)
  if (cdp) {
    try { await screenshot(`${currentCase}-FAIL`) } catch { /* Preserve the original assertion. */ }
  }
  process.exitCode = 1
} finally {
  await writeFile(join(outDir, 'results.json'), JSON.stringify({ base: base.href, port, results, runtimeErrors, apiRequests, failure }, null, 2))
  cdp?.socket?.close()
  chrome?.kill('SIGTERM')
}
