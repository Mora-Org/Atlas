/**
 * SPIKE — M6 Fase 5 (Export estático), Marco 1.
 *
 * Prova que o <PublicSite> (renderer puro do snapshot) vira um index.html
 * standalone que abre via file:// fiel ao site público, com fontes woff2
 * embutidas em ./assets/fonts (offline de verdade — decisão do Diretor).
 *
 * Rodar:  npx tsx scripts/export-spike.tsx   (cwd = frontend/)
 * Saída:  spike-out/index.html + spike-out/assets/fonts/*.woff2
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicSite, type PublicSiteTableData } from '../src/components/publish/PublicSite';
import type { ThemeConfig } from '../src/contexts/PublishContext';

const OUT = join(import.meta.dirname, '..', 'spike-out');
const FONTS_DIR = join(OUT, 'assets', 'fonts');

/* ───────────── snapshot de exemplo (preset editorial, 3 layouts) ───────────── */

const theme: ThemeConfig = {
  version: 1,
  preset: 'editorial',
  typography: {
    display: { family: "'Fraunces', Georgia, serif", italic: true, size: 88, weight: 400 },
    body: { family: "'IBM Plex Serif', Georgia, serif" },
    mono: { family: "'IBM Plex Mono', monospace" },
  },
  colors: {
    bg: '#faf6ef',
    surface: '#f3ecdf',
    ink: '#1a1612',
    muted: '#6f6657',
    accent: '#b8860b',
    rule: '#1a1612',
  },
  layout: { density: 'regular', radius: 2, default_table_layout: 'list' },
  copy: {
    hero_eyebrow: 'Acervo digital · desde 1923',
    hero_title: 'Cadernos do Recôncavo',
    hero_sub: 'Uma publicação curada do acervo histórico — mapas, diários e correspondências do litoral baiano.',
    footer_note: '© Centro de Memória do Recôncavo',
  },
} as ThemeConfig;

const mk = (over: Partial<PublicSiteTableData>): PublicSiteTableData => ({
  table_id: 0,
  name: 'acervo',
  layout: 'list',
  columns: [
    { name: 'title', data_type: 'String' },
    { name: 'meta', data_type: 'String' },
    { name: 'year', data_type: 'String' },
  ],
  rows: [
    { title: 'Cadernos de Viagem ao Recôncavo', meta: 'Aurélio Telles · 1923', year: '1923' },
    { title: 'Cartografia da Costa Sul', meta: 'Anônimo · 1789', year: '1789' },
    { title: 'Diário de Bordo · Navio Maranhão', meta: 'Cap. F. Ferreira · 1842', year: '1842' },
    { title: 'Fotografias do Porto de Salvador', meta: 'M. Vargas · 1906', year: '1906' },
  ],
  total_rows: 4,
  ...over,
});

// SPIKE_ROWS=2000 → simula workspace no teto do MAX_ROWS_PER_TABLE
const STRESS_ROWS = Number(process.env.SPIKE_ROWS ?? 0);
const stressRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    title: `Documento histórico nº ${i + 1} — registro do acervo digitalizado`,
    meta: `Autor Exemplo ${i % 40} · ${1700 + (i % 300)}`,
    year: String(1700 + (i % 300)),
  }));

const tables: PublicSiteTableData[] = [
  mk({ table_id: 0, name: 'acervo (list)', layout: 'list' }),
  mk({ table_id: 1, name: 'mapas (grid)', layout: 'grid' }),
  mk({ table_id: 2, name: 'ensaios (essay)', layout: 'essay' }),
].map((t) =>
  STRESS_ROWS > 0 ? { ...t, rows: stressRows(STRESS_ROWS), total_rows: STRESS_ROWS } : t,
);

/* ───────────── fontes: baixa woff2 do Google Fonts e reescreve local ───────────── */

// UA moderno → css2 responde com woff2 unicode-range
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const CSS2_URL =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Fraunces:ital,wght@1,400',
    'family=IBM+Plex+Serif:ital,wght@0,400;1,400',
    'family=IBM+Plex+Mono:wght@400',
  ].join('&') +
  '&display=swap';

async function buildFontFaceCss(): Promise<{ css: string; files: number; bytes: number }> {
  const res = await fetch(CSS2_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Google Fonts css2 ${res.status}`);
  let css = await res.text();

  mkdirSync(FONTS_DIR, { recursive: true });
  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g) ?? [])];
  let bytes = 0;
  for (const url of urls) {
    const fname = url.split('/').slice(-2).join('-'); // ex.: v37-abc123.woff2
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(join(FONTS_DIR, fname), buf);
    bytes += buf.length;
    css = css.replaceAll(url, `./assets/fonts/${fname}`);
  }
  return { css, files: urls.length, bytes };
}

/* ───────────── shell + escrita ───────────── */

async function main() {
  const markup = renderToStaticMarkup(
    React.createElement(PublicSite, {
      themeConfig: theme,
      tables,
      workspaceName: 'Centro de Memória do Recôncavo',
      workspaceSlug: 'reconcavo',
    }),
  );

  const { css: fontCss, files, bytes } = await buildFontFaceCss();

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Centro de Memória do Recôncavo · Atlas</title>
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

  mkdirSync(OUT, { recursive: true });
  const outFile = join(OUT, 'index.html');
  writeFileSync(outFile, html, 'utf8');

  const htmlKb = (statSync(outFile).size / 1024).toFixed(1);
  console.log(`index.html: ${htmlKb} KB`);
  console.log(`fontes: ${files} woff2, ${(bytes / 1024).toFixed(0)} KB no total`);
  console.log(`abrir: file:///${outFile.replaceAll('\\', '/')}`);
}

main().catch((e) => {
  console.error('SPIKE FALHOU:', e);
  process.exit(1);
});
