# Universal Diagnostic Tutor for DeepSeek Harness — 规划书 v1

> **From a Tutor Skill to a Learning Runtime.**
>
> 本文是开工前的产品 / 技术 / 路线规划。所有 DSH 相关结论都来自当前真实代码，
> 不是记忆。引用路径已在文中标注。**本文不包含任何实现代码。**

调研基准：

| 对象 | 版本 | 位置 |
| --- | --- | --- |
| DSH 源码 checkout | `0.1.5-rc.1` | `<dsh-checkout>` |
| **实际在跑的 DSH（权威基准）** | **`@deepseek-ai/*@0.1.6-alpha.2`** | npx 安装，261 个包；`dsh-tools`/`dsh-session`/`dsh-storage-domain`/`dsh-client-ui-slots`/`dsh-skill` 均已逐个确认 |
| UDT Skill | `v2.0.0`（已 tag；HEAD 领先 5 个纯文档 commit） | `.../universal-diagnostic-tutor-skill`（MIT，140 个 skill 文件，GitHub 225★） |
| 同生态插件参考 | dsh-study / dsh-whale-report / dsh-minecraft / dsh-better-sidebar | `<workspace>/*` |
| 插件开发规范 Skill | plugin-write / plugin-release / plugin-test / plugin-workflow / plugin-upgrade | `dsh-plugin-upgrade-skill/skills/*` |

> ⚠️ **版本号有三层**（源码 / 运行库 / 插件自 pin 的副本），详见 2.12 #5。
> 一切结论**以实际在跑的 harness 为准**。

五份支撑调研报告（本轮生成，全部含 `file:line` 引用）：

- [`dsh-plugin-architecture-reference.md`](./dsh-plugin-architecture-reference.md) — **~2000 行**：最小插件、工具 DSL、Skill、持久化、Config、事件钩子、安全、稳定性；含 73 项 `ctx.<service>` 地图与逐面稳定性表
- [`DSH-PLUGIN-PLATFORM-REPORT.md`](./DSH-PLUGIN-PLATFORM-REPORT.md) — **1190 行**：安装/分发/配置/CLI、`cordis.patch.yml` schema、**0.1.5-rc.1 ↔ 0.1.6-alpha.2 兼容表**、发布 runbook、安全与信任模型
- [`DSH-WEB-CLIENT-PLUGIN-RESEARCH.md`](./DSH-WEB-CLIENT-PLUGIN-RESEARCH.md) — **881 行**：两条 UI 通道、61 个 slot 贡献点、构建/serve/HMR、host↔client 通信
- [`UDT-v2.0-technical-product-report.md`](./UDT-v2.0-technical-product-report.md) — UDT 契约、封闭词表、guardrails 全文引用
- [`DSH-PLUGIN-RECON.md`](./DSH-PLUGIN-RECON.md) — 四个真实插件的逐文件剖析、安装机制、package.json 模板

---

## 1. Repository Boundary

### 现状核查

```
<workspace>/UDT DSH plugin/   ← 空目录（只有 . 和 ..）
```

- **不是** git repo：`git rev-parse --show-toplevel` → `fatal: not a git repository`。
- **未被任何父仓库追踪**：向上逐级检查到 `/` 都没有 `.git`；
  `<workspace>/` 本身也不是 repo，只是普通文件夹。
- 因此：**不存在"被父仓库误追踪"的风险**，也无 .gitignore 需要处理。

### 结论

**应该初始化成独立 git repo**，理由：

1. 目录为空，零迁移成本，现在是最干净的起点。
2. **必须与 UDT Skill 仓库分离**——这不是偏好，是上游规则：
   UDT 的 `AGENTS.md:132-133` 明确 "Do not add scripts, test harnesses,
   package managers, websites, or other infrastructure unless there is a clear
   recurring need"，且整个 skill 仓库是 **Markdown-only**（无任何
   `*.json` / `*.yaml` / `*.toml` / 脚本）。把 TypeScript 插件塞进 UDT 仓库会
   直接违反它的维护契约。**依赖，而非合并。**
3. 邻居 `dsh-whale-report`、`dsh-minecraft`、`dsh-plugin-upgrade-skill` 都是独立 repo，
   与生态惯例一致。
4. 目录名含空格（`UDT DSH plugin`），**对 npm / 构建工具不友好**。
   建议把**仓库内容**放在这里没问题（git 不在乎目录名），但要意识到：
   `link:` 依赖、pnpm workspace、`dsh plugin add <path>` 都会走到这个带空格的路径。
   `~/.dsh/profiles/web/package.json` 里已有 `"dsh-minecraft": "link:/Users/.../dsh-minecraft"`
   这种写法，带空格路径大概率能活但属于自找麻烦。

**建议**（二选一，需你拍板）：

- **A（推荐）**：把实际开发目录移到 `<this-repo>`，
  当前带空格的空目录留作壳或删掉。风险最低，路径与生态一致。
- **B**：就地初始化。省一步，但要接受带空格路径进入 `package.json` 的 `link:` 依赖。

我倾向 A。**在你确认前我不创建任何 git repo。**

### 推荐仓库名

**`dsh-diagnostic-tutor`**（GitHub + npm 同名）

理由：
- DSH 生态的命名惯例是 `dsh-*`（官方教程用 `dsh-hello-plugin`，见
  `docs/user/develop/basic/publish.zh.md:37`；社区命名 profile 也接受 `dsh-*` /
  `@scope/dsh-*`，见 `dsh-plugin-upgrade-skill/skills/plugin-write/references/naming-conventions.md`）。
- `diagnostic-tutor` 直接承载差异点（diagnosis-first），比 `udt` 这种缩写对路人友好。
- `dsh plugin --profile web add dsh-diagnostic-tutor` 一眼能懂。
- 产品对外标题仍可写全称 **Universal Diagnostic Tutor for DeepSeek Harness**，
  与已有 2.0 Skill 的品牌延续性不断。

备选：`universal-diagnostic-tutor-dsh`（品牌最强，但不符合 `dsh-` 前缀惯例，搜索不占优）。

**两个发布前的动作：**

1. **实查 npm 是否可用** —— `npm view dsh-diagnostic-tutor`（npm 上
   `dsh-minecraft` 就是另一个无关项目的先例，别假设可用）。
2. **给 GitHub 仓库打 `dsh-plugin` topic** —— 这是 DSH 生态**唯一**的官方
   发现入口（没有插件注册表；社区 registry 索引是空的，见 R11）。
   顺带可提交到 `dsh-market` 与 awesome 列表。

配套 `dsh-plugin.naming.json`（社区命名 profile 要求的声明文件，非官方 manifest）：

```json
{
  "schemaVersion": 1,
  "policy": "dsh-plugin-naming/v1",
  "plugin": {
    "namespace": "senmuuuu",
    "name": "diagnostic-tutor",
    "coordinate": "senmuuuu/diagnostic-tutor",
    "packageName": "dsh-diagnostic-tutor"
  },
  "names": {
    "pluginNames": ["diagnostic-tutor"],
    "loaderIds": ["diagnostic-tutor"],
    "services": ["diagnosticTutor"],
    "tools": ["udt_state", "udt_roadmap", "udt_lesson", "udt_check", "udt_next"],
    "commands": [],
    "skills": [],
    "skillProviders": [],
    "events": [],
    "settingsNamespaces": ["diagnostic-tutor"],
    "routes": []
  }
}
```

> 注意：`skills` 与 `events` 故意留空。
> `skills` 空是因为本插件**不注册** UDT Skill，只**依赖**它（详见第 3 节）。
> `events` 空是因为 **DSH 当前版本不支持可靠的自定义会话事件**（见 2.12 陷阱 #1），
> 这是一个已经过验证的设计决定，不是遗漏。

### 初始目录结构

```
dsh-diagnostic-tutor/
├── package.json              # dsh.bundle + dsh.client 双 manifest
├── dsh-plugin.naming.json    # 社区命名声明
├── cordis.patch.yml          # 装载层：一个 insert 行
├── tsconfig.json / tsconfig.build.json
├── tsdown.config.ts          # 只打 client 半侧 → lib/client.js
├── vitest.config.ts
├── LICENSE                   # MIT
├── README.md / README.zh.md
├── CHANGELOG.md
├── .github/workflows/ci.yml  # typecheck + test + build
├── docs/
│   └── ARCHITECTURE.md       # 含"兼容性漂移表"（抄 whale 的做法）
├── preview/                  # ⭐ 无 DSH 也能渲染 client 的本地预览
│   ├── index.html            # __ModuleLoader__ shim + React UMD
│   ├── fixture.js            # 假数据
│   └── serve.mjs
├── src/
│   ├── index.ts              # cordis 插件三件套（name/inject/apply）
│   ├── state.ts              # 存储域 schema（数据模型即契约）★先写这个
│   ├── tools.ts              # 面向模型的工具（state/artifact API）
│   ├── api.ts                # 前缀路由 + trust fence（client 取数用）
│   ├── roadmap.ts            # roadmap 组装与校验（纯函数）
│   ├── lesson.ts             # Learning Block schema 与校验（纯函数）
│   ├── diagnosis.ts          # 状态迁移逻辑，复用 UDT 封闭词表（纯函数）
│   ├── udt.ts                # UDT Skill 探测（路径 + 指纹 + 能力探测）
│   ├── config.ts             # Schemastery Config schema
│   └── client/               # 浏览器侧（第三方 client plugin）
│       ├── index.tsx         # client 注册 + slot 贡献
│       ├── roadmap-panel.tsx
│       ├── lesson-panel.tsx
│       ├── state-panel.tsx
│       └── blocks/           # 各 Learning Block 渲染器
├── tests/
│   ├── apply.test.ts         # ← 覆盖 apply()，dsh-study 的最大漏洞
│   ├── state.test.ts
│   ├── lesson-schema.test.ts
│   └── roadmap.test.ts
└── examples/
```

**两个特别值得抄的结构：**

- **`preview/`**（来自 whale-report）：一个 `__ModuleLoader__` shim + fixture，
  让 client 半侧**不启动 DSH** 就能在浏览器里迭代。
  对"UI 是本产品的核心卖点"这件事，这是最高杠杆的开发体验投资。
- **`docs/ARCHITECTURE.md` 里的兼容性漂移表**（whale `:134-140`）：
  逐条记录依赖的服务名 / slot key / 验证过的 harness 版本。升级时的救命文档。

---

## 2. DSH Plugin Architecture（以真实代码为准）

### 2.1 一个插件的最小结构

权威定义在 `docs/user/develop/basic/index.zh.md:17`：

> 插件是一个导出 `apply` 函数的 TypeScript 模块。

```ts
import type { Context } from '@deepseek-ai/cordis'
export const name = 'diagnostic-tutor'
export const inject = ['tools', 'storageDomain']
export function apply(ctx: Context, config: Config) { /* 注册能力 */ }
```

三种形态（`index.zh.md:105-138`）：函数 / `export default { name, inject, apply }` / `class extends Service`。
需要向别的插件**提供服务**时才用类形态。

**生命周期**：通过 `ctx` 注册的一切（事件、工具、定时器）在卸载时自动清理；
需要手动清理的资源（连接、文件句柄）用 `ctx.effect(() => () => cleanup)` 声明可逆效应
（`index.zh.md:66-85`）。这条是 DSH 的硬规矩：**每个注册都是一个 effect，必须有 disposer。**

### 2.2 两种 manifest：bundle 与 profile

来自 `docs/user/develop/basic/publish.zh.md:9-16`，这是 DSH 分发的核心概念：

| 概念 | 谁写 | manifest 键 | 回答的问题 |
| --- | --- | --- | --- |
| **组合包 (bundle)** | 插件作者（= 我们） | `package.json#dsh.bundle` | 这个包贡献什么？ |
| **profile** | 用户 / CLI 生成 | `package.json#dsh.profile` | 这套配置由哪些组合包组成？ |

**没有东西同时是两者。**

组合包最小形态（`publish.zh.md:26-62`）：

```
dsh-diagnostic-tutor/
├── package.json       # 声明 dsh.bundle
├── cordis.patch.yml   # 被 profile 列出时应用的层
└── index.js           # patch 行引用的插件模块
```

```json
{ "name": "dsh-diagnostic-tutor", "type": "module", "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
```

```yaml
# cordis.patch.yml —— 只有一个 insert 行（四个真实插件一致的做法）
- insert:
    - id: diagnostic-tutor
      name: 'dsh-diagnostic-tutor'
```

**我们的 package.json 模板**（综合四个真实插件的最佳实践，已剔除死键）：

```json
{
  "name": "dsh-diagnostic-tutor",
  "version": "0.0.1",
  "description": "Diagnosis-first learning runtime for DeepSeek Harness: a live learning map, structured lessons, and persistent learner state.",
  "type": "module",
  "license": "MIT",
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".":          { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client":   { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "LICENSE"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": [
      "@deepseek-ai/dsh-client-ui-slots",
      "@deepseek-ai/dsh-client-ui-layout",
      "@deepseek-ai/dsh-client-ui-primitives"
    ], "platform": "web" }
  },
  "dependencies": { "zod": "^4.0.0" },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-ui-layout": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-client-ui-primitives": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-client-ui-slots": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-session": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-skill": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-storage-domain": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-tools": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/schemastery": "^3.18.1"
  },
  "devDependencies": {
    "@deepseek-ai/dsh-tools": "0.1.6-alpha.2",
    "@types/node": "^24.0.0",
    "@types/react": "~18.3.1",
    "@types/react-dom": "~18.3.1",
    "react": "^18.2.0",
    "react-dom": "18.2.0",
    "tsdown": "^0.22.2",
    "typescript": "^5.6.3",
    "vitest": "^3.0.5"
  },
  "scripts": {
    "build": "rm -rf lib && tsc -p tsconfig.build.json && tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "prepare": "tsdown",
    "prepublishOnly": "pnpm build"
  }
}
```

要点注释：

- **没有顶层 `dshClient`**（死键，见 2.12 #2）。
- **没有 `publishConfig` 也不要 `private`** —— 这是要发布的包。
- peer 全部 `>=0.1.1-rc.2 <0.2.0`；devDeps 钉死运行版做类型基线。
- `dependencies` 只有 `zod`（whale 是唯一有完整 `zod` 用法的；dsh-study 也用 zod）。
  教学逻辑全在 Skill 里，所以插件依赖极少 —— 这是架构健康的信号。
- `prepare` + `prepublishOnly` 是 dsh-study 缺失、better-sidebar 有的发布卫生。
- 客户端需要的 `react` 只放 devDependencies（peer 由宿主提供，
  并在 `tsdown.config.ts` 的 `external` 里排除）。

### 2.3 安装机制（已在本机验证）

实际运行中的 profile：`~/.dsh/profiles/web/package.json`

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dsh": { "profile": { "bundles": [
    "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app",
    "dsh-whale-report", "dsh-minecraft", "dsh-better-sidebar" ] } },
  "dependencies": {
    "dsh-better-sidebar": "0.18.0-alpha.0",
    "dsh-minecraft": "link:<local-checkout>/dsh-minecraft",
    "dsh-whale-report": "link:<local-checkout>/dsh-whale-report"
  }
}
```

安装命令：`dsh plugin --profile <name> add <spec>`（在 profile 目录内转发给 pnpm）。
它会自动把声明了 `dsh.bundle` 的包追加进 `dsh.profile.bundles`（`publish.zh.md:83`）。

验证层装上了没：`dsh --profile <name> --dump-config`，应出现 `# == dsh-diagnostic-tutor` 层
（`publish.zh.md:106`）。

**层顺序**（`publish.zh.md:114-119`，后者胜）：
1. profile 的 `dsh.profile.bundles` 逐个 patch，按列表顺序
2. profile 自己的 `cordis.patch.yml`
3. `$DSH_HOME/cordis.patch.yml`
4. 每个 `--patch <path>` overlay

⚠️ **patch 替换目标行的整个 `config`，不是深合并**（`publish.zh.md:123`）。
覆盖别人的行时必须重述所有键。

### 2.4 注册工具（模型可调用）

真实范例：`dsh-study/src/tools.ts`。API 来自 `@deepseek-ai/dsh-tools`：

```ts
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'

ctx.tools.register(defineTool({
  name: 'study_teach',
  description: '...（同时是给模型的教学协议）...',
  parameters: { courseId: { type: 'string', required: true } },
  output: { schema: { type: 'object', /* JSON Schema */ },
            render: (_args, value) => [{ type: 'text', text: '...' }] },
  execute: (args, exec) => Promise.resolve({ ... }),
  presentCall: (args) => ({ card: 'generic', title: '...', kind: 'other', rawInput: args }),
}))
```

要点：
- `execute` 第二个参数 `exec: ToolRunContext` 可拿到 `exec.agent.session`（用于写会话事件）。
- 命名空间惯例：工具名用 `snake_case`，社区建议加发布者前缀（`alice_web_search_query`）。
- `description` 是**给模型看的**，所以教学协议写在这里是 DSH 的正当用法（dsh-study 就是这么做的）。

### 2.5 Skill 的注册与消费

`packages/skill/skill/src/index.ts` 的 `SkillRegistry extends Service`，`inject = ['skills']`：

- `ctx.skills.register(registration)` — 运行时注册一个 skill（`SkillRegistration`）
- `ctx.skills.registerProvider(fn)` — 注册一个 provider（`skill-filesystem`、`skill-badge` 都这么干，
  见 `packages/skill/skill-badge/src/index.ts:59`）
- `ctx.skills.list(options)` / `get()` — 读取目录与正文

Skill 扫描根与优先级（`packages/skill/skill-filesystem/src/index.ts:246-254`，与 UDT 文档一致）：

| rank | source | 路径 |
| --- | --- | --- |
| 100 | project-dsh | `<projectRoot>/.dsh/skills` |
| 200 | project-agents | `<projectRoot>/.agents/skills` |
| 400 | user-dsh | `$DSH_HOME/skills`（`~/.dsh/skills`） |
| 500 | user-agents | `$DSH_AGENTS_HOME/skills`（`~/.agents/skills`） |

**结论**：本插件用 `inject = ['skills']` + `ctx.skills.list()` **探测** UDT 是否存在并读它的
metadata，即可"依赖而不复制"。本机 UDT 已通过 `~/.agents/skills/universal-diagnostic-tutor`
symlink 就位于 rank 500。

### 2.6 持久化

真实范例：`dsh-study/src/state.ts`，用官方 storage domain 接缝：

```ts
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const udtDomain = defineDomain({
  name: 'udt', version: 1,
  tables: { nodes: domainTable<NodeKey, NodeRecord>(NodeSchema), /* ... */ },
})
```

在 `apply` 内：

```ts
ctx.inject(['storageDomain'], async (c) => {
  const domain = await c.storageDomain.open(udtDomain)
  ctx.effect(() => () => { void domain.close() })   // 卸载即净
})
```

优点（dsh-study 注释总结得很准）：官方接缝、json 后端默认可用、数据落在
`dshHomePath('storages')`（本机 `~/.dsh/storages/`，已有 `whale.json`、`workspace.json` 等）、
**schema 即契约**（持久化边界 zod 校验）、读是同步内存读、写是串行写链。

### 2.7 UI 扩展（关键结论：**可以放整页**）

第三方 UI 插件是**一等支持**的。真实证据是已装的 `dsh-better-sidebar`：
`~/.dsh/profiles/web/node_modules/dsh-better-sidebar/package.json`

```json
"exports": { ".": { ... }, "./client": { "types": "./lib/types/client/index.d.ts",
                                        "default": "./lib/client.js" } },
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "inject": ["@deepseek-ai/dsh-client-locale",
                         "@deepseek-ai/dsh-client-ui-slots",
                         "@deepseek-ai/dsh-client-ui-conversation",
                         "@deepseek-ai/dsh-client-modules"],
              "platform": "web" }
}
```

即：**host 入口 `main` + client 入口 `exports["./client"]` + `dsh.client` 声明**，
构建产出 `lib/index.js` 与 `lib/client.js`。

UI 用 **slot 系统**（`packages/client/ui-slots`，README 明说
"Compose UI through this package whenever you write a client plugin"）。
`SlotMap` 通过 declare merging 声明贡献点，四种 kind：`single` / `list` / `keyed` / `chain`。

对本产品**直接可用**的三个贡献点：

| Slot | kind | 位置 | 对我们的用途 |
| --- | --- | --- | --- |
| `main` | `keyed`, scope `root` | `packages/client/ui-layout/src/client/index.ts:46` | **Roadmap / Lesson / State 整页**。文档原文：「Central panel selected by sidebar entry id. The reserved `conversation` key hosts the Conversation; other keys receive no Session binding.」→ 非 `conversation` 的 key 归插件用 |
| `sidebar.panellist` | `list`, scope `root` | `packages/client/ui-sidebar/src/client/contract/slots.ts` | 左侧栏**导航图标**。原文：「Each list id addresses the matching main panel」→ 注册 id 即接通对应 main 面板 |
| `sidebar.right.pane.tab` | `keyed`, scope `session` | `packages/client/ui-sidebar-right/src/client/contract/slots.ts` | 右栏标签页（dsh-minecraft 的 sketch 就走右栏） |

导航 API（`packages/client/ui-layout/src/client/service.ts`）：

```ts
ctx.layout.selectPanel(panelId)   // 选中的 main key；null 回到 Conversation
```

**这就是 "点击 roadmap 节点 → 进入 lesson 页" 的官方通路，无需 hack。**

其他可用（共 **61 个**贡献点，完整目录见
`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`）：
`shell.overlay`（list/root，可点击穿透的浮层）、`settings.section`（整页设置）、
`settings.general.item`（一行设置）、`conversation.view`、
`conversation.chat.assistant-actions`、`tool.call.toolview`（按 wire 工具名 keyed →
**自定义工具卡渲染器**）、`conversation.input.*`（输入框周边）。

**⚠️ 三个必须知道的 slot 纪律：**

1. **不能注册进未声明的 slot —— 直接抛错**
   （`"slot X is not declared (a parent entry's children table must declare it)"`）。
   正确姿势永远是：
   ```ts
   ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'udt-roadmap', order: 40 }, Roadmap))
   ```
   `inject` 会在声明可用（或拥有者重挂载）时执行并自动重跑。
2. **绝对不要注册 `root`** —— 它会顶掉 `AppFrame`，**删掉所有 seat**。
3. 组件**拿不到 `ctx`**；props 由四份 share 合成（owner / child-render / store / inject 工厂返回值）。

### 2.7b ⭐ DSH 有**两条** UI 通道（重要，之前漏了）

| | **A. 静态 client plugin** | **B. Dynamic Cordis package** |
| --- | --- | --- |
| 形态 | npm 包，`dsh.client` + `exports["./client"]`，tsdown 打包 | **运行时用 `cordis_define`/`cordis_run` 写的纯 JS 源码文本** |
| 依赖 | 可 `import` 模块表里的 React / ui-primitives | **不能 import 任何东西**（闭包里给 `React`/`console`/`styles`/`host`） |
| 槽位 | 完整类型化 `ctx.slots` | `ctx.get('slots')`（受保护） |
| 通信 | `ctx.webServer` 路由 + `fetch`（或自有 WS） | `harness.handle` ↔ `host.call`（**仅 client→host，JSON**） |
| 持久性 | 随包长期存在，有 HMR | **会话级、需批准、重启即消失** |
| 生态定位 | 三个真实插件都用这条 | **官方明确为第三方设计**：自带 agent skill + 61 条 slot 目录 + 逐槽示例 + 审批 UX |

**➡️ 这对我们是一个真正的战术机会：**

- **v0.0.1 / 原型期用通道 B**：不需要 npm 包、不需要 tsdown、不需要 cordis.patch.yml、
  不需要 `dsh plugin add`。**可以在一次对话里就把 roadmap 面板渲染出来**，
  用来验证"整页 + 导航 + 数据"到底长什么样，以及用户体验是否成立。
  这能把 D4/D5 的验证周期从"天"压到"分钟"。
- **正式产品用通道 A**：可持久、可分发、有 HMR、能 `import` 模块表。
- **分工建议**：通道 B 当**设计台（design bench）**，通道 A 当**产品**。
  两者共用同一套数据契约（我们的路由 + 状态 schema），所以 B 的产出不是废料。

**⚠️ 但要知道三个真实插件的实际做法**：`dsh-minecraft` 与 `dsh-whale-report`
**完全没有用 `ctx.slots`** —— 它们
①自己 `createRoot(document.body.appendChild(div))` 挂一个 FAB + 抽屉，
②`setInterval` 轮询自己的 HTTP 路由（3 秒），
③可选地 `ctx.inject(['betterSidebar'])` 注册一个侧栏 tab。
这说明**插件的自有 UI 根 + 轮询**是一条被验证过的兜底路线。
我们的选择：**优先用官方 `ctx.slots`（更干净、有 HMR、可被主题化），
把"自有 root + 轮询"作为降级方案。**

**构建工具链**：官方 preset 是 `packages/client/tsdown.client.ts:107` 的 `clientBundle()`，
但它是 **monorepo 相对路径且未发布** → 第三方只能手写 tsdown 配置
（三个真实插件各自复制了一份）。
产物是 **CJS 单文件** `lib/client.js`，带 `window.__ModuleLoader__.load({...})` banner。

**⚠️ 两条构建硬约束：**

1. **纯净度闸门**：`dsh-client-bundle-purity` 对任何非白名单的
   `@deepseek-ai/*` **值导入**直接构建报错。
   模块表白名单（`packages/client/web/src/platform.ts:8`）：
   `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、
   `@deepseek-ai/cordis`、`-client-store`、`-client-ui-slots`、`-client-ui-primitives`、`-client-ui-dockkit`。
   注意是 **`@deepseek-ai/cordis`**，不是 `cordis`（两个三方插件都错写成 `cordis`，
   无害但是无效的）。
2. **样式**：`docs/web-styling.md:16` **禁止 Tailwind 和组件库**。
   用 **CSS Modules**（`x.module.css` → 哈希类名 + 自动注入 `<style data-plugin>`）
   + `clsx` + `--dsw-alias-*` 语义 token。第三方主题通过 `ctx.theme`。

**⚠️ `dsh.client.inject` 不是 Cordis DI**，只是"工厂到达"的提示，
未知名字会被静默跳过。（`dsh-better-sidebar@0.11.0` 注入了三个
**在 0.1.5-rc.1 里根本不存在**的模块行，靠这个跳过才能启动。）
权威类型是 `DshClientManifest`：`packages/util/package-manifest/src/types.ts:44`，
字段为 `{ platform, inject?, immediately?, external? }`。

构建工具链（来自 `dsh-better-sidebar` scripts）：
`tsc -p tsconfig.build.json`（类型） + `tsdown`（打包 `lib/client.js`）；
React 18，vitest，playwright 做 mount 测试。

### 2.8 前端↔后端通信

- 宿主侧状态 → 客户端：通过 slot 的 **store seat**（`defineStore`）暴露
  `getSnapshot` / `subscribe`，组件用 selector hook 订阅。
- 客户端 → 宿主：通过 client 服务（`dsh-client-modules` / connection 层）与
  `ctx.layout` 这类控制器。
- `ui-slots` README 明确：引擎产物只带裸快照源，**不带 React hooks**，hook 绑定属于渲染层。

> 具体 RPC 细节我让子代理深挖了，但**架构可行性已经确证**：整页 + 导航 + 响应式 store 都在。

### 2.9 模型可见上下文与会话事件

- `agent.inject(message: UserMessage)` — `packages/core/agent-loop/src/agent.ts:145`，
  向模型注入上下文。**这是把"当前学习状态摘要"喂给 UDT Skill 的正规入口。**
- 会话事件：`exec.agent.session.append("udt/node-status", payload)`（dsh-study 同款），
  并通过 `declare module '@deepseek-ai/dsh-session/types'` 合并进 `SessionEventMap`。
- DSH 硬规矩（plugin-write）：**模型看到的一切必须能从 session log 重建。**

### 2.10 API 稳定性评估

| API | 稳定性判断 | 依据 |
| --- | --- | --- |
| `apply(ctx)` / `name` / `inject` | **稳定**（官方教程核心契约） | `docs/user/develop/basic/index.zh.md` |
| `ctx.effect()` 可逆效应 | **稳定**（架构级不变量） | 同上 + cordis 语义 |
| `ctx.tools.register(defineTool(...))` | **稳定** | 官方 `tool.zh.md` + 多插件在用 |
| `ctx.skills.*` | **较稳定**，provider 签名可能微调 | `packages/skill/skill/src/index.ts` |
| `storageDomain` / `defineDomain` | **较稳定** | 官方持久化接缝，有 `persistence-catalog.md` |
| `dsh.bundle.patch` / profile | **稳定**（分发机制的基石） | `publish.zh.md` |
| `dsh.client` + `exports["./client"]` | **较稳定但仍在演进** | 真实插件在用，但版本号是 `0.1.x-alpha` |
| `SlotMap` 具体 slot key | **会变**（声明合并的键属内部约定） | 各 ui-* 包各自 declare，随 UI 重构变动 |
| 深度 import 内部路径 | **危险，禁止** | plugin-write 明令只用公开导出 |

**版本落差风险（已量化）**：源码 checkout 是 `0.1.5-rc.1`，实际在跑的是 `0.1.6-alpha.2`。
我逐个确认了本产品需要的包在运行版中**全部存在**：
`dsh-storage-domain`、`dsh-skill`、`dsh-skill-filesystem`、`dsh-client-ui-slots`、
`dsh-client-ui-layout`、`dsh-client-ui-sidebar`、`dsh-client-ui-sidebar-right`、
`dsh-client-ui-primitives`、`dsh-client-ui-renderer`、`dsh-client-ui-settings`、`dsh-tools`。

**规则：以运行版（0.1.6-alpha.2）的 .d.ts 为编译基准，peer 范围放宽（`<0.2.0`），
绝不用 `^0.1.0-rc.6` 这种窄范围**（dsh-study 用了窄范围，是个反面教材；
`plugin-release` 明确建议宽范围）。

### 2.11 最适合 UDT 的架构判断

**两半式插件（host + client），薄宿主、厚状态、纯逻辑内核。**

- **host**：一切持久化与工具注册。零教学逻辑。
- **client**：一切渲染。零教学逻辑。
- **纯函数内核**（`roadmap.ts` / `lesson.ts` / `diagnosis.ts`）：零依赖、零 IO、可单测。
- **教学逻辑**：**全部留在 UDT Skill 里**。

### 2.12 已确证的实现陷阱（写代码前必须知道）

这些都是从**真实运行的 harness 与真实插件**里读出来的，不是推测。
其中几条会直接改变架构决策。

**#1 自定义会话事件不可靠（会改变架构）**

`dsh-session/lib/index.js:79` 的 `KNOWN_SESSION_EVENT_TYPES` 是**白名单**。
对不在名单里的事件，只有两条路，都不可用：

```js
// dsh-session-log-deepseek/lib/index.js:56 —— 持久化编码
default:
  if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable === true) {
    /* 标了 ignorable → 原样保留，但语义上是"可以忽略" */
  }
  return { ...common, type: event.type }   // 没标 → payload 被丢弃
```

➡️ **结论：不要在 v0.1 依赖自定义 session event。**
`dsh-whale-report` 曾经写过自定义 `whale/report` 事件，**后来专门回退了**
（见其 `tools.ts:114-116` 注释），原因正是老 session 会因此无法加载。
这是有代价换来的先例，直接采纳。

**#2 `dshClient` 是死键**

`dsh-whale-report` 与 `dsh-minecraft` 的 package.json 里都有一个顶层 `dshClient` 键。
在已安装的运行时代码里全局 grep **零命中**。运行时只读 `dsh.client`。
➡️ 只写 `dsh.client`，别抄那个键。

**#3 client 半侧是受限环境**

- 客户端 bundle 只能从 **`/plugins/<id>/client.js`** 提供，
  其中 **`id` 必须等于 npm 包名**（`dsh-client-modules/lib/index.js:248`）。
- 必须**同时**有 `dsh.client` **和** `exports["./client"]`，
  否则运行时直接抛错 "declares dsh.client but exports no './client' bundle"（`:648-655`）。
- 模块表只服务单文件 → **client 源码里不能有 dynamic import**。
- **样式不能走打包器** → 用 JS 注入 `<style data-plugin>`（whale 与 minecraft 都这么做）。

**#4 npm dist-tag 陷阱**

`@deepseek-ai/dsh-tools` 的 npm `latest` 是 **`0.0.1-rc.1`（陈旧）**，
真正的版本在 `next`（`0.1.5-rc.2`）与 `alpha`（`0.1.6-alpha.2`）。
➡️ **安装 harness 依赖时必须显式指定 dist-tag 或精确版本，绝不裸 `pnpm add`。**

**#5 版本号其实有三层（比预想更复杂）**

| 层 | 版本 | 说明 |
| --- | --- | --- |
| DSH 源码 checkout | `0.1.5-rc.1` | 文档与部分实现参考 |
| **实际在跑的 harness 库** | **`0.1.6-alpha.2`** | 我逐个包确认：`dsh-tools` / `dsh-session` / `dsh-storage-domain` / `dsh-client-ui-slots` / `dsh-skill` 全是这个版本 |
| 插件自己 devDep 里 pin 的副本 | 各不相同（whale pin `0.1.1-rc.2`） | 只用于 typecheck 基线 |

➡️ 实测冲突提示：`dsh-whale-report/node_modules/@deepseek-ai/dsh-tools` 是 `0.1.1-rc.2`，
而顶层解析是 `0.1.6-alpha.2`。**永远以目标 harness 顶层解析到的版本为准。**

**#6 peer 范围要"宽"，devDep 要"钉死"**

whale 的做法是标准答案：peer `>=0.1.1-rc.2 <0.2.0`（**不用 `^`**，
这样在 0.1.5-rc.1 与 0.1.6-alpha.2 上都活），devDependencies pin 一个精确 rc 做类型基线。
反例是 dsh-study 的 `^0.1.0-rc.6`（窄）。

**#7 `apply()` 是最容易被漏测的地方**

`dsh-study` 的 `apply()` **零测试覆盖**，并且它 `.gitignore` 了 `lib/` 又没写
`prepare` 脚本 → **它的 GitHub 安装路径实际上是坏的**。
➡️ 我们两样都要做对：`apply()` 必须有真机测试；必须有
`prepare: "tsdown"` 与 `prepublishOnly: "pnpm build"`。

**#8 顶层 `inject` 只放"保证存在"的服务**

缺一个顶层 inject 的服务会让整个插件树**永久挂起，而且什么都不打印**。
whale 的做法是：只把 `tools` / `sessionQuery` / `storageDomain` 放顶层，
把 `webServer` / `settings` 这类放进**惰性** `ctx.inject([...], …)` 并做能力探测。

⚠️ **访问服务用 `ctx.get(name)`，不要用 `ctx.<name>`**：
未注入的服务上 `ctx.<name>` 会**抛错**（这也是唯一可靠的探测方式），
探测写 `ctx.get('webServer')` 而非 `ctx.webServer ?? …`。

**#9 🔴 绝对不要在命名空间插件里 `export default`**

`Loader.unwrapExports` 优先取 `.default`，会**静默丢掉 `inject`**。
这不是理论风险——DSH 有一篇专门的故障复盘：
`docs/postmortem/0001-acp-default-export-drops-inject.md`。

➡️ 我们的 `src/index.ts` 只写命名导出：
`export const name` / `export const inject` / `export const Config` / `export function apply`。
（对象形态 `export default { name, inject, apply }` 是官方文档里的合法写法，
但混用「命名导出 + default」是最危险的组合，直接避免。）

**#10 🔴 三种 schema 语言，不能混**

| 用途 | 用什么 | 位置 |
| --- | --- | --- |
| **插件 Config** | **Schemastery**（`@deepseek-ai/schemastery`）| `export const Config = z.object({...})` |
| **存储域记录** | **zod**（`zod`）| `domainTable<NodeKey, NodeRecord>(NodeSchema)` |
| **工具参数/输出** | **DSH 自有的 lossless-JSON DSL** | `parameters: { x: { type:'string', required:true } }` |

- Config **必须是 Standard Schema**，传普通对象会**直接失败**
  （Cordis 校验，`registry.ts:104`）。
- 工具 schema **不是 zod 也不是 typebox**（`defineTool` 在
  `packages/core/tools/src/schema.ts:545`），`execute` 返回**一个**规范 JSON 值。
- 工具输出的 `additionalProperties` 校验器**只支持布尔值**。

**#11 系统的三条"看不见的坑"**

- **waterfall 监听器忘了调 `next()` = 静默否决**。
- **pending 插件永远不报错、也不打印** → 排障第一步是 `--dump-config` 看它是否真的激活。
- `turn/*`、`step/*`、`tool/call`、`tool/result` 是**durable session event，不是 Cordis event**；
  要监听得用 `session/event`。

**#12 插件代码不被沙箱约束（安全）**

`ctx.sandbox` **只包裹子进程 argv**；`package.json` 的 `dsh` 契约里
**没有任何 capability / permission 清单**。插件代码在本机以完整权限运行。

➡️ 这既是责任也是卖点：我们的 `README` 应当明确声明
**只读写自己的 storage 域、只在本机 loopback 路由上服务 client、不发起外部网络请求、
不写任何用户文件**——在一个"插件不受限"的生态里，**自律就是信任资本**。

**#13 向系统提示注入内容的正规入口**

`ctx.systemPrompt.section({ name, order, text })`（需 `inject: ['systemPrompt']`），
`order` 必须自己给数字（具名枚举归仓库所有）。

➡️ **这条直接决定了 3.5 节"选项 B"怎么实现**：插件要补充
"以下是 runtime 提供的显式状态，非隐藏记忆"这段说明，就用这个 API，
而不是往对话里塞消息。另：`agent.inject(msg)` 增加的是**持久模型上下文**，
但**不会唤醒空闲 agent**（要唤醒得用 `followup` / `steer`）。

**#14 工具命名与路由前缀**

- 工具名建议 `<subject>_<verb>`（如 `udt_state`、`udt_lesson`），
  **不要**用 minecraft 的 `mc__` 双下划线风格（命名空间冲突风险）。
- 路由前缀 `/<subject>/api`；DOM 属性 `data-<subject>-*`；
  betterSidebar tab id `<npm-name>:<page>`。
- 每个 prefix 路由都要过 trust fence（`isTrustedApiRequest`）+ body 再校验一次
  （"never trust the panel"）。

**#15 名字冲突检查**

npm 上的 `dsh-minecraft` 是**另一个无关项目**（Mineflayer bot）。
➡️ `dsh-diagnostic-tutor` 发布前必须实际查一次 npm，别假设可用。

**#16 🔴🔴 最危险的一条：同一台机器上同时活着三套 harness 版本**

本轮调研发现的**最严重、最实际的隐患**，且已在**本机实测确认**：

| 解析路径 | 实际版本 |
| --- | --- |
| 宿主进程（`dsh` CLI 本身） | **0.1.6-alpha.2** |
| `$DSH_HOME/profiles/node_modules/@deepseek-ai/*` | **0.1.5-rc.1**（symlink 进 rc.1 源码 checkout） |
| npm 装进 `web` profile 的插件（实测 better-sidebar） | 解析到 **`dsh-tools@0.1.5-rc.1`** |
| `link:` 装的插件（whale） | 从自己的 pnpm store 解析到 **`0.1.1-rc.2`** |

alpha.2 里有 `healProfilesModuleFallback` 想修这个，但**本次启动没有生效**
（`$DSH_HOME/profiles/web/.dsh-module-fallback/` 是空的）。

➡️ **由此推出三条必须遵守的编码纪律：**

1. **运行时对象一律从 `ctx` 取**，不要自己 import 一个类再 `new`。
2. **对 `@deepseek-ai/*` 一律用「仅类型」导入**（`import type { ... }`）——
   类型导入编译后消失，不产生运行时解析。
3. **绝对不要 `instanceof` 一个从 `@deepseek-ai/*` 导入的类** ——
   跨版本副本会让它恒为 `false`，而且**失败是静默的**。

这条比"peer 范围写宽"重要得多。宽范围只影响安装，**这三条影响运行时正确性**。

**#17 打包真正承重的只有三件事**

1. `version` **非空**（空则 `profile.ts:364-366` 抛错）；
2. `dsh.bundle.patch`（`plugin.ts:36-45`）；
3. 可解析的 `main` / `exports`。

⚠️ **通配 `./*` 导出会被"打包可执行文件代理"跳过**
（`profile.ts:382-397` 只枚举 `.` 与字面量 `./x`）。
➡️ `exports` 只写 `.`、`./client`、`./package.json`，**不用通配**。

⚠️ alpha.2 新增的 `dsh.manifestVersion` 与 `engines.dsh`
**只是声明、从未被读取**（全量 grep 0 命中）——
"DSH 兼容性在有人实现读取之前只是声明性的"。
➡️ 别指望它们提供保护，版本矩阵得自己写进 README。

**#18 🔴 裸的 `ctx.webServer.register()` 不继承任何鉴权**

DSH **没有插件信任提示、没有能力声明、没有逐插件沙箱**。
装插件 = 以宿主权限在进程内执行任意代码。
三道闸门都在插件之外（pnpm ≥10 的 `allowBuilds`、
alpha.2 `plugin_manager` **工具**的审批、以及只管文件系统的 sandbox）。

而 `ctx.webServer.register()` 的路由**不带认证**。

➡️ `src/api.ts` **必须自己实现 loopback trust fence**
（Host 为环回 + Origin 相等 + `sec-fetch-site` 非 cross-site），
**body 再 sanitize 一次**。三个真实插件各手抄了一份同样的 fence ——
我们也得抄，**这不是可选项**。

**#19 🔴 client bundle 里一个顶层 ESM import 会让所有插件挂掉**

浏览器报错会指向一个**无辜的** entry，排查成本极高。
➡️ 遵守 `__ModuleLoader__` 的 classic-script 契约：产物是**单文件 CJS**，
`require("react")` 只能在 factory **内部**；源码里**不能有顶层 ESM import、
不能有 dynamic import**。

**#20 版本常量陷阱**

在 client bundle 里 grep 版本号时**整包 grep 不够**
（`0.3.1` 会匹配到 `0.3.1-rc.1`）。要精确匹配并只 grep `lib/client.js`；
**bump → rebuild → commit 必须同一次完成**。

### 2.13 版本漂移实证清单（0.1.5-rc.1 → 0.1.6-alpha.2）

这是 `docs/ARCHITECTURE.md` 那张"漂移表"的第一版内容
（逐包 diff，共对比 233 个包）。**对插件作者构成 breaking 的项**：

| 变更 | 影响 |
| --- | --- |
| **`agent/session-start` 事件被移除** | 监听它的代码**永远不触发，且不报错** |
| HMR 包改名 `@deepseek-ai/cordis-plugin-hmr` → **`@deepseek-ai/dsh-hmr`** | 任何覆盖该行 `name` 的 composition 会坏（服务键与事件名未变） |
| `dsh-package-manifest`：`DshManifest` → `DshPackageManifest` | 类型改名；`configTrees` / `sessionFormatMigration` / `profile.patchReload` 从公开类型移除 |
| `dsh.profile.patchReload` 移除 | 配置里的该键失效 |
| **`dsh-client-ui-slots` 变化最大（261 行）** | `SessionProvider` 现在对 `'session'` **或** `'session-maybe'` 都注入；新增 `SlotFactoryMap` / `SlotFactoryDef` / `ScopeStandardProps`；`SessionAreaProps.session` 是新的 |
| `ctx.permissionPresets`：`Service` → `TypertRemoteService`；`PermissionSelect` → `PermissionCatalog` | 形状变化 |
| **`ctx.tools` pre-dispatch 现在支持 allow / deny / cancel / ask** | 新增 `cancel`、`ToolCall.schema`、`ToolErrorInfo.reason` |
| `Session.eventAt` / `snapshotEvents` / `eventsAfter` 标记 `@deprecated` | 原文 "new calls are prohibited" |
| `Session.create` / `fromRestore` 增加尾参 `projections` | 调用签名变化 |
| CLI：`dsh <name>` 现在展开为 `--profile <name>` | rc.1 里 `web` 是硬编码子命令 |

**alpha.2 新增（对插件 UX 重要）**：`@deepseek-ai/dsh-plugin-manager`
（含 `/tools`、`/operations`）与 **`dsh-client-ui-plugin-manager`**
—— **GUI 里可以管理插件了**，这对我们的安装体验是好消息。

⚠️ 规范 skill 的迁移走廊只覆盖到 `0.1.5-rc.2`，
**不存在 `0.1.5-rc.1 → 0.1.6-alpha.2` 的现成卡片**。
上表是逐包 diff 的一手证据，升级前仍需用 release note 复核。

⚠️ **`rc.x ↔ alpha.x` 是前向不兼容的**，且报错症状与病因无关
（典型：`TypeError: useConversation is not a function`）。
➡️ **README 顶部必须放一张 DSH → 插件 版本兼容矩阵。**

### 2.14 CLI 的真实面貌（影响 README 与安装体验）

`dsh plugin --profile <n> <args...>` **不是一套插件子命令，而是 pnpm 的裸转发器**：

```ts
// apps/cli/src/plugin.ts:120-163
spawnSync('pnpm', args, { cwd: profileDir, stdio: 'inherit' })
```

所以"安装/列出/卸载/升级"这些动词**就是 pnpm 的动词**：

```sh
dsh plugin --profile web add <pkg|github:o/r|./path|./x.tgz>
dsh plugin --profile web add dsh-diagnostic-tutor@0.1.0
dsh plugin --profile web list
dsh plugin --profile web remove dsh-diagnostic-tutor
dsh plugin --profile web update dsh-diagnostic-tutor
dsh plugin --profile web why dsh-diagnostic-tutor
```

⚠️ **`--profile` 是 requiredOption** —— `dsh plugin add x` 会直接 exit 1。
⚠️ **没有 `dsh config` 命令**。配置有四个入口：
① `cordis.patch.yml` 的行内 `config:`（Schemastery 校验）；
② `ctx.settings`（`$DSH_HOME/settings.yaml`，命名空间 `^[a-z][a-z0-9-]*$`）；
③ GUI 设置卡（host 半侧注册命名空间 + client 半侧注册进 keyed slot
`settings.plugin.item`，`key: <ns>`）；④ 分层 `.env`。
便利 API 是 **`ctx.settings.installSection(ctx, NS, Schema, entry, hooks)`**，
没有 provider 时会优雅降级为 composition config。

**发行渠道的现实**：DSH **没有任何插件注册表客户端**。
唯一的官方入口是 **GitHub topic `dsh-plugin`**。
社区有几个 awesome 列表和一个 registry（`oh-my-dsh/dsh-plugin-registry`
的索引**目前是空的**），以及 `dsh-market`
（`dsh plugin --profile web add dshmarket`）。

➡️ **可执行的传播动作**：给仓库打上 **`dsh-plugin` topic**，
并考虑向 `dsh-market` / awesome 列表提交。这是目前唯一真实的分发面。

---

## 3. UDT Integration（依赖，不复制）

### 3.1 现有 UDT 的形态

- 仓库 `v2.0.0` 已 tag，MIT，**140 个 skill 文件**，`main...origin/main` 与远端同步。
- `SKILL.md` 是**紧凑路由器**（commit `93ee3c6 rewrite main SKILL.md as compact router`），
  真正的逻辑在 `references/*.md`（按需加载，永不一次全读）。
- **已经原生支持 DSH**：`platforms/deepseek-harness/README.md` 存在，
  `INSTALL.md:32` 写明 "DSH 会直接发现并加载 `<skill-root>/universal-diagnostic-tutor/SKILL.md`"，
  并列出扫描根与优先级——和我从 `skill-filesystem` 源码读到的 rank 表**完全一致**。
- 本机已安装：`~/.agents/skills/universal-diagnostic-tutor` → symlink 到仓库 `skills/` 目录。

### 3.2 现有"状态"机制（我们要接管的那个东西）

UDT 目前唯一的结构化产物是 **Learning State Card**（`references/continuity.md`），
格式固定可解析：

```
- **Subject:**
- **Topic:**
- **Current learning mode:**
- **Already understood:**
- **Still weak:**
- **Current blocker:**
- **Common mistake:**
- **Last successful check:**
- **Next best step:**
- **Suggested continue prompt:**
```

可选字段：语言/水平、active goal、最新练习五元组。
会话内压缩用 **Checkpoint**（What you learned / still weak / mistake / next best step / continue prompt）。

**核心事实：这套卡片是纯散文，靠用户手工复制粘贴跨会话携带。**
它**没有**机器可读 schema、没有稳定 ID、没有关系、不可查询、不可视化。

➡️ **这就是产品的立足点：Learning State Card 是一个声明式的、手工的、易失的状态协议。
本插件把它升级成真正的 Learning Runtime。**

### 3.3 技能的机器可读契约（可用于互操作的部分）

**先说结论：UDT 不产出任何机器可读制品。** 整个 skill 目录里
`grep` 代码块标记 ```json / ```yaml / ```csv → **零命中**。它的调用方式是
100% 由 LLM 阅读 Markdown（`routing.md:151-155` 明确五步：读信号 → 选 1–2 层 →
加载最小参考文件 → 输出自然教师语言 → 在检查点停下）。

但是——**它有大量"封闭词表"（closed enums）**，这才是真正的金矿：

| 契约 | 位置 | 可解析性 |
| --- | --- | --- |
| Core Loop（Clarify→Diagnose→Intervene→Check→Decide→Carry） | `SKILL.md:39-62` | 语义，非数据 |
| 内部 8 步 Adaptive Loop | `routing.md:38-77` | 语义 |
| 教学动作决策表（12 行） | `routing.md:84-97` | 语义，可枚举 |
| **七个状态词** | `mastery_and_decision.md:7-21` | **✅ 封闭词表** `explained / practiced / checked / confirmed / unconfirmed / weak / blocked` |
| **六个 readiness 结果** | `mastery_and_decision.md:34-43` | **✅ 封闭词表** `Advance / Advance with caution / Review first / Step down / Diagnose again / More practice needed` |
| **五个评分标签** | `feedback.md:16-23` | **✅ 封闭词表** Correct / Mostly correct / Partially correct / Incorrect / Cannot grade yet |
| **九种错误→干预类型** | `feedback.md:71-81` | **✅ 封闭词表** Notation / Concept / Method selection / Setup / Proof / Calculation / Transfer / Overgeneralization / Memorized procedure |
| **Knowledge Gap Taxonomy** | `knowledge_gap_taxonomy.md` | **✅ 封闭分类** Vocabulary / Concept / Notation / Procedure / Reasoning / Recognition / Transfer / Misconception / Confidence / Resource |
| **练习阶梯 L1–L7** | `practice_ladder.md` | **✅ 封闭词表** Recognition Check → Basic Concept Check → Worked Example Completion → Near-Transfer → Trap/Misconception → Mixed-Topic → Real-World/Project |
| 模式（Zero-Base / Standard / Advanced / Auto）与深度 Level 1–5 | `teaching_modes.md` | **✅ 封闭词表** |
| 10 个具名 stop point | `teacher_like_stop_point_protocol.md` | **✅ 编号 1,1A,2,3,4,5,5A,6,7,8,9** |
| Learning State Card | `continuity.md:9-22` | ⚠️ 10 个固定 bold 标签 + **自由文本值**，opt-in |
| Checkpoint | `continuity.md:62-67` | ⚠️ 5 个固定标签 |
| Knowledge Link Card | `clarify_and_path.md:130-147` | ❌ **标签被明令禁止**（"Never announce the mechanism: no visible headers like 'Card 1'"）→ 实际不可解析 |
| 练习项 / 评分裁决 / 知识地图 | 多处 | ⚠️ 内部字段从不对外输出，或散文 |
| Source pack 记录 | `source_packs/*.md` | **✅ 唯一真正结构化的运行时数据**：`* Link:` / `* Type:` / `* Best for:` / `* Use when:` 稳定 bullet 记录 |

**这是本项目的技术支点**：UDT 已经把教学判断**枚举化**了——7 状态、6 readiness、
5 评分、9 错误类型、10 缺口类型、7 阶梯、4 模式、11 个 stop point。

➡️ **插件的类型系统应当把这些词表原样搬过来**，物理上杜绝"第二套词汇"
（`mastery_and_decision.md:7-8` 原文就要求 "never invent a second vocabulary"）。

➡️ 同时必须承认：**目前没有可依赖的机器可读状态**。这正是本插件存在的理由。

**两个必须知道的坑：**

1. **State Card 在仓库里有两种不同语法**：`continuity.md:9-22`（`- **Subject:**`）
   vs `output_formats.md:139-151`（`- Subject: [subject]`）。做导出兼容时必须
   选一个并写清，否则"逐字节兼容"是假的。
2. **`SKILL.md` frontmatter 只有 `name` + `description`，没有 `version`**，
   而且 `docs/maintenance_notes.md:27-31` 与 `AGENTS.md:334-336`
   **明令只允许这两个字段**。➡️ **插件无法通过 frontmatter 探测 UDT 版本。**
   替代方案见 3.6。

### 3.4 目标分层

```
┌───────────────────────────────────────────────┐
│  UDT Skill  = 教学决策 (canonical teaching brain) │
│  决定：下一步教什么、怎么解释、何时停、是否降级      │
└───────────────────────┬───────────────────────┘
                        │  typed tool calls（唯一接口）
┌───────────────────────▼───────────────────────┐
│  Plugin Runtime = 状态 / 制品 / 渲染             │
│  持久化 · roadmap · lesson blocks · mastery 记录  │
│  零教学逻辑                                      │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│  Learning State (storage domain `udt` v1)      │
│  可查询 · 可导出 · 可重置 · 用户可见              │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│  Roadmap / Lesson UI (slots: main + panellist) │
└───────────────────────────────────────────────┘
```

**关键架构原则：插件只提供"状态 + 制品 + 渲染"的 API，绝不提供"教学判断"。**
工具设计成 UDT 的**持久化与渲染后端**：

| 工具 | 作用 | 谁做决定 |
| --- | --- | --- |
| `udt_goal` | 记录/读取学习目标与水平 | 用户 + Skill 澄清后写入 |
| `udt_state` | 读学习状态（含 prerequisites、当前 blocker） | Skill 读 |
| `udt_roadmap` | 写入/读取 roadmap 节点（Skill 决定节点与依赖） | **Skill 决定** |
| `udt_lesson` | 写入一节由 Learning Blocks 组成的 lesson | **Skill 决定**内容 |
| `udt_check` | 记录一次 check 的 6-readiness 结果 | Skill 判定 |
| `udt_next` | 返回**确定性**的候选下一步（按 prerequisite 阻塞 + 状态），供 Skill 选择 | 插件只算候选，**Skill 做选择** |

`udt_next` 是唯一有"判断味道"的工具，且刻意设计成**只算候选不排序决策**——
把最终决定权留给 Skill。这是避免逻辑重复的机械化护栏。

### 3.5 ⚠️ 必须正面解决的冲突（比预想的窄，但真实存在）

这是本项目**最重要的一处设计决策**，不能糊过去。

**反对方的原文**（`SKILL.md:166-172` Guardrails）：

> - Never turn mastery tracking into **scores, databases, hidden memory, or a curriculum roadmap**.
> - Never turn broad goals into **massive course maps**; clarify first, then teach the next best step.
> - Never imply **hidden persistence across chats**; cards are visible, copy-pasteable summaries.

`continuity.md:48`：

> Never claim hidden memory: **the card is user-carried data, not storage.**

`clarify_and_path.md:50-51`：

> After a confirmed broad goal, a compact goal-specific map chooses the next step.
> **It is not a course outline or textbook table of contents.**

`routing.md:36`：

> This layer chooses direction; it is **not a course generator, assignment system, or persistent learner model**.

➡️ **你想象中的那张 roadmap（`Machine Learning ├── Python ✓ ├── Linear Algebra ✓ …`）
恰恰就是 UDT 点名禁止的 "curriculum roadmap / course outline"。这是必须先解决的。**

#### 但是——UDT 自己就允许"依赖地图"

关键发现：`knowledge_system_mapping_protocol.md` **明确要求导师绘制知识系统地图**，
并给出前置依赖。它开篇写着：

> The goal is orientation, **not a course roadmap**.

它的合法地图长这样（协议原文示例）：

> "机器学习 -> 优化 -> 梯度下降。前置是函数、导数/梯度、loss 和参数更新。"

它禁止的是（同文件 Anti-Patterns）：

> - **Long curriculum roadmaps** for a single problem.
> - **Listing every prerequisite in a course sequence.**
> - Starting with taxonomy instead of teaching the learner's blocker.

**所以真正的界线不是"有没有地图"，而是：**

| 维度 | ❌ 被禁止（课程大纲） | ✅ 被允许（诊断地图） |
| --- | --- | --- |
| 来源 | 事先展开的学科目录 | **由诊断证据逐步揭示** |
| 范围 | 整门课的完整先修链 | 当前 blocker + 它的直接前置 |
| 时序 | 预设教学顺序（第1周…第8周） | **可逆，证据改变即改** |
| 状态 | 进度百分比 / 绩点 | 7 状态词 + 证据，`unconfirmed unless checked` |
| 呈现 | 一次性倾倒 | 一眼可读、渐进增长 |

➡️ **结论：把 roadmap 重新定义为"诊断地图（diagnosis map）"而不是"课程大纲"，
就能同时满足你的产品愿景和 UDT 的 guardrails。** 这不是文字游戏——
它带来一个真实的设计约束：**节点只能因诊断而出现，且在 check 之前状态必须是 `unconfirmed`。**

#### 逐条判定

| Guardrail | 真实意图 | 本插件是否违反 |
| --- | --- | --- |
| 反对 scores | 反对把学习变成打分/绩点 | **不违反**。只存 7 状态词，不存分数/百分比/星级 |
| 反对 hidden memory | 反对**偷偷**记住、假装记得 | **不违反（有条件）**：状态必须永远可见、可导出、可删除 |
| 反对 databases | 反对把导师变成黑箱档案柜 | **⚠️ 字面冲突**。意图是"不能有学习者看不到的记忆" |
| 反对 curriculum roadmap | 反对**事先展开**的课程大纲与预设教学顺序 | **⚠️ 取决于设计**：渐进、诊断驱动、可逆即可；否则违反 |
| 不暗示跨会话持久化 | Skill **自身**不假装有记忆 | **不违反**：持久化由 runtime 显式承担 |

**我的判断：问题不是"要不要违反"，而是"谁来承担持久化"，
以及 roadmap 是否愿意接受"诊断驱动、渐进、可逆"的约束。**
UDT 禁止的是 *Skill* 假装记得；runtime 提供**显式、可见、用户拥有**的状态是升级而非背叛。

#### 还有一条容易踩的雷：**信息隔离（no leakage）**

`no_internal_tool_leakage_protocol.md:66-79` 有一份**逐词扫描清单**，
禁止下列词出现在**面向学习者的输出**里：
`"Skill"`、`"protocol"`、`"version"`、`"V1"`、`"repository"`、`"file"`、`"loaded"`。

➡️ **硬性架构约束**：插件的 chrome（面板里显示 "UDT v2.0"、
状态文件路径、"powered by" 徽章、版本提示）**必须待在 UI 里，绝不能进入教学对话文本**。
State 面板可以显示版本；**Chat 里不可以**。

#### 需要你拍板

1. **设计上兑现承诺**（不可妥协的四条）：
   - State 面板是**一等公民**：随时可打开、可导出 JSON / State Card、可一键清空。
   - 存的是**证据与状态**，不是判定：每个节点带 `evidence[]`；**每次会话重新诊断**，
     存储状态是**待验证假设**，不是结论。
   - roadmap 节点**渐进出现**，尊重 "clarify first"；无证据的节点一律 `unconfirmed`。
   - **State Card 导出必须与 UDT 格式兼容**（注意 3.3 的两种语法坑），
     card 仍是可携带的真相来源。

2. **上游是否改动**（三个选项）：

   | 选项 | 做法 | 代价 |
   | --- | --- | --- |
   | **A（推荐）** | 给 UDT 提 **v2.1 amendment**：新增 "Runtime & Learning-Map Protocol" 一节，明确"显式、可见、用户拥有的外部状态 + 诊断驱动地图"是允许的，并附 runtime 四条义务；顺带加一个 `version` 标识（见 3.6） | 需改上游；且 UDT 处于 **V2.0 Release Freeze**（`AGENTS.md:318-329`：2.0 线只修明确 bug），需你**显式解冻**；`AGENTS.md:329` 还要求未经你批准不得 push/tag/release |
   | **B** | 插件自带 **UDT adapter 补充层**（额外注入一小段 prompt），声明"以下为 runtime 提供的显式状态，非隐藏记忆"，不动上游 | 快；但"插件悄悄改了教学大脑行为"，长期会与上游分叉 |
   | **C** | 无视冲突，做完整的课程式 roadmap | **不可接受**。同时破坏 UDT 一致性与本项目可信度 |

   **我建议 A，v0.0.x 阶段先用 B 做技术验证，v0.1.0 之前完成 A。**

   > **B 的具体实现机制已经确证**：用 `ctx.systemPrompt.section({ name, order, text })`
   > （见 2.12 #15）注入一小段"runtime 状态语义"说明，
   > **而不是**往对话里塞消息 —— 后者会污染学习者的对话记录，也会踩到
   > `no_internal_tool_leakage_protocol.md` 的禁词扫描。

   > 注意：UDT 的 `AGENTS.md:126-127` 写的是
   > "Do not add persistent memory, databases, telemetry, accounts, or storage
   > **unless explicitly requested**" —— **这个例外条款正好由你（项目所有者）来触发。**

   > 这也正好是**传播性支点**：README 里可以有一节
   > "为什么我们的 roadmap 不违背 diagnosis-first"，这是会被转发的设计论证。

### 3.6 UDT 版本探测（没有 version 字段，怎么办）

`SKILL.md` frontmatter **只有 `name` + `description`**，
而 `docs/maintenance_notes.md:27-31` 与 `AGENTS.md:334-336`
**明令禁止添加其它字段**。所以：

❌ 不能读 frontmatter 的 `version`。

**可行方案（按推荐度）：**

1. **路径 + 内容指纹**：`ctx.skills.list()` 返回的 `SkillSummary.path`
   （见 `packages/skill/skill/src/index.ts:56-71`）给出 skill 的绝对路径 →
   插件记录该路径 + 对关键文件做内容哈希 → 存进自身 state。
   **纯读取、零上游改动**，可以在 v0.0.1 就做。
2. **读 git tag**：若该路径在 git 仓库内，`git describe --tags`（只读）。
   本机 `git describe` = `v2.0.0-5-gcbc2d1b`，信息量足够。
3. **能力探测（推荐与 1 组合）**：不判版本号，只判**能力**——
   例如"references/knowledge_system_mapping_protocol.md 是否存在"、
   "references/continuity.md 里是否出现某串标记"。
   这比版本号更健壮，也符合"以实际代码为准"的原则。
4. **上游加一个 `VERSION` 文件或 `version` frontmatter**（选项 A 的一部分）。

➡️ **v0.1.0 的验收要求：UDT 缺失或版本不匹配时，必须明确提示并优雅降级，
绝不静默失败**（plugin-write 的硬规矩："Fail explicitly on configuration errors"）。

---

## 4. V0.1 产品结构

四个模块，职责严格分离：

### 4.1 Chat（入口，不是主体）

- 复用 DSH 原生对话，**不自建聊天**。
- 职责：自然语言目标输入、教学对话、check 的问答发生地。
- 与其它模块的接口：Skill 通过工具调用写状态 → 状态变化 → UI 响应式更新。
- **Chat 只是三个入口之一**（另两个：Roadmap 点击、State 面板），这是"App 而非 Chat+Prompt"的关键。

### 4.2 Roadmap（导航与进度）

- **整页 main 面板**（`main` slot, key `udt-roadmap`）+ 左侧栏图标（`sidebar.panellist`）。
- 内容：节点树、prerequisite 连线、节点状态（7 词表着色）、当前焦点、Next Best 高亮。
- 交互：点击节点 → 打开 Lesson 页；hover 显示 blocker/evidence 摘要。
- **不代表预先存在的课程大纲**：节点随诊断增长，且可被 Skill 增删改。

### 4.3 Lesson（学习发生地）

- **整页 main 面板**（key `udt-lesson`，带 nodeId 参数）。
- 由 **Learning Blocks** 组成（见第 6 节），不是一大段 Chat Markdown。
- 页尾固定是 check / next-step 区域。
- 每个 block 可由 Skill 生成，但**渲染与校验由插件负责**。

### 4.4 Learning State（可观测与拥有权）

- 一个面板 + 一个设置页。
- 展示：当前目标、模式（Zero-Base/Standard/Advanced）、节点状态、blocker、证据、
  最近练习、以及**当前 UDT Skill 的版本与来源**。
- 动作：导出 State Card（UDT 兼容格式）、导出 JSON、清空、手动纠错。
- **这个模块是第 3.5 节冲突的解药**——把"可见、可拥有"做成产品特性，而不是隐私脚注。

### 4.5 数据流

```
用户: "我想学机器学习"
   │
   ▼
Chat ──(UDT Skill 澄清: 目标/水平/用途)
   │
   ▼  udt_goal
State ◄──────────────────────────────┐
   │                                  │
   ▼  udt_roadmap (Skill 产出紧凑地图) │
Roadmap 渲染（渐进节点）               │
   │                                  │
   │ 用户点击节点                      │
   ▼                                  │
Lesson 渲染 ◄── udt_lesson (Skill 产出 blocks)
   │                                  │
   ▼  udt_check (Skill 判 readiness)  │
State 更新节点状态 ────────────────────┘
   │
   ▼  udt_next → 候选 → Skill 选 next best
Roadmap 高亮 Next Best Lesson
```

---

## 5. 数据模型（初步，刻意不过度设计）

存储域 `udt` v1，五张表。**刻意不做的事**：不建 `MasteryState` 独立表
（状态就是 node 上的字段，正对应 UDT 的"concept-level status"）；
不建 `Session` 表（复用 DSH 原生 session + 事件日志）。

```ts
// 全部词汇直接复用 UDT 的封闭词表，物理上不发明第二套
// (mastery_and_decision.md:7-8 原文: "never invent a second vocabulary")
type UdtStatus = 'explained' | 'practiced' | 'checked'
               | 'confirmed' | 'unconfirmed' | 'weak' | 'blocked'

type Readiness = 'advance' | 'advance-with-caution' | 'review-first'
               | 'step-down' | 'diagnose-again' | 'more-practice'

type GradeLabel = 'correct' | 'mostly-correct' | 'partially-correct'
                | 'incorrect' | 'cannot-grade-yet'

type ErrorType = 'notation' | 'concept' | 'method-selection' | 'setup'
               | 'proof' | 'calculation' | 'transfer'
               | 'overgeneralization' | 'memorized-procedure'

type GapType = 'vocabulary' | 'concept' | 'notation' | 'procedure'
             | 'reasoning' | 'recognition' | 'transfer'
             | 'misconception' | 'confidence' | 'resource'

type Rung = 1 | 2 | 3 | 4 | 5 | 6 | 7   // practice_ladder.md L1–L7

type Mode = 'auto' | 'zero-base' | 'standard' | 'advanced'
```

| 表 | key | 字段（要点） |
| --- | --- | --- |
| `courses` | `courseId` | `id, title, goal, motivation(exam/project/…), learnerLevel, mode, createdAt, activeNodeId?` |
| `nodes` | `nodeId` | `id, courseId, title, kind(concept/prerequisite/…), prerequisites: nodeId[], status: UdtStatus, summary, order, evidence: Evidence[], updatedAt` |
| `lessons` | `lessonId` | `id, nodeId, title, blocks: Block[], origin: 'skill', createdAt` |
| `checks` | `checkId` | `id, nodeId, lessonId, prompt, response?, expectedReasoning?, readiness?: Readiness, grade?: GradeLabel, errorType?: ErrorType, gapType?: GapType, rung?: Rung, at` |
| `learner` | `learnerId` (单例) | `preferredLanguage, modePreference, activeCourseId, updatedAt` |

```ts
interface Evidence {
  kind: 'check' | 'practice' | 'explanation' | 'transfer'
  at: string           // ISO
  readiness?: Readiness
  note?: string
}
```

**设计要点与理由：**

1. **`status` 用 UDT 七词表原样**，不引入分数、百分比、星级。这是第 3.5 节冲突的兑现。
2. **`evidence[]` 随节点存**——"状态即假设"落地：状态旁边永远能看到它凭什么。
3. **`prerequisites` 是 node id 数组**，让 `udt_next` 能算"最早阻塞的前置节点"，
   这正是 UDT "pick the earliest blocking prerequisite" 的确定性部分。
4. **不做跨 course 的全局 mastery**。UDT 明确"掌握是针对当前概念的证据，不是永久标签"。
5. **不写自定义会话事件**（重要修正，见 2.12 陷阱 #1）。
   DSH 的 `KNOWN_SESSION_EVENT_TYPES` 不认插件自定义事件：payload 会在持久化时被丢弃，
   或必须标 `ignorable: true` 而被读取方忽略 —— 两条路都不可靠。
   **"模型可见的一切可从 session log 重建"这个要求由工具调用本身满足**：
   `tool/result` 是已知事件类型，会被正常记录。
   状态真相在 storage domain，审计线索在工具调用日志，**两者都不依赖自定义事件。**
6. **version: 1 + zod 边界校验**，未来迁移有起点。
7. **缓存失效常量**（借鉴 whale-report 的 `REPORT_SEM` / `INDEX_VERSION`）：
   当 roadmap/lesson 的派生逻辑变化时，用版本常量触发重算，避免陈旧派生数据。

---

## 6. Learning Block System

### 6.1 Schema 原则

一个 **discriminated union**，以 `kind` 区分。契约同时是：
①Skill 的输出格式 ②存储格式 ③渲染器的输入。

```ts
type Lesson = { nodeId: string; title: string; blocks: Block[] }

type Block =
  | { kind: 'text';       md: string }
  | { kind: 'formula';    latex: string; legend?: {sym: string; means: string}[] }
  | { kind: 'example';    title: string; steps: {md: string}[]; takeaway?: string }
  | { kind: 'comparison'; headers: string[]; rows: string[][] }
  | { kind: 'code';       lang: string; source: string; caption?: string }
  | { kind: 'diagram';    spec: string; format: 'mermaid' | 'svg' }
  | { kind: 'quiz';       prompt: string; choices?: string[]; answer: string; why: string }
  | { kind: 'practice';   task: string; rubric: string[]; hint?: string }
  | { kind: 'check';      prompt: string; expect: 'reasoning' | 'answer' }   // stop-and-wait
```

**三条铁律：**

1. **未知/畸形 block 必须降级为 `text` 而不是抛错**——LLM 输出不可靠，
   一节 lesson 不能因为一个坏 block 整体白屏。（这是 lesson 生成不稳定风险的主要缓解。）
2. **`check` block 是 stop-and-wait 的载体**：渲染成"到此为止，等你回答"的状态，
   不显示后续 block。这是 UDT "绝不在参与式检查后继续"在 UI 层的强制实现——
   **产品把教学纪律做进了渲染器**。
3. **`quiz` 的 `answer`/`why` 不默认渲染**，只在用户作答后揭示（对齐 dsh-study 的
   "答案只出现在工具返回值里，老师看得到"）。

### 6.2 版本分配

| Block | v0.0.x | **v0.1** | 以后 | 理由 |
| --- | --- | --- | --- | --- |
| `text` | ✅ | ✅ | | 一切的基础 |
| `formula` | | ✅ | | STEM 必需，UDT 的 `math_formatting_protocol.md` 已有 LaTeX 规范 |
| `example` | | ✅ | | 教学价值最高的 block，UDT 反复强调 intuition/example 先行 |
| `quiz` | ✅ | ✅ | | 闭环必需（Check 环节） |
| `check` | ✅ | ✅ | | 闭环必需，stop-and-wait |
| `comparison` | | ✅（廉价） | | 纯表格渲染，成本极低，教学价值高 |
| `practice` | | ⭕ 可选 | | 有 rubric 渲染才完整；可推到 v0.2 |
| `code` | | | ✅ v0.2 | 需要高亮/复制/运行讨论，成本不低 |
| `diagram` | | | ✅ v0.2 | mermaid 渲染要引依赖（重依赖风险），但视觉冲击力最大 → 优先级高 |
| 交互式（可运行的模拟） | | | v0.3+ | 成本高 |

**v0.1 的 5 个 block（text / formula / example / quiz / check）+ comparison，足够撑起完整闭环。**

---

## 7. 版本路线图

每个版本三段式：**用户能看到的新东西 / 技术目标 / 验收标准**。

### v0.0.1 — 架构成立性证明

- **用户可见**：DSH Web 里左侧栏多一个图标，点开有一个空面板写着 "Diagnostic Tutor"。
- **技术目标**：仓库骨架成型；`dsh plugin add` 成功；`dsh --profile --dump-config` 出现本包层；
  host 插件 `apply` 被调用；storage domain 能 open/close；client 半侧 build 出 `lib/client.js`
  并在浏览器挂载成功。
- **验收**：冷启动真实 DSH → 面板可见、控制台无错、卸载插件后面板消失且 storage 关闭（可逆效应）。

### v0.0.2 — Goal 与状态往返

- **用户可见**：面板里能显示学习目标与一句话状态；Chat 里说目标后，面板刷新。
- **技术目标**：`udt_goal` / `udt_state` 两个工具；host→client 状态推送（store + subscribe）打通；
  UDT Skill 探测（`ctx.skills.list()`）并在 State 面板显示其版本/来源。
- **验收**：一次真实对话写入目标 → 重启 DSH → 数据仍在 → 面板正确显示；
  单测覆盖 schema 边界（坏数据被拒）。

### v0.0.3 — Roadmap

- **用户可见**：**可视化 roadmap 出现**，节点可点击，状态用颜色/符号区分，Next Best 高亮。
  渐进出现，不是一次展开全图。
- **技术目标**：`udt_roadmap` 工具；`nodes` 表；`roadmap.ts` 纯函数（拓扑排序、prereq 解析、
  最早阻塞节点计算）；`main` slot key `udt-roadmap` + `sidebar.panellist` 接通 +
  `ctx.layout.selectPanel` 导航。
- **验收**：对"我想学机器学习"生成 8–15 个节点、依赖合理、可点击；
  节点状态变更后 roadmap 即时反映；roadmap 可导出/清空。

### v0.0.4 — Lesson 与 Learning Blocks

- **用户可见**：**点节点进入真正的 Lesson 页**，由 text / formula / example / quiz / check
  block 组成，排版是 App 不是 Markdown 墙。
- **技术目标**：`lesson.ts` block schema + zod 校验 + 降级策略；`udt_lesson` 工具；
  `main` slot key `udt-lesson`；block 渲染器组件；LaTeX 渲染。
- **验收**：一节真实 lesson 渲染正确；故意塞入畸形 block → 降级为文本而非白屏；
  `check` block 渲染成等待态且后续 block 不显示。

### v0.0.5 — Check → 状态更新 → Next Best

- **用户可见**：在 Lesson 里作答 → 状态反馈 → roadmap 节点变色 → 出现 "Next best lesson" 推荐。
- **技术目标**：`udt_check`（写 6-readiness + gapType）与 `udt_next`（只算候选）；
  `diagnosis.ts` 状态迁移纯函数；会话事件 `udt/check-recorded`。
- **验收**：**完整闭环跑通** Goal→Roadmap→Lesson→Check→Progress→Next Lesson；
  `udt_next` 在存在阻塞前置时**绝不推荐后面的节点**。

### v0.0.6 — 产品化打磨

- **用户可见**：State 面板可导出 UDT 兼容 State Card、可清空；设置页；
  空状态/加载态/错误态；英文+中文文案。
- **技术目标**：`dsh-plugin.naming.json` 校验通过；宽 peer 范围；
  设置命名空间接入；i18n；README 与演示。
- **验收**：从零安装到看见 roadmap ≤ 3 条命令；一键导出可粘贴回 UDT 的 State Card。

### v0.1.0 — 第一个可试玩的 MVP 🎯

- **用户可见**：完整、稳定、好看的闭环；30 秒能演示；
  README 首屏一眼看懂；`dsh plugin --profile web add dsh-diagnostic-tutor` 装完即用。
- **技术目标**：预构建产物发布（npm 或 tarball，**避免 GitHub 源码安装的 `prepare` + `allowBuilds` 摩擦**）；
  UDT 依赖检查与友好降级（缺 Skill 时明确提示而非静默失败）；
  单测 + 真实 mount 测试；CHANGELOG。
- **验收**：
  1. 全新机器 `dsh plugin add` → 冷启动 → 完成一次 Goal→…→Next Lesson 全流程；
  2. 卸载后无残留（无孤立 storage 文件、无路由冲突）；
  3. README 含 <30s 演示 GIF；
  4. 第 3.5 节冲突已按选项 A 落定（UDT amendment 或明确 adapter）。

---

## 8. 风险

按"会不会杀死项目"排序。

### R1 — DSH Plugin API 变化（高概率，中影响）

`0.1.x-alpha` 阶段，`dsh.client` 与 `SlotMap` key 属最易变部分。
**实测存在三层版本**（见 2.12 #5）：源码 `0.1.5-rc.1`、运行库 `0.1.6-alpha.2`、
插件自 pin 的副本各不相同。这本身就是一个持续的漂移源。

**缓解**：
- 只 import 公开导出；**绝不深度 import** 内部路径（plugin-write 明令）。
- peer 用 **`>=0.1.1-rc.2 <0.2.0`**（不用 `^`）；devDeps 钉死**已验证的运行版**做类型基准。
- 把 DSH 接触点收敛到少数文件（`src/index.ts` + `src/client/index.ts` + `src/api.ts`），
  业务逻辑放纯函数内核 → API 变动时改动面可控。
- 顶层 `inject` 只放保证存在的服务；易变服务用惰性注入 + `'x' in ctx` 探测
  （见 2.12 #8）。
- **把 whale-report 的 `docs/ARCHITECTURE.md:134-140`「兼容性漂移表」抄过来**：
  逐条记录我们依赖的服务名与 slot key、验证过的 harness 版本。
  这是升级时唯一能救命的文档。
- 每次升级跑「冷启动 + 一条完整用户回合」（plugin-test 的硬要求：
  typecheck / dump-config / mock Context **都不能替代真机运行**）。
- ⚠️ **已知不稳定项**：自定义 session event（2.12 #1）**直接不用**，
  这样这类风险被从架构里移除，而不是被管理。

### R2 — Skill / Plugin 教学逻辑重复（中概率，高影响）

最大的一致性风险：插件里悄悄长出第二套教学逻辑。

**缓解**：
- **机械护栏**：插件工具只做状态与制品；唯一的"判断型"工具 `udt_next` 只返回候选、不排序决策。
- `diagnosis.ts` 只做**状态迁移**（词表 + 合法性），不做"该不该继续教"的判断。
- 代码评审清单加一条：**"这个函数是否在替 Skill 做教学决定？"**
- 用 UDT 的 7 状态 / 6 readiness / gap taxonomy **原样**作为 enum，物理上杜绝第二套词汇。

### R3 — UDT guardrail 冲突（产品级风险，见 3.5）

**这不是技术风险，是产品定义风险。** 必须在 v0.1.0 前定案。

- **最危险的具体动作**：把 roadmap 做成"事先展开的课程目录"。
  那会**同时**违反 UDT 的显式禁令，并让产品退化成它声称要取代的
  "AI 课程生成器"——**差异点当场消失**。
- **缓解**：把 roadmap 明确定义为 **diagnosis map**（诊断地图），
  并把它变成不可绕过的实现约束：节点因诊断而出现、无 check 不得 `confirmed`、
  地图可逆、不做百分比进度。
- 上游改动走后文 **选项 A**（v0.1.0 前完成），v0.0.x 用选项 B 过渡。
- **附带风险**：选项 A 需要**显式解冻 UDT 的 V2.0 Release Freeze**
  （`AGENTS.md:318-329`），且 `AGENTS.md:329` 要求未经你批准不得 push/tag/release。
  ➡️ 这是**你的决策**，不是技术债。

### R4 — AI 生成 roadmap 不稳定（高概率，中影响）

LLM 会产出环状依赖、孤儿节点、粒度过粗/过细、节点数量爆炸。

**缓解**：
- **Skill 产出、schema 校验**：zod 校验 + 结构规则（无环、每个非根节点至少一个前置、
  节点数上限 15、必须有 `order`）。
- **纯函数后处理**：`roadmap.ts` 做拓扑排序、环检测、孤儿挂接、超量截断。
- **失败必须大声**（plugin-write 规矩：绝不静默跳过），但 UI 要降级为可用的最小地图。
- **可编辑**：用户/Skill 能修正节点 —— 承认第一次生成不会完美。

### R5 — Lesson 生成延迟（高概率，中影响）

一次 lesson 生成 5+ block 会明显卡顿，摧毁"App 感"。

**缓解**：
- Lesson **小**（3–5 block 上限），这是教学上也是性能上的正确选择。
- 渲染 skeleton（block 逐个出现），不做全屏 spinner。
- 预取：Check 通过后**后台预生成** Next Best 的 lesson。
- 缓存：`lessons` 表持久化，同一节点不重复生成。

### R6 — Context 成本（中概率，中影响）

把整个学习状态塞进 prompt 会让 token 爆炸并污染 KV cache。

**缓解**：
- **状态不整体入 prompt**：注入**紧凑摘要**（当前目标 + 当前节点 + 阻塞项 + 最近一次证据），
  其余由工具按需取。这与 UDT "load the smallest useful set, never load everything" 一致。
- State 面板是 **UI-only**，不进 prompt。
- 注意 KV cache：稳定前缀不要每次变动（plugin-write 明确要求区分
  append-only / 稳定前缀 / 替换 / 独立请求）。

### R7 — UI 与 agent runtime 耦合（中概率，中影响）

UI 若直接依赖 agent 内部状态，会随 DSH 演进一起碎。

**缓解**：
- UI 只依赖**自己插件的 storage domain 快照**（`defineStore` + subscribe），
  不直接读 agent 内部实现。
- host↔client 之间定义**自己的稳定 contract**（就是我们自己的 slot props 类型），
  DSH 的 slot 只是宿主外壳。
- 严格区分：渲染层（client）/ 状态层（host）/ 纯逻辑层（纯函数）。

### R8 — Scope explosion（高概率，高影响）

这是**最可能实际拖垮项目**的风险。愿景极大（"学习空间"），第一版必须残忍地小。

**缓解**：
- 第 7 节每个版本都有**明确验收标准**和"不做什么"。
- 第七节之外的清单（RAG / PDF / flashcard / 日历 / 社区 / 多用户 / 云同步 / 成绩系统 /
  analytics / 移动端 / 大量 AI tools / 抄 HyperKnow）**在 v0.1.0 前一律不做**。
- 判据：一个功能若不能帮"当前 learner 下一步该学什么"这个决策，就不进 v0.1。

### R9 — 版本落差 / 安装 UX（中高影响）

- **三套 harness 版本并存**（2.12 #16）→ 已确认所需包都在，但**运行时对象必须从 `ctx` 取**。
- **`agent/session-start` 被移除、HMR 包改名**（2.13）→ rc.x ↔ alpha.x 前向不兼容，
  且报错症状与病因无关。
- **GitHub 源码安装有构建摩擦**（`publish.zh.md:153-178`）：
  git 安装拉的是源码不跑 build，作者需 `prepare`，用户还要在
  `pnpm-workspace.yaml` 里写 `allowBuilds`（= 允许该包在安装时于本机执行代码）。
  **对"安装是否足够简单"是致命的。**
  ➡️ **v0.1.0 必须预构建分发（npm 或 tarball），把 GitHub 安装降级为开发者选项。**
- **pnpm 11 的 `minimumReleaseAge`（24 小时隔离期）** 会让刚发布的版本装不上 →
  发布日和"让用户马上能装"之间有个时间差，README 要写清。
- **`github:` 的 HEAD 解析会被缓存** → `pnpm install` 会打印 "Already up to date"
  却仍是旧 commit；修法是 `pnpm update <pkg>` 并核对 lockfile 里的 40 位 commit。
- **`--dump-config` 只能证明"行存在"**，不能证明插件跑起来了 →
  验收必须走真机冷启动 + 完整回合。
- 插件名与 UDT Skill 的 `dsh-plugin.naming.json` 需跑官方 validator。

### R11 — 分发现实（中影响，但决定传播上限）

DSH **没有插件注册表**。唯一官方入口是 **GitHub topic `dsh-plugin`**；
社区 registry（`oh-my-dsh/dsh-plugin-registry`）**索引目前为空**。

➡️ 这意味着"被 DSH 用户发现"**没有平台红利可蹭**，只能靠：
① 打 `dsh-plugin` topic；② README 第一屏；③ demo 视觉冲击；④ 已有的
225★ UDT 仓库**反向导流**（UDT README 里加一行"想要真正的学习 App？"）。
**第 ④ 条是我们独有的杠杆，别的插件没有。**

### R10 — 与既有生态插件的定位重叠（低概率，中影响）

`dsh-study`（鲸鱼私塾）已是 DSH 学习插件：课程包 + 主动回忆 + SM-2 间隔重复，
它的 roadmap 里甚至写了 "v0.3：Web 面板 —— 知识图谱"。

**这不构成威胁，反而是好证据**（说明 DSH 用户确实想要学习插件），但**必须在 README 里划清界限**：

| | dsh-study | 本插件 |
| --- | --- | --- |
| 起点 | 已有课程包 | 任意自然语言目标 |
| 核心 | 测验 + 间隔重复（记忆调度） | **诊断**（下一步该学什么） |
| 内容 | 预写课程（`courses/**`） | Skill 生成 + 诊断驱动 |
| 持久化对象 | 复习卡（SM-2 参数） | 学习状态（7 状态 + 证据） |
| UI | Chat 为主 | Roadmap + Lesson 整页 |

一句话：**dsh-study 解决"什么时候复习"，我们解决"现在该学什么"。**

---

## 9. 最终建议（逐条回答你的 11 个问题）

### ① 这个产品一句话是什么

> **一个跑在 DeepSeek Harness 里的 AI 学习应用：它先诊断你卡在哪，再决定教你什么，
> 并把整个学习过程变成一张可点击、可持续的 roadmap。**

英文 tagline：**"From a Tutor Skill to a Learning Runtime."**

### ② 为什么值得做

1. **有真实空白**：DSH 生态有"讲一遍"的 tutor skill、有 SM-2 复习插件（dsh-study），
   但**没有**把"诊断 → 决策 → 制品 → 持久状态 → 可视化"连成闭环的产品。
2. **上游已经成熟且自带品牌**：UDT V2.0 已 tag、MIT、**GitHub 225 stars / 6 forks**，
   140 个 skill 文件，有 EVALS / QUALITY_RUBRIC / FAILURE_TAXONOMY 这类工程化文档，
   还**已经原生支持 DSH**（`platforms/deepseek-harness/`）。
   更重要的是：它把教学判断**枚举化**了（7 状态 / 6 readiness / 5 评分 / 9 错误类型 /
   10 缺口类型 / 7 阶梯 / 4 模式）—— 教学决策这块**不需要重新发明**，这是巨大杠杆。
3. **DSH 恰好支持**：整页 keyed `main` slot + `sidebar.panellist` + `ctx.layout.selectPanel`
   导航 + 官方 storage domain，**都已被真实第三方插件验证过**（whale / minecraft /
   better-sidebar），不是纸上可行。
4. **有独特产品概念**：diagnosis-first 是一个能一句话说清、且别人不容易抄的世界观。
5. **天然可讲**：Skill→Runtime 的升级叙事、roadmap 视觉冲击、before/after 对比，
   都是适合开源传播的素材。
6. **两个项目互相成就**：插件给 Skill 一个真正的 runtime；Skill 给插件一个
   别人抄不走的教学大脑。这是一个**生态位**，不是一个工具。

### ③ 和普通 Tutor / HyperKnow-like 产品的真正差异

普通 AI 学习产品（含 [HyperKnow](https://m.163.com/dy/article/KN0LO5300511B6FU.html)
这类解题引导型产品）问的是：**"我还能生成什么内容？"**
（生成课程、生成题目、生成总结、生成卡片。）

本产品问的是：**"这个 learner 当前最需要的下一步是什么？"**

落到可观测的差异：

| 维度 | 普通 AI 学习产品 | 本产品 |
| --- | --- | --- |
| 起点 | 生成内容 | **诊断状态** |
| Roadmap | 预先展开的课程目录 | **诊断驱动、渐进、可逆的图** |
| Lesson | 一大段 Markdown | **结构化 Learning Blocks** |
| 状态 | 聊天历史（易失） | **显式、可见、可导出、可删除的 runtime state** |
| 掌握度 | 分数 / 百分比 | **UDT 七状态词 + 证据**（刻意不打分） |
| 卡住时 | 换一种说法再讲一遍 | **回退到前置节点 / 换解释方式 / 降一级** |
| 与 Chat 的关系 | Chat 就是产品 | **Chat 是入口之一，Roadmap 与 Lesson 是一等公民** |

最关键的一条：**我们把教学纪律做进了渲染器**（`check` block 强制 stop-and-wait、
quiz 答案作答后才揭示、`udt_next` 在存在阻塞前置时绝不推荐后续节点）。
这是 prompt 层的产品做不到的——它是 runtime 才能提供的保证。

### ④ 推荐 repo 名

**`dsh-diagnostic-tutor`**（GitHub 与 npm 同名，产品全称仍为
"Universal Diagnostic Tutor for DeepSeek Harness"）。
备选 `universal-diagnostic-tutor-dsh`。

### ⑤ 推荐目录结构

见第 1 节末尾的树。核心是四层分离：
`src/`（host）+ `src/client/`（浏览器）+ 纯函数内核（`roadmap/lesson/diagnosis.ts`）+ `tests/`。

### ⑥ DSH Plugin 技术架构

见第 2、3 节。一句话版本：

> **host 插件（`apply(ctx)` + `inject=['tools','storageDomain','skills']`）
> ＋ client 插件（`dsh.client` + `exports["./client"]`，通过 `ui-slots` 占用
> `main`(keyed) 与 `sidebar.panellist`(list)）
> ＋ storage domain `udt` v1 做状态
> ＋ 一组只读写状态/制品的工具，作为 UDT Skill 的后端。**

### ⑦ V0.1 产品框架

见第 4 节：**Chat（入口）/ Roadmap（导航+进度）/ Lesson（Learning Blocks）/
Learning State（可见与拥有权）**，四模块职责严格分离，数据流单向可追溯。

### ⑧ v0.0.1 → v0.1.0 roadmap

见第 7 节：v0.0.1 骨架成立 → v0.0.2 goal+状态往返 → v0.0.3 Roadmap →
v0.0.4 Lesson+Blocks → v0.0.5 闭环 → v0.0.6 打磨 → **v0.1.0 可试玩 MVP**。

### ⑨ 最大技术风险

| 风险 | 等级 | 一句话 |
| --- | --- | --- |
| **R8 scope explosion** | 🔴 最可能拖垮项目 | 愿景太大，第一版必须残忍地小 |
| **R2 教学逻辑重复** | 🔴 架构性、难回收 | 插件里长出第二套教学逻辑 = 项目失去意义 |
| **R3 UDT guardrail 冲突** | 🔴 产品级必修 | roadmap 若不"诊断驱动"就退化成课程生成器，差异点当场消失 |
| **R1 DSH API 漂移** | 🟠 高频但可控 | **三套 harness 版本并存**；用薄适配层 + 漂移表 + 运行时对象取自 ctx |
| **R4 roadmap 生成不稳定** | 🟠 | schema 校验 + 纯函数后处理 + 可编辑 |
| **R5 lesson 延迟** | 🟠 | lesson 小 + skeleton + 预取 + 缓存 |
| **R6 context 成本** | 🟡 | 状态不整体入 prompt，只注入紧凑摘要 |
| **R7 UI/runtime 耦合** | 🟡 | UI 只依赖自己的 storage 快照，不读 agent 内部 |
| **R9 安装 UX** | 🟡 | 必须预构建分发，避开 GitHub 源码安装的 build 授权 |
| **R10 与 dsh-study 定位重叠** | 🟢 | 是生态证据；README 里划清"何时复习 vs 现在学什么" |
| **R11 没有插件注册表** | 🟢 但决定传播上限 | 唯一入口是 GitHub topic `dsh-plugin`；用 UDT 的 225★ 反向导流 |

**最该盯的三个：R8、R2、R3。** 前两个是执行纪律问题，第三个是需要你决策的产品定义问题。

技术风险里 **R1 值得单独警惕**：三套 harness 版本并存是本轮调研最意外的发现，
它的缓解方式很明确（运行时对象取自 `ctx` / 仅类型导入 / 不 `instanceof`），
但**违反时是静默失败**——所以它不是"难解决"，而是"容易看不见"。
**这正好是把它写进 D1 编码纪律、而不是留给后期排查的理由。**

### ⑩ 第一个真正应该写的文件

**分两层回答：**

- **结构上的第一个文件：`package.json`。**
  没有 `dsh.bundle` + `dsh.client`，这个仓库在 DSH 眼里根本不是一个插件。
  它与 `cordis.patch.yml` 一起定义了"这个项目是什么"。

- **真正重要的第一个文件：`src/state.ts`（存储域 schema）。**
  它是**整个产品的语义契约**：数据模型定错，roadmap / lesson / UI / 工具全部要返工。
  它同时锁死第 3.5 节的妥协方案（只存 7 状态词、只存证据、不存分数），
  并把"不发明第二套词汇"变成**类型系统里的约束**而非口头约定。

  **先写 `state.ts`，再写一切。**

### ⑪ 第一周开发顺序

| Day | 做什么 | 当天必须验证 |
| --- | --- | --- |
| **D1** | 定名、建目录（建议移到无空格路径）、`git init`、`dsh-plugin.naming.json`、`package.json`（双 manifest）、`cordis.patch.yml`、tsconfig/tsdown/vitest | `dsh plugin --profile udt-dev add .` 成功；`dsh --profile udt-dev --dump-config` 出现本包层 |
| **D2** | `src/index.ts` 最小 `apply`（只用**保证存在**的服务做顶层 inject）+ 一个 hello 工具 + `storageDomain` open/close（带 disposer）+ `tests/apply.test.ts` | 真实 DSH 冷启动；工具在模型侧可见；**`apply()` 有测试**；卸载无残留 |
| **D3** | **`src/state.ts` 完整 schema**（含 UDT 封闭词表 enum）+ 读写往返 + 单测（含坏数据被拒） | `pnpm test` 绿；重启后数据仍在 |
| **D4** | client 半侧：`tsdown.config.ts` 出单文件 `lib/client.js`；`preview/` 本地预览先跑通；再占 `main`(keyed) + `sidebar.panellist` 一个空面板 | 先在 preview 里看到面板；再在真实 GUI 点图标切过去，控制台无错 |
| **D5** | `src/api.ts` 前缀路由 + trust fence；打通 host→client 状态推送；面板真实显示 storage 里的数据 | **"技术架构成立"的现场证据**（截图/录屏） |
| **D6** | UDT Skill 探测（`ctx.skills.list()` → path + 指纹 + 能力探测）+ State 面板显示来源；错误降级 | 移走 skill → 面板明确提示而非崩溃 |
| **D7** | 写 README 骨架 + `docs/ARCHITECTURE.md` 漂移表 + 录 30 秒 demo；冻结 **v0.0.1**，打 tag | 按 README 从零走一遍能复现 |

**第一天就要内建的纪律**（否则后面要返工，且违反时多是静默失败）：

- 不写自定义 session event（#1）
- 不用 `dshClient` 死键（#2）
- **只用命名导出，绝不 `export default`**（#9）
- **不发散 schema 语言**：Config=Schemastery / storage=zod / tool=自有 DSL（#10）
- **运行时对象一律从 `ctx` 取；`@deepseek-ai/*` 只用 `import type`；绝不 `instanceof`**（#16）
- peer 用宽范围 `>=0.1.1-rc.2 <0.2.0`（#6）
- 顶层 `inject` 只放稳定服务；探测用 `ctx.get(name)`（#8）
- `api.ts` 路由必须自带 trust fence（#18）

> D5 结束时应能录出第一段有传播力的素材：**一个真实 App 面板，数据来自 agent runtime。**

---

## 10. 需要你拍板的三件事

在我开工前，有三件事需要你的决定：

1. **目录位置**：移到 `<this-repo>`（推荐 A），
   还是就地初始化（B）？
2. **仓库名**：`dsh-diagnostic-tutor`（推荐）还是 `universal-diagnostic-tutor-dsh`？
3. **UDT guardrail 冲突**（3.5 节）：选 A（给 UDT 提 v2.1 amendment，推荐）、
   B（插件自带 adapter 层）、还是别的方案？

这三点定了，D1 就可以开始。

---

## 附：本次调研中确证的关键事实索引

| 事实 | 证据路径 |
| --- | --- |
| 插件 = 导出 `apply` 的模块 | `docs/user/develop/basic/index.zh.md:17` |
| 三种插件形态 | `docs/user/develop/basic/index.zh.md:105-138` |
| `ctx.effect()` 可逆清理 | `docs/user/develop/basic/index.zh.md:66-85` |
| bundle vs profile | `docs/user/develop/basic/publish.zh.md:9-16` |
| bundle 最小结构 | `docs/user/develop/basic/publish.zh.md:26-62` |
| 安装命令与 dump-config | `docs/user/develop/basic/publish.zh.md:80-107` |
| 层顺序 + config 整体替换 | `docs/user/develop/basic/publish.zh.md:114-127` |
| GitHub 安装的 build 摩擦 | `docs/user/develop/basic/publish.zh.md:153-178` |
| 真实 profile 的 bundles 列表 | `~/.dsh/profiles/web/package.json` |
| client 插件 manifest（`dsh.client`） | `~/.dsh/profiles/web/node_modules/dsh-better-sidebar/package.json` |
| bundle patch 只 insert 一行 | 同目录 `cordis.patch.yml` |
| `main` keyed slot（可放整页） | `packages/client/ui-layout/src/client/index.ts:46` |
| `sidebar.panellist` list slot | `packages/client/ui-sidebar/src/client/contract/slots.ts:40` |
| `sidebar.right.pane.tab` | `packages/client/ui-sidebar-right/src/client/contract/slots.ts:40` |
| `ctx.layout.selectPanel` | `packages/client/ui-layout/src/client/service.ts` |
| slot 系统为 client 插件而设 | `packages/client/ui-slots/README.md` |
| `defineTool` 工具 DSL | `dsh-study/src/tools.ts` + `docs/user/develop/basic/tool.zh.md` |
| 存储域 `defineDomain` | `dsh-study/src/state.ts` |
| `ctx.skills.registerProvider` | `packages/skill/skill-badge/src/index.ts:59` |
| Skill 扫描根与 rank | `packages/skill/skill-filesystem/src/index.ts:246-254` |
| `agent.inject()` 注入上下文 | `packages/core/agent-loop/src/agent.ts:145` |
| `ctx.systemPrompt.section()` 注入系统提示 | `packages/core/system-prompt`（需自己给数字 `order`） |
| **`export default` 会静默丢掉 `inject`** | `docs/postmortem/0001-acp-default-export-drops-inject.md` |
| **三套 harness 版本并存（本机实测）** | 宿主 `0.1.6-alpha.2` / profiles fallback `0.1.5-rc.1` / link 插件 `0.1.1-rc.2` |
| **Config=Schemastery、storage=zod、tool=自有 DSL** | `registry.ts:104`、`packages/core/tools/src/schema.ts:545` |
| **裸 webServer 路由无鉴权** | 三个真实插件各手抄一份 trust fence |
| **无插件注册表；官方发现入口是 GitHub topic `dsh-plugin`** | `README.md:46` |
| **`dsh plugin` 是 pnpm 裸转发器，`--profile` 必填** | `apps/cli/src/plugin.ts:120-163`、`args.ts:192` |
| **`engines.dsh` / `dsh.manifestVersion` 声明但从未读取** | alpha.2 全量 grep 0 命中 |
| client bundle 必须是单文件 CJS，顶层 ESM import 会连累所有插件 | `__ModuleLoader__` 契约 |
| UDT 七状态词 / 六 readiness / 五评分 / 九错误 / 十缺口 / 七阶梯 | UDT `references/*.md`（见 3.3） |
| UDT Learning State Card 格式（**两种语法**） | UDT `continuity.md:9-22` vs `output_formats.md:139-151` |
| UDT 反持久化 / 反 roadmap guardrails | UDT `SKILL.md:166-172` |
| UDT **允许** compact dependency map | UDT `knowledge_system_mapping_protocol.md` |
| UDT 已有 DSH 原生支持 | UDT `INSTALL.md:32,43-69` |
| UDT frontmatter **禁止**加字段（无法读版本） | UDT `docs/maintenance_notes.md:27-31`、`AGENTS.md:334-336` |
| UDT V2.0 Release Freeze | UDT `AGENTS.md:318-329` |
| client 构建链（tsc + tsdown + 纯 CJS 单文件） | `dsh-better-sidebar/package.json`、`dsh-whale-report/tsdown.config.ts` |
