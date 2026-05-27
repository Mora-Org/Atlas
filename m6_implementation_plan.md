# M6 Fases 2 a 5 Unificadas — Publish Studio Frontend

Este plano delineia a arquitetura técnica para entregar o Publish Studio completo de forma unificada, com base no handoff de design (Claude 2026-05-18).

## Objetivo da Entrega
Substituir a versão de mock na página de publicação do admin por um fluxo real envolvendo **Aparência**, **Conteúdo** e **Publicação**. O editor manterá um "rascunho" dinâmico que reflete num live-preview. Apenas quando o admin clicar em "Publicar", a versão oficial será enviada ao backend, alimentando o endpoint público `/{slug}`. O recurso de Export (baixar o site, db e back em ZIP) também será coberto.

## Estrutura de Arquivos no Frontend

A nova estrutura isola a complexidade de publicação em um diretório dedicado aos componentes e lógicas da feature, limpando o `page.tsx` principal.

### Store de Rascunho
- `frontend/src/stores/usePublishStore.ts` (ou em `contexts/`, veja Open Questions)

### Componentes de Publish
- `frontend/src/components/publish/PublishStudio.tsx`: Container principal, gerencia as Tabs e persistência.
- `frontend/src/components/publish/AppearanceTab.tsx`: Configuração de Theme (tipografia, cores).
- `frontend/src/components/publish/ContentTab.tsx`: Tabela de curadoria (seleção, ordenação e layout — list, grid, essay).
- `frontend/src/components/publish/PublishTab.tsx`: Visão de versões (histórico, active version e publish/rollback).
- `frontend/src/components/publish/ExportReview.tsx`: Cards de opções para exportação do site e DB.
- `frontend/src/components/publish/PublicSite.tsx`: Renderer agnóstico — componente visual principal consumido tanto no live-preview quanto no site público final.

### Rotas Atualizadas
- `frontend/src/app/admin/publish/page.tsx`: Entrypoint do Admin. Inicializa o store e monta o `PublishStudio`.
- `frontend/src/app/[workspace]/page.tsx`: Entrypoint do site publicado. Busca os dados no bucket do snapshot gerado na Fase 1 e repassa as props estáticas para o `PublicSite`.

---

## Modelo de Estado do Rascunho (Store)

Para gerenciar o preview instantâneo sem poluir as requisições, usaremos um store reativo compartilhado pelas Tabs.

```typescript
type LayoutType = 'list' | 'grid' | 'essay';

interface TableSelection {
  table_id: string;
  order: number;
  layout: LayoutType;
}

interface PublishDraftState {
  // Estado local e sujo (modificável nas tabs)
  theme_config: any; // Shape opaco do backend
  tables: TableSelection[];
  hero_content: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  
  // Controle de Publicação
  is_dirty: boolean;
  active_version_id: string | null;
  
  // Actions
  setThemeConfig: (config: any) => void;
  updateTableSelection: (tables: TableSelection[]) => void;
  updateHeroContent: (content: any) => void;
  
  // Async calls
  loadDraftFromBackend: () => Promise<void>;
  publishChanges: () => Promise<void>;
  rollbackToVersion: (version_id: string) => Promise<void>;
}
```

**Edit Inline (Hero):** 
Na aba de preview, os itens do Hero serão `contentEditable`. Para evitar problemas de rendering massivo ao digitar, enviaremos atualizações com _debounce_ ao store via `updateHeroContent()`. Se o renderer estivar carregado na rota pública, `contentEditable` recebe `false`.

---

## Fluxo de Dados: Rascunho → Publicação

1. **Setup Inicial:** O `PublishStudio` é montado, chama `loadDraftFromBackend()` que faz fetch no `GET /api/publications/me/versions/active` (ou do rascunho persistido, se houver lógica no back para draft).
2. **Edição Live:** O admin altera dados. O Store reflete a mudança imediata no `PublicSite` (em modo preview). A flag `is_dirty` passa a `true`, habilitando o botão superior de "Publicar mudanças".
3. **Commit (Publish):** O admin clica em Publicar. O store junta o `theme_config`, o `hero_content` e o `table_selection` formatado e dispara `POST /api/publications/me/versions`. O backend gera o Snapshot final no bucket. `is_dirty` vira `false`.

---

## Integração do PublicSite Shared Component

A flexibilidade exigida pelo design é mantida pelo `PublicSite` através de simples injeção de dependência:

```tsx
<PublicSite 
  themeConfig={store.theme_config} 
  tables={store.tables}
  heroContent={store.hero_content}
  isEditable={true} // Em admin/publish
/>
```

No NextJS App Router em `/app/[workspace]/page.tsx`, o Server Component fará o Fetch do Storage (Blob JSON), bypassando completamente o banco de dados principal de produção, e entregando ao renderer:

```tsx
// Server component em public route
const snapshot = await fetchSnapshotFromStorage(slug);
return <PublicSite {...snapshot} isEditable={false} />;
```

---

## Export Review (Fase 5)
O design requer baixar um pacote ZIP do site contendo Front (Estático), Back e DB. 
- Gerar o pacote client-side seria inseguro e complexo para arquivos binários grandes. 
- **O caminho sugerido:** O componente UI passará um array de flags marcadas (ex: `['front', 'db']`) para um endpoint a ser criado no Backend (ex: `POST /api/publications/me/export`). O backend compila os artefatos baseados no snapshot, empacota e entrega um `application/zip` de volta para download.

---

## Sequenciamento de PRs Recomendado

Fatiando a entrega em 4 PRs limpos e progressivos:

### PR 1: Prequel — Limpeza M6 (Bugs)
- Resolve os três problemas pendentes citados na memória (DELETE admin 500, FK cascade, schema tenant zumbi).
- Prepara terreno limpo para as novas implementações.

### PR 2: Store e Estrutura Básica do Publish Studio
- Criação do layout e das Tabs em `/admin/publish`.
- Criação do Store (draft local).
- Mapeamento das Tabs (Aparência, Conteúdo e Publicação) para ler/escrever no store, porém ainda usando placeholders visuais ou UIs simples.

### PR 3: Renderer Vivo (PublicSite) e Controles de Tema/Conteúdo
- Implementação real do componente compartilhado `PublicSite`.
- Conexão do `PublicSite` com o Store do modo live-preview no admin.
- Controles finos da aba Aparência e drag-and-drop / select da aba Conteúdo injetando os dados reais no layout de preview.

### PR 4: Fechamento — API Integration, Rota Pública e Exportação
- Ligar botão "Publicar" ao endpoint `POST` real do backend (activate de versão).
- Criação da página pública em Next.js lendo o snapshot publico.
- Histórico de versões e rollback na aba de publicação.
- Integração da tab "ExportReview" com endpoint do backend e testes E2E do zip final.
