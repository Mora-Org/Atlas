'use client';

import React from 'react';
import { ThemeConfig, LayoutType, usePublish } from '@/contexts/PublishContext';

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
  isEditable?: boolean;
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
  isEditable = false,
}: PublicSiteProps) {
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
      <Hero theme={t} pad={heroPad} isEditable={isEditable} />
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

function Hero({ theme: t, pad, isEditable }: { theme: ThemeConfig; pad: string; isEditable: boolean }) {
  const { patch } = usePublish();
  const editable = isEditable ? { contentEditable: true, suppressContentEditableWarning: true } : {};

  // contentEditable: salva no blur pra evitar re-render por keystroke
  const onBlur = (field: 'hero_eyebrow' | 'hero_title' | 'hero_sub') =>
    (e: React.FocusEvent<HTMLDivElement>) => {
      if (!isEditable) return;
      patch(`copy.${field}`, e.currentTarget.textContent ?? '');
    };

  return (
    <section style={{ padding: pad, borderBottom: `2px solid ${t.colors.ink}` }}>
      <div
        {...editable}
        onBlur={onBlur('hero_eyebrow')}
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
        {...editable}
        onBlur={onBlur('hero_title')}
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
        {...editable}
        onBlur={onBlur('hero_sub')}
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

function rowDisplay(row: Record<string, unknown>, columns: { name: string }[]) {
  // Heurística simples: primeira string-like = title; segunda = meta; resto = secundárias
  const cols = columns.filter((c) => c.name !== 'id');
  const titleCol = cols[0]?.name;
  const metaCol = cols[1]?.name;
  return {
    title: String(row[titleCol] ?? ''),
    meta: metaCol ? String(row[metaCol] ?? '') : '',
    rest: cols.slice(2).map((c) => ({ key: c.name, value: String(row[c.name] ?? '') })),
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
                {d.title}
              </div>
              {d.meta && (
                <div style={{ marginTop: 4, fontSize: 13, color: t.colors.muted }}>
                  {d.meta}
                </div>
              )}
            </div>
            {d.rest.length > 0 && (
              <div
                style={{
                  fontFamily: t.typography.mono.family,
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: t.colors.muted,
                }}
              >
                {d.rest[0].value}
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
              {d.title}
            </div>
            {d.meta && (
              <div style={{ fontSize: 12, color: t.colors.muted }}>{d.meta}</div>
            )}
            {d.rest.length > 0 && (
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
                {d.rest[0].value}
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
              {d.title}
            </h3>
            {d.meta && (
              <p style={{ fontSize: 15, color: t.colors.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
                {d.meta}
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
