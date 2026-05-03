# Tasks — Milestone 5: Atlas Redesign

> **Plano:** [.speckit/plans/M5_atlas_redesign.md](../plans/M5_atlas_redesign.md) — leia inteiro antes de começar, em especial a seção **Read-before-task** no fim.
> **Bundle:** [planning/design_archive/atlas-2026-04-30/](../../planning/design_archive/atlas-2026-04-30/)
> **Convenção:** `[ ]` pendente · `[~]` em andamento · `[x]` concluído. Marcar progresso à medida que executa.

---

## 🗄️ Fase 0 — Backend leve (PR #0)

**Objetivo:** adicionar `workspace_name`/`workspace_slug` em `users` + `meta` em `GET /api/tables`. Não toca prefixo de tenant.

- [x] **T0.1** — `backend/models.py`: `workspace_name` + `workspace_slug` adicionados ao model `User`.
- [x] **T0.2** — `backend/main.py` `_safe_migrate`: ALTER TABLE idempotente para as duas colunas.
- [x] **T0.3** — `backend/auth.py`: helper `_user_dict()` + `_slugify()`, login/QR retornam workspace fields com fallback. `GET /api/auth/me` novo em `main.py`.
- [x] **T0.4** — `backend/main.py`: `PATCH /api/admins/me/workspace` com validações (slug regex, unique, reservados, 403 pra master).
- [x] **T0.5** — `backend/schemas.py` `TableMeta` + `TableResponse.meta`. `GET /tables/` enriquecido com `row_count`, `column_count`, `relation_count`.
- [x] **T0.6** — `backend/tests/test_workspace_fields.py` criado (8 testes).
- [x] **T0.7** — `backend/tests/test_tables.py`: `test_tables_list_includes_meta` adicionado.
- [x] **T0.8** — pytest: **47 passed, 0 failed**. ✓
  - _Bônus: corrigido bug pré-existente de isolamento em `conftest.py` — `_drop_tenant_tables()` limpa tabelas físicas `t{id}_*` entre testes._
- [x] **T0.9** — [.speckit/constitution.md](../constitution.md) §4 atualizado: `workspace_name` + `workspace_slug` documentados.
- [x] **T0.10** — Commit, push, PR #0 "feat(backend): workspace editorial fields + tables meta". → [PR #1](https://github.com/Mora-Org/Atlas/pull/1)

---

## 🧱 Fase 1 — Fundação (PR #1)

### Tokens & Fontes
- [x] **T1.1** — Substituir `frontend/src/app/globals.css` pelos tokens Mora (copiar §1–§7 de `planning/design_archive/atlas-2026-04-30/project/tokens.css` + bridge `@theme inline` pra Tailwind 4).
- [x] **T1.2** — Em `frontend/src/app/layout.tsx`, trocar `Inter` por `Fraunces` + `IBM_Plex_Sans` + `IBM_Plex_Mono` via `next/font/google`. Aplicar `${fraunces.variable} ${plexSans.variable} ${plexMono.variable}` no `<html>`.
- [x] **T1.3** — Reescrever `frontend/src/components/ThemeContext.tsx` para `Accent = 'goldenrod'|'sage'|'ruby'|'nectar'` × `Mode = 'light'|'dark'`. Usar `data-theme` + `data-accent` no `<html>`. Persistir em `localStorage` (`mora-theme`, `mora-accent`).
- [x] **T1.4** — Atualizar `frontend/src/components/ThemeSwitcher.tsx` para os novos 4 acentos × 2 modos. Pílula fixa bottom-right.

### Primitivos UI
- [x] **T1.5** — Criar `frontend/src/components/ui/Icon.tsx` com `ICON_PATHS` copiado de `planning/design_archive/atlas-2026-04-30/project/primitives.jsx`.
- [x] **T1.6** — Criar `frontend/src/components/ui/Eyebrow.tsx`.
- [x] **T1.7** — Criar `frontend/src/components/ui/Hairline.tsx`.
- [x] **T1.8** — Criar `frontend/src/components/ui/Button.tsx` (variants: primary, secondary, ghost, danger, link).
- [x] **T1.9** — Criar `frontend/src/components/ui/Pill.tsx` (tones: accent, muted, ok, warn, err, master, admin, moderator).
- [x] **T1.10** — Criar `frontend/src/components/ui/Card.tsx`.
- [x] **T1.11** — Criar `frontend/src/components/ui/Field.tsx` + `Input` + `Select` + `Textarea`.
- [x] **T1.12** — Criar `frontend/src/components/ui/SectionNum.tsx`.
- [x] **T1.13** — Criar `frontend/src/components/ui/index.ts` com re-exports.

### QA da Fundação
- [x] **T1.14** — Criar `frontend/src/app/_dev/tokens/page.tsx` (Storybook lite): paleta + tipografia + cada primitivo em todas as variantes.
- [ ] **T1.15** — Verificar manualmente: `npm run dev`, abrir `/_dev/tokens`, alternar `data-theme` e `data-accent` via devtools — todos os primitivos respondem corretamente.
- [ ] **T1.16** — `npm run build` deve passar sem erros.
- [ ] **T1.17** — Confirmar que rotas existentes (login, /admin/tables, /dashboard, etc.) **não quebram** — vão parecer feias, mas funcionam.
- [x] **T1.18** — Commit, push, abrir PR #1 "feat(frontend): mora design tokens + editorial primitives". → [PR #2](https://github.com/Mora-Org/Atlas/pull/2)

---

## 🎨 Fase 2 — Telas-Chave (PR #2)

### Sidebar & Layout
- [ ] **T2.1** — Reescrever `frontend/src/app/admin/layout.tsx` com sidebar Mora (workspace card no topo, nav agrupada, user pill no rodapé). Visibilidade por role.

### Login (Tela 01)
- [ ] **T2.2** — Reescrever `frontend/src/app/login/page.tsx` (origem: `LoginScreen` em `planning/design_archive/atlas-2026-04-30/project/screens-1.jsx`).
- [ ] **T2.3** — Manter wiring atual de `useAuth()`. Tabs: senha · QR · magic. OAuth Google/GitHub.
- [ ] **T2.4** — QR tab → CTA pra `/admin/qr-auth` (modal opcional, decidir durante implementação).

### Tables Index (Tela 02)
- [ ] **T2.5** — Reescrever `frontend/src/app/admin/tables/page.tsx` (origem: `TablesIndex` em `planning/design_archive/atlas-2026-04-30/project/screens-1.jsx`).
- [ ] **T2.6** — Layout magazine + alternativa grid de cards. Toggle persistente em `localStorage`.
- [ ] **T2.7** — Negociar com Gemini: adicionar `meta: { row_count, column_count, relation_count }` em `GET /api/tables`. Se inviável, fallback N+1.

### Data Grid (Tela 04)
- [ ] **T2.8** — Reescrever `frontend/src/app/admin/data/[table]/page.tsx` (origem: `DataGrid` em `planning/design_archive/atlas-2026-04-30/project/screens-2.jsx`).
- [ ] **T2.9** — Modo denso (tabela com hairlines, tabular nums, FK chips) + modo cards (pull-quote layout). Toggle no header.
- [ ] **T2.10** — Edição inline: clique 2× → `<input>` autosize, Enter salva (`PUT /api/{table}/{id}`), Esc cancela.
- [ ] **T2.11** — Densidade controlada por CSS var `--row-height` lendo do `TweaksContext` (mesmo que ainda sem UI de tweak — Fase 3).

### Dashboard (Tela 07)
- [ ] **T2.12** — Reescrever `frontend/src/app/dashboard/page.tsx` (origem: `PublicDashboard` em `planning/design_archive/atlas-2026-04-30/project/screens-4.jsx`).
- [ ] **T2.13** — Masthead capa-de-revista, destaques (3-col), strip de números, agenda, colofão.
- [ ] **T2.14** — Embrulhar widgets atuais ([BarChartWidget](../../frontend/src/components/widgets/BarChartWidget.tsx)) no chrome novo.

### QA Fase 2
- [ ] **T2.15** — Smoke test manual: login → tabelas → criar registro → editar inline → ver no dashboard. Tudo funcional.
- [ ] **T2.16** — Lighthouse perf ≥ 85 em `/dashboard` e `/admin/tables`.
- [ ] **T2.17** — Trocar tema/acento e verificar reflow em todas as 4 telas.
- [ ] **T2.18** — Commit, push, abrir PR #2 "feat(frontend): redesign login + tables + datagrid + dashboard".

---

## 🛠️ Fase 3 — Restante + Tweaks Panel (PR #3)

### TweaksContext
- [ ] **T3.1** — Criar `frontend/src/contexts/TweaksContext.tsx` (density, terminology, personaOverride). Wrap em `layout.tsx`.

### Telas restantes
- [ ] **T3.2** — Schema Editor (`frontend/src/app/admin/tables/create/page.tsx`) — origem `SchemaEditor` em `screens-2.jsx`.
- [ ] **T3.3** — Import SQL (`frontend/src/app/admin/import/sql/page.tsx`) — origem `ImportSQL` em `screens-3.jsx`.
- [ ] **T3.4** — Import Sheet (`frontend/src/app/admin/import/data/page.tsx`) — origem `ImportSheet` em `screens-3.jsx`.
- [ ] **T3.5** — Moderadores (`frontend/src/app/admin/users/page.tsx`) — origem `ModeratorsScreen` em `screens-3.jsx`.
- [ ] **T3.6** — Grupos (`frontend/src/app/admin/groups/page.tsx`) — origem `GroupsScreen` em `screens-4.jsx`.
- [ ] **T3.7** — QR Auth (`frontend/src/app/admin/qr-auth/page.tsx`) — origem `QRAuthScreen` em `screens-4.jsx`.
- [ ] **T3.8** — Master Panel (`frontend/src/app/admin/admins/page.tsx`) — origem `MasterPanel` em `screens-4.jsx`.
- [ ] **T3.9** — Explore (`frontend/src/app/explore/page.tsx`) — origem `ExploreScreen` em `screens-4.jsx`.
- [ ] **T3.10** — Theme Studio + Publish (NOVA: `frontend/src/app/admin/publish/page.tsx`) — origem `ThemeStudio` + `PublishConfirm` + `ExportFormat` + `ExportedPackages` em `screens-5.jsx`. **Mock visual** — botões de download desabilitados.
- [ ] **T3.11** — Site Público (NOVA: `frontend/src/app/[workspace]/page.tsx`) — origem `PublicSite` em `screens-5.jsx`. Read-only, consome `/api/public/*`.

### Tweaks Panel
- [ ] **T3.12** — Criar `frontend/src/components/TweaksPanel.tsx` (origem: `planning/design_archive/atlas-2026-04-30/project/tweaks-panel.jsx`). Botão flutuante + drawer lateral.
- [ ] **T3.13** — Expor: persona override (dev), densidade, terminologia, acento, modo. **Não** incluir workspace switcher.
- [ ] **T3.14** — Visibilidade: dev sempre, prod via `localStorage.mora-tweaks-enabled = '1'`.

### QA Fase 3
- [ ] **T3.15** — Smoke test todas as rotas redesenhadas.
- [ ] **T3.16** — Lighthouse perf ≥ 85 nas rotas públicas.
- [ ] **T3.17** — `npm run build` + `npm run lint` limpos.
- [ ] **T3.18** — Pedir ao Diretor pra rodar TestSprite — smoke tests do M2 não devem regredir.
- [ ] **T3.19** — Commit, push, abrir PR #3 "feat(frontend): redesign remaining screens + tweaks panel".

---

## 📦 Encerramento

- [ ] **TF.1** — Atualizar [planning/patch_notes.md](../../planning/patch_notes.md) com entrada `v1.3.0 — Atlas Redesign`.
- [ ] **TF.2** — Marcar M5 como concluído em [planning/plano_atual.md](../../planning/plano_atual.md).
- [ ] **TF.3** — Mover `atlas/` para `planning/design_archive/atlas-2026-04-30/` (referência histórica) ou deletar — decidir com o Diretor.

---

## 🚦 Convenções de Execução

- **Uma fase por PR.** Não misturar.
- **Diretor aprova cada PR antes da próxima fase começar.** A Fundação pode ser merged sem que Fase 2 esteja pronta.
- **Sem regressões funcionais.** Cada tela redesenhada precisa preservar o que ela já fazia. Se uma feature do design não tem backend correspondente, vira mock visual marcado.
- **Não escrever testes novos no frontend nesta milestone.** Testes ficam pra TestSprite no backend; QA visual é manual + Lighthouse.
- **Comments só onde o porquê é não-óbvio.** Não comentar "isto é o tokens semântico" — o código fala.

## 🤖 Para a IA Programadora (Sonnet ou outra)

**Antes de começar qualquer task, leia [o plano técnico inteiro](../plans/M5_atlas_redesign.md), especialmente a seção `🤖 Read-before-task`** que mapeia cada task → arquivo do bundle a consultar.

**Regras de ouro:**
1. O JSX em `planning/design_archive/atlas-2026-04-30/project/screens-*.jsx` **é a especificação visual**. O plano resume; o JSX detalha.
2. Não copie a arquitetura interna do protótipo (Babel-in-browser, globals reassinaveis, dados mockados em `data.jsx`). Use React 19/TS idiomático com fetch real e `useAuth()`.
3. Densidade controlada via CSS var `--row-height` no container, não props.
4. Backgrounds/fonts/borders editoriais via `style={{ background: 'var(--bg-surface)' }}` e similares, não Tailwind utilities.
5. Workspace switcher do protótipo **NÃO existe na versão real** — admin logado tem 1 workspace (do `/api/auth/me`).
6. Quando o protótipo tem feature sem backend (ex: tabelas `featured`, agenda de retiros), use mock estático com `// TODO(M6): wire to backend`. Não invente endpoints.
