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
import { PublicSite, type PublicSiteTableData, type PublicSiteChartData } from '@/components/publish/PublicSite';
import { isMediaBackendType } from '@/lib/columnTypes';
import { resolverFonte, type ArquivoFonte } from '@/lib/fontManifest';
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
  // M8.5 F2: gráficos congelados. O SVG já vem desenhado do publish, então o
  // ZIP (que é script-free por contrato) carrega o gráfico sem nenhum JS.
  charts?: PublicSiteChartData[];
}

/* ─────────────────── fontes: arquivos versionados → ZIP ─────────────────── */

/* B14 — isto aqui BAIXAVA de `fonts.googleapis.com` + `fonts.gstatic.com` a
 * cada export, e levantava (`throw`) quando a resposta não vinha. Ou seja: o
 * ZIP, cujo contrato é ser OFFLINE, dependia da rede pra ser produzido — e a
 * mesma CDN que derrubou o build em 14/08/2026 derrubaria o export do cliente,
 * em produção, sem nenhuma mudança nossa.
 *
 * Agora lê de `src/fonts/`, os mesmos arquivos que o `layout.tsx` usa, pelo
 * manifesto compartilhado. Sem rede, sem cache, sem modo de falha.
 *
 * O `outputFileTracingIncludes` no `next.config.ts` é o que garante que os
 * `.woff2` acompanhem esta rota no bundle serverless da Vercel — sem ele o
 * `readFile` acha o caminho em dev e falha em produção. */

/** Primeiro nome da stack CSS: `"'Fraunces', Georgia, serif"` → `Fraunces`. */
function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/** As variantes que o tema exige, já resolvidas em arquivo local. */
function collectFontRequests(theme: ThemeConfig): ArquivoFonte[] {
  const pedidos: Array<[string, boolean, number]> = [
    [theme.typography.display.family, theme.typography.display.italic, theme.typography.display.weight],
    [theme.typography.body.family, false, 400],
    [theme.typography.mono.family, false, 400],
  ];
  const achados = new Map<string, ArquivoFonte & { familia: string }>();
  for (const [stack, italico, peso] of pedidos) {
    const familia = firstFamily(stack);
    const fonte = resolverFonte(familia, italico, peso);
    // Família fora do manifesto = fonte de sistema (Georgia, monospace…), que
    // não se embute mesmo. Degradar é o certo aqui: o resto do ZIP continua
    // válido e a stack CSS do tema já traz o fallback.
    if (!fonte) continue;
    achados.set(fonte.arquivo, { ...fonte, familia });
  }
  return [...achados.values()];
}

export interface FontBundle {
  /** CSS @font-face apontando pra ./assets/fonts/... */
  css: string;
  /** fname → bytes woff2 */
  files: Map<string, Buffer>;
}

/** Diretório das fontes versionadas. Ver `outputFileTracingIncludes`. */
async function dirFontes() {
  const path = await import('node:path');
  return path.join(process.cwd(), 'src', 'fonts');
}

export async function buildFontBundle(theme: ThemeConfig): Promise<FontBundle> {
  const variantes = collectFontRequests(theme) as Array<ArquivoFonte & { familia: string }>;
  if (variantes.length === 0) return { css: '', files: new Map() };

  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = await dirFontes();

  const files = new Map<string, Buffer>();
  const blocos: string[] = [];
  for (const v of variantes) {
    files.set(v.arquivo, await readFile(path.join(dir, v.arquivo)));
    blocos.push(
      `@font-face{font-family:'${v.familia}';font-style:${v.italico ? 'italic' : 'normal'};` +
        `font-weight:${v.peso};font-display:swap;` +
        `src:url(./assets/fonts/${v.arquivo}) format('woff2');}`
    );
  }
  return { css: blocos.join('\n'), files };
}

/* ─────────────────── mídia: URLs do snapshot → assets/media/ ─────────────────── */

// Marcadores ESTRUTURAIS de uma URL de mídia NOSSA (independem de env, pra
// não virar no-op silencioso se o prefixo do bucket não estiver no env
// server-side). URL externa (Imgur etc.) não casa e fica como link absoluto —
// não dá pra embutir binário de terceiro de qualquer jeito.
const MANAGED_MEDIA_MARKERS = [
  '/storage/v1/object/public/workspace-media/',
  '/api/assets/dev/',
];

// Tetos de embutir (anti-OOM na função serverless Vercel/Next — o ZIP é
// materializado inteiro em RAM via nodebuffer). Acima do teto degrada pra
// LINK-MODE: mantém a URL absoluta (funciona online), sem corte silencioso.
// Números PINADOS na F5 (fechamento do M8): 120MB fica abaixo da RAM típica
// da função (~2×120MB com o nodebuffer) e acima da quota de 250MB raramente
// referenciada inteira num snapshot; o gate (validate-media.mjs, check 6)
// guarda o caminho abaixo-do-teto.
const MEDIA_MAX_FILES = 300;
const MEDIA_MAX_TOTAL_BYTES = 120 * 1024 * 1024; // 120MB

export interface MediaBundle {
  /** fname → bytes do binário (só os embutidos) */
  files: Map<string, Buffer>;
  /** URL absoluta → ./assets/media/fname (só os embutidos) */
  rewrites: Map<string, string>;
  embedded: number;
  /** mídia gerenciada deixada como link absoluto (teto estourado ou fetch falhou) */
  linkMode: number;
}

function isManagedMedia(url: string): boolean {
  return MANAGED_MEDIA_MARKERS.some((m) => url.includes(m));
}

/** URLs distintas de mídia gerenciada nas células (por data_type da coluna). */
function collectMediaUrls(snap: SnapshotPayload): string[] {
  const urls = new Set<string>();
  for (const t of snap.tables) {
    const mediaCols = new Set(
      t.columns.filter((c) => isMediaBackendType(c.data_type)).map((c) => c.name),
    );
    if (mediaCols.size === 0) continue;
    for (const row of t.rows) {
      for (const col of mediaCols) {
        const v = row[col];
        if (typeof v === 'string' && v && isManagedMedia(v)) urls.add(v);
      }
    }
  }
  return [...urls];
}

/**
 * Coleta os bytes da mídia gerenciada pra embutir no ZIP (offline real, igual
 * o precedente woff2). Fetch sequencial do bucket público (sem auth). Degrada
 * pra link-mode acima do teto ou em fetch falho (mídia morta não derruba o
 * export). Sem cache global — cada request coleta o seu.
 */
export async function buildMediaBundle(snap: SnapshotPayload): Promise<MediaBundle> {
  const files = new Map<string, Buffer>();
  const rewrites = new Map<string, string>();
  let embedded = 0;
  let linkMode = 0;
  let totalBytes = 0;

  for (const url of collectMediaUrls(snap)) {
    if (embedded >= MEDIA_MAX_FILES || totalBytes >= MEDIA_MAX_TOTAL_BYTES) {
      linkMode++;
      continue;
    }
    let buf: Buffer;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`media ${r.status}`);
      buf = Buffer.from(await r.arrayBuffer());
    } catch {
      // cópia falhou / asset sumiu (best-effort do publish) — fica como link.
      linkMode++;
      continue;
    }
    if (totalBytes + buf.length > MEDIA_MAX_TOTAL_BYTES) {
      linkMode++;
      continue;
    }
    // mesmo idiom do woff2: últimos 2 segmentos do path (o uuid já é único).
    const fname = url.split('?')[0].split('/').slice(-2).join('-');
    files.set(fname, buf);
    rewrites.set(url, `./assets/media/${fname}`);
    totalBytes += buf.length;
    embedded++;
  }

  if (linkMode > 0) {
    console.warn(
      `[export] ${linkMode} mídia(s) não embutida(s) (teto/erro) — ficam como link online; ${embedded} embutida(s) (${(totalBytes / 1048576).toFixed(1)}MB)`,
    );
  }
  return { files, rewrites, embedded, linkMode };
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
      charts={snap.charts ?? []}
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

export function buildReadme(snap: SnapshotPayload, media?: MediaBundle): string {
  const created = new Date(snap.created_at);
  const dateStr = isNaN(created.getTime()) ? snap.created_at : created.toISOString().slice(0, 10);
  const truncatedTables = snap.tables.filter((t) => t.truncated);

  const mediaEmbedded = media?.embedded ?? 0;
  const mediaFileBullet = mediaEmbedded > 0
    ? ['- `assets/media/` — mídia embutida (imagens e arquivos)']
    : [];
  const mediaNote = media && media.linkMode > 0
    ? [
        '',
        '## ⚠ Mídia não embutida',
        '',
        `${media.linkMode} arquivo(s) de mídia excederam o limite de embutir e continuam`,
        'como links online — o site precisa de internet pra mostrá-los. Os demais',
        `(${mediaEmbedded}) estão embutidos em \`assets/media/\` e funcionam offline.`,
      ]
    : [];

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
    ...mediaNote,
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
    '- `assets/fonts/` — fontes woff2 + `LICENSES.md` (SIL OFL 1.1, que exige',
    '  que o texto acompanhe as cópias — redistribuir este pacote é permitido)',
    ...mediaFileBullet,
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
  const media = await buildMediaBundle(snap);
  let html = await buildStandaloneHtml(snap, fonts.css);
  // Reescreve as URLs absolutas embutidas pro path relativo no ZIP (offline).
  // URLs em link-mode (não no map) ficam absolutas — funcionam online.
  for (const [abs, rel] of media.rewrites) {
    html = html.replaceAll(abs, rel);
  }

  const zip = new JSZip();
  zip.file('index.html', html);
  zip.file('README.md', buildReadme(snap, media));
  zip.file('snapshot.json', JSON.stringify(snap, null, 2));
  for (const [fname, buf] of fonts.files) {
    zip.file(`assets/fonts/${fname}`, buf);
  }
  if (fonts.files.size > 0) {
    // A SIL OFL exige que o texto da licença acompanhe as CÓPIAS do arquivo de
    // fonte. O ZIP redistribui os `.woff2` pro cliente, então citar a licença
    // no README (como fazia) não basta — o texto tem que ir junto.
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    zip.file(
      'assets/fonts/LICENSES.md',
      await readFile(path.join(await dirFontes(), 'LICENSES.md'))
    );
  }
  for (const [fname, buf] of media.files) {
    zip.file(`assets/media/${fname}`, buf);
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
