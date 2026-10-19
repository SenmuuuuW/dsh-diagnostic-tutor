/**
 * Copy for the Learning map page, in both languages this build ships.
 *
 * The map is a reference surface, so its copy is kept in one place instead of
 * being spread through the component: the English strings here are the ones
 * the page has always rendered, and the Chinese strings say the same thing
 * rather than describing a different map.
 *
 * Counts are functions, not placeholders in a template, because the two
 * languages put the number in different places. A sentence assembled from a
 * fixed prefix and suffix would read as translated English in one of them.
 *
 * Data is deliberately absent: course and node titles, goals, notes, IDs and
 * timestamps are the learner's record and stay exactly as stored.
 */

import { type Lang, useLang } from './i18n.js'

const en = {
  pageTitle: 'Learning map',
  mapViews: 'Learning map views',
  noProject: 'no project open',
  openLearning: 'Open learning view',
  backToChat: 'Back to the conversation',
  courseRoute: 'Course route',
  knowledgeEvidence: 'Knowledge & evidence',

  emptyMap: 'Nothing on the map yet. State a goal in the chat.',
  loadingMap: 'Loading your map…',
  nothingSelected: 'Nothing selected',
  pickNode:
    'Pick a node on the left and this column shows what is recorded against it, and why it is in that state.',
  selectedNode: 'Selected node',
  whereThisSits: 'Where this sits',
  evidence: (n: number) => `Evidence ${n}`,
  nothingRecorded: 'Nothing recorded yet.',
  teachingNode: 'This is the node the tutor is teaching.',

  welcomeTitle: 'Nothing to map yet.',
  welcomeBody:
    'State a goal in the chat and the tutor will grow the diagnosis map here, one diagnosed node at a time.',
  orOpenProject: 'Or open a project',
  confirmedOf: (n: number, m: number) => `${n} of ${m} confirmed`,
  goToChat: 'Go to the chat',

  evidenceCount: (n: number) => `${n} evidence`,
  parent: (title: string) => `parent: ${title}`,
  children: (n: number) => `${n} children`,

  diagnosisMap: 'Diagnosis map',
  sharedAcrossConversations: 'Shared across conversations',
  goalLabel: 'Goal:',
  thisConversation: 'This conversation',
  noFocus: 'No focus yet. Pick a node below to start learning here.',
  census: (n: number) => `${n} nodes`,
  confirmedByEvidence: (n: number) => `${n} confirmed by evidence`,
  mapGrowth:
    'The map grows only as diagnosis reveals something. A node moves off its born state because evidence was recorded, never because it was listed.',
}

const zh: typeof en = {
  pageTitle: '学习地图',
  mapViews: '学习地图视图',
  noProject: '未打开项目',
  openLearning: '打开学习视图',
  backToChat: '返回会话',
  courseRoute: '学习路线',
  knowledgeEvidence: '知识与证据',

  emptyMap: '地图上还没有内容。在对话中说明你的目标。',
  loadingMap: '正在加载你的学习地图…',
  nothingSelected: '未选择节点',
  pickNode: '在左侧选择一个节点，这里会显示与该节点相关的记录，以及它处于当前状态的原因。',
  selectedNode: '已选节点',
  whereThisSits: '所在位置',
  evidence: (n: number) => `证据 ${n}`,
  nothingRecorded: '还没有记录。',
  teachingNode: '这是导师当前正在教学的节点。',

  welcomeTitle: '还没有可绘制的内容。',
  welcomeBody:
    '在对话中说明目标，导师会在这里逐步展开诊断地图，每次加入一个经过诊断的节点。',
  orOpenProject: '或打开一个项目',
  confirmedOf: (n: number, m: number) => `已确认 ${n} / ${m}`,
  goToChat: '前往对话',

  evidenceCount: (n: number) => `${n} 条证据`,
  parent: (title: string) => `上级：${title}`,
  children: (n: number) => `${n} 个子节点`,

  diagnosisMap: '诊断地图',
  sharedAcrossConversations: '跨会话共享',
  goalLabel: '目标：',
  thisConversation: '本次会话',
  noFocus: '尚未确定本会话的学习节点。在下方选择一个节点，即可从这里开始学习。',
  census: (n: number) => `${n} 个节点`,
  confirmedByEvidence: (n: number) => `已由证据确认 ${n} 个`,
  mapGrowth:
    '地图只会随着诊断的发现而扩展。节点之所以会离开初始状态，是因为记录了证据，而不是因为被列在地图上。',
}

/** The map's copy in the current interface language. */
export function useMapText(): typeof en {
  return useLang() === 'zh' ? zh : en
}

/** The seven node states, as a word a learner can read. */
export function stateLabel(state: string, lang: Lang): string {
  if (lang === 'zh') {
    switch (state) {
      case 'unconfirmed':
        return '未确认'
      case 'explained':
        return '已讲解'
      case 'practiced':
        return '已练习'
      case 'checked':
        return '已检查'
      case 'weak':
        return '薄弱'
      case 'blocked':
        return '受阻'
      case 'confirmed':
        return '已确认'
      default:
        return state
    }
  }
  // English already displays the stored word, unchanged.
  return state
}

/** The kinds of observation that can be recorded against a node. */
export function evidenceKindLabel(kind: string, lang: Lang): string {
  if (lang === 'zh') {
    switch (kind) {
      case 'goal-stated':
        return '目标陈述'
      case 'diagnosis':
        return '诊断'
      case 'explanation':
        return '讲解'
      case 'practice':
        return '练习'
      case 'check':
        return '检查'
      case 'transfer':
        return '迁移'
      default:
        // An unrecognised kind is data from a newer runtime, not copy we own;
        // showing it unhyphenated is more honest than inventing a translation.
        return kind.replace(/-/g, ' ')
    }
  }
  switch (kind) {
    case 'goal-stated':
      return 'goal stated'
    case 'diagnosis':
      return 'diagnosis'
    case 'explanation':
      return 'explanation'
    case 'practice':
      return 'practice'
    case 'check':
      return 'check'
    case 'transfer':
      return 'transfer'
    default:
      return kind.replace(/-/g, ' ')
  }
}

/** The readiness a tutor recorded alongside an observation. */
export function readinessLabel(readiness: string, lang: Lang): string {
  if (lang === 'zh') {
    switch (readiness) {
      case 'advance':
        return '可以继续'
      case 'advance-with-caution':
        return '谨慎继续'
      case 'review-first':
        return '先复习'
      case 'step-down':
        return '回退一步'
      case 'diagnose-again':
        return '重新诊断'
      case 'more-practice':
        return '继续练习'
      default:
        return readiness.replace(/-/g, ' ')
    }
  }
  switch (readiness) {
    case 'advance':
      return 'advance'
    case 'advance-with-caution':
      return 'advance with caution'
    case 'review-first':
      return 'review first'
    case 'step-down':
      return 'step down'
    case 'diagnose-again':
      return 'diagnose again'
    case 'more-practice':
      return 'more practice'
    default:
      return readiness.replace(/-/g, ' ')
  }
}
