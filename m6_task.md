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
- `[ ]` Extrair tokens e estilos do handoff
- `[ ]` Criar o componente compartilhado `PublicSite.tsx`
- `[ ]` Conectar aba "Aparência" ao store e ao preview
- `[ ]` Conectar aba "Conteúdo" (Tabelas) ao store e preview

## PR 4: Publicação Real e Integração
- `[ ]` Conectar botão "Publicar" ao `POST /api/publications/me/versions`
- `[ ]` Criar rota dinâmica `app/[workspace]/page.tsx` para consumir do bucket
- `[ ]` Adicionar histórico / rollback
- `[ ]` Adicionar tab "ExportReview" e endpoint backend para ZIP (Fase 5)
