/**
 * Interface copy for the standalone full-page learning panel.
 *
 * English is the copy the panel already shipped with, unchanged — the table is
 * a move, not an edit. Chinese is the same interface in Simplified Chinese,
 * using the vocabulary the map and lesson surfaces already use: 会话 for a
 * conversation, 导师 for the tutor, 诊断地图 for the map, 证据 for evidence and
 * 课次 for a lesson.
 *
 * Only chrome lives here. Course and node titles, goals, lesson markdown and
 * the model's notes and reasons are the learner's record and are never
 * selected from this table.
 *
 * Counts are functions because the two languages put the number in different
 * places; a template assembled from a fixed prefix and suffix would read as
 * translated English in one of them.
 */

import { useLang } from './i18n.js'

const en = {
  // ---- the header ------------------------------------------------------
  learning: 'Learning',
  conversationInSidebar: 'your conversation stays in the sidebar',
  noConversation: 'no conversation selected',
  learningMap: 'Learning map',
  backToChat: 'Back to the conversation',

  // ---- first use: chosen nothing --------------------------------------
  yourLearning: 'Your learning',
  yourLearningProjects: 'Your learning projects',
  projectsShared: 'Shared across your conversations.',
  product: 'Universal Diagnostic Tutor',
  welcomeTitle: 'What do you want to learn?',
  welcomeBody:
    'Works with the Universal Diagnostic Tutor skill. Start by telling the tutor what you want to learn — in your own words, in the chat. Then this page fills in: a map of what you actually know, the lesson, and the evidence behind every status.',
  tryLabel: 'Try',
  trySample: 'I want to learn machine learning. I know some Python, but my math is weak.',
  skillNote:
    'If tutoring doesn\'t start, make sure the UDT skill is available to your active DSH agent.',
  dataNote:
    'No account, no scores, no streak. Your goal, your map and the evidence behind it stay on this machine, and are yours to keep or delete.',
  warningTitle: 'The Universal Diagnostic Tutor skill was not found.',
  warningBody:
    'This panel still records and shows your learning state, but no lesson will be written until the skill is available to your active DSH agent.',

  // ---- first use: chosen something new --------------------------------
  startNew: 'Start something new',
  startNewNote: 'the tutor creates the project from what you say',
  startNewTitle: 'Tell the tutor what you want to learn in Chat.',
  startNewBody:
    'When the tutor records a goal there, it becomes this conversation’s project. Nothing is created here, and your other projects are untouched.',
  orContinue: 'Or continue one',
  goToChat: 'Go to the chat',

  // ---- the learner's projects ------------------------------------------
  confirmedOf: (confirmed: number, total: number): string => `${confirmed} of ${total} confirmed`,
  projectGo: (confirmed: number): string => (confirmed === 0 ? 'Open' : 'Continue'),

  // ---- course + map ----------------------------------------------------
  noGoal: 'No goal yet',
  sharedAcross: 'Shared across conversations',
  goalLabel: 'Goal:',
  thisConversation: 'This conversation',
  noFocus: 'No learning focus yet. Pick a node below to start learning here.',
  startNoSessionTitle: 'Open or create a conversation first — that is where the tutor replies.',
  startNoSessionBody:
    'Open a conversation first. The tutor teaches in the chat, so a node cannot be started without one.',
  starting: 'Starting…',
  diagnosisMap: 'Diagnosis map',
  census: (count: number): string => `${count} nodes`,
  emptyMap: 'Nothing on the map yet. State a goal in the chat and the runtime will record it.',
  evidenceCount: (count: number): string => `${count} evidence`,
  confirmedByEvidence: (confirmed: number, total: number): string =>
    `${confirmed} of ${total} confirmed by evidence.`,

  // ---- selected node ---------------------------------------------------
  loadingMap: 'Loading your map…',
  nothingSelected: 'Nothing selected',
  pickNode:
    'Pick a node on the map and this column shows what is recorded against it, and why it is in that state.',
  selectedNode: 'Selected node',
  parent: (title: string): string => `parent: ${title}`,
  children: (count: number): string => `${count} children`,
  whereThisSits: 'Where this sits',
  evidence: 'Evidence',
  nothingRecorded: 'Nothing recorded yet.',
  teachingNode: 'This is the node the tutor is teaching. The lesson is on the right.',

  // ---- learning surface ------------------------------------------------
  learningSurface: 'Learning surface',
  lessonOrigin: (origin: string): string => origin,
  preparing: 'The tutor is preparing this node…',
  preparingBody:
    'The teaching appears here as it is written, while the conversation continues in the chat.',
  nothingTaught: 'Nothing is being taught yet',
  pressContinuePrefix: 'The tutor has recorded the next step. Press ',
  pressContinueSuffix: ' and the teaching appears here, and the conversation stays in the chat.',
  pressStartPrefix: 'Choose a node on the map and press ',
  pressStartSuffix: '. The teaching appears here, and the conversation stays in the chat.',
  startLearning: 'Start learning',
  answerInChat: 'Answer in the chat',
  backToNode: 'Back to the node',
}

const zh: typeof en = {
  // ---- the header ------------------------------------------------------
  learning: '学习',
  conversationInSidebar: '你的对话保留在侧边栏中',
  noConversation: '未选择会话',
  learningMap: '学习地图',
  backToChat: '返回会话',

  // ---- first use: chosen nothing --------------------------------------
  yourLearning: '你的学习',
  yourLearningProjects: '你的学习项目',
  projectsShared: '在你的所有会话之间共享。',
  product: 'Universal Diagnostic Tutor',
  welcomeTitle: '你想学什么？',
  welcomeBody:
    '与 Universal Diagnostic Tutor 技能配合使用。先在上方对话中，用你自己的话告诉导师你想学什么。随后这个页面会逐步填入内容：一张反映你实际掌握情况的地图、课次，以及支撑每一个状态的证据。',
  tryLabel: '试试',
  trySample: '我想学习机器学习。我会一些 Python，但数学基础比较薄弱。',
  skillNote: '如果教学没有开始，请确认你的当前 DSH 智能体可以使用 UDT 技能。',
  dataNote:
    '无需账户，没有分数，也没有连续打卡。你的目标、地图以及背后的证据都保存在这台机器上，你可以自行保留或删除。',
  warningTitle: '未找到 Universal Diagnostic Tutor 技能。',
  warningBody:
    '这个面板仍会记录并显示你的学习状态，但在你的当前 DSH 智能体可以使用该技能之前，不会写入任何课次。',

  // ---- first use: chosen something new --------------------------------
  startNew: '开始新的学习',
  startNewNote: '导师会根据你说的内容创建项目',
  startNewTitle: '在对话中告诉导师你想学什么。',
  startNewBody:
    '导师在对话中记录目标后，它就会成为本次会话的项目。这里不会创建任何内容，你的其他项目不会受到影响。',
  orContinue: '或继续一个项目',
  goToChat: '前往对话',

  // ---- the learner's projects ------------------------------------------
  confirmedOf: (confirmed, total) => `已确认 ${confirmed} / ${total}`,
  projectGo: (confirmed) => (confirmed === 0 ? '打开' : '继续'),

  // ---- course + map ----------------------------------------------------
  noGoal: '还没有目标',
  sharedAcross: '跨会话共享',
  goalLabel: '目标：',
  thisConversation: '本次会话',
  noFocus: '尚未确定本次会话的学习焦点。在下方选择一个节点，即可从这里开始学习。',
  startNoSessionTitle: '请先打开或新建一个会话——导师会在那里回复。',
  startNoSessionBody: '请先打开一个会话。导师在对话中教学，因此没有会话就无法开始一个节点。',
  starting: '正在开始…',
  diagnosisMap: '诊断地图',
  census: (count) => `${count} 个节点`,
  emptyMap: '地图上还没有内容。在对话中说明你的目标，系统会记录它。',
  evidenceCount: (count) => `${count} 条证据`,
  confirmedByEvidence: (confirmed, total) => `共 ${total} 个节点，已由证据确认 ${confirmed} 个。`,

  // ---- selected node ---------------------------------------------------
  loadingMap: '正在加载你的学习地图…',
  nothingSelected: '未选择节点',
  pickNode: '在地图上选择一个节点，这一列会显示与该节点相关的记录，以及它处于当前状态的原因。',
  selectedNode: '已选节点',
  parent: (title) => `上级：${title}`,
  children: (count) => `${count} 个子节点`,
  whereThisSits: '所在位置',
  evidence: '证据',
  nothingRecorded: '还没有记录。',
  teachingNode: '这是导师当前正在教学的节点。教学内容在右侧。',

  // ---- learning surface ------------------------------------------------
  learningSurface: '学习界面',
  lessonOrigin: (origin) => {
    switch (origin) {
      case 'tutor':
        return '导师'
      case 'prototype':
        return '原型'
      default:
        // An origin from a newer runtime is a word we do not own; showing the
        // stored value is more honest than inventing a translation.
        return origin
    }
  },
  preparing: '导师正在准备这个节点…',
  preparingBody: '教学内容会随写随显，对话仍在聊天中继续。',
  nothingTaught: '还没有开始教学',
  pressContinuePrefix: '导师已记录下一步。点击',
  pressContinueSuffix: '，教学内容就会出现在这里，对话仍留在聊天中。',
  pressStartPrefix: '在地图上选择一个节点并点击',
  pressStartSuffix: '。教学内容会出现在这里，对话仍留在聊天中。',
  startLearning: '开始学习',
  answerInChat: '在对话中回答',
  backToNode: '返回节点',
}

/** The standalone panel's copy in the current interface language. */
export function usePanelText(): typeof en {
  return useLang() === 'zh' ? zh : en
}
