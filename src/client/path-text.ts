/**
 * Copy for the course-path page, in the two interface languages this build
 * ships.
 *
 * `en` is the source of truth: every string here is the copy the page already
 * renders, unchanged. `zh` is typed `typeof en`, so a missing or renamed key is
 * a type error rather than an English string leaking into the Chinese UI.
 *
 * Only interface copy lives here. Route, module and lesson titles, summaries,
 * overviews, outcomes, outline lines, practice and assessment text, goal-brief
 * text, topics, IDs and node titles are learner/tutor content from props and
 * are never translated.
 *
 * Pure helpers in `path-page.tsx` receive the text object (or `lang`) as a
 * parameter; only components may call `usePathText()`.
 */

import { useLang } from './i18n.js'

/** The goal-brief fields the time-plan sentence renders. */
interface TimePlanBrief {
  targetDate: string | null
  timeZone: string
  durationWeeks: number | null
  deadline: 'none' | 'flexible' | 'fixed'
  weeklyMinutes: number | null
  sessionMinutes: number | null
}

const en = {
  // Page shell and header.
  pageLabel: (title: string) => `${title} curriculum`,
  learningPath: 'Learning path',
  learningPathIntro: 'A complete route to browse, with teaching and checks one lesson at a time.',
  projectOverview: 'Project Overview',
  goalAndTimeSettings: 'Goal and time settings',
  backToConversation: 'Back to conversation',
  readOnlyNotice: 'Browsing only. Open a conversation with this project selected to save a goal, request the tutor, accept a route, or start a lesson.',
  updatesPaused: 'Updates paused: ',
  couldNotLoadPath: 'Could not load this path: ',
  retryLoading: 'Retry loading',
  requestSavedTutorUnreached: 'The request was saved, but the tutor was not reached: ',
  previousRequestFailed: (kind: 'plan' | 'diagnosis') => `The previous ${kind === 'plan' ? 'route' : 'diagnosis'} request did not reach the tutor:`,
  retryTutorRequest: 'Retry tutor request',
  retryTutorHelp: 'Retry sends a new operation only when you click.',
  loadingPath: 'Loading the saved learning path…',
  unsavedKept: 'Your unsaved goal edits are kept on this page.',
  returnToDraft: 'Return to goal draft',
  noReason: 'No reason supplied.',
  tutorUnreachable: 'The tutor could not be reached.',
  staleProjectError: 'This project changed in another conversation. The latest version has been refreshed; your unsaved goal edits are kept. Review it and click your action again.',
  requestFailed: 'The request could not be completed.',

  // Status vocabularies.
  attemptStatus: (status: 'requested' | 'working' | 'completed' | 'interrupted'): string => status,
  assessmentStatus: (status: 'in-progress' | 'ready' | 'skipped'): string => status,
  nodeState: (state: string): string => state,
  edgeKind: (kind: 'required' | 'optional'): string => kind,
  statusPlanned: 'Planned · overview available',
  statusCurrent: (status: string) => `Current · ${status}`,
  statusCompletedAttempt: 'Completed attempt',
  statusInterruptedAttempt: 'Interrupted attempt',
  currentAttemptSuffix: ' · current attempt',

  // Goal-brief validation.
  wholeNumber: (label: string, min: number, max: number) => `${label} must be a whole number from ${min} to ${max}, or left blank.`,
  invalidTimeZone: 'Enter a valid IANA time zone, such as America/New_York or UTC.',
  timeZoneRequired: 'Choose a time zone before saving.',
  invalidTargetDate: 'Choose a valid target date, or select No deadline.',
  durationRequired: 'Enter a duration in weeks, or select No deadline.',
  outcomeLimits: 'Use up to 20 outcomes, with at most 2,000 characters each.',

  // Durations and small shared fragments.
  durationMinutes: (value: number) => `${value} min`,
  durationHours: (value: number) => `${value} h`,
  notRecorded: 'Not recorded yet.',
  evidence: (index: number) => `evidence ${index}`,

  // Goal wizard.
  wizardLabel: 'Learning goal wizard',
  wizardEyebrow: 'Your goal and time',
  wizardTitle: 'Build a route around what you want to do',
  closeWizard: 'Close wizard',
  wizardIntro: 'Save at any step. You can leave your purpose, outcomes, background, budget, and preferences unfinished.',
  wizardRecovered: 'Saved goal draft recovered from this project.',
  wizardStepsLabel: 'Goal wizard steps',
  wizardSteps: ['Goal', 'Background', 'Time', 'Preferences'],
  purposeLabel: 'What will you use this for?',
  purposePlaceholder: 'A work project, exam, interview, or something you want to understand…',
  purposeHelp: 'The situation and why it matters to you. You can decide later.',
  outcomesLabel: 'What should you be able to do?',
  outcomesPlaceholder: 'One observable outcome per line, such as implement a model and explain its errors.',
  outcomesHelp: 'Describe something you could explain, solve, build, or apply. Blank is fine for a draft.',
  backgroundLabel: 'What have you already studied or tried?',
  backgroundPlaceholder: 'What feels familiar? What is difficult or uncertain?',
  backgroundHelp: 'This is your self-report. The tutor will distinguish it from observed evidence.',
  targetTimeLabel: 'Target time',
  timeNone: 'No deadline / not sure yet',
  timeDate: 'A target date',
  timeWeeks: 'A number of weeks',
  timeZoneLabel: 'Time zone',
  timeZonePlaceholder: 'America/New_York',
  timeZoneHelp: 'IANA time zone; saved alongside your date.',
  targetDateLabel: 'Target date',
  durationWeeksLabel: 'Duration in weeks',
  durationWeeksPlaceholder: 'For example, 8',
  deadlineLabel: 'How firm is this time?',
  deadlineFlexible: 'Flexible target',
  deadlineFixed: 'Fixed deadline',
  weeklyMinutesField: 'Minutes available each week',
  weeklyMinutesErrorLabel: 'Weekly minutes',
  notSureYet: 'Not sure yet',
  weeklyHelp: 'Include practice and review.',
  sessionMinutesField: 'Preferred minutes per session',
  sessionMinutesErrorLabel: 'Session minutes',
  preferencesLabel: 'Materials, language, scope, and learning preferences',
  preferencesPlaceholder: 'Topics to include, a textbook you use, preferred language, or the kinds of practice you want…',
  back: 'Back',
  next: 'Next',
  saving: 'Saving…',
  saveDraft: 'Save draft',
  saveAndClose: 'Save and close',
  unsavedChanges: 'Unsaved changes',
  savedToProject: 'Saved to this project',
  draftNotSaved: 'Draft not saved yet',
  saveReadOnly: 'Open a conversation with this project selected to save your goal.',

  // Initial diagnosis.
  initialDiagnosis: 'Initial diagnosis',
  assessmentNotRequested: 'Not requested',
  assessmentSkipped: 'You chose to skip the initial assessment. Some foundations remain unverified; the route should make those assumptions visible.',
  strengths: 'Strengths',
  gaps: 'Gaps',
  uncertainties: 'Uncertainties',
  noStrengths: 'No strengths recorded yet.',
  noGaps: 'No gaps recorded yet.',
  noUncertainties: 'No uncertainties recorded yet.',
  evidenceReferences: 'Evidence references',
  assessmentHelp: 'The tutor uses your answers and existing evidence to choose a useful starting point. Background notes are self-reports until checked.',
  diagnosisWaiting: 'Diagnosis requested. Waiting for the tutor in your conversation.',
  diagnosisNeedsGoal: 'Save a purpose and at least one observable outcome before requesting diagnosis.',
  diagnosisNeedsSave: 'Save your goal edits before requesting the tutor.',
  requestDiagnosisAgain: 'Request diagnosis again',
  requestNewDiagnosis: 'Request a new diagnosis',
  requestDiagnosis: 'Request diagnosis',
  skipAssessment: 'Skip initial assessment',
  assessmentSkippedNotice: 'Initial assessment explicitly skipped. The route will retain unverified assumptions.',
  assessmentStale: 'The previous assessment belongs to an earlier goal draft. Request a new diagnosis or explicitly skip for the current goal.',

  // Route canvas and ordered list.
  routeCanvasLabel: 'Curriculum route and lesson list',
  searchLessonsLabel: 'Search curriculum lessons',
  searchPlaceholder: 'Search lessons or topics',
  zoomOutLabel: 'Zoom out curriculum',
  zoomInLabel: 'Zoom in curriculum',
  fitRoute: 'Fit route',
  currentLesson: 'Current lesson',
  canvasHelp: 'Drag the canvas to pan. Focus the canvas and use arrow keys to pan, plus or minus to zoom, or Home to fit. Every lesson is also available in the ordered list below.',
  canvasLabel: 'Curriculum route canvas',
  edgesLabel: 'Directed prerequisite connections; solid lines are required and dashed lines are optional',
  edgeTitle: (kind: string, from: string | undefined, to: string | undefined) => `${kind} prerequisite: ${from} to ${to}`,
  expand: 'Expand',
  collapse: 'Collapse',
  moduleToggle: (collapsed: boolean, title: string | undefined) => `${collapsed ? 'Expand' : 'Collapse'} module ${title}`,
  overviewLesson: (index: number, title: string) => `Overview lesson ${index}: ${title}`,
  requiredPrerequisite: 'Required prerequisite →',
  optionalPrerequisite: 'Optional prerequisite →',
  lessonOrderLegend: 'Numbers show recommended lesson order',
  expandAllModules: 'Expand all modules',
  collapseAllModules: 'Collapse all modules',
  allOverviews: 'All lesson Overviews',
  allOverviewsHelp: 'Browse any lesson. Opening an Overview keeps your current lesson in place.',
  matchingLessons: (count: number) => `${count} matching ${count === 1 ? 'lesson' : 'lessons'}. The list includes results from collapsed modules.`,
  lessonListLabel: 'Curriculum lesson list',
  browseLesson: (index: number, title: string) => `Browse lesson ${index}: ${title}`,

  // Attempt history.
  historyLabel: 'Lesson attempt history',
  historyTitle: 'Lesson attempts and saved teaching units',
  noAttempts: 'No lesson attempts recorded in this conversation.',
  savedUnits: (count: number) => `${count} saved ${count === 1 ? 'unit' : 'units'}`,
  attemptLabel: 'Attempt',
  attemptWord: 'attempt',
  lessonLabel: 'lesson',
  knowledgeLabel: 'knowledge',
  tutorNotReached: 'Tutor was not reached:',
  snapshot: (id: string) => `snapshot ${id}`,
  savedAt: 'Saved',
  lessonReference: 'lesson reference',
  nodeLabel: 'node',

  // Lesson detail.
  lessonOf: (index: number, total: number) => `Lesson ${index} of ${total}`,
  version: (version: number) => `version ${version}`,
  routeVersion: (version: number) => `Route version ${version}`,
  lessonIdLabel: 'Lesson ID:',
  estimatedEffortTitle: 'Estimated effort',
  estimatedEffortLabel: 'estimated effort',
  learnOutcomes: 'What you should be able to do',
  lessonOutline: 'Lesson outline',
  practice: 'Practice',
  assessmentHeading: 'Assessment',
  prerequisites: 'Prerequisites',
  noPrerequisites: 'No prerequisite lessons specified.',
  somePrerequisitesIncomplete: 'Some prerequisite lessons have no completed attempt. You can browse freely; ask the tutor for a short check if you want to begin here.',
  linkedKnowledge: 'Linked knowledge',
  notDiagnosed: 'Not yet diagnosed',
  noLinkedNodes: 'No diagnosed knowledge nodes linked yet.',
  plannedTopics: (topics: string) => `Planned topics: ${topics}. Planning a topic does not establish its knowledge state.`,
  overviewBeforeTeaching: 'This Overview is available before teaching content exists. Teaching units are written when you start the lesson.',
  acceptToStart: 'Accept this route to start its lessons. You can continue browsing every Overview.',
  startReadOnly: 'Open a conversation with this project selected to start or review a lesson.',
  continueLesson: 'Continue lesson',
  startLesson: 'Start lesson',
  reviewLesson: 'Review lesson',
  previousOverview: 'Previous Overview',
  nextOverview: 'Next Overview',

  // Module detail.
  moduleOverview: (version: number) => `Module Overview · version ${version}`,
  lessons: (count: number) => `${count} lessons`,
  moduleOutcomes: 'Module outcomes',
  milestoneAssessment: 'Milestone assessment',
  crossModulePrerequisites: 'Prerequisite lessons from other modules',
  noCrossModulePrerequisites: 'No cross-module prerequisite lessons specified.',
  lessonOverviews: 'Lesson Overviews',

  // Project detail.
  projectOverviewVersion: (version: number) => `Project Overview · version ${version}`,
  acceptedRoute: 'Accepted route',
  previouslyAcceptedRoute: 'Previously accepted route',
  draftRoute: 'Draft route',
  plannedLessons: 'planned lessons',
  completedAttemptLessons: 'lessons with a completed attempt',
  intendedOutcomes: 'Your intended outcomes',
  timePlan: (brief: TimePlanBrief | null): string => [
    brief?.targetDate
      ? `Target ${brief.targetDate} (${brief.timeZone}); ${brief.deadline} deadline.`
      : brief?.durationWeeks
        ? `${brief.durationWeeks} weeks; ${brief.deadline} target.`
        : 'No deadline selected.',
    brief?.weeklyMinutes ? `${brief.weeklyMinutes} minutes per week.` : 'Weekly budget not specified.',
    brief?.sessionMinutes ? `${brief.sessionMinutes} minutes per session preferred.` : '',
  ].filter(Boolean).join(' '),
  timePlanHeading: 'Time plan',
  planningAssumptions: 'Planning assumptions',
  noAssumptions: 'No planning assumptions recorded.',
  whyVersion: 'Why this version was proposed',
  modulesAndMilestones: 'Modules and milestones',
  browseFirstLesson: 'Browse the first lesson',
  browseCurrentLesson: 'Browse your current lesson',
  completedNote: 'Completed attempts describe recorded activity. Knowledge states depend on evidence; estimated time does not promise mastery.',

  // Pinned lesson card.
  pinnedLessonLabel: 'Current pinned lesson',
  pinnedAttemptEyebrow: 'This conversation\'s pinned attempt',
  newerAcceptedRoute: (accepted: number, attempt: number) => `The accepted route is now version ${accepted}. This conversation remains on version ${attempt} until you explicitly start a lesson from another route.`,
  viewPinnedOverview: 'View pinned lesson Overview',
  browseAcceptedVersion: (version: number) => `Browse accepted version ${version}`,
  openCurrentConversation: 'Open current conversation',
  pinnedRequestFailed: 'The pinned lesson request did not reach the tutor:',
  retryCurrentLesson: 'Retry current lesson request',

  // Knowledge reference.
  knowledgeReferenceLabel: 'Linked knowledge evidence reference',
  closeKnowledgeReference: 'Close knowledge reference',
  evidenceEntries: (count: number) => `${count} recorded evidence entries`,
  knowledgeIdLabel: 'Knowledge ID:',
  knowledgeIdHelp: '. Open the Knowledge tab to inspect the recorded observations. A curriculum topic alone does not confirm understanding.',

  // Route proposals.
  routeProposalsLabel: 'Route proposals',
  routeVersions: 'Route versions',
  buildRoute: 'Build your curriculum route',
  waitingProposal: 'Waiting for a tutor proposal',
  noVersionsHelp: 'Save your goal, then complete or explicitly skip the initial diagnosis. The tutor can propose a complete outline with every lesson Overview before the lesson bodies are written.',
  needsAssessmentHelp: 'The current goal needs an assessment or your explicit skip before a plan can be requested.',
  routeToBrowse: 'Route to browse',
  routeVersionToBrowse: 'Route version to browse',
  versionOption: (version: number, accepted: boolean, previouslyAccepted: boolean, title: string) => `Version ${version} · ${accepted ? 'accepted' : previouslyAccepted ? 'previously accepted' : 'draft'} · ${title}`,
  requestPlanAgain: 'Request plan again',
  requestRevisedPlan: 'Request a revised plan',
  requestRouteProposal: 'Request a route proposal',
  acceptRouteVersion: (version: number) => `Accept route version ${version}`,
  routeAcceptedNotice: (version: number) => `Route version ${version} accepted. Start a lesson explicitly when ready.`,
  routeAcceptedHelp: 'This route is accepted. Lesson starts remain your choice.',
  routeProposalHelp: 'Browsing a proposal does not accept it or start a lesson.',
  routeRevisionWarning: ' This version was based on an earlier goal or assessment; request a revision before accepting it.',
  newerDraftHelp: 'A newer draft is available in the version selector. Your current view and attempt have been kept.',

  // Effort and capacity.
  capacityLabel: 'Estimated effort and available capacity',
  capacityTitle: (range: string) => `Estimated effort: ${range}`,
  capacityNeedBudget: 'Add a weekly budget and a target date or duration to compare available time.',
  capacityAvailable: (minutes: string) => `Approximate available budget: ${minutes} in your selected time window.`,
  capacityNote: 'Estimates include the planned lessons; time alone does not establish mastery.',
  conflictMinimum: 'The minimum estimated effort exceeds your available time.',
  conflictMaximum: 'The upper estimate exceeds your available time.',
  conflictAdvice: 'You can adjust scope, extend the timeline, increase available time, or ask the tutor for an adjusted proposal.',
  editGoalScope: 'Edit goal or scope',
  editTimeBudget: 'Edit time budget',
  requestAdjustedPlan: 'Request an adjusted plan',

  // Empty route and shared actions.
  routeEmptyEyebrow: 'Your route will appear here',
  tutorPreparing: 'The tutor is preparing a proposal',
  noCurriculum: 'No curriculum has been proposed yet',
  routeEmptyHelp: 'Existing knowledge and teaching remain available from the Knowledge tab and conversation.',
  openConversation: 'Open conversation',
  askNeedsGoal: 'Save your purpose and observable outcomes before requesting the tutor.',
  askNeedsAssessment: 'Complete or explicitly skip the assessment for the saved goal before requesting a plan.',
  requestSent: (kind: 'plan' | 'diagnosis') => `${kind === 'plan' ? 'Route proposal' : 'Diagnosis'} request sent to the tutor in your conversation.`,
  lessonRequested: 'Lesson requested in your conversation.',
  goalSaved: 'Goal draft saved. You can request diagnosis when you are ready.',
  draftSaved: 'Incomplete goal draft saved. Return to add your purpose and observable outcomes when ready.',
}

const zh: typeof en = {
  // Page shell and header.
  pageLabel: (title) => `${title}课程大纲`,
  learningPath: '学习路线',
  learningPathIntro: '完整的学习路线，可逐课次浏览，并以课次为单位进行教学与检查。',
  projectOverview: '项目总览',
  goalAndTimeSettings: '目标与时间设置',
  backToConversation: '返回对话',
  readOnlyNotice: '仅供浏览。请打开已选中此项目的对话，以保存目标、请求导师、接受学习路线或开始课次。',
  updatesPaused: '更新已暂停：',
  couldNotLoadPath: '无法加载此学习路线：',
  retryLoading: '重新加载',
  requestSavedTutorUnreached: '请求已保存，但未能联系到导师：',
  previousRequestFailed: (kind) => `之前的${kind === 'plan' ? '学习路线' : '初诊'}请求未能送达导师：`,
  retryTutorRequest: '重试导师请求',
  retryTutorHelp: '仅当你点击时，重试才会发送新操作。',
  loadingPath: '正在加载已保存的学习路线…',
  unsavedKept: '你尚未保存的目标修改会保留在此页面上。',
  returnToDraft: '返回目标草稿',
  noReason: '未提供原因。',
  tutorUnreachable: '无法联系到导师。',
  staleProjectError: '此项目在另一个对话中发生了更改。已刷新到最新版本；你尚未保存的目标修改已保留。请查看后再次点击你的操作。',
  requestFailed: '无法完成此请求。',

  // Status vocabularies.
  attemptStatus: (status) => {
    switch (status) {
      case 'requested': return '已请求'
      case 'working': return '进行中'
      case 'completed': return '已完成'
      case 'interrupted': return '已中断'
      default: return status
    }
  },
  assessmentStatus: (status) => {
    switch (status) {
      case 'in-progress': return '进行中'
      case 'ready': return '已就绪'
      case 'skipped': return '已跳过'
      default: return status
    }
  },
  nodeState: (state) => {
    switch (state) {
      case 'unconfirmed': return '未确认'
      case 'explained': return '已讲解'
      case 'practiced': return '已练习'
      case 'checked': return '已检查'
      case 'weak': return '薄弱'
      case 'blocked': return '受阻'
      case 'confirmed': return '已确认'
      default: return state
    }
  },
  edgeKind: (kind) => kind === 'required' ? '必修' : '选修',
  statusPlanned: '已计划 · 可查看课次概览',
  statusCurrent: (status) => `当前 · ${status}`,
  statusCompletedAttempt: '已完成尝试',
  statusInterruptedAttempt: '已中断尝试',
  currentAttemptSuffix: ' · 当前尝试',

  // Goal-brief validation.
  wholeNumber: (label, min, max) => `${label}必须是从 ${min} 到 ${max} 的整数，或留空。`,
  invalidTimeZone: '请输入有效的 IANA 时区，例如 America/New_York 或 UTC。',
  timeZoneRequired: '保存前请选择时区。',
  invalidTargetDate: '请选择有效的目标日期，或选择“没有截止日期”。',
  durationRequired: '请输入持续周数，或选择“没有截止日期”。',
  outcomeLimits: '最多 20 个学习成果，每个不超过 2,000 个字符。',

  // Durations and small shared fragments.
  durationMinutes: (value) => `${value} 分钟`,
  durationHours: (value) => `${value} 小时`,
  notRecorded: '尚未记录。',
  evidence: (index) => `证据 ${index}`,

  // Goal wizard.
  wizardLabel: '学习目标向导',
  wizardEyebrow: '你的目标与时间',
  wizardTitle: '围绕你想做的事构建学习路线',
  closeWizard: '关闭向导',
  wizardIntro: '可在任一步骤保存。目的、学习成果、背景、时间预算和偏好都可以稍后再补。',
  wizardRecovered: '已从此项目恢复保存的目标草稿。',
  wizardStepsLabel: '目标向导步骤',
  wizardSteps: ['目标', '背景', '时间', '偏好'],
  purposeLabel: '你打算用它做什么？',
  purposePlaceholder: '工作项目、考试、面试，或你一直想弄明白的某个问题…',
  purposeHelp: '说明你的情况和它为什么重要。也可以稍后再决定。',
  outcomesLabel: '你希望能做到什么？',
  outcomesPlaceholder: '每行一个可观察的学习成果，例如实现一个模型并解释它的误差。',
  outcomesHelp: '描述你可以解释、解决、构建或应用的内容。草稿阶段留空也可以。',
  backgroundLabel: '你已经学过或尝试过什么？',
  backgroundPlaceholder: '哪些内容比较熟悉？哪些地方困难或不确定？',
  backgroundHelp: '这是你的自述。导师会将它与观察到的事实证据区分开。',
  targetTimeLabel: '目标时间',
  timeNone: '没有截止日期 / 尚未确定',
  timeDate: '指定目标日期',
  timeWeeks: '指定周数',
  timeZoneLabel: '时区',
  timeZonePlaceholder: 'America/New_York',
  timeZoneHelp: 'IANA 时区；会与你的日期一起保存。',
  targetDateLabel: '目标日期',
  durationWeeksLabel: '持续周数',
  durationWeeksPlaceholder: '例如 8',
  deadlineLabel: '这个时间有多严格？',
  deadlineFlexible: '灵活目标',
  deadlineFixed: '固定截止日期',
  weeklyMinutesField: '每周可用分钟数',
  weeklyMinutesErrorLabel: '每周分钟数',
  notSureYet: '尚未确定',
  weeklyHelp: '请包含练习和复习。',
  sessionMinutesField: '每次倾向的分钟数',
  sessionMinutesErrorLabel: '每次分钟数',
  preferencesLabel: '材料、语言、范围和学习偏好',
  preferencesPlaceholder: '希望包含的主题、使用的教材、偏好语言，或你想要的练习类型…',
  back: '上一步',
  next: '下一步',
  saving: '保存中…',
  saveDraft: '保存草稿',
  saveAndClose: '保存并关闭',
  unsavedChanges: '有未保存的更改',
  savedToProject: '已保存到此项目',
  draftNotSaved: '草稿尚未保存',
  saveReadOnly: '请打开已选中此项目的对话以保存目标。',

  // Initial diagnosis.
  initialDiagnosis: '初诊',
  assessmentNotRequested: '未请求',
  assessmentSkipped: '你选择了跳过初诊。部分基础仍未验证；学习路线应让这些假设保持可见。',
  strengths: '优势',
  gaps: '差距',
  uncertainties: '不确定之处',
  noStrengths: '尚无优势记录。',
  noGaps: '尚无差距记录。',
  noUncertainties: '尚无不确定事项记录。',
  evidenceReferences: '证据引用',
  assessmentHelp: '导师会根据你的回答和已有证据选择有用的起点。在核实之前，背景说明只是你的自述。',
  diagnosisWaiting: '已请求初诊。正在等待对话中的导师。',
  diagnosisNeedsGoal: '请求初诊前，请先保存目的和至少一个可观察的学习成果。',
  diagnosisNeedsSave: '请求导师前，请先保存目标修改。',
  requestDiagnosisAgain: '再次请求初诊',
  requestNewDiagnosis: '请求新的初诊',
  requestDiagnosis: '请求初诊',
  skipAssessment: '跳过初诊',
  assessmentSkippedNotice: '已明确跳过初诊。学习路线将保留尚未验证的假设。',
  assessmentStale: '先前的初诊属于更早的目标草稿。请为当前目标请求新的初诊，或明确跳过。',

  // Route canvas and ordered list.
  routeCanvasLabel: '学习路线与课次列表',
  searchLessonsLabel: '搜索课次',
  searchPlaceholder: '搜索课次或主题',
  zoomOutLabel: '缩小学习路线画布',
  zoomInLabel: '放大学习路线画布',
  fitRoute: '适应整条路线',
  currentLesson: '当前课次',
  canvasHelp: '拖动画布可平移。聚焦画布后，用方向键平移，用加号或减号缩放，或按 Home 键适应整条路线。下方按顺序列出了全部课次。',
  canvasLabel: '学习路线画布',
  edgesLabel: '有向先修关系；实线表示必修，虚线表示选修',
  edgeTitle: (kind, from, to) => `${kind}先修：${from} → ${to}`,
  expand: '展开',
  collapse: '收起',
  moduleToggle: (collapsed, title) => `${collapsed ? '展开' : '收起'}模块 ${title}`,
  overviewLesson: (index, title) => `课次概览（第 ${index} 课）：${title}`,
  requiredPrerequisite: '必修先修 →',
  optionalPrerequisite: '选修先修 →',
  lessonOrderLegend: '数字表示推荐的课次顺序',
  expandAllModules: '展开全部模块',
  collapseAllModules: '收起全部模块',
  allOverviews: '全部课次概览',
  allOverviewsHelp: '可浏览任意课次。打开课次概览不会改变当前课次。',
  matchingLessons: (count) => `找到 ${count} 个匹配课次。列表中也包含已收起模块内的结果。`,
  lessonListLabel: '课次列表',
  browseLesson: (index, title) => `浏览第 ${index} 课：${title}`,

  // Attempt history.
  historyLabel: '课次尝试历史',
  historyTitle: '课次尝试与已保存的教学单元',
  noAttempts: '本次对话中尚无课次尝试记录。',
  savedUnits: (count) => `${count} 个已保存单元`,
  attemptLabel: '尝试',
  attemptWord: '尝试',
  lessonLabel: '课次',
  knowledgeLabel: '知识',
  tutorNotReached: '未能联系到导师：',
  snapshot: (id) => `快照 ${id}`,
  savedAt: '保存于',
  lessonReference: '课次引用',
  nodeLabel: '节点',

  // Lesson detail.
  lessonOf: (index, total) => `第 ${index} 课，共 ${total} 课`,
  version: (version) => `版本 ${version}`,
  routeVersion: (version) => `学习路线版本 ${version}`,
  lessonIdLabel: '课次 ID：',
  estimatedEffortTitle: '预估用时',
  estimatedEffortLabel: '预估用时',
  learnOutcomes: '你应能做到什么',
  lessonOutline: '课次大纲',
  practice: '练习',
  assessmentHeading: '评估',
  prerequisites: '先修',
  noPrerequisites: '未指定先修课次。',
  somePrerequisitesIncomplete: '部分先修课次还没有已完成的尝试。你可以自由浏览；如果希望从这里开始，可以请导师做一次简短检查。',
  linkedKnowledge: '关联知识',
  notDiagnosed: '尚未诊断',
  noLinkedNodes: '尚未关联已诊断的知识节点。',
  plannedTopics: (topics) => `计划主题：${topics}。计划一个主题并不代表已确认其知识状态。`,
  overviewBeforeTeaching: '本课次概览在教学内容生成前即可查看。教学单元会在你开始课次后写入。',
  acceptToStart: '接受此学习路线后即可开始其课次。你仍然可以浏览所有课次概览。',
  startReadOnly: '请打开已选中此项目的对话，以开始或复习课次。',
  continueLesson: '继续课次',
  startLesson: '开始课次',
  reviewLesson: '复习课次',
  previousOverview: '上一课次概览',
  nextOverview: '下一课次概览',

  // Module detail.
  moduleOverview: (version) => `模块总览 · 版本 ${version}`,
  lessons: (count) => `${count} 个课次`,
  moduleOutcomes: '模块学习成果',
  milestoneAssessment: '里程碑评估',
  crossModulePrerequisites: '来自其他模块的先修课次',
  noCrossModulePrerequisites: '未指定跨模块的先修课次。',
  lessonOverviews: '课次概览',

  // Project detail.
  projectOverviewVersion: (version) => `项目总览 · 版本 ${version}`,
  acceptedRoute: '已接受的学习路线',
  previouslyAcceptedRoute: '此前已接受的学习路线',
  draftRoute: '学习路线草稿',
  plannedLessons: '计划课次',
  completedAttemptLessons: '有已完成尝试的课次',
  intendedOutcomes: '你期望的学习成果',
  timePlan: (brief) => [
    brief?.targetDate
      ? `目标日期 ${brief.targetDate}（${brief.timeZone}）；截止日期${brief.deadline === 'fixed' ? '固定' : '灵活'}。`
      : brief?.durationWeeks
        ? `${brief.durationWeeks} 周；目标${brief.deadline === 'fixed' ? '固定' : '灵活'}。`
        : '未选择截止日期。',
    brief?.weeklyMinutes ? `每周 ${brief.weeklyMinutes} 分钟。` : '未指定每周时间预算。',
    brief?.sessionMinutes ? `希望每次 ${brief.sessionMinutes} 分钟。` : '',
  ].filter(Boolean).join(''),
  timePlanHeading: '时间计划',
  planningAssumptions: '规划假设',
  noAssumptions: '尚无规划假设记录。',
  whyVersion: '提出此版本的原因',
  modulesAndMilestones: '模块与里程碑',
  browseFirstLesson: '浏览第一课',
  browseCurrentLesson: '浏览当前课次',
  completedNote: '已完成的尝试描述的是已记录的活动。知识状态取决于证据；预估用时并不承诺掌握。',

  // Pinned lesson card.
  pinnedLessonLabel: '当前固定课次',
  pinnedAttemptEyebrow: '本对话固定的尝试',
  newerAcceptedRoute: (accepted, attempt) => `已接受的学习路线现在是版本 ${accepted}。在你明确从其他路线开始课次之前，本对话仍停留在版本 ${attempt}。`,
  viewPinnedOverview: '查看固定的课次概览',
  browseAcceptedVersion: (version) => `浏览已接受版本 ${version}`,
  openCurrentConversation: '打开当前对话',
  pinnedRequestFailed: '固定课次的请求未能送达导师：',
  retryCurrentLesson: '重试当前课次请求',

  // Knowledge reference.
  knowledgeReferenceLabel: '关联知识证据参考',
  closeKnowledgeReference: '关闭知识参考',
  evidenceEntries: (count) => `${count} 条已记录证据`,
  knowledgeIdLabel: '知识 ID：',
  knowledgeIdHelp: '。打开“知识”标签页查看已记录的观察。仅凭课程大纲中的一个主题不能确认理解。',

  // Route proposals.
  routeProposalsLabel: '学习路线建议',
  routeVersions: '学习路线版本',
  buildRoute: '构建你的课程学习路线',
  waitingProposal: '正在等待导师建议',
  noVersionsHelp: '先保存目标，然后完成初诊或明确跳过。导师可以先提出包含每个课次概览的完整大纲，之后才会写入课次正文。',
  needsAssessmentHelp: '当前目标需要完成初诊或明确跳过后，才能请求方案。',
  routeToBrowse: '要浏览的学习路线',
  routeVersionToBrowse: '要浏览的学习路线版本',
  versionOption: (version, accepted, previouslyAccepted, title) => `版本 ${version} · ${accepted ? '已接受' : previouslyAccepted ? '此前已接受' : '草稿'} · ${title}`,
  requestPlanAgain: '再次请求方案',
  requestRevisedPlan: '请求修订方案',
  requestRouteProposal: '请求学习路线方案',
  acceptRouteVersion: (version) => `接受学习路线版本 ${version}`,
  routeAcceptedNotice: (version) => `已接受学习路线版本 ${version}。准备好后请明确开始课次。`,
  routeAcceptedHelp: '此学习路线已被接受。是否开始课次仍由你决定。',
  routeProposalHelp: '浏览方案不会接受它，也不会开始课次。',
  routeRevisionWarning: ' 此版本基于更早的目标或初诊；接受前请先请求修订。',
  newerDraftHelp: '版本选择器中有更新的草稿。你当前的视图和尝试已保留。',

  // Effort and capacity.
  capacityLabel: '预估用时与可用时间',
  capacityTitle: (range) => `预估用时：${range}`,
  capacityNeedBudget: '添加每周时间预算，以及目标日期或时长，以便比较可用时间。',
  capacityAvailable: (minutes) => `在你选择的时间范围内，可用时间预算约为 ${minutes}。`,
  capacityNote: '估算包含计划课次；仅凭时间并不能确认掌握。',
  conflictMinimum: '最低预估用时超过你的可用时间。',
  conflictMaximum: '最高预估用时超过你的可用时间。',
  conflictAdvice: '你可以调整范围、延长时间线、增加可用时间，或请导师给出调整后的方案。',
  editGoalScope: '编辑目标或范围',
  editTimeBudget: '编辑时间预算',
  requestAdjustedPlan: '请求调整后的方案',

  // Empty route and shared actions.
  routeEmptyEyebrow: '你的学习路线将显示在这里',
  tutorPreparing: '导师正在准备方案',
  noCurriculum: '尚未提出课程大纲',
  routeEmptyHelp: '已有知识和教学内容仍可在“知识”标签页和对话中查看。',
  openConversation: '打开对话',
  askNeedsGoal: '请先保存你的目的和可观察的学习成果，再请求导师。',
  askNeedsAssessment: '请先完成已保存目标的评估，或明确跳过，再请求方案。',
  requestSent: (kind) => `${kind === 'plan' ? '学习路线方案' : '初诊'}请求已发送到对话中的导师。`,
  lessonRequested: '已在对话中请求课次。',
  goalSaved: '目标草稿已保存。准备好后可以请求初诊。',
  draftSaved: '未完成的目标草稿已保存。准备好后请回来补充目的和可观察的学习成果。',
}

/** The copy object every component and helper on the path page reads. */
export type PathText = typeof en

/** The path page's copy in the learner's current interface language. */
export function usePathText(): typeof en {
  return useLang() === 'zh' ? zh : en
}
