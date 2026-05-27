# M6 Publish Studio Implementation Tasks

## PR 1: Prequel (Bugfixes)
- `[x]` Fix DELETE admin 500
- `[x]` Fix FK cascade issue
- `[x]` Fix schema tenant zumbi issue

## PR 2: Store e Estrutura Básica
- `[x]` Criar `usePublishStore.ts` (Zustand ou Context)
- `[x]` Montar estrutura de pastas `frontend/src/components/publish/`
- `[x]` Implementar base do `PublishStudio.tsx` com Tabs
- `[x]` Mapear componentes do handoff para as Tabs

## PR 3: Renderer Vivo (PublicSite) e Controles
- `[x]` Extrair tokens e estilos do handoff (reaproveitados de `globals.css` — design system já estava lá)
- `[x]` Criar o componente compartilhado `PublicSite.tsx` (hero contentEditable + 3 layouts list/grid/essay + footer)
- `[x]` Conectar aba "Aparência" ao store e ao preview (4 presets + cores + tipografia + layout)
- `[x]` Conectar aba "Conteúdo" (Tabelas) ao store e preview (lista tabelas via `GET /tables/`, seleção, ordem, layout-per-table)
- `[x]` PublishStudio: topbar editorial + 3 tabs + preview chrome com toggles de layout (list/grid/essay) e viewport (desk/tablet/mobile)
- `[x]` Carregar fonts extras (IBM Plex Serif, EB Garamond, Inter) via `next/font/google`

## PR 4: Publicação Real e Integração
- `[ ]` Conectar botão "Publicar" ao `POST /api/publications/me/versions`
- `[ ]` Criar rota dinâmica `app/[workspace]/page.tsx` para consumir do bucket
- `[ ]` Adicionar histórico / rollback
- `[ ]` Adicionar tab "ExportReview" e endpoint backend para ZIP (Fase 5)
