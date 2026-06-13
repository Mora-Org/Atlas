# M7.5 — Componentização & Polish Fino (Shell / Schema Editor / Import)

> **Status:** 🧊 CONGELADO 2026-06-13 — reavaliado e rebaixado de milestone pra **1 PR frontend-puro**. Descongela como PR de baixo risco (candidato a paralelo) quando houver janela.
> **Histórico:** nasceu como *"Editorial Pass — fecha telas com look antigo"*. Auditoria ultracode (2026-06-13) mostrou que **não há look antigo**; renomeado e congelado pelo Diretor.
> **Convenção de status:** ✅ feito · 🟡 draft/rebate · 📋 planejado · 🧊 congelado.

## O problema

A justificativa original do roadmap — "fecha as telas internas que ficaram com o look antigo" — está factualmente **errada**: não existe look antigo. `layout.tsx`, `tables/create/page.tsx`, `import/sql/page.tsx` e `import/data/page.tsx` já renderizam 100% em tokens Mora (font-display, Eyebrow, Hairline, Card, Pill, SectionNum). O reskin macro o **M5 já fez**. Auditando o handoff (`screens-1/2/3.jsx`) contra o código atual, o que sobra não é "tela velha → Mora", é **"Mora-v1 → reshuffle de layout Mora-v4"** misturado com features de produto contrabandeadas dentro de um "pass editorial". O M7.5 **mudou de natureza** — daí o congelamento + renome.

## Estado atual por área

- **Shell** (sidebar) — **delta-pequeno, real.** Único delta concreto era o workspace card virar switcher (handoff `screens-1.jsx:47-65` cicla dados de demo) vs card estático atual (`layout.tsx:123-164`) — **descartado** (afordância sem backend). Resto é cosmética (avatar redondo tingido por persona, badge de role no rodapé, copy `v.1`→`v.4`). O "topbar" prometido no comentário `screens-1.jsx:7` **não existe** no handoff.
- **Schema Editor** (`tables/create/page.tsx`) — **delta-médio, mas era produto disfarçado.** Os 5 "deltas" eram reshuffle de layout + mudança de data-model (FK/JSON como tipo). O atual já tem FK-as-flag + `fk_table` + `fk_column` ligado ao `POST /api/relations` (`create/page.tsx:322-348`) — **mais completo** que o handoff. Handoff aqui = regressão. **Rejeitado.**
- **Import** (`import/sql` + `import/data`) — **delta-médio, continha feature net-new.** O delta de planilha (mapeamento + criar tabela a partir da planilha, `screens-3.jsx:230-284`) exige endpoint inexistente. **Movido pro M8.** O split-pane SQL do handoff perde o passo "resultado" do wizard atual — **rejeitado** (mantém wizard).

## O que sobra de real (o conteúdo do PR, quando descongelar)

**Cosmético — baixo risco:**
- Avatar quadrado mono → círculo tingido por persona + iniciais itálicas (`layout.tsx:205-242` vs `screens-1.jsx:85-99`).
- Mover indicador de role do card de workspace pro rodapé do usuário (`layout.tsx:138` vs `screens-1.jsx:97`).
- Copy do subtítulo da marca: `mora · v.1` → `v.4 — outono` (`layout.tsx:117-119` vs `screens-1.jsx:37`).
- Hint de tipo (subtítulo itálico) no inspetor do schema editor (`screens-2.jsx:157-159`) — falta hoje.

**Componentização — dedupe de código atual, baixo risco:**
- Extrair `Toggle` pra `@/components/ui` (hoje inline em `create/page.tsx:376-407`; `ui/` não exporta).
- Extrair `ScreenHeader`/Folio compartilhado (folio + eyebrow + title display + sub italic + actions) — cada página admin monta o próprio à mão; `ui/` só tem `SectionNum`.
- Extrair primitivo de **caixa-métrica** (Stat-com-caixa), duplicado em `sql/page.tsx:318-338` e `data/page.tsx:275-295`. **Cuidado:** não reusar o `ui/Stat.tsx` existente — visual diferente; é primitivo novo.
- Extrair `StepIndicator` (`sql/page.tsx:132-153` ≈ `data/page.tsx:89-110`) — **condicional**: o handoff nem usa stepper; só se mexer no import.

## Decisões — resolvidas no rebate (2026-06-13)

1. **Destino:** 🧊 **congelado com nome novo** (decisão do Diretor). Vira 1 PR de componentização + cosmética quando descongelar.
2. **Topbar horizontal:** ❌ não construir — é fantasma (handoff promete no comentário, não desenha).
3. **Workspace switcher:** ❌ descartado — afordância sem backend (1 user = 1 workspace).
4. **FK:** ✅ manter o atual (FK-flag + `fk_column`) — handoff é regressão.
5. **SQL:** ✅ manter o wizard de 3 passos — split-pane do handoff é downgrade.
6. **Import de planilha com criar-tabela:** ➡️ **movido pro M8** (rider — pede endpoint novo).
7. **Rota-landing `/admin/import`:** parkada com o congelamento — navegação atual (dois itens na sidebar) é o substituto.
8. **Editor de schema de tabela existente (`/admin/tables/[id]/edit`):** gap de produto **legítimo** (hoje só existe `create`). Não é editorial pass — **registrado no backlog do roadmap**.

## Tamanho provável (quando descongelar)

1 PR de **meia tarde a 1 dia**, frontend puro, risco baixo. Candidato a rodar em paralelo a alguma milestone de backend (a "regra de ouro" do roadmap permite paralelo em área diferente).
