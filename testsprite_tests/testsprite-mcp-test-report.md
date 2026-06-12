# TestSprite AI Testing Report (MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** dynamic-sql-editor
- **Date:** 2026-06-12
- **Prepared by:** TestSprite AI Team
- **Scope:** Frontend — M6.5 PR2 "Capa Editorial" (home do admin com dados reais) + fixes de navegação do PR1.
- **Run mode:** Production build (`next start`, porta 3000), backend local migrado.

---

## 2️⃣ Requirement Validation Summary

### Requirement: Capa editorial com dados reais (M6.5)

#### TC001 — Cover shows real workspace state
- **Test Code:** [TC001_Cover_shows_real_workspace_state.py](./TC001_Cover_shows_real_workspace_state.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/29625643-cfbc-4727-acc2-b3be789dd33a/ea4ae403-2c90-426b-aa73-d7b392d4f8ed
- **Status:** ✅ Passed
- **Analysis / Findings:** Login → `/admin` rendeu a capa-papel com "Estado da edição", masthead num dos 3 estados honestos, 4 stats reais no "Em números" e a seção I com tabela real. **Nenhum dado fake** (sem "Uptime", "SQLite local" ou "v1.3.0") — os hardcodes da home antiga estão mortos.

#### TC002 — Fresh admin sees draft cover with publish CTA
- **Test Code:** [TC002_Fresh_admin_sees_draft_cover_with_publish_CTA.py](./TC002_Fresh_admin_sees_draft_cover_with_publish_CTA.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/29625643-cfbc-4727-acc2-b3be789dd33a/6343c216-efe6-4ce7-8206-33272593bd80
- **Status:** ✅ Passed
- **Analysis / Findings:** Admin recém-criado viu "rascunho · não publicado" no masthead, o CTA "Publicar a primeira →" na seção III e os botões Pré-visualizar/Copiar link desabilitados. Estado "nunca publicou" correto.

#### TC003 — Copy link gives visual feedback
- **Test Code:** [TC003_Copy_link_gives_visual_feedback.py](./TC003_Copy_link_gives_visual_feedback.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/29625643-cfbc-4727-acc2-b3be789dd33a/d4d9146e-1ff7-4c54-bc1d-867d4c364f0e
- **Status:** ✅ Passed
- **Analysis / Findings:** Com edição publicada, "Copiar link" mostrou o feedback "copiado ✓". Fluxo completo exercitado (incluiu publicar via Studio quando necessário).

### Requirement: Navegação (fixes do M6.5 PR1)

#### TC004 — Sidebar reaches Capa and Publish Studio
- **Test Code:** [TC004_Sidebar_reaches_Capa_and_Publish_Studio.py](./TC004_Sidebar_reaches_Capa_and_Publish_Studio.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/29625643-cfbc-4727-acc2-b3be789dd33a/3f6abdec-a992-48db-b0be-c8ff2f200dde
- **Status:** ✅ Passed
- **Analysis / Findings:** Sidebar → Publicação abriu o Publish Studio (antes inalcançável), Capa voltou pra `/admin`, e QR abriu `/admin/qr-auth` **sem o 404** que existia desde o M5.

---

## 3️⃣ Coverage & Matching Metrics

- **100%** dos testes passaram (4/4, primeira tentativa).

| Requirement | Total | ✅ Passed | ❌ Failed |
|---|---|---|---|
| Capa editorial com dados reais | 3 | 3 | 0 |
| Navegação (fixes PR1) | 1 | 1 | 0 |
| **Total** | **4** | **4** | **0** |

**Defeitos reais encontrados: 0.** Complementa o gate Playwright do PR (matriz 2×4 de screenshots, mount 92ms, master redirect, zero console errors).

---

## 4️⃣ Key Gaps / Risks

- O fix de hidratação (`authLoading`) provavelmente explica os bloqueios intermitentes de login em runs anteriores do TestSprite — esta rodada passou 4/4 de primeira, sem retries.
- Estado "erro de API por bloco" (stat vira "—") não é exercitável via TestSprite sem derrubar o backend no meio do teste — coberto pela lógica de `Promise.allSettled` + revisão de código.
- Restante do M6.5: PR3 backend (`activated_at`) — após o merge deste PR.
