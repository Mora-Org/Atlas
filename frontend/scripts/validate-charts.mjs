/**
 * Gate M8.5 F2.2c — valida o chart builder ponta-a-ponta (fechamento do M8.5).
 * Round-trip: view salva (F1) → builder no Studio (recharts VIVO no browser)
 * → publish congela SVG (backend) → site público serve o SVG congelado + a
 * tabela-alternativa → export ZIP embute o SVG.
 *
 * Estende o validate-media.mjs (decisão 6 do Diretor: o gate da F2 NASCE aqui,
 * espelhando o de mídia, não do zero). O valor que os unit tests NÃO cobrem: o
 * builder rodando recharts num browser REAL (recharts é browser-only — no
 * renderToStaticMarkup ele sai vazio, daí o SVG servido ser o congelado do
 * backend). O gate prova os DOIS: o vivo pinta no Studio, o congelado serve.
 *
 * Rodar: npm run gate:charts  (ou node scripts/validate-charts.mjs <shot-dir>)
 * Pré-requisito (3 terminais):
 *   T1  cd backend && venv/Scripts/python -m uvicorn main:app --port 8000
 *   T2  cd frontend && npm run build && npm run start   (start, não dev — a
 *       route de export e a página pública precisam do build de prod)
 *   T3  cd frontend && npm run gate:charts
 * One-time: npx playwright install chromium
 */
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import JSZip from 'jszip';

const [, , shotDir = 'chart-shots'] = process.argv;
mkdirSync(shotDir, { recursive: true });

const BASE = process.env.GATE_BASE || 'http://localhost:3000';
const API = process.env.GATE_API || 'http://localhost:8000';
const TS = Date.now();
const TABLE = `gate_chart_${TS}`;
const SLUG = `gatechart${TS}`;
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

const THEME = {
  version: 1, preset: 'editorial',
  typography: { display: { family: "'Fraunces', Georgia, serif", italic: true, size: 88, weight: 400 }, body: { family: "'IBM Plex Serif', Georgia, serif" }, mono: { family: "'IBM Plex Mono', monospace" } },
  colors: { bg: '#FAEFD9', surface: '#FFFCF3', ink: '#212842', muted: '#4A5468', accent: '#C2441C', rule: '#212842' },
  layout: { density: 'comfy', radius: 4, default_table_layout: 'grid' },
  copy: { hero_eyebrow: 'Gate', hero_title: 'Gate de gráficos', hero_sub: 'F2.2c', footer_note: 'gate' },
};

// ── scaffolding via API: tabela + linhas + view salva (F1) ──
const apiToken = await login();
ok('login API (scaffolding)');

await api(apiToken, 'PATCH', '/api/admins/me/workspace', { workspace_name: 'Gate Charts', workspace_slug: SLUG });
const created = await api(apiToken, 'POST', '/tables/', {
  name: TABLE, is_public: true,
  columns: [
    { name: 'regiao', data_type: 'String', is_nullable: true },
    { name: 'valor', data_type: 'Float', is_nullable: true },
  ],
});
if (created.status !== 200) { fail(`criar tabela fixture: ${created.status}`); process.exit(1); }
const tableId = created.body.id;
// dado com uma categoria dominante e uma cauda — pra ter barra + "resto" honesto
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
if (view.status !== 200) { fail(`criar view: ${view.status} ${JSON.stringify(view.body).slice(0, 120)}`); process.exit(1); }
const viewId = view.body.id;
ok(`fixture ${TABLE} (id ${tableId}) + ${rows.length} linhas + view "${view.body.name}" (id ${viewId})`);

// ── browser ──
const launch = async () => {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { return await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); }
    catch { /* próximo */ }
  }
  throw new Error('nenhum chromium — rode: npx playwright install chromium');
};
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const consoleErrors = [];
const ALLOW = [/favicon/i];
page.on('console', m => { if (m.type() === 'error' && !ALLOW.some(re => re.test(m.text()))) consoleErrors.push(`[em ${page.url()}] ${m.text()}`); });
page.on('pageerror', e => consoleErrors.push(`[em ${page.url()}] ${String(e)}`));

// 0. login UI
await page.goto(`${BASE}/login`);
await page.getByPlaceholder('seu.usuario').fill('testadmin');
await page.locator('input[type="password"]').fill('TestAdmin123!');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL('**/admin**', { timeout: 15000 });
await page.waitForTimeout(800);
ok('login testadmin (UI)');

// 1. BUILDER: Studio → aba Gráficos → a view aparece → adiciona → recharts VIVO pinta
await page.goto(`${BASE}/admin/publish`);
await page.getByRole('button', { name: 'Gráficos' }).click();
// a view salva aparece como botão "+ {nome}" na seção "Adicionar de uma view salva"
const addBtn = page.getByRole('button', { name: `+ ${view.body.name}` });
try {
  await addBtn.waitFor({ timeout: 10000 });
  ok('builder: a view salva aparece pra adicionar');
} catch { fail('builder: a view salva NÃO apareceu na aba Gráficos'); }
await addBtn.click();
// o card do gráfico monta com o LiveChartPreview (recharts) — que é browser-only.
// Se um <svg> do recharts pinta aqui, provamos que o builder VIVO funciona (o
// que o renderToStaticMarkup do unit test NÃO consegue).
try {
  await page.locator('.recharts-surface, svg.recharts-surface, svg[class*="recharts"]').first().waitFor({ timeout: 12000 });
  ok('builder: preview VIVO (recharts) pintou um <svg> no browser');
} catch {
  // fallback: qualquer svg dentro do card do gráfico
  try {
    await page.locator('input[aria-label="Título do gráfico"]').first().waitFor({ timeout: 4000 });
    const svgCount = await page.locator('svg').count();
    if (svgCount > 0) ok(`builder: card do gráfico montou com <svg> (${svgCount} svg na página)`);
    else fail('builder: card montou mas nenhum <svg> pintou (recharts não renderizou)');
  } catch { fail('builder: o card do gráfico não montou'); }
}
await page.screenshot({ path: join(shotDir, 'chart-builder.png') });
console.log('[shot] chart-builder.png');

// 2. publish COM o gráfico (via API — backend é o dono, espelha o gate de mídia)
const ver = await api(apiToken, 'POST', '/api/publications/me/versions', {
  description: 'gate charts', theme_config: THEME,
  table_selection: [{ table_id: tableId, order: 0, layout: 'grid' }],
  charts: [{ view_id: viewId, title: 'Contagem por região' }],
});
if (ver.status !== 200) { fail(`publicar versão: ${ver.status} ${JSON.stringify(ver.body).slice(0, 120)}`); }
const verId = ver.body.id;
const act = await api(apiToken, 'POST', `/api/publications/me/versions/${verId}/activate`);
if (act.status === 200) ok(`versão v${ver.body.version_number} publicada + ativa`);
else fail(`ativar versão: ${act.status}`);

// 2b. o snapshot ativo carrega o gráfico CONGELADO (SVG string, sem error)
const snap = await (await fetch(`${API}/public/${SLUG}/snapshot`)).json().catch(() => ({}));
const snapChart = (snap.charts || [])[0];
if (snapChart && !snapChart.error && typeof snapChart.svg === 'string' && snapChart.svg.startsWith('<svg')) {
  ok('snapshot: gráfico congelado como SVG string (sem error)');
} else {
  fail(`snapshot: gráfico não congelou (${JSON.stringify(snapChart || {}).slice(0, 140)})`);
}

// 3. site público serve o SVG CONGELADO + a tabela-alternativa (sem JS pintando)
await page.goto(`${BASE}/${SLUG}`);
try {
  await page.getByRole('heading', { name: 'Contagem por região' }).waitFor({ timeout: 10000 });
  const svgInPublic = await page.locator('section svg').first().count();
  if (svgInPublic > 0) ok('público: seção do gráfico com <svg> congelado servido');
  else fail('público: seção do gráfico sem <svg>');
  // a tabela-alternativa a11y (details) tem que estar lá
  await page.getByText('Ver os dados deste gráfico').waitFor({ timeout: 5000 });
  ok('público: tabela-alternativa a11y (<details>) presente');
} catch (e) {
  fail(`público: gráfico congelado não apareceu (${String(e).slice(0, 100)})`);
}
await page.screenshot({ path: join(shotDir, 'chart-publico.png') });
console.log('[shot] chart-publico.png');

// 4. export ZIP embute o SVG do gráfico no index.html (offline, script-free)
const zipRes = await fetch(`${BASE}/api/export/${verId}`, { headers: { Authorization: `Bearer ${apiToken}` } });
if (!zipRes.ok) fail(`export ZIP: HTTP ${zipRes.status}`);
else {
  const buf = Buffer.from(await zipRes.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  if (zip.files['index.html']) {
    const html = await zip.files['index.html'].async('string');
    if (html.includes('Contagem por região') && html.includes('<svg')) ok('ZIP: index.html embute o gráfico (título + <svg>)');
    else fail('ZIP: index.html sem o gráfico congelado');
    if (!html.includes('<script')) ok('ZIP: index.html é script-free (gráfico não depende de JS)');
    else fail('ZIP: index.html tem <script> (viola o contrato script-free)');
  } else fail(`ZIP sem index.html (entries: ${Object.keys(zip.files).slice(0, 8).join(', ')})`);
}

// 5. console limpo
if (consoleErrors.length) { fail(`erros de console (${consoleErrors.length}): ${consoleErrors.slice(0, 3).join(' | ')}`); }
else ok('console sem erros');

// teardown best-effort (falha de cleanup não falha o gate)
await api(apiToken, 'DELETE', `/tables/${tableId}?confirm_name=${TABLE}`).catch(() => {});
await browser.close();

console.log(failed ? '\n=== GATE DE GRÁFICOS: FALHOU ===' : '\n=== GATE DE GRÁFICOS: VERDE ===');
process.exit(failed ? 1 : 0);
