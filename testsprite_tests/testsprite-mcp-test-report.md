# TestSprite AI Testing Report (MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** dynamic-sql-editor
- **Date:** 2026-06-10
- **Prepared by:** TestSprite AI Team
- **Scope:** Frontend — re-run of the 3 tests blocked in the 2026-06-02 M6 PR5 run ("Publication Version History + Rollback"). Full first-run report preserved at [pr5-test-report-2026-06-02.md](./pr5-test-report-2026-06-02.md).
- **Run mode:** Production build (`npm run build && npm run start`, port 3000) — the dev-server flakiness that blocked these tests is eliminated.

---

## 2️⃣ Requirement Validation Summary

### Requirement: Rollback to a previous version
Reactivate an older version from history (two-click inline confirm); the chosen version becomes the single active one.

#### TC003 — Rollback to a previous published version
- **Test Code:** [TC003_Rollback_to_a_previous_published_version.py](./TC003_Rollback_to_a_previous_published_version.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/31c6ce3c-d891-480b-ad76-a80a000db131/4f0d61c7-ca9a-42c8-977b-453ff60d6ca7
- **Status:** ✅ Passed
- **Analysis / Findings:** Login as testadmin → Publicação tab → "Voltar pra esta" on a non-active version → inline confirm → the chosen version gained the "ativa" badge and exactly one version remained active. The full UI rollback path (`POST /api/publications/me/versions/{id}/activate` + history refresh) is now confirmed end-to-end, closing the gap left by the dev-server block on 2026-06-02.

### Requirement: Publication Version History
View published versions with the active one identified, and an empty state when none exist.

#### TC007 — See empty publication history state
- **Test Code:** [TC007_See_empty_publication_history_state.py](./TC007_See_empty_publication_history_state.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/31c6ce3c-d891-480b-ad76-a80a000db131/f8db7a70-9c30-4fce-9909-b82acaa646f1
- **Status:** ✅ Passed
- **Analysis / Findings:** A freshly created admin (never published) opened the Publicação tab and saw the empty-state copy "Nenhuma versão publicada ainda", with no version entries and no "ativa" badge. Using a fresh account also removed the state-coupling risk flagged in the first run.

### Requirement: Publish with optional label
Publish via the inline confirmation strip; the strip is cancelable without side effects.

#### TC008 — Cancel publishing from the confirmation strip
- **Test Code:** [TC008_Cancel_publishing_from_the_confirmation_strip.py](./TC008_Cancel_publishing_from_the_confirmation_strip.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/31c6ce3c-d891-480b-ad76-a80a000db131/ffb3ea09-9316-43e8-b8a1-2b0e2541326c
- **Status:** ✅ Passed
- **Analysis / Findings:** With a dirty draft, "Publicar mudanças" opened the strip ("Publicar vN" + "cancelar"); clicking "cancelar" closed it, the draft stayed dirty, and the history kept the same version count — no version was created. Cancel path verified with no side effects.

---

## 3️⃣ Coverage & Matching Metrics

- **100%** of tests passed (3/3).

| Requirement                     | Total | ✅ Passed | ❌ Failed |
|---------------------------------|-------|-----------|-----------|
| Rollback to a previous version  | 1     | 1 (TC003) | 0         |
| Publication Version History     | 1     | 1 (TC007) | 0         |
| Publish with optional label     | 1     | 1 (TC008) | 0         |
| **Total**                       | **3** | **3**     | **0**     |

**Combined with the 2026-06-02 run, all 9 M6 PR5 test cases are now green (9/9). Genuine defects found across both runs: 0.**

---

## 4️⃣ Key Gaps / Risks

- **None blocking.** The production build removed the transient SPA 404s, confirming the first run's diagnosis: environment, not product. All M6 PR5 requirements (history, publish with label, rollback, delete guards) have passing UI coverage plus backend pytest coverage.
- **Recommendation for future frontend runs:** always run TestSprite against a production build (`npm run build && npm run start`); `next dev` is single-threaded and drops requests under concurrent browser-test load.
