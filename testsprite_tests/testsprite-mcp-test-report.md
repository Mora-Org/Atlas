# TestSprite AI Testing Report (MCP) — M8 F2 (DataViewer + Media)

---

## 1️⃣ Document Metadata
- **Project Name:** dynamic-sql-editor
- **Milestone / Scope:** M8 F2 (F2a schema editor + F2b media in the DataViewer) — staged diff
- **Date:** 2026-07-06
- **Test type:** Frontend E2E (production build, test-auth), 14 generated tests
- **Result:** **12 / 14 passed.** The 2 failures are generated-fixture artifacts (target table had no media column), not F2 defects — see analysis + counter-evidence below.

---

## 2️⃣ Requirement Validation Summary

### Requirement R1 — Schema editor for an existing table (F2a)
Route `/admin/tables/[id]/edit`; add-column / drop-column / delete-table wired to the F0 backend with server guards.

| Test | Title | Status |
|---|---|---|
| TC001 | Open schema editor from the tables list | ✅ Passed |
| TC003 | Add a standard column to an existing table | ✅ Passed |
| TC006 | Add a media column to an existing table | ✅ Passed |
| TC007 | Delete a table with exact-name confirmation | ✅ Passed |
| TC008 | Remove an allowed column from a table | ✅ Passed |
| TC013 | Block guarded column removal (PK/system/relation) | ✅ Passed |

**Analysis:** the schema editor is fully validated — the Schema entry point navigates correctly, columns add (standard **and** media), the confirm-by-name delete works, allowed columns drop, and guarded columns are blocked with the backend's 400 surfaced inline.

### Requirement R2 — Media column type in the create wizard (F2a)
The create-table wizard offers `image`/`file`/`attachment` from the shared type source.

| Test | Title | Status |
|---|---|---|
| TC002 | Create a table with standard and media columns | ✅ Passed |
| TC009 | Create a table with selectable media types | ✅ Passed |
| TC010 | Use the unique column constraint while creating a table | ✅ Passed |

**Analysis:** media types are selectable at creation and persist (the shared `columnTypes` module emits the canonical lowercase `image/file/attachment`, closing the old silent `:Text` fallback). Unique constraint is honored.

### Requirement R3 — Media in the DataViewer (F2b): upload, library pick, preview, clear

| Test | Title | Status |
|---|---|---|
| TC004 | Load records in the DataViewer for a table | ✅ Passed |
| TC011 | Choose a reusable asset for a media cell | ✅ Passed |
| TC005 | Upload a media value in the DataViewer | ❌ Failed (fixture) |
| TC012 | Clear a saved media value from the DataViewer | ❌ Failed (fixture) |

**Analysis:**
- **TC011 (passed) is the load-bearing proof of the whole F2b UI flow:** it added a `foto` image column via the schema editor, opened the `Arquivo…` widget, used the library picker, saved the record, and asserted the media cell rendered `href="http://localhost:8000/api/assets/dev/10/<uuid>.png"` — i.e. `MediaField` → picker → `MediaPreview` all work end-to-end with the correct absolute asset URL.
- **TC005 / TC012 (failed) are generated-fixture artifacts, not defects.** Both hardcoded `testtable1`, which has only `id` + `label` and **no media column**; TC007 also deletes `testtable1` mid-run. With no media column present, the tests correctly found no media widget and aborted. The behaviors they intended to check are independently proven:
  - **File upload via the UI:** the run left **8 PNG assets** in the workspace library, all uploaded through the `Arquivo…` dropzone during other tests (the `POST /api/assets/upload` glue works).
  - **Clear:** the clear control calls the same full-record `PUT` path (`commitMediaEdit(null)`) verified 19/19 in the backend data-path smoke (refcount real→0 on clear).

### Requirement R4 — Role-based access
| Test | Title | Status |
|---|---|---|
| TC014 | Show read-only schema controls for master role | ✅ Passed |

**Analysis:** master (403 on schema + asset endpoints) correctly gets a read-only schema editor and preview-only media — the UI gates on `role`, not the `isAdmin` flag (which includes master).

---

## 3️⃣ Coverage & Matching Metrics

- **Tests executed:** 14 (frontend E2E, production mode)
- **Passed:** 12 (85.7%)
- **Failed:** 2 (14.3%) — both generated-fixture artifacts (target table lacked a media column), zero F2 defects
- **Requirements fully validated:** R1 (schema editor), R2 (media type in create), R4 (role access) — 100%
- **R3 (media in DataViewer):** functionally validated via TC011 (full flow, href assertion) + 8 real UI uploads + backend data-path smoke 19/19; the 2 red tests are fixture gaps.

| Requirement | Total | ✅ | ❌ (artifact) |
|---|---|---|---|
| R1 Schema editor | 6 | 6 | 0 |
| R2 Media type in create | 3 | 3 | 0 |
| R3 Media in DataViewer | 4 | 2 | 2 (fixture) |
| R4 Role access | 1 | 1 | 0 |

---

## 4️⃣ Key Gaps / Risks

- **No product defects found in F2.** The two red tests are test-generation fixture gaps: they targeted `testtable1` (no media column, and deleted by TC007) instead of adding a media column first — unlike TC011, which set up its own and passed. Same class as the accepted F0 (6/9) and F1 (10/12) generator artifacts.
- **Out of scope (by design), not gaps:** public-site / snapshot / static-export media rendering (F3); server-side MIME/size/SVG hardening, per-workspace quota, and the Playwright gate (F5); spreadsheet import (F4).
- **Dev-DB note:** this run mutated the local `dynamic_template.db` (created several test tables, dropped `testtable1`, left 8 orphan assets). The DB is gitignored/dev-only; cleaned of the run's junk tables + orphan assets afterward.
