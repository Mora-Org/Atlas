# 🎨 Milestone 5 — Atlas Redesign (Mora Editorial Identity)

> **Status:** 🔨 Em andamento — Fase 0 ✅ concluída · Fase 1 pendente
> **Origem:** handoff bundle de Claude Design (claude.ai/design) recebido em 2026-04-30, contendo 13 telas de protótipo sob a identidade editorial Mora.
> **Tipo:** Frontend pesado + Fase 0 leve no backend (workspace fields + tables meta, sem renomear tenant).

## 🎯 Visão
Migrar todo o frontend Next.js do tema dark/blue genérico para a **identidade editorial Mora** ("Editorial vintage. Densidade com respiro. Tecnologia com alma.") — paleta Parchment/Midnight × 4 acentos, tipografia Fraunces + IBM Plex, componentes com cara de revista impressa.

## 📚 Documentos Relacionados
- **Spec:** [.speckit/specs/M5_atlas_redesign.md](../.speckit/specs/M5_atlas_redesign.md) — o que & por quê
- **Plano técnico:** [.speckit/plans/M5_atlas_redesign.md](../.speckit/plans/M5_atlas_redesign.md) — arquivos a criar/modificar
- **Tasks:** [.speckit/tasks/M5_atlas_redesign.md](../.speckit/tasks/M5_atlas_redesign.md) — checklist atômico (~50 tasks)
- **Bundle de design:** [planning/design_archive/atlas-2026-04-30/](./design_archive/atlas-2026-04-30/) (já arquivado no repo)

## 🧭 Fases (1 PR cada)

### Fase 0 — Backend leve ✅
**Escopo:** `workspace_name`/`workspace_slug` em `users` (com fallback no `/api/auth/me`), endpoint `PATCH /api/admins/me/workspace`, `meta: {row_count, column_count, relation_count}` em `GET /api/tables`. Migração não-destrutiva.
**Resultado:** 47 passed, 0 failed. Bônus: bug de isolamento de testes pré-existente corrigido em `conftest.py`.
**Pendente:** commit/PR #0 (T0.10).

### Fase 1 — Fundação
**Escopo:** tokens Mora em `globals.css`, fontes via `next/font/google`, ThemeContext reescrito (4 acentos × 2 modos), 8 primitivos editoriais em `components/ui/`.
**Critério de aceite:** rotas existentes não quebram, `data-theme`/`data-accent` funcionam, build passa.
**Tamanho estimado:** ~10 arquivos, PR pequeno.

### Fase 2 — Telas-Chave
**Escopo:** redesign de Login + Tables Index + Data Grid + Dashboard + sidebar `<AdminLayout>`. ~80% do tempo de uso.
**Critério de aceite:** sem regressão funcional, Lighthouse ≥ 85, switcher de tema funciona.
**Tamanho estimado:** PR médio.

### Fase 3 — Telas Restantes + Tweaks Panel
**Escopo:** Schema Editor, Import SQL/Sheet, Moderadores, Grupos, QR Auth, Master Panel, Explore, Theme Studio (mock), Site Público (mock), Tweaks Panel flutuante.
**Critério de aceite:** todas as rotas redesenhadas, TestSprite sem regressões.
**Tamanho estimado:** PR maior.

## ✅ Decisões Tomadas
1. **Workspace no backend:** opção light — `workspace_name`/`workspace_slug` em `users`, sem renomear `tenant`/`admin_id`. Constituição §2 intacta. ✓
2. **Backend meta em /api/tables:** sim, entra na Fase 0. ✓
3. **Theme Studio + Publish:** mock visual em M5; implementação real fica pra M6. ✓
4. **Bundle de design:** arquivado em `planning/design_archive/atlas-2026-04-30/`. ✓
5. **`lucide-react` vs ícones do protótipo:** copiar paths SVG do protótipo (consistência visual com o design); revisitar se bundle ficar pesado.

## 🔗 Dependências
- **Não bloqueia** M3 (RLS migration) nem M4 (auth unification) — esta milestone roda em paralelo.
- **Bloqueia** lançamento público pra clientes não-técnicos (centros culturais, bibliotecas) — sem essa identidade visual o produto parece um Retool genérico.

## ⚠️ Riscos
- **Tailwind 4 + CSS vars custom:** o bridge `@theme inline` é frágil; plano B é não usar utilities Tailwind nas telas redesenhadas.
- **Bundle de fontes:** Fraunces variable + Plex 5 weights pode pesar; subset latin + `display: 'swap'` mitiga, mas tem que medir após `next build`.
- **Escopo grande:** 13 telas em 3 fases ≈ várias sessões de trabalho. PRs faseados protegem o Diretor de revisar tudo de uma vez.

## ✅ Definição de Pronto
1. Todas as 9 rotas existentes redesenhadas + 2 novas (`/admin/publish`, `/[workspace]`).
2. Tweaks panel funcional (dev + override em prod via `localStorage`).
3. `npm run build` + `npm run lint` limpos.
4. Lighthouse perf ≥ 85 em rotas públicas.
5. TestSprite re-roda smoke tests do M2 sem regressão.
6. Patch notes atualizados (`v1.3.0 — Atlas Redesign`).
