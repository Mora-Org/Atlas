# 🗺️ Roadmap Atlas — Visão de Longo Prazo

> **Última atualização:** 2026-05-15
> **Mantido por:** Diretor + Claude (Programador)
> **Convenção:** ✅ done · 🔵 in progress · 📋 planejado · 🧊 congelado · 💭 ideia

Este documento é o mapa estratégico de tudo que está construído, em construção, ou planejado para o Atlas. Para cada milestone existe (ou existirá) um plano técnico detalhado em `planning/milestone_N_*.md`.

---

## Onde estamos hoje

| Milestone | Status | Resumo |
|---|---|---|
| **M1** Estabilização + CRUD básico | ✅ done | CRUD dinâmico testado, conftest refatorado, patch notes 1.0.x |
| **M2** Foreign Keys + SQL Import + Admin UI | ✅ done | FKs funcionais, dry-run de SQL, CRUD completo, 38 testes verdes |
| **M5** Atlas Redesign / Mora Editorial | ✅ done | Tokens + 15 telas + Tweaks Panel + polish editorial |
| **M3** RLS / Supabase-Native | ✅ done | Em prod: atlas-mora.vercel.app + Railway + Supabase. RLS schema-per-tenant end-to-end. |
| **M4** Auth Unification | 📋 próxima | Replanejar antes — 3 questões em aberto no plano. |

---

## Próximos 6 meses

**Princípio do Diretor (2026-05-04):** *base sólida antes de features visíveis*. M3 destrava deploy real + M8/M10 — vai primeiro.

**Reordenação (2026-05-15):** Diretor pediu pra empilhar M4 logo depois de M3, antes de M6/M7. Justificativa: deixar toda a infra (RLS + Auth unificado) madura antes de feature visível, pra M6 (publish) e M7 (visualizer) nascerem já em Supabase Auth — sem migration debt depois.

### 🟢 Faixa 1 — Ordem definida

#### 1️⃣ **M3** — RLS / Supabase-Native — **EM FECHAMENTO**
- **Por quê:** sair do SQLite com prefixo `t{id}_` pra Postgres com schema-per-tenant + RLS. Pré-requisito pra deploy real.
- **Estado:** Fases 0-4 mergeadas (PRs #7-#11). Fase 5 removida. Fase 6 dispensada (sem dados reais). Fase 7 (pytest RLS) em PR aberto. Falta Fase 8 (deploy).
- **Plano:** [milestone_3_rls_migration.md](./milestone_3_rls_migration.md)

#### 2️⃣ **M4** — Auth Unification (Supabase Auth)
- **Por quê:** trocar JWT custom HS256 pelo Supabase Auth — OAuth, magic links, password reset sem manter código. RLS pode usar `auth.uid()` nativo, frontend pode falar direto com Supabase quando fizer sentido.
- **Bloqueio antes de codar:** 3 questões em aberto no plano (convite de moderador, hierarquia de role via custom claims, seeding do master no CI/CD). Gemini precisa replanejar antes.
- **Plano:** [backlog_m4_auth_unification.md](./backlog_m4_auth_unification.md)
- **Risco:** médio-alto.

#### 3️⃣ **M6** — Publish & Export
- **Por quê:** com M3 + M4 prontos, "publicar" vira snapshot versionado + theme studio + export estático.
- **Escopo:** 7 fases (~2-3 semanas).
- **Plano:** [milestone_6_publish_export.md](./milestone_6_publish_export.md)
- **Risco:** médio.

#### 4️⃣ **M7** — Schema Visualizer (painelzão ER)
- **Por quê:** feature autocontida, vem depois da base.
- **Escopo:** 5 fases (~1-2 semanas).
- **Plano:** [milestone_7_schema_visualizer.md](./milestone_7_schema_visualizer.md)
- **Risco:** baixo.

### 🟡 Faixa 2 — Médio prazo (depois de Faixa 1)

#### **M8** — Media Library + File Uploads
- **Por quê:** colunas tipo `image`, `file`, `attachment` não existem. Hoje admin que quer subir foto tem que colocar URL externa.
- **Escopo:** novo column type, storage backend (S3-compatible ou local), thumbnail generator, UI de upload.
- **Dependências:** M3 (Supabase Storage é caminho natural).

#### **M9** — Webhooks + API Keys + Audit Log
- **Por quê:** integração com sistemas externos (Zapier, n8n, scripts). Audit log pra compliance/debugging ("quem mudou o quê quando").
- **Escopo:** 
  - Tabela `_webhooks` com triggers (on_create/update/delete por tabela)
  - Tabela `_api_keys` com scopes (read/write por tabela)
  - Tabela `_audit_log` com tudo gravado
- **Dependências:** M3 (RLS facilita audit).

### 🔵 Faixa 3 — Longo prazo (1+ ano)

#### **M10** — Real-time + Collaborative Editing
- **Por quê:** múltiplos admins editando a mesma tabela ao mesmo tempo. Vê quem está vendo, evita conflict.
- **Escopo:** WebSocket subscription via Supabase Realtime, presence indicators, optimistic UI.
- **Dependências:** M3 obrigatório (Supabase Realtime).

#### **M11** — AI Helpers (LLM-powered)
- **Por quê:** "Crie uma tabela de clientes com email único e telefone" → schema gerado. "Quantos clientes não compraram nos últimos 30 dias?" → query SQL gerada e executada.
- **Escopo:** integração com Claude API, prompt engineering pra schema synthesis e NL→SQL, validation layer.
- **Dependências:** M3 + dataset com schemas reais pra calibrar.

#### **M12** — Mobile Companion App
- **Por quê:** hoje QR auth funciona mas é improviso. App nativo pra autorizar QR + fazer edições leves on-the-go.
- **Escopo:** React Native ou Expo, scope reduzido (só QR + view + edit simples).
- **Dependências:** M3 + M9 (API keys).

---

## Backlog de ideias (sem ordem)

Coisas que podem virar milestones se ganharem tração:

| Ideia | Justificativa |
|---|---|
| **Computed/Formula columns** | Coluna `total = preco * quantidade` calculada server-side |
| **Saved views / queries** | Salvar filtros + ordenação como "view" reusável |
| **Bulk operations** | Editar/deletar 100 rows de uma vez via checkbox |
| **i18n da interface** | Inglês/espanhol além de PT-BR |
| **Marketplace de templates** | Galeria de schemas prontos (ecommerce, CRM, blog, etc.) |
| **Snapshot/Backup** | Botão "exportar tudo deste tenant" → ZIP com SQL + JSON |
| **Search global cross-table** | Busca única que olha todas as tabelas (precisa de Postgres FTS) |
| **Validation rules customizadas** | Regex/range/lookup constraints além das do SQL |
| **Soft-delete + recovery** | "Lixeira" com restore antes de purge definitivo |
| **Slack/Discord/Email integrations** | Notificações nativas em mudanças importantes |

---

## Princípios de priorização

Quando decidir o próximo milestone, em ordem:

1. **Bloqueio técnico** — o que está travando deploy real ou fluxo crítico? (Hoje: M3.)
2. **Pedido explícito do Diretor** — features que vieram da visão do produto. (Hoje: M6, M7.)
3. **Risco operacional** — backup, audit, security são divida que cresce. (M9.)
4. **Diferenciação competitiva** — o que outros CMS dinâmicos não fazem? (M11 IA.)
5. **Quality of life** — coisas que somam mas não bloqueiam. (Backlog.)

**Regra de ouro:** uma milestone por vez no foco principal. Pode haver paralelo (como M5 rodou paralelo a M3 docs), mas só se for área completamente diferente.

---

## Como este doc evolui

- **Após cada milestone fechar:** mover de "🔵 in progress" pra "✅ done", adicionar link pro patch_notes.
- **Quando uma ideia virar milestone:** mover do backlog pra Faixa 2/3, criar `milestone_N_*.md`.
- **Trimestral:** revisar prioridades com Diretor — pode reordenar tudo.
- **Não delete histórico** — milestones canceladas viram 🧊 com motivo, não somem.
