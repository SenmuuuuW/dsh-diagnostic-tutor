# 0.3.0 发布清单与说明

> 状态：**发布准备中**（2026-11-02）。`package.json` 将更新为 `0.3.0`；完成后在此记录 tag、npm 和 tarball。
> 代码基线：`main`（Today/Course/Study + 三步课程生成）。

## 1. 版本

`0.3.0` 是新的 UI/交互版本：

- 一级导航收为 Today / Course
- Review、Knowledge、Insights 降为二级
- Focused Study 接入现有 lesson/interaction
- Course 无路线时只显示 Goal → Diagnosis → Course preview
- 不改变存储 domain、后端状态机或教学决策边界

## 2. 验证

在 release 分支完成：

```text
pnpm typecheck                  OK
pnpm test                       656 passed (58 files)
pnpm build                      OK
scripts/path-check.mjs          29 browser cases passed
```

DSH host smoke（0.2.1-rc.5）使用 0.2.0 tarball 验证过 host/API 与真实数据副本；0.3.0 的 host 代码路径不变，客户端由 preview/browser 回归覆盖。

## 3. 发布步骤

- [x] 从 `main` 建 release 分支
- [x] `package.json` → `0.3.0`
- [x] CHANGELOG 增加 0.3.0
- [x] README 更新安装命令、兼容矩阵、状态
- [x] 增加 CI workflow
- [ ] 完整测试
- [ ] `npm pack`，记录 SHA-256
- [ ] 合并 release PR
- [ ] annotated tag `v0.3.0`
- [ ] `npm publish --access public`
- [ ] GitHub Release
- [ ] 发布后 npm 冷安装验证

## 4. 已知限制

- 文件/PDF 输入未做
- 真实 DSH 完整窗口渲染仍需人工抽查
- 课程生成依赖外部 skill 提供诊断/提案内容
- 回滚前导出 storage；存储 domain 仍为 v1
