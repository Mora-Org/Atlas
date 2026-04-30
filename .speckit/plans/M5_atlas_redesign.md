# Plan — Milestone 5: Atlas Redesign (Mora Editorial Identity)

> **Spec:** [.speckit/specs/M5_atlas_redesign.md](../specs/M5_atlas_redesign.md)
> **Bundle de origem:** [planning/design_archive/atlas-2026-04-30/](../../planning/design_archive/atlas-2026-04-30/) — 13 telas, primitives.jsx, tokens.css, data.jsx, screens-{1..5}.jsx, tweaks-panel.jsx
> **Status:** 📝 rascunho — Diretor revisa antes da Fase 1

---

## 🧱 Estratégia de Migração

**Princípio:** o protótipo é um **espelho de design**, não código de produção. Ele usa Babel-in-browser, globals reassinaveis, e dados mockados. **Não copio a estrutura interna** — eu copio a **saída visual** e implemento em React 19 + Next.js 16 + Tailwind 4 do jeito que faz sentido pra essa stack.

**4 fases independentes**, cada uma é um PR fechado e revisável:
- **Fase 0 — Backend leve (workspace fields + meta):** adiciona `workspace_name`/`workspace_slug` em `users` e `meta` em `GET /api/tables`. PR mínimo. **Não toca o prefixo `t{admin_id}_` da Constituição §2.**
- **Fase 1 — Fundação:** tokens, fontes, ThemeContext novo, primitivos editoriais. Sem mudar nenhuma tela. 1 PR pequeno, ~10 arquivos.
- **Fase 2 — Telas-chave (4 telas):** Login, Tables Index, Data Grid, Dashboard. ~80% do tempo de uso. 1 PR médio.
- **Fase 3 — Telas restantes + Tweaks Panel:** schema editor, import flows, moderators/users, master panel, qr-auth, groups, explore, theme studio (mock), public site (mock), tweaks panel flutuante. 1 PR maior.

Cada fase tem critério de aceite próprio e pode ser entregue/aprovada antes da próxima começar.

---

## 🗄️ Fase 0 — Backend (Workspace fields + tables meta)

**Por que existe:** o redesign editorial precisa de um nome de workspace ("Centro Budista do Brasil") e um slug pro site público (`centrobudista`) que hoje não existem na model `User`. Também precisa de contadores na lista de tabelas pra evitar N+1 no frontend. **Mudança não-destrutiva**, sem mexer no prefixo de tenant.

### [MODIFY] `backend/models.py` — `User` model
Adicionar dois campos opcionais ao `User` (válido só pra role `admin`):

```python
class User(Base):
    # ... campos existentes ...
    workspace_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # "Centro Budista do Brasil"
    workspace_slug: Mapped[Optional[str]] = mapped_column(String, nullable=True, unique=True)  # "centrobudista" (URL-safe)
```

### [MODIFY] `backend/main.py` — migração + endpoints
- **Migração leve em `_safe_migrate`:** `ALTER TABLE users ADD COLUMN workspace_name TEXT`, idem `workspace_slug TEXT`. Idempotente (try/except como já fazem outras migrações ali).
- **Default:** se `workspace_name` é `NULL` ao retornar do `/api/auth/me` ou `/api/admins`, usar `username` como fallback. Default de `workspace_slug` é `slugify(username)` no primeiro acesso.
- **Endpoint novo `PATCH /api/admins/me/workspace`:** admin atualiza seu próprio `workspace_name`/`workspace_slug`. Validações: slug único, regex `^[a-z0-9-]+$`, 3–32 chars, palavras reservadas bloqueadas (`api`, `admin`, `auth`, etc.).
- **Endpoint `GET /api/tables` enriquecido:** cada tabela retorna `meta: { row_count: int, column_count: int, relation_count: int }`. Implementação: 1 query agregada por tabela ou um `LEFT JOIN` em `_columns`/`_relations`. Aceitável fazer 3 queries pequenas — é admin endpoint, sem hot path.
- **`/api/auth/me` response:** incluir `workspace_name` + `workspace_slug` resolvendo defaults se NULL.

### [MODIFY] `backend/tests/`
- Novo `test_workspace_fields.py`: cria admin, GET /me retorna `workspace_name == username` (fallback), PATCH atualiza pra "Centro Budista do Brasil", GET de novo confirma. Slug duplicado retorna 409. Slug inválido retorna 400.
- `test_tables.py`: adicionar assert que `GET /api/tables` retorna `meta.row_count`, `meta.column_count`, `meta.relation_count` pra cada tabela.

### Critério de aceite Fase 0
- [ ] Migration roda em DB existente sem perda de dados.
- [ ] `pytest backend/` passa todos os testes (existentes + novos).
- [ ] `/api/auth/me` retorna workspace_name + workspace_slug com fallback funcional.
- [ ] `GET /api/tables` retorna `meta` em cada item.

---

---

## 📂 Fase 1 — Fundação (Tokens, Fontes, Tema, Primitivos)

### [MODIFY] `frontend/src/app/globals.css`
Substituir o conteúdo HSL atual pelo sistema editorial Mora. Manter compatibilidade com Tailwind 4 via `@theme inline`.

```css
@import "tailwindcss";

/* 1. Pigmentos brutos (ver planning/design_archive/atlas-2026-04-30/project/tokens.css §2) */
:root {
  --pigment-parchment: #FAEFD9;
  --pigment-vanilla-cream: #F0E7D5;
  --pigment-paper-deep: #E6DCC4;
  --pigment-midnight: #212842;
  --pigment-indigo-rain: #0D244D;
  --pigment-slate: #334553;
  --pigment-graphite: #4A5468;
  --pigment-goldenrod: #DAA63E;
  --pigment-goldenrod-deep: #A87A1F;
  --pigment-mustard: #EFB83E;
  --pigment-sage: #95A581;
  --pigment-sage-deep: #5F6E4D;
  --pigment-moss: #556B2F;
  --pigment-ruby: #852E47;
  --pigment-ruby-bright: #A33C5A;
  --pigment-nectar: #C2441C;
  --pigment-nectar-deep: #8E2F11;
}

/* 2. Tokens semânticos light (default) — copiar §3 de planning/design_archive/atlas-2026-04-30/project/tokens.css */
:root, [data-theme="light"] { /* ... bg-page, fg-primary, rule, accent, shadow-*, paper-grain ... */ }

/* 3. Dark — §4 */
[data-theme="dark"] { /* ... */ }

/* 4. Variants de acento — §5: [data-accent="goldenrod|sage|ruby|nectar"] */

/* 5. Type scale, spacing, radii — §6 */

/* 6. Tailwind 4 inline theme bridge */
@theme inline {
  --color-background: var(--bg-page);
  --color-foreground: var(--fg-primary);
  --color-surface: var(--bg-surface);
  --color-elevated: var(--bg-elevated);
  --color-accent: var(--accent);
  --color-rule: var(--rule);
  --color-muted: var(--fg-muted);
  --font-display: var(--font-display);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
}
```

**Custo:** ~470 linhas (cópia direta de [tokens.css](../../planning/design_archive/atlas-2026-04-30/project/tokens.css)) + ~15 linhas de bridge Tailwind.

### [MODIFY] `frontend/src/app/layout.tsx`
Trocar `Inter` por `Fraunces` + `IBM_Plex_Sans` + `IBM_Plex_Mono` via `next/font/google`.

```tsx
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', axes: ['opsz', 'SOFT'], variable: '--font-display' });
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['300','400','500','600','700'], display: 'swap', variable: '--font-sans' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400','500','600'], display: 'swap', variable: '--font-mono' });

// className no <html>: ${fraunces.variable} ${plexSans.variable} ${plexMono.variable}
```

**Não importar fontes via `@import url(googleapis...)` no CSS** — Next.js `next/font` faz subset + self-host + remove FOIT.

### [REPLACE] `frontend/src/components/ThemeContext.tsx`
Reescrita completa. De 6 acentos × 4 modos pra **4 acentos × 2 modos**, atributos no `<html>` em vez de `style.setProperty` (deixa o CSS fazer o trabalho).

```tsx
type Accent = 'goldenrod' | 'sage' | 'ruby' | 'nectar';
type Mode = 'light' | 'dark';

// applyTheme: root.setAttribute('data-theme', mode); root.setAttribute('data-accent', accent);
// Persistência: localStorage 'mora-theme' / 'mora-accent'
```

Manter o hook `useTheme()` como API pública (todos os call-sites continuam funcionando, só os tipos mudam — vai gerar erros de tipo em quem usava `'blue' | 'red' | ...`, e isso é desejável).

### [ADD] `frontend/src/components/ui/`
Traduzir os primitivos de [primitives.jsx](../../planning/design_archive/atlas-2026-04-30/project/primitives.jsx) pra TypeScript modular:

| Arquivo | Componentes | Notas |
|---|---|---|
| `Icon.tsx` | `<Icon name size sw />` + `ICON_PATHS` | 60+ paths inline. Pode-se considerar `lucide-react` (já no package.json) — mas o protótipo usa SVG paths customizados que se misturam bem com a paleta editorial. **Decisão:** copiar paths do protótipo, ignorar `lucide-react` neste milestone. |
| `Eyebrow.tsx` | `<Eyebrow num accent>` | Caps mono, tracking 0.18em |
| `Hairline.tsx` | `<Hairline strong my>` | Divisor `<hr>` editorial |
| `Button.tsx` | `<Button variant="primary\|secondary\|ghost\|danger\|link" size icon iconRight>` | Mapeamento direto |
| `Pill.tsx` | `<Pill tone="accent\|muted\|ok\|warn\|err\|master\|admin\|moderator">` | Status + role tints |
| `Card.tsx` | `<Card padding interactive>` | Surface + radius-lg + shadow-card |
| `Field.tsx` | `<Field label hint error>` `<Input>` `<Select>` `<Textarea>` | Inputs editoriais com hairline bottom border |
| `SectionNum.tsx` | `<SectionNum>01</SectionNum>` | Marcador "01" mono |
| `index.ts` | re-exports | Import limpo: `import { Button, Eyebrow } from '@/components/ui'` |

**Sem styled-components / sem CSS-in-JS pesado.** Cada primitivo usa `style={{ ... }}` com tokens CSS (igual ao protótipo) ou `className` Tailwind quando o token já tá ponteado via `@theme inline`. Razão: zero footprint extra, fácil de copiar do protótipo.

### Critério de aceite Fase 1
- [ ] `npm run dev` carrega `/` sem erros de fonte/CSS.
- [ ] Inspecionar `<html>` mostra `data-theme="light" data-accent="goldenrod"` por padrão.
- [ ] Trocar `data-theme` no devtools muda BG e FG instantaneamente.
- [ ] Storybook? **Não.** Em vez disso, criar `frontend/src/app/_dev/tokens/page.tsx` (rota só em dev) que renderiza paleta + tipografia + todos os primitivos — vira o "Storybook lite" pra QA visual.
- [ ] `npm run build` passa.
- [ ] Páginas existentes continuam funcionando (vão parecer feias, sem layout adaptado, mas não quebram — esse é o ponto).

---

## 🎨 Fase 2 — Telas-Chave (Login, Tables Index, Data Grid, Dashboard)

Cada tela tem 1 arquivo de origem no protótipo + 1 destino no Next.js:

### [REWRITE] `frontend/src/app/login/page.tsx`
- **Origem:** `LoginScreen` em [screens-1.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-1.jsx) (~100 linhas).
- **Layout:** split 50/50 — **esquerda** masthead "fundado em 2025 / volume 1 / publicação contínua" + display Fraunces "ATLAS" + abstract editorial; **direita** card login com tabs "senha · QR · magic". OAuth (Google/GitHub) abaixo do form.
- **Real wiring:** preservar a lógica atual de `useAuth()` ([AuthContext.tsx](../../frontend/src/components/AuthContext.tsx)) — só troca a apresentação. QR já tem rota dedicada em `/admin/qr-auth`, então no login o tab QR vira CTA → redireciona ou abre modal.
- **Workspace switching:** **NÃO** implementar (é mock no protótipo). Mostrar nome fixo do workspace do user logado (vem de `auth/me`).

### [REWRITE] `frontend/src/app/admin/tables/page.tsx`
- **Origem:** `TablesIndex` em [screens-1.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-1.jsx) (~150 linhas).
- **Layout:** masthead com volume + data + workspace, depois lista magazine — cada tabela é uma linha com `<SectionNum>NN</SectionNum>`, eyebrow categoria, title (Fraunces), abstract, contadores (records · columns · relations), CTA edit/delete.
- **Toggle layout:** botão alterna magazine ↔ grid (cards 3-col) — guardar em `localStorage`.
- **Real wiring:** continuar consumindo `GET /api/tables`. Novas colunas (`records`, `columns`, `relations`) devem vir do backend; se ainda não existirem na response, computar client-side via `GET /api/{table_name}?limit=0` (mas evitar — pedir Gemini pra adicionar `meta: { row_count, column_count, relation_count }` na response).
- **Sidebar:** novo `<AdminLayout>` com sidebar Mora — ver §3 abaixo.

### [REWRITE] `frontend/src/app/admin/data/[table]/page.tsx`
- **Origem:** `DataGrid` em [screens-2.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-2.jsx) (~250 linhas).
- **Modos:** **denso** (tabela editorial com hairlines, tabular nums, FK chips) e **cards** (cards de leitura com pull-quotes). Toggle no header.
- **Edição inline:** clique 2× numa célula → vira `<input>` autosize. Enter salva (`PUT /api/{table}/{id}`), Esc cancela.
- **Densidade:** lê do tweak global (compact/regular/loose) — controla `--row-height` via CSS var no container.
- **Real wiring:** preserva fetching, paginação, FK dropdowns, e CRUD da implementação atual.

### [REWRITE] `frontend/src/app/dashboard/page.tsx`
- **Origem:** `PublicDashboard` em [screens-4.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-4.jsx) (~200 linhas).
- **Conteúdo:** masthead "capa de revista" com volume + workspace name + data; "destaques editoriais" (3-col com lead story); strip de números "47 templos · 6 linhagens · 1.247 visitas"; "linhagens" (chips); "agenda de retiros" (lista compacta); colofão.
- **Real wiring:** continua sendo o dashboard logado. Os "destaques" vêm de tabelas marcadas como `featured` (precisa adicionar flag — se não houver, mostrar últimas 3 tabelas modificadas).
- **Widgets atuais** ([BarChartWidget](../../frontend/src/components/widgets/BarChartWidget.tsx)) ficam disponíveis mas embrulhados no chrome editorial novo.

### [ADD] `frontend/src/app/admin/layout.tsx` — Sidebar Mora
- **Origem:** `Sidebar` em [screens-1.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-1.jsx) (~100 linhas).
- **Estrutura:**
  - Topo: workspace card (nome + slug + role pill).
  - Nav agrupada: **Conteúdo** (Tabelas, Importar, Grupos), **Acesso** (Moderadores, QR), **Sistema** (Master, Theme Studio se admin/master), **Site** (Publicar, Site público).
  - Rodapé: user pill (avatar mono + nome + logout).
- **Visibilidade por role:** master vê só Master Panel; admin vê tudo exceto Master; moderator só vê Conteúdo.
- **Substitui** o layout atual em [admin/layout.tsx](../../frontend/src/app/admin/layout.tsx).

### Critério de aceite Fase 2
- [ ] As 4 telas + sidebar carregam sem regressão funcional (todos os fluxos atuais continuam funcionando).
- [ ] Lighthouse perf ≥ 85 em `/dashboard` e `/admin/tables`.
- [ ] Trocar tema/acento via switcher reflete imediatamente nas 4 telas.
- [ ] Densidade do data grid responde ao tweak (mesmo que o tweaks panel ainda seja só `localStorage` cru — UI final do panel é Fase 3).

---

## 🛠️ Fase 3 — Telas Restantes + Tweaks Panel

### Telas (uma por seção; cada `[REWRITE]` segue o mesmo padrão da Fase 2)

| Rota Next.js | Origem no protótipo | Notas-chave |
|---|---|---|
| `frontend/src/app/admin/tables/create/page.tsx` (Schema Editor) | `SchemaEditor` em [screens-2.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-2.jsx) | 3 colunas: lista de cols, inspetor lateral, SQL preview. Mantém wiring atual de FK/`POST /api/tables`. |
| `frontend/src/app/admin/import/sql/page.tsx` | `ImportSQL` em [screens-3.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-3.jsx) | Wizard editorial: textarea SQL → dry-run com badges (`ok`/`warn`/`blocked`) → commit. Mantém `POST /api/import/sql/dry-run` + `POST /api/import/sql`. |
| `frontend/src/app/admin/import/data/page.tsx` | `ImportSheet` em [screens-3.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-3.jsx) | Upload XLSX/CSV → mapeamento auto-tipo → preview → commit. |
| `frontend/src/app/admin/users/page.tsx` (Moderadores) | `ModeratorsScreen` em [screens-3.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-3.jsx) | Lista + matriz de permissões com herança visual (escrever exige ler). Mantém `/api/users` + `/api/moderator-permissions`. |
| `frontend/src/app/admin/groups/page.tsx` | `GroupsScreen` em [screens-4.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-4.jsx) | "Capítulos" — agrupa tabelas. Mantém `/api/database-groups`. |
| `frontend/src/app/admin/qr-auth/page.tsx` | `QRAuthScreen` em [screens-4.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-4.jsx) | QR gigante + código mnemônico (`BUDA-ZA48`) com countdown + lista de sessões ativas. Mantém wiring atual. |
| `frontend/src/app/admin/admins/page.tsx` (Master Panel) | `MasterPanel` em [screens-4.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-4.jsx) | KPIs + tabela de admins/workspaces com quotas. Visível só pra master. |
| `frontend/src/app/explore/page.tsx` | `ExploreScreen` em [screens-4.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-4.jsx) | Busca pública cross-workspaces. |
| `frontend/src/app/admin/publish/page.tsx` (NOVA — Theme Studio + Publish) | `ThemeStudio`, `PublishConfirm`, `ExportFormat`, `ExportedPackages` em [screens-5.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-5.jsx) | **Mock visual.** Preview do site público + 3 presets + abas tipografia/cor/layout + dois caminhos (publicar `slug.atlas` ou exportar pacotes). Botões de download desabilitados com tooltip "em breve". |
| `frontend/src/app/[workspace]/page.tsx` (NOVA — Site público) | `PublicSite` em [screens-5.jsx](../../planning/design_archive/atlas-2026-04-30/project/screens-5.jsx) | Hero editorial, busca, drawer de detalhe. **Read-only**, consome `/api/public/{workspace}/*` (já existe no backend M2). |

### [ADD] `frontend/src/components/TweaksPanel.tsx`
- **Origem:** [tweaks-panel.jsx](../../planning/design_archive/atlas-2026-04-30/project/tweaks-panel.jsx) (~425 linhas).
- **Funcionalidades expostas no panel real:**
  - Persona (master / admin / moderator) — **só dev**, controla `<AdminLayout>` para QA visual sem precisar trocar de user.
  - Densidade do data grid — `localStorage` `mora-density`.
  - Terminologia (tabela ↔ coleção) — `localStorage` `mora-terminology`.
  - Acento + modo — chama `useTheme()`.
- **NÃO incluir no panel real:** workspace switcher (era mock pro protótipo demonstrar 3 datasets).
- **Visibilidade:** só renderiza se `process.env.NODE_ENV !== 'production'` OR `localStorage.getItem('mora-tweaks-enabled') === '1'` — Diretor pode ligar em prod via console.
- **Posição:** botão flutuante bottom-right, abre drawer lateral direito.

### [ADD] `frontend/src/contexts/TweaksContext.tsx`
Provider novo que distribui `density`, `terminology`, `personaOverride`. Persistência `localStorage`. Wrapper em [layout.tsx](../../frontend/src/app/layout.tsx).

### Critério de aceite Fase 3
- [ ] Todas as rotas existentes redesenhadas + 2 novas (`/admin/publish`, `/[workspace]`).
- [ ] Tweaks panel funcional (dev + override em prod).
- [ ] Lighthouse perf ≥ 85 nas rotas públicas (`/`, `/[workspace]`).
- [ ] `npm run build` + `npm run lint` limpos.
- [ ] TestSprite re-roda os smoke tests do M2 sem regressão.

---

## ⚠️ Riscos e Decisões em Aberto

1. **Tailwind 4 + CSS vars custom:** Tailwind 4 mudou pra CSS-first (sem `tailwind.config.ts`). O bridge `@theme inline` deve funcionar, mas é **frágil** — se quebrar, plano B é não usar utilities Tailwind nas telas redesenhadas e ir direto com `style={{ background: 'var(--bg-surface)' }}` (igual ao protótipo).
2. **`framer-motion` v12 + React 19:** já usado no projeto. Prototype não usa motion explícito; vamos reusar pra transições de drawer/modal.
3. **Bundle size das fontes:** Fraunces variable + Plex Sans 5 weights + Plex Mono 3 weights. Subset latin + `display: 'swap'` mitiga, mas convém checar via `next build` o tamanho final.
4. **`lucide-react` vs ícones do protótipo:** o protótipo tem 60+ paths SVG inline. `lucide-react` (1.0.1, já instalado) é maior mas idiomático. **Decisão proposta:** copiar do protótipo (consistência visual com o design), e marcar pra revisitar.
5. **Workspace concept no backend:** ✅ resolvido — Diretor aprovou opção light: backend ganha `workspace_name`/`workspace_slug` em `users` (Fase 0). Constituição §2 permanece intacta — prefixo `t{admin_id}_` continua sendo o mecanismo de isolamento físico.

## 🔗 Dependências
- Nenhuma do M3 (RLS migration) ou M4 (auth unification).
- Fase 0 (backend) precede a Fase 1, mas é leve (~1 sessão). Pode ser merged sozinha antes do redesign visual começar.

---

## 🤖 Read-before-task (guia para a IA Programadora)

Esta seção é uma referência operacional pra IA executando este plano. **Antes de cada task no [arquivo de tasks](../tasks/M5_atlas_redesign.md), leia primeiro o(s) arquivo(s) listados abaixo.** O bundle de design é a fonte da verdade visual; este plano é o mapa.

| Antes de implementar... | Leia primeiro |
|---|---|
| Tokens (T1.1) | `planning/design_archive/atlas-2026-04-30/project/tokens.css` (470 linhas, copy-paste-ready) |
| ThemeContext (T1.3) | atual `frontend/src/components/ThemeContext.tsx` + `tokens.css` §5 (variants `data-accent`) |
| Cada primitivo (T1.5–T1.13) | `planning/design_archive/atlas-2026-04-30/project/primitives.jsx` — função correspondente |
| Login (T2.2–T2.4) | `screens-1.jsx` — busque `function LoginScreen` |
| Sidebar (T2.1) | `screens-1.jsx` — busque `function Sidebar` + `app.jsx` (como é usado) |
| Tables Index (T2.5–T2.7) | `screens-1.jsx` — busque `function TablesIndex` |
| Data Grid (T2.8–T2.11) | `screens-2.jsx` — busque `function DataGrid` |
| Dashboard (T2.12–T2.14) | `screens-4.jsx` — busque `function PublicDashboard` |
| Schema Editor (T3.2) | `screens-2.jsx` — busque `function SchemaEditor` |
| Import SQL (T3.3) | `screens-3.jsx` — busque `function ImportSQL` |
| Import Sheet (T3.4) | `screens-3.jsx` — busque `function ImportSheet` |
| Moderadores (T3.5) | `screens-3.jsx` — busque `function ModeratorsScreen` (atenção ao `buildPerms` helper) |
| Grupos (T3.6) | `screens-4.jsx` — busque `function GroupsScreen` |
| QR Auth (T3.7) | `screens-4.jsx` — busque `function QRAuthScreen` |
| Master Panel (T3.8) | `screens-4.jsx` — busque `function MasterPanel` |
| Explore (T3.9) | `screens-4.jsx` — busque `function ExploreScreen` |
| Theme Studio + Publish (T3.10) | `screens-5.jsx` — `ThemeStudio`, `PublishConfirm`, `ExportFormat`, `ExportedPackages`. **Mock visual** — não wirar publish/export real. |
| Site Público (T3.11) | `screens-5.jsx` — busque `function PublicSite` |
| Tweaks Panel (T3.12–T3.14) | `tweaks-panel.jsx` (425 linhas) + `app.jsx` (como o panel é montado e os tweaks consumidos) |

### Regras gerais para a IA Programadora

1. **O JSX do protótipo É a especificação visual.** Quando o plano diz "magazine layout com eyebrow + abstract + counts", isso é resumo — o layout exato (margens, line-heights, ordem de elementos) tá no JSX. Recrie em React 19/TS preservando hierarquia visual.

2. **Não copie a arquitetura interna do protótipo.** Ele usa Babel-in-browser, globals reassinaveis (`var TEMPLOS_DATA`), e dados mockados em `data.jsx`. Substitua por: `useAuth()` real, `fetch('/api/...')` real, props tipadas em vez de `window.X`.

3. **Densidade controlada via CSS var, não props.** Em vez de `<DataGrid density="compact">`, faça `style={{ '--row-height': '32px' }}` no container raiz e o CSS interno usa `var(--row-height)`. Permite o TweaksContext mudar sem re-renderizar a árvore.

4. **Estilos editoriais via `style={{ ... }}` com tokens CSS — não Tailwind.** As 4–5 utility classes do Tailwind que sobreviveram do projeto atual (ex: `flex items-center`) podem continuar; mas backgrounds, fonts, borders editoriais usam `var(--bg-surface)`, `var(--font-display)`, etc. Razão: facilita comparar visualmente com o protótipo.

5. **Cada tela é um PR worth de mudança visual.** Resista à tentação de "limpar e reescrever a lógica de fetching enquanto está nisso". Se a lógica atual funciona, copie-a — só muda apresentação. Reescritas funcionais ficam pra outra milestone.

6. **Quando o protótipo tem feature que o backend não suporta** (ex: marcar tabela como `featured`, "agenda de retiros", "linhagens"), comente o JSX final ou substitua por mock estático com `// TODO(M6): wire to backend`. **Não invente endpoints.**

7. **Workspace switcher do protótipo NÃO existe na versão real.** Era pra demonstrar 3 datasets de exemplo. No real, o admin logado tem 1 workspace (workspace_name + workspace_slug do `/api/auth/me`).
