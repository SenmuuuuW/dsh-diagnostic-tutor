/**
 * Interface copy shared by the lesson surfaces that predate the course route:
 * the docked Current-lesson tab, the standalone full-page panel, the next-step
 * card, the handoff line and the welcome feature row.
 *
 * English is the copy those surfaces already shipped with. Chinese is the same
 * interface, not a translation of the learner's content: node titles, lesson
 * markdown and model reasons stay exactly as stored.
 *
 * The tab and the full page keep their own larger tables (`tab-text.ts`,
 * `panel-text.ts`); this module holds only what more than one of them renders.
 */

import { useLang } from './i18n.js'

const en = {
  // ---- sidebar / tab identity ------------------------------------------
  learnLabel: 'Learn',
  learnAria: 'Learn',
  noSessionNotice: 'Open or create a conversation to start learning.',
  tabTitle: 'Current lesson',
  tabTitleFull: 'Current lesson',

  // ---- the next-step card ---------------------------------------------
  nextBestStep: 'Next best step',
  nextPrefix: 'Next:',
  stayOn: (title: string) => `Stay on ${title}`,
  why: 'Why:',
  starting: 'Starting…',

  // ---- the handoff line -----------------------------------------------
  handoffLabel: (phase: string): string => {
    switch (phase) {
      case 'failed':
        return 'Could not reach the tutor'
      case 'lesson-ready':
        return 'Lesson ready'
      case 'stalled':
        return 'The tutor has gone quiet'
      case 'tutor-working':
        return 'Tutor working…'
      case 'tutor-requested':
        return 'Tutor requested…'
      case 'focus-recorded':
        return 'Focus recorded'
      default:
        return phase
    }
  },
  handoffAttempts: (count: number) => `attempt ${count}`,
  askAgain: 'Ask again',

  // ---- the welcome feature row ---------------------------------------
  featureMapTitle: 'Diagnosis map',
  featureMapBody: 'grown one node at a time',
  featureLessonTitle: 'A lesson',
  featureLessonBody: 'written beside the chat',
  featureEvidenceTitle: 'Evidence',
  featureEvidenceBody: 'behind every state',
}

const zh: typeof en = {
  // ---- sidebar / tab identity ------------------------------------------
  learnLabel: '学习',
  learnAria: '学习',
  noSessionNotice: '请先打开或新建一个对话，再开始学习。',
  tabTitle: '当前课次',
  tabTitleFull: '当前课次',

  // ---- the next-step card ---------------------------------------------
  nextBestStep: '下一步建议',
  nextPrefix: '下一步：',
  stayOn: (title) => `继续停留在「${title}」`,
  why: '原因：',
  starting: '正在开始…',

  // ---- the handoff line -----------------------------------------------
  handoffLabel: (phase) => {
    switch (phase) {
      case 'failed':
        return '未能联系到导师'
      case 'lesson-ready':
        return '教学内容已就绪'
      case 'stalled':
        return '导师没有继续响应'
      case 'tutor-working':
        return '导师正在处理…'
      case 'tutor-requested':
        return '已请求导师…'
      case 'focus-recorded':
        return '已记录学习焦点'
      default:
        return phase
    }
  },
  handoffAttempts: (count) => `第 ${count} 次尝试`,
  askAgain: '再问一次',

  // ---- the welcome feature row ---------------------------------------
  featureMapTitle: '诊断地图',
  featureMapBody: '一次只展开一个节点',
  featureLessonTitle: '教学内容',
  featureLessonBody: '写在对话旁边',
  featureEvidenceTitle: '证据',
  featureEvidenceBody: '支撑每一个状态',
}

/** The shared copy in the current interface language. */
export function useLearningText(): typeof en {
  return useLang() === 'zh' ? zh : en
}

/** The docked tab's title, for the tab registry that cannot use a hook. */
export function tabTitleFor(lang: 'en' | 'zh'): string {
  return lang === 'zh' ? zh.tabTitle : en.tabTitle
}

/** Feedback the store returns after an action, in the interface language. */
export interface RuntimeCopy {
  readonly started: string
  readonly unknownReason: string
  readonly focusRecorded: (reason: string) => string
  readonly saved: (name: string) => string
  readonly exportFailed: (reason: string) => string
  readonly everythingDeleted: string
  readonly deleteFailed: (reason: string) => string
}

/**
 * The learner-facing status lines the shared store produces.
 *
 * `use-learning.ts` is not a component, so it cannot subscribe with a hook;
 * it reads the current language when it writes the line. A line already on
 * screen keeps the language it was written in until the next action, which is
 * the same behaviour as a status message anywhere else.
 */
export function runtimeCopy(lang: 'en' | 'zh'): RuntimeCopy {
  if (lang === 'zh') {
    return {
      started: '已开始。导师正在对话中教学本节点，界面会随内容更新。',
      unknownReason: '未知原因',
      focusRecorded: (reason) => `已记录学习焦点，但未能唤醒导师（${reason}）。在对话中说点什么即可继续。`,
      saved: (name) => `已保存 ${name}。`,
      exportFailed: (reason) => `导出失败：${reason}`,
      everythingDeleted: '已删除全部数据。',
      deleteFailed: (reason) => `删除失败：${reason}`,
    }
  }
  return {
    started: 'Started. The tutor is teaching this node in the chat — the surface updates as it writes.',
    unknownReason: 'unknown reason',
    focusRecorded: (reason) => `Focus recorded, but the tutor was not woken (${reason}). Say anything in the chat to continue.`,
    saved: (name) => `Saved ${name}.`,
    exportFailed: (reason) => `Could not export: ${reason}`,
    everythingDeleted: 'Everything was deleted.',
    deleteFailed: (reason) => `Could not delete: ${reason}`,
  }
}
