# DSH Third-Party Plugin Reconnaissance

Scope: four real, shipping DSH (DeepSeek Harness) plugins, read from the actual files with line citations.

| # | Repo | Local path | npm | Version (local) |
|---|---|---|---|---|
| 1 | dsh-study (鲸鱼私塾) | `<local-checkout>/dsh-study` | **not published** (`npm view dsh-study` → 404) | 0.1.0 |
| 2 | dsh-whale-report (深迹 DeepTrace) | `<local-checkout>/dsh-whale-report` | **published** `dsh-whale-report@0.6.1` | 0.6.1 |
| 3 | dsh-minecraft | `<local-checkout>/dsh-minecraft` | name **taken by another project** on npm (`dsh-minecraft@0.12.4` = Ruqii/dsh-minecraft, a Mineflayer bot) | 0.2.0 |
| 4 | dsh-better-sidebar (`-011` copy) | `<local-checkout>/dsh-better-sidebar-011` | **published** `dsh-better-sidebar@0.19.1` (this copy is the 0.11.0 *extracted npm tarball*, no `.git`, no tsconfig) | 0.11.0 |

Runtime facts measured on this machine (this is what a new plugin must be compatible with):

```
~/.dsh/profiles/web/package.json → dsh.profile.bundles: [@deepseek-ai/dsh-base,
    @deepseek-ai/dsh-web-app, dsh-whale-report, dsh-minecraft, dsh-better-sidebar]
~/.dsh/profiles/node_modules/@deepseek-ai/{dsh-tools,dsh-session,dsh-storage-domain,
    dsh-session-query,dsh-settings,dsh-host-webserver} = 0.1.5-rc.1
~/.dsh/profiles/node_modules/@deepseek-ai/schemastery = 3.18.2
installed dsh-better-sidebar (profile web) = 0.18.0-alpha.0   (NOT the 0.11.0 in repo 4)
npm dist-tags for @deepseek-ai/dsh-tools: latest=0.0.1-rc.1, next=0.1.5-rc.2, alpha=0.1.6-alpha.2
```

The `latest` npm tag for `@deepseek-ai/dsh-tools` is **0.0.1-rc.1**, i.e. stale. Anything installed by plain `pnpm add` gets the wrong version unless you pin `next` or an exact prerelease.

---

# 1. dsh-study — the closest analog (learning/course plugin)

## 1.1 Anatomy

```
dsh-study/
├── package.json
├── cordis.patch.yml
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── README.md
├── .gitignore                    # node_modules/  lib/  *.tsbuildinfo
├── pnpm-lock.yaml
├── courses/                      # ← CONTENT, ships in the npm tarball
│   ├── README.md                 # course-pack format spec (for course authors)
│   └── cordis-paper/
│       ├── pack.yaml             # id/title/description/language/concepts[]
│       └── concepts/*.md         # 5 files: YAML frontmatter (incl. quiz bank) + lesson body
├── src/                          # 6 files, 100% of the source
│   ├── index.ts                  # plugin entry: name/inject/Config/apply
│   ├── tools.ts                  # 4 model-facing tools (504 lines)
│   ├── state.ts                  # storage domain + session-event declaration merge
│   ├── srs.ts                    # SM-2 pure functions (105 lines)
│   └── pack.ts                   # course-pack loader + zod validation (142 lines)
├── lib/                          # ← BUILD OUTPUT (tsc), gitignored but published
│   ├── index.js  tools.js  state.js  srs.js  pack.js  (+ .js.map)
│   └── types/*.d.ts              # declarationDir
├── scripts/
│   └── link-dsh.mjs              # symlink @deepseek-ai/* peers from a local DSH checkout
├── tests/
│   ├── srs.test.ts
│   └── pack.test.ts
└── node_modules/                 # symlinks into ~/.npm/_npx/1e7f6d9597241db0 (link-dsh)
```

There is **no** `lib/types` index mismatch, no `preview/`, no `docs/`, no `assets/`, no `.github/`, no `DESIGN.md`, no `LICENSE` file (only `"license": "MIT"` in package.json), and **no git repository** (no `.git`). This is the "smallest viable DSH plugin" shape: entry + tools + state + pure core + content dir + 2 tests.

Layer roles, as this repo defines them:
- `src/` = TypeScript source, authoritative.
- `lib/` = `tsc` output, per-file ESM (NOT bundled), gitignored yet shipped via `files`.
- `courses/` = data, versioned with code, shipped, author-editable without touching TS.
- `scripts/link-dsh.mjs` = dev-only peer resolver (because at authoring time the `@deepseek-ai/*` packages were private).
- `tests/` = pure-function and loader tests; the DSH runtime is never instantiated.

## 1.2 package.json (verbatim, `dsh-study/package.json:1-52`)

```json
{
  "name": "dsh-study",
  "version": "0.1.0",
  "description": "鲸鱼私塾 — a learning companion for DeepSeek Harness: course packs, active-recall quizzes and spaced repetition over the Cordis storage domain.",
  "type": "module",
  "license": "MIT",
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "courses", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "dependencies": { "yaml": "^2.5.0", "zod": "^4.0.0" },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-session": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-storage": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-storage-domain": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.6",
    "@deepseek-ai/schemastery": "^3.18.1"
  },
  "devDependencies": {
    "@types/node": "^24.0.0", "tsx": "^4.19.2",
    "typescript": "^5.6.3", "vitest": "^3.0.5"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Field-by-field:
- `name` — npm name; also the string `dsh plugin add` resolves, **and** it need not equal the cordis `name` export (here: package `dsh-study`, plugin `study-core`).
- `version` — SemVer, single source (nothing reads it at runtime; state domains carry their own `version`).
- `type: "module"` — mandatory; `lib/*.js` is native ESM resolved by the profile's loader.
- `main` + `types` + `exports["."]` — host-half entry and its `.d.ts`. `exports` also re-exports `./package.json` (needed by tooling that reads the manifest by specifier).
- `files` — allowlist for the tarball. **`cordis.patch.yml` and `courses/` must be listed**; without `courses` the shipped plugin has no content (the code resolves `../courses` relative to `lib/index.js`, see §1.4).
- `dsh.bundle.patch` — THE install-mount declaration read by `dsh plugin add` (see §8). No `dsh.client` here (no UI half).
- `dependencies` — real runtime deps resolved from the profile's node_modules: `yaml` (course parsing), `zod` (schemas). Not peers, because the profile does not provide them.
- `peerDependencies` — `@deepseek-ai/*` are **provided by the profile at runtime, never installed by the plugin**. `@deepseek-ai/cordis` is the DI container; `dsh-tools` gives `defineTool`; `dsh-storage-domain` gives `defineDomain/domainTable`; `dsh-session` gives the event-map declaration target; `schemastery` gives the `Config` schema (this file imports `@deepseek-ai/schemastery`, *not* zod, for `Config`).
- `devDependencies` — `typescript` + `vitest` + `tsx`; no bundler at all. **No tsdown, no react, no jsdom** — because there is no client half.
- `scripts` — only three. There is no `pack`/`publish`/`dev` script; publishing is manual. `build` is `tsc` only.
- `engines` — `^22.19.0 || >=24.0.0`, identical in all three TS repos (this is the DSH runtime floor).

## 1.3 cordis.patch.yml (verbatim, `dsh-study/cordis.patch.yml:1-9`)

```yaml
# dsh-study bundle patch — 挂载「鲸鱼私塾」核心插件。
# 只做一件事：把本包（dsh-study，导出 cordis 插件三件套 name/inject/apply）插入 profile。
# 它 inject 的 tools / storageDomain / session 全部由默认 web profile 提供
# （见 @deepseek-ai/dsh-web-app 的 patch：storage → storage-json → storage-domain），
# 所以这里不需要再挂任何基础设施 —— 零补丁侵入，卸载即净。

- insert:
    - id: study-core
      name: 'dsh-study'
```

A YAML sequence of loader patch entries. `insert` appends one loader row: `id` is the composition identifier (used for enable/disable and diagnostics), `name` is the module specifier the loader resolves. The file exists so the plugin can mount itself **without the user editing the profile's own patch file** — `dsh plugin add` finds it via `dsh.bundle.patch`, appends `dsh-study` to `dsh.profile.bundles`, and boot merges this patch as one layer. No infrastructure re-declaration (the web profile already provides `tools`/`storageDomain`).

## 1.4 Entry point (`dsh-study/src/index.ts:1-63`)

```ts
import z from "@deepseek-ai/schemastery";
import type { Context } from "@deepseek-ai/cordis";
import type { DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { studyDomain } from "./state.js";
import { registerStudyTools, type StudyServices, type ToolsHost } from "./tools.js";

export const name = "study-core";
export const inject = ["tools", "storageDomain"];

export const Config = z.object({
  /** 额外的课程包目录。留空则只加载插件自带的 courses/。 */
  coursesDir: z.string().default(""),
});

function defaultCoursesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "courses");
}

export function apply(ctx: Context, config: StudyConfig) {
  ctx.inject(["storageDomain"], async (domainCtx) => {
    const facility = (domainCtx as Context & { storageDomain: DomainFacility }).storageDomain;
    const domain = await facility.open(studyDomain);
    ctx.effect(() => () => { void domain.close(); });

    const coursesRoot = config.coursesDir?.trim() || defaultCoursesDir();
    if (!existsSync(coursesRoot)) {
      console.warn(`[dsh-study] 课程目录不存在：${coursesRoot}`);
    }

    const services: StudyServices = {
      domain, coursesRoot, courseCache: new Map(),
    };
    registerStudyTools(ctx as unknown as ToolsHost, services);
  });
}
```

Exact plugin export shape — **four named exports, no default export**:
1. `name` (`index.ts:24`) — the cordis plugin id; distinct from the npm name.
2. `inject = ["tools", "storageDomain"]` (`:25`) — top-level service requirements; the assembler guarantees they exist before `apply` runs. **A service listed here that is missing leaves the plugin pending forever** (whale-report's comment at `src/index.ts:10-14` warns about exactly this).
3. `Config = z.object({...})` (`:27-30`) — a **schemastery** schema (not zod) that validates the `config:` block from the patch row and fills defaults.
4. `apply(ctx, config)` (`:41`) — the body. It uses *delayed injection* `ctx.inject([...], cb)` for the async storage domain, opens the domain, registers a disposer via `ctx.effect(() => () => domain.close())`, resolves the content root from `import.meta.url` (`lib/index.js` → `../courses`), and hands a plain service bag to the tools layer.

Registration of capabilities: no service is *provided*; the plugin only *consumes* `ctx.tools.register(...)` in `tools.ts`. State is stored in a Cordis storage domain, not files (`state.ts:58-64`):

```ts
export const studyDomain = defineDomain({
  name: "study",
  version: 1,
  tables: {
    cards: domainTable<StudyCardKey, StudyCardRecord>(StudyCardSchema),
  },
});
```

Plus a **session-event declaration merge** so UI projections can replay history (`state.ts:22-35`):

```ts
export interface StudyGradeEvent { courseId: string; conceptId: string; grade: number; /* … */ }

declare module "@deepseek-ai/dsh-session/types" {
  interface SessionEventMap { "study/grade": StudyGradeEvent; }
}
```

and the event is appended inside a tool execution via the tool's `exec` context (`tools.ts:113-124`):

```ts
function appendGradeEvent(exec: ToolRunContext, event: {...}) {
  if (!exec.agent) return;
  exec.agent.session.append("study/grade", event);
}
```

Tool registration is a one-liner loop (`tools.ts:126-131`): `ctx.tools.register(studyCoursesTool(svc))` ×4, where each tool is an object literal passed through `defineTool({...})` with `name`, `description`, `parameters`, `output.schema`, `output.render`, `execute`, `presentCall`.

Tool names: `study_courses`, `study_teach`, `study_grade`, `study_progress` — **single underscore separator, short names, no namespace prefix**.

## 1.5 Build

- `tsconfig.json:1-14` — `target ES2023`, `module/moduleResolution NodeNext`, `lib ["ES2023"]`, `strict`, `esModuleInterop`, `skipLibCheck`, `noEmit: true`, `include: ["src", "tests"]`. No `jsx` (no UI).
- `tsconfig.build.json:1-13` — extends the above, flips `noEmit:false`, `outDir: "lib"`, `rootDir: "src"`, `declaration:true`, `declarationDir: "lib/types"`, `declarationMap`, `sourceMap`, `include: ["src"]`. So typecheck config and emit config are one file apart — the standard split.
- No bundler. `lib/` = **per-module ESM, unbundled**, with `.js.map` next to each `.js` and mirrored `.d.ts` under `lib/types/`. Total 732 lines of JS for 5 modules. `import "./state.js"` in TS (NodeNext requires the `.js` extension) and the emitted output keeps plain relative specifiers, so the profile's Node resolves `@deepseek-ai/*` from its own `node_modules`.
- README is explicit that `lib/` is gitignored but must be published (`README.md:65`): `pnpm build # tsc 产出 lib/（发布需要提交 lib/）`.

`lib/` listing: `index.js`, `pack.js`, `srs.js`, `state.js`, `tools.js` (+ maps) and `lib/types/{index,pack,srs,state,tools}.d.ts` (+ maps).

## 1.6 Tests

`vitest.config.ts:1-7` is three lines of config: `include: ["tests/**/*.test.ts"]`. No setup files, no aliases, no jsdom, no global mocks.

Two test files (10 cases). They test **only pure functions and the content loader** — the DSH runtime is never instantiated, which is possible because every DSH-facing concern is pushed into `index.ts`/`tools.ts`. Representative (`tests/srs.test.ts:14-51`):

```ts
describe("review — SM-2 间隔序列", () => {
  it("连续满分 5：1 天 → 6 天 → 间隔×难度 递增", () => {
    let card = initialCard();
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      card = review(card, 5 as Grade);
      seen.push(card.intervalDays);
    }
    expect(seen[0]).toBe(1);            // reps 1
    expect(seen[1]).toBe(6);            // reps 2
    expect(seen[2]).toBeGreaterThan(6); // 6 × ease(2.6) ≈ 16
  });

  it("遗忘（<3 分）会归零连续答对次数并下调难度", () => { /* … */ });
});
```

and the content test (`tests/pack.test.ts:13-28`) asserts the shipped course loads, prerequisites are topologically ordered, and lesson bodies are non-empty:

```ts
it("cordis-paper 能完整加载：5 个概念、前置依赖可解析、讲义非空", () => {
  const pack = loadCourse(coursesRoot, "cordis-paper");
  expect(pack.concepts.length).toBe(5);
  const ids = pack.concepts.map((c) => c.id);
  for (const concept of pack.concepts) {
    for (const prereq of concept.prerequisites) {
      expect(ids.indexOf(prereq)).toBeLessThan(ids.indexOf(concept.id));
    }
  }
});
```

Note it also has a **negative** test (`pack.test.ts:42-46`): `expect(() => loadCourse(root, "no-such-course")).toThrow(/课程不存在/)`.

**There is no test that exercises `apply()`** — no fake ctx, no fake storage domain. This is the weakest link in the closest analog: the plugin's assembly path is untested.

## 1.7 README

Section outline (`README.md`, 82 lines total): `# 🐋 鲸鱼私塾（dsh-study）` → blockquote tagline → `## 它解决什么问题` → `## 第一门课：Cordis 论文精讲` → `## 安装` → `## 使用` → `## 项目结构 = 你的教材` (a **table mapping each file to what the reader learns from it**) → `## 开发` → `## Roadmap` (checkbox list) → `## License`.

What makes it readable: a one-line bold promise in the blockquote (`真正让你学会`), an explicit "problem → why existing plugins fail (2 numbered points) → what we do" argument, the "project structure is your textbook" table, and a Roadmap that names the exact next version's feature. What it lacks for launchability: **no badges, no screenshot/GIF, no npm install line, no architecture diagram, no feature table**. Install instructions (`README.md:32-35`):

```sh
dsh plugin --profile web add "github:<你的仓库>/dsh-study"
# 重启 dsh web 后生效
```

Note the placeholder `<你的仓库>` — it was never published and the install line is a template.

## 1.8 Install path

`dsh plugin --profile web add <spec>` (README) — the plugin itself is not on npm. The spec is a GitHub URL, which means pnpm clones + builds it via the `prepare` script — except this package has **no `prepare` script**, so a git install would ship a repo without `lib/` unless `lib/` is committed (which `.gitignore` prevents). This is a real, unresolved packaging hole in the study repo: **to be installable from git or npm you must either commit `lib/` or add `"prepare": "pnpm build"`.**

## 1.9 Distribution

No `.github/`, no CI, no tags, no LICENSE file. Versioning: 0.1.0, semantic-ish, Roadmap-driven.

---

# 2. dsh-whale-report — the most mature

## 2.1 Anatomy

```
dsh-whale-report/                 # a real git repo, tags v0.4.0 … v0.6.1
├── .github/workflows/ci.yml      # the ONLY repo here with CI
├── .claude/launch.json           # editor preview config (preview/serve.mjs on :8377)
├── .gitignore                    # node_modules/ *.tsbuildinfo .DS_Store *.tgz lib/client/
├── LICENSE                       # full MIT text, "Copyright (c) 2026 dsh-whale-report contributors"
├── README.md                     # 21 541 bytes / 350 lines
├── CHANGELOG.md                  # 21 273 bytes, Keep-a-Changelog + SemVer
├── package.json
├── cordis.patch.yml
├── tsconfig.json / tsconfig.build.json / tsdown.config.ts / vitest.config.ts
├── pnpm-lock.yaml / pnpm-workspace.yaml   # workspace only carries allowBuilds: esbuild
├── dsh-whale-report-0.6.0-rc.1.tgz        # release artifacts (54 220 B)
├── dsh-whale-report-0.6.0.tgz             # (54 229 B, 126 files)
├── assets/whale/*.svg            # 5 whale faces + README, served by /whale/assets whitelist
├── docs/
│   ├── ARCHITECTURE.md           # 13 391 B, 10 numbered sections
│   ├── RFC-v0.6-apply-verify.md  # 42 886 B design RFC
│   ├── ui-provider-prefix-note.md
│   └── images/{overview,report,integration,deeptrace-overview}.png
├── preview/                      # standalone browser harness for the client half
│   ├── index.html                # __ModuleLoader__ shim + React UMD from /node_modules
│   ├── fixture.js                # rich fake API payloads
│   └── serve.mjs                 # 30-line static server on :8377
├── scripts/
│   ├── link-dsh.mjs              # same dev peer linker as dsh-study
│   ├── report-now.mjs            # standalone CLI (reads ~/.dsh/sessions/*.jsonl.zstd)
│   └── acceptance-analysis.mjs
├── src/                          # 53 files, ~11 000 lines
│   ├── index.ts                  # host entry (150 lines)
│   ├── api.ts                    # /whale/api + /whale/assets HTTP routes (696 lines)
│   ├── tools.ts                  # whale_report tool + generation pipeline (698 lines)
│   ├── state.ts                  # storage domain, 7 tables (191 lines)
│   ├── core.ts                   # stable public subpath `./core` (re-export only)
│   ├── stats.ts (1936) … verify/, apply/    # pure engine layers
│   └── client/                   # 21 files — the browser half
│       ├── index.tsx             # client entry: fallback drawer + betterSidebar tab
│       ├── report.tsx content.tsx activity.tsx … styles.ts (2019)
│       └── ui/primitives.tsx
├── lib/                          # tsc output (host) + tsdown bundle (client.js) + lib/types
└── tests/                        # 38 *.test.ts(x) + apply-harness.ts + apply-oracle.ts
```

Layer roles are explicit here: `src/` source; `lib/` build output (`lib/index.js` from `tsc`, `lib/client.js` **bundled** by tsdown, `lib/types/**` declarations, `lib/client/**` a redundant tsc split that `.gitignore` excludes); `docs/` = engineering docs + screenshots; `preview/` = a zero-DSH browser harness for the client half; `tests/` = 38 files; `scripts/` = dev tooling + a user-facing CLI; the two `.tgz` = release artifacts.

## 2.2 package.json (verbatim key parts, `dsh-whale-report/package.json:1-107`)

```json
{
  "name": "dsh-whale-report",
  "version": "0.6.1",
  "description": "鲸鱼记事本 — 你的 Agent 年度/月度/周度/日报：从会话事件日志生成数据新闻官式报告，任意区间、定时生成。",
  "type": "module",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/SenmuuuuW/dsh-whale-report.git" },
  "homepage": "https://github.com/SenmuuuuW/dsh-whale-report",
  "bugs": { "url": "https://github.com/SenmuuuuW/dsh-whale-report/issues" },
  "keywords": ["deepseek","dsh","deepseek-harness","cordis","plugin","report","analytics","agent","cost","token","whale"],
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".":        { "types": "./lib/types/index.d.ts",        "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts",  "default": "./lib/client.js" },
    "./core":   { "types": "./lib/types/core.d.ts",          "default": "./lib/core.js" },
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.js", "assets", "lib/**/*.js", "lib/**/*.js.map",
    "lib/types/**/*.d.ts", "cordis.patch.yml"
  ],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": [], "platform": "web" }
  },
  "dshClient": { "inject": [], "platform": "web", "immediately": true },
  "dependencies": { "fzstd": "^0.1.1", "zod": "^4.0.0" },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-session": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-session-query": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-storage": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-storage-domain": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-tools": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/schemastery": "^3.18.1"
  },
  "devDependencies": {
    "@deepseek-ai/dsh-session": "0.1.1-rc.2", "@deepseek-ai/dsh-session-query": "0.1.1-rc.2",
    "@deepseek-ai/dsh-storage": "0.1.1-rc.2", "@deepseek-ai/dsh-storage-domain": "0.1.1-rc.2",
    "@deepseek-ai/dsh-tools": "0.1.1-rc.2",
    "@types/node": "^24.0.0", "@types/react": "^18.3.12", "@types/react-dom": "^18.3.1",
    "jsdom": "^30.0.1", "react": "^18.3.1", "react-dom": "^18.3.1",
    "tsdown": "^0.11.0", "tsx": "^4.19.2", "typescript": "^5.6.3", "vitest": "^3.0.5"
  },
  "scripts": {
    "build": "rm -rf lib && tsc -p tsconfig.build.json && tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "link-dsh": "node scripts/link-dsh.mjs",
    "report": "node scripts/report-now.mjs"
  }
}
```

Notable per-field choices:
- `exports["./client"]` is **the actual contract** for shipping a browser half: `dsh-client-modules` requires `dsh.client` in package.json **and** an `exports["./client"]` entry, else it throws `"declares dsh.client but exports no './client' bundle"` (installed runtime: `@deepseek-ai/dsh-client-modules/lib/index.js:654-655`).
- `exports["./core"]` is a deliberate **consumer-facing API subpath** — `src/core.ts:1-22` only re-exports engine modules so an external TUI (`dsh-deeptrace-tui`) can reuse the engine without pulling `dsh-storage-domain`.
- `dsh.client` (nested) is the live declaration. **`dshClient` (top level, `:65-69`) is dead weight**: grepping every installed `*.js` in `~/.dsh/profiles/node_modules` for `dshClient` returns nothing, and the runtime reads only `pkg.dsh.client` (`dsh-client-modules/lib/index.js:648-655`). It is defensive double-writing for a drift that has since been resolved (`docs/ARCHITECTURE.md:134-140` documents it as "客户端声明 dsh.client→dshClient | package.json 双写").
- `files` deliberately ships `lib/**/*.js` (which includes the redundant `lib/client/**` tsc split) and only `lib/types/**/*.d.ts`. README/LICENSE/package.json are auto-included by npm.
- Peer ranges use `>=0.1.1-rc.2 <0.2.0` (not `^`) precisely because prerelease `^` semantics are unreliable — this is why the plugin keeps working against the profile's 0.1.5-rc.1.
- Dev deps pin exact `0.1.1-rc.2` so a clean `pnpm install` **can** typecheck without a local checkout (unlike study).
- There is **no `publishConfig`** and no release script; publishing is manual `npm publish`, evidenced by the hand-built `.tgz` artifacts and the CHANGELOG-per-release convention.

## 2.3 cordis.patch.yml (verbatim, `dsh-whale-report/cordis.patch.yml:1-9`)

```yaml
# dsh-whale-report bundle patch — 挂载「鲸鱼记事本」。
# 插件本体注入 tools + sessionQuery，两者都由默认 web profile 提供
# （sessionQuery = @deepseek-ai/dsh-session-query + sqlite 后端）。
# 零核心改动：卸载即从装配图摘除，报告数据只读、不改任何会话。

- insert:
    - id: whale-report-core
      name: 'dsh-whale-report'
```

Single `insert`, one row, no config (config comes from the profile overlay if the user wants it). Same three purposes as study: declare the mount, avoid user file edits, enable one-line uninstall.

## 2.4 Entry point (`dsh-whale-report/src/index.ts:33-149`)

```ts
export const name = "whale-report-core";
export const inject = ["tools", "sessionQuery", "storageDomain"];

export function apply(ctx: Context) {
  const sessionQuery = (ctx as Context & { sessionQuery: unknown }).sessionQuery as SessionQueryLike;

  // v0.6 Apply：settings seam 惰性注入（缺失 → 优雅降级 read-only，不阻塞插件树）。
  let settingsSeam: SettingsSeam | null = null;
  ctx.inject(["settings"], (settingsCtx) => {
    settingsSeam = ((settingsCtx as Context & { settings?: unknown }).settings as SettingsSeam | undefined) ?? null;
  });

  ctx.inject(["storageDomain"], async (domainCtx) => {
    const facility = (domainCtx as Context & { storageDomain: DomainFacility }).storageDomain;
    const domain = await facility.open(whaleDomain);
    ctx.effect(() => () => { void domain.close(); });

    const services: ReportServices = {
      sessionQuery,
      index: domain.table("session_index"),
      periodStats: domain.table("period_stats"),
    };
    const ingest = new IngestEngine({ sessionQuery, index: domain.table("session_index") });
    /* … queryStats / ApplyService / firehose subscription / bootstrap … */
    registerReportTools(ctx as unknown as ToolsHost, services);
    /* … route registration … */
  });
}
```

The four seams it wires (documented at `src/index.ts:4-8`): `tools` (chat path), `sessionQuery` (data source), `storageDomain` (persistence), `webServer`/`httpServer` (panel data channel). Key engineering moves to copy:

1. **Top-level `inject` lists only stable services.** Drifting service names (`webServer` → `httpServer`) go into *lazy* `ctx.inject` callbacks, because a missing top-level `inject` service leaves the whole plugin pending (`src/index.ts:10-14`). Both names are attempted and de-duplicated with an `in` probe (`:132-148`):
   ```ts
   const has = (key: string) => key in (serverCtx as unknown as Record<string, unknown>);
   const server = (has("httpServer") ? serverCtx.httpServer : has("webServer") ? serverCtx.webServer : undefined) …
   ```
   with the important note (`:133-134`) that cordis' injected context is a Proxy that **throws** on missing-property access, so `??` chaining is unsafe.
2. **Lifecycle as effects**: `ctx.effect(() => () => domain.close())`; the firehose subscriptions return a composite disposer (`:73-92`); the interval is cleared in an effect (`:106-109`).
3. **Real event-driven ingest** instead of polling: `ctx.on("session/event" | "session/created" | "session/disposed" | "session/flush", …)` (`:74-85`), with a 3 s delayed `bootstrap()` and a 5-minute reconciliation timer.
4. **Seam-tolerant optional capability**: `settings` is injected lazily; absent → the Apply feature degrades to read-only rather than failing boot (`:39-43`).
5. **`loader` enumeration** to build a plugin inventory, filtering `@deepseek-ai/*` and `cordis` (`:113-126`).

Storage: a seven-table domain (`src/state.ts:179-191`) — `reports`, `session_index`, `period_stats`, `apply_proposals`, `apply_records`, `verify_records`, `audit_log` — with **two independent version constants** used as cache/record invalidation keys: `REPORT_SEM = 7` (report semantics) and `INDEX_VERSION = 18` (`src/tools.ts:103`), both documented in `docs/ARCHITECTURE.md:80-91`.

HTTP surface (`src/api.ts:1-12`, `:239-273`, `:277-694`): one `kind: "prefix"` route at `/whale/api` with a POST method-dispatch table (`generate`, `summary`, `list`, `get`, `delete`, `html`, `balance`, …), plus a separate `/whale/assets` **whitelist** route for whale SVGs. Every route is wrapped by `isTrustedApiRequest` (`src/trust-fence.ts`) and disposed via `ctx.effect`.

Tool: one tool, `whale_report` (`src/tools.ts:571-698`), with an enum-constrained `preset` parameter, a fully specified JSON-Schema `output.schema` (with a documented validator limitation — only boolean `additionalProperties`, `:59-61`), a `render` that returns the markdown report as a text block, and a `presentCall` that supplies the generic chat card:
```ts
presentCall: (args) => ({
  card: "generic",
  title: `生成深迹${PRESET_LABELS[(args as { preset: ReportPreset }).preset] ?? "报告"}`,
  kind: "other",
  rawInput: args,
}),
```
Note `:114-116`: it *stopped* writing its custom `whale/report` session event because the harness's `KNOWN_SESSION_EVENT_TYPES` reject unknown plugin events on old versions, which would make the whole session history unloadable — a real compatibility trap for anyone planning a custom event type.

Client half (`src/client/index.tsx:19-146`): `export const name = "whale-report-client"`, `export const inject: string[] = []`, `apply(ctx)` where `ctx` is a **type-only minimal structural view** (`{ effect, inject }`, `:104-107`). It always mounts a fallback floating button + drawer into a `document.body` host div, and *additionally* registers a tab with `ctx.betterSidebar` when that service exists (`:131-145`), hiding the fallback when the tab registers. The `betterSidebar` descriptor is declared locally as a minimal structural interface (`:36-46`) — copy this, do not import the plugin's types.

## 2.5 Build

- `tsconfig.json:1-14` — same as study plus `"lib": ["ES2023", "DOM"]` and `"jsx": "react-jsx"`.
- `tsconfig.build.json:1-13` — byte-identical to study's (outDir lib, declarationDir lib/types, maps).
- `tsdown.config.ts:1-43` — client bundle only, with a documentation-quality header explaining every constraint:
  ```ts
  const CLIENT_EXTERNALS = ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "cordis"];

  export default defineConfig({
    entry: { client: "src/client/index.tsx" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    dts: false,
    sourcemap: true,
    clean: false,
    external: CLIENT_EXTERNALS,
    outputOptions: {
      entryFileNames: "client.js",
      banner: "window.__ModuleLoader__.load({ id: 'dsh-whale-report', factory: (require) => {",
      footer: "return module.exports; } });",
      intro: "var module = { exports: {} }; var exports = module.exports;",
    },
  });
  ```
  Rationale (`:9-16`): react/cordis resolve from the official platform module table; the bundle **must stay a single file** because the module table only serves `/plugins/<id>/client.js`; therefore **no dynamic imports in client source**; and CSS never goes through the bundler — the client injects `<style data-plugin>` itself.
- `build` script = `rm -rf lib && tsc -p tsconfig.build.json && tsdown`: tsc emits the unbundled host half + `.d.ts`; tsdown overwrites/produces the single `lib/client.js`. Result: `lib/*.js` ESM per module (host), `lib/client.js` CJS-in-banner browser bundle, `lib/types/**/*.d.ts`, `lib/client/**` tsc byproduct (gitignored, shipped).
- Verified bundle head (`lib/client.js:1-2`): `window.__ModuleLoader__.load({ id: 'dsh-whale-report', factory: (require) => {` + the module shim.
- `pnpm-workspace.yaml` exists only to allow esbuild's build script.

## 2.6 Tests

`vitest.config.ts:1-7` — `include: ["tests/**/*.test.{ts,tsx}"]`. 38 test files, ~314–393 cases (README says 314 at `:321`, CHANGELOG claims 393 for v0.6.0). Per-file jsdom is opted in with a pragma (`tests/client-refresh.test.tsx:1`: `// @vitest-environment jsdom`) rather than a global environment — server tests stay in node.

How they fake the runtime — no DSH process is ever started. The shared harness `tests/apply-harness.ts` provides `FakeSettingsSeam` (which faithfully reimplements observed seam semantics: monotonic revision, no-op writes don't bump, `SETTINGS_CONFLICT` with expected/actual — `:12-39`), `fakeTable()` / `fakeDomain()` (`:41-68`) that satisfy the `Domain`/`table` structural shape, and domain-specific event builders (`bashTimedOutResult`, `codeTimedOutResult`, `toolPair`, `:100-143`). A representative server test builds its own `sessionQuery` + `index` fakes inline (`tests/persistence.test.ts:11-38`):

```ts
function makeSvc(liveIds: string[], events?: Record<string, {type:string;seq?:number;time:number;data?:unknown}[]>) {
  const index = new Map<string, SessionIndexRecord>();
  const putCalls: string[] = [];
  const failNext: boolean[] = [];
  return {
    svc: {
      sessionQuery: {
        async listSessions() { return liveIds.map((id) => ({ header: { id, createdAt: 1_786_000_000_000 }, live: true })); },
        async readSession(id: string) {
          return { session: { id, seedLength: 0 }, events: (events?.[id] ?? []) as … };
        },
      },
      index: {
        get: (k: string) => index.get(k),
        put: async (k: string, v: SessionIndexRecord) => {
          if (failNext.shift() === true) throw new Error("disk full");
          putCalls.push(k); index.set(k, v);
        },
      },
    },
    index, putCalls, failNext,
  };
}
```

Client tests render the real component into jsdom and drive a `vi.fn()` fetch router with manually-settled deferred promises (`tests/client-refresh.test.tsx:32-52`, `tests/client-fastpath.test.tsx:18-30`) to prove stale-response ordering, abort handling, and no-overwrite behaviour. Test names encode regression intent (`"5min 内多次 flush（持续事件）→ 至多 1 次写"`). Test taxonomy per README `:321`: engine/statistics, insight & improve rules, fault isolation, salvage, usage accounting, theme, peak/off-peak pricing, export, client refresh resilience, query engine & period invariants, oracle reconciliation, incremental ingest, timezone matrix, persistence.

## 2.7 Docs / README

README outline (350 lines): centered SVG logo → `<h1>` → tagline (`Your Agent, in numbers.`) → positioning paragraph → **badge row** (npm version, GitHub release, CI workflow badge, awesome-dsh-plugin listing, MIT) → a **monospace feature strip table** (`6 PERIODS · 10 FINDINGS · 4 IMPROVE RULES · …`) → hero screenshot → `## Why DeepTrace` (six italicized user questions) → `## The loop` (SEE → NOTICE → TRACE → IMPROVE as a styled 4-cell table) → `## Product` (two full-width screenshots with `<sub>` captions) → `## Query Engine` (INGEST ONCE → QUERY MANY, with subsections) → `## Performance` (before/after table with real numbers) → `## Apply & Verify` (pipeline diagram in a code block, worked example, safety bullet list) → `## What it measures` (a 2-column table of ~18 metric groups) → `## Deterministic insights` (rule table) → `## Privacy / read-only` (bullets) → `## Reports` (preset table) → `## Export` → `## Installation` → `### 立即体验（不用装插件）` (CLI without installing) → `## Architecture` (ASCII data-flow block) → `## Development` (5 commands with test-count annotation) → `## Status & limitations` (honest limitations) → `## License` → `## Friends` (cross-links) → centered closing line + mascot.

Readable-README techniques worth copying: badges immediately after the tagline; a numeric "feature strip" so a skimmer learns scope in 3 seconds; screenshots placed at the exact claim they support with `<sub>` captions; the before/after performance table (7ms vs 31s is the single most convincing line); explicit Safety and Status/Limitations sections that pre-empt distrust; a "try it without installing" CLI block; `docs/images/*.png` referenced from the README so the repo page and npm page share assets.

Docs: `docs/ARCHITECTURE.md` is 10 numbered sections (`总览 / 数据流 / 模块职责 / 存储结构 / API / 洞察规则 / 导出 / 兼容性策略 / 隐私与安全边界 / Roadmap`), with an ASCII host-half‖browser-half diagram (`:9-21`), a 12-step data-flow trace (`:25-55`), and a **module-responsibility table with a "关键约束" column per file** (`:63-79`). `docs/ARCHITECTURE.md:134-140` is the compatibility-drift table (`webServer→httpServer`, `dsh.client→dshClient`, `SessionQueryEngine→SessionQueryService`) — the single most reusable doc in this whole recon. `RFC-v0.6-apply-verify.md` (42 KB) shows the design-doc-before-code habit. `CHANGELOG.md:1-3` opens with a Keep-a-Changelog + SemVer commitment; entries are grouped by `### Added/Fixed/Validation` and even record migration constants (`INDEX_VERSION 17 → 18`, `REPORT_SEM 6 → 7`, `:17`).

## 2.8 Install path

README `:264-283` documents two distinct modes:

```sh
# ① DSH plugin install (recommended, full functionality)
dsh plugin --profile web add "github:SenmuuuuW/dsh-whale-report"
# restart dsh web for the host half; the client bundle updates automatically

# ② npm package install (dependency only)
npm install dsh-whale-report@0.6.1
```
with the explicit warning that `npm install` does **not** register the plugin (`:281`). Compat baseline stated as DSH 0.1.1-rc.2 with peer range `>=0.1.1-rc.2 <0.2.0` (`:266`). Two entry points documented: the panel (better-sidebar tab, or the fallback floating button) and chat (`whale_report`).

**Published on npm**: yes — badge to `https://www.npmjs.com/package/dsh-whale-report` (`README.md:12`), `npm view dsh-whale-report version` → `0.6.1`, `time.modified 2026-09-03`. No `publishConfig` (default public access for an unscoped name).

**What the `.tgz` files are**: `dsh-whale-report-0.6.0.tgz` (126 files) and `dsh-whale-report-0.6.0-rc.1.tgz` are the npm-pack tarballs kept in-repo as release artifacts / acceptance fixtures (CHANGELOG v0.6.0 lists `tarball-only acceptance` and `npm package includes nested Apply/Verify runtime modules`). Contents of the tarball: `package/{package.json, LICENSE, cordis.patch.yml?, lib/*.js, lib/*.js.map, lib/types/**/*.d.ts, lib/apply/*, lib/verify/*, lib/client.js, lib/client/**}`. It is the artifact you can install with `pnpm add ./dsh-whale-report-0.6.0.tgz` or inspect with `tar tzf`.

## 2.9 Distribution

`.github/workflows/ci.yml` (39 lines) — the only CI in the four repos: push to `main` + PR → `pnpm/action-setup@v4` (pnpm 10) → `setup-node@v4` (node 24, pnpm cache) → `pnpm install --frozen-lockfile` → **`pnpm add -D @deepseek-ai/dsh-tools@0.1.1-rc.2 @deepseek-ai/dsh-session@0.1.1-rc.2 @deepseek-ai/dsh-session-query@0.1.1-rc.2 @deepseek-ai/cordis@4.0.1 @deepseek-ai/schemastery@3.18.1`** (comment `:26-27`: the harness packages are on public npm, so CI installs them for a full typecheck) → `pnpm typecheck` → `pnpm test` → `pnpm build`.

Versioning: SemVer + git tags `v0.4.0 … v0.6.1` (`git tag` in the repo) and CHANGELOG sections per version. Two git remotes exist (`origin` SenmuuuuW, `omdsh` omdsh-dev) — upstream/fork duality. `LICENSE` = MIT, "Copyright (c) 2026 dsh-whale-report contributors".

---

# 3. dsh-minecraft — DESIGN.md + interactive UI

## 3.1 Anatomy

```
dsh-minecraft/                    # git repo, origin SenmuuuuW/dsh-minecraft
├── DESIGN.md                     # 8 553 B, 10 sections — the design doc
├── README.md                     # 10 059 B
├── package.json / cordis.patch.yml
├── tsconfig.json / tsconfig.build.json / tsdown.config.ts / vitest.config.ts
├── .gitignore                    # node_modules/ lib/ .sessions/ *.tsbuildinfo
├── pnpm-lock.yaml
├── src/                          # 19 files
│   ├── index.ts (119)            # entry: name/inject/Config/apply
│   ├── tools.ts (266)            # 3 tools
│   ├── api.ts (227)              # /minecraft/api route registration
│   ├── state.ts (37)             # in-memory current-sketch singleton
│   ├── sidebar.ts (108)          # §-color scoreboard line layout → commands
│   ├── rcon.ts (257)             # hand-rolled Minecraft RCON protocol client
│   ├── sketch.ts / blueprint.ts / blocks.ts / examples.ts / types.ts
│   ├── texture-source.ts (295)   # vanilla resource-pack / version-jar texture discovery
│   ├── zip-entry.ts / trust-fence.ts
│   └── client/                   # 4 files — the browser half
│       ├── index.tsx (532)       # panel: views, polling, push button
│       ├── BlueprintView.tsx (271), textures.ts (273), colorize.ts (90)
├── lib/                          # tsc host output + tsdown client.js + types
├── tests/                        # 11 *.test.ts + fake-rcon.ts
└── node_modules/
```

Differences from whale: **no `docs/` (DESIGN.md at root instead), no `preview/`, no `assets/`, no LICENSE file, no CHANGELOG, no `.github/`, no scripts/ dir at all** — yet `package.json` still declares `"link-dsh": "node scripts/link-dsh.mjs"` for a script that does not exist in the repo (`package.json:72`), a small inconsistency. Tests are lean (11 files) because the expensive parts (RCON protocol, layout) are deterministic and the fake server is local.

## 3.2 package.json (verbatim, `dsh-minecraft/package.json:1-74`)

```json
{
  "name": "dsh-minecraft",
  "version": "0.2.0",
  "description": "AI 建筑草图助手 — 玩家描述一句，agent 生成像素画风建筑草图，渲染到游戏侧边栏（计分板 sidebar）。DSH 右侧面板实时预览 + 一键推送到游戏。",
  "type": "module",
  "license": "MIT",
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".":         { "types": "./lib/types/index.d.ts",         "default": "./lib/index.js" },
    "./client":  { "types": "./lib/types/client/index.d.ts",  "default": "./lib/client.js" },
    "./rcon":    { "types": "./lib/types/rcon.d.ts",          "default": "./lib/rcon.js" },
    "./sidebar": { "types": "./lib/types/sidebar.d.ts",       "default": "./lib/sidebar.js" },
    "./sketch":  { "types": "./lib/types/sketch.d.ts",        "default": "./lib/sketch.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": [], "platform": "web" }
  },
  "dshClient": { "inject": [], "platform": "web", "immediately": true },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.6",
    "@deepseek-ai/schemastery": "^3.18.1"
  },
  "devDependencies": {
    "@types/node": "^24.0.0", "@types/react": "^18.3.12", "@types/react-dom": "^18.3.1",
    "react": "^18.3.1", "react-dom": "^18.3.1",
    "tsdown": "^0.11.0", "tsx": "^4.19.2", "typescript": "^5.6.3", "vitest": "^3.0.5"
  },
  "scripts": {
    "build": "rm -rf lib && tsc -p tsconfig.build.json && tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "link-dsh": "node scripts/link-dsh.mjs"
  }
}
```

Distinctive choices:
- **Four extra public subpath exports** (`./rcon`, `./sidebar`, `./sketch`) — a deliberate pattern for exposing a portable engine to other consumers (mirrors whale's `./core`). The `.d.ts` always mirrors `lib/types/<same path>`.
- `files: ["lib"]` — the whole lib, including `lib/types`. Simplest possible allowlist; note this contrast with whale's surgical list and study's `lib + courses + patch`.
- `peerDependencies` is minimal (**only `cordis`, `dsh-tools`, `schemastery`**) because this plugin needs no storage domain and no session query — state is in-memory (`src/state.ts:22`: `let current: CurrentSketch | null = null;`). Peer ranges use the older `^0.1.0-rc.6`; `^` on a prerelease is fragile, which is why whale moved to `>=x <0.2.0`.
- `Config` here is rich (`src/index.ts:25-48`): host/port/password/timeoutMs/textureSource(union of `z.const`)/minecraftHome/`sketchLimits` nested object with defaults — the best example in the four repos of a schemastery config with nested objects, unions, and defaults.
- Not on npm under its own identity (name is taken by an unrelated project: `npm view dsh-minecraft` → 0.12.4, repo `Ruqii/dsh-minecraft`, "Play Minecraft from DeepSeek Harness … Mineflayer bot"). So this repo is effectively **unpublished/name-blocked**, despite README describing `dsh plugin add`.

## 3.3 cordis.patch.yml (verbatim, `dsh-minecraft/cordis.patch.yml:1-12`)

```yaml
# dsh-minecraft bundle patch — 挂载「AI 建筑草图助手」核心插件。
# 只做一件事：把本包（dsh-minecraft，导出 cordis 插件三件套 name/inject/apply）插入 profile。
# 它 inject 的 tools 由默认 web profile 提供；RCON 连接、sidebar 渲染全部在插件内部完成，
# 不依赖任何游戏侧代码 —— 零补丁侵入，卸载即净。

- insert:
    - id: minecraft-core
      name: 'dsh-minecraft'
      config:
        host: 127.0.0.1
        port: 25575
        password: !!js process.env.MC_RCON_PASSWORD
```

**The only patch file of the four that carries `config:`** — and it demonstrates the `!!js` custom YAML tag for environment-variable secrets (the loader parses with a `tag:yaml.org,2002:js` customTag; see plugin-manager `lib/index.js:322-327`). Secrets never land in the repo. README `:80` documents disabling a row in place instead of uninstalling:
```yaml
- id: minecraft-core
  disabled: true
```
which is HMR-reloadable and needs no restart.

## 3.4 Entry point (`dsh-minecraft/src/index.ts:22-118`)

```ts
export const name = "minecraft-core";
export const inject = ["tools"];

export const Config = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().default(25575),
  password: z.string().default(""),
  timeoutMs: z.number().default(10_000),
  textureSource: z.union([z.const("auto"), z.const("vanilla"), z.const("built-in")]).default("auto"),
  minecraftHome: z.string().default(""),
  sketchLimits: z.object({ maxLines: …, maxLineChars: …, maxItems: … })
                  .default({ maxLines: 13, maxLineChars: 36, maxItems: 6 }),
});

export function apply(ctx: Context, config: MinecraftConfig) {
  const rcon = new RconClient(options);
  rcon.onDisconnect = (err) => { console.warn(`[dsh-minecraft] RCON 连接异常：${err?.message ?? "已断开"}`); };
  ctx.effect(() => () => { rcon.close(); });          // teardown

  const services: MinecraftServices = {
    rcon, limits,
    onSketch: (sketch, view, titleJson, lines) => { setCurrentSketch({ … }); },  // push state to the panel
    onClear: () => { clearCurrentSketch(); },
  };
  registerMinecraftTools(ctx as unknown as ToolsHost, services);

  // lazy dual-name route registration, identical to whale's
  let registered = false;
  const tryRegister = (serverCtx: Context & { webServer?: unknown; httpServer?: unknown }) => { … };
  ctx.inject(["webServer"], (c) => tryRegister(c …));
  ctx.inject(["httpServer"], (c) => tryRegister(c …));
}
```

The **state-sharing pattern between the two halves** is the key idea: the tool layer mutates a module-level in-memory singleton through `onSketch`/`onClear` callbacks (`src/state.ts:22-36` — three functions over a `let current`), and the browser half polls `GET /minecraft/api/status` every 3 s (`src/client/index.tsx:248-266`). No storage domain, no session events, no cross-process RPC. For a new plugin with real persistence you would replace the singleton with a storage-domain table but keep the `/api/status` + poll shape.

Routes (`src/api.ts:186-225`): four separate `kind:"prefix"` registrations — `/minecraft/api/status`, `/textures`, `/sketch`, `/clear` — each wrapped in `guarded()` which calls `isTrustedApiRequest` and returns 403 `"仅允许本机同源访问"` otherwise; `registerApiRoutes` returns a composite disposer which `index.ts:115` wraps in `ctx.effect`. Handlers do explicit request-body sanitization (`:99-105`: `pickViews`, `pickGrids`, `sanitizePalette`) before validating with `checkSketch(sketch, limits)` — an important pattern: **never trust the panel's JSON, re-validate at the host boundary**. Push-to-game failures are *reported but not fatal* to the preview (`:128-135`), a deliberate UX decision documented in the tool description and README.

Tools (`src/tools.ts:49, 208, 242`): `mc__show_sketch`, `mc__list_players`, `mc__clear_sketch`. **Naming convention: `mc__` double-underscore prefix** (contrast with study's `study_` single underscore and whale's unprefixed `whale_report`). Notably, **none of the three defines `presentCall`** — they rely on the default presentation, unlike study/whale which always supply `card: "generic"`. The tool description doubles as a rendering contract (`tools.ts:51-56`): it enumerates the allowed palette ids and the hard limits, so the model's output validates on first try.

Client half (`src/client/index.tsx:501-532`): identical architecture to whale's — `export const name = "minecraft-client"`, empty `inject`, a `document.body` host div with `createRoot`, a fallback FAB (`⛏️`) + drawer, and an optional `betterSidebar` tab (`id: "dsh-minecraft:sketch"`, `order: 80`, `single: true`). CSS is a 68-line template literal (`:28-95`) injected once via `injectStyle()` guarded by `document.querySelector("style[data-mc-style]")`.

## 3.5 Build / tests

Build config is **byte-identical in structure** to whale's, including the tsdown banner/footer/intro and the same `CLIENT_EXTERNALS` list; only the id string differs (`tsdown.config.ts:33`: `id: 'dsh-minecraft'`). `lib/client.js:1` confirms `window.__ModuleLoader__.load({ id: 'dsh-minecraft', factory: (require) => {`.

Tests: `vitest.config.ts` identical. `tests/fake-rcon.ts` (125 lines) is a real `node:net` RCON *server* that can coalesce frames (to test re-framing) and go silent (to test timeouts) — the best example in the four repos of faking a **protocol** rather than a service. `tests/tools.test.ts:17-27` fakes the DSH tools host with a one-line object and captures definitions by name:

```ts
function setup(server: FakeRconServer, port: number) {
  const rcon = new RconClient({ host: "127.0.0.1", port, password: "test", timeoutMs: 2000, autoReconnect: false });
  clients.push(rcon);
  const registered = new Map<string, ToolDefinition>();
  registerMinecraftTools(
    { tools: { register: (d) => void registered.set(d.name, d) } },
    { rcon, limits: DEFAULT_SKETCH_LIMITS },
  );
  return { rcon, tools: registered };
}
```
and then asserts the exact command sequence sent to the game (`tests/tools.test.ts:53-70`): `scoreboard objectives add dsh_sketch dummy` → displayname → line commands → `setdisplay sidebar dsh_sketch`. This is the pattern to copy for any tool whose value is emitted side-effects: assert the emitted artifact, not just the return value.

## 3.6 Docs / README

README outline: `# dsh-minecraft — AI 建筑草图助手` → intro paragraph + `**零游戏侧代码**` bold claim → `## DSH 右侧面板` → `## 玩法` (an in-game ASCII sidebar sample) → `## 插件工具` (3-row table) → `## 安装与配置` (+ `### 服务器侧准备`) → `## 草图 JSON 格式（agent 输出约束，v2）` → `## 材质渲染器（Web 面板）` (+ `### 双模式纹理来源`, `### 语义 → 原版纹理映射表`) → `## 计分板实现原理` → `## 开发` (+ `### 测试说明`) → `## Model Experience` (+ `### 工具调用`, `### Token 影响`, `### KV Cache 影响`).

Two things stand out for launchability: (1) the **"Model Experience" section** — an explicit statement of tool-call behaviour, token cost, and KV-cache impact, which is the kind of thing DSH plugin reviewers/users ask about; (2) the README explains the *config table* and the *server-side prerequisites* (`enable-rcon`, `forceUnicodeFont=true` for monospace alignment) rather than assuming them. No badges, no screenshots, no LICENSE.

`DESIGN.md` outline: `## 1. 玩法画面`, `## 2. 交互入口（两模式，互补）`, `## 3. 命令设计`, `## 4. agent 的结构化输出（草图 JSON）`, `## 5. sidebar 渲染引擎（核心技术点）`, `## 6. DSH 插件架构`, `## 7. 安全与治理`, `## 8. 测试计划`, `## 9. 里程碑`, `## 10. 未决问题` — a design written *before* the code, with an explicit "open questions" section. This is the doc shape to copy when the plugin has novel technical risk.

## 3.7 Install path

README `:52-64`:
```bash
dsh plugin --profile web add link:<local-checkout>/dsh-minecraft   # local dev install
dsh plugin --profile web remove dsh-minecraft
```
plus the most valuable operational note in the four READMEs (`:64-75`):

> DSH profile 的 `dependencies`（安装清单）与 `dsh.profile.bundles`（加载清单）是两层独立配置，`dsh web` 只按 bundles 加载。手动编辑 package.json 时两处都要改，否则会出现"dependencies 删了但插件还在加载"的现象。

That matches the verified local profile exactly (`~/.dsh/profiles/web/package.json` has both `dependencies` and `dsh.profile.bundles`). Uninstall = one `remove` command; pause = `disabled: true` in the profile patch (HMR, no restart).

## 3.8 Distribution

No CI, no CHANGELOG, no tags inspected, no LICENSE file, and the npm name is owned by an unrelated project. Versioning is `0.2.0` with git history as the changelog (`git log`: `1515280 预览与推送分离…`, `8d68966 vanilla 纹理模式…`, `d62f522 v2 渲染升级…`) — commit messages double as release notes.

---

# 4. dsh-better-sidebar (`-011` copy) — UI focus, and the service other plugins depend on

## 4.1 Nature of this copy (important)

`dsh-better-sidebar-011/` has **no `.git`, no `tsconfig.json`, no `tsconfig.build.json`, no `tsdown.config.ts`, no `vitest.config.ts`, no `tests/`, no `.github/`, no `docs/`, no `AGENTS.md`** — yet it contains `src/`, `lib/`, and `scripts/install.sh` + `scripts/install.ps1`. Its `package.json` `files` array includes `"src"`, `"scripts/install.sh"`, `"scripts/install.ps1"`, `"README.md"`, `"README_EN.md"`, `"LICENSE"`, while its `scripts` reference `tsc -p tsconfig.build.json` and `tsdown` (`package.json:75-83`). **Conclusion: this directory is the extracted npm tarball of `dsh-better-sidebar@0.11.0`** (npm `files` ships both source and build output), not a development checkout. Practical consequence: you cannot rebuild it from this copy, and its `lib/` is the only build artifact — so read it as a *reference for the published artifact layout*, never as a buildable project.

Local installed version in the profile is `0.18.0-alpha.0` (npm `latest` is 0.19.1), so the 0.11.0 interface below has since gained `urlTarget`, `badge`, `onOpen/onActivate/onClose`, and `settings.toggles` `select` rows — all additive.

## 4.2 Anatomy

```
dsh-better-sidebar-011/           # extracted npm package, v0.11.0
├── package.json                  # 5 599 B — the richest manifest of the four
├── cordis.patch.yml
├── LICENSE                       # MIT
├── README.md / README_EN.md      # bilingual, 14 373 / 14 939 B
├── scripts/install.sh            # 246-line, heavily commented installer
├── scripts/install.ps1
├── src/                          # 19 top-level + 60 client files
│   ├── index.ts                  # host half: ~900 lines, 5 route families + 2 WS endpoints
│   ├── config.ts context-types.ts prefs-shared.ts trust-fence.ts invariant.ts wire.ts
│   ├── tools.ts                  # 8 terminal_* tools (gated by a setting)
│   ├── pty-manager.ts agent-pty.ts browser-probe.ts git.ts jobs-routes.ts fs-tree.ts
│   ├── bundle-route.ts html-route.ts      # serve lazy client chunks / sandboxed HTML
│   └── client/                   # ~60 files: Sidebar.tsx, TabBar.tsx, ExplorerView, EditorHost,
│       │                         #   TerminalView, GitView, DiffView, BrowserView, PdfView,
│       │                         #   docx/xlsx/pptx viewers, SubagentView, …
│       ├── index.tsx             # client entry + slot registration + provide('betterSidebar')
│       ├── service.ts            # ★ the TabDescriptor / FileViewerDescriptor contract
│       ├── state.ts prefs.ts locales.ts theme.ts breakpoints.ts …
│       ├── chunks/{docx,xlsx,pptx,editor,terminal}.ts
│       └── *.module.css          # CSS Modules
└── lib/
    ├── index.js                  # host half (tsc)
    ├── invariant.js
    ├── client.js                 # main client bundle (module-loader)
    ├── client-registry.js        # id "dsh-external/dsh-better-sidebar"
    ├── client-editor.js  client-xlsx.js  client-terminal.js
    ├── client-docx.js    client-pptx.js  client-pptx.js
    └── types/**/*.d.ts           # ~90 declaration files
```

## 4.3 package.json (key parts, `dsh-better-sidebar-011/package.json`)

```json
{
  "name": "dsh-better-sidebar",
  "version": "0.11.0",
  "description": "DSH web plugin: a VSCode-like right sidebar (explorer / editor / terminal / git / browser), isolated per conversation session. Exposes a service for other plugins to register sidebar tabs and file viewers.",
  "type": "module",
  "repository": { "type": "git", "url": "https://github.com/omdsh-dev/DSH-better-sidebar" },
  "publishConfig": { "access": "public" },                    // ← the only repo with this
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".":                { "types": "./lib/types/index.d.ts",         "default": "./lib/index.js" },
    "./invariant":      { "types": "./lib/types/invariant.d.ts",     "default": "./lib/invariant.js" },
    "./client":         { "types": "./lib/types/client/index.d.ts",  "default": "./lib/client.js" },
    "./client/service": { "types": "./lib/types/client/service.d.ts","default": "./lib/client.js" },
    "./client/api":     { "types": "./lib/types/client/service.d.ts","default": "./lib/client.js" },
    "./src/*": "./src/*",                                        // ← ships raw TS for consumers
    "./package.json": "./package.json"
  },
  "engines": { "node": ">=20" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-locale",
                 "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-ui-conversation"],
      "platform": "web"
    }
  },
  "files": ["lib/index.js","lib/invariant.js","lib/client.js","lib/client-registry.js",
            "lib/client-docx.js","lib/client-xlsx.js","lib/client-pptx.js","lib/client-terminal.js",
            "lib/client-editor.js","lib/types/**/*.d.ts","src","scripts/install.sh",
            "scripts/install.ps1","cordis.patch.yml","README.md","README_EN.md","LICENSE"],
  "scripts": {
    "build": "rm -rf lib && tsc -p tsconfig.build.json && tsdown",
    "prepublishOnly": "pnpm build",
    "typecheck": "tsc --noEmit",
    "bundle": "tsdown", "watch": "tsdown --watch", "prepare": "tsdown",
    "test": "vitest run"
  },
  "license": "MIT",
  "peerDependencies": { /* 17 @deepseek-ai/* peers + cordis + react + react-dom, ^0.1.0-rc.6 */ },
  "peerDependenciesMeta": { "cordis": { "optional": true } },
  "dependencies": { /* 33 real deps: @codemirror/*, @univerjs/*, xterm, node-pty, ws, docx-preview, clsx, schemastery, xlsx, rxjs */ },
  "devDependencies": { /* the same 16 @deepseek-ai/* + tsdown ^0.22.2, vitest ^4.1.8, jsdom ^29, lightningcss, typescript ^5.6 */ }
}
```

Field notes that matter for a new project:
- **`publishConfig: { access: "public" }`** — the only one of the four (unscoped names don't strictly need it, but it's the explicit declaration).
- **`peerDependenciesMeta.cordis.optional`** — declares that the DI container may be absent (it is provided by the host runtime, and tooling may import types without it).
- `scripts.prepublishOnly: "pnpm build"` + `prepare: "tsdown"` — the **release hygiene dsh-whale-report and dsh-study both lack**. `prepublishOnly` guarantees the published tarball is fresh; `prepare` (run on `pnpm install` for git/link installs) guarantees a git-hosted install has a bundle. **This is the single most important script to copy if you want git-installability.**
- `dsh.client.inject` is a list of **package names of other client modules** the bundle will `require()` at runtime — here four `@deepseek-ai/dsh-client-*` packages. The runtime parses it as a string array and errors on anything else (`dsh-client-modules/lib/index.js:139-152`).
- `files` ships `src` **and** `scripts/install.*` — deliberate: consumers can read the TS and users can run the installer from the installed package.
- `dependencies` are heavy and real (33, including native `node-pty`); this is the "full IDE" end of the spectrum, the opposite of dsh-study's 2 deps.
- `engines: { node: ">=20" }` — looser than the other three (`^22.19.0 || >=24.0.0`).

## 4.4 cordis.patch.yml (verbatim, `dsh-better-sidebar-011/cordis.patch.yml:1-19`)

```yaml
# dsh-better-sidebar bundle patch
#
# This file is the `dsh.bundle.patch` layer of the published npm package: when
# the plugin is installed through the official CLI —
#
#   dsh plugin --profile <name> add dsh-better-sidebar@<version>
#
# — the command reconciles `dsh.profile.bundles` against installed packages
# and, seeing this declaration, appends `dsh-better-sidebar` to the bundle
# stack. The profile boot then merges THIS patch (a single `insert` of the
# plugin row) exactly like the manual cordis.patch.yml mount line used
# before. No profile file edits needed — one command installs and mounts.
#
# If the profile still carries the old manual mount line in its own
# cordis.patch.yml, remove it before switching to the bundle channel to
# avoid double-mounting (two Node halves, two sidebars).
- insert:
    - id: better-sidebar
      name: 'dsh-better-sidebar'
```

The best-documented patch file of the four: it states the install command, the bundle-reconciliation mechanism, and the **double-mount hazard** (an old manual mount line + the bundle channel = two Node halves, two sidebars). Copy this comment style.

## 4.5 Entry point (host half)

`src/index.ts:58-62`:
```ts
/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-better-sidebar'

/** Services required before mounting: the webserver routes, the session store, the loader's connection row, and the tool registry. */
export const inject = ['webServer', 'sessions', 'loader', 'tools']
```
Note: it uses **top-level `inject` for `webServer`** (the older/simple name) and **no lazy dual-name fallback** — a compatibility contrast with whale/minecraft that only works while `webServer` exists. `export { Config }` (`:42`) and re-exports of the context augmentation + descriptor types (`:44-56`) so consumers can `import type {} from 'dsh-better-sidebar'` to gain `ctx.betterSidebar` typing.

`apply(ctx, config?)` (`:433-707`) mounts, each wrapped in `ctx.effect` with a human-readable label:
1. `/sidebar/api` — one POST JSON method-dispatch table with ~25 methods (`session.cwd`, `fs.tree`, `fs.read`, `fs.write` (atomic tmp+rename), 12 `git.*` methods, `pty.close`, `agent-pty.close`, `jobs.output`, `jobs.kill`, `settings.get`, `settings.update`, `browser.probe`) — `buildApi` at `:189-424`. Every request passes `fence(req)` (`isTrustedApiRequest(req, trustedHosts)`), where `trustedHosts` is read live from the loader's `connection` row (`:86-94`) so the fence never drifts from deployment config.
2. `/sidebar/bundle` — lazy client chunks (`registerBundleRoute`).
3. `/sidebar/file` — media route, `isWithin(cwd, path)` scoped to the session cwd.
4. `/sidebar/html` — sandboxed HTML preview with a CSP `sandbox` header (`:644-648`).
5. `/sidebar/ws/terminal` and `/sidebar/ws/agent-terminals` — two websocket upgrade endpoints sharing one wire protocol.
6. `settings` service registration via lazy `ctx.inject(['settings'], …)` (`:476-502`) with a `scope.watch` that **gates tool registration on a user preference** (`syncToolsGate`, `:462-475`) — the model-facing `terminal_*` tools only exist while `agentTerminalTools` is on. This "feature-flagged tool registration with live unregister" pattern is worth copying for expensive/risky tools.
7. A final teardown effect (`:700-706`) disposing tools, ptys, and both WS servers.

Tool names (`src/tools.ts:91,136,177,226,283,369,403,443`): `terminal_create`, `terminal_list`, `terminal_send`, `terminal_read`, `terminal_wait_for`, `terminal_resize`, `terminal_signal`, `terminal_close` — **no namespace prefix at all**, but a coherent verb-suffixed family.

## 4.6 The service other plugins call (the part whale-report and dsh-minecraft depend on)

`src/client/service.ts` is the contract. The service is created per activation and published on the **client** cordis context (`src/client/index.tsx:69-70`):
```ts
const service = createBetterSidebarService(sidebarStore)
ctx.provide('betterSidebar', service)
```
`BetterSidebarService` (`service.ts:190-232`) has `registerTab`, `registerFileViewer`, `getTabs`, `getFileViewers`, `getTab`, `isTabEnabled`, `isViewerEnabled`, `matchFileViewer`, `openTab`, `closeTab`, `subscribe`.

`TabDescriptor` (`service.ts:89-133`) — the fields a consumer may set:
```ts
export interface TabDescriptor {
  id: string                                   // also the SidebarTab.type value ('my-plugin:db')
  title: string | (() => string)
  icon?: ReactNode | ((size: number) => ReactNode)
  order?: number                               // + menu sort order, default 100
  hidden?: boolean
  available?: (ctx, scope, state) => boolean
  single?: boolean                             // sugar for dedupeKey: () => id
  dedupeKey?: (tab: SidebarTab) => string | undefined
  createTab?: (state: SidebarState) => { tab: SidebarTab; patch?: Partial<SidebarState> } | null
  settings?: SidebarSettingsDeclaration
  component: (props: TabComponentProps) => ReactNode
}
```
`TabComponentProps` (`service.ts:72-86`) gives `ctx`, `store`, `scope` (with `scope.sessionId`), `tab`, and `visible` (true only when the tab is active AND the panel is open — **use it to pause polling/costs**), plus optional explorer callbacks. `registerTab` throws on a duplicate id (`:262-264`) and returns a disposer that only removes its own descriptor (`:267-272`) — HMR-safe by construction.

Installed 0.18.0 adds `urlTarget`, `badge`, and lifecycle callbacks to the same descriptor (verified in `~/.dsh/profiles/web/node_modules/dsh-better-sidebar/lib/types/client/service.d.ts`).

**Consumption pattern actually used by whale/minecraft**: do NOT import the package. Declare a 10-line structural interface locally and inject lazily:
```ts
interface BetterSidebarLike {
  registerTab(descriptor: {
    id: string; title: string; icon?: ReactNode | ((size: number) => ReactNode);
    order?: number; single?: boolean; component: (props: unknown) => ReactNode;
  }): () => void;
}
// …
ctx.inject(["betterSidebar"], (injected) => {
  const service = injected.betterSidebar as BetterSidebarLike | undefined;
  if (service === undefined) return;
  ctx.effect(() => service.registerTab({ id: "dsh-whale-report:report", title: "深迹 DeepTrace",
    icon: (size) => <ChartIcon size={size} />, order: 90, single: true,
    component: () => <SidebarTab /> }));
  setTabRegistered(true);   // hides the fallback FAB
});
```
(`dsh-whale-report/src/client/index.tsx:36-46, 131-145`; `dsh-minecraft/src/client/index.tsx:432-441, 518-531`.) This keeps the dependency optional and version-tolerant — copy it exactly.

## 4.7 Build (inferred from artifacts)

No build config in this copy, but the artifacts prove the pipeline:
- `lib/index.js` — tsc ESM host half; source uses `.ts` extension specifiers (`from './context-types.ts'`, `from './bundle-route.ts'`) meaning the missing tsconfig sets `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` (TS 5.7+) so tsc rewrites them to `.js`.
- `lib/client.js:1-4` — a **multi-line** banner form of the module-loader contract (`{ id: "dsh-better-sidebar", factory: (require) => {`), then `let react = require("react")`, `require("react-dom/client")`, `require("@deepseek-ai/dsh-client-ui-primitives")`. So the official/large-project variant **externalizes platform modules by their real package names**, not just `react`/`cordis` like whale/minecraft.
- `lib/client-registry.js:2` — a second bundle with id `"dsh-external/dsh-better-sidebar"` (an external-registry bundle for third-party consumption).
- **Multiple lazy chunks**: `client-editor.js`, `client-xlsx.js`, `client-terminal.js`, `client-docx.js`, `client-pptx.js`, served by `/sidebar/bundle` (`src/bundle-route.ts`) and loaded from `src/client/lazy-chunk.tsx` / `chunk-loader.ts`. The README (`:30`) states the payoff: "启动只拉 ~325KB 核心，Office / 终端 / 编辑器等重依赖用到才按需拉取".
- CSS: `*.module.css` for component styles (CSS Modules, needs `lightningcss` per devDeps) — a different choice from whale/minecraft's JS-injected `<style data-plugin>`. The tsdown comments in whale/minecraft explicitly say styles do NOT go through the bundler; better-sidebar gets CSS Modules working via its own pipeline. For a new plugin, JS-injected styles are the lower-risk path.

## 4.8 Install path (the most complete answer in the four repos)

README `:43-120` and `scripts/install.sh` document three layers of the same mechanism:

**One-liner** (`README.md:48`): `curl -fsSL https://raw.githubusercontent.com/omdsh-dev/DSH-better-sidebar/main/scripts/install.sh | bash`

**Manual equivalent** (`README.md:84-95`):
```sh
cd ~/.dsh/profiles/web
pnpm approve-builds --all                     # allow native postinstall scripts (pnpm 11 blocks them)
cat >> pnpm-workspace.yaml <<'EOF'
minimumReleaseAgeExclude:
  - dsh-better-sidebar
EOF
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add dsh-better-sidebar
```

**What install.sh does, step by step** (all idempotent, with `--dry-run`/`--restart`/version args):
1. Resolves the version (`npm view`/`pnpm view`, default `latest`) — `:85-106`.
2. Resolves the CLI: `dsh` on PATH, else `npx -y --package @deepseek-ai/dsh dsh` — `:109-117`.
3. Pre-writes `~/.dsh/profiles/web/pnpm-workspace.yaml` with `allowBuilds: { node-pty: true, protobufjs: true }` and `minimumReleaseAgeExclude: [- dsh-better-sidebar]` — `:139-168`.
4. Runs `dsh plugin --profile web add dsh-better-sidebar@<spec>` — `:172`.
5. **Verifies** `dsh.profile.bundles` now contains the package by parsing `${PROFILE_DIR}/package.json` — `:180-190`.
6. Idempotently strips any legacy manual mount line for `better-sidebar` from the profile's own `cordis.patch.yml` — `:193-229`.
7. Prints the restart/hard-refresh instruction (`:234-246`): "重启 DSH 并硬刷新（Cmd/Ctrl+Shift+R）使新副本生效"; offers `pm2 restart dsh-web`.

Documented environment variables: `DSH_HOME` (default `~/.dsh`), `REGISTRY`, `DSH_CMD` (`install.sh:23-26`). Documented rollback: `dsh plugin --profile web remove dsh-better-sidebar`, or set the dependency back to `link:<path>` and re-run `pnpm install` (`:36-37`).

## 4.9 Distribution

`publishConfig.access: public`, `prepublishOnly` build hook, bilingual READMEs (`README.md` + `README_EN.md`) with a language switcher, an inline **video** (`README.md:15`: a bare github user-attachments URL, which GitHub renders as a player) followed by a full screenshot (`:17`), emoji section headings, a service-integration snippet (`:204-217`) pointing at an `AGENTS.md` (not shipped), a Security section, Known Limitations, Platform Support (Windows/Linux/macOS, `node-pty` prebuilt-binary caveat), and a Friends section. LICENSE = MIT. npm `latest` = 0.19.1 with `beta`/`alpha` dist-tags (real prerelease channel discipline).

---

# 5. SYNTHESIS

## 5.1 The consensus skeleton

All four repos — despite spanning 6 files to 80+ and 2 deps to 33 — agree on this shape. Recommended layout for the new plugin:

```
<plugin>/
├── package.json                  # type:module, main/types/exports, files, dsh, peers, scripts
├── cordis.patch.yml              # ONE `insert:` row {id, name, [config]} — the mount declaration
├── tsconfig.json                 # noEmit typecheck config, include ["src","tests"]
├── tsconfig.build.json           # extends it: outDir lib, declarationDir lib/types, maps
├── tsdown.config.ts              # ONLY if there is a client half (single-file client.js)
├── vitest.config.ts              # include ["tests/**/*.test.{ts,tsx}"]
├── README.md                     # the launch surface (see 5.5)
├── CHANGELOG.md                  # Keep a Changelog + SemVer (whale only — do it anyway)
├── LICENSE                       # MIT full text (only whale + better-sidebar have it)
├── .gitignore                    # node_modules/ lib/ *.tsbuildinfo [.sessions/] [*.tgz] [lib/client/]
├── docs/
│   ├── ARCHITECTURE.md           # numbered sections + module-responsibility table + drift table
│   └── images/*.png              # README screenshots live here
├── src/
│   ├── index.ts                  # name / inject / Config / apply(ctx, config)
│   ├── tools.ts                  # defineTool(...) per tool + registerXxxTools(ctx, services)
│   ├── state.ts                  # defineDomain({name, version, tables}) + record schemas
│   ├── api.ts                    # registerApiRoutes(ctx, server, svc) → disposer  [if GUI pages]
│   ├── trust-fence.ts            # isTrustedApiRequest (copy from whale/minecraft)
│   ├── <pure core>.ts            # deterministic, IO-free, heavily tested (srs/stats/sidebar)
│   └── client/                   # the browser half [if GUI pages]
│       ├── index.tsx             # name / inject=[] / apply(ctx) — mount + provide/inject
│       ├── content.tsx …         # views
│       └── styles.ts             # JS-injected <style data-plugin>
├── tests/                        # vitest; fake the seams, never boot DSH
│   ├── <pure>.test.ts
│   └── harness.ts                # fake domain/table/services (non-test helper)
├── scripts/
│   ├── link-dsh.mjs              # dev-only peer linker (optional now that peers are on npm)
│   └── <cli>.mjs                 # optional: "try it without installing" path
├── assets/                       # shipped via files; served through a whitelisted route
└── courses/ | packs/ | content/  # data-as-code, shipped via files
```

Build pipeline consensus:
1. `tsc -p tsconfig.build.json` → `lib/*.js` **unbundled ESM, per-module**, `.js.map`, `lib/types/**/*.d.ts`. Host half is never bundled.
2. `tsdown` → `lib/client.js` **single file**, `format: "cjs"`, `platform: "browser"`, `dts: false`, `sourcemap: true`, `external: [react, react/jsx-runtime, react-dom, react-dom/client, cordis]`, wrapped in `window.__ModuleLoader__.load({ id: '<npm name>', factory: (require) => { … } })`. **Only if there is a client half.**
3. `build` = `rm -rf lib && tsc -p tsconfig.build.json && tsdown`.

## 5.2 Consensus package.json template

```json
{
  "name": "<dsh-prefixed-name>",
  "version": "0.1.0",
  "description": "<one Chinese sentence naming the user-visible outcome>",
  "type": "module",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/<you>/<repo>.git" },
  "homepage": "https://github.com/<you>/<repo>",
  "bugs": { "url": "https://github.com/<you>/<repo>/issues" },
  "keywords": ["deepseek", "dsh", "deepseek-harness", "cordis", "plugin"],
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".":                { "types": "./lib/types/index.d.ts",        "default": "./lib/index.js" },
    "./client":         { "types": "./lib/types/client/index.d.ts",  "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "assets", "<content-dir>"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": [], "platform": "web" }
  },
  "dependencies": { "zod": "^4.0.0" },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-session": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-storage": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/dsh-storage-domain": ">=0.1.1-rc.2 <0.2.0",
    "@deepseek-ai/schemastery": "^3.18.1"
  },
  "devDependencies": {
    "@deepseek-ai/dsh-tools": "0.1.1-rc.2",
    "@deepseek-ai/dsh-storage-domain": "0.1.1-rc.2",
    "@types/node": "^24.0.0", "@types/react": "^18.3.12", "@types/react-dom": "^18.3.1",
    "jsdom": "^30.0.1", "react": "^18.3.1", "react-dom": "^18.3.1",
    "tsdown": "^0.11.0", "typescript": "^5.6.3", "vitest": "^3.0.5"
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

Deviations that are consensus-backed:
- **Omit `tsdown` and all react/jsdom devDeps if there is no client half** (study does exactly this; its build is `tsc` alone).
- **Drop `dshClient`** — verified dead (nothing in the installed runtime reads it).
- **Drop `react`/`react-dom` from `peerDependencies`** unless you actually `require('react')` from the bundle: whale/minecraft don't list them as peers (only as devDeps + externals); better-sidebar does list them. The externals list is what matters.
- Add `"./core"`-style subpath exports only if an external consumer exists.

## 5.3 What differs, and what to pick for the NEW project

The new plugin needs: **a backend plugin + own persistent state + custom GUI pages (roadmap/lesson) + a dependency on an existing Skill.** Mapping each requirement to the repo that proves it:

| Requirement | Proved by | What to take |
|---|---|---|
| Backend plugin | all four | `src/index.ts` with `name` / `inject` / `Config` (schemastery) / `apply`; no default export |
| Own persistent state | study (`state.ts:58-64`, 1 table) and whale (`state.ts:179-191`, 7 tables) | `defineDomain({name, version, tables})` + `domainTable<Key,Rec>(zodSchema)`; one table per entity; a version constant for invalidation |
| Custom GUI pages | whale (`client/`, `api.ts`) is the reference; minecraft is the minimal one | `api.ts` prefix routes + trust fence + polling client, or the **simpler minecraft shape** (in-memory/persisted status endpoint + `setInterval` poll) if you don't need live push |
| GUI placement | whale + minecraft agree exactly | always mount a fallback (FAB + drawer) AND optionally register a `betterSidebar` tab; declare `BetterSidebarLike` locally, inject lazily, hide fallback when the tab registers |
| Dependency on an existing Skill | **not demonstrated by any of the four** | see 5.6 |
| Content-as-code (lessons/roadmap) | study (`courses/` + `pack.ts`) | a content dir in `files`, zod-validated loader with fail-loud errors, a `courses/README.md` format spec |
| Deterministic core worth testing | study `srs.ts`, minecraft `sidebar.ts`, whale `stats.ts` | one IO-free module; test it exhaustively with vitest |
| CI | whale `.github/workflows/ci.yml` | copy verbatim, adjust the peer install line |
| Release discipline | better-sidebar (`prepublishOnly`, `prepare`, dist-tags) of the four | `prepublishOnly: "pnpm build"` + `prepare: "tsdown"` |
| README launch surface | whale | badges, feature strip, screenshots w/ captions, before/after table, Safety + Limitations |
| Design doc for novel risk | minecraft `DESIGN.md` | 10 sections ending in "open questions" |
| Client-only preview without DSH | whale `preview/` | `__ModuleLoader__` shim + React UMD + fixture + 30-line server — enormous iteration speedup |
| Installer script | better-sidebar `scripts/install.sh` | only if pnpm 11 `allowBuilds`/`minimumReleaseAge` quirks apply (they do if you have native deps) |

**Recommended hybrid**: study's `src/` discipline + state domain, whale's `api.ts` + `client/` + preview + CI + CHANGELOG + README, minecraft's `DESIGN.md` + the `disabled: true` documentation, better-sidebar's `prepublishOnly`/`prepare` scripts and optional-service structural-interface consumption pattern. Build with `tsc + tsdown` (whale/minecraft config verbatim, only the `id` changed).

**Explicitly avoid**: study's untested `apply()`; study's missing `prepare` (git installs would ship without `lib/`); the dead `dshClient` key; `dsh-minecraft` as a package name (taken on npm by an unrelated project); `^0.1.0-rc.6` peer ranges (use `>=0.1.1-rc.2 <0.2.0`); writing custom session events unless you confirm the harness accepts them (whale reverted this — `src/tools.ts:114-116`).

## 5.4 "Copy this from repo X" — concrete list

| Copy | From | Path to read |
|---|---|---|
| `name`/`inject`/`Config`/`apply` skeleton + delayed injection + `ctx.effect` teardown | study | `src/index.ts:24-63` |
| Tool definition with parameter descriptions + `output.schema` + `render` + `presentCall` | study | `src/tools.ts:133-185` (smallest complete example) |
| Storage domain with zod record schemas + key helper | study | `src/state.ts:43-64` |
| Session-event declaration merge (only if you truly need replayable UI events) | study | `src/state.ts:22-35` |
| Version-constant invalidation for cached records | whale | `src/state.ts:11-15`, `src/tools.ts:103` |
| Content-pack loader with fail-loud validation + topological prerequisite check | study | `src/pack.ts:90-141` |
| Lazy dual-name route registration + `in` probe (never `??`) | whale/minecraft | `dsh-whale-report/src/index.ts:132-148` |
| Optional-service seam that degrades instead of blocking boot | whale | `src/index.ts:39-43` |
| HTTP prefix routes + `isTrustedApiRequest` fence + composite disposer | minecraft (smallest) | `src/api.ts:186-225`, `src/trust-fence.ts` |
| Request-body sanitization before validation | minecraft | `src/api.ts:99-110` |
| BetterSidebar tab registration with a locally-declared structural interface | whale | `src/client/index.tsx:36-46, 131-145` |
| Client entry: fallback FAB/drawer + `createRoot` + `ctx.effect` unmount + injected styles | minecraft | `src/client/index.tsx:97-103, 501-532` |
| `tsdown.config.ts` (only the `id` changes) | whale/minecraft | `dsh-whale-report/tsdown.config.ts:1-43` |
| tsconfig + tsconfig.build split | study | `tsconfig.json`, `tsconfig.build.json` |
| Vitest config + jsdom-per-file pragma | whale | `vitest.config.ts`, `tests/client-refresh.test.tsx:1` |
| Fake domain/table + fake service harness | whale | `tests/apply-harness.ts:41-68` |
| Fake a protocol/service with a real local server | minecraft | `tests/fake-rcon.ts:22-80` |
| Assert emitted side effects, not just return values | minecraft | `tests/tools.test.ts:53-70` |
| Preview harness for client-only iteration | whale | `preview/index.html:14-40`, `preview/serve.mjs` |
| CI workflow | whale | `.github/workflows/ci.yml:1-39` |
| CHANGELOG format + migration-constant entries | whale | `CHANGELOG.md:1-17` |
| Architecture doc shape (module table w/ constraints + drift table) | whale | `docs/ARCHITECTURE.md:63-79`, `:134-140` |
| Design doc with milestones + open questions | minecraft | `DESIGN.md` (10 sections) |
| README launch structure | whale | `README.md:11-17` (badges), `:19-39` (strip), `:88-96` (screenshots+captions), `:121-130` (bench), `:231-239` (privacy), `:325-332` (limitations) |
| Installer with `--dry-run`, bundle verification, idempotent legacy-mount removal | better-sidebar | `scripts/install.sh:129-229` |
| `publishConfig` + `prepublishOnly` + `prepare` | better-sidebar | `package.json:10-12, 75-83` |
| Config with nested objects/unions/**`!!js` env secret** in the patch | minecraft | `package.json` Config at `src/index.ts:25-48`; `cordis.patch.yml:9-12` |

## 5.5 Naming conventions (measured)

| Dimension | study | whale | minecraft | better-sidebar | Recommendation |
|---|---|---|---|---|---|
| npm name | `dsh-study` | `dsh-whale-report` | `dsh-minecraft` | `dsh-better-sidebar` | `dsh-<noun>` (all four). Unscoped, lowercase, hyphenated. **Check npm first** — `dsh-minecraft` is taken. |
| cordis `name` export | `study-core` | `whale-report-core` | `minecraft-core` | `dsh-better-sidebar` | `<subject>-core` (3/4 agree); plugin id ≠ npm name is normal |
| patch `id:` | `study-core` | `whale-report-core` | `minecraft-core` | `better-sidebar` | same as the `name` export |
| client `name` export | — | `whale-report-client` | `minecraft-client` | (unset) | `<subject>-client` |
| module-loader id | — | `dsh-whale-report` | `dsh-minecraft` | `dsh-better-sidebar` (+ `dsh-external/…`) | **must equal the npm `name`** |
| tool names | `study_courses`, `study_teach`, `study_grade`, `study_progress` | `whale_report` | `mc__show_sketch`, `mc__list_players`, `mc__clear_sketch` | `terminal_create` … | pick ONE: `study_x` (single `_` + subject prefix) is the most readable; `mc__` risks colliding with a future `mc` namespace owner |
| storage domain name | `study` | `whale` | (none) | (uses settings ns) | short noun, `version: 1` |
| route prefix | — | `/whale/api`, `/whale/assets` | `/minecraft/api/*` | `/sidebar/api`, `/sidebar/file`, `/sidebar/bundle`, `/sidebar/html`, `/sidebar/ws/*` | `/<subject>/api` (+ `/<subject>/assets`) |
| DOM attributes | — | `data-whale-report*` | `data-mc-*` | (CSS Modules) | `data-<subject>-*` |
| BetterSidebar tab id | — | `dsh-whale-report:report` | `dsh-minecraft:sketch` | builtins use bare names | `<npm-name>:<page>` |

## 5.6 The one requirement no repo demonstrates: depending on an existing Skill

None of the four repos consumes a DSH **Skill**; they all depend on *services* (`tools`, `storageDomain`, `sessionQuery`, `settings`, `betterSidebar`). Two mechanisms are available and they are architecturally different:

1. **Skill-as-prompt dependency (soft, no code seam).** A Skill is instruction content the model loads; a plugin cannot `inject` it. The proven-adjacent pattern is study's: the plugin owns the *content* and the *protocol* (tool `description` text literally encodes the teaching protocol — `src/tools.ts:190-193`: "TEACHING PROTOCOL: present the lesson in your own words … do NOT reveal the correct answer before the user responds"), and the model does the pedagogy. To depend on an existing Skill (`universal-diagnostic-tutor` is present in this very session), the robust approach is: (a) keep the dependency *documentary* in the README/tool description ("this plugin assumes the X skill is installed; the model should follow it while teaching"), and (b) make the plugin degrade gracefully when the skill is absent (it can't detect absence anyway). Do not attempt to read another skill's files by path — no repo does, and the skill catalog is not a service.
2. **Service dependency (hard, code seam).** If the "Skill" you mean is a plugin-provided service, follow the `betterSidebar` pattern: declare a minimal structural interface locally, list it in **top-level `inject`** only if it is guaranteed present (otherwise the plugin stays pending forever — whale `src/index.ts:10-14`), and prefer a **lazy `ctx.inject(['name'], cb)`** with graceful degradation. `peerDependenciesMeta`/optional consumption (better-sidebar `package.json:106-108`) is the declarative form.

Recommendation for the new project: model the lesson/roadmap content on study's `courses/` pack format (data, not code), express the Skill dependency in prose + tool descriptions, and add a `capabilities`-style optional seam only if you later need a hard programmatic link.

## 5.7 Install-path summary (verified against the real CLI)

`dsh plugin` is a thin wrapper: `node_modules/@deepseek-ai/dsh/lib/plugin-DJ-rVHUS.js:12-29` delegates to `runPluginCommand(...)` from `@deepseek-ai/dsh-plugin-manager/operations`, which (a) holds the profile write lock, (b) runs pnpm inside the profile dir (`~/.dsh/profiles/<name>`), and (c) calls `reconcile(before, dir, anchor, options)` (`dsh-plugin-manager/lib/index.js:41-70`). That reconcile:
- reads the profile manifest's `dependencies`,
- for each **newly added** dependency calls `bundleManifest(name, dir, anchor)`, which returns the manifest **only if `manifest.dsh?.bundle?.patch !== undefined`** (`lib/index.js:30-33`),
- warns on stderr and skips packages without it: `"declares no dsh.bundle — installed as a plain dependency, not a profile layer"` (`:55-56`),
- appends the name to `dsh.profile.bundles` and atomically rewrites the profile `package.json` (`saveManifest`, mode 384).

At boot (`@deepseek-ai/dsh/lib/profile-boot-*.js:76, 193`) the tree is composed as patch layers in `dsh.profile.bundles` order, then the profile's own `cordis.patch.yml`, then `--patch` overlays — which is why the plugin's own `cordis.patch.yml` (a single `insert`) mounts it with zero user file edits, and why `disabled: true` on that row is the pause mechanism.

There is **no `~/.dsh/plugins/` directory** on this machine — plugins live as profile dependencies. Manual install = edit the profile's `package.json` `dependencies` **and** `dsh.profile.bundles`, then `pnpm install` (minecraft README `:64-75` warns that forgetting the second list leaves the plugin loaded).

Client bundle delivery: the host loader knows the package; `dsh-client-modules` reads `pkg.dsh.client` and requires `exports["./client"]` (`lib/index.js:648-655`), then serves the file at **`/plugins/<id>/client.js`** (combo URL builder `:183`, fallback URL `:213`, sourcemap `:253`, `file: "client.js"` `:298`). The bundle must register itself synchronously via `window.__ModuleLoader__.load({ id: '<npm name>', factory: (require) => {…} })`; a bundle that loads without registering its id throws `"bundle <url> loaded without registering \"<id>\" via __ModuleLoader__.load"` (`:248`). Hence: **npm `name` === loader `id` === patch row `name`**, and the client entry must be a single file at `lib/client.js`.

---

# 6. Files read (citation index)

- dsh-study: `package.json`, `cordis.patch.yml`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.gitignore`, `README.md`, `scripts/link-dsh.mjs`, `courses/README.md`, `courses/cordis-paper/pack.yaml`, `src/index.ts`, `src/tools.ts`, `src/state.ts`, `src/srs.ts`, `src/pack.ts`, `tests/srs.test.ts`, `tests/pack.test.ts`, `lib/index.js`, `lib/tools.js`, `lib/types/*`.
- dsh-whale-report: `package.json`, `cordis.patch.yml`, `tsconfig.json`, `tsconfig.build.json`, `tsdown.config.ts`, `vitest.config.ts`, `.gitignore`, `pnpm-workspace.yaml`, `.claude/launch.json`, `.github/workflows/ci.yml`, `LICENSE`, `README.md` (350 lines), `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/ui-provider-prefix-note.md`, `preview/serve.mjs`, `preview/index.html`, `preview/fixture.js`, `scripts/report-now.mjs`, `src/index.ts`, `src/core.ts`, `src/state.ts`, `src/tools.ts`, `src/api.ts`, `src/client/index.tsx`, `tests/apply-harness.ts`, `tests/persistence.test.ts`, `tests/client-refresh.test.tsx`, `tests/client-fastpath.test.tsx`, `lib/client.js`, `lib/index.js`, `dsh-whale-report-0.6.0.tgz` (listing + `package/package.json`).
- dsh-minecraft: `package.json`, `cordis.patch.yml`, `tsconfig.json`, `tsconfig.build.json`, `tsdown.config.ts`, `vitest.config.ts`, `.gitignore`, `README.md`, `DESIGN.md`, `src/index.ts`, `src/tools.ts`, `src/api.ts`, `src/state.ts`, `src/client/index.tsx`, `tests/fake-rcon.ts`, `tests/tools.test.ts`, `tests/rcon.test.ts`, `lib/client.js`.
- dsh-better-sidebar-011: `package.json`, `cordis.patch.yml`, `scripts/install.sh`, `README.md`, `README_EN.md`, `src/index.ts`, `src/client/service.ts`, `src/client/index.tsx`, `src/tools.ts` (names), `lib/client.js`, `lib/client-registry.js`.
- Runtime/environment: `~/.dsh/profiles/web/{package.json, cordis.patch.yml, cordis.yml}`, `~/.dsh/profiles/node_modules/@deepseek-ai/*` versions, `@deepseek-ai/dsh/lib/{plugin-DJ-rVHUS.js, profile-boot-*.js}`, `@deepseek-ai/dsh-plugin-manager/lib/{index.js, types/operations.d.ts}`, `@deepseek-ai/dsh-client-modules/lib/index.js`, `~/.dsh/profiles/web/node_modules/dsh-better-sidebar/lib/types/client/service.d.ts` (0.18.0), npm registry for `@deepseek-ai/dsh-tools`, `dsh-whale-report`, `dsh-minecraft`, `dsh-study`, `dsh-better-sidebar`.
