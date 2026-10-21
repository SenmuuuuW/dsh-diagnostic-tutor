/**
 * Interface copy for the docked Current-lesson tab.
 *
 * English is the copy this surface already shipped with, unchanged — the table
 * is a move, not an edit. Chinese is the same interface in Simplified Chinese,
 * using the vocabulary the map, lesson and panel surfaces already use: 会话 for
 * a conversation, 导师 for the tutor, 诊断地图 for the map, 证据 for evidence and
 * 课次 for a lesson.
 *
 * Only chrome lives here. Course and node titles, lesson markdown, the model's
 * notes and reasons, and every evidence note are the learner's record and stay
 * exactly as stored. The tab's identity and the copy shared with the other
 * lesson surfaces live in `learning-text.ts` and `lesson-text.ts`.
 *
 * Counts are functions because the two languages put the number in different
 * places; a sentence assembled from a fixed prefix and suffix would read as
 * translated English in one of them.
 */

import { useLang } from './i18n.js'

const en = {
  // ---- the library -----------------------------------------------------
  allLearning: '← All learning',
  yourLearning: 'Your learning',
  nothingHereYet: 'Nothing here yet. Tell the tutor what you want to learn, in the chat.',
  sharedAcrossYourConversations: 'Shared across your conversations',
  confirmedOf: (confirmed: number, total: number): string => `${confirmed} of ${total} confirmed`,
  openLabel: 'Open',
  continueLabel: 'Continue',
  startSomethingNew: 'Start something new',
  startSomethingNewAction: '+ Start something new',

  // ---- starting something new -----------------------------------------
  tellTutorInChat: 'Tell the tutor what you want to learn in Chat.',
  newProjectNote:
    'When the tutor records a goal there, it becomes this conversation’s project. Your other projects are untouched.',
  orContinueOne: 'Or continue one',

  // ---- the missing-skill warning ---------------------------------------
  skillMissingTitle: 'The Universal Diagnostic Tutor skill was not found.',
  skillMissingBody:
    'This panel still records and shows your learning state, but no lesson will be written until the skill is available to your active DSH agent.',

  // ---- the course header -----------------------------------------------
  noGoal: 'No goal yet',
  sharedAcrossConversations: 'Shared across conversations',
  thisConversation: 'This conversation',
  noFocus: 'No learning focus yet. Pick a node below to start learning here.',
  startingCaption:
    'Starting records a focus for this conversation only. Your map and lessons stay shared.',
  loading: 'Loading…',

  // ---- the teaching region ---------------------------------------------
  learningSurface: 'Learning surface',
  preparing: 'The tutor is preparing this node…',
  pressContinue: (label: string): string =>
    `Press ${label} and the teaching appears here, while the chat stays open beside it.`,
  pressStart:
    'Press Start learning and the teaching appears here, while the chat stays open beside it.',

  // ---- the compact map -------------------------------------------------
  diagnosisMap: 'Diagnosis map',
  openMap: 'Open map',
  noMapYet: 'No map yet — state a goal in the chat.',
  confirmedByEvidence: (confirmed: number, total: number): string =>
    `${confirmed} of ${total} confirmed by evidence.`,
  courseRouteAndMap: 'Course route & diagnosis map →',

  // ---- the evidence list -----------------------------------------------
  evidence: 'Evidence',
}

const zh: typeof en = {
  // ---- the library -----------------------------------------------------
  allLearning: '← 全部学习',
  yourLearning: '你的学习',
  nothingHereYet: '这里还没有内容。在对话中告诉导师你想学什么。',
  sharedAcrossYourConversations: '在你的所有会话之间共享',
  confirmedOf: (confirmed, total) => `已确认 ${confirmed} / ${total}`,
  openLabel: '打开',
  continueLabel: '继续',
  startSomethingNew: '开始新的学习',
  startSomethingNewAction: '+ 开始新的学习',

  // ---- starting something new -----------------------------------------
  tellTutorInChat: '在对话中告诉导师你想学什么。',
  newProjectNote: '导师在对话中记录目标后，它就会成为本次会话的项目。你的其他项目不会受到影响。',
  orContinueOne: '或继续一个项目',

  // ---- the missing-skill warning ---------------------------------------
  skillMissingTitle: '未找到 Universal Diagnostic Tutor 技能。',
  skillMissingBody:
    '这个面板仍会记录并显示你的学习状态，但在你的当前 DSH 智能体可以使用该技能之前，不会写入任何课次。',

  // ---- the course header -----------------------------------------------
  noGoal: '还没有目标',
  sharedAcrossConversations: '跨会话共享',
  thisConversation: '本次会话',
  noFocus: '尚未确定本次会话的学习焦点。在下方选择一个节点，即可从这里开始学习。',
  startingCaption: '开始学习只会为本次会话记录一个学习焦点。你的地图和课次仍然共享。',
  loading: '正在加载…',

  // ---- the teaching region ---------------------------------------------
  learningSurface: '学习界面',
  preparing: '导师正在准备这个节点…',
  pressContinue: (label) => `点击“${label}”，教学内容就会出现在这里，对话会一直开在旁边。`,
  pressStart: '点击“开始学习”，教学内容就会出现在这里，对话会一直开在旁边。',

  // ---- the compact map -------------------------------------------------
  diagnosisMap: '诊断地图',
  openMap: '打开地图',
  noMapYet: '地图上还没有内容——在对话中说明你的目标。',
  confirmedByEvidence: (confirmed, total) => `共 ${total} 个节点，已由证据确认 ${confirmed} 个。`,
  courseRouteAndMap: '学习路线与诊断地图 →',

  // ---- the evidence list -----------------------------------------------
  evidence: '证据',
}

/** The docked tab's copy in the current interface language. */
export function useTabText(): typeof en {
  return useLang() === 'zh' ? zh : en
}
