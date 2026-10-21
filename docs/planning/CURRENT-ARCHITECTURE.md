# UDT 当前框架总览（以代码为准）

状态：现行架构说明，对应 `main` 的 `d7540b9` 之后、未发布的界面收敛改动。
这份文档只描述代码里真实存在的东西；每节都标注了对应文件，便于核对。
产品设计背景见 [`LEARNING-PATH-ARCHITECTURE.md`](./LEARNING-PATH-ARCHITECTURE.md)。

## 1. 一句话

本仓库是 **DSH 插件**（宿主 + 浏览器两半），只负责四件事：**存状态、校验状态、把学习者的动作变成一次唤醒、把状态画出来**。
所有教学决策（诊断、路线、教学内容、检查判定、下一步）都在仓库外的 Universal Diagnostic Tutor skill / 模型里；插件不做教学规则。

## 2. 分层

```
DSH Runtime
├── Host 插件  src/index.ts
│   ├── storage domain "udt"     src/state.ts（9 张表 + 学习者单例）
│   ├── 模型工具（9 个）          src/tools.ts（6）+ src/path-tools.ts（3）
│   ├── 唤醒模型                 src/prompt.ts（旧循环焦点）
│   │                            src/path-runtime.ts（初诊 / 路线 / 开课提示词）
│   └── HTTP API                 src/api.ts + src/path-api.ts（16 条路由）
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
| `course_runs` | sessionId+courseId | 会话级课次尝试 + 教学快照 | `/path/start`、`udt_course_run_update`、`udt_lesson_update(attemptId)` |
| global `learner` | 单例 | 初始化标记、`preferredLanguage`、activeCourseId | `/preferences/*`、初始化 |

注意：当前存在两套教学落盘方式——旧循环写 `lessons`；路线循环写 `course_runs.attempts[].units`。导出同时包含两者。

## 6. 模型工具（9 个）

| 组 | 工具 | 作用 |
| --- | --- | --- |
| 诊断 / 旧循环 | `udt_status` | 读运行时状态、项目、焦点、待决策 |
| | `udt_goal_create` | 建项目 + 根节点 |
| | `udt_map_get` | 读完整诊断图 |
| | `udt_map_update` | 加节点/证据/改状态（有 schema 与证据约束） |
| | `udt_lesson_update` | 写教学；有 attemptId 时写尝试快照，否则写旧 lesson 表 |
| | `udt_decide_next` | 记录下一步（模型决定目标，运行时只校验形状） |
| 课程路线 | `udt_path_get` | 读 brief、初诊、全部路线、当前 attempt |
| | `udt_path_update` | 写 brief / 初诊 / 路线草案 |
| | `udt_course_run_update` | 绑定诊断节点、带证据完成课次 |

工具注册数量由 `registerTools()` 返回并写入启动日志，不再是手写常量。

## 7. HTTP 路由（`/diagnostic-tutor/api`）

所有路由都经过 `src/trust-fence.ts`：请求必须来自回环 Host/Origin 且非跨站；POST body 上限 64 KiB。

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/overview` | GET | 当前项目、诊断图、焦点、建议、handoff、项目库 |
| `/node` `/lesson` | GET | 单节点详情 / 单节点旧 lesson |
| `/project` | POST | 本会话选择项目 |
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
- 路线页按阶段渐进展示（目标与时间 → 初诊 → 路线 → 学习），初诊未完成时只显示当前阶段并给出
  「去对话回答」提示；已完成的初诊摘要与路线版本折叠在次要位置。
- 验证记录：590 个 Vitest 测试、24 组浏览器场景（每组含中英切换）、类型检查、生产构建、地图/面板视觉审计。

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
pnpm test                 # 590 tests
pnpm build
pnpm preview              # 构建产物预览
node scripts/path-check.mjs http://127.0.0.1:8391/ /tmp/udt-path
```

- 工具注册：`src/tools.ts` 末尾 `registerTools()`。
- 路由：`src/api.ts` 与 `src/path-api.ts` 的分发部分。
- 存储表：`src/state.ts` 的 `udtDomain` 声明。
- 客户端入口：`src/client/index.tsx` 的 `apply()`。
