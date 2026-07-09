/**
 * Gate M8 F5 — valida a Media Library ponta-a-ponta (fechamento do M8):
 * upload → store → serve → render (DataViewer) → publish (copy-at-publish)
 * → site público → export ZIP (embed) → import CSV (F4).
 *
 * DIFERENÇA do validate-schema.mjs: mídia NÃO se mocka — o valor é o
 * round-trip real. Roda E2E contra backend+frontend REAIS (fallback
 * filesystem, sem Supabase) e por isso MUTA dados: cada run usa
 * gate_media_${ts} + teardown best-effort (falha de cleanup não falha o gate).
 *
 * Rodar: npm run gate:media  (ou node scripts/validate-media.mjs <shot-dir>)
 * Pré-requisito (3 terminais):
 *   T1  cd backend && .venv/Scripts/python -m uvicorn main:app --port 8000
 *   T2  cd frontend && npm run build && npm run start   (start, não dev —
 *       a route de export e a página pública precisam do build de prod)
 *   T3  cd frontend && npm run gate:media
 * One-time: npx playwright install chrome
 */
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import JSZip from 'jszip';

const [, , shotDir = 'media-shots'] = process.argv;
mkdirSync(shotDir, { recursive: true });

const BASE = process.env.GATE_BASE || 'http://localhost:3000';
const API = process.env.GATE_API || 'http://localhost:8000';
const TS = Date.now();
const TABLE = `gate_media_${TS}`;
const SLUG = `gatemedia${TS}`;
const THEMES = ['light', 'dark'];
const ACCENTS = ['goldenrod', 'sage', 'ruby', 'nectar'];
let failed = false;
const ok = (m) => console.log(`[ok] ${m}`);
const fail = (m) => { console.log(`[FAIL] ${m}`); failed = true; };

// fixtures inline (buffers): PNG 1×1 real, lixo MZ spoofado, CSV do F4
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const EVIL = Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(600)]);
const CSV = Buffer.from('Nome,Preco (R$),Ativo\nAna,10.50,sim\nBia,9.99,nao\n');

// ── API scaffolding (token próprio do Node; a UI loga em paralelo) ──
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

const apiToken = await login();
ok('login API (scaffolding)');

// fixture: tabela com coluna de mídia + 2 rows (foto null — a UI preenche)
await api(apiToken, 'PATCH', '/api/admins/me/workspace', { workspace_name: 'Gate Media', workspace_slug: SLUG });
const created = await api(apiToken, 'POST', '/tables/', {
  name: TABLE, is_public: true,
  columns: [
    { name: 'titulo', data_type: 'String', is_nullable: false },
    { name: 'foto', data_type: 'image', is_nullable: true },
  ],
});
if (created.status !== 200) { fail(`criar tabela fixture: ${created.status}`); process.exit(1); }
const tableId = created.body.id;
await api(apiToken, 'POST', `/api/${TABLE}`, { titulo: 'Peça A', foto: null });
await api(apiToken, 'POST', `/api/${TABLE}`, { titulo: 'Peça B', foto: null });
ok(`fixture ${TABLE} (id ${tableId}) + 2 registros`);

// chrome → msedge (Win11 sempre tem) → chromium bundled do Playwright
const launch = async () => {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      return await chromium.launch({ ...(channel ? { channel } : {}), headless: true });
    } catch { /* tenta o próximo */ }
  }
  throw new Error('nenhum browser chromium disponível — rode: npx playwright install chromium');
};
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const consoleErrors = [];
// allowlist: favicon + os status ESPERADOS do teste negativo de sniffing
const ALLOW = [/favicon/i, /status of 415/i];
page.on('console', m => {
  if (m.type() === 'error' && !ALLOW.some(re => re.test(m.text()))) {
    consoleErrors.push(`[em ${page.url()}] ${m.text()}`);
  }
});
page.on('pageerror', e => consoleErrors.push(`[em ${page.url()}] ${String(e)}`));
page.on('requestfailed', r => console.log(`[reqfail] ${r.failure()?.errorText} ${r.method()} ${r.url()} (página: ${page.url()})`));

// espera o <img> DECODIFICAR (waitFor só espera attach; naturalWidth precisa
// do load do recurso — a src aponta pro backend :8000)
const waitDecoded = async (locator, timeout = 10000) => {
  await locator.waitFor({ timeout });
  const handle = await locator.elementHandle();
  await page.waitForFunction(el => el.complete && el.naturalWidth > 0, handle, { timeout });
  return handle.evaluate(el => el.naturalWidth);
};

// 0. login UI
await page.goto(`${BASE}/login`);
await page.getByPlaceholder('seu.usuario').fill('testadmin');
await page.locator('input[type="password"]').fill('TestAdmin123!');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL('**/admin**', { timeout: 15000 });
// settle: o dashboard dispara fetches; navegar em cima aborta e vira
// "TypeError: Failed to fetch" no console (falso-positivo do check 10)
await page.waitForTimeout(800);
ok('login testadmin (UI)');

// 1+2. DataViewer: upload REAL pelo widget da célula (MediaField → modal → dropzone)
await page.goto(`${BASE}/admin/data/${TABLE}`);
await page.getByRole('button', { name: 'Arquivo…' }).first().waitFor({ timeout: 10000 });
ok('DataViewer com célula de mídia (widget Arquivo…)');
await page.getByRole('button', { name: 'Arquivo…' }).first().click();
await page.locator('input[type="file"]').setInputFiles({ name: 'peca.png', mimeType: 'image/png', buffer: PNG });
// modal fecha + célula renderiza <img> decodificada do serving dev
try {
  const natural = await waitDecoded(page.locator(`img[src*="/api/assets/dev/"]`).first());
  ok(`upload → célula renderiza <img> decodificada (naturalWidth=${natural})`);
} catch {
  fail('upload: <img> não decodificou (recurso quebrado ou serving 404)');
}
await page.screenshot({ path: join(shotDir, 'media-dataviewer.png') });
console.log('[shot] media-dataviewer.png');

// 3. F5 sniffing NEGATIVO: .exe renomeado .png → rejeitado com erro no modal
await page.getByRole('button', { name: 'Arquivo…' }).first().click(); // 2ª row (ainda vazia)
await page.locator('input[type="file"]').setInputFiles({ name: 'evil.png', mimeType: 'image/png', buffer: EVIL });
await page.getByText(/não corresponde ao tipo declarado/).waitFor({ timeout: 8000 });
ok('sniffing E2E: .exe→.png rejeitado (erro exibido no modal, célula intocada)');
await page.screenshot({ path: join(shotDir, 'media-sniff-rejeitado.png') });
console.log('[shot] media-sniff-rejeitado.png');
await page.keyboard.press('Escape'); // fecha o modal
// deixa o loadLibrary/fetches do modal assentarem antes de navegar (aborto
// em voo vira "TypeError: Failed to fetch" no console — falso-positivo)
await page.waitForLoadState('networkidle').catch(() => {});

// 4. publish (exercita copy-at-publish F3) — via API (backend é o dono)
const ver = await api(apiToken, 'POST', '/api/publications/me/versions', {
  description: 'gate media', theme_config: {
    version: 1, preset: 'editorial',
    typography: { display: { family: "'Fraunces', Georgia, serif", italic: true, size: 88, weight: 400 }, body: { family: "'IBM Plex Serif', Georgia, serif" }, mono: { family: "'IBM Plex Mono', monospace" } },
    colors: { bg: '#FAEFD9', surface: '#FFFCF3', ink: '#212842', muted: '#4A5468', accent: '#C2441C', rule: '#212842' },
    layout: { density: 'comfy', radius: 4, default_table_layout: 'grid' },
    copy: { hero_eyebrow: 'Gate', hero_title: 'Gate de mídia', hero_sub: 'F5', footer_note: 'gate' },
  },
  table_selection: [{ table_id: tableId, order: 0, layout: 'grid' }],
});
if (ver.status !== 200) fail(`publicar versão: ${ver.status} ${JSON.stringify(ver.body).slice(0, 120)}`);
const verId = ver.body.id;
const act = await api(apiToken, 'POST', `/api/publications/me/versions/${verId}/activate`);
if (act.status === 200) ok(`versão v${ver.body.version_number} publicada + ativa (copy-at-publish rodou)`);
else fail(`ativar versão: ${act.status}`);

// 5. site público renderiza a mídia (a CÓPIA serve — path /pub/)
await page.goto(`${BASE}/${SLUG}`);
try {
  const pubNatural = await waitDecoded(page.locator('img[src*="/pub/"]').first());
  ok(`site público renderiza a cópia imutável (/pub/, naturalWidth=${pubNatural})`);
} catch {
  fail('site público: <img> da cópia não decodificou (cópia quebrada ou serving 404)');
}
await page.screenshot({ path: join(shotDir, 'media-publico.png') });
console.log('[shot] media-publico.png');

// 6. export ZIP embute a mídia (fetch Node + jszip)
const zipRes = await fetch(`${BASE}/api/export/${verId}`, { headers: { Authorization: `Bearer ${apiToken}` } });
if (!zipRes.ok) fail(`export ZIP: HTTP ${zipRes.status}`);
else {
  const buf = Buffer.from(await zipRes.arrayBuffer());
  if (buf.length > 5000) ok(`export ZIP baixou (${buf.length} bytes)`);
  else fail(`export ZIP suspeito de vazio (${buf.length} bytes)`);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const media = names.filter(n => n.startsWith('assets/media/') && !n.endsWith('/'));
  if (names.includes('index.html') && media.length >= 1) {
    const bytes = await zip.files[media[0]].async('uint8array');
    if (bytes.byteLength > 0) ok(`ZIP embute mídia (${media[0]}, ${bytes.byteLength} bytes)`);
    else fail('ZIP: entry de mídia vazia');
    const html = await zip.files['index.html'].async('string');
    if (html.includes('./assets/media/')) ok('index.html reescrito pra ./assets/media/ (offline real)');
    else fail('index.html sem rewrite relativo da mídia');
  } else {
    fail(`ZIP sem index.html + assets/media/ (entries: ${names.slice(0, 8).join(', ')})`);
  }
}

// 7. F4: import CSV cria tabela (fluxo create do import bifurcado)
await page.goto(`${BASE}/admin/import/data`);
await page.getByRole('button', { name: 'criar tabela nova' }).click();
await page.locator('input[type="file"]').setInputFiles({ name: `gate_import_${TS}.csv`, mimeType: 'text/csv', buffer: CSV });
await page.getByRole('button', { name: /Próximo · ver mapa/ }).click();
await page.getByText('Schema inferido').waitFor({ timeout: 10000 });
ok('import F4: dry-run → editor de schema inferido');
await page.screenshot({ path: join(shotDir, 'media-import-preview.png') });
console.log('[shot] media-import-preview.png');
await page.getByRole('button', { name: /^Criar "/ }).click();
await page.getByText('tabela criada').waitFor({ timeout: 15000 });
ok('import F4: commit criou a tabela e carregou as linhas');

// 8. matriz 2×4 do DataViewer com mídia (inspeção, não hard-assert)
await page.goto(`${BASE}/admin/data/${TABLE}`);
// o goto resolve no 'load' mas os fetches pós-hidratação do DataViewer ainda
// estão em voo — reload em cima deles aborta e vira "Failed to fetch"
await page.locator('img[src*="/api/assets/dev/"]').first().waitFor({ timeout: 10000 });
await page.waitForLoadState('networkidle').catch(() => {});
for (const theme of THEMES) {
  for (const accent of ACCENTS) {
    await page.evaluate(([t, a]) => {
      localStorage.setItem('mora-theme', t);
      localStorage.setItem('mora-accent', a);
    }, [theme, accent]);
    await page.reload();
    await page.locator('img[src*="/api/assets/dev/"]').first().waitFor({ timeout: 10000 });
    // deixa os fetches do DataViewer assentarem — reload em cima de fetch em
    // voo aborta e vira "TypeError: Failed to fetch" (falso-positivo do check 10)
    await page.waitForLoadState('networkidle').catch(() => {});
    const name = `media-${theme}-${accent}.png`;
    await page.screenshot({ path: join(shotDir, name) });
    console.log(`[shot] ${name}`);
  }
}
await page.evaluate(() => { localStorage.setItem('mora-theme', 'light'); localStorage.setItem('mora-accent', 'goldenrod'); });

// 9. budget: reload → DataViewer com a mídia < 2000ms
await page.waitForLoadState('networkidle').catch(() => {});
const t0 = Date.now();
await page.reload();
await page.locator('img[src*="/api/assets/dev/"]').first().waitFor({ timeout: 10000 });
const mountMs = Date.now() - t0;
await page.waitForLoadState('networkidle').catch(() => {});
console.log(`[medida] reload → DataViewer com mídia: ${mountMs}ms ${mountMs < 2000 ? '(dentro do budget 2s)' : '— ACIMA DO BUDGET 2s'}`);
if (mountMs >= 2000) failed = true;

// 10. console errors (allowlist: favicon + o 415 esperado do check 3)
if (consoleErrors.length) fail(`erros de console (${consoleErrors.length}): ${consoleErrors.slice(0, 5).join(' | ')}`);
else ok('zero erros de console (fora a allowlist)');

// 11. teardown best-effort — NUNCA falha o gate
try {
  const tables = await api(apiToken, 'GET', '/tables/');
  for (const t of tables.body) {
    if (t.name === TABLE || /^gate_import_\d+$/.test(t.name)) {
      await api(apiToken, 'DELETE', `/tables/${t.id}?confirm_name=${t.name}`);
      console.log(`[teardown] ${t.name} removida`);
    }
  }
  // a versão publicada fica (ativa não deleta; dev-only, GC cuida das cópias)
} catch (e) {
  console.log(`[teardown] cleanup parcial: ${e}`);
}

await browser.close();
console.log(failed ? '\n✗ GATE DE MÍDIA FALHOU' : '\n✓ GATE DE MÍDIA VERDE');
process.exit(failed ? 1 : 0);
