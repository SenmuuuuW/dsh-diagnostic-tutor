/**
 * Interface copy for the lesson surface.
 *
 * Only the chrome is kept here: the blocks' labels, the course card's status
 * lines, the empty states and the learner's data controls. Lesson titles, the
 * teaching itself and anything the learner wrote are content, not interface,
 * and are never selected from this table.
 *
 * The English side is the copy this surface already shipped with, unchanged —
 * the table is a move, not an edit. The Chinese side is the same interface in
 * Simplified Chinese, using one vocabulary throughout: 课次 for a lesson and
 * 学习路线 for a route, with 证据 and 导师 matching the map's wording.
 */

import { useLang } from './i18n.js'

const en = {
  // ---- lesson blocks ---------------------------------------------------
  workedExample: 'Worked example',
  diagram: 'Diagram',
  formula: 'Formula',
  code: 'Code',
  quiz: 'Quiz',
  flashcard: 'Flashcard',
  resource: 'Resource',
  comparison: 'Comparison',
  sourceRef: 'Sources',
  sourcePreview: 'Source preview',
  flashcardFront: 'Front',
  flashcardBack: 'Back',
  quizAnswerInChat: 'Answer in the chat; the tutor will respond there.',
  submitAnswer: 'Record my answer',
  answerRecorded: 'Answer recorded — the tutor will respond in the chat.',
  showAnswer: 'Show the answer',
  flashcardAgain: 'Again',
  flashcardGotIt: 'Got it',
  answerFailed: 'Could not record this answer. Try again.',
  mermaidSourcePrefix: 'Source shown as text — this build ships no ',
  mermaidSourceSuffix: ' renderer.',
  yourTurn: 'Your turn',
  answerInChatHint: 'answer in the chat →',
  hint: 'Hint',
  unknownType: 'unknown',
  unknownBlockAfter: ' block — this build has no renderer for it. Update the plugin to see it.',

  // ---- the learner's data ----------------------------------------------
  deleteConfirm:
    'Delete your goal, your map, every lesson and all the evidence behind it? This cannot be undone.',
  deleting: 'Deleting…',
  deleteYes: 'Yes, delete everything',
  cancel: 'Cancel',
  exportData: 'Export my data',
  deleteAll: 'Delete everything',
  dataNote: 'Stored on this machine only. Nothing is sent anywhere.',

  // ---- the course card -------------------------------------------------
  learningRoute: 'Your learning route',
  lesson: 'Lesson',
  lessonOf: 'of',
  routeVersion: 'Route v',
  lessonCompleted: 'Lesson completed · evidence recorded',
  lessonPaused: 'Lesson paused',
  currentLesson: 'This conversation’s current lesson',
  newerRoutePrefix: 'A newer route exists. This lesson remains on v',
  newerRouteSuffix: '.',
  openCourseRoute: 'Open course route',
  tutorOrigin: 'Tutor',
  preparingTitle: 'The tutor is preparing this lesson',
  routeReadyTitle: 'Your course route is ready',
  buildRouteTitle: 'Build a route around your goal',
  preparingBody:
    'The teaching appears here as it is written. Answer the tutor’s questions in the chat.',
  routeReadyBody: 'Browse any lesson Overview in Learning map, then choose where to begin.',
  buildRouteBody:
    'Set your target, available time and background in Learning map, then ask for an initial diagnosis and course outline.',
  promptPending: 'The teaching request has not reached a live tutor yet.',
  promptRetry: ' Open the course route to retry.',
  lessonOutcome: 'Lesson outcome',
  outcomeNote: 'Completing a lesson does not automatically confirm its knowledge points.',
  chooseNextLesson: 'Choose the next lesson',
  answerInChat: 'Answer in the chat',
}

const zh: typeof en = {
  // ---- lesson blocks ---------------------------------------------------
  workedExample: '例题解析',
  diagram: '示意图',
  formula: '公式',
  code: '代码',
  quiz: '小测',
  flashcard: '闪卡',
  resource: '学习资料',
  comparison: '对比',
  sourceRef: '来源',
  sourcePreview: '来源预览',
  flashcardFront: '正面',
  flashcardBack: '背面',
  quizAnswerInChat: '在对话中回答，导师会在对话里回应。',
  submitAnswer: '记录我的回答',
  answerRecorded: '回答已记录 —— 导师会在对话里回应。',
  showAnswer: '显示答案',
  flashcardAgain: '再来一次',
  flashcardGotIt: '记住了',
  answerFailed: '记录失败，请重试。',
  mermaidSourcePrefix: '源码以文本形式显示 —— 本构建未附带 ',
  mermaidSourceSuffix: ' 渲染器。',
  yourTurn: '轮到你了',
  answerInChatHint: '在对话中回答 →',
  hint: '提示',
  unknownType: '未知',
  unknownBlockAfter: ' 区块 —— 本构建没有它的渲染器。请更新插件以查看。',

  // ---- the learner's data ----------------------------------------------
  deleteConfirm: '要删除你的目标、你的地图、所有课次以及背后的全部证据吗？此操作无法撤销。',
  deleting: '正在删除…',
  deleteYes: '是，全部删除',
  cancel: '取消',
  exportData: '导出我的数据',
  deleteAll: '全部删除',
  dataNote: '仅存储在本机。不会发送到任何地方。',

  // ---- the course card -------------------------------------------------
  learningRoute: '你的学习路线',
  lesson: '课次',
  lessonOf: '/',
  routeVersion: '学习路线 v',
  lessonCompleted: '课次已完成 · 证据已记录',
  lessonPaused: '课次已暂停',
  currentLesson: '本次会话的当前课次',
  newerRoutePrefix: '已有更新的学习路线。本课次仍保留在 v',
  newerRouteSuffix: '。',
  openCourseRoute: '打开学习路线',
  tutorOrigin: '导师',
  preparingTitle: '导师正在准备本课次',
  routeReadyTitle: '你的学习路线已就绪',
  buildRouteTitle: '围绕你的目标构建学习路线',
  preparingBody: '教学内容会在此处随写随显。请在对话中回答导师的问题。',
  routeReadyBody: '在学习地图中浏览任意课次概览，然后选择从哪里开始。',
  buildRouteBody: '在学习地图中设置你的目标、可用时间和背景，然后请求初始诊断和课程大纲。',
  promptPending: '教学请求尚未送达在线的导师。',
  promptRetry: '打开学习路线重试。',
  lessonOutcome: '课次成果',
  outcomeNote: '完成课次不会自动确认其知识点。',
  chooseNextLesson: '选择下一课次',
  answerInChat: '在对话中回答',
}

/**
 * The copy for the lesson surface in the learner's chosen language.
 *
 * Re-renders when the language changes, so the panel switches in place.
 *
 * @returns the active language's interface strings.
 */
export function useLessonText(): typeof en {
  return useLang() === 'zh' ? zh : en
}
