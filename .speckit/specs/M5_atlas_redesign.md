# Spec — Milestone 5: Atlas Redesign (Mora Editorial Identity)

> **Status:** 📝 rascunho — aguardando aprovação do Diretor
> **Origem:** handoff bundle de Claude Design (claude.ai/design), arquivado em [planning/design_archive/atlas-2026-04-30/](../../planning/design_archive/atlas-2026-04-30/) — 13 telas mockadas em HTML/CSS/JS sob a identidade editorial Mora.
> **Substitui:** sistema de tema atual em [ThemeContext.tsx](../../frontend/src/components/ThemeContext.tsx) (6 acentos × 4 modos genéricos HSL).

---

## 🎯 Objetivo
Migrar todo o frontend Next.js do **tema dark/blue genérico** para a **identidade editorial Mora** ("Editorial vintage. Densidade com respiro. Tecnologia com alma."): paleta Parchment/Midnight × 4 acentos (goldenrod, sage, ruby, nectar), tipografia Fraunces + IBM Plex, componentes com cara de revista impressa.

## 🧭 Por Que Agora
- O backend M2 está pronto (CRUD dinâmico + FKs + import SQL); o frontend é o último gargalo entre o produto e usuários reais (centros culturais, igrejas, bibliotecas — clientes não-técnicos).
- A identidade editorial Mora **distingue** o Atlas de painéis admin genéricos (Retool, Directus) e materializa a tese da casa-mãe Mora.
- M3 (RLS migration) e M4 (auth unification) são back-end heavy — fazer a UI agora dá tempo de iterar visualmente antes que o stack mude por baixo.

## ✨ O Que o Usuário Final Vai Ver

### Diretor / Admin (autenticado)
1. **Login editorial** — capa de revista, com QR code + magic link + OAuth como rotas alternativas.
2. **Sidebar Mora** — workspace card no topo (com switcher), nav agrupada (Workspace / Conteúdo / Acesso / Sistema), user pill no rodapé.
3. **Tables Index** — layout magazine (linhas editoriais com eyebrow, descrição, contagem, ações) + alternativa em grid de cards.
4. **Schema Editor** — lista de colunas + inspetor lateral + SQL preview ao vivo.
5. **Data Grid** — modo denso editorial **e** modo cards de leitura, edição inline (clique 2×), densidade controlada por tweak.
6. **Importar (SQL + planilha)** — dry-run com badges status, bloqueio de destrutivos, mapeamento auto-tipo.
7. **Moderadores** — lista + matriz de permissões com herança visual (escrever exige ler, etc).
8. **Grupos (Capítulos)** — agrupa tabelas pra navegação e permissões em bloco.
9. **QR Auth** — código com countdown + lista de sessões ativas.
10. **Painel Master** — KPIs + tabela de workspaces com quotas (visível só pra master).
11. **Theme Studio + Publish** — admin escolhe fontes/cores/layout do site público; publica em `slug.atlas` ou exporta pacotes (front/back/db).

### Pesquisador / Visitante (não-autenticado)
12. **Site Público** — hero editorial, busca, filtro por categoria, lista de registros, drawer de detalhe. Cada workspace gera seu próprio site (centrobudista.atlas, biblioteca.atlas, igreja.atlas).
13. **Explore** — busca cross-workspaces.

### Tweaks Globais (toolbar flutuante)
- **Persona** (master/admin/moderator) — muda sidebar e telas disponíveis.
- **Densidade do data grid** (compact / regular / loose).
- **Terminologia** (tabela ↔ coleção) — ao vivo no chrome.
- **Acento** (4) + **modo** (claro/escuro) — pílula de tema fixa no canto.
- **Workspace** (centro budista / igreja / biblioteca) — só pra demos.

## 🚧 Fora do Escopo (Não-Goals)
- **Não** renomear `tenant`/`admin_id` no backend (Constituição §2 — prefixo `t{admin_id}_` permanece). Backend só ganha campos editoriais novos (`workspace_name`, `workspace_slug`) e o `meta` na response de `/api/tables` — ver Plano §0.
- **Não** rodar o site público real (publicação fica como mock visual; o backend que faz o serve já existe em `/api/public/*`).
- **Não** implementar Theme Studio funcional — fica como **mock visual** nesta milestone, real vai pro M6.
- **Não** implementar exportação real de pacotes (mock visual com botões de download desabilitados).
- **Não** quebrar a paridade funcional atual: cada tela atual continua funcionando; só muda a apresentação.

## ✅ Critérios de Aceite
1. Todas as 9 rotas existentes ([login](../../frontend/src/app/login/page.tsx), [admin/tables](../../frontend/src/app/admin/tables/page.tsx), [admin/data](../../frontend/src/app/admin/data/[table]/page.tsx), [admin/import/sql](../../frontend/src/app/admin/import/sql/page.tsx), [admin/import/data](../../frontend/src/app/admin/import/data/page.tsx), [admin/users](../../frontend/src/app/admin/users/page.tsx), [admin/groups](../../frontend/src/app/admin/groups/page.tsx), [admin/qr-auth](../../frontend/src/app/admin/qr-auth/page.tsx), [dashboard](../../frontend/src/app/dashboard/page.tsx), [explore](../../frontend/src/app/explore/page.tsx)) renderizam com a identidade Mora **sem regressão funcional**.
2. Backend tem `workspace_name` + `workspace_slug` em `users` (admins) e os retorna no `/api/auth/me` + `/api/admins`. Migração não-destrutiva (default = nome do admin).
3. Backend retorna `meta: {row_count, column_count, relation_count}` em `GET /api/tables`.
4. Tokens novos coexistem com Tailwind 4 sem conflito (via `@theme inline` em [globals.css](../../frontend/src/app/globals.css)).
5. Switcher de tema (`data-theme` × `data-accent`) funciona em todas as rotas e persiste em `localStorage`.
6. Tipografia Fraunces + IBM Plex carrega via `next/font/google` (não via `@import url(...)` em CSS — penalty de FOIT).
7. Build passa (`npm run build` no frontend) sem novos warnings de tipo.
8. Lighthouse perf ≥ 85 nas rotas redesenhadas (token CSS é leve, mas Fraunces variable + IBM Plex são caros — precisa de subset).
