// Sem 'use client' de propósito: este componente precisa renderizar em
// 3 contextos — Studio (client), rota pública (RSC) e export estático
// (renderToStaticMarkup em route handler). Handlers de edição só são
// anexados quando `onCopyEdit` existe (Studio), então o render servidor
// nunca recebe função em elemento host.
import React from 'react';
import { ThemeConfig, LayoutType, TableRole } from '@/contexts/PublishContext';
// Import direto (não pelo barrel @/components/ui, que reexporta módulos
// 'use client') pra manter este arquivo renderizável no export estático.
import Icon from '@/components/ui/Icon';
import { isMediaBackendType } from '@/lib/columnTypes';
import { formatPublishedDate } from '@/lib/snapshot';
import { jsonParaScript } from '@/lib/publicSiteRuntime';
import {
  criarIndiceFicha, naGrade, normalizaTexto, rotuloColuna, tabIdDaTabela,
  type FichaColuna, type FichaRelacao, type IndiceFicha,
} from '@/lib/fichaIndice';

// O id da aba mora no `fichaIndice` (o endereço da ficha também usa); segue
// exportado daqui pra quem já importava.
export { tabIdDaTabela };

type CopyField = 'hero_eyebrow' | 'hero_title' | 'hero_sub';
export type CopyEditHandler = (field: CopyField, value: string) => void;

/* ─────────────────────────────────────────────────────────────────
   PublicSite — renderer puro do snapshot.
   - No Studio (isEditable): lê do PublishContext e edita copy inline.
   - Na rota pública (PR4): recebe theme/tables como props, isEditable=false.
   - Suporta 3 layouts de tabela (list/grid/essay).
   ───────────────────────────────────────────────────────────────── */

export interface PublicSiteTableData {
  table_id: number;
  name: string;
  layout: LayoutType;
  /** 1.4: colunas visíveis, com `label` e `placement` (oculta já não chega). */
  columns: FichaColuna[];
  rows: Record<string, unknown>[];
  total_rows: number;
  // 1.4 — opcionais: snapshot antigo não os tem (ausente = aba, nome interno,
  // título por heurística do layout, toda coluna na listagem).
  role?: TableRole;
  label?: string;
  key_column?: string | null;
  title_column?: string | null;
  truncated?: boolean;
  budget_exceeded?: boolean;
  /** 1.5: subtítulo da seção, curado na publicação (nunca a `_tables.description`). */
  subtitle?: string | null;
}

/** 1.4: ligação entre tabelas publicadas, já na direção FK → alvo. */
export type PublicRelation = FichaRelacao;

/** M8.5 F2: gráfico CONGELADO no snapshot. O `svg` é uma string gerada no
 *  publish pelo renderizador Python (backend/chart_svg.py) — o público nunca
 *  depende de recharts em runtime (ele não renderiza server-side, e o export é
 *  script-free por contrato). */
export interface PublicSiteChartData {
  view_id: number;
  title: string;
  chart_type: string;
  svg?: string;
  alt_table?: { header: string[]; rows: string[][] };
  warnings?: string[];
  error?: string;
}

export interface PublicSiteProps {
  themeConfig: ThemeConfig;
  tables: PublicSiteTableData[];
  /** M8.5 F2: gráficos congelados desta versão, já ordenados pelo backend. */
  charts?: PublicSiteChartData[];
  workspaceName?: string;
  workspaceSlug?: string;
  /** Procedência da versão publicada. Sem isto o visitante vê um gráfico que
   *  pode ser de meses atrás e não tem como saber — o impresso acadêmico já
   *  dizia ("Versão N · publicado em D"), a tela não. Ausentes = preview do
   *  Studio, que ainda não tem versão. */
  versionNumber?: number;
  publishedAt?: string;
  /** 1.4: ligações entre as tabelas publicadas (`snapshot.relations`). Sem
   *  elas a FK aparece como id e não há relacionados na ficha. */
  relations?: PublicRelation[];
  /** Quando definido, hero vira contentEditable e dispara onCopyEdit no blur.
   *  Quando undefined (rota pública), hero é estático. */
  onCopyEdit?: CopyEditHandler;
  /** M8.5 F3.3: links pros impressos no rodapé. Só a ROTA PÚBLICA liga — o
   *  preview do Studio e o export ZIP renderizam o mesmo componente e lá as
   *  rotas `/{slug}/academico` e `/{slug}/panfleto` não existem (o ZIP é um
   *  index.html solto, offline). Sem a trava, o export ganharia link morto. */
  printLinks?: boolean;
  /**
   * 1.3.2: ocupa a janela inteira, com o rodapé no fim. Liga na rota pública e
   * no ZIP. O preview do Studio fica de fora: lá `100vh` seria a janela do
   * admin, não a do site.
   */
  fullHeight?: boolean;
}

const SAMPLE_ROWS: Record<string, unknown>[] = [
  { id: 1, title: 'Cadernos de Viagem ao Recôncavo', meta: 'Aurélio Telles · 1923', year: '1923' },
  { id: 2, title: 'Cartografia da Costa Sul', meta: 'Anônimo · 1789', year: '1789' },
  { id: 3, title: 'Diário de Bordo · Navio Maranhão', meta: 'Cap. F. Ferreira · 1842', year: '1842' },
  { id: 4, title: 'Fotografias do Porto de Salvador', meta: 'M. Vargas · 1906', year: '1906' },
  { id: 5, title: 'Correspondência Diplomática Lisboa', meta: 'Conde de Sabugosa · 1764', year: '1764' },
  { id: 6, title: 'Censo das Vilas Litorâneas', meta: 'Coroa Portuguesa · 1779', year: '1779' },
];

const SAMPLE_TABLE: PublicSiteTableData = {
  table_id: -1,
  name: 'acervo',
  layout: 'list',
  columns: [
    { name: 'title', data_type: 'String' },
    { name: 'meta', data_type: 'String' },
    { name: 'year', data_type: 'String' },
  ],
  rows: SAMPLE_ROWS,
  total_rows: SAMPLE_ROWS.length,
};

export function PublicSite({
  themeConfig: t,
  tables,
  charts = [],
  workspaceName = 'Workspace',
  workspaceSlug = 'workspace',
  versionNumber,
  publishedAt,
  relations = [],
  onCopyEdit,
  printLinks = false,
  fullHeight = false,
}: PublicSiteProps) {
  const isEditable = !!onCopyEdit;
  // Em modo editor, se não tem tabela selecionada, mostra dado-exemplo
  // pra que admin veja como vai ficar.
  const tablesForRender = tables.length > 0
    ? tables
    : isEditable
      ? [{ ...SAMPLE_TABLE, layout: t.layout.default_table_layout }]
      : [];
  // 1.4: `ficha` não vira aba — existe pra alimentar fichas e relacionados.
  const abas = tablesForRender.filter((tbl) => (tbl.role ?? 'aba') !== 'ficha');
  const indice = criarIndiceFicha(tablesForRender, relations);
  // O runtime precisa do dado de TODA tabela publicada pra montar ficha. A
  // grade (layout tabela) já embute o dela; as outras vão num contêiner oculto.
  const soNoAcervo = tablesForRender.filter(
    (tbl) => (tbl.role ?? 'aba') === 'ficha' || tbl.layout !== 'tabela',
  );

  const heroPad =
    t.layout.density === 'comfy' ? '72px 56px 56px'
      : t.layout.density === 'regular' ? '56px 56px 40px'
        : '40px 56px 28px';

  const tabs = [
    { id: 'inicio', rotulo: 'Início' },
    ...abas.map((tbl) => ({ id: tabIdDaTabela(tbl.name), rotulo: tbl.label || tbl.name })),
  ];

  return (
    <div
      data-atlas-site
      style={{
        background: t.colors.bg,
        color: t.colors.ink,
        fontFamily: t.typography.body.family,
        // `100%` não alcança nada na rota pública (o body não tem altura) e o
        // painel curto deixava uma faixa sem fundo embaixo do rodapé.
        minHeight: fullHeight ? '100vh' : '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: estilosDoRuntime(t) }} />
      <Header theme={t} workspaceName={workspaceName} workspaceSlug={workspaceSlug} />

      {/* 1.3 — barra de abas: "Início" (capa + gráficos) e uma por tabela.
          Os botões são `<button>` de verdade e os painéis nascem TODOS
          visíveis: sem JS a página degrada pro empilhado de antes, com o dado
          inteiro à mostra. O runtime esconde os não-ativos ao subir. */}
      <TabBar theme={t} tabs={tabs} />

      <div data-atlas-panel="inicio">
        <Hero theme={t} pad={heroPad} onCopyEdit={onCopyEdit} />
        {/* Gráficos antes das tabelas: síntese primeiro, dado bruto depois.
            (Posicionamento é escolha de implementação — o crítico do
            detalhamento apontou que ninguém tinha decidido onde ancorar.) */}
        {charts.map((c) => (
          <ChartSection key={`${c.view_id}-${c.title}`} theme={t} chart={c} isEditable={isEditable} />
        ))}
      </div>

      {abas.map((tbl) => (
        <div key={tbl.table_id} data-atlas-panel={tabIdDaTabela(tbl.name)}>
          <TableSection theme={t} table={tbl} indice={indice} />
        </div>
      ))}

      {/* 1.4 — o resto do acervo que a ficha precisa (tabelas `ficha` e as de
          layout editorial) e as ligações. Dado do tenant: sempre por
          `jsonParaScript`. */}
      {/* Só existe quando há o que carregar: site sem tabela segue sem nenhum
          <script> (os impressos e o gráfico prometem "não exige JS"). */}
      {(soNoAcervo.length > 0 || relations.length > 0) && (
      <div hidden data-atlas-acervo>
        {soNoAcervo.map((tbl) => (
          <script
            key={tbl.table_id}
            type="application/json"
            data-atlas-data
            dangerouslySetInnerHTML={{ __html: jsonParaScript(dadosDoRuntime(tbl)) }}
          />
        ))}
        <script
          type="application/json"
          data-atlas-relations
          dangerouslySetInnerHTML={{ __html: jsonParaScript(relations) }}
        />
      </div>
      )}

      <Footer theme={t} slug={workspaceSlug} printLinks={printLinks}
              versionNumber={versionNumber} publishedAt={publishedAt} />
    </div>
  );
}

/** Cor do tema dentro de CSS montado à mão: só hex passa. O tema vem do
 *  admin, e um valor com `</style>` sairia do bloco e viraria HTML na página
 *  pública (que é a mesma origem do painel). No JSX o React escapava; aqui não. */
function corSegura(c: string | undefined, padrao: string): string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : padrao;
}

/** Mesma razão da `corSegura`: família de fonte só com letra, número, espaço,
 *  vírgula, hífen e aspas (`'IBM Plex Serif', Georgia, serif` passa). */
function fonteSegura(f: string | undefined, padrao: string): string {
  return typeof f === 'string' && /^[\w\s,'"-]+$/.test(f) ? f : padrao;
}

/**
 * 1.3.2 — estilo das classes que o RUNTIME aplica. O SSR desenha a 1ª página
 * com `style` inline, mas o runtime cria nós novos (linhas, paginador) e só põe
 * classe; sem esta folha as linhas redesenhadas perdiam espaçamento e borda, e
 * a aba ativa não tinha marca. Ninguém viu antes porque o runtime nunca tinha
 * funcionado no ar (B21).
 */
export function estilosDoRuntime(t: ThemeConfig): string {
  const ink = corSegura(t.colors.ink, '#222222');
  const rule = corSegura(t.colors.rule, '#222222');
  const accent = corSegura(t.colors.accent, '#555555');
  const bg = corSegura(t.colors.bg, '#ffffff');
  const muted = corSegura(t.colors.muted, '#666666');
  const raio = Number.isFinite(Number(t.layout.radius)) ? Number(t.layout.radius) : 4;
  const corpo = fonteSegura(t.typography.body.family, 'Georgia, serif');
  const mono = fonteSegura(t.typography.mono.family, 'monospace');
  const display = fonteSegura(t.typography.display.family, 'Georgia, serif');
  return [
    `.atlas-td{padding:9px 12px;border-bottom:1px solid ${rule}22;vertical-align:top}`,
    `.atlas-tab-ativa{color:${ink}!important;border-bottom-color:${accent}!important}`,
    `.atlas-pagina{font:inherit;padding:4px 10px;min-width:30px;border:1px solid ${rule}66;border-radius:${raio}px;background:${bg};color:${ink};cursor:pointer}`,
    `.atlas-pagina-ativa{background:${accent};border-color:${accent};color:${bg}}`,
    `.atlas-pagina:disabled{opacity:.35;cursor:default}`,
    `.atlas-pagina-info{margin-left:8px;color:${muted}}`,
    // 1.5: lista vazia ("Nenhum registro encontrado com esses filtros.")
    `.atlas-vazio{padding:28px 12px;text-align:center;color:${muted};font-style:italic}`,
    // 1.4 — link pra ficha (título da linha e FK) e o painel da ficha. O
    // painel é montado pelo runtime direto no <body>, fora da raiz do site,
    // então carrega a própria fonte e as próprias cores.
    `.atlas-link{color:inherit;text-decoration:none;border-bottom:1px solid ${accent}66;cursor:pointer}`,
    `.atlas-link:hover,.atlas-link:focus-visible{color:${accent};border-bottom-color:${accent}}`,
    `.atlas-ficha-raiz{position:fixed;inset:0;z-index:50}`,
    `.atlas-ficha-fundo{position:absolute;inset:0;background:rgba(0,0,0,.38)}`,
    `.atlas-ficha{position:absolute;top:0;right:0;bottom:0;width:min(600px,100vw);overflow:auto;box-sizing:border-box;padding:28px 36px 56px;background:${bg};color:${ink};font-family:${corpo};box-shadow:-16px 0 40px rgba(0,0,0,.22);outline:none}`,
    `.atlas-ficha-topo{display:flex;justify-content:space-between;align-items:center;gap:12px}`,
    `.atlas-ficha-eyebrow{font-family:${mono};font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${accent}}`,
    `.atlas-ficha-x{font:inherit;font-size:22px;line-height:1;width:36px;height:36px;border:1px solid ${rule}44;border-radius:${raio}px;background:transparent;color:${ink};cursor:pointer}`,
    `.atlas-ficha-titulo{font-family:${display};font-weight:400;font-size:34px;line-height:1.1;margin:14px 0 22px}`,
    `.atlas-ficha-campos{display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;margin:0}`,
    `.atlas-ficha-campo{margin:0}.atlas-ficha-longo{grid-column:1/-1}`,
    `.atlas-ficha-campo dt{font-family:${mono};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${muted};margin-bottom:4px}`,
    `.atlas-ficha-campo dd{margin:0;font-size:15px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}`,
    `.atlas-ficha-rel{margin-top:30px;border-top:1px solid ${rule}33;padding-top:18px}`,
    `.atlas-ficha-rel h3{font-family:${mono};font-weight:400;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${muted};margin:0 0 10px}`,
    `.atlas-ficha-rel ul{list-style:none;margin:0;padding:0}`,
    `.atlas-ficha-rel li{padding:7px 0;border-bottom:1px solid ${rule}1a;font-size:15px}`,
    `.atlas-ficha-det{color:${muted};font-size:13px;margin-left:8px}`,
    `.atlas-ficha-parcial{margin-top:24px;font-size:12px;color:${muted}}`,
    `@media (max-width:640px){.atlas-ficha{padding:20px 18px 40px}.atlas-ficha-campos{grid-template-columns:1fr}}`,
  ].join('');
}

/** O que o runtime lê de cada tabela (`<script data-atlas-data>`). */
function dadosDoRuntime(tbl: PublicSiteTableData) {
  return {
    id: tabIdDaTabela(tbl.name),
    name: tbl.name,
    label: tbl.label || tbl.name,
    key: tbl.key_column ?? null,
    title: tbl.title_column ?? null,
    // tabela cortada pelo teto: a ficha avisa "lista parcial" (nunca truncar calado)
    partial: !!(tbl.truncated || tbl.budget_exceeded),
    columns: tbl.columns,
    rows: tbl.rows,
  };
}

function TabBar({ theme: t, tabs }: { theme: ThemeConfig; tabs: { id: string; rotulo: string }[] }) {
  if (tabs.length <= 1) return null;
  return (
    <nav
      role="tablist"
      aria-label="Seções do acervo"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        padding: '0 56px',
        borderBottom: `1px solid ${t.colors.rule}33`,
        background: t.colors.bg,
      }}
    >
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={i === 0 ? 'atlas-tab atlas-tab-ativa' : 'atlas-tab'}
          data-atlas-tab={tab.id}
          aria-selected={i === 0}
          style={{
            appearance: 'none',
            background: 'transparent',
            border: 0,
            borderBottom: '2px solid transparent',
            padding: '14px 16px',
            cursor: 'pointer',
            color: t.colors.muted,
            fontFamily: t.typography.mono.family,
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {tab.rotulo}
        </button>
      ))}
    </nav>
  );
}

/* ─────────────────────────── pieces ─────────────────────────── */

/** M8.5 F2 — gráfico congelado + tabela-alternativa OBRIGATÓRIA.
 *
 *  O `svg` vem como string do backend (`chart_svg.py`), não do recharts: a
 *  parede é que recharts não renderiza fora do browser, e tanto o RSC público
 *  (pré-hidratação) quanto o export estático (script-free por contrato)
 *  precisam do gráfico já desenhado.
 *
 *  `dangerouslySetInnerHTML` é seguro AQUI e só aqui porque o SVG é 100% nosso:
 *  gerado por código próprio que escapa todo rótulo do tenant (`_esc` no
 *  gerador — é load-bearing, e há teste provando que `<img onerror>` sai como
 *  `&lt;img` inerte). Não existe outro `dangerouslySetInnerHTML` no repo; se
 *  alguém for copiar este padrão pra conteúdo que NÃO é gerado por nós, não
 *  copie.
 *
 *  A tabela-alternativa usa `<details>` de propósito: é HTML nativo, então
 *  funciona sem JS (o export estático não tem script), é alcançável por leitor
 *  de tela, e dá ao usuário daltônico o número exato que a cor não distingue —
 *  os três requisitos num artefato só, sem dominar a página.
 */
function ChartSection({
  theme: t,
  chart,
  isEditable,
}: {
  theme: ThemeConfig;
  chart: PublicSiteChartData;
  isEditable: boolean;
}) {
  // Gráfico que falhou no publish: some do público (não mostra figura
  // quebrada). No Studio, o admin PRECISA saber que falhou.
  if (chart.error || !chart.svg) {
    if (!isEditable) return null;
    return (
      <section style={{ padding: '24px 56px' }}>
        <p style={{ fontSize: 13, color: t.colors.muted, fontFamily: t.typography.body.family }}>
          Gráfico “{chart.title}” não pôde ser gerado ({chart.error ?? 'sem figura'}).
        </p>
      </section>
    );
  }

  return (
    <section style={{ padding: '32px 56px' }}>
      {/* O título NÃO é repetido aqui: o gerador já o desenha DENTRO do SVG, no
          tema (chart_svg.py), e o SVG carrega `role="img"` + `aria-label` com o
          mesmo texto. Um <h2> aqui imprimia o título duas vezes no site e no
          ZIP — era o follow-up anotado no BUG-CHART01. O impresso panfleto já
          tinha resolvido assim (sem figcaption). */}
      {/* wrapper com scroll próprio: o SVG tem largura fixa e a página não
          pode rolar horizontalmente por causa dele */}
      <div
        style={{ maxWidth: '100%', overflowX: 'auto' }}
        dangerouslySetInnerHTML={{ __html: chart.svg }}
      />

      {chart.warnings && chart.warnings.length > 0 && (
        <p
          style={{
            fontSize: 12,
            color: t.colors.muted,
            fontFamily: t.typography.body.family,
            margin: '8px 0 0',
          }}
        >
          {chart.warnings.join(' · ')}
        </p>
      )}

      {chart.alt_table && chart.alt_table.rows.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary
            style={{
              fontSize: 13,
              color: t.colors.muted,
              fontFamily: t.typography.body.family,
              cursor: 'pointer',
            }}
          >
            Ver os dados deste gráfico
          </summary>
          <div style={{ maxWidth: '100%', overflowX: 'auto', marginTop: 8 }}>
            <table
              style={{
                borderCollapse: 'collapse',
                fontFamily: t.typography.body.family,
                fontSize: 13,
                color: t.colors.ink,
              }}
            >
              <caption style={{ textAlign: 'left', fontSize: 12, color: t.colors.muted, paddingBottom: 6 }}>
                Dados de “{chart.title}”
              </caption>
              <thead>
                <tr>
                  {chart.alt_table.header.map((h) => (
                    <th
                      key={h}
                      scope="col"
                      style={{
                        textAlign: 'left',
                        padding: '6px 12px 6px 0',
                        borderBottom: `1px solid ${t.colors.rule}`,
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.alt_table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        {...(j === 0 ? { scope: 'row' as const } : {})}
                        style={{
                          padding: '6px 12px 6px 0',
                          borderBottom: `1px solid ${t.colors.rule}55`,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function Header({ theme: t, workspaceName, workspaceSlug }: { theme: ThemeConfig; workspaceName: string; workspaceSlug: string }) {
  return (
    <header
      style={{
        padding: '16px 56px',
        borderBottom: `1px solid ${t.colors.rule}33`,
        background: t.colors.bg,
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}
    >
      <span
        style={{
          fontFamily: t.typography.display.family,
          fontStyle: t.typography.display.italic ? 'italic' : 'normal',
          fontSize: 22,
          color: t.colors.ink,
        }}
      >
        {workspaceName}
      </span>
      <span
        style={{
          fontFamily: t.typography.mono.family,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: t.colors.muted,
        }}
      >
        /{workspaceSlug}
      </span>
    </header>
  );
}

function Hero({ theme: t, pad, onCopyEdit }: { theme: ThemeConfig; pad: string; onCopyEdit?: CopyEditHandler }) {
  const isEditable = !!onCopyEdit;

  // contentEditable: salva no blur pra evitar re-render por keystroke.
  // Handlers só existem em modo editável — em render servidor (rota
  // pública / export) nenhum prop de função chega aos elementos.
  const editable = (field: CopyField) =>
    isEditable
      ? {
          contentEditable: true,
          suppressContentEditableWarning: true,
          onBlur: (e: React.FocusEvent<HTMLDivElement>) =>
            onCopyEdit?.(field, e.currentTarget.textContent ?? ''),
        }
      : {};

  return (
    <section style={{ padding: pad, borderBottom: `2px solid ${t.colors.ink}` }}>
      <div
        {...editable('hero_eyebrow')}
        style={{
          fontFamily: t.typography.mono.family,
          fontSize: 11,
          letterSpacing: '0.2em',
          color: t.colors.accent,
          textTransform: 'uppercase',
          marginBottom: 18,
          outline: 'none',
        }}
      >
        {t.copy.hero_eyebrow}
      </div>

      <div
        {...editable('hero_title')}
        style={{
          fontFamily: t.typography.display.family,
          fontStyle: t.typography.display.italic ? 'italic' : 'normal',
          fontWeight: t.typography.display.weight,
          fontSize: t.typography.display.size,
          lineHeight: 0.95,
          color: t.colors.ink,
          maxWidth: 900,
          outline: 'none',
        }}
      >
        {t.copy.hero_title}
      </div>

      <div
        {...editable('hero_sub')}
        style={{
          fontSize: 18,
          color: t.colors.muted,
          maxWidth: 580,
          margin: '24px 0 0',
          lineHeight: 1.5,
          outline: 'none',
        }}
      >
        {t.copy.hero_sub}
      </div>
    </section>
  );
}

/** Milhar com ponto, sem Intl: o SSR (Node) e a hidratação no navegador têm de
 *  produzir o MESMO texto (diferença de ICU vira erro de hidratação, B21). */
function milhar(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function TableSection({ theme: t, table, indice }: { theme: ThemeConfig; table: PublicSiteTableData; indice: IndiceFicha }) {
  const layout = table.layout;
  return (
    <section style={{ padding: '48px 56px', borderBottom: `1px solid ${t.colors.rule}22` }}>
      <div
        style={{
          fontFamily: t.typography.mono.family,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: t.colors.muted,
          marginBottom: 24,
        }}
      >
        {table.label || table.name} · {table.total_rows} {table.total_rows === 1 ? 'registro' : 'registros'}
      </div>
      {table.subtitle && (
        <p style={{ margin: '-12px 0 24px', fontSize: 15, color: t.colors.muted, maxWidth: 720, lineHeight: 1.5 }}>
          {table.subtitle}
        </p>
      )}
      {/* 1.5 (revisão B4): cortada pelo teto, a lista não pode parecer completa —
          com "ordem pelo nome" faltariam nomes do começo do alfabeto, calado. */}
      {table.truncated && (
        <p style={{ margin: '-12px 0 24px', fontSize: 13, color: t.colors.muted }}>
          Mostrando os primeiros {milhar(table.rows.length)} de {milhar(table.total_rows)} registros
          (teto desta versão publicada).
        </p>
      )}

      {layout === 'tabela' && <TabelaLayout theme={t} table={table} indice={indice} />}
      {layout === 'list' && <ListLayout theme={t} table={table} indice={indice} />}
      {layout === 'grid' && <GridLayout theme={t} table={table} indice={indice} />}
      {layout === 'essay' && <EssayLayout theme={t} table={table} indice={indice} />}
    </section>
  );
}

type PublicColumn = { name: string; data_type: string };
type PublicCell = { key: string; value: string; dataType: string };

// Label de download pra file/attachment. O snapshot só carrega a URL (path
// opaco {owner}/{uuid}{ext}), não o original_name (vive em _assets), então
// mostramos a extensão em vez do uuid nu.
function mediaLabel(url: string): string {
  const last = (url.split('/').pop() ?? '').split('?')[0];
  const dot = last.lastIndexOf('.');
  const ext = dot >= 0 ? last.slice(dot + 1).toUpperCase() : '';
  return ext ? `Baixar ${ext}` : 'Baixar arquivo';
}

// Célula de mídia — pura e 100% theme-driven (zero CSS var), pra renderizar
// idêntico nos 3 contextos (Studio client, RSC público, renderToStaticMarkup
// do export). NÃO reusa MediaPreview (é 'use client' + CSS vars do admin-shell
// que não existem no <head> do export → quebraria o render estático).
function MediaCell({ url, mediaType, theme: t, size }: { url: string; mediaType: string; theme: ThemeConfig; size: 'sm' | 'md' }) {
  if (mediaType === 'image') {
    const maxH = size === 'md' ? 180 : 96;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        style={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: maxH,
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          border: `1px solid ${t.colors.rule}33`,
          borderRadius: t.layout.radius,
        }}
      />
    );
  }
  // file / attachment → link de download + glyph
  return (
    <a
      href={url}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: t.typography.mono.family,
        fontSize: 12,
        letterSpacing: '0.04em',
        color: t.colors.accent,
        textDecoration: 'none',
        wordBreak: 'break-all',
      }}
    >
      <Icon name={mediaType === 'attachment' ? 'paperclip' : 'download'} size={13} color={t.colors.accent} />
      {mediaLabel(url)}
    </a>
  );
}

// Renderiza o valor de uma célula: mídia vira <img>/<a>, resto vira texto.
function renderCell(cell: PublicCell, t: ThemeConfig, size: 'sm' | 'md'): React.ReactNode {
  if (cell.value && isMediaBackendType(cell.dataType)) {
    return <MediaCell url={cell.value} mediaType={cell.dataType} theme={t} size={size} />;
  }
  return cell.value;
}

function rowDisplay(row: Record<string, unknown>, table: PublicSiteTableData, indice: IndiceFicha) {
  // Título: o `title_column` resolvido pelo backend (1.4); snapshot antigo cai
  // na heurística de sempre (1ª coluna NÃO-mídia, igual DataViewer/F2b, pra
  // não pôr uma URL no título). Meta e resto: só colunas da listagem, e FK
  // aparece como o nome do registro apontado. Mídia cai nos slots meta/rest e
  // renderiza inline.
  const cols = table.columns.filter((c) => c.name !== 'id' && naGrade(c));
  const configurado = table.title_column
    ? table.columns.find((c) => c.name === table.title_column && !isMediaBackendType(c.data_type))
    : undefined;
  const titleCol = configurado ?? cols.find((c) => !isMediaBackendType(c.data_type)) ?? cols[0];
  const others = cols.filter((c) => c.name !== titleCol?.name);
  const cell = (c?: PublicColumn): PublicCell | null =>
    c ? { key: c.name, value: indice.celula(table, c.name, row).texto, dataType: c.data_type } : null;
  return {
    title: cell(titleCol) ?? { key: '', value: '', dataType: 'String' },
    titleHref: indice.href(table, row),
    meta: cell(others[0]),
    rest: others.slice(1).map((c) => cell(c)!),
  };
}

/** Título do item nos layouts editoriais: vira link pra ficha quando há chave. */
function TituloDoItem({ d, t }: { d: ReturnType<typeof rowDisplay>; t: ThemeConfig }) {
  const conteudo = renderCell(d.title, t, 'md');
  return d.titleHref ? <a className="atlas-link" href={d.titleHref}>{conteudo}</a> : <>{conteudo}</>;
}

/** Quantas linhas vêm no HTML. O runtime assume dali e pagina o resto do JSON. */
const PRIMEIRA_PAGINA = 25;

/**
 * Layout `tabela` (1.3) — a grade que o Diretor pediu: filtro por coluna,
 * paginação 25/50/100 e download em Excel do que está filtrado.
 *
 * O markup é **inerte**: quem dá comportamento é o `PUBLIC_SITE_RUNTIME`, JS
 * puro que roda igual no site e dentro do ZIP. Aqui só saem os ganchos
 * (`data-atlas-*`) que ele procura.
 *
 * As linhas aparecem DUAS vezes de propósito: as 25 primeiras como `<tr>` de
 * verdade (a página funciona sem JS, é indexável e não pisca no primeiro
 * paint) e todas dentro de um `<script type="application/json">` que o runtime
 * lê pra filtrar e paginar. O custo é o dobro de bytes só da primeira página.
 */
function TabelaLayout({ theme: t, table, indice }: { theme: ThemeConfig; table: PublicSiteTableData; indice: IndiceFicha }) {
  // 1.4: a grade mostra só as colunas `grade`; as `ficha` viajam no JSON (a
  // ficha e o Excel usam) mas não viram coluna.
  const cols = table.columns.filter(naGrade);
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: `2px solid ${t.colors.ink}`,
    fontFamily: t.typography.mono.family,
    fontSize: 10,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: t.colors.ink,
    whiteSpace: 'nowrap',
  };
  const controle: React.CSSProperties = {
    font: 'inherit',
    fontFamily: t.typography.mono.family,
    fontSize: 12,
    padding: '6px 8px',
    background: t.colors.bg,
    color: t.colors.ink,
    border: `1px solid ${t.colors.rule}66`,
    borderRadius: t.layout.radius,
  };

  return (
    <div data-atlas-table={table.name}>
      {/* Dado completo pro runtime. `jsonParaScript` escapa < > & — sem isso,
          uma célula com `</script>` fecharia o bloco e o resto do arquivo
          viraria HTML executável (no JSX o React escapava por nós). */}
      <script
        type="application/json"
        data-atlas-data
        dangerouslySetInnerHTML={{
          __html: jsonParaScript(dadosDoRuntime(table)),
        }}
      />

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 14,
      }}>
        <span data-atlas-count style={{
          fontFamily: t.typography.mono.family, fontSize: 11, color: t.colors.muted,
        }}>
          {table.total_rows} {table.total_rows === 1 ? 'registro' : 'registros'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontFamily: t.typography.mono.family, fontSize: 11, color: t.colors.muted }}>
            por página{' '}
            <select data-atlas-pagesize defaultValue="25" style={controle}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
          <button type="button" data-atlas-export style={{ ...controle, cursor: 'pointer' }}>
            Baixar Excel
          </button>
        </div>
      </div>

      <FaixaDeFiltros theme={t} table={table} indice={indice} controle={controle} />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>{cols.map((c) => <th key={c.name} scope="col" style={th}>{rotuloColuna(c)}</th>)}</tr>
            <tr>
              {cols.map((c) => (
                <th key={c.name} style={{ padding: '6px 12px', borderBottom: `1px solid ${t.colors.rule}33` }}>
                  {/* 1.5: só a caixa de texto mora no cabeçalho; lista e data
                      vão pra faixa acima (select não cabe em coluna estreita). */}
                  {(c.filter ?? 'texto') === 'texto' && (
                    <input
                      data-atlas-filter={c.name}
                      type="text"
                      placeholder="filtrar…"
                      aria-label={`Filtrar por ${rotuloColuna(c)}`}
                      style={{ ...controle, width: '100%', minWidth: 90 }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-atlas-body>
            {/* lista vazia: a mesma linha que o runtime desenha (SSR = runtime) */}
            {table.rows.length === 0 && (
              <tr>
                <td className="atlas-vazio" colSpan={Math.max(1, cols.length)}>
                  {table.truncated || table.budget_exceeded
                    ? 'Registros fora desta versão publicada pelo teto de tamanho.'
                    : 'Nenhum registro.'}
                </td>
              </tr>
            )}
            {table.rows.slice(0, PRIMEIRA_PAGINA).map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.name} className="atlas-td" style={{
                    padding: '9px 12px',
                    borderBottom: `1px solid ${t.colors.rule}22`,
                    verticalAlign: 'top',
                  }}>
                    <CelulaDaGrade cel={indice.celula(table, c.name, row)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div data-atlas-pager style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap',
        fontFamily: t.typography.mono.family, fontSize: 11, color: t.colors.muted,
      }} />
    </div>
  );
}

/** 1.5: opções do filtro de lista — o que a célula MOSTRA (FK pelo nome, data
 *  em dd/mm/aaaa), sem repetir o que só difere em acento ou caixa ("Masculino"
 *  e "masculino" viram uma), em ordem do texto normalizado. Comparação simples
 *  em vez de `localeCompare`: SSR (Node) e navegador têm de dar a mesma ordem. */
export function opcoesDaLista(table: PublicSiteTableData, coluna: string, indice: IndiceFicha): string[] {
  const vistos = new Map<string, string>();
  for (const linha of table.rows) {
    const texto = indice.celula(table, coluna, linha).texto.trim();
    if (!texto) continue;
    const chave = normalizaTexto(texto);
    if (!vistos.has(chave)) vistos.set(chave, texto);
  }
  return [...vistos.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map((e) => e[1]);
}

/**
 * 1.5: filtros que não são a caixa de texto da grade — lista (select), data
 * (de/até) e o texto de coluna "Só na ficha" (o antigo filtra estado, raça e
 * sede, que não aparecem na grade). Desenhados no SSR; o runtime só LÊ (B21:
 * criar ou reescrever opção depois da hidratação é o que quebrava o React).
 */
function FaixaDeFiltros({ theme: t, table, indice, controle }: {
  theme: ThemeConfig; table: PublicSiteTableData; indice: IndiceFicha; controle: React.CSSProperties;
}) {
  const filtros = table.columns.filter((c) => {
    const f = c.filter ?? (naGrade(c) ? 'texto' : 'nenhum');
    if (f === 'nenhum' || c.placement === 'oculta') return false;
    return f !== 'texto' || !naGrade(c);
  });
  if (filtros.length === 0) return null;
  const rotuloEstilo: React.CSSProperties = {
    fontFamily: t.typography.mono.family, fontSize: 10, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: t.colors.muted, display: 'block', marginBottom: 4,
  };
  // cada filtro é uma coluna (rótulo em cima, controle embaixo): o par de/até
  // e o select ficam com o rótulo na mesma altura
  const item: React.CSSProperties = { display: 'inline-flex', flexDirection: 'column' };
  return (
    <div data-atlas-faixa style={{
      display: 'flex', flexWrap: 'wrap', gap: '12px 20px', alignItems: 'flex-end',
      padding: '14px 0 16px', marginBottom: 6, borderTop: `1px solid ${t.colors.rule}22`,
    }}>
      {filtros.map((c) => {
        const rotulo = rotuloColuna(c);
        const f = c.filter ?? 'texto';
        if (f === 'lista') {
          return (
            <label key={c.name} style={item}>
              <span style={rotuloEstilo}>{rotulo}</span>
              <select data-atlas-filter={c.name} data-atlas-filtro="lista" defaultValue="" style={controle}>
                <option value="">Todos</option>
                {opcoesDaLista(table, c.name, indice).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          );
        }
        if (f === 'data') {
          return (
            <span key={c.name} style={item}>
              <span style={rotuloEstilo}>{rotulo}</span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: t.colors.muted }}>
                de
                <input type="date" data-atlas-filter={c.name} data-atlas-filtro="de"
                       aria-label={`${rotulo}: a partir de`} style={controle} />
                até
                <input type="date" data-atlas-filter={c.name} data-atlas-filtro="ate"
                       aria-label={`${rotulo}: até`} style={controle} />
              </span>
            </span>
          );
        }
        return (
          <label key={c.name} style={item}>
            <span style={rotuloEstilo}>{rotulo}</span>
            <input type="text" data-atlas-filter={c.name} placeholder="filtrar…"
                   aria-label={`Filtrar por ${rotulo}`} style={controle} />
          </label>
        );
      })}
    </div>
  );
}

/** Mesma regra do runtime (`celula`), pra o HTML servido bater com o que o JS
 *  redesenha: título da linha e FK viram link pra ficha; o resto, texto. */
function CelulaDaGrade({ cel }: { cel: { texto: string; href: string | null } }) {
  return cel.href ? <a className="atlas-link" href={cel.href}>{cel.texto}</a> : <>{cel.texto}</>;
}

function ListLayout({ theme: t, table, indice }: { theme: ThemeConfig; table: PublicSiteTableData; indice: IndiceFicha }) {
  return (
    <div>
      {table.rows.map((row, i) => {
        const d = rowDisplay(row, table, indice);
        return (
          <article
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 24,
              padding: '18px 0',
              borderBottom: `1px solid ${t.colors.rule}22`,
              alignItems: 'baseline',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: t.typography.display.family,
                  fontStyle: t.typography.display.italic ? 'italic' : 'normal',
                  fontSize: 22,
                  color: t.colors.ink,
                  lineHeight: 1.2,
                }}
              >
                <TituloDoItem d={d} t={t} />
              </div>
              {d.meta?.value && (
                <div style={{ marginTop: 4, fontSize: 13, color: t.colors.muted }}>
                  {renderCell(d.meta, t, 'sm')}
                </div>
              )}
            </div>
            {d.rest[0]?.value && (
              <div
                style={{
                  fontFamily: t.typography.mono.family,
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: t.colors.muted,
                }}
              >
                {renderCell(d.rest[0], t, 'sm')}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function GridLayout({ theme: t, table, indice }: { theme: ThemeConfig; table: PublicSiteTableData; indice: IndiceFicha }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 18,
      }}
    >
      {table.rows.map((row, i) => {
        const d = rowDisplay(row, table, indice);
        return (
          <article
            key={i}
            style={{
              padding: 18,
              background: t.colors.surface,
              border: `1px solid ${t.colors.rule}33`,
              borderRadius: t.layout.radius,
            }}
          >
            <div
              style={{
                fontFamily: t.typography.display.family,
                fontStyle: t.typography.display.italic ? 'italic' : 'normal',
                fontSize: 18,
                color: t.colors.ink,
                lineHeight: 1.25,
                marginBottom: 8,
              }}
            >
              <TituloDoItem d={d} t={t} />
            </div>
            {d.meta?.value && (
              <div style={{ fontSize: 12, color: t.colors.muted }}>{renderCell(d.meta, t, 'md')}</div>
            )}
            {d.rest[0]?.value && (
              <div
                style={{
                  marginTop: 12,
                  fontFamily: t.typography.mono.family,
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: t.colors.accent,
                }}
              >
                {renderCell(d.rest[0], t, 'sm')}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function EssayLayout({ theme: t, table, indice }: { theme: ThemeConfig; table: PublicSiteTableData; indice: IndiceFicha }) {
  return (
    <div style={{ maxWidth: 640 }}>
      {table.rows.map((row, i) => {
        const d = rowDisplay(row, table, indice);
        return (
          <article
            key={i}
            style={{
              padding: '32px 0',
              borderTop: i === 0 ? 'none' : `1px solid ${t.colors.rule}22`,
            }}
          >
            <div
              style={{
                fontFamily: t.typography.mono.family,
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: t.colors.accent,
                marginBottom: 10,
              }}
            >
              № {String(i + 1).padStart(2, '0')}
            </div>
            <h3
              style={{
                fontFamily: t.typography.display.family,
                fontStyle: t.typography.display.italic ? 'italic' : 'normal',
                fontSize: 32,
                color: t.colors.ink,
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              <TituloDoItem d={d} t={t} />
            </h3>
            {d.meta?.value && (
              <p style={{ fontSize: 15, color: t.colors.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
                {renderCell(d.meta, t, 'md')}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Footer({
  theme: t,
  slug,
  printLinks,
  versionNumber,
  publishedAt,
}: {
  theme: ThemeConfig;
  slug: string;
  printLinks: boolean;
  versionNumber?: number;
  publishedAt?: string;
}) {
  // `<a>` cru, não `next/link`: o rodapé precisa funcionar sem JS (mesmo
  // princípio do `<details>` da tabela-alternativa) e este componente também é
  // serializado fora do app pelo export.
  const linkStyle: React.CSSProperties = {
    color: t.colors.accent,
    textDecoration: 'none',
    borderBottom: `1px solid ${t.colors.accent}55`,
    paddingBottom: 1,
  };
  return (
    <footer
      style={{
        // empurra o rodapé pro fim da janela quando o painel é curto
        marginTop: 'auto',
        padding: '32px 56px',
        borderTop: `1px solid ${t.colors.rule}33`,
        fontFamily: t.typography.mono.family,
        fontSize: 10,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: t.colors.muted,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <span>{t.copy.footer_note}</span>
      {printLinks ? (
        <nav aria-label="Versões imprimíveis" style={{ display: 'flex', gap: 20 }}>
          <a href={`/${slug}/panfleto`} style={linkStyle}>Panfleto</a>
          <a href={`/${slug}/academico`} style={linkStyle}>Versão acadêmica</a>
        </nav>
      ) : null}
      {/* O snapshot é congelado por decisão (M6): não se atualiza sozinho. Isso
          só é honesto se disser DE QUANDO ele é — senão um gráfico de meses
          atrás se apresenta como o número de hoje. O `<time>` carrega o valor
          legível por máquina; o texto, o legível por gente. */}
      {publishedAt ? (
        <span>
          {versionNumber != null ? `Versão ${versionNumber} · ` : ''}
          publicado em <time dateTime={publishedAt}>{formatPublishedDate(publishedAt)}</time>
        </span>
      ) : null}
      <span>Publicado via Atlas</span>
    </footer>
  );
}
