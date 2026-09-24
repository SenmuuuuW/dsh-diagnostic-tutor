# Universal Diagnostic Tutor v2.0 — Technical & Product Report

Scope: analysis of the UDT Skill v2.0 as it exists on disk at HEAD `cbc2d1b`
(`git describe` → `v2.0.0-5-gcbc2d1b`).

Primary checkout (target of the symlink `~/.agents/skills/universal-diagnostic-tutor`):

```
~/Documents/Codex/2026-07-06/tutor/work/universal-diagnostic-tutor-skill/skills/universal-diagnostic-tutor
```

Parent repo: `~/Documents/Codex/2026-07-06/tutor/work/universal-diagnostic-tutor-skill`

---

## 1. Repository anatomy

### 1.1 Parent repo (3 levels, excluding `.git`)

```
universal-diagnostic-tutor-skill/
├── .gitignore
├── AGENTS.md                    20 KB  maintainer contract (339 lines)
├── CHANGELOG.md                 35 KB  832 lines, V0.x → v2.0.0
├── COMMAND_SURFACE.md          2.2 KB  single-entry usage doc (user-facing)
├── EVALS.md                     22 KB  eval cases
├── EXAMPLES.md                 2.4 KB  showcase index
├── FAILURE_TAXONOMY.md         9.8 KB  failure classes
├── FEEDBACK_TO_IMPROVEMENT.md  5.0 KB  improvement workflow
├── GROUP_GUIDE.md              4.1 KB  shareable short guide
├── INSTALL.md                   12 KB  install/update, incl. DSH section
├── LICENSE                     1.1 KB  MIT
├── PORTABILITY.md              7.6 KB  four usage packs
├── QUALITY_RUBRIC.md            12 KB  judging rubric
├── README.md                    11 KB  Chinese-primary landing page (GitHub default)
├── README.en.md                 11 KB  English landing page
├── README.zh-CN.md             801 B   compatibility pointer only
├── USER_GUIDE.md                14 KB  beginner tutorial
├── docs/
│   ├── benchmark/
│   │   ├── evaluation_checklist.md
│   │   └── manual_test_matrix.md
│   ├── design-history-v18-orchestrator.md
│   ├── maintenance_notes.md
│   └── skill_vs_generic_ai_advantage.md
├── platforms/                       (10 files, prompt-packaging adapters)
│   ├── chatgpt-gpt/INSTRUCTIONS.md
│   ├── chatgpt-project/PROJECT_INSTRUCTIONS.md
│   ├── claude-code/README.md
│   ├── codex/README.md
│   ├── coze-doubao/BOT_PROMPT.md
│   ├── deepseek-api/SYSTEM_PROMPT.md
│   ├── deepseek-harness/README.md
│   ├── gemini-gems/GEM_INSTRUCTIONS.md
│   ├── generic-chat/TUTOR_LITE_PROMPT.md
│   └── generic-chat/TUTOR_ULTRA_LITE_PROMPT.md
└── skills/
    └── universal-diagnostic-tutor/   ← the ONLY installable unit (140 files, 728 KB)
```

**Totals.** 172 files in the work tree (17 root + 5 docs + 10 platforms + 140 skill).
Work tree ≈ 1.1 MB; `.git` = 2.9 MB; total on disk 4.0 MB. 17,249 Markdown lines repo-wide
(10,709 inside the skill dir). 45 commits.

Notably absent: **no `package.json`, no `*.json`, `*.yaml`, `*.yml`, `*.toml`, no `.claude-plugin/`,
no `marketplace.json`, no `plugin.json`, no scripts, no CI, no tests, no `bin/`.** The only hidden
entries in the whole tree are `.git` and `.gitignore`.

### 1.2 Skill dir (every file, 140)

Root (2):

```
skills/universal-diagnostic-tutor/SKILL.md    9,988 B  ← the only frontmattered file
skills/universal-diagnostic-tutor/README.md  25,481 B  Skill usage guide (Chinese)
```

`references/` — 54 files, **39 protocols** + 15 source packs:

```
basic_stem_visualization_protocol.md      learning_task_loop_protocol.md     response_length_calibration.md
clarify_and_path.md                       mastery_and_decision.md            routing.md
cognitive_load_budget_protocol.md         math_formatting_protocol.md        skill_pack_invocation_protocol.md
continuity.md                             multiturn_tutoring_protocol.md     stem_ai_cs_scope.md
exam_patterns.md                          next_best_teaching_step_protocol.md stem_ask_vs_explain_calibration.md
exercise_generation_protocol.md           no_internal_tool_leakage_protocol.md stem_natural_adaptive_style.md
explanation_compression_protocol.md       output_formats.md                  stem_problem_solving_protocol.md
feedback.md                               practice_ladder.md                 stem_proof_and_derivation_protocol.md
interaction_pacing_protocol.md            resources.md                       stem_symbol_notation_protocol.md
intuition_application_bridge_protocol.md  stem_teaching_sequence.md          student_facing_response_protocol.md
knowledge_gap_taxonomy.md                 subject_routing.md                 subject_teaching_modes.md
knowledge_system_mapping_protocol.md      teacher_like_stop_point_protocol.md teaching_modes.md
                                          transfer_pattern_teaching_protocol.md
                                          trigger_mode_matrix.md
                                          understanding_check_protocol.md
source_packs/  (15)
  ai_ml_data.md  crypto_security_addendum.md  exam_problem_set_sources.md
  graphics_multimedia_hci_software.md  math_foundations.md  networks_from_zero.md
  numerical_hpc_control.md  physics_electronics_signals.md
  programming_and_cs_foundations.md  source_pack_usage_guide.md
  source_refresh_maintenance.md  source_specificity_guidelines.md
  systems_networks_security.md  theory_formal_methods.md  vr_multimedia_addendum.md
```

`examples/` — 84 example files (0.75–5.9 KB each).

### 1.3 Grouping by purpose

| Group | Files | Role |
|---|---|---|
| **Runtime entry** | `SKILL.md` | Router loaded into the agent. Only frontmattered file. |
| **Runtime protocols (core loop / decision)** | `routing.md`, `mastery_and_decision.md`, `feedback.md`, `continuity.md`, `clarify_and_path.md`, `learning_task_loop_protocol.md`, `exercise_generation_protocol.md`, `practice_ladder.md`, `understanding_check_protocol.md`, `next_best_teaching_step_protocol.md` | The teaching brain. |
| **Runtime protocols (mode/load/pacing)** | `teaching_modes.md`, `cognitive_load_budget_protocol.md`, `explanation_compression_protocol.md`, `response_length_calibration.md`, `interaction_pacing_protocol.md`, `teacher_like_stop_point_protocol.md`, `subject_teaching_modes.md` | Depth control. |
| **Runtime protocols (STEM)** | `stem_*.md` (7), `knowledge_system_mapping_protocol.md`, `intuition_application_bridge_protocol.md`, `transfer_pattern_teaching_protocol.md`, `subject_routing.md`, `exam_patterns.md`, `basic_stem_visualization_protocol.md` | STEM teaching shape. |
| **Runtime protocols (style/safety)** | `student_facing_response_protocol.md`, `no_internal_tool_leakage_protocol.md`, `math_formatting_protocol.md`, `output_formats.md`, `skill_pack_invocation_protocol.md`, `trigger_mode_matrix.md`, `knowledge_gap_taxonomy.md`, `multiturn_tutoring_protocol.md` | Output contract & guardrails. |
| **Runtime data** | `references/source_packs/*.md` (15) | Source metadata (link/type/best-for/use-when/strength/caution/citation label). |
| **Runtime few-shot models** | `examples/*.md` (84) | Loaded only when a concrete model helps. |
| **Skill-level doc** | `skills/.../README.md` | Skill usage guide (Chinese). Explicitly a doc, not loaded as instruction. |
| **Maintainer-only** | `docs/benchmark/*`, `docs/maintenance_notes.md`, `docs/skill_vs_generic_ai_advantage.md`, `docs/design-history-v18-orchestrator.md`, root `AGENTS.md`, `EVALS.md`, `QUALITY_RUBRIC.md`, `FAILURE_TAXONOMY.md`, `FEEDBACK_TO_IMPROVEMENT.md` | Not tutoring runtime. |

`SKILL.md:149-150` states this explicitly:

> - **Maintainer-only:** `docs/benchmark/`, `docs/maintenance_notes.md`, and
>   the Skill-vs-generic-AI comparison in `docs/` are not tutoring runtime.

Also `skills/universal-diagnostic-tutor/README.md:291`:

> `docs/design-history-v18-orchestrator.md`（设计历史，非运行时参考）

---

## 2. Skill packaging contract

### 2.1 Exact frontmatter (`SKILL.md:1-22`)

Only two fields. **No `allowed-tools`, no `version`, no `license`, no `metadata`.**

```yaml
---
name: universal-diagnostic-tutor
description: >
  Use primarily for university-level STEM, science, math, programming,
  algorithms, AI/ML, computer systems, physics, signals, engineering
  foundations, exam prep, homework help, concept explanation, practice,
  answer checking, qualitative grading, mastery checks, proof/derivation
  teaching, debugging for understanding, or requests to teach a technical
  topic. Diagnose the subject, knowledge system, subtopic, prerequisites,
  and likely knowledge gaps before teaching, rather than acting as an
  answer-first homework bot. Natural-language intents are covered directly:
  practice, exercises, grading, mistake review, gap diagnosis, exam drills
  (练习, 出题, 批改, 判答案, 错因分析, 诊断卡点, 知识缺口, 能不能进入下一步,
  复习题, 备考练习); learning paths, study plans, learning routes, and exam
  planning (学习路线, 学习计划, 从哪里开始, 系统学习, 备考路线, 复习安排);
  state cards and cross-chat continuation (学习状态卡, 继续学习); trusted
  learning resources and topic scans (可信资源, 学习资源, 推荐资料); simple
  learning visuals (可视化, 画图理解). Legacy slash-style text such as
  /tutor, /practice, /study-plan, /exam-track, /state-card, /resource-scan,
  /visualize, /mistake-review, /learn-anything, and /diagnose-gap is still
  recognized as an intent signal, not a command.
---
```

`docs/maintenance_notes.md:27-36` (Validation Checklist) codifies the constraint:

> - `SKILL.md` has valid YAML front matter.
> - Front matter contains only `name` and `description`.
> - Skill name remains `universal-diagnostic-tutor`.
> - References are directly linked from `SKILL.md`.
> - No unnecessary scripts or infrastructure were added.

`AGENTS.md:334-336`:

> - Keep front matter in `SKILL.md` valid YAML with only `name` and
>   `description` fields.
> - Keep the skill name as `universal-diagnostic-tutor`.

### 2.2 Installation

There is **no package manager, no installer, and no manifest**. `INSTALL.md:5`:

> 这个项目目前是一个 Markdown-based Tutor Skill，不是网站、App、npm 包或自动安装器。

Install is manual, via `~/.agents/skills/` (or `~/.dsh/skills`, or project-scoped roots)
using symlink or copy of the **bundle directory only**:

```bash
mkdir -p ~/.agents/skills
ln -s "$(pwd)/skills/universal-diagnostic-tutor" ~/.agents/skills/universal-diagnostic-tutor
```

DSH scan roots and precedence (`INSTALL.md:63-71`, mirrored in
`platforms/deepseek-harness/README.md:27-33`):

| Rank | Scope | Path |
|---|---|---|
| 100 | project | `<projectRoot>/.dsh/skills` |
| 200 | project | `<projectRoot>/.agents/skills` |
| 300 | custom | provider `customSkillDirs` |
| 400 | user | `$DSH_HOME/skills` (default `~/.dsh/skills`) |
| 500 | user | `$DSH_AGENTS_HOME/skills` (default `~/.agents/skills`) |

Hard constraint (`platforms/deepseek-harness/README.md:103-105`):

> - **One level deep.** Only `<root>/<name>/SKILL.md` and `<root>/<name>.md` are
>   discovered. Pointing a root at the whole repository does not work, because
>   `SKILL.md` would sit two levels down.

`INSTALL.md:101-102`: the link target must be the bundle, and the name must stay
`universal-diagnostic-tutor` (matching frontmatter `name`).

DSH-native reload behavior (`INSTALL.md:113-115`): roots are watched; frontmatter
edits refresh the catalog before the next model step; body + `references/` are
re-read on every load; a new session is the reliable confirmation.

### 2.3 Installable as a standalone unit?

**Yes, physically** — `skills/universal-diagnostic-tutor/` is self-contained: `SKILL.md` +
`references/` + `examples/`. No reference points outside the bundle.
**But there is no manifest and no version field**, so the unit is not *declaratively*
installable or version-pinnable; consumers can only observe the git SHA.

### 2.4 Plugin / marketplace manifest?

**None anywhere.** Exhaustive search for `*.json`, `*.yaml`, `*.yml`, `*.toml`, `plugin*`,
`marketplace*`, `package.json` across the whole work tree returned zero results. No
`.claude-plugin/` directory. The only structured metadata in the entire repo is the
`SKILL.md` YAML frontmatter (two string fields) and the git tag `v2.0.0`.

`AGENTS.md:196-199` explicitly forbids adding them:

> - Do not add npm, npx, package setup, install scripts, path-detection scripts,
>   or automated installers unless explicitly requested later.
> - If installers are considered in the future, document risks, permissions,
>   platform differences, and maintenance requirements first.

---

## 3. The canonical teaching logic

### 3.1 Core Loop

Two statements of the loop exist and they differ in granularity.

**`SKILL.md:39-62` — the public 6-stage canonical loop:**

> ## Core Loop
>
> For learning requests, run the loop the signal needs — Clarify, Diagnose,
> Intervene, Check, Decide, Carry — not necessarily every stage:
>
> 1. **Diagnose.** Name the subject -> knowledge system -> subtopic -> core
>    concept in one or two natural lines, then the prerequisite gaps or
>    misconceptions likely blocking the learner.
> 2. **Set parameters.** Infer the teaching mode (Zero-Base / Standard /
>    Advanced) and the lowest sufficient depth from learner evidence; ask one
>    calibration question only when the mode would change the answer.
> 3. **Intervene.** Teach one compact unit: the object meaning, method cue,
>    setup, proof hinge, or misconception repair that unlocks the next step.
>    Intuition before formality for STEM; explain directly when notation or
>    prerequisites are missing, ask guiding questions when the learner can
>    reason one step.
> 4. **Check.** Ask one focused check or tiny task; if participation is the
>    point, stop and wait. Do not continue to the next step or final result.
> 5. **Decide.** Interpret the answer as a mastery signal, not right/wrong:
>    advance, transfer, compress, re-explain, step down, practice, review, or
>    simplify. One correct answer is not mastery; a wrong answer names the
>    next step.
> 6. **Carry.** Track progress lightly inside the conversation; use visible
>    Learning State Cards for cross-chat continuity — never hidden memory.
>
> Broad goals ("我想学机器学习", "我想补线代") get clarify-first handling: one
> to three focused questions, light confirmation, a compact goal-specific map,
> and the one next best step — never a curriculum roadmap (see
> `references/clarify_and_path.md`).

**`references/routing.md:38-77` — the internal 8-step Adaptive Loop:**

> 1. **Diagnose the task.** Subject -> knowledge system -> subtopic -> requested
>    output -> task type; then the prerequisites the learner needs, then the
>    likely gap type when it matters (`knowledge_gap_taxonomy.md`).
> 2. **Set teaching parameters.** Infer mode (Zero-Base / Standard / Advanced /
>    Auto) and choose the least depth that still produces understanding.
> 3. **Choose the next best teaching step.** ...
> 4. **Teach one compact unit.** ...
> 5. **Pace and stop.** One subproblem at a time ...
> 6. **Check understanding.** One focused question, tiny practice item, or
>    teach-back prompt. If the check is for learner participation, stop and wait.
> 7. **Interpret the response as a mastery signal.** ...
> 8. **Decide the next move.** Advance, transfer, compress, re-explain, step
>    down, practice, review, simplify, or answer-first-in-speed-mode.

Plus `routing.md:75-77`:

> When the learner is confused, do not explain more — change the move: step
> down, switch representation, shrink the example, or rebuild the missing
> prerequisite.

**Broad-goal branch (`references/clarify_and_path.md`)** — 4 steps, with a hard rule at :9-11:

> A broad goal without enough context gets a clarify-only turn: ask one to
> three focused questions, then stop. Do not produce a plan, map, or table in
> the same turn.

1. **Clarify** (1–3 focused questions; choice-based preferred) — then **stop and wait**.
2. **Light confirmation** — restate goal in 1–2 sentences; "Proceed on `对` or similar."
3. **Compact knowledge map** — target area, prerequisite nodes, current focus node,
   next possible nodes, dependencies, mastery status (**unconfirmed unless checked**),
   first 1–3 nodes. `clarify_and_path.md:62-64`: "keep it readable in one glance; map depth
   follows the goal; never mark a node mastered after an explanation only; never list every
   prerequisite chain in the subject."
4. **Next best step** — pick the earliest blocking prerequisite and say why.

**Practice loop (`references/learning_task_loop_protocol.md:5-8`):**

```text
Teach -> Practice -> Answer -> Grade -> Mistake analysis
-> Knowledge Link Card if needed -> State update -> Readiness gate -> Next step
```

Turn boundaries are explicit (`:59-67`):

> - A turn that asks an exercise stops at Step 5.
> - A turn that receives an answer may complete Steps 6 through 11.
> - If Step 11 produces another question or exercise, stop after that item and
>   wait again.
> - Never invent a learner answer to complete the loop in one message.

### 3.2 Teaching-move decision table

`references/routing.md:84-97` — the canonical table:

| Learner signal | Teaching move |
| --- | --- |
| Missing concept, vocabulary, notation, or a safety-relevant boundary | Explain directly |
| Enough foundation to reason one step | Ask a guiding question |
| Overwhelmed, repeated errors, or missing prerequisite | Slow down |
| Current problem has too many moving parts | Give a smaller example |
| "Still don't understand" after one explanation | Switch analogy or representation |
| Can explain but needs recognition, procedure, transfer, or confidence | Move to practice |
| Correct answer but cannot explain why | Maintain difficulty; check reasoning |
| Explains correctly, solves without hints, or transfers | Advance gradually |
| Needs structured study, verified practice, docs, or a longer path | Recommend resources (support, not replace) |
| Next step is the key learning move or the answer was withheld | Pause at a stop point |
| Learner evidence changed (notation gap vs. rigor request) | Switch teaching mode |
| A prerequisite is already usable | Compress to a short reminder |

Selection rule (`routing.md:81-82`): "pick the earliest blocker whose repair unlocks the
learner's next action." Efficiency moves named at `routing.md:117-121`:
**Shrink / Translate / Cue / Hinge / Repair / Compress / Stop**.

### 3.3 Mastery status terms and readiness gate

**The seven status terms** — `references/mastery_and_decision.md:7-21`, declared as the *only*
vocabulary:

> The only concept-level status terms are these seven. Use them for compact
> state updates, readiness handoffs, and visible cards; never invent a second
> vocabulary.

| Status | Meaning |
| --- | --- |
| explained | Tutor explained the idea; learner mastery not proven |
| practiced | Learner attempted at least one task with the idea |
| checked | Tutor asked a check or near-transfer question |
| confirmed | Sound reasoning plus independent use or transfer evidence |
| unconfirmed | No evidence yet, even if related content was discussed |
| weak | Partial understanding or unstable use |
| blocked | Cannot proceed; this node is missing or misunderstood |

Internal-only posture spectrum (`:23-30`) — explicitly *not* a second vocabulary:
"unknown -> exposure -> recognition -> guided understanding -> independent explanation ->
guided application -> independent application -> transfer, plus misconception-detected and
overloaded". Key asymmetries quoted: "exposure is not understanding, recognition is not
application, a correct answer is not proof of reasoning, guided success is not independence,
and independence is not transfer."

**Readiness gate** (`mastery_and_decision.md:34-43`) — six outcomes:

| Outcome | Meaning |
| --- | --- |
| Advance | Sound reasoning + independent use, with near-transfer or trap evidence when the next concept depends on transfer. |
| Advance with caution | Core reasoning and one independent use sound; transfer or consistency unchecked. Put an early check in the next concept. |
| Review first | One identifiable concept, method, setup, or reasoning gap that can be repaired locally. |
| Step down | Missing prerequisite, notation or object-type problem, or overload at the current level. |
| Diagnose again | No usable attempt, required reasoning absent, conflicting signals, or unclear target. |
| More practice needed | Can follow or perform with support; independent use not yet stable. |

Evidence inspected (`:45-52`): explanation quality in the learner's own words, practice
correctness, reasoning correctness, near-transfer, confidence (reasoned, hesitant, guessed,
prompted), repeated error patterns. "Near-transfer and independent reasoning outweigh
recognition or repetition; explanation alone and one lucky answer never confirm readiness."
Tie-break: "choose the outcome tied to the earliest blocking dependency — do not average a
prerequisite failure into an optimistic decision."

**Status alignment mapping** (`:54-58`) — quoted:

> Status alignment: Advance can support `confirmed`; Advance with caution
> stays `checked`; More practice needed stays `practiced`/`checked`/`weak`;
> Review first marks `weak`; Step down marks the dependent node `blocked` and
> the prerequisite `weak`/`unconfirmed`; Diagnose again keeps `unconfirmed`.
> These are mappings, not automatic changes — preserve evidence already valid.

**Loop branching after the gate** (`learning_task_loop_protocol.md:71-78`):

| Readiness Outcome | Next Loop Move |
| --- | --- |
| Advance | Teach the next dependent concept or use a higher rung that serves the goal. |
| Advance with caution | Move on, but place one early check on the uncertain evidence. |
| Review first | Repair the specific current-concept gap, then give one near-match item. |
| Step down | Teach the missing prerequisite or simpler representation, then check it. |
| Diagnose again | Ask one narrow question that distinguishes the likely blockers. |
| More practice needed | Generate one aligned item at the same or slightly lower rung. |

Other closed vocabularies a runtime must honor:

* **Grade labels** (`feedback.md:16-23`): `Correct`, `Mostly correct`, `Partially correct`,
  `Incorrect`, `Cannot grade yet`.
* **Error→intervention types** (`feedback.md:71-81`): Notation, Concept, Method selection,
  Setup, Proof, Calculation, Transfer, Overgeneralization, Memorized procedure.
* **Gap taxonomy** (`knowledge_gap_taxonomy.md`): Vocabulary, Concept, Notation, Procedure,
  Reasoning, Recognition, Transfer, Misconception, Confidence, Resource.
* **Practice ladder rungs** (`practice_ladder.md`): L1 Recognition Check, L2 Basic Concept
  Check, L3 Worked Example Completion, L4 Near-Transfer Problem, L5 Trap Or Misconception
  Problem, L6 Mixed-Topic Problem, L7 Real-World Or Project-Style Application.
* **Teaching modes** (`teaching_modes.md`): Auto / Zero-Base / Standard / Advanced; depth
  Levels 1–5.
* **Stop points** (`teacher_like_stop_point_protocol.md`): 10 named checkpoints
  (1, 1A, 2, 3, 4, 5, 5A, 6, 7, 8, 9).

### 3.4 The Learning State Card — verbatim

`references/continuity.md:9-22` (canonical, the *only* card artifact):

> ## Card Format
>
> Learning State Card:
>
> - **Subject:**
> - **Topic:**
> - **Current learning mode:**
> - **Already understood:**
> - **Still weak:**
> - **Current blocker:**
> - **Common mistake:**
> - **Last successful check:**
> - **Next best step:**
> - **Suggested continue prompt:**

`continuity.md:24-34` — optional fields:

> ## Optional Fields
>
> Add only when useful, and only from learner-provided or learning-relevant
> details (never from transcripts, sensitive data, or rigid scores):
>
> - **Preferred language / level:** long-running preferences the learner asks to
>   remember across chats.
> - **Active goal or exam target:** the current task or exam being tracked, so a
>   continuation can stay on task.
> - **Latest practice:** one compact five-part entry (Attempt / Result / Mistake
>   type / New status / Next step), from the post-practice update below.

`continuity.md:36-48` — Rules:

> - Keep it compact.
> - Use bullet points.
> - Do not include private or sensitive information unless the user explicitly
>   asks.
> - Do not include unnecessary full chat history.
> - Focus on learning state, not conversation transcript.
> - Make it easy to copy into a new chat.
> - Use normal math formatting with `\(...\)` and `\[...\]`.
> - Keep the next best step specific enough that another tutor can continue
>   without restarting.
> - Never claim hidden memory: the card is user-carried data, not storage.

**Checkpoint variant** (`continuity.md:62-67`):

> - **What you learned:**
> - **What is still weak:**
> - **Mistake to watch:**
> - **Next best step:**
> - **Continue prompt:**

**Card consumption / handoff** (`continuity.md:75-94`):

> 1. Read the card for subject, topic, mode, and blocker.
> 2. Do not restart from zero. Briefly confirm the topic and the next best step.
> 3. Trust "Already understood" provisionally; if new evidence shows a weakness,
>    repair it briefly.
> 4. Focus on "Still weak" and "Current blocker."
> 5. Teach or repair one compact unit, then ask one diagnostic check.
> 6. Update the learning state only from the learner's new response.

**Post-practice update order** (`continuity.md:114-130`):

> 1. **Attempt:** Name the targeted exercise or learner action.
> 2. **Result:** Record the qualitative verdict and the evidence that matters.
> 3. **Mistake type:** Record the underlying error when one was found.
> 4. **New mastery status:** Use `explained`, `practiced`, `checked`,
>    `confirmed`, `unconfirmed`, `weak`, or `blocked` ...
> 5. **Next step:** Record the readiness outcome and one concrete action.
>
> Fit this evidence into `Last successful check`, `Still weak`, `Common mistake`,
> and `Next best step`, or add one compact `Latest practice` bullet when that is
> clearer. **Do not append a full attempt history or turn the card into a
> gradebook.**

**A second, more compact rendering** appears at `references/output_formats.md:139-151`
("Learning State Card Mode"), and this is the one the public README advertises:

```text
Learning State Card:
- Subject: [subject]
- Topic: [topic]
- Current learning mode: [Zero-Base / Standard / Advanced / Auto]
- Already understood: [compact bullets]
- Still weak: [compact bullets]
- Current blocker: [specific blocker]
- Common mistake: [mistake to watch]
- Last successful check: [evidence]
- Next best step: [one next teaching move]
- Suggested continue prompt: [copy-paste prompt]
```

`output_formats.md:156-181` also preserves a **Learner Profile Card** and **Learning Task
Card** shape, but v2.0 collapsed those concepts into the Learning State Card's optional fields
(CHANGELOG v2.0.0: "Collapsed the card artifacts from three (Learning State / Learner Profile /
Learning Task) to one Learning State Card with optional fields"). The example
`examples/learner_profile_task_card_example.md:11-24` shows the merged real-world form:

```text
Learning State Card:
- Subject: 考研数学；线性代数；概率论与数理统计
- Topic: 向量与矩阵方程（\(Ax=b\)、平行、标量倍数）
- Already understood: 向量分量
- Still weak: 符号和方法线索容易混
- Next best step: 做一个 \(u=cv\) 的近迁移检查
- Optional — preferred language: Chinese
- Optional — preferred teaching pace: 一次一个小步骤，检查后再继续
- Optional — active goal / exam target: 考研数学复习
- Optional — notes to preserve: 不要直接给完整答案，先诊断卡点
- Practice needed: 标量倍数、线性组合、方程组设置
- Checkpoint: 先确认同一个标量必须适配所有分量
```

**Knowledge Link Card format** (`references/clarify_and_path.md:130-147`):

> Use one to three Knowledge Link Cards when a strongly related concept is
> necessary to resolve the learner's current gap, or when a beginner asks why
> required concepts appear together. Before creating a card, ask: "Would
> understanding this connection change the learner's next attempt?" If not,
> omit it.
>
> Each card covers: what the concept is (beginner-usable meaning), why it
> matters here, how it connects to the current task, minimum mastery needed
> now, what to skip for now, and one small example. If more than three concepts
> seem essential, card only the earliest blocker.
>
> In learner-facing output, present cards as natural prose or minimally labeled
> sections. **Never announce the mechanism: no visible headers like "Card 1" or
> "Knowledge Link Cards", and never say "I will use three cards".** After the
> cards, ask one tiny check, stop, and return explicitly to the original
> explanation, exercise, correction, or readiness decision.

The realized shape (from `examples/knowledge_link_cards_machine_learning_example.md:15-24`)
uses these exact eight bold labels per card:

```
- **Knowledge point：**
- **What it is：**
- **Why it matters here：**
- **How it connects：**
- **Minimum mastery needed now：**
- **Skip for now：**
- **Small example：**
```

### 3.5 Machine-readable / structured output formats

**Answer: there is no machine-readable output anywhere.** No JSON, no YAML, no CSV, no
schema, no fixed delimiters, no emitted file. `grep` for fenced ```json / ```yaml / ```csv
blocks across the entire skill dir returns **zero** matches.

What does exist:

* **64 fenced `text` template blocks** across 22 reference files, all with `[placeholder]`
  values rather than machine tokens. `references/output_formats.md` holds 22 of them.
* **8 reference files carry Markdown decision tables** (counts of `| ` rows): `feedback.md` 32,
  `trigger_mode_matrix.md` 24, `skill_pack_invocation_protocol.md` 21, `mastery_and_decision.md`
  17, `routing.md` 14, `teaching_modes.md` 9, `learning_task_loop_protocol.md` 8,
  `clarify_and_path.md` 7. These are *decision* tables for the LLM, not output contracts.
* **Bold-label-fixed heading structures** in the templates listed below.

The closest thing to a parseable artifact set:

| Artifact | Where | Parseability |
|---|---|---|
| Learning State Card | `continuity.md:9-22`, `output_formats.md:139-151` | **Semi-parseable.** Fixed 10 bold labels, Markdown bullets, free-text values, learner-language values. No scoping/versioning. Emitted only on request or when offering continuity. |
| Checkpoint | `continuity.md:62-67` | Fixed 5 labels. |
| Knowledge Link Card | `clarify_and_path.md:130-147` + example | Fixed 8 labels, but `clarify_and_path.md:143-147` *forbids* visible headers/labels in output — so in practice the card is **prose**, not parseable. |
| Practice item spec | `exercise_generation_protocol.md:14-31` (8 internal fields), `:82-94` (6 visible items) | Internal fields are prose instructions ("establish these fields"), never emitted as a block. Visible shape: Target concept / Practice level / Question / What this checks / Optional hint. |
| Grade verdict | `feedback.md:100-108` | Prose with mandated *decisions*; label set is closed but not delimited. |
| Readiness outcome | `mastery_and_decision.md:34-43` | Prose sentence, e.g. "this stays practiced, not yet confirmed" (`:130-134`). |
| Knowledge map | `clarify_and_path.md:56-60` | One-glance prose; `output_formats.md:328-335` "Learning Architecture Mode" gives a 6-label shape. |
| Source note | `resources.md:104-115` | Prose checklist, not a record format. |
| Source pack entry | `source_packs/*.md` | **Actually structured**: `* Link:`, `* Type:`, `* Best for:`, `* Use when:`, `* Strength:`, `* Caution:`, `* Related subjects:`, `* Suggested citation label:` — a stable record-per-source format. |
| Exam-aware shape | `exam_patterns.md:28-38` | 6 fixed labels. |

`references/learning_task_loop_protocol.md:10-12` is candid about the layer:

> This is a Markdown behavior protocol, not software or backend infrastructure.
> It does not create hidden memory, databases, accounts, automation, or a
> gradebook.

### 3.6 Anti-persistence guardrails — exact quotes

These are the product constraints on any new plugin.

`SKILL.md:152-173` (Guardrails, abridged to the relevant lines):

> - Never turn mastery tracking into scores, databases, hidden memory, or a
>   curriculum roadmap.
> - Never turn broad goals into massive course maps; clarify first, then teach
>   the next best step.
> - Never imply hidden persistence across chats; cards are visible,
>   copy-pasteable summaries.
> - Never treat slash-style strings as real shell commands.

`SKILL.md:61-62`:

> 6. **Carry.** Track progress lightly inside the conversation; use visible
>    Learning State Cards for cross-chat continuity — never hidden memory.

`references/continuity.md:48`:

> - Never claim hidden memory: the card is user-carried data, not storage.

`references/continuity.md:132-140` (Anti-Patterns):

> - Copying the whole chat.
> - Claiming the agent will remember the card later.
> - Turning the card into a rigid mastery score.
> - Including internal protocol names or repository details.
> - Adding a long course roadmap when the next step is enough.
> - Restarting every prerequisite despite a usable card.
> - Demanding the whole previous chat, or turning recovery into a long
>   questionnaire.

`references/routing.md:157-170` (Anti-Patterns, selected):

> - Turning every answer into a visible checklist or protocol trace.
> - Treating broad goals as permission to generate a massive curriculum map.
> - Treating context portability as hidden memory, a database, or a profile.
> - Giving a giant worksheet, official-looking score, or advancement decision
>   without evidence.

`references/routing.md:36`:

> This layer chooses direction; it is
> not a course generator, assignment system, or persistent learner model.

`references/mastery_and_decision.md:115-117`:

> Inside the current conversation, keep a lightweight model of what the learner
> understood ... **This is not persistent memory and must not feel like a
> tracking spreadsheet.**

`references/mastery_and_decision.md:136-147` (Anti-Patterns, selected):

> - Turning progress tracking into rigid scores or visible label walls.
> - Creating persistent learner labels without consent.

`references/output_formats.md:132-133`:

> Keep mastery tracking lightweight. Do not turn the response into grades,
> state tables, persistent memory, or a curriculum roadmap.

`references/output_formats.md:183-184`:

> Keep cards short, visible, and user-controlled. Do not imply hidden memory,
> databases, accounts, or persistent storage.

`references/clarify_and_path.md:50-51`:

> After a confirmed broad goal, a compact goal-specific map chooses the next
> step. **It is not a course outline or textbook table of contents.**

`README.en.md` (public framing of the same constraint):

> It is not a course platform, question bank, database, RAG system, or hidden
> memory service.

Public README (Chinese) "边界" section:

> - 不做隐藏记忆、自动学习者画像、数据库、RAG/向量库或后端基础设施。
> - 不做官方评分、提分保证、考试预测、泄露材料、作弊或押题。
> - 不收录盗版教材、答案库、课程平台或持久成绩册。

`AGENTS.md:126-127`:

> - Do not add persistent memory, databases, telemetry, accounts, or storage
>   unless explicitly requested.

`AGENTS.md:244-248`:

> - Keep the Learning State Card visible and user-controlled. Its optional
>   fields (preferred language/level, active goal or exam target, latest
>   practice) absorb the former profile and task card concepts; no parallel card
>   types exist. Cards must never imply hidden persistence, databases, accounts,
>   or automatic memory.

`AGENTS.md:132-133`:

> - Do not add scripts, test harnesses, package managers, websites, or other
>   infrastructure unless there is a clear recurring need.

---

## 4. Integration surface

### 4.1 How the logic is invoked

**Purely by the LLM reading Markdown.** There are no scripts, no CLI, no MCP server, no
function-calling schema, no JSON contract, no protocol wire format. `SKILL.md` is a router
that the host agent loads; the model then decides, in natural language, which reference file
to read and what to say. `routing.md:151-155`:

> 1. Read the user's signal.
> 2. Select only the relevant layer or two.
> 3. Load the smallest needed reference file.
> 4. Produce natural teacher language.
> 5. Stop at the meaningful check point when participation matters.

`references/skill_pack_invocation_protocol.md:42-52` (Response Rules):

> - Treat any intent signal as routing input, never as a command to print a
>   rigid template or expose an internal name.
> - Enter at the step implied by the request instead of applying every Tutor
>   capability at once.
> - Keep normal tutoring answers natural and student-facing; internal route
>   names never appear in user-facing output.
> - If intent is ambiguous, ask one short clarification.
> - Preserve math formatting with `\(...\)` and `\[...\]`.
> - Do not imply a shell, native command system, database, or hidden memory.

The DSH-specific contract is only about **discovery and loading**
(`platforms/deepseek-harness/README.md:3-5`):

> DSH loads the Skill folder natively. There is no DSH prompt to paste and no
> DSH-specific tutoring instructions — this page covers installation, update,
> verification, and limits only.

There are exactly three touch points a host can mechanically observe:

1. **Catalog**: `<name>/SKILL.md` frontmatter (`name`, `description`).
2. **Load**: the base directory of the skill.
3. **On-demand reads**: `references/*.md` and `examples/*.md` by file path.

That's the whole machine surface. Everything else is prose in the transcript.

### 4.2 Every intermediate/structured artifact and parseability

| Artifact | Producer | Shape | Parseable? |
|---|---|---|---|
| Learning State Card | `continuity.md` | 10 fixed bold labels + free text | Semi — labels are stable, values are natural language, created only on request |
| Checkpoint | `continuity.md` | 5 fixed labels | Semi |
| Knowledge Link Card | `clarify_and_path.md` | 8 fixed labels, but **labels must not be shown** | No — output is deliberately prose |
| Practice item | `exercise_generation_protocol.md` | 6 visible labels or natural prose | No |
| Exercise spec (internal) | `exercise_generation_protocol.md:14-31` | 8 fields, internal, never emitted | No |
| Grade verdict | `feedback.md:16-23` | 1 of 5 labels + prose | Semi (closed label set, no delimiter) |
| Readiness outcome | `mastery_and_decision.md:34-43` | 1 of 6 outcomes, stated in a natural sentence | Semi |
| Concept status | `mastery_and_decision.md:13-21` | 1 of 7 terms | Semi |
| Compact knowledge map | `clarify_and_path.md:56-60` | One-glance prose / arrow chain | No |
| Knowledge-system map | `knowledge_system_mapping_protocol.md:43-46` | `A -> B -> C` + prerequisites | No |
| Source note / citation | `resources.md:104-115` | prose role statement | No |
| **Source pack record** | `source_packs/*.md` | `* Link: / Type: / Best for: / Use when: / Strength: / Caution: / Related subjects: / Suggested citation label:` | **Yes** — stable key: value bullet records |
| Exam-aware shape | `exam_patterns.md:28-38` | 6 fixed labels | Semi |
| Legacy intent strings | `skill_pack_invocation_protocol.md:14-23` | 10 `/slash` strings → route | **Yes** — a literal mapping table |

**Conclusion:** the skill emits no artifact a runtime can consume reliably. The single
structured-ish runtime artifact is the Learning State Card, and it is (a) opt-in,
(b) natural-language-valued, (c) explicitly framed as *user-carried*, not agent-written or
agent-read storage.

### 4.3 Reference files that define contracts a runtime would have to honor

Runtime (must not be treated as docs):

* `references/routing.md` — loop, teaching-move table, efficiency moves, anti-patterns
* `references/mastery_and_decision.md` — the 7 statuses, the readiness gate, status alignment
* `references/continuity.md` — Learning State Card / Checkpoint / handoff / stateless recovery
* `references/clarify_and_path.md` — broad-goal flow, study-plan shape, Knowledge Link Cards
* `references/learning_task_loop_protocol.md` — practice loop, turn boundaries, gate branching
* `references/feedback.md` — grade labels, mistake analysis, error→intervention, signal→action
* `references/exercise_generation_protocol.md` — exercise spec + evidence→rung mapping
* `references/practice_ladder.md` — the 7 named rungs
* `references/teaching_modes.md` — 4 modes, depth levels 1–5
* `references/cognitive_load_budget_protocol.md` — per-mode budgets
* `references/trigger_mode_matrix.md` — signal→protocol table
* `references/skill_pack_invocation_protocol.md` — slash→route mapping
* `references/output_formats.md` — all fixed output shapes
* `references/math_formatting_protocol.md` — `\(...\)` / `\[...\]` rule
* `references/student_facing_response_protocol.md`, `references/no_internal_tool_leakage_protocol.md`
* `references/knowledge_gap_taxonomy.md` — 10 gap types
* `references/teacher_like_stop_point_protocol.md`, `references/interaction_pacing_protocol.md`,
  `references/understanding_check_protocol.md`, `references/next_best_teaching_step_protocol.md`
* `references/exam_patterns.md`, `references/resources.md`, `references/source_packs/*`

**Maintainer-only — a plugin MUST NOT treat these as runtime:**

* `AGENTS.md`, `docs/maintenance_notes.md`, `docs/benchmark/*`,
  `docs/skill_vs_generic_ai_advantage.md`, `docs/design-history-v18-orchestrator.md`
* `EVALS.md`, `QUALITY_RUBRIC.md`, `FAILURE_TAXONOMY.md`, `FEEDBACK_TO_IMPROVEMENT.md`
* `skills/universal-diagnostic-tutor/README.md` (Skill usage guide, not instructions)
* Everything under `platforms/` (downstream prompt packaging — `AGENTS.md:188-189`:
  "Keep full Skill behavior in `skills/universal-diagnostic-tutor/`; platform adapters are
  downstream packaging.")

### 4.4 Guardrails a plugin could accidentally violate

1. **No scores / no official grading.** `feedback.md:14-15`: "This is qualitative educational
   grading — not official exam scoring, exact points, exam prediction, or score promises."
   `feedback.md:118`: "Claiming an official score without an official rubric and authority."
   A plugin that shows "78%" or a points total breaks this immediately.
2. **No hidden persistence / no database / no profile.** `continuity.md:48`;
   `mastery_and_decision.md:136-147` ("Creating persistent learner labels without consent");
   `SKILL.md:170-171` ("Never imply hidden persistence across chats").
3. **No curriculum roadmap for broad goals.** `SKILL.md:167-169`; `clarify_and_path.md:159-161`
   ("Broad field goals turning into giant curriculum maps or week-by-week roadmaps");
   `knowledge_system_mapping_protocol.md:61` ("Long curriculum roadmaps for a single
   problem"). **This is the sharpest conflict with a roadmap UI.**
4. **No leakage of skill/repo/version/protocol names in learner-facing output.**
   `no_internal_tool_leakage_protocol.md:9-18`, plus a literal pre-send scan list at `:66-79`:
   `"Skill"`, `"protocol"`, `"version"`, `"V1"`, `"repository"`, `"file"`, `"loaded"`.
   `student_facing_response_protocol.md:9-11`. A plugin that renders its own name, a
   "Mastery Dashboard", a state file path, or a version badge into the learner's transcript
   violates this.
5. **Math formatting.** `math_formatting_protocol.md:11-19`: no formulas in fenced code
   blocks; `\(...\)` inline; `\[...\]` display; avoid raw `$...$`. `SKILL.md:95-97`.
   A plugin rendering math into `<code>` or `$...$` breaks it.
6. **Answer-first prohibition / stop-and-wait.** `SKILL.md:163`: "Never continue after a
   participation check; wait for the learner." `learning_task_loop_protocol.md:65`: "Never
   invent a learner answer to complete the loop in one message." An auto-advancing plugin
   that grades and immediately issues the next item in one turn violates the turn boundary.
7. **No answer-first homework bot, no cheating/押题/leaked materials/score promises.**
   `SKILL.md:154-159`; `exam_patterns.md:9`, `:24`.
8. **No slash strings as real commands.** `SKILL.md:172`; `skill_pack_invocation_protocol.md:24-25`.
9. **No fabricated sources.** `resources.md:117-123`.
10. **Source packs are metadata only** — never copy content. `AGENTS.md:140-142`.

### 4.5 What it would take for a plugin to *depend on* this skill

**Available today (good news)**

* The bundle is self-contained and path-stable; the DSH contract is simple (one-level-deep
  `<root>/<name>/SKILL.md`, frontmatter `name` + `description`).
* Closed, stable vocabularies exist and are explicitly declared authoritative — the seven
  mastery statuses, the six readiness outcomes, the five grade labels, the nine error types,
  the seven practice rungs, the four modes. These are ready-made enum definitions for a
  runtime; a plugin can mirror them without inventing anything.
* The turn-boundary and stop-point rules give a runtime a crisp interaction model
  (single-item turns, wait-for-learner, one check at a time).
* MIT license — free to depend on, vendor, or fork, with attribution.

**Missing (blockers)**

1. **No versioned manifest.** No `plugin.json` / `marketplace.json` / `Skill` metadata. The
   only version signal is git tag `v2.0.0` and `CHANGELOG.md` prose. Frontmatter has no
   `version` field, and `docs/maintenance_notes.md:27-31` *requires* frontmatter to contain
   only `name` and `description` — so a plugin cannot even ask the skill to declare its own
   version without changing that rule.
2. **No machine-readable state schema.** The Learning State Card is opt-in, prose-valued,
   unversioned, and has two slightly different field orderings in-repo
   (`continuity.md:9-22` vs `output_formats.md:139-151`). Nothing defines
   `concept_id`, `status` as an enum, `evidence[]`, `updated_at`, `scope`, or a stable
   serialization. A plugin cannot round-trip state without inventing a schema the skill does
   not recognize.
3. **Semantic conflict on persistence.** The skill's identity is *defined against* persistence:
   "It is not a course platform, question bank, database, RAG system, or hidden memory
   service" (README.en.md). A plugin that stores state is exactly the thing the skill says it
   is not. Dependency therefore requires re-framing: the plugin stores **user-visible,
   user-controlled cards**, not agent memory — i.e. the plugin must be a card *broker*, not a
   memory *service*, or the skill's own guardrails will fight it.
4. **Structural conflict on roadmaps.** "Never turn mastery tracking into ... a curriculum
   roadmap" (`SKILL.md:166-167`) and "It is not a course outline" (`clarify_and_path.md:50-51`).
   Any roadmap/dependency-graph UI must be justified as the *compact goal-specific knowledge
   map* (`clarify_and_path.md:47-64`) — 1–3 first nodes, "readable in one glance", mastery
   marked `unconfirmed` unless checked. A multi-week or full-course view is explicitly banned.
5. **No emitted events or hooks.** Nothing in the skill produces a structured turn event
   (started check / grade issued / readiness decided). A plugin must either parse the LLM's
   natural-language output (fragile — the skill *requires* prose and *forbids* labels in
   many paths, e.g. `clarify_and_path.md:143-147`) or add a **new output contract to the
   skill** (the plugin would be modifying the dependency).
6. **No leakage allowance.** `no_internal_tool_leakage_protocol.md:66-79` forbids the words
   "Skill", "protocol", "version", "repository", "file", "loaded" in learner-facing output.
   A plugin that injects its own UI chrome, state file paths, or "powered by" text into the
   tutor's answers is on the wrong side of the skill's own rules. Plugin chrome must live
   *outside* the tutoring transcript.
7. **Distributed by git only.** No registry, no version pinning, no dependency resolution.
   A plugin that "depends on" it must either vendor the bundle or parse the tag.

**Practical dependency design implied by the above**

* Treat the skill as a **behavioral spec**, not a library: don't re-implement teaching logic,
  don't duplicate decision tables.
* Add state *inside the existing card vocabulary*: the plugin should produce/consume
  `Learning State Card` blocks whose values come from the skill's closed enums
  (`explained|practiced|checked|confirmed|unconfirmed|weak|blocked`;
  `Advance|Advance with caution|Review first|Step down|Diagnose again|More practice needed`).
* Honor the deployment surface: keep plugin chrome out of the learner-facing transcript; render
  state in the UI panel, not in the tutor's prose.
* Do not create a second vocabulary, a parallel card type, or new public entrypoints
  (`AGENTS.md:260-262`).
* The cleanest dependency hook is a **thin, explicit state-block contract added to
  `continuity.md` + `output_formats.md`** (which the plugin would need upstream buy-in for),
  not output scraping.

---

## 5. Version / state of the project

| Item | Value |
|---|---|
| Current branch | `main` (only local branch; `origin/HEAD -> origin/main`) |
| Work tree | **Clean** — `git status --short` empty |
| `git describe` | `v2.0.0-5-gcbc2d1b` |
| Tags | **`v2.0.0` only** |
| Tag target | `72b6ba7` — "docs: finalize v2.0.0 release metadata", 2026-09-14 21:52:45 -0400 |
| HEAD | `cbc2d1b` — "docs: make Chinese the default README, English at README.en.md", 2026-09-20 21:08:27 -0400 |
| Commits since tag | 5 (all docs-only: DSH documentation + README language switching) |
| Total commits | 45 |
| GitHub Release | 1 — `v2.0.0`, "Universal Diagnostic Tutor Skill v2.0.0", published 2026-09-15T01:53:28Z |
| License | **MIT**, `Copyright (c) 2026 universal-diagnostic-tutor-skill contributors` |
| Remote | `https://github.com/SenmuuuuW/universal-diagnostic-tutor-skill.git` |

So: **V2.0 is tagged, released, and the working tree is clean, but HEAD is 5 documentation
commits ahead of the tag.** Those 5 commits touch nothing in the tutoring runtime — the
`CHANGELOG.md` top section labels them "Unreleased — Documentation / Distribution" and states
for both sub-sections: "no Tutor runtime behavior changes" (`CHANGELOG.md:12`, `:22`).

### What changed in V2 vs V1

`CHANGELOG.md:24-111`, "## v2.0.0 — One Tutor, No Feature Menu":

* **One Tutor.** "the six public entrypoints collapsed into a single diagnosis-first tutor.
  Practice, Mistake Review, Gap Diagnosis, Study Planning, Exam Track, Resource-supported
  teaching, and Visualization are internal behaviors triggered by natural language — never a
  menu."
* **Slash commands de-advertised** but still silently recognized.
* **Three cards → ONE Learning State Card** with optional fields absorbing profile/task card
  concepts. "No hidden memory."
* **Mode menu removed**; Zero-Base/Standard/Advanced/Auto inferred from evidence.
* **Reference consolidation:** "references/: 74 protocol files -> 39 consolidated,
  single-source-of-truth files". Confirmed on disk: 39 protocol files + 15 source packs.
* **SKILL.md shrunk:** "~8.4K -> ~2.5K tokens".
* **Removed the five thin `tutor-*` entrypoint folders** (learn-path, practice, state-card,
  resource-scan, visualize). `INSTALL.md:25-26`: "2.0 只有一个公开入口。旧版 `tutor-*`
  文件夹已删除".
* **Benchmark (project's own frozen 29-case harness, judge rubric v1.0.0):**

  | Metric | v1.9.2 baseline | v2.0.0 |
  |---|---|---|
  | Identity group | 4.622 | 4.819 |
  | Quality group | 4.135 | 4.619 |
  | Over-teaching | 3.62 | 4.62 |
  | Mistake diagnosis | 3.75 | 4.50 |
  | Next-best step | 4.03 | 4.55 |
  | Naturalness | 4.53 | 4.76 |
  | t02 (over-explaining) rate | 31.0% | 6.9% |
  | Leakage regex hits | 0 | 0 |
  | Urgent / critical failures | 0 | 0 |

  Context: "Mean runtime context: 11,388 -> 6,678 tokens (-41%)". The repo repeatedly labels
  these as harness-scoped: "not universal performance claims across every model or
  environment."
* **Negative space is explicit** (`CHANGELOG.md:107-111`): "No scripts, infrastructure,
  database, hidden memory, or integrations. No token-driven compression of core teaching
  instructions."

Version history structure (from `skills/.../README.md:408-418`): V1.9.x Practice & Mastery Loop;
V1.8.x learning architecture; V1.7.x skill-pack invocations / exam track / cards / visuals;
V1.6.x cross-platform adapters; V1.5.x evals + Learning State Cards; V1.4.x next-best-step
efficiency; V1.3.x teacher-like style + no leakage; V1.2.x teaching modes + math formatting.

**Feature freeze** (`AGENTS.md:318-329`, "## V2.0 Release Freeze"):

> - v2.0.0 is released. Core tutoring behavior stays feature-frozen for the
>   2.0 line: do not continue merging reference files, shrinking `SKILL.md`, or
>   deleting teaching behavior to chase token or file counts; only fix explicit
>   bugs.
> - 39 reference files is an accepted state. ...
> - Context cost around 6,700 tokens mean is an optimization target, not a
>   release blocker.
> - Do not push, tag, or create a GitHub Release without explicit human
>   approval.

---

## 6. Public framing (GitHub reachable)

`web_fetch` on `https://github.com/SenmuuuuW/universal-diagnostic-tutor-skill` returned HTTP 200
but only navigation chrome; the **raw README fetched fine**
(`https://raw.githubusercontent.com/SenmuuuuW/universal-diagnostic-tutor-skill/main/README.md`),
and the GitHub REST API was reachable via `curl`.

**Repo metadata (GitHub API):**

| Field | Value |
|---|---|
| Stars | **225** |
| Forks | **6** |
| Watchers | 225 |
| Open issues | 0 |
| Created | 2026-06-26T12:54:23Z |
| Last push | 2026-09-21T01:08:28Z |
| Default branch | `main` |
| Repo size | 1,376 KB |
| Language | **none** (Markdown only) — `/languages` returns `{}` |
| License | MIT (SPDX `MIT`) |
| Archived | false |
| Topics | `ai-education`, `ai-tutor`, `codex`, `codex-skill`, `computer-science`, `diagnostics`, `learning-assistant`, `math`, `skill`, `stem`, `tutoring` |
| Releases | 1 (`v2.0.0`, 2026-09-15) |
| GitHub tree at `main` | 189 entries (matches local 172 files + directories) |

**Tagline / description (GitHub repo description, and README subtitle):**

> One diagnosis-first AI tutor for STEM, AI/CS, and beyond — no mode or command menu. It
> decides the next useful teaching step, checks understanding, and builds mastery.

Chinese README subtitle: **"一个不用选模式、也不用记命令的诊断式 AI 导师"** ("A diagnostic
AI tutor where you don't pick a mode and don't memorize commands") — "它先判断你真正卡在哪里，
再决定下一步该讲、该问、该练还是该停。"

**How it explains itself** — the one-sentence differentiator, repeated in both READMEs:

> **它不是先给答案，而是先判断你卡在哪里。**
> **It does not answer first. It works out where you are stuck first.**

And the negative identity, immediately after:

> It is not a course platform, question bank, database, RAG system, or hidden
> memory service.

**Feature list** (README "它能做什么" table, verbatim rows):

| 行为 | 说明 |
|---|---|
| 诊断优先教学 | 先定位学科、概念、前置知识、符号、方法或推理缺口 |
| 大目标规划 | 澄清目标、给出紧凑知识地图、选出下一步 |
| 练习与掌握 | 出一道针对性练习、等你作答、定性批改、修复错因、判断能否进阶 |
| 自然语言路由 | 只有一个 Tutor；练习、规划、资源、可视化、连续性都由表达自动触发 |
| 备考复习 | 支持大学理科、考研数学、CS 专业课；不押题、不预测、不承诺提分 |
| 资源支持教学 | 只在能改进当前教学步骤时引入可信资源，不甩链接 |
| 相关概念卡片 | 只在强相关概念确实阻碍当前任务时，补 1–3 张短卡片并回到任务 |
| Learning State Card | 可见、可复制、用户控制的续学 checkpoint，不是隐藏记忆 |
| 跨平台适配 | 为普通聊天、自定义 bot、API 提供更小的 prompt 打包版本 |

**Languages.** Primary authoring language is **English** for the runtime (all 39 protocol files,
84 examples' framing, `SKILL.md` body) — but **the GitHub README default is Chinese**
(`README.md`), English is `README.en.md`, and `README.zh-CN.md` is a compatibility pointer.
The SKILL.md `description` deliberately carries **both** EN and CN trigger vocabulary
(`AGENTS.md:266-270`): "Keep the main SKILL.md `description` carrying the English and Chinese
natural-language trigger vocabulary ... Chinese picker matching must not regress."
Learner-facing behavior is language-matched to the learner.

The repo self-describes as **"Markdown only"** via a README badge — a deliberate
anti-infrastructure positioning. It also showcases native DeepSeek Harness support as its
newest distribution win, with a four-way compatibility split
(`Full Skill` / `Custom Bot` / `Lite Prompt` / `API Prompt`, `PORTABILITY.md:42-114`).

---

## 7. Bottom line for a UDT plugin

* The skill is a **pure-prompt behavior layer**: 140 files of Markdown, no code, no schema,
  no manifest, no version in frontmatter, MIT-licensed, discoverable by DSH at
  `<root>/universal-diagnostic-tutor/SKILL.md`.
* Its **teaching logic is well-specified and enum-like** (loop, teaching-move table, 7 mastery
  statuses, 6 readiness outcomes, 5 grade labels, 9 error types, 7 practice rungs, 4 modes) —
  excellent to mirror, and the safest thing to reuse verbatim rather than reinvent.
* Its **state mechanism is deliberately non-machine-readable**: one visible, opt-in,
  copy-pasteable Learning State Card, framed as "user-carried data, not storage", with an
  explicit ban on scores, databases, hidden memory, persistent learner labels, and curricula.
* Therefore a plugin cannot *consume* structured state today, and cannot *add* persistence
  without contradicting the dependency's published identity. The viable path is a **visible
  card broker**: the plugin renders/collects the existing card vocabulary in the UI, keeps all
  its chrome outside the learner-facing transcript, mirrors the skill's closed enums, and adds
  no roadmap beyond the skill's own "compact goal-specific map, 1–3 first nodes, mastery
  `unconfirmed` unless checked".
* The one upstream change that would make true dependence easy is a small, versioned,
  enum-backed state block in `continuity.md` / `output_formats.md` plus an optional
  `version`/`metadata` frontmatter field — both currently prohibited by
  `docs/maintenance_notes.md:27-31` and `AGENTS.md:334-336`, so it needs explicit owner
  approval.
