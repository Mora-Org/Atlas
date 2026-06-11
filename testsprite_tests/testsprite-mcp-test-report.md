# TestSprite AI Testing Report (MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** dynamic-sql-editor
- **Date:** 2026-06-11
- **Prepared by:** TestSprite AI Team
- **Scope:** Frontend — M6 Fase 5 "Export estático" (UI nova) + re-validação de rollback/empty-state/cancel do PR5.
- **Run mode:** Production build (`npm run build && npm run start`, porta 3000), backend local com banco migrado (`_publication_versions` presente).

> **Nota de integridade:** o re-run de 2026-06-10 (registrado no relatório anterior) rodou contra um banco local **sem a tabela `_publication_versions`** (migration alembic nunca aplicada localmente) — aqueles 3 "passes" foram invalidados e re-executados nesta rodada com o ambiente correto. O run original de 2026-06-02 (6/9) não é afetado.

---

## 2️⃣ Requirement Validation Summary

### Requirement: Export estático (M6 Fase 5)
Qualquer versão do histórico vira um ZIP standalone; a UI mostra progresso e um painel pós-geração detalhado.

#### TC001 — Export a published version as static site ZIP
- **Test Code:** [TC001_Export_a_published_version_as_static_site_ZIP.py](./TC001_Export_a_published_version_as_static_site_ZIP.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/86a73402-1fe2-43cf-bde0-32695b12525b/f098d0f8-612d-4c41-a804-7f8be6cd8dc1
- **Status:** ✅ Passed *(re-run; a primeira tentativa foi bloqueada por falha transitória de login sob 4 agentes concorrentes — backend confirmado saudável no momento)*
- **Analysis / Findings:** Login → Publicação → todo card do histórico expõe "Exportar"; o clique mostrou "Gerando…" e ao final a seção "§ III Export" apareceu com o nome do .zip, versão, tamanho em KB e as instruções de abrir/hospedar. Fluxo UI → route handler Next → backend confirmado de ponta a ponta.

### Requirement: Rollback to a previous version

#### TC003 — Rollback to a previous published version
- **Status:** ✅ Passed
- **Analysis / Findings:** "Voltar pra esta" numa versão não-ativa → strip de confirmação → "Confirmar" → a versão escolhida ganhou o badge "ativa", com exatamente uma ativa na lista. Agora validado com o backend de publicações funcional de verdade.

### Requirement: Publication Version History

#### TC007 — See empty publication history state
- **Status:** ✅ Passed
- **Analysis / Findings:** Admin recém-criado (sem publicações) viu "Nenhuma versão publicada ainda", sem entradas nem badge "ativa".

### Requirement: Publish with optional label

#### TC008 — Cancel publishing from the confirmation strip
- **Status:** ✅ Passed
- **Analysis / Findings:** Com rascunho sujo, "Publicar mudanças" abriu a strip ("Publicar vN" + "cancelar"); cancelar fechou a strip, rascunho continuou sujo e o histórico manteve a mesma contagem — nenhuma versão criada.

---

## 3️⃣ Coverage & Matching Metrics

- **100%** dos testes passaram (4/4; TC001 no re-run após bloqueio transitório).

| Requirement                     | Total | ✅ Passed | ❌ Failed |
|---------------------------------|-------|-----------|-----------|
| Export estático (M6 F5)         | 1     | 1 (TC001) | 0         |
| Rollback to a previous version  | 1     | 1 (TC003) | 0         |
| Publication Version History     | 1     | 1 (TC007) | 0         |
| Publish with optional label     | 1     | 1 (TC008) | 0         |
| **Total**                       | **4** | **4**     | **0**     |

**Defeitos reais encontrados: 0.**

---

## 4️⃣ Key Gaps / Risks

- **Gate manual pendente (plano da Fase 5):** abertura do ZIP exportado via `file://` em Chrome/Firefox/Edge pelo Diretor. O conteúdo já foi validado programaticamente (zero `<script>`, fontes locais, 3 layouts) e o E2E local baixou/inspecionou o pacote.
- **Aviso de truncamento não coberto por TestSprite:** exigiria semear 2000+ linhas via UI; o caminho está coberto por lógica de UI simples + teste de backend `test_truncated_total_rows_is_real_count`.
- **Concorrência de agentes:** 4 agentes simultâneos na mesma conta produziram 1 falha transitória de login (TC001, primeira tentativa). Para rodadas futuras: considerar contas por teste ou execução menor.
- **Ambiente local:** alembic local tinha histórico divergido (revision órfã) — corrigido via `create_all` + `alembic stamp --purge head`. Anotado na memória do projeto para não repetir.
