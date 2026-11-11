# 1.1.0 Release Gate

Status: candidate. Publish only after actual gates.

| Gate | Result |
|---|---|
| Typecheck / tests / build | pass: **769 / 73 files**, Node 22.19/24.x |
| Node 22.19 / 24.x | pending final |
| Browser path-check | 31/31 |
| DSH rc.2 plugin boot | pass with 1.1.0 package |
| DSH rc.2 image input | pass (actual pixels, ground-truth answers) |
| Core Tutor rc.2 | partial: skill load, goal, diagnosis, lesson, image material; no full route/check in captured session |
| PDF native text + citations | existing tests |
| Scanned PDF no-OCR warning | pass (fixture/test) |
| PDF OCR | **not implemented** |
| PDF figure/chart vision | **not implemented** |
| Image file/PDF OCR | no OCR library bundled |
| Candidate/Scene flags off | existing gate |
| Approval isolation | existing tests |
| 1.0.2 → 1.1 data compatibility | pass (course/nodes/lesson/asset preserved) |
| 0.4.1 legacy compatibility | pending final |
| Final tarball rc.2 E2E | pass (plugin 1.1.0, material bridge, browser no exceptions) |
| Handoff reproducibility | pass: fresh worktree install/typecheck/769 tests/build/browser, rc.2 install plugin 1.1.0 |
| Real learner participants | **0** |
| Independent education review | **0** |

Release scope: Core Tutor + documented tool-mediated image materials + PDF
native text provenance. Scanned PDF OCR and PDF figure understanding are **not**
part of v1.1.

## Package

- `dsh-diagnostic-tutor-1.1.0.tgz`
- 204 files, packed 682,149 bytes, unpacked 3,230,388 bytes
- shasum `c5b2f21cb04ace9a54fa0c3767a6fd93c00141c8`
- SHA-256 `6a3f422aa918e48c4155e62029c4e3d8e78e80cebcfbc15e34ec5228cf64e213`

## Actual multimodal boundaries

- Real image attachment: DSH rc.2 → DeepSeek image input; graph x=0/slope=2,
  geometry inconsistency, chart C→D correct.
- `udt_material_visual`: Tutor read a plugin-stored image via host image reader,
  reported actual pixels and correct values.
- PDF native text/citations pass; scanned PDF reports empty text layer; **no OCR**.
- PDF charts/figures: **not understood** from native text.
- Real learner participants: **0**; independent review: **0**.
