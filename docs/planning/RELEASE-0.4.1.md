# 0.4.1 发布清单与说明

> 状态：**发布中**（2026-11-04）。`package.json` 为 `0.4.1`。
> 代码基线：`main`（0.4.0 + Library/welcome 参考 UI 补丁）。

## 1. 版本

`0.4.1` 是 UI patch，不改变存储、API、工具或教学边界：

- Library / 欢迎页统一到参考视觉
- 紧凑欢迎标题、对话提示行、项目数量和项目列表
- 项目行包含图标、上次学习、状态 pill、Continue
- 空项目状态复用同一视觉
- 无 `udt` domain 变更，仍为 v1

## 2. 验证

在 release 分支完成：

```text
pnpm typecheck                  OK
pnpm test                       677 passed (60 files)
pnpm build                      OK
scripts/path-check.mjs          31 browser cases passed
```

DSH `0.2.2-rc.1` host/API 路径与 0.4.0 相同；本次只改客户端 Library 页面。

## 3. 发布步骤

- [x] 从 `main` 建 `release/0.4.1`
- [x] `package.json` → `0.4.1`
- [x] CHANGELOG 增加 0.4.1
- [x] README 更新：状态、安装版本、兼容矩阵、Roadmap、发布记录链接
- [x] 创建 RELEASE-0.4.1
- [x] 完整测试 / build / browser
- [x] `npm pack`
- [x] 隔离 DSH `0.2.2-rc.1` tarball 验证
- [ ] 合并 release PR
- [ ] annotated tag `v0.4.1`
- [ ] `npm publish --access public`，确认 `latest = 0.4.1`
- [ ] 冷安装验证
- [ ] GitHub Release
- [ ] 记录结果

## 4. 已知限制

与 0.4.0 相同：

- 无 PDF / raster image 上传，`figure` 仅 inline SVG
- 无复杂时间轴动画
- 无 RAG、analytics、FSRS、cross-harness
- 教学决策仍来自外部 Universal Diagnostic Tutor skill

## 5. 发布结果

### Tarball

- 文件：`dsh-diagnostic-tutor-0.4.1.tgz`
- files：146
- packed size：542,527 bytes
- unpacked size：2,530,398 bytes
- npm shasum：`b93a8ff821d157c87a7d72f8107adbf6b41d76d3`
- sha256：`2d8a1b0abe3518791aba9571aa4952cc20534cfd86c63af313d258fd5b8ecda7`
- npm integrity：`sha512-PwG3i78u6WxPPYaFicM9uj7bEPfofTm+3srBcXIQRMdHV/D7ugn1PWe5Fx3o4SWO6BhJlw9F7//gan5ihUN98Q==`

### 隔离 DSH 0.2.2-rc.1 tarball 验证

- `/diagnostics` → 200：plugin `0.4.1`、domain `udt` v1、`issues: []`
- `/review` → 200
- 包内 `package.json` 版本 `0.4.1`

### 待发布后填写

- release PR / merge commit
- git tag
- npm publish
- GitHub Release
- 冷安装

