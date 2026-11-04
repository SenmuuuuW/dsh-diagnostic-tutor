/* Study Lab: layout modes + slider + step-through + inline check. */
const stage = document.getElementById('lab-stage')
const body = document.getElementById('study-body')
const progress = document.getElementById('progress')
const stepCount = document.getElementById('step-count')
const rule = document.getElementById('lab-rule')
const titleEyebrow = document.querySelector('.study-title .eyebrow')
const modeButtons = [...document.querySelectorAll('[data-mode]')]
const state = { mode: 'side', step: 0, w: 1.5, walk: 0, selected: null, submitted: false }
const RULES = {
  side: 'Chat stays visible · one reference pane',
  main: 'Course and learning side by side · chat not shown',
  full: 'One task only · leave when the step is done',
}
const MODE_LABELS = { side: '专注学习 · 侧栏', main: '专注学习 · 主区域', full: '专注学习 · 全屏' }
const STEPS = [
  { label: '看见', eyebrow: '01 · 先看见' },
  { label: '走一步', eyebrow: '02 · 分步演示' },
  { label: '检查', eyebrow: '03 · 内嵌检查' },
  { label: '完成', eyebrow: '04 · 完成' },
]
function iconCheck() { return '<span class="summary-mark">✓</span>' }
function loss(w) { return (w - 3) ** 2 }
function curvePath(from = 0, to = 6) {
  const points = []
  for (let i = 0; i <= 60; i++) {
    const w = from + (to - from) * (i / 60)
    const l = loss(w)
    const x = 42 + (w / 6) * 330
    const y = 138 - (l / 9) * 105
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return points.join(' ')
}
function point(w) {
  const x = 42 + (w / 6) * 330
  const y = 138 - (loss(w) / 9) * 105
  return { x, y }
}
function mode(modeName) {
  state.mode = modeName
  stage.dataset.mode = modeName
  modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === modeName)))
  rule.textContent = RULES[modeName]
  titleEyebrow.textContent = MODE_LABELS[modeName]
  document.getElementById('expand').textContent = modeName === 'full' ? '退出全屏 ↘' : '全屏 ↗'
  render()
}
function setStep(next) {
  state.step = next
  if (next === 0) state.w = 1.5
  if (next === 1) state.walk = 0
  if (next === 2) { state.selected = null; state.submitted = false }
  render()
}
function sliderStep() {
  const w = Number(document.getElementById('w-slider').value)
  state.w = w
  render()
}
function walkStep() {
  state.walk = Math.min(4, state.walk + 1)
  render()
}
function resetWalk() { state.walk = 0; render() }
function selectOption(index) {
  if (state.submitted) return
  state.selected = index
  render()
}
function submitOption() {
  if (state.selected === null) return
  state.submitted = true
  render()
}
function render() {
  progress.style.width = `${((state.step + 1) / STEPS.length) * 100}%`
  stepCount.textContent = `${state.step + 1} / ${STEPS.length}`
  document.getElementById('prev').disabled = state.step === 0
  document.getElementById('next').textContent = state.step === 3 ? '回到课程 →' : '继续 →'
  if (state.step === 0) {
    const p = point(state.w)
    body.innerHTML = `<article class="study-card"><p class="step-eyebrow">${STEPS[0].eyebrow}</p><h2>先把 loss 画出来。</h2><p>学习率本身没有意义。它改变的是“下一步落在曲线的哪里”。先拖动权重 w，感受 loss 怎么变。</p><div class="formula">L(w) = (w − 3)²</div><div class="interaction"><div class="interaction-head"><span class="interaction-label">拖动 w</span><span class="interaction-value">w = ${state.w.toFixed(1)} · L = ${loss(state.w).toFixed(2)}</span></div><input class="slider" id="w-slider" type="range" min="0" max="6" step="0.1" value="${state.w}" aria-label="调整权重 w"><svg class="chart" viewBox="0 0 420 160" role="img" aria-label="loss 曲线"><path d="${curvePath()}" fill="none" stroke="#3155f5" stroke-width="2.2"/><line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="138" stroke="#cbd4f8" stroke-dasharray="3 3"/><circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="#3155f5" stroke-width="2.5"/><text x="42" y="155">w = 0</text><text x="360" y="155">w = 6</text><text x="${p.x + 8}" y="${p.y - 8}" fill="#3155f5">你在这里</text></svg></div></article>`
    document.getElementById('w-slider').addEventListener('input', sliderStep)
  } else if (state.step === 1) {
    const eta = 0.2
    const points = [{ w: 0.5, l: loss(0.5) }]
    for (let i = 0; i < 4; i++) {
      const previous = points[i].w
      const next = previous - eta * 2 * (previous - 3)
      points.push({ w: next, l: loss(next) })
    }
    const current = points[state.walk]
    const poly = points.slice(0, state.walk + 1).map((entry) => {
      const p = point(entry.w)
      return `${p.x},${p.y}`
    }).join(' ')
    const dots = points.slice(0, state.walk + 1).map((entry, index) => {
      const p = point(entry.w)
      return `<circle cx="${p.x}" cy="${p.y}" r="${index === state.walk ? 5 : 3}" fill="${index === state.walk ? '#fff' : '#3155f5'}" stroke="#3155f5" stroke-width="${index === state.walk ? 2.5 : 0}"/>`
    }).join('')
    body.innerHTML = `<article class="study-card"><p class="step-eyebrow">${STEPS[1].eyebrow}</p><h2>一步之后，w 去了哪里？</h2><p>固定学习率 η = 0.2，从 w = 0.5 开始。每次点“走一步”，看参数如何接近最低点。</p><div class="interaction"><div class="interaction-head"><span class="interaction-label">第 ${state.walk} 步</span><span class="interaction-value">w = ${current.w.toFixed(2)} · L = ${current.l.toFixed(2)}</span></div><svg class="chart" viewBox="0 0 420 160" role="img" aria-label="分步梯度下降轨迹"><path d="${curvePath()}" fill="none" stroke="#dfe4ee" stroke-width="2"/><polyline points="${poly}" fill="none" stroke="#3155f5" stroke-width="1.8" stroke-dasharray="4 4"/>${dots}<text x="42" y="155">w = 0</text><text x="360" y="155">w = 6</text></svg><div class="step-dots">${points.map((entry, index) => `<i class="${index <= state.walk ? 'on' : ''}"></i>`).join('')}</div><div class="walk-actions"><button type="button" id="walk-next" ${state.walk >= 4 ? 'disabled' : ''}>走一步</button><button type="button" id="walk-reset">从头</button></div></div></article>`
    document.getElementById('walk-next').addEventListener('click', walkStep)
    document.getElementById('walk-reset').addEventListener('click', resetWalk)
  } else if (state.step === 2) {
    const options = ['loss 会变小，但可能震荡', 'loss 会一直变小', 'w 会停在最低点']
    body.innerHTML = `<article class="study-card"><p class="step-eyebrow">${STEPS[2].eyebrow}</p><h2>学习率太大，最先看到什么？</h2><p>不要查定义。用刚才的四步轨迹判断。</p><div class="quiz-options">${options.map((option, index) => `<button type="button" class="quiz-option" aria-pressed="${state.selected === index}" data-option="${index}" ${state.submitted ? 'disabled' : ''}>${String.fromCharCode(65 + index)} · ${option}</button>`).join('')}</div>${state.submitted ? '<div class="quiz-note">已记录你的选择。这里不自动判对错；关键线索是黄色 loss 曲线和每步落点。</div>' : '<div class="quiz-note neutral">选一个，再提交。答案会作为练习证据记录。</div>'}<div class="walk-actions"><button type="button" id="submit-check" ${state.selected === null || state.submitted ? 'disabled' : ''}>提交选择</button></div></article>`
    document.querySelectorAll('[data-option]').forEach((button) => button.addEventListener('click', () => selectOption(Number(button.dataset.option))))
    document.getElementById('submit-check').addEventListener('click', submitOption)
  } else {
    body.innerHTML = `<article class="study-card"><p class="step-eyebrow">${STEPS[3].eyebrow}</p><h2>这一节完成了。</h2><p>你刚刚不是读完了三张卡；你拖动过、走过、做过判断。</p><div style="margin-top:18px">${['拖动参数 1 次', '分步演示 4 步', state.submitted ? '内嵌检查 1 次' : '内嵌检查未提交'].map((line) => `<div class="summary-row">${iconCheck()}<span>${line}</span></div>`).join('')}</div><p style="margin-top:16px">这些只是练习证据；是否掌握仍由导师和后续检查决定。</p></article>`
  }
}
modeButtons.forEach((button) => button.addEventListener('click', () => mode(button.dataset.mode)))
document.getElementById('expand').addEventListener('click', () => mode(state.mode === 'full' ? 'side' : 'full'))
document.getElementById('back').addEventListener('click', () => mode('main'))
document.getElementById('prev').addEventListener('click', () => { if (state.step > 0) setStep(state.step - 1) })
document.getElementById('next').addEventListener('click', () => {
  if (state.step === 2 && !state.submitted) { submitOption(); return }
  if (state.step === 3) { mode('main'); return }
  setStep(state.step + 1)
})
mode('side')
