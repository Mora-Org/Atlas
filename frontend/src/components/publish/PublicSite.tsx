// Sem 'use client' de propósito: este componente precisa renderizar em
// 3 contextos — Studio (client), rota pública (RSC) e export estático
// (renderToStaticMarkup em route handler). Handlers de edição só são
// anexados quando `onCopyEdit` existe (Studio), então o render servidor
// nunca recebe função em elemento host.
import React from 'react';
import { ThemeConfig, LayoutType } from '@/contexts/PublishContext';
// Import direto (não pelo barrel @/components/ui, que reexporta módulos
// 'use client') pra manter este arquivo renderizável no export estático.
import Icon from '@/components/ui/Icon';
import { isMediaBackendType } from '@/lib/columnTypes';

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
  columns: { name: string; data_type: string }[];
  rows: Record<string, unknown>[];
  total_rows: number;
}

export interface PublicSiteProps {
  themeConfig: ThemeConfig;
  tables: PublicSiteTableData[];
  workspaceName?: string;
  workspaceSlug?: string;
  previewLayout?: LayoutType; // sobrescreve layout das tabelas no preview
  /** Quando definido, hero vira contentEditable e dispara onCopyEdit no blur.
   *  Quando undefined (rota pública), hero é estático. */
  onCopyEdit?: CopyEditHandler;
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
  workspaceName = 'Workspace',
  workspaceSlug = 'workspace',
  previewLayout,
  onCopyEdit,
}: PublicSiteProps) {
  const isEditable = !!onCopyEdit;
  // Em modo editor, se não tem tabela selecionada, mostra dado-exemplo
  // pra que admin veja como vai ficar.
  const tablesForRender = tables.length > 0
    ? tables
    : isEditable
      ? [{ ...SAMPLE_TABLE, layout: previewLayout ?? t.layout.default_table_layout }]
      : [];

  const heroPad =
    t.layout.density === 'comfy' ? '72px 56px 56px'
      : t.layout.density === 'regular' ? '56px 56px 40px'
        : '40px 56px 28px';

  return (
    <div
      style={{
        background: t.colors.bg,
        color: t.colors.ink,
        fontFamily: t.typography.body.family,
        minHeight: '100%',
        width: '100%',
      }}
    >
      <Header theme={t} workspaceName={workspaceName} workspaceSlug={workspaceSlug} />
      <Hero theme={t} pad={heroPad} onCopyEdit={onCopyEdit} />
      {tablesForRender.map((tbl) => (
        <TableSection
          key={tbl.table_id}
          theme={t}
          table={tbl}
          layoutOverride={previewLayout}
        />
      ))}
      <Footer theme={t} />
    </div>
  );
}

/* ─────────────────────────── pieces ─────────────────────────── */

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

function TableSection({ theme: t, table, layoutOverride }: { theme: ThemeConfig; table: PublicSiteTableData; layoutOverride?: LayoutType }) {
  const layout = layoutOverride ?? table.layout;
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
        {table.name} · {table.total_rows} {table.total_rows === 1 ? 'registro' : 'registros'}
      </div>

      {layout === 'list' && <ListLayout theme={t} table={table} />}
      {layout === 'grid' && <GridLayout theme={t} table={table} />}
      {layout === 'essay' && <EssayLayout theme={t} table={table} />}
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

function rowDisplay(row: Record<string, unknown>, columns: PublicColumn[]) {
  // Heurística: 1ª coluna NÃO-mídia = title (igual DataViewer/F2b, pra não
  // pôr uma URL no título); depois meta; resto = secundárias. Mídia cai
  // naturalmente nos slots meta/rest e renderiza inline.
  const cols = columns.filter((c) => c.name !== 'id');
  const titleCol = cols.find((c) => !isMediaBackendType(c.data_type)) ?? cols[0];
  const others = cols.filter((c) => c !== titleCol);
  const cell = (c?: PublicColumn): PublicCell | null =>
    c ? { key: c.name, value: String(row[c.name] ?? ''), dataType: c.data_type } : null;
  return {
    title: cell(titleCol) ?? { key: '', value: '', dataType: 'String' },
    meta: cell(others[0]),
    rest: others.slice(1).map((c) => cell(c)!),
  };
}

function ListLayout({ theme: t, table }: { theme: ThemeConfig; table: PublicSiteTableData }) {
  return (
    <div>
      {table.rows.map((row, i) => {
        const d = rowDisplay(row, table.columns);
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
                {renderCell(d.title, t, 'md')}
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

function GridLayout({ theme: t, table }: { theme: ThemeConfig; table: PublicSiteTableData }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 18,
      }}
    >
      {table.rows.map((row, i) => {
        const d = rowDisplay(row, table.columns);
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
              {renderCell(d.title, t, 'md')}
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

function EssayLayout({ theme: t, table }: { theme: ThemeConfig; table: PublicSiteTableData }) {
  return (
    <div style={{ maxWidth: 640 }}>
      {table.rows.map((row, i) => {
        const d = rowDisplay(row, table.columns);
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
              {renderCell(d.title, t, 'md')}
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

function Footer({ theme: t }: { theme: ThemeConfig }) {
  return (
    <footer
      style={{
        padding: '32px 56px',
        borderTop: `1px solid ${t.colors.rule}33`,
        fontFamily: t.typography.mono.family,
        fontSize: 10,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: t.colors.muted,
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>{t.copy.footer_note}</span>
      <span>Publicado via Atlas</span>
    </footer>
  );
}
