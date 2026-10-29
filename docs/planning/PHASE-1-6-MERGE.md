# Phase 1–6 合并执行记录

> 状态（2026-10-29）：Phase 1–6 已全部合并到 `main`；`version` 仍为 `0.1.1`。
> 本文最初是推送前的合并计划；下面的分支 hash 与逐分支复验是 rebase 前的历史记录，rebase 后内容等价、commit hash 已变化。

合并执行记录：

| 阶段 | PR | 结果 |
| --- | --- | --- |
| Phase 1 | [#34](https://github.com/SenmuuuuW/dsh-diagnostic-tutor/pull/34) | 已合并 `7adb8dd` |
| Phase 2 | [#35](https://github.com/SenmuuuuW/dsh-diagnostic-tutor/pull/35) | 已合并 `4093ee2` |
| Phase 3 | [#36](https://github.com/SenmuuuuW/dsh-diagnostic-tutor/pull/36) | 已合并 `cf3ad78` |
| Phase 4 | [#37](https://github.com/SenmuuuuW/dsh-diagnostic-tutor/pull/37) | 已合并 `a04655a` |
| Phase 5 | [#38](https://github.com/SenmuuuuW/dsh-diagnostic-tutor/pull/38) | 已合并 `58e63ee` |
| Phase 6 | [#39](https://github.com/SenmuuuuW/dsh-diagnostic-tutor/pull/39) | 已合并 `3d88a6c` |

## 1. 分支拓扑（rebase 前历史）

分支是一条线，不是并行分叉：

```text
main 3f0ef8a
  └─ feat/phase1-content-sources   7487fe6  (10 commits)
       └─ feat/phase2-today-plan   deed752  (+2)
            └─ feat/phase3-review-model 903841d (+2)
                 └─ feat/phase4-review-ui 2537c47 (+2)
                      └─ feat/phase5-review-sync afa9b3e (+2)
                           └─ feat/phase6-insights 4bf7574 (+2, HEAD)
```

因此**按顺序 merge 时不会产生代码冲突**；只有 `main` 在这期间前进，才需要逐层 rebase。

| 阶段 | 分支 | 内容 | tests | tools | HTTP routes | tables | browser |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `feat/phase1-content-sources` | 数学、6 类内容 block、引用、来源、未知类型 | 620 | 13 | 21 | 10 | 21 |
| 2 | `feat/phase2-today-plan` | Today 计划、`/plan/ics`、任务完成 API | 627 | 15 | 22 | 11 | 21 |
| 3 | `feat/phase3-review-model` | `review_cards`/`review_log`、本地调度、任务完成 UI | 632 | 18 | 23 | 13 | 21 |
| 4 | `feat/phase4-review-ui` | Review tab、`/review`、`/review/grade` | 635 | 18 | 25 | 13 | 23 |
| 5 | `feat/phase5-review-sync` | flashcard 自动入队、`/review/undo` | 635 | 18 | 26 | 13 | 23 |
| 6 | `feat/phase6-insights` | Insights tab、`/insights` | 639 | 18 | 27 | 13 | 25 |

### 逐分支复验（2026-10-28）

在临时 worktree 上共享当前 `node_modules`，逐分支执行 `tsdown` + Vitest，避免重复安装；6 个阶段全部通过，且与上表一致：

| 分支 | 命令结果 | tests |
| --- | --- | ---: |
| Phase 1 `7487fe6` | exit 0 | 620 |
| Phase 2 `deed752` | exit 0 | 627 |
| Phase 3 `903841d` | exit 0 | 632 |
| Phase 4 `2537c47` | exit 0 | 635 |
| Phase 5 `afa9b3e` | exit 0 | 635 |
| Phase 6 `4bf7574` | exit 0 | 639 |

> 说明：worktree 中直接运行 `tsdown` + `vitest`，因为共享 `node_modules` 时 pnpm 的依赖状态检查会拒绝 `pnpm test`；这不是产品/测试失败。真实合并后仍按第 4 节用 `pnpm install --frozen-lockfile && pnpm test` 验收。

当前 Phase 6 分支自检结果：

- Phase 1–6 已全部合并到 `main`
- `git diff --check main..HEAD`：通过
- `git diff main..HEAD -- package.json`：`version` 仍为 `0.1.1`；新增 host-only `katex@^0.16.47`
- 新增的 `@deepseek-ai/dsh-tools` 使用与 `main` 既有模式一致；没有引入新的 DSH 包
- 合并后 `main` 为 `3d88a6c`，工作区 clean

## 2. 推荐合并策略

### 方案 A（推荐）：6 个顺序 PR

每个 Phase 一个 PR，后一个基于前一个，不 squash 掉阶段边界：

1. `feat/phase1-content-sources` → `main`
2. `feat/phase2-today-plan` → `main`（Phase 1 合并后）
3. …直到 Phase 6

优点：

- 每个 PR 的测试/迁移/兼容性可以独立验收；
- 教学设计边界（Phase 1 内容、Phase 2 计划、Phase 3–5 复习、Phase 6 洞察）可独立 review；
- 出问题时能只回退一层，不需要回退整个 20-commit 大 PR。

缺点：需要 6 次 review，且每次 `main` 前进后要处理文档计数/章节冲突。

### 方案 B（不推荐）：单个大 PR

20 个 commit 一起合并。代码冲突更少，但：

- 无法按阶段验证存储追加与兼容矩阵；
- review 很难看清“哪一层引入了什么边界”；
- 回退粒度太粗。

## 3. 冲突热点

如果严格按顺序合并，代码冲突基本为零；文档和计数会反复冲突，这是预期的：

| 热点 | 处理方式 |
| --- | --- |
| `README.md` 的 Tools/API/测试计数 | 按阶段表重新数一遍；不要保留旧数字 |
| `docs/planning/CURRENT-ARCHITECTURE.md` | 表数量、工具数、路由数、实现历史、测试数 |
| `CHANGELOG.md` | 保留 Phase 1–6 的 Added 段，合并后统一整理 |
| `docs/design/ui-baseline/README.md`、`index.html` | 截图和计数按阶段追加 |
| `src/api.ts` | 路由按阶段追加；确认没有重复的 `/plan/*`、`/review/*`、`/insights` |
| `src/state.ts` | 表按追加顺序，domain version 保持 1；不要改已有表 key |
| `src/tools.ts` | 工具注册顺序；工具总数 18；测试列表按字母序 |
| `src/client/map-panel.tsx` | 四个 tab 的顺序/页签测试数量；窄屏 400px 回归 |
| `src/client/design-text.ts` | en/zh 必须成对添加；漏一个会 TS 报错 |
| `scripts/path-check.mjs` | 场景列表追加；按阶段更新通过数 |
| `pnpm-lock.yaml` | `katex` 及其 transitive 依赖保持锁定；不要手改 |

## 4. 每个 PR 的验收命令

在目标分支上运行：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm doctor
```

浏览器回归需要先构建并启动预览：

```bash
pnpm build
pnpm preview
# 另一个终端
node scripts/path-check.mjs http://127.0.0.1:8391/ /tmp/udt-merge-check
```

验收标准：

- `pnpm test` 的数量与该阶段表一致（或更多）；
- `pnpm build` 退出 0，且 `lib/client.js` 不含 Node built-in / zod；
- `pnpm doctor` 退出 0；允许原先已存在的 AP物理1 stale request 警告；
- `path-check` 数量不低于该阶段表；
- 真实 learner data 不被测试写入；`pnpm doctor` 只读。

## 5. DSH 兼容矩阵（boot 已跑；完整会话仍需一次）

README 的兼容承诺：

| 插件 | 已验证 DSH | Node |
| --- | --- | --- |
| `0.1.1` | `0.2.1-rc.3`、`0.2.1-rc.2`、`0.2.0-rc.2`，测试套件也覆盖 `0.1.7-alpha.2` | `^22.19.0 \|\| >=24.0.0` |

**2026-10-29 已完成四版本 boot 矩阵**：`0.2.1-rc.3`、`0.2.1-rc.2`、`0.2.0-rc.2`、`0.1.7-alpha.2` 均通过插件加载、`/overview`、`/diagnostics`、`/plan/ics` 和客户端启动；rc3/alpha.2 还通过了 tarball 安装。详见 [`COMPATIBILITY.md`](COMPATIBILITY.md)。

剩余可选检查：`rc2/rc20` 如需更强结论可补（`rc3/alpha.2` 已完成真实模型完整流程）：

1. 安装插件并加载；
2. 打开 Learning map；
3. 写一次 lesson（含 formula/flashcard）；
4. 打开 Review / Insights；
5. 导出一份 storage 并重载；
6. 确认 `pnpm doctor` 和客户端 bundle 正常。

完整会话结果写回 [`COMPATIBILITY.md`](COMPATIBILITY.md)；不要把“未测”写成“通过”。

## 6. 存储与回滚

- domain `udt` 仍为 **v1**；Phase 1–6 只做 additive 表/字段。
- 新增表：`sources`、`tasks`、`review_cards`、`review_log`。
- 新增字段：lesson MathML、block `sourceRefs`、attempt `responses`、review log 的 previous* 字段。
- 旧代码回滚后仍可读已有核心表/字段，但**下一次写入会丢弃/忽略新表/新字段**。
- 合并/发布前先导出：

```bash
# 通过面板 Data footer 或已存在的导出能力
# 确认 ~/.dsh/storages/udt.json 有备份
cp ~/.dsh/storages/udt.json /tmp/udt-before-phase-merge.json
```

## 7. PR 模板

每个 Phase PR 用同一结构：

```markdown
## Summary
Phase N: <one sentence>

## What changed
- ...

## Boundaries
- No teaching judgement / no mastery inference
- Storage: additive v1 only (tables/fields listed)
- Network: none
- DSH API: no new package; existing host APIs only

## Verification
- [ ] pnpm typecheck
- [ ] pnpm test (N)
- [ ] pnpm build
- [ ] pnpm doctor
- [ ] path-check (N)
- [ ] DSH compatibility: <versions>

## Screenshots
<if UI changed>

## Rollback
Revert this branch/commit; export storage first.
```

## 8. 已知未完成项（不是当前合并阻塞，但不要写成已完成）

- PDF 来源解析：需要 `pdfjs-dist` 依赖审批，未做。
- 对话内 `tool.call.toolview` 卡片：未在 DSH 各版本验证。
- FSRS 精确调度：当前是本地间隔启发式，不是 FSRS。
- flashcard 删除后自动 suspend/删除复习卡：未做，当前只增不删。
- 跨 harness（非 DSH）支持：未做。
- 发布/npm/packaging：未做；本轮不改 version，但分支已按阶段 push。

## 9. 当前立即可做的检查

- [x] 在 Phase 1–6 分支上逐层重跑测试（6/6 通过，见 1.1 表）
- [x] 在 Phase 6 分支上重跑完整验收（639 tests、25 browser、build）
- [ ] 在真实 worktree 中按第 4 节用 `pnpm install --frozen-lockfile` 再跑一次
- [x] 四版本 boot 矩阵（2026-10-29，见 `COMPATIBILITY.md`）
- [x] rc3/alpha.2 的 tarball 安装与客户端加载
- [x] rc3/alpha.2 真实模型会话：lesson → Review 评分/撤销 → Insights
- [ ] 备份 `~/.dsh/storages/udt.json`
- [x] 按顺序开 PR 并合并：Phase 1–6 全部完成
