# 0.3.0 发布清单与说明

> 状态：**已发布**（2026-11-02）。`package.json` 为 `0.3.0`；tag `v0.3.0` 指向 `c947245`；npm `latest = 0.3.0`。
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
- [x] 完整测试
- [x] `npm pack`，记录 SHA-256
- [x] 合并 release PR（#49，`c947245`）
- [x] annotated tag `v0.3.0`
- [x] `npm publish --access public`，`latest = 0.3.0`
- [x] 发布后 npm 冷安装验证
- [x] GitHub Release
- [x] 冷安装 `dsh-diagnostic-tutor@0.3.0` 成功（包内版本 0.3.0，client bundle 含新 Home/Course/Study 代码）

## 4. 已知限制

- 文件/PDF 输入未做
- 真实 DSH 完整窗口渲染仍需人工抽查
- 课程生成依赖外部 skill 提供诊断/提案内容
- 回滚前导出 storage；存储 domain 仍为 v1

## 5. 发布结果

- GitHub Release：https://github.com/SenmuuuuW/dsh-diagnostic-tutor/releases/tag/v0.3.0
- npm：`dsh-diagnostic-tutor@0.3.0`
- npm tarball：https://registry.npmjs.org/dsh-diagnostic-tutor/-/dsh-diagnostic-tutor-0.3.0.tgz
- npm shasum：`18535220ad5d749467810050b9d803bc15f808fd`
- npm integrity：`sha512-GQPiibToovuMQg7xBL+Bxv+l26dYWU9cwmpfiI5zpSMpV+cTwRm9nJ9e14Z1HkMjFQUWLi9GQG1Tegd75bhP9g==`
- files：142；unpacked size：2,314,513 bytes
- git tag：`v0.3.0` → `c947245`（release merge commit）
- 冷安装：`npm install dsh-diagnostic-tutor@0.3.0` 成功；包内 `package.json` 版本为 `0.3.0`，`lib/client.js` 包含新的 Home/Course/Study 客户端代码。

发布命令在首次返回 `E403` 之前已完成写入；registry 的 `0.3.0` 时间戳与 dist shasum 对应当前发布包，后续复核 `dist-tags.latest = 0.3.0`。
