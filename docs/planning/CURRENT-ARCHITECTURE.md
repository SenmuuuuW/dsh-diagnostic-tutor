# UDT 当前框架总览（以代码为准）

状态：现行架构说明，对应 `feat/phase1-content-sources`（2026-10-27）的 Phase 1 内容/输入改动。
这份文档只描述代码里真实存在的东西；每节都标注了对应文件，便于核对。
产品设计背景见 [`LEARNING-PATH-ARCHITECTURE.md`](./LEARNING-PATH-ARCHITECTURE.md)。

## 1. 一句话

本仓库是 **DSH 插件**（宿主 + 浏览器两半），只负责四件事：**存状态、校验状态、把学习者的动作变成一次唤醒、把状态画出来**。
所有教学决策（诊断、路线、教学内容、检查判定、下一步）都在仓库外的 Universal Diagnostic Tutor skill / 模型里；插件不做教学规则。

## 2. 分层

```
DSH Runtime
├── Host 插件  src/index.ts
│   ├── storage domain "udt"     src/state.ts（13 张表 + 学习者单例）
│   ├── 模型工具（18 个）         src/tools.ts（7）+ src/path-tools.ts（3）+ src/source-tools.ts（3）+ src/plan-tools.ts（2）+ src/review-tools.ts（3）
│   ├── 唤醒模型                 src/prompt.ts（旧循环焦点）
│   │                            src/path-runtime.ts（初诊 / 路线 / 开课提示词）
│   └── HTTP API                 src/api.ts + src/path-api.ts（23 条路由）
│
├── 模型 / UDT skill（仓库外）
│   └── 只能通过工具读写状态；运行时不复制、不内置教学逻辑
│
└── Client 插件  src/client/index.tsx
    ├── 侧栏 Learn 动作          → 右侧停靠标签「Current lesson」（tab.tsx）
    ├── 侧栏 Learning map 入口   → 主栏唯一页面（map-panel.tsx）
    │                              ├─ 学习路线 PathPage（path-page.tsx）
    │                              └─ 知识与证据（诊断图 + 证据）
    └── 共享：blocks.tsx / visuals.tsx / i18n.ts
             文案：path-text.ts / map-text.ts / lesson-text.ts /
                   learning-text.ts（共享）/ tab-text.ts / panel-text.ts
```

`null` 布局说明：主栏只有 `diagnostic-tutor-map` 一个 main key；完整全屏学习面板不再注册（`src/client/app.tsx` 仅保留给预览与测试）。

## 3. 谁做什么

| 层 | 拥有 | 不拥有 |
| --- | --- | --- |
| Host 插件 | 存储、schema 校验、并发/版本控制、证据引用校验、唤醒模型、HTTP | 任何教学判断 |
| 模型 / skill | 诊断问题、初诊结论、课程路线内容、教学正文、检查与迁移判定、下一步 | 直接改存储（只能通过工具） |
| 浏览器 | 展示、收集学习者动作、请求/保存/接受/开始 | 判断掌握、自动推进、自动改路线 |

## 4. 两个核心对象

**课程路线图 = 怎么学**（`src/path.ts`）

- `GoalBrief`：目的、可观察成果、自述背景、时区、期限/周数、每周分钟、单次时长、偏好。
- `Assessment`：`in-progress | ready | skipped`， strengths/gaps/uncertainties，以及带 `{nodeId, evidenceIndex}` 的证据引用。
- `Curriculum`：不可变版本；模块 + 课次（Overview/outcomes/outline/topics/nodeIds/practice/assessment/分钟范围）+ 先修边（`required | optional`，校验 DAG 与顺序）。
- `LearningPath`：每个项目一份聚合；`revision` 做 CAS；`acceptedVersion` 是学习者显式接受的那个版本。
- `CourseRun`：**每个会话一份**；`CourseAttempt` 绑定 `version + itemId`，状态 `requested | working | completed | interrupted`；教学写入以 `units[]` 快照保存；完成课次必须引用本次 attempt 的 check/transfer 证据。

**诊断图 = 我现在会什么**（`src/state.ts` 的 `nodes`）

- 7 个状态：`unconfirmed / explained / practiced / checked / weak / blocked / confirmed`。
- 状态只能由记录的证据推动；规划主题不会自动生成节点，也不会自动确认掌握。
- 两张图通过课次里的 `nodeIds` 关联，但仍是两类事实。

## 5. 存储表（domain `udt` v1）

| 表 | 键 | 作用 | 主要写者 |
| --- | --- | --- | --- |
| `courses` | courseId | 学习项目 | `udt_goal_create` |
| `nodes` | nodeId | 诊断图与证据 | `udt_map_update` |
| `lessons` | lessonId | **旧循环**教学记录 | `udt_lesson_update`（无 attemptId 时） |
| `focus` | sessionId+courseId | 旧循环本会话焦点 | 旧循环开始学习的 UI 动作（`POST /focus`） |
| `next_steps` | sessionId+fromNode | 旧循环下一步建议 | `udt_decide_next` |
| `handoffs` | sessionId+nodeId | 旧循环等待/重试计时 | API 与教学工具 |
| `session_projects` | sessionId | 本会话选中的项目（会话隔离根） | `POST /project` / 工具 |
| `learning_paths` | courseId | 项目级规划聚合（revision CAS） | `udt_path_update`、`POST /path/*` |
| `course_runs` | sessionId+courseId | 会话级课次尝试 + 教学快照 + 作答记录 | `/path/start`、`udt_course_run_update`、`udt_lesson_update(attemptId)`、`udt_quiz_update` |
| `sources` | sourceId | 学习者提供的本地/粘贴文本、哈希与引用原文 | `udt_source_add`（additive v1 表） |
| `tasks` | taskId | 今天/计划项与到期时间；不参与教学判断 | `udt_plan_update`（additive v1 表） |
| `review_cards` | cardId | 复习卡与本地间隔调度字段 | `udt_review_add/grade`（additive v1 表） |
| `review_log` | logId | 每次复习评分与前后 due | `udt_review_grade`（additive v1 表） |
| global `learner` | 单例 | 初始化标记、`preferredLanguage`、activeCourseId | `/preferences/*`、初始化 |

注意：当前存在两套教学落盘方式——旧循环写 `lessons`；路线循环写 `course_runs.attempts[].units`。导出同时包含两者。

## 6. 模型工具（18 个）

| 组 | 工具 | 作用 |
| --- | --- | --- |
| 诊断 / 旧循环 | `udt_status` | 读运行时状态、项目、焦点、待决策 |
| | `udt_goal_create` | 建项目 + 根节点 |
| | `udt_map_get` | 读完整诊断图 |
| | `udt_map_update` | 加节点/证据/改状态（有 schema 与证据约束） |
| | `udt_lesson_update` | 写教学；预渲染 MathML；有 attemptId 时写尝试快照，否则写旧 lesson 表 |
| | `udt_quiz_update` | 记录 quiz/闪卡作答；不改节点状态、不判定掌握 |
| | `udt_decide_next` | 记录下一步（模型决定目标，运行时只校验形状） |
| 课程路线 | `udt_path_get` | 读 brief、初诊、全部路线、当前 attempt |
| | `udt_path_update` | 写 brief / 初诊 / 路线草案 |
| | `udt_course_run_update` | 绑定诊断节点、带证据完成课次 |
| 输入 / 引用 | `udt_source_add` / `udt_source_list` / `udt_source_get` | 本地单文件或粘贴文本入库、列元数据、按 sourceId 读原文；插件零外联 |
| 计划 | `udt_plan_get` / `udt_plan_update` | 读写 Today 任务；只记录计划，不改变教学状态 |
| 复习 | `udt_review_add` / `udt_review_next` / `udt_review_grade` | 复习卡队列与本地间隔调度；不判定掌握、不改 node 状态 |

工具注册数量由 `registerTools()` 返回并写入启动日志，不再是手写常量。

## 7. HTTP 路由（`/diagnostic-tutor/api`）

所有路由都经过 `src/trust-fence.ts`：请求必须来自回环 Host/Origin 且非跨站；POST body 上限 64 KiB。

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/overview` | GET | 当前项目、诊断图、焦点、建议、handoff、项目库 |
| `/node` `/lesson` | GET | 单节点详情 / 单节点旧 lesson |
| `/project` | POST | 本会话选择项目 |
| `/project/session` | GET | 解析继续学习应进入的会话（只读，不写选择） |
| `/diagnostics` | GET | 本地健康报告：阶段、待处理/失败请求、事件日志（只读） |
| `/focus` | POST | 旧循环开始学习 + 唤醒模型 |
| `/handoff/observed` | POST | 浏览器首次渲染的时间点 |
| `/export` `/reset` | GET/POST | 导出全部数据 / 删除一切 |
| `/preferences` `/preferences/language` | GET/POST | 界面语言（存 learner profile） |
| `/path` | GET | 读取规划视图 |
| `/path/brief` | POST | 保存目标/时间草稿或更新 |
| `/path/skip-assessment` | POST | 学习者显式跳过初诊 |
| `/path/accept` | POST | 显式接受某个路线版本（CAS） |
| `/path/request` | POST | 请求初诊或路线；写 request 记录并唤醒模型 |
| `/path/start` | POST | 创建/继续课次尝试并唤醒模型 |
| `/path/pause` | POST | 暂停当前 attempt，保留同一 attempt |
| `/path/answer` | POST | 记录 quiz/闪卡作答（不判定、不改状态） |
| `/source` | GET | 读取一个 sources 原文（trust fence） |
| `/plan/ics` | GET | 导出有到期日的开放计划项为 ICS；DSH schedule 仍是 session-local |
| `/plan/task` | POST | 学习者标记计划项完成/重新打开（只改计划状态） |

## 8. 一次完整流程

```text
学习者                          UI / HTTP                          模型（UDT skill）
说想学什么                       ─(chat)─▶ 模型                    udt_goal_create
保存目标/时间                    ▶ POST /path/brief
请求初诊                         ▶ POST /path/request(diagnosis)   ──唤醒──▶ 提问 + 短检查
                                                                   udt_map_update 写证据
                                                                   udt_path_update 写 assessment
请求路线                         ▶ POST /path/request(plan)        ──唤醒──▶ udt_path_update(propose)
接受路线（显式）                  ▶ POST /path/accept
开始课次（显式）                  ▶ POST /path/start                ──唤醒──▶ bind node → lesson_update
在对话中答题                     ─(chat)─▶ 模型                    udt_map_update(evidence, attemptId)
                                                                   udt_course_run_update(complete)
                                                                   （完成 ≠ 掌握；不自动下一课）
```

模型不调用工具，状态不会变化。UI 上的按钮是保存/请求/唤醒，不是“执行教学”。

## 9. 界面入口（收敛后）

| 入口 | 组件 | 行为 |
| --- | --- | --- |
| 侧栏 **Learn** | `LearnAction` + 右侧 `LearningTab` | 打开「Current lesson」停靠标签，不接管主栏；无会话时说明原因 |
| 侧栏 **Learning map** | `main` key `diagnostic-tutor-map` → `LearningMapPanel` | 主栏唯一页面，两个 tab：学习路线 / 知识与证据 |
| 地图页 **Open current lesson** | — | 返回对话并打开停靠标签 |
| 地图页 **Back to the conversation** | — | 仅返回对话 |
| 停靠标签 **Open map** | — | 切到 Learning map 页面 |

全屏学习面板不再出现在插件产物中；`LearningPanel`（`app.tsx`）仅由预览和测试直接挂载。

## 10. 已实现 / 未实现（避免自我夸大）

**已实现并经自动化验证**

- 目标草稿、初诊/跳过、证据引用校验、版本化路线、显式接受、逐课 Overview、路线画布与顺序清单同源。
- 会话隔离（`course_runs` 按 `[sessionId, courseId]`）、幂等 operation ID、revision CAS、过期 attempt 拒绝、完成课次证据要求。
- 旧 v1 存储兼容（新增表，无迁移）、导出/重置。
- 中英界面切换覆盖全部插件页面：地图页、路线页、课程/课次面板、停靠标签、独立全屏面板、
  下一步卡片、等待提示、欢迎行、侧栏 Learn 入口；语言存 learner profile。
- 品牌强调色采用 DeepSeek 蓝：浅色 #4d6bfe、深色 #6a84ff，只用于进度条、当前标签、
  选中/当前课次、焦点环、操作链接与悬停底色；主按钮仍用宿主的近黑/近白填充（蓝色是标记，不是动作）。
- 初诊唤醒文案要求导师用 DSH 的 `ask_user_question` 提出诊断问题（选项可点选、支持多选与
  自由文本）；工具不可用的 profile 回退为聊天文本。问题内容与证据记录仍由导师决定。
- 暂停即恢复（2026-10-27）：课次栏暂停成功后本地立即切换为已暂停并显示「继续这一课」，
  不再等待下一次轮询；路线图与课次栏通过跨面板事件立即同步；继续仍使用同一 attempt。
- Teach-back（2026-10-27）：课次栏可发起「换我讲给你听」；导师先邀请学习者复述，
  再指出一个具体漏洞、追问一次并写入 explanation 证据，不把复述当成掌握，也不再灌新内容。
- 导师主导闭环（2026-10-27）：开始/恢复提示要求导师在对话里讲一小段、问一个检查并等待；
  退出后点继续会用当前课次、已写单元和最后检查唤醒导师；新增暂停 API 与路线卡/课次栏的
  继续、检查我、暂停、回对话动作，并展示已讲段数和最近讲解。
- 遮挡与细节修复（2026-10-27）：中等宽度四段进度条压缩且不再被右侧栏盖住，窄屏改为两行；
  课次示意图默认折叠；课次卡标题与时长保持同行。
- 排版与阅读优化（2026-10-27）：Markdown 表格/代码块真实渲染；课次阅读列限宽 720px 并自滚动；
  路线模块默认折叠、当前模块展开、支持展开全部；模块描述截断两行；卡片/表单/知识列表整体收紧；
  修复检查块旧样式。
- 界面重构（2026-10-26）：按最终 UI 设计重写 Learning map（项目库、路线页、知识与证据、
  当前课次 tab）：主栏 + 右侧上下文栏，模块/课次卡片替代 SVG 画布，新增等待/错误/版本/完成态；
  项目库增加路线状态；浏览器回归覆盖 1440/900/400 与深浅色共 21 个场景。
- 路线页压缩（2026-10-26）：去掉重复页头/说明、完成态文字、重复的固定尝试卡和折叠区重复信息；
  下一步卡片承载一行紧凑摘要（课数/时长/周数/进度/超时），工作区紧跟其后。
- 自测（2026-10-25）：`tests/self-check-e2e.test.ts` 用真实 `apply` 装配（工具、路径 API、journal、
  diagnostics、doctor）走完 目标 → 初诊 → 评估 → 提案 → 接受 → 首课 → 诊断报告 全链路。
- 路线预算与进度（2026-10-25）：路线卡片显示课次数、总学习时长、按周预算的周数，并标出
  超过单次时长的课次；计划提示要求导师按单次时长排课。完成一课后“下一步”指向第一门未完成课次，
  显示 x/y 进度；全部完成时显示路线完成。
- 请求卫生（2026-10-25）：唤醒文案改为短句学习者口吻（不再把 goal JSON 贴进聊天）；
  等待卡显示等待时长，重新请求入口在 1 分钟后才出现，避免快速双击制造重复请求；
  provider 错误按 billing/auth/rate-limit/network/context 分类给出下一步建议，并保留原始信息。
- 初诊等待期同时读取 Session Controller 实时快照与路线请求的持久化 failure：回合运行中提示
  “正在准备”，回合失败时主按钮用当前模型重试并打开对话（失败会写入 path request，重启后仍可见）；
  无失败但未产生问题时提供“重新请求初诊”链接。
导师回合运行中显示“导师正在准备初诊问题”，
  回合失败时显示真实错误并提供“重新请求初诊 / 跳过初诊”，不再让学习者去回答不存在的问题。
- 路线页顶部固定一张“下一步”卡片：用 Step N of 4 + 一句话说明 + 唯一主操作给出下一步
  （设目标 → 初诊 → 出路线 → 接受 → 开始/继续课次）；次操作只在确有替代时出现（跳过初诊、
  请求修订路线）。初诊阶段只保留说明卡，路线阶段只保留版本浏览，空白态与等待卡不再重复堆叠。
- 继续学习入口（项目库卡片、“Open current lesson”）先向宿主解析项目最近活跃的会话并切换过去，
  避免在新对话里重新开一份空课次；解析顺序为 active focus → 有尝试的 course run → 最近项目选择，
  无导航服务时回退为在当前会话打开。
- 路线页按阶段渐进展示（目标与时间 → 初诊 → 路线 → 学习），初诊未完成时只显示当前阶段并给出
  「去对话回答」提示；已完成的初诊摘要与路线版本折叠在次要位置。
- Phase 1（2026-10-27）：host KaTeX→MathML 预渲染 + 客户端白名单 MathML；10 种 block（新增 formula/code/quiz/flashcard/resource/comparison，未知类型降级）；quiz/闪卡作答写入 attempt.responses 与中性 practice evidence，可刷新/resume，不改 node state；`sources` 表与 `udt_source_add/list/get`、`sourceRefs` 跨表校验、`/source` 回看、Markdown 降级；插件仍零外联。
- Phase 2（2026-10-27）：Today 计划（`tasks` additive table、`udt_plan_get/update`、`/plan/ics`）；学习路线顶部显示今日任务与日历导出；计划不参与教学判断。
- Phase 3（2026-10-27）：Today 任务完成/重新打开；复习卡与 `review_log` additive 表、`udt_review_add/next/grade`、无依赖的本地间隔调度；尚无独立复习 UI。
- 验证记录：632 个 Vitest 测试、21 组浏览器场景（1440/900/400 × 深浅色）、类型检查、生产构建、地图/面板视觉审计。
- 监控（2026-10-25）：host 写本地无内容事件日志（`<dsh-home>/logs/diagnostic-tutor-events.jsonl`，
  1 MB 上限、单次轮转，测试环境禁用），`GET /diagnostics` 返回阶段/请求/事件报告，
  `pnpm doctor` 提供只读体检；不联网、不记录聊天/目标/证据内容。
- DSH `0.2.1-rc.3` 复核（2026-10-25）：开发依赖钉到 rc.3，607 个测试、24 组浏览器场景、类型检查与构建通过；隔离 rc.3 web profile 中插件正常加载（Learning map 页面、Current lesson 标签、host 路由），无运行时异常。

**未实现（不要当成已有能力）**

- 自动补课/跳课建议、路线版本差异 UI、跨课程迁移验收。
- 教学语言不随界面切换：界面只有中英文案，模型写什么语言就是什么语言。
- 侧栏 `Learning map` panellist 标签在插件加载时注册，不随切换变化；
  宿主/模型生成的错误文本与动态 handoff detail 保持原样；
  开发预览页工具栏不在产品界面内，未翻译。
- 没有算法规划器：路线由模型提出，运行时只校验和保存；没有自动 mastery、没有云端推送。

## 11. 当前技术债（有意的取舍）

1. 两代存储/两套教学 UI 并存：旧 `focus/handoff/lessons` 循环仍可工作，新路线循环用 `course_runs`。
2. 三个轮询：`use-learning.ts` 2s、`course-learning.tsx` 2s、`path-page.tsx` 3s。
3. 文档与发布：`package.json`/npm 仍是 `0.1.1`，`main` 上的功能未发布；README 已标注这一状态。
4. 预览用的全屏面板仍保留（`surface=panel`），不代表产品入口。

## 12. 如何核对

```sh
pnpm typecheck
pnpm test                 # 632 tests
pnpm build
pnpm preview              # 构建产物预览
node scripts/path-check.mjs http://127.0.0.1:8391/ /tmp/udt-path
```

- 工具注册：`src/tools.ts` 末尾 `registerTools()`。
- 路由：`src/api.ts` 与 `src/path-api.ts` 的分发部分。
- 存储表：`src/state.ts` 的 `udtDomain` 声明。
- 客户端入口：`src/client/index.tsx` 的 `apply()`。
