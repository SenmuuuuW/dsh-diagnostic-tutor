# 0.4.0 发布清单与说明

> 状态：**发布中**（2026-11-04）。`package.json` 为 `0.4.0`。
> 代码基线：`main`（资料输入、参考 UI、Study 布局、交互 block、DSH 0.2.2-rc.1 适配）。

## 1. 版本

`0.4.0` 是功能与视觉版本，不改变存储 domain：

- 资料输入：文本 / `.md` / `.markdown` / `.txt`，本地来源与引用
- 资料元数据进入诊断/路线 prompt；不复制正文
- Study 半屏 / 主区域 / 全屏规则和 full-screen 步骤轨
- 生产交互 block：`slider`、`step-through`、`figure`
- 安全表达式求值：无 `eval`
- 安全 inline SVG：脚本、事件处理器、外部 URL、图片引用、`foreignObject` 被移除
- 参考 UI 覆盖 Today / Course / Course Generation / Study / Review / Knowledge / Insights
- DSH `0.2.2-rc.1` 适配
- 存储 domain 仍为 `udt` v1，13 张表 + learner global

## 2. 验证

在 release 分支完成：

```text
pnpm typecheck                  OK
pnpm test                       677 passed (60 files)
pnpm build                      OK
scripts/path-check.mjs          31 browser cases passed
```

隔离 DSH `0.2.2-rc.1` 验证：

- `npx @deepseek-ai/dsh@0.2.2-rc.1` + 全新 `DSH_HOME`
- `/diagnostic-tutor/api/overview` → 200
- `/diagnostics` → 200，domain `udt` v1，`issues: []`
- `/plan/ics` → 200
- `/review` → 200
- 真实浏览器 Learning map / Learn 侧栏加载，无 Runtime exception
- 测试 harness 为 `AgentRegistry` 新增的 `sessionProjections` inject 提供最小服务；生产插件 API 使用不变

## 3. 发布步骤

- [x] 从 `main` 建 `release/0.4.0`
- [x] `package.json` → `0.4.0`
- [x] CHANGELOG 增加 0.4.0
- [x] README 更新：状态、安装版本、兼容矩阵、Roadmap、发布记录链接
- [x] 创建 RELEASE-0.4.0
- [x] 完整测试 / build / browser
- [x] `npm pack`，记录 SHA-256
- [x] 用 tarball 在隔离 DSH `0.2.2-rc.1` profile 验证 host 与 client
- [ ] 合并 release PR
- [ ] annotated tag `v0.4.0`
- [ ] `npm publish --access public`，确认 `latest = 0.4.0`
- [ ] 发布后 npm 冷安装验证
- [ ] GitHub Release 与 README 更新上线
- [ ] 记录 tarball / shasum / tag / release 结果

## 4. 已知限制

- 无 PDF / raster image 上传；`figure` 仅安全 inline SVG
- 无复杂时间轴动画；`figure` 动画仅 fade/pulse/draw
- 无 RAG、analytics、FSRS、cross-harness
- 课程生成依赖外部 Universal Diagnostic Tutor skill
- 回滚前导出 storage；domain 仍为 v1

## 5. 发布结果

### Tarball

- 文件：`dsh-diagnostic-tutor-0.4.0.tgz`
- npm files：146
- packed size：541,717 bytes
- unpacked size：2,523,055 bytes
- npm shasum：`ca9af44eb06072ff2dc9b078ed9f9854d67df260`
- sha256：`0d6ca742c27942e91ab4a25998f2faaa4651f46bf6d591102193a33d4e4e0525`
- npm integrity：`sha512-KN+YPkK3eFG04BbhACFPDAuEgOuxOUMp2KuV6rVkORYBqVwr7XDHASRza2tmL2kZu5aOxRbsXQzVCS27SFyGCA==`

### 隔离 DSH 0.2.2-rc.1 tarball 验证

- `npx @deepseek-ai/dsh@0.2.2-rc.1 plugin --profile compat add /tmp/dsh-diagnostic-tutor-0.4.0.tgz`
- `/overview` → 200
- `/diagnostics` → 200：plugin `0.4.0`、domain `udt` v1、`issues: []`
- `/plan/ics` → 200
- `/review` → 200
- 真实浏览器 Learning map 加载，无 Runtime exception
- 包内 `package.json` 版本 `0.4.0`

### 待发布后填写

- release PR 合并 commit
- git tag
- npm publish 结果
- GitHub Release URL
- 冷安装结果

