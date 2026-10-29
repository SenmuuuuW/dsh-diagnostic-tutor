# DSH 兼容矩阵验证

> 验证对象：`dsh-diagnostic-tutor@0.1.1`，Phase 1–6 本地堆叠分支。
> 功能代码：Phase 6（验证时 tip `4bf7574`；rebase 后等价提交 `52fb1d4`）。
> 验证日期：2026-10-29。宿主：macOS 15.0，Node `v24.16.0`。
> 插件通过本地路径 link 或本地 tarball 进临时 profile；没有 push、合并或改 version。
> 完整会话使用一次性测试 API key，仅注入隔离进程环境；key 不写入仓库、profile 或文档。

## 1. 方法

每个 DSH 版本独立安装到临时目录，使用全新的 `DSH_HOME`，不接触真实 profile、storage 或 learner data：

```bash
npm install --prefix /tmp/udt-compat/cli-<v> @deepseek-ai/dsh@<version>
export DSH_HOME=/tmp/udt-compat/home-<v>
dsh --profile compat --from-default-profile web --dump-config
dsh plugin --profile compat add /Users/sunjungong/Documents/DSH/dsh-diagnostic-tutor
dsh --profile compat --no-open --port <port>
```

然后检查：

- `GET /diagnostic-tutor/api/overview` → 200，`ok:true`
- `GET /diagnostic-tutor/api/diagnostics` → 200，插件 `0.1.1`，domain `udt` v1，`issues: []`
- `GET /diagnostic-tutor/api/plan/ics` → 200，`text/calendar`
- 浏览器加载根页面（带隔离 profile 的 token）：无 `Runtime.exceptionThrown`、无 console error、无 network loading failure
- rc3 额外确认 `dsh-diagnostic-tutor/client.js` 被列出并加载

## 2. 结果

| DSH | CLI 包 | overview | diagnostics | plan/ics | client boot | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| `0.2.1-rc.3` | `@deepseek-ai/dsh@0.2.1-rc.3` | 200 | 200 | 200 | 无异常；插件 client.js 已加载 | 通过 |
| `0.2.1-rc.2` | `@deepseek-ai/dsh@0.2.1-rc.2` | 200 | 200 | 200 | 无异常 | 通过 |
| `0.2.0-rc.2` | `@deepseek-ai/dsh@0.2.0-rc.2` | 200 | 200 | 200 | 无异常 | 通过 |
| `0.1.7-alpha.2` | `@deepseek-ai/dsh@0.1.7-alpha.2` | 200 | 200 | 200 | 无异常 | 通过 |

诊断结果一致：

```json
{"plugin":{"name":"dsh-diagnostic-tutor","version":"0.1.1"},"domain":{"name":"udt","version":1},"counts":{"courses":0,...},"issues":[]}
```

### 2.1 从打包 tarball 安装

本地 `npm pack` 产物：`dsh-diagnostic-tutor-0.1.1.tgz`，474.5 kB，142 files，unpacked 2.1 MB，SHA-256：

```text
6cb43df6aa25a35829804b99150bee84c79bb6b671990b7db56cb4561908ef84
```

在 `0.2.1-rc.3` 与 `0.1.7-alpha.2` 的全新隔离 profile 中改用 tarball（不再 `link:`）安装，重新启动验证：

| DSH | overview | diagnostics | client boot | 插件 client.js |
| --- | --- | --- | --- | --- |
| `0.2.1-rc.3` | 200 | 200 | 无异常 | 已加载 |
| `0.1.7-alpha.2` | 200 | 200 | 无异常 | 已加载 |

tarball 内容确认包含 `lib/index.js`、`lib/client.js`、类型声明、`LICENSE`、`package.json`。

### 2.2 完整真实会话（rc3 / alpha.2）

对 `0.2.1-rc.3` 与 `0.1.7-alpha.2` 使用一次性测试 key 注入隔离 web 进程，真实模型 `DeepSeek-V4.1-Flash` 驱动会话，浏览器自动化执行：

1. 新建会话并发送任务；
2. 模型实际调用 `udt_goal_create`、`udt_map_update`、`udt_lesson_update`；
3. 写入 formula + flashcard lesson；
4. Learning map 打开 Review，翻面后评分 `Good`，再撤销；
5. 打开 Insights；
6. 检查 API 与落盘数据。

| DSH | 项目/节点/lesson | flashcard → 复习卡 | Review 评分/撤销 | Insights | client exceptions |
| --- | --- | --- | --- | --- | --- |
| `0.2.1-rc.3` | 1 / 2 / 1 | 自动生成 1 张 | 通过 | 通过 | 无 |
| `0.1.7-alpha.2` | 1 / 2 / 1 | 自动生成 1 张 | 通过 | 通过 | 无 |

`/overview` 返回项目与节点，`/review` 返回自动生成的卡片，`/insights` 返回复习/证据计数；`/diagnostics` 的 `issues` 为空。

## 3. 本次没有覆盖

- **rc2/rc20 没有跑完整真实会话**：`0.2.1-rc.2` 与 `0.2.0-rc.2` 只完成了 boot/API；两者是 `link:` 安装（tarball 只覆盖 rc3/alpha.2），不是完整模型会话。rc3/alpha.2 已完成。
- tarball 安装只验证了 `0.2.1-rc.3` 与 `0.1.7-alpha.2`；`0.2.1-rc.2`、`0.2.0-rc.2` 是 `link:` 验证。rc2/rc20 也没有完整真实会话。
- **没有覆盖 0.1.5/0.1.6 线**：README 的正式矩阵只承诺 `0.1.7-alpha.2` 及以上与 `0.2.x`；其它版本不在本轮范围。
- rc3/alpha.2 的完整会话是实际模型驱动，但仍是一次性 API key 与测试项目；不证明长期配额、真实登录状态或所有 provider。

## 4. 结论

Phase 1–6 没有引入新的 `@deepseek-ai/*` 包；四个目标版本的 host 插件加载、本地 HTTP 路由、domain v1 初始化和客户端启动均通过；rc3 与 alpha.2 还通过了 tarball 安装，并用真实模型完成 lesson → Review 评分/撤销 → Insights。rc2/rc20 的完整真实会话仍是可选的补充验证，而不是当前 merge gate 的空白。

## 5. 清理

临时产物在 `/tmp/udt-compat`（CLI 安装、隔离 profiles、日志、token、测试 key 文件）。它们不属于仓库；验证结束后删除，不会影响 `~/.dsh/profiles` 或 `~/.dsh/storages`。测试 key 只存在于该临时目录并在清理时删除。
