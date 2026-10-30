/* Study-first UX prototype. Static fixture data; no backend and no real learner state. */
const app = document.getElementById('app')
const toastEl = document.getElementById('toast')
let toastTimer

const icons = {
  arrow: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M13 8H3m4-4L3 8l4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3.3 8.4 3 2.9 6.4-6.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5.7"/><path d="M8 4.4V8l2.4 1.4" stroke-linecap="round"/></svg>',
  book: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 3.3h4a2 2 0 0 1 2 2v7.4a2 2 0 0 0-2-2H3zM13 3.3H9a2 2 0 0 0-2 2v7.4a2 2 0 0 1 2-2h4z" stroke-linejoin="round"/></svg>',
  spark: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 2.2v3.1M8 10.7v3.1M2.2 8h3.1M10.7 8h3.1M4 4l2.1 2.1M9.9 9.9 12 12M12 4 9.9 6.1M6.1 9.9 4 12" stroke-linecap="round"/></svg>',
  layers: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m8 2.2 5.2 2.7L8 7.6 2.8 4.9 8 2.2Z" stroke-linejoin="round"/><path d="m3 8 5 2.6L13 8M3 11.1l5 2.6 5-2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  file: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 2.2h5l3 3v8.6H4z" stroke-linejoin="round"/><path d="M9 2.2v3h3M5.8 8.5h4.4M5.8 10.8h4.4" stroke-linecap="round"/></svg>',
  target: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5.4"/><circle cx="8" cy="8" r="2.5"/></svg>',
  clockSmall: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5.7"/><path d="M8 4.4V8l2.4 1.4" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.7" cy="8" r="1"/></svg>',
}

const course = {
  title: '矩阵乘法与形状',
  goal: '从形状出发，真正理解矩阵乘法，并能检查一个结果是否可能。',
  lesson: '矩阵乘法与内维',
  modules: [
    { id: 'shapes', title: '先看清楚形状', meta: '3 节 · 24 分钟', lessons: [
      { code: '1.1', title: '矩阵到底是什么', status: 'done', time: '8 分钟' },
      { code: '1.2', title: '矩阵乘法与内维', status: 'current', time: '10 分钟' },
      { code: '1.3', title: '形状速查', status: 'todo', time: '6 分钟' } ] },
    { id: 'why', title: '为什么这样定义', meta: '3 节 · 27 分钟', lessons: [
      { code: '2.1', title: '从线性组合出发', status: 'todo', time: '9 分钟' },
      { code: '2.2', title: '列视角与行视角', status: 'todo', time: '10 分钟' },
      { code: '2.3', title: '一次小证明', status: 'todo', time: '8 分钟' } ] },
    { id: 'code', title: '在代码里验证', meta: '2 节 · 14 分钟', lessons: [
      { code: '3.1', title: '用 NumPy 检查形状', status: 'todo', time: '7 分钟' },
      { code: '3.2', title: '一个真实的小模型', status: 'todo', time: '7 分钟' } ] },
  ],
}

const steps = [
  { label: '概念', eyebrow: '01 · 先看清楚' },
  { label: '例子', eyebrow: '02 · 一个小例子' },
  { label: '检查', eyebrow: '03 · 检查' },
  { label: '回想', eyebrow: '04 · 回想' },
  { label: '完成', eyebrow: '05 · 完成' },
]
const state = { screen: 'home', step: 0, selected: null, submitted: false, revealed: false, openModules: new Set(['shapes']) }
const params = new URLSearchParams(location.search)
if (['home', 'course', 'study'].includes(params.get('screen'))) state.screen = params.get('screen')
if (params.get('step') !== null) state.step = Math.min(4, Math.max(0, Number(params.get('step')) || 0))

const icon = (name) => icons[name] || ''
const esc = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function showToast(message) { toastEl.textContent = message; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200) }
function bind(selector, event, handler) { document.querySelectorAll(selector).forEach(el => el.addEventListener(event, handler)) }
function nav(screen) { state.screen = screen; render(); window.scrollTo({ top: 0, behavior: 'instant' }) }
function resetStudy() { state.step = 0; state.selected = null; state.submitted = false; state.revealed = false }
function brand() { return `<div class="brand"><span class="brand-mark">${icon('layers')}</span><span>学习</span></div>` }

function homePage() {
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())
  return `<div class="shell"><header class="site-head">${brand()}<div class="site-meta"><span class="date">${esc(date)}</span><span class="prototype-pill">STUDY-FIRST PROTOTYPE</span><button class="avatar-button" type="button" data-action="profile" aria-label="个人设置">宇</button></div></header>
  <main class="page"><div class="home-head"><div><p class="eyebrow">今天 · 10 分钟</p><h1 class="display">把“形状”看明白，<br>再开始算。</h1></div></div>
  <section class="home-hero" aria-labelledby="hero-title"><div class="hero-copy"><p class="eyebrow">继续上次</p><h2 class="display" id="hero-title">矩阵乘法与内维</h2><p class="lede">上次你停在“内维为什么必须相等”。今天只解决这一件事，然后用一个小检查确认自己能不能说清楚。</p><div class="hero-actions"><button class="button primary" data-action="study">继续学习 ${icon('arrow')}</button><button class="button secondary" data-action="course">查看课程</button></div></div>
  <div class="hero-visual" aria-hidden="true"><div class="matrix-scene"><span class="matrix-label a">A · 4×3</span><div class="matrix-box one">${'<i class="matrix-cell"></i>'.repeat(9)}</div><span class="matrix-arrow ab">×</span><span class="matrix-label b">B · 3×2</span><div class="matrix-box two">${'<i class="matrix-cell"></i>'.repeat(9)}</div><span class="matrix-arrow bc">↘</span><span class="matrix-label c">C · 4×2</span><div class="matrix-box three">${'<i class="matrix-cell"></i>'.repeat(9)}</div><p class="matrix-caption">中间的 3，在结果里消失</p></div></div></section>
  <div class="dashboard"><section class="card today-card" aria-labelledby="today-title"><div class="today-head"><div><p class="card-kicker">今天</p><h2 class="today-title" id="today-title">一个 10 分钟的学习块</h2><p class="today-sub">只做一件事，做完就停。</p></div></div><div class="today-list"><div class="today-row"><span class="today-icon">${icon('book')}</span><div class="today-copy"><b>继续第 1.2 课</b><span>矩阵乘法与内维 · 3/5 步</span></div><button class="today-action" data-action="study">开始</button></div><div class="today-row"><span class="today-icon warm">${icon('clock')}</span><div class="today-copy"><b>3 张复习卡到期</b><span>来自上周的矩阵形状练习</span></div><button class="today-action" data-action="review">复习</button></div></div></section>
  <section class="card stat-card" aria-labelledby="countdown-title"><p class="card-kicker">考试倒计时</p><div class="stat-value"><strong>24</strong><span>天</span></div><p class="stat-foot" id="countdown-title">期末 · 线性代数</p><div class="stat-track"><i style="width:38%"></i></div><p class="stat-foot">还有 2 个单元没开始</p></section>
  <section class="card stat-card" aria-labelledby="rhythm-title"><p class="card-kicker">本周节奏</p><div class="stat-value"><strong>3</strong><span>次 · 42 分钟</span></div><p class="stat-foot" id="rhythm-title">事实记录，不是掌握分</p><div class="stat-track"><i style="width:54%; background:var(--green)"></i></div><p class="stat-foot">比上周多 1 次</p></section></div>
  <div class="section-head"><h2 class="section-title">我的课程</h2><button class="section-link" data-action="new-course">新建课程</button></div><div class="course-strip"><button class="mini-course current" data-action="course"><span class="mini-eyebrow">进行中 · 数学</span><b>矩阵乘法与形状</b><span>已学 2 课 · 3 张复习卡</span></button><button class="mini-course" data-action="sample-course"><span class="mini-eyebrow">准备开始 · 计算机</span><b>机器学习数学基础</b><span>目标已保存 · 等待诊断</span></button><button class="mini-course" data-action="sample-course"><span class="mini-eyebrow">进行中 · 物理</span><b>AP 物理 1</b><span>旧项目 · 继续上次路线</span></button></div></main></div>`
}

function coursePage() {
  const modules = course.modules.map((module, index) => {
    const open = state.openModules.has(module.id)
    return `<section class="module"><button class="module-head" type="button" data-module="${esc(module.id)}" aria-expanded="${open}"><span class="module-index">${String(index + 1).padStart(2, '0')}</span><span class="module-name"><b>${esc(module.title)}</b><span>${esc(module.meta)}</span></span><span class="module-toggle">${open ? '收起' : '展开'}</span></button>${open ? `<div class="lesson-list">${module.lessons.map((lesson) => {
      const cls = lesson.status === 'done' ? 'done' : lesson.status === 'current' ? 'current' : ''
      return `<button class="lesson-row ${cls}" type="button" data-lesson="${lesson.status}"><span class="lesson-check">${lesson.status === 'done' ? icon('check') : lesson.status === 'current' ? icon('arrow') : ''}</span><span class="lesson-name"><b>${esc(lesson.code)} ${esc(lesson.title)}</b><span>${lesson.status === 'done' ? '已完成' : lesson.status === 'current' ? '正在学' : '未开始'}</span></span><span class="lesson-time">${esc(lesson.time)}</span></button>`
    }).join('')}</div>` : ''}</section>`
  }).join('')
  return `<div class="shell"><header class="site-head">${brand()}<div class="site-meta"><button class="button quiet" data-action="home">${icon('back')} 今天</button><span class="prototype-pill">STUDY-FIRST PROTOTYPE</span></div></header><main class="page"><div class="course-head"><div class="course-title-row"><div><p class="eyebrow">课程 · 线性代数</p><h1 class="display">${esc(course.title)}</h1><p class="course-sub">${esc(course.goal)}</p></div><button class="icon-button" data-action="course-menu" aria-label="课程设置">${icon('menu')}</button></div><div class="course-actions"><button class="button primary" data-action="study">继续第 1.2 课 ${icon('arrow')}</button><button class="button secondary" data-action="sources">课程资料</button></div><div class="course-summary"><span class="fact-pill">${icon('check')} 已学 2 课</span><span class="fact-pill">${icon('clock')} 3 张复习卡</span><span class="fact-pill">${icon('file')} 2 个来源</span><span class="fact-pill">${icon('target')} 4 周 · 12 课</span></div></div><div class="course-layout"><div class="course-main">${modules}</div><aside class="course-side"><section class="card side-card"><h2 class="side-title">本课资料</h2><div class="source-row"><span class="source-file">${icon('file')}</span><div class="source-copy"><b>矩阵乘法笔记.md</b><span>§2.1 · 形状规则</span></div></div><div class="source-row"><span class="source-file">${icon('file')}</span><div class="source-copy"><b>线性代数教材</b><span>第 3 章 · 2.1 引用</span></div></div><p class="side-note">本课由导师根据目标和资料生成。引用只读，不上传。</p><button class="text-button" data-action="sources">查看全部资料 →</button></section><section class="card side-card"><h2 class="side-title">学习方式</h2><p class="side-note" style="border-top:0;padding-top:0;margin-top:0">诊断式导师 · 先看证据，再决定下一步。你可以随时切换学习 skill。</p><button class="text-button" data-action="skills">切换学习 skill →</button></section></aside></div></main></div>`
}

function studyStepBody() {
  if (state.step === 0) return `<p class="study-eyebrow">${steps[0].eyebrow}</p><h1 class="study-title">内维，就是被消掉的那个维度。</h1><p class="study-lede">两个矩阵能不能相乘，不看它们各自有多大，只看它们中间的两个数字是不是同一个数。</p><div class="formula-panel"><div class="formula"><span>A<span class="dims">(m×n)</span></span><span class="op">·</span><span>B<span class="dims">(n×p)</span></span><span class="op">=</span><span>C<span class="dims">(m×p)</span></span></div><p class="formula-note">A 的列数 <b class="inner">n</b> 和 B 的行数 <b class="inner">n</b> 必须是同一个数。</p></div><div class="insight"><b>为什么它会消失？</b> 因为 A 的每一行要和 B 的每一列逐项相乘再相加；做完之后，中间那个维度就被“消掉”了，只会留下 A 的行数和 B 的列数。</div><span class="study-source">${icon('file')} 来源：矩阵乘法笔记 §2.1</span>`
  if (state.step === 1) return `<p class="study-eyebrow">${steps[1].eyebrow}</p><h1 class="study-title">先动笔，把形状写出来。</h1><p class="study-lede">不要一上来就算数字。先看形状，能不能乘就已经确定了。</p><div class="example-stack"><div class="example-line"><span class="example-index">1</span><b>A</b><span class="muted">4 行 × 3 列</span></div><div class="example-line"><span class="example-index">2</span><b>B</b><span class="muted">3 行 × 2 列</span></div><div class="example-line"><span class="example-index">3</span><b>C</b><span class="muted">4 行 × 2 列 · 中间 3 被消去</span></div></div><div class="code-panel"><span class="comment"># 先检查形状，再算数字</span><br>A.shape == (<span class="num">4</span>, <span class="num">3</span>)<br>B.shape == (<span class="num">3</span>, <span class="num">2</span>)<br><span class="comment"># 3 == 3，所以可以乘</span><br>C.shape == (<span class="num">4</span>, <span class="num">2</span>)</div><div class="insight"><b>检查口诀：</b>把 A 的第二个数字和 B 的第一个数字圈起来；相等就能乘，结果保留 A 的第一个数字和 B 的第二个数字。</div>`
  if (state.step === 2) {
    const options = ['B 是 4×2', 'B 是 3×2', 'B 是 2×3']
    return `<p class="study-eyebrow">${steps[2].eyebrow}</p><h1 class="study-title">如果 A 是 4×3，B 应该是什么形状？</h1><p class="study-lede check-lead">先不急着算乘法，只判断形状。点击一个选项，再提交。</p><div class="quiz-options" role="group" aria-label="选择 B 的形状">${options.map((option, index) => `<button class="quiz-option ${state.selected === index ? 'selected' : ''}" type="button" data-option="${index}" ${state.submitted ? 'disabled' : ''}><span class="option-key">${String.fromCharCode(65 + index)}</span>${esc(option)}</button>`).join('')}</div>${state.submitted ? `<div class="answer-note"><strong>已记录你的选择。</strong> 这一步只记录练习证据，不自动判对错。关键条件是 A 的列数 = B 的行数；导师会在下一步结合你的选择解释。</div>` : ''}`
  }
  if (state.step === 3) return `<p class="study-eyebrow">${steps[3].eyebrow}</p><h1 class="study-title">合上笔记，说出规则。</h1><p class="study-lede">不要求背定义。只要能用一句话说出：什么情况下两个矩阵可以相乘。</p><div class="flashcard"><p class="fc-label">闪卡 · 正面</p><div class="fc-front">两个矩阵相乘时，哪个维度必须相等？</div>${state.revealed ? `<div class="fc-back">第一个矩阵的列数 = 第二个矩阵的行数。也就是它们的“内维”相等。</div>` : `<p class="fc-hint">在底部点击「翻到背面」</p>`}</div>${state.revealed ? `<div class="answer-note muted-note">已翻开。记住这条规则，比记住一个例子更重要。</div>` : ''}`
  return `<p class="study-eyebrow">${steps[4].eyebrow}</p><h1 class="study-title">这一节完成了。</h1><p class="study-lede">你留下了一个可以被检查的学习痕迹，而不是一个“看过了”的完成标记。</p><div class="summary-box"><div class="summary-row"><span class="summary-mark">${icon('check')}</span><span>练习记录 <b>1 次</b></span></div><div class="summary-row"><span class="summary-mark">${icon('clock')}</span><span>复习卡已加入队列 <b>1 张</b></span></div><div class="summary-row"><span class="summary-mark">${icon('file')}</span><span>引用来源 <b>1 个</b></span></div></div><div class="next-note"><b>下一步：</b>用 A (3×2) 和 B (2×4) 自己写一遍形状检查。导师会先看你的解释，再决定要不要进入下一课。</div>`
}

function studyPage() {
  const current = steps[state.step]
  const progress = (state.step + 1) / steps.length * 100
  const primary = state.step === 2 && !state.submitted ? '提交答案' : state.step === 2 ? '继续' : state.step === 3 && !state.revealed ? '翻到背面' : state.step === 4 ? '回到今天' : '继续'
  const disabled = state.step === 2 && state.selected === null
  return `<div class="study-shell"><header class="study-head"><div class="study-head-left"><button class="icon-button" data-action="study-back" aria-label="返回课程">${icon('back')}</button><div><div class="study-course">线性代数 · 第 1.2 课</div><div class="study-lesson-name">矩阵乘法与内维</div></div></div><div class="study-head-right"><span class="study-stepcount">第 ${state.step + 1} / ${steps.length} 步</span><button class="icon-button" data-action="home" aria-label="退出学习">×</button></div></header><div class="study-progress" aria-hidden="true"><i style="width:${progress}%"></i></div><main class="study-body"><aside class="study-rail" aria-label="学习步骤"><p class="rail-label">本课进度</p><ol class="rail-list">${steps.map((step, index) => `<li class="rail-item ${index < state.step ? 'done' : index === state.step ? 'active' : ''}"><span class="rail-dot">${index < state.step ? icon('check') : index + 1}</span><span>${esc(step.label)}</span></li>`).join('')}</ol></aside><section class="study-card" aria-labelledby="study-title">${studyStepBody()}</section><aside class="study-side"><p class="study-side-title">今天的学习块</p><strong>10 分钟</strong><p class="side-note">只做这一件事。完成之后，Review 和下一步会等你。</p><p class="study-side-title" style="margin-top:28px">学习方式</p><p class="side-note">诊断式导师<br>证据优先 · 不自动推进</p></aside></main><footer class="study-foot"><div class="study-foot-inner"><p class="study-foot-note"><b>${esc(current.label)}</b> · 你的选择会记录为练习证据</p><div class="study-foot-actions"><button class="button quiet" data-action="study-exit">保存并退出</button>${state.step > 0 ? `<button class="button secondary" data-action="prev">上一步</button>` : ''}<button class="button primary" data-action="next" ${disabled ? 'disabled' : ''}>${primary} ${state.step < 4 ? icon('arrow') : ''}</button></div></div></footer></div>`
}

function render() {
  if (state.screen === 'home') app.innerHTML = homePage()
  else if (state.screen === 'course') app.innerHTML = coursePage()
  else app.innerHTML = studyPage()
  document.title = `${state.screen === 'home' ? '今天' : state.screen === 'course' ? course.title : course.lesson} · 学习`
  bind('[data-action]', 'click', onAction)
  bind('[data-module]', 'click', (event) => { const id = event.currentTarget.dataset.module; if (state.openModules.has(id)) state.openModules.delete(id); else state.openModules.add(id); render() })
  bind('[data-lesson]', 'click', (event) => { const status = event.currentTarget.dataset.lesson; if (status === 'current') { resetStudy(); nav('study') } else showToast(status === 'done' ? '这一课已完成；原型暂不展开回看。' : '原型只实现了当前这一课。') })
  bind('[data-option]', 'click', (event) => { if (state.submitted) return; state.selected = Number(event.currentTarget.dataset.option); render() })
}
function onAction(event) {
  const action = event.currentTarget.dataset.action
  if (action === 'study') { resetStudy(); nav('study'); return }
  if (action === 'course') { nav('course'); return }
  if (action === 'sample-course') { showToast('原型只展开当前这门课。'); return }
  if (action === 'new-course') { showToast('课程生成流程是下一个切片：资料 → 预览 → 接受。'); return }
  if (action === 'home') { nav('home'); return }
  if (action === 'review') { showToast('复习会从今天直接进入；原型先聚焦 Study。'); return }
  if (action === 'profile') { showToast('个人设置不在本轮原型范围内。'); return }
  if (action === 'course-menu') { showToast('课程设置会收进右上角菜单，不再占据主流程。'); return }
  if (action === 'sources') { showToast('资料与引用会在这里展开，不跳转新 tab。'); return }
  if (action === 'skills') { showToast('未来可切换不同学习 skill；原型先固定一个。'); return }
  if (action === 'study-back') { if (state.step > 0) { state.step -= 1; state.selected = null; state.submitted = false; state.revealed = false; render() } else nav('course'); return }
  if (action === 'study-exit') { nav('home'); return }
  if (action === 'prev') { if (state.step > 0) { state.step -= 1; state.selected = null; state.submitted = false; state.revealed = false; render() } return }
  if (action === 'next') {
    if (state.step === 2 && !state.submitted) { if (state.selected === null) return; state.submitted = true; render(); return }
    if (state.step === 3 && !state.revealed) { state.revealed = true; render(); return }
    if (state.step >= 4) { nav('home'); return }
    state.step += 1; state.selected = null; state.submitted = false; state.revealed = false; render()
  }
}
render()
