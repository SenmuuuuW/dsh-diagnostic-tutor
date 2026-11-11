# Known Limitations (v1.0.0)

- No independent education review and no real learner study; no learning-gain
  claim.
- Dynamic Scenes are experimental, default-off, human-approved and limited to
  validated SceneSpec.
- Automatic Scene generation is a local worker bridge; DSH has no supported
  background model-execution service. No automatic approval.
- Scene semantic verification covers a narrow set of constraints; unverified is
  not passed.
- No OCR or general image understanding; PDF extraction is text-only.
- Storage is local JSON with one write chain per plugin instance; it does not
  provide cross-tab strong CAS. Concurrent browser tabs are a known boundary.
- Import restores state metadata, not local image asset bytes; asset backup is
  separate.
- Legacy upgrade fixture covers 0.4.1-supported course/node/evidence/project;
  full historical lesson/asset/review data cannot be fabricated.
- DSH layout/rightbar/fullscreen APIs are host-specific and may change.
- No official support claim for DSH versions other than 0.2.2-rc.1.

## v1.1 multimodal additions

- No OCR bundled; scanned PDFs are reported as empty text layers.
- No PDF figure/table visual understanding; only native text.
- `udt_material_visual` is host-tool-mediated; a path is not a vision guarantee.
- Only graph, geometry and chart image cases were executed; handwriting and
  low-quality cases were prepared but not validated.
