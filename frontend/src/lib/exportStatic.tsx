/**
 * Export estático (M6 Fase 5) — gera o pacote ZIP standalone de uma
 * versão publicada, reusando o <PublicSite> (decisão de locus registrada
 * em .speckit/specs/M6_fase5_export.md).
 *
 * Server-only: usado pelo route handler /api/export/[versionId].
 * O HTML carrega dados inline (file:// bloqueia fetch local) e as
 * fontes vão como woff2 em assets/fonts/ (offline real — decisão #2).
 */
import React from 'react';
import JSZip from 'jszip';
import { PublicSite, type PublicSiteTableData } from '@/components/publish/PublicSite';
import type { ThemeConfig } from '@/contexts/PublishContext';

export interface SnapshotPayload {
  schema_version: 1;
  owner: { workspace_slug: string | null; workspace_name: string | null };
  version_number: number;
  created_at: string;
  description: string | null;
  theme: ThemeConfig;
  tables: {
    name: string;
    layout: 'list' | 'grid' | 'essay';
    columns: { name: string; data_type: string }[];
    rows: Record<string, unknown>[];
    truncated: boolean;
    total_rows: number;
    error?: string;
  }[];
}

/* ─────────────────── fontes: Google css2 → woff2 locais ─────────────────── */

// UA moderno → css2 responde woff2 com unicode-range
const FONT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Famílias que os presets/pickers do Studio oferecem (PublishContext).
// Fora desta lista = fonte de sistema, não precisa embutir.
const GOOGLE_FAMILIES = new Set([
  'Fraunces',
  'EB Garamond',
  'IBM Plex Serif',
  'IBM Plex Sans',
  'IBM Plex Mono',
  'Inter',
  'JetBrains Mono',
]);

/** Primeiro nome da stack CSS: `"'Fraunces', Georgia, serif"` → `Fraunces`. */
function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/** Coleta as variantes (ital,wght) necessárias por família Google. */
function collectFontRequests(theme: ThemeConfig): Map<string, Set<string>> {
  const wanted = new Map<string, Set<string>>();
  const add = (stack: string, italic: boolean, weight: number) => {
    const fam = firstFamily(stack);
    if (!GOOGLE_FAMILIES.has(fam)) return;
    if (!wanted.has(fam)) wanted.set(fam, new Set());
    wanted.get(fam)!.add(`${italic ? 1 : 0},${weight}`);
  };
  add(theme.typography.display.family, theme.typography.display.italic, theme.typography.display.weight);
  add(theme.typography.body.family, false, 400);
  add(theme.typography.mono.family, false, 400);
  return wanted;
}

// Cache por URL css2 — fontes não mudam entre exports do mesmo tema.
const fontCssCache = new Map<string, string>();
const fontFileCache = new Map<string, Buffer>();

export interface FontBundle {
  /** CSS @font-face com urls reescritas pra ./assets/fonts/... */
  css: string;
  /** fname → bytes woff2 */
  files: Map<string, Buffer>;
}

export async function buildFontBundle(theme: ThemeConfig): Promise<FontBundle> {
  const wanted = collectFontRequests(theme);
  if (wanted.size === 0) return { css: '', files: new Map() };

  const familyParams = [...wanted.entries()].map(([fam, tuples]) => {
    // css2 exige tuplas ordenadas (ital asc, wght asc)
    const sorted = [...tuples].sort();
    return `family=${fam.replaceAll(' ', '+')}:ital,wght@${sorted.join(';')}`;
  });
  const cssUrl = `https://fonts.googleapis.com/css2?${familyParams.join('&')}&display=swap`;

  let css = fontCssCache.get(cssUrl);
  if (!css) {
    const res = await fetch(cssUrl, { headers: { 'User-Agent': FONT_UA } });
    if (!res.ok) throw new Error(`Google Fonts css2 ${res.status}`);
    css = await res.text();
    fontCssCache.set(cssUrl, css);
  }

  const files = new Map<string, Buffer>();
  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g) ?? [])];
  for (const url of urls) {
    const fname = url.split('/').slice(-2).join('-');
    let buf = fontFileCache.get(url);
    if (!buf) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`woff2 ${r.status}: ${url}`);
      buf = Buffer.from(await r.arrayBuffer());
      fontFileCache.set(url, buf);
    }
    files.set(fname, buf);
    css = css.replaceAll(url, `./assets/fonts/${fname}`);
  }
  return { css, files };
}

/* ─────────────────── HTML standalone ─────────────────── */

export async function buildStandaloneHtml(snap: SnapshotPayload, fontCss: string): Promise<string> {
  // Import dinâmico: react-dom/server não pode ser top-level em módulos
  // que o bundler do app router analisa como código de componente.
  const { renderToStaticMarkup } = await import('react-dom/server');

  const tables: PublicSiteTableData[] = snap.tables.map((t, idx) => ({
    table_id: idx,
    name: t.name,
    layout: t.layout,
    columns: t.columns,
    rows: t.rows,
    total_rows: t.total_rows,
  }));

  const markup = renderToStaticMarkup(
    <PublicSite
      themeConfig={snap.theme}
      tables={tables}
      workspaceName={snap.owner.workspace_name ?? 'Workspace'}
      workspaceSlug={snap.owner.workspace_slug ?? 'workspace'}
    />,
  );

  const title = `${snap.owner.workspace_name ?? 'Workspace'} · Atlas`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${fontCss}
html, body { margin: 0; padding: 0; height: 100%; }
* { box-sizing: border-box; }
</style>
</head>
<body>
${markup}
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/* ─────────────────── README honesto ─────────────────── */

export function buildReadme(snap: SnapshotPayload): string {
  const created = new Date(snap.created_at);
  const dateStr = isNaN(created.getTime()) ? snap.created_at : created.toISOString().slice(0, 10);
  const truncatedTables = snap.tables.filter((t) => t.truncated);

  const truncNote = truncatedTables.length
    ? [
        '',
        '## ⚠ Tabelas truncadas',
        '',
        'Este pacote congela o snapshot como ele foi publicado. As tabelas abaixo',
        'tinham mais linhas do que o limite por tabela e estão INCOMPLETAS aqui:',
        '',
        ...truncatedTables.map(
          (t) => `- \`${t.name}\`: ${t.rows.length} linhas incluídas de ${t.total_rows} no total`,
        ),
      ]
    : [];

  return [
    `# ${snap.owner.workspace_name ?? 'Workspace'} — site estático`,
    '',
    `Exportado do Atlas em ${new Date().toISOString().slice(0, 10)}.`,
    '',
    `- **Versão publicada:** v${snap.version_number}${snap.description ? ` — “${snap.description}”` : ''}`,
    `- **Publicada em:** ${dateStr}`,
    `- **Workspace:** /${snap.owner.workspace_slug ?? ''}`,
    '',
    'Os dados deste pacote são um retrato do momento da publicação — eles NÃO',
    'se atualizam quando o workspace muda no Atlas.',
    ...truncNote,
    '',
    '## Como abrir',
    '',
    'Duplo-clique em `index.html`. Funciona offline, em qualquer navegador —',
    'as fontes estão embutidas em `assets/fonts/`.',
    '',
    '## Como hospedar',
    '',
    'O pacote é um site estático puro. Suba a pasta inteira em qualquer host',
    'estático (Vercel, Netlify, GitHub Pages, S3, nginx). Nenhum build é',
    'necessário — o `index.html` já é o site.',
    '',
    '## Arquivos',
    '',
    '- `index.html` — o site, com dados inline',
    '- `assets/fonts/` — fontes woff2 (licença SIL OFL)',
    '- `snapshot.json` — o snapshot bruto desta versão (artefato de arquivo;',
    '  o site não depende dele)',
    '',
    '---',
    'Publicado via Atlas.',
    '',
  ].join('\n');
}

/* ─────────────────── ZIP ─────────────────── */

export interface ExportResult {
  fileName: string;
  buffer: Buffer;
}

export async function buildExportZip(snap: SnapshotPayload): Promise<ExportResult> {
  const fonts = await buildFontBundle(snap.theme);
  const html = await buildStandaloneHtml(snap, fonts.css);

  const zip = new JSZip();
  zip.file('index.html', html);
  zip.file('README.md', buildReadme(snap));
  zip.file('snapshot.json', JSON.stringify(snap, null, 2));
  for (const [fname, buf] of fonts.files) {
    zip.file(`assets/fonts/${fname}`, buf);
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    streamFiles: true,
  });

  const slug = snap.owner.workspace_slug ?? 'workspace';
  return { fileName: `${slug}-v${snap.version_number}.zip`, buffer };
}
