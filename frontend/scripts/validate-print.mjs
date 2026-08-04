/**
 * Gate M8.5 F3.3 — valida os impressos ponta-a-ponta (fechamento do M8.5).
 * Round-trip: origem do dado (F3.1) → publish → site público oferece os dois
 * impressos → acadêmico CITA a origem → panfleto sai colorido → o browser gera
 * PDF de verdade (mecanismo D1: `@media print` + `window.print()`).
 *
 * Estende o validate-charts.mjs (mesmo molde do gate de mídia). O valor que os
 * unit tests NÃO cobrem, e que é a fase inteira:
 *   - `@media print` só existe num browser real — jsdom ignora media queries,
 *     então "o botão some na impressão" é fé até rodar aqui;
 *   - `page.pdf()` prova que o mecanismo escolhido (D1) produz artefato, não só
 *     tela bonita;
 *   - `print-color-adjust: exact` (a cor do panfleto sair no papel) é decisão de
 *     render do browser;
 *   - a citação com `Fonte:` só fica verdadeira se PATCH → snapshot → página
 *     fecharem o circuito. Sem esse elo o campo `source` é morto.
 *
 * NÃO coberto aqui (sem cap silencioso): truncamento >2000 linhas — a fixture
 * teria que inserir 2001 registros pela API, e o aviso "N de M" já tem unit
 * test. Este gate cobre o caminho não-truncado e o texto de contagem.
 *
 * Rodar: npm run gate:print  (ou node scripts/validate-print.mjs <shot-dir>)
 * Pré-requisito (3 terminais):
 *   T1  cd backend && venv/Scripts/python -m uvicorn main:app --port 8000
 *   T2  cd frontend && npm run build && npm run start   (start, não dev)
 *   T3  cd frontend && npm run gate:print
 * One-time: npx playwright install chromium
 */
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync, statSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';

const [, , shotDir = 'print-shots'] = process.argv;
mkdirSync(shotDir, { recursive: true });

const BASE = process.env.GATE_BASE || 'http://localhost:3000';
const API = process.env.GATE_API || 'http://localhost:8000';
const TS = Date.now();
const TABLE = `gate_print_${TS}`;
const SLUG = `gateprint${TS}`;
const SOURCE = 'Arquivo Histórico de Gate, fundo Impressos, 2026';
let failed = false;
const ok = (m) => console.log(`[ok] ${m}`);
const fail = (m) => { console.log(`[FAIL] ${m}`); failed = true; };

const login = async () => {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testadmin', password: 'TestAdmin123!' }),
  });
  if (!r.ok) throw new Error(`login API ${r.status}`);
  return (await r.json()).access_token;
};
const api = async (token, method, path, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
};

const ACCENT = '#C2441C';
const ACCENT_RGB = 'rgb(194, 68, 28)';
const THEME = {
  version: 1, preset: 'editorial',
  typography: { display: { family: "'Fraunces', Georgia, serif", italic: true, size: 88, weight: 400 }, body: { family: "'IBM Plex Serif', Georgia, serif" }, mono: { family: "'IBM Plex Mono', monospace" } },
  colors: { bg: '#FAEFD9', surface: '#FFFCF3', ink: '#212842', muted: '#4A5468', accent: ACCENT, rule: '#212842' },
  layout: { density: 'comfy', radius: 4, default_table_layout: 'grid' },
  copy: { hero_eyebrow: 'Gate', hero_title: 'Gate de impressos', hero_sub: 'F3.3', footer_note: 'gate print' },
};

// ── scaffolding via API: tabela + origem (F3.1) + linhas + view + gráfico ──
const apiToken = await login();
ok('login API (scaffolding)');

await api(apiToken, 'PATCH', '/api/admins/me/workspace', { workspace_name: 'Gate Impressos', workspace_slug: SLUG });
const created = await api(apiToken, 'POST', '/tables/', {
  name: TABLE, is_public: true,
  columns: [
    { name: 'regiao', data_type: 'String', is_nullable: true },
    { name: 'valor', data_type: 'Float', is_nullable: true },
  ],
});
if (created.status !== 200) { fail(`criar tabela fixture: ${created.status}`); process.exit(1); }
const tableId = created.body.id;

// F3.1: grava a proveniência pelo MESMO endpoint que a UI do admin usa
const srcRes = await api(apiToken, 'PATCH', `/tables/${tableId}/source`, { source: SOURCE });
if (srcRes.status === 200 && srcRes.body.source === SOURCE) ok('F3.1: PATCH /tables/{id}/source gravou a origem');
else fail(`F3.1: PATCH source falhou (${srcRes.status} ${JSON.stringify(srcRes.body).slice(0, 120)})`);

const rows = [
  ...Array(6).fill({ regiao: 'sul', valor: 10 }),
  ...Array(4).fill({ regiao: 'norte', valor: 5 }),
  ...Array(2).fill({ regiao: 'leste', valor: 3 }),
];
for (const r of rows) await api(apiToken, 'POST', `/api/${TABLE}`, r);
const view = await api(apiToken, 'POST', '/api/views/me', {
  table_id: tableId, name: 'Contagem por região',
  group_by: 'regiao', operation: 'count', metric_column: null, config: {},
});
if (view.status !== 200) { fail(`criar view: ${view.status}`); process.exit(1); }
const viewId = view.body.id;
ok(`fixture ${TABLE} (id ${tableId}) + ${rows.length} linhas + view (id ${viewId})`);

const ver = await api(apiToken, 'POST', '/api/publications/me/versions', {
  description: 'gate impressos', theme_config: THEME,
  table_selection: [{ table_id: tableId, order: 0, layout: 'grid' }],
  charts: [{ view_id: viewId, title: 'Contagem por região' }],
});
if (ver.status !== 200) { fail(`publicar versão: ${ver.status} ${JSON.stringify(ver.body).slice(0, 140)}`); process.exit(1); }
const verId = ver.body.id;
const verNum = ver.body.version_number;
const act = await api(apiToken, 'POST', `/api/publications/me/versions/${verId}/activate`);
if (act.status === 200) ok(`versão v${verNum} publicada + ativa`);
else fail(`ativar versão: ${act.status}`);

// o snapshot tem que carregar a origem — se não vier, a citação nunca cita
const snap = await (await fetch(`${API}/public/${SLUG}/snapshot`)).json().catch(() => ({}));
if ((snap.tables || []).some(t => t.source === SOURCE)) ok('snapshot: a origem viajou pro payload público');
else fail(`snapshot: tabela sem \`source\` (${JSON.stringify((snap.tables || [])[0] || {}).slice(0, 140)})`);

// ── browser ──
const launch = async () => {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { return await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); }
    catch { /* próximo */ }
  }
  throw new Error('nenhum chromium — rode: npx playwright install chromium');
};
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const consoleErrors = [];
const ALLOW = [/favicon/i];
page.on('console', m => { if (m.type() === 'error' && !ALLOW.some(re => re.test(m.text()))) consoleErrors.push(`[em ${page.url()}] ${m.text()}`); });
page.on('pageerror', e => consoleErrors.push(`[em ${page.url()}] ${String(e)}`));

// 1. o público OFERECE os impressos (F3.3) e o link leva de verdade
await page.goto(`${BASE}/${SLUG}`);
const nav = page.getByRole('navigation', { name: 'Versões imprimíveis' });
try {
  await nav.waitFor({ timeout: 10000 });
  ok('público: rodapé oferece os impressos');
} catch { fail('público: rodapé SEM os links dos impressos (a fase seria inalcançável)'); }
await page.screenshot({ path: join(shotDir, 'publico-rodape.png'), fullPage: true });
console.log('[shot] publico-rodape.png');

try {
  await page.getByRole('link', { name: 'Versão acadêmica' }).click();
  await page.waitForURL(`**/${SLUG}/academico`, { timeout: 10000 });
  ok('público → acadêmico: o link navega');
} catch { fail('público → acadêmico: o link não navegou'); await page.goto(`${BASE}/${SLUG}/academico`); }

// 2. ACADÊMICO: cita a origem, estampa a contagem, e o botão some na impressão
try {
  await page.getByRole('heading', { name: 'Fontes' }).waitFor({ timeout: 10000 });
  const refs = await page.locator('.acad-refs li').first().innerText();
  if (refs.includes(SOURCE)) ok('acadêmico: a citação traz a origem informada (F3.1 → impresso)');
  else fail(`acadêmico: citação sem a origem (${refs.slice(0, 120)})`);
  if (refs.includes(`Versão ${verNum}`)) ok('acadêmico: a citação carimba a versão publicada');
  else fail('acadêmico: citação sem número de versão');
  const note = await page.locator('.acad-note').first().innerText();
  if (/\d+ registros?\.?/.test(note)) ok(`acadêmico: contagem honesta estampada ("${note.trim().slice(0, 60)}")`);
  else fail(`acadêmico: sem a nota de contagem ("${note.slice(0, 80)}")`);
} catch (e) { fail(`acadêmico: página não renderizou ("${String(e).slice(0, 120)}")`); }

// o teste que só um browser faz: `@media print` esconde o botão e mantém o dado
const printBtn = page.locator('.no-print').first();
const btnVisibleOnScreen = await printBtn.isVisible().catch(() => false);
await page.emulateMedia({ media: 'print' });
const btnVisibleOnPrint = await printBtn.isVisible().catch(() => false);
const tableVisibleOnPrint = await page.locator('.acad table').first().isVisible().catch(() => false);
if (btnVisibleOnScreen && !btnVisibleOnPrint) ok('acadêmico: @media print esconde o botão de imprimir');
else fail(`acadêmico: @media print não escondeu o botão (tela=${btnVisibleOnScreen}, print=${btnVisibleOnPrint})`);
if (tableVisibleOnPrint) ok('acadêmico: o dado continua na página impressa');
else fail('acadêmico: a tabela sumiu no @media print');

// nada pode "caber por rolagem": no papel, transbordo = dado cortado em silêncio
const acadFit = await page.evaluate(() => {
  const tb = document.querySelector('.acad table');
  const box = document.querySelector('.acad');
  if (!tb || !box) return null;
  return { table: tb.getBoundingClientRect().width, box: box.getBoundingClientRect().width };
});
if (acadFit && acadFit.table <= acadFit.box + 1) ok(`acadêmico: tabela cabe na página impressa (${acadFit.table.toFixed(0)}px ≤ ${acadFit.box.toFixed(0)}px)`);
else fail(`acadêmico: tabela transborda na impressão e seria cortada (${JSON.stringify(acadFit)})`);

// 3. o mecanismo D1 produz PDF de verdade (é isso que o usuário salva)
const pdfPath = join(shotDir, 'academico.pdf');
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
await page.emulateMedia({ media: 'screen' });
try {
  const size = statSync(pdfPath).size;
  const head = readFileSync(pdfPath).subarray(0, 5).toString('latin1');
  if (head === '%PDF-' && size > 1024) ok(`acadêmico: PDF gerado pelo browser (${(size / 1024).toFixed(1)} KB)`);
  else fail(`acadêmico: PDF inválido (head=${head}, ${size} bytes)`);
} catch (e) { fail(`acadêmico: PDF não saiu (${String(e).slice(0, 90)})`); }
console.log('[shot] academico.pdf');

// 4. PANFLETO: gráfico como FIGURA + cor do tema (lição BUG-CHART01)
await page.goto(`${BASE}/${SLUG}/panfleto`);
try {
  await page.locator('.pf-statstrip').waitFor({ timeout: 10000 });
  const strip = await page.locator('.pf-statstrip').evaluate(el => getComputedStyle(el).backgroundColor);
  if (strip === ACCENT_RGB) ok('panfleto: faixa de números pinta no accent do tema publicado');
  else fail(`panfleto: faixa fora do tema (esperado ${ACCENT_RGB}, veio ${strip})`);
  const svgs = await page.locator('.pf-chart-svg svg').count();
  if (svgs > 0) ok('panfleto: gráfico congelado entra como figura');
  else fail('panfleto: nenhuma figura de gráfico');
  const bigNum = await page.locator('.pf-stat-num').first().innerText();
  if (bigNum.trim().length > 0) ok(`panfleto: número grande presente ("${bigNum.trim()}")`);
  else fail('panfleto: sem número grande');
} catch (e) { fail(`panfleto: página não renderizou ("${String(e).slice(0, 120)}")`); }

await page.emulateMedia({ media: 'print' });
const pfBtnOnPrint = await page.locator('.no-print').first().isVisible().catch(() => false);
if (!pfBtnOnPrint) ok('panfleto: @media print esconde o botão de imprimir');
else fail('panfleto: botão de imprimir sobrou na impressão');

// o SVG tem largura fixa e é mais largo que a coluna: se não escalar, a
// impressão corta a borda direita — junto com a legenda de honestidade
const svgFit = await page.evaluate(() => {
  const svg = document.querySelector('.pf-chart-svg svg');
  const host = document.querySelector('.pf-chart-svg');
  if (!svg || !host) return null;
  return { svg: svg.getBoundingClientRect().width, host: host.getBoundingClientRect().width };
});
if (svgFit && svgFit.svg <= svgFit.host + 1) ok(`panfleto: gráfico cabe na página impressa (${svgFit.svg.toFixed(0)}px ≤ ${svgFit.host.toFixed(0)}px)`);
else fail(`panfleto: gráfico transborda e seria cortado no papel (${JSON.stringify(svgFit)})`);
const pfPdf = join(shotDir, 'panfleto.pdf');
await page.pdf({ path: pfPdf, format: 'A4', printBackground: true });
await page.emulateMedia({ media: 'screen' });
try {
  const size = statSync(pfPdf).size;
  if (readFileSync(pfPdf).subarray(0, 5).toString('latin1') === '%PDF-' && size > 1024) {
    ok(`panfleto: PDF gerado pelo browser (${(size / 1024).toFixed(1)} KB)`);
  } else fail('panfleto: PDF inválido');
} catch (e) { fail(`panfleto: PDF não saiu (${String(e).slice(0, 90)})`); }
await page.screenshot({ path: join(shotDir, 'panfleto.png'), fullPage: true });
console.log('[shot] panfleto.png + panfleto.pdf');

// 5. restrição do Diretor (D1): o Ctrl+P NÃO encosta no ZIP — e o ZIP, que roda
// offline, não pode ganhar link morto pros impressos.
const zipRes = await fetch(`${BASE}/api/export/${verId}`, { headers: { Authorization: `Bearer ${apiToken}` } });
if (!zipRes.ok) fail(`export ZIP: HTTP ${zipRes.status}`);
else {
  const zip = await JSZip.loadAsync(Buffer.from(await zipRes.arrayBuffer()));
  if (zip.files['index.html']) {
    const html = await zip.files['index.html'].async('string');
    if (!html.includes('/panfleto') && !html.includes('/academico')) ok('ZIP: sem link morto pros impressos (offline continua honesto)');
    else fail('ZIP: index.html linka pros impressos — link morto fora do servidor');
    if (html.includes('<svg')) ok('ZIP: segue embutindo o gráfico (o export não regrediu)');
    else fail('ZIP: index.html perdeu o gráfico');
  } else fail('ZIP sem index.html');
}

// 6. console limpo
if (consoleErrors.length) fail(`erros de console (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`);
else ok('console sem erros');

await api(apiToken, 'DELETE', `/tables/${tableId}?confirm_name=${TABLE}`).catch(() => {});
await browser.close();

console.log(failed ? '\n=== GATE DE IMPRESSOS: FALHOU ===' : '\n=== GATE DE IMPRESSOS: VERDE ===');
process.exit(failed ? 1 : 0);
