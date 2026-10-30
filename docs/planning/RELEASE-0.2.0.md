# 0.2.0 发布清单与说明

> 状态：**已发布**（2026-10-29）。`package.json` 为 `0.2.0`；tag `v0.2.0`；npm `latest` 已指向 `0.2.0`。
> 发布提交：`71d1332`；tag 指向该提交。
> 代码基线：`main`（Phase 1–6 全部合并）。

## 1. 版本建议

建议发布 **`0.2.0`**，而不是 `0.1.2`：

- Phase 1–6 是完整功能增量，不是修补；
- 存储新增 4 张 additive 表：`sources`、`tasks`、`review_cards`、`review_log`；
- 对外新增 Today/Review/Insights 三条产品路径；
- 兼容范围与现有 `0.1.1` 相同，但组合面明显变大。

发版前不要继续加功能；只修 P0。

## 2. Release highlights

- **内容**：数学公式（host KaTeX → MathML）、6 类新 block、未知 block 安全回落。
- **输入**：quiz/flashcard 答案记录为 `practice` evidence，不评分、不改知识状态。
- **来源**：本地单文本文件/粘贴文本入库，`sourceRefs` 引用闭环；零网络。
- **Today**：计划项、完成/重开、ICS 导出。
- **Review**：到期队列、四档评分、撤销、flashcard 自动入队。
- **Insights**：只读复习/证据/薄弱节点/课次/计划/来源计数。
- 边界保持：不判掌握、不自动推进、存储 additive v1、插件零网络。

## 3. 本次实际验收结果

### 干净 checkout

在独立 worktree 从 `origin/main` 开始：

```text
pnpm install --frozen-lockfile  OK
pnpm typecheck                  OK
pnpm test                       639 passed (53 files)
pnpm build                      OK
pnpm doctor                     exit 0
path-check                      25 browser cases passed
```

tarball：

- 本地 pack：`dsh-diagnostic-tutor-0.2.0.tgz`，SHA-256 `ab03f615d89d16309dd9577bb921b006f60dcfb30bd6638d1c3e3fb33aab6804`，142 files，464K
- npm 发布包：`https://registry.npmjs.org/dsh-diagnostic-tutor/-/dsh-diagnostic-tutor-0.2.0.tgz`
- npm dist integrity：`sha512-NcNFbsIpJN1BpnKVD5Xdt7o6iq4eRddlIpQzOIaCu8XFCWVO/KPeS+bs8Z1TO8Mfyan2xEZbC8jkH3odLTqy6g==`

发布后从 npm 冷安装到全新隔离 profile：`dsh plugin --profile compat add dsh-diagnostic-tutor@0.2.0`，启动后 `/diagnostics` 报告插件 `0.2.0`，`/overview` 200。

### 真实数据副本验收

- 从 `~/.dsh/storages/udt.json` 复制到隔离 `DSH_HOME`；真实文件哈希 `221464c2…` 前后不变。
- 副本加载：5 courses / 19 nodes / 10 lessons / 4 focus / 7 projects / 2 learningPaths / 1 courseRun。
- 真实项目 UI：Learning map、知识与证据、复习、洞察四个 tab 都能打开；无客户端 exception。
- 真实 AP物理1 项目仍显示原有的 stale diagnosis request 警告（历史数据，不是新 bug）。
- Review 空态、Insights 真实计数、Knowledge 证据列表正常。
- 隔离副本可写（带出了一个真实项目到副本），这是复制数据上的行为，真实数据未被触碰。

### 兼容矩阵

| DSH | boot/API | tarball | 真实模型完整会话 |
| --- | --- | --- | --- |
| `0.2.1-rc.3` | 通过 | 通过 | 通过 |
| `0.2.1-rc.2` | 通过 | 未跑 | 未跑 |
| `0.2.0-rc.2` | 通过 | 未跑 | 未跑 |
| `0.1.7-alpha.2` | 通过 | 通过 | 通过 |

详见 [`COMPATIBILITY.md`](COMPATIBILITY.md)。

## 4. 发布步骤（待批准后执行）

- [x] 确认发布版本为 `0.2.0`
- [ ] 备份真实 `~/.dsh/storages/udt.json`
- [ ] 从最新 `main` 建 release 分支
- [x] 把 `package.json` version 改为 `0.2.0`，更新锁文件
- [x] 把 `CHANGELOG.md` 的 `[Unreleased]` 段整理为 `[0.2.0] - 2026-10-29`
- [x] 更新任何仍写 0.1.1 的发布/兼容说明
- [x] 干净 checkout：`pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build`
- [x] `npm pack`，记录新 SHA-256
- [x] 在隔离 profile 用 tarball 安装，启动 web，确认 plugin `0.2.0` 与 `/diagnostics`
- [x] 合并 release PR（#42，`71d1332`）
- [x] 打 annotated tag `v0.2.0` 并推送
- [x] `npm publish --access public`，`latest = 0.2.0`
- [x] 发布后安装 `dsh plugin --profile ... add dsh-diagnostic-tutor@0.2.0` 做一次冷启动
- [x] 删除临时 release 分支、清理已合并 feature 分支

## 5. 发布前已知限制

- rc2/rc20 完整真实模型会话未跑；
- 旧版真实 lesson 的文本公式没有 Phase 1 的 MathML 快照，仍按旧内容渲染；
- flashcard 删除后不自动删除/暂停复习卡；
- 调度是本地间隔启发式，不是 FSRS；
- PDF 未支持；对话内 `tool.call.toolview` 未做；跨 harness 明确搁置；
- 发布不改存储 domain version（仍 v1）；回滚前必须导出。

## 6. 回滚

- 发布前备份 storage。
- 回滚旧插件后，旧代码会忽略新表/新字段；下一次写入可能丢弃它们，因此回滚前导出。
- 本文件不执行版本变更或发布，所有发布动作需要单独批准。
