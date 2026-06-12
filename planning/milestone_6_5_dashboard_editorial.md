# M6.5 — Public Dashboard Editorial: a capa de revista vira a home do admin

> **Status:** 🟢 DECISÕES FECHADAS — rebate concluído 2026-06-11; ajustes finais possíveis após o plano do M7. Não executar antes do ok final.
> Base: Proposta 3 (vencedora em 2 de 3 vereditos) + resgates das Propostas 1 e 2. Alvo de design: `PublicDashboard` em `screens-4.jsx:10-238` do handoff (cópia em `planning/design_archive/atlas-2026-04-30/project/`). O protótipo é **espelho de design** (lição do M5): copiamos a saída visual, implementamos na stack real.

## O problema

A home atual do admin (`frontend/src/app/admin/page.tsx`, 170 linhas) mente em dois blocos — KPI "Uptime 99.9%" e card "Estado do sistema" com "SQLite local / v1.3.0" hardcoded (errado em prod/Supabase) — e ignora tudo que o M6 construiu: zero menção a publicação, versões ou ao site público. Pior: o Publish Studio (`/admin/publish`) **não tem link na sidebar** — só se chega por URL direta — e o nav linka `/admin/qr` quando a rota real é `/admin/qr-auth` (404, `admin/layout.tsx:64`). Existe ainda uma segunda "capa" órfã (`frontend/src/app/dashboard/page.tsx`, fora do shell) com três blocos fake marcados `// TODO(M6): wire to real metrics`.

O handoff entrega o redesign: o mural "magazine cover-style" — masthead Fraunces itálico, grid 2fr/1fr de destaques + "Em números", faixa de cards e colofão invertido. Mas o protótipo mocka quase tudo num dicionário `CFGS` (stats fixos, eventos, blurb, formatter `rowMeta`). O gap-analysis do backend mostra que **~90% dos dados têm fonte real** — o plano religa cada bloco a um endpoint existente e corta/substitui o que não tem fonte, sem mockar nada.

## Veredito sobre a hipótese do roadmap ("1 PR — só visual, sem novo backend")

- **"Sem novo backend": VALIDADA.** A capa inteira monta com fetches existentes. Única ressalva genuína: não existe `activated_at` em `PublicationVersion` — rollback não registra quando reativou, então a data da "edição vigente" mente após um rollback (mostra criação do snapshot). Correção é um mini-PR backend **opcional** (decisão do Diretor).
- **"1 PR": CONTESTADA.** Reescrita da home + 2 primitivos novos + tokens + 3 fixes de nav + 5 estados difíceis + deleção do /dashboard antigo num diff só vira PR inrevisável. Proposta: **3 PRs frontend pequenos** (fatiamento risco-first), com opção de colapsar PR2+PR3 em um se o Diretor preferir 2 PRs.

## O que entrega

A home `/admin` vira a capa-papel do estado do workspace: masthead com a metáfora "edição" **verdadeira** (edição nº = `version_number` da versão ativa do M6), destaques = top-4 tabelas, "Em números" com 4 stats reais, bloco II = grupos, faixa III = histórico de edições publicadas, colofão ink invertido. Copy reescrito de "a capa que o mundo vê" para **"estado da edição"**: o `/{slug}` real renderiza `PublicSite.tsx` (outro layout), então prometer espelho seria mentira de produto. Nav consertado; hardcodes mortos; /dashboard fake deletado.

## Mapeamento bloco-a-bloco (protótipo → produto)

| Bloco do protótipo | Fonte no protótipo | Fonte real | Destino |
|---|---|---|---|
| Folio/masthead "edição Outono nº 04" | `W.edition` (string fixa) | `version_number` + `created_at` de GET `/api/publications/me/versions` | "Edição nº {n} · {data pt-BR}"; sem versões = "rascunho · não publicado" |
| H1 2 linhas, 2ª em accent | título curado do CFGS | `workspace_name` (AuthContext / GET `/api/auth/me`) | clamp() pra nomes longos |
| Blurb institucional serif | CFGS | **não existe campo** | cortar (decisão aberta: fallback derivado?) |
| I · destaques (4 linhas da tabela primária) | `PRIMARY_DATA.slice(0,4)` + `rowMeta` | **não existe "tabela primária"** | top-4 TABELAS por `meta.row_count` de GET `/tables/`; curadoria de linhas = futuro |
| Aside "Em números" (4 Stats) | strings fixas do CFGS | derivações de `/tables/` + `/versions`: tabelas (e públicas), soma row_count, edições publicadas, grupos | 100% real |
| II · "Linhagens" (categorias + contagem) | CATEGORIES + filtro client | `group_id` de TableResponse × GET `/api/database-groups` | breakdown por grupo |
| III · "Próximos retiros" (3 eventos) | CFGS.events | **não existe evento** | "III · Edições publicadas": 3 últimas versões — mono accent = `created_at`, itálico = `description`, byline = `created_by`, Pill ok na `is_active` |
| Ações do header | sem handler | rota pública `/[workspace]` + `/admin/publish` | Pré-visualizar / Copiar link / Publicar |
| Colofão ink + CC | CFGS | `workspace_name` + MMonogram + link mono pro `/{slug}` | licença CC: decisão de copy |
| Copy "Arraste blocos…" | promessa vazia | **não existe persistência de layout** | removido |

## Fases / PRs

### PR1 — Fundações (zero mudança de comportamento, merge de risco zero)
- **`frontend/src/components/ui/Stat.tsx`** (novo): numeral Fraunces itálico ~38px em `--accent-text` + label 13px — hoje é JSX ad-hoc duplicado em `admin/page.tsx` e `dashboard/page.tsx`. Export no barrel `index.ts`.
- **`frontend/src/components/ui/Skeleton.tsx`** (novo): shimmer em `--bg-sunken`, consumido no PR2.
- **`frontend/src/app/globals.css`**: tokens crus da capa **fora** dos blocos `data-theme` — `--pigment-parchment: #FAEFD9` (valor extraído do `tokens.css` do handoff) e o equivalente de `--pigment-ink`. **Transcrever VALORES, nunca nomes**: o `app.css` do handoff aliasa `--pigment-ink→--pigment-midnight` e `--pigment-burnt-nectar→--pigment-nectar`; copiar nomes cegamente quebra. A capa é papel-claro fixa mesmo em dark mode — decisão do handoff, **mantida**.
- **`frontend/src/app/admin/layout.tsx`**: corrigir `/admin/qr` → `/admin/qr-auth` (linha 64, 404 hoje) e adicionar entradas de nav para `/admin` (Capa) e `/admin/publish` (hoje inalcançável).

### PR2 — A capa com os estados difíceis PRIMEIRO
Reescrever **`frontend/src/app/admin/page.tsx`**: esqueleto do mural — ScreenHeader fora do papel (folio + ações), card-papel parchment (border `--rule`, radius 12, shadow raised), masthead, aside "Em números" (4 `Stat`), colofão invertido.

**Data layer** (padrão do projeto: fetch client-side em useEffect + Bearer + `NEXT_PUBLIC_API_URL`): **2 fetches paralelos** — GET `/tables/` e GET `/api/publications/me/versions`. Workspace via `useAuth`. Sem `/me/active` (deriva da lista), sem `/api/moderators` (nenhum stat exige; se entrar um dia, condicionar a `role=admin` — moderator leva 403). `PublishContext` NÃO entra (provider só monta em `/admin/publish`); fetch direto.

**Os 5 estados, implementados antes de qualquer seção de conteúdo:**
1. **Master**: fetch de publications nem dispara (`isMaster`; backend devolve 403 em `/api/publications/me/*`) → variante "edição mestre" sem bloco de publicação (alternativa em decisão aberta).
2. **Nunca publicou**: derivado da **lista vazia** de `/versions` — não do 404 de `/me/active`, que o padrão `.catch(()=>{})` vigente engoliria → masthead "rascunho · não publicado" + CTA pro Publish Studio.
3. **Workspace vazio** (0 tabelas): capa "edição zero" + CTA criar tabela.
4. **Loading**: `Skeleton` preservando o layout da capa.
5. **Erro de API**: degradação **por bloco** (stat vira "—", capa não explode) — quebra deliberada do `.catch(()=>{})`, documentada no PR.

Remove os hardcodes (Uptime 99.9%, "Estado do sistema"). Antes de codar: ler `node_modules/next/dist/docs/` (frontend/AGENTS.md avisa breaking changes do Next vs training data).

### PR3 — Seções de conteúdo + ações (sobre os fetches que o PR2 já fez)
- **I · Destaques**: top-4 tabelas por `row_count` — grid 60px/1fr/auto, ordinal itálico 36px, nome, meta "{n} registros · {n} colunas · criada em {data}", Pill público/privado, link pra tabela; rodapé "Ver todas as N tabelas →" (contagem real).
- **II · Grupos**: nome itálico + contagem mono, separador pontilhado.
- **III · Edições publicadas**: 3 últimas versões na gramática date-strip do protótipo (mapeamento campo-a-campo da tabela acima).
- **Ações**: Pré-visualizar → abre `/{workspace_slug}` em nova aba; Copiar link → clipboard **com feedback visual**; Publicar → `router.push('/admin/publish')`.
- **Commit isolado no mesmo PR**: deletar `frontend/src/app/dashboard/page.tsx` — após a capa ela é código morto com dados fake; absorver apenas seus padrões visuais (strip de números entre bordas 2px, colofão com OwlGlyph).
- **QA TestSprite**: home mostra edição ativa / home sem publicação mostra CTA / Copiar link copia `/{slug}` / nav alcança o Publish Studio.

### PR4 — OPCIONAL, backend mínimo (só com aprovação explícita do Diretor)
**Só `activated_at`** — coluna em `PublicationVersion` (models.py) + set no POST `/versions/{id}/activate` + expor em `PublicationVersionResponse` (schemas.py:155) + migration Alembic de 1 coluna. O endpoint agregado `GET /api/dashboard/me` (~80-100 linhas, mataria o N+1 do `/tables/`) fica **ADIADO**: a home atual já convive com esse custo; só entra se a capa ficar lenta em workspace real. (Se entrar um dia: cuidado com sombreamento da rota dinâmica `/api/{table_name}`, main.py:842, pra tabela chamada "dashboard".)

## Decisões fechadas pelo Diretor (rebate 2026-06-11)

1. **Fatiamento: 2 PRs frontend** — PR1 (fundações) + PR2 (capa completa: esqueleto + 5 estados + seções de conteúdo + ações, absorvendo o antigo PR3). O mini-PR backend vira PR3.
2. **`activated_at`: APROVADO** dentro do M6.5 ("concordo, é importante") — PR3 backend mínimo (coluna + set no /activate + expor no response + migration).
3. **Destaques = top-4 tabelas: ACEITO**, com exigências adicionais do Diretor: **fidelidade visual máxima** ao handoff, validação por **testes + screenshots analisados** (Playwright prints inspecionados, como no gate do M6 F5) e **checks de velocidade e robustez** (tempo de carga da home, degradação com muitas tabelas). Curadoria de "linhas em destaque" segue futuro condicionado a paginação da rota dinâmica.
4. **Home do master: REDIRECT pro painel master** — master que acessa `/admin` é redirecionado; a capa é exclusiva de admin/moderator.
5. **`/dashboard` antigo: vira REDIRECT** (não deleção) — guarda a rota pra futuramente levar a uma tela real.
6. **Colofão: assinatura neutra** "publicado por atlas · {workspace_name}" (sem claim de licença CC). Blurb do masthead: cortado (capa respira sem ele; fallback derivado descartado por ora — campo editável fica pra milestone futura).

## Riscos

- **N+1 do `/tables/`** (COUNT(*) físico + counts por tabela em savepoint, devolve columns completas que a capa não usa): ok com poucas tabelas (a home atual já usa), degrada com dezenas. Mitigação real = endpoint agregado adiado.
- **Padrão `.catch(()=>{})` engole estados**: 404/403 tratados como erro genérico = capa em branco silenciosa. PR2 quebra o padrão por design (estado via lista vazia + degradação por bloco).
- **H1 Fraunces 88px com `workspace_name` real**: o protótipo usa títulos curados ("Centro Budista / do Brasil"); nomes longos quebram as 2 linhas → clamp() agressivo + quebra testada. Grid 2fr/1fr também disputa largura com sidebar 280px + padding 40/48px do shell; sem referência mobile no protótipo.
- **Parchment fixo em dark mode**: primeira superfície que ignora `data-theme` de propósito; validar contraste nos 2 temas × 4 acentos.
- **Next com breaking changes** (frontend/AGENTS.md): consultar `node_modules/next/dist/docs/` antes de router/clipboard/transitions.
- ~~**Branch base**: PR #27 ainda aberto~~ — superado: PRs #27 e #28 mergeados, M6 fechado. M6.5 parte de `main` limpa.

## Critério de sucesso

- Admin loga e vê em uma tela: estado de publicação (edição nº / rascunho), top tabelas, números reais, histórico de edições — **zero dado mockado ou hardcoded** na home.
- Os 5 estados (master / vazio / nunca-publicou / loading / erro por bloco) renderizam corretamente.
- Sidebar alcança `/admin`, `/admin/publish` e `/admin/qr-auth` sem 404.
- Fidelidade visual ao mural do handoff nos 2 temas × 4 acentos (capa papel-claro fixa).
- `dashboard/page.tsx` fake deletada; fluxos TestSprite do PR3 verdes.

## Não-objetivos

- Drag-and-drop / persistência de ordem de blocos (nem o protótipo implementa; copy removida).
- Eventos/agenda/calendário; audit log / atividade recente real (sem `updated_at`/`last_login`; custo médio-alto); group-by por categoria no backend.
- Tocar em `/[workspace]/page.tsx`, `PublicSite.tsx` ou no SnapshotPayload — a capa é a HOME DO ADMIN.
- "Tabela primária" / curadoria de linhas (decisão aberta 3, futuro); endpoint agregado (adiado); demais telas de screens-4.jsx (ExploreScreen, GroupsScreen, MasterPanel, QRAuth).
- Schema SQL novo além do opcional `activated_at`; nenhuma lib nova (fetch nativo + primitivos Mora).
