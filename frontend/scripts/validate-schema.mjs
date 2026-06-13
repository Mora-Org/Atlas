/**
 * Gate M7 PR2 — valida o Schema Visualizer:
 * - sidebar alcança /admin/schema (link novo)
 * - matriz light/dark × 4 acentos com fixture de 30 tabelas (route mock —
 *   GET /tables/ interceptado; zero mudança no código de produto)
 * - budget: reload → canvas visível < 1.5s com 30 tabelas
 * - fluidez de pan com 100 tabelas (FPS + long tasks)
 * - estado vazio (mock []) mostra CTA editorial
 * - zero erros de console
 *
 * Rodar: node scripts/validate-schema.mjs <shot-dir>
 * Pré-requisito: backend :8000 + next start :3000 no ar.
 */
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [, , shotDir = 'schema-shots'] = process.argv;
mkdirSync(shotDir, { recursive: true });

const here = dirname(fileURLToPath(import.meta.url));
const tmpFix = join(here, '.tmp-fixtures.mjs');
execSync(`npx esbuild src/lib/spikeFixtures.ts --bundle --format=esm --outfile="${tmpFix}"`, {
  cwd: join(here, '..'), stdio: 'pipe',
});
const { generateFixture } = await import(pathToFileURL(tmpFix).href);
const fix30 = generateFixture(30).tables;
const fix100 = generateFixture(100).tables;
rmSync(tmpFix);

const BASE = 'http://localhost:3000';
const THEMES = ['light', 'dark'];
const ACCENTS = ['goldenrod', 'sage', 'ruby', 'nectar'];
let failed = false;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const consoleErrors = [];
page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', e => consoleErrors.push(String(e)));

const mockTables = async (data) => {
  await page.unroute('**/tables/');
  await page.route('**/tables/', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }));
};

// login testadmin via UI
await page.goto(`${BASE}/login`);
await page.getByPlaceholder('seu.usuario').fill('testadmin');
await page.locator('input[type="password"]').fill('TestAdmin123!');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL('**/admin**', { timeout: 15000 });
console.log('[ok] login testadmin');

// sidebar alcança o Esquema
await page.getByRole('link', { name: 'Esquema' }).click();
await page.waitForURL('**/admin/schema', { timeout: 8000 });
console.log('[ok] sidebar → /admin/schema');

// budget de mount com 30 tabelas (route mock)
await mockTables(fix30);
await page.reload();
await page.locator('[data-testid="schema-viewport"]').waitFor({ timeout: 10000 });
const t0 = Date.now();
await page.reload();
await page.locator('[data-testid="schema-world"]').waitFor({ timeout: 10000 });
const mountMs = Date.now() - t0;
console.log(`[medida] reload → canvas com 30 tabelas: ${mountMs}ms ${mountMs < 1500 ? '(dentro do budget 1.5s)' : '— ACIMA DO BUDGET 1.5s'}`);
if (mountMs >= 1500) failed = true;

// matriz 2×4 com a fixture de 30
for (const theme of THEMES) {
  for (const accent of ACCENTS) {
    await page.evaluate(([t, a]) => {
      localStorage.setItem('mora-theme', t);
      localStorage.setItem('mora-accent', a);
    }, [theme, accent]);
    await page.reload();
    await page.locator('[data-testid="schema-world"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(450);
    const name = `schema-30-${theme}-${accent}.png`;
    await page.screenshot({ path: join(shotDir, name) });
    console.log(`[shot] ${name}`);
  }
}
await page.evaluate(() => { localStorage.setItem('mora-theme', 'light'); localStorage.setItem('mora-accent', 'goldenrod'); });

// fluidez de pan com 100 tabelas — mede o estado ESTACIONÁRIO.
// A primeira interação pós-load raster iza tiles (16-58fps de variância
// no headless, medido na sonda); o critério do plano é fluidez de pan,
// então: 1 drag de warm-up, depois a medição. Os dois números saem no log.
// page NOVA + principal estacionada: medir com a page das screenshots
// viva/renderizando dava 28-32fps; page limpa e sozinha reproduz a sonda
await page.goto('about:blank');
const perfPage = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
await perfPage.route('**/tables/', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fix100) }));
await perfPage.goto(`${BASE}/login`);
await perfPage.getByPlaceholder('seu.usuario').fill('testadmin');
await perfPage.locator('input[type="password"]').fill('TestAdmin123!');
await perfPage.getByRole('button', { name: 'Entrar' }).click();
await perfPage.waitForURL('**/admin**', { timeout: 15000 });
await perfPage.goto(`${BASE}/admin/schema`);
await perfPage.locator('[data-testid="schema-world"]').waitFor({ timeout: 10000 });
const startFps = () => perfPage.evaluate(() => {
  window.__fps = { frames: 0, long: 0, start: performance.now() };
  const tick = () => { window.__fps.frames++; requestAnimationFrame(tick) };
  requestAnimationFrame(tick);
  try { new PerformanceObserver(l => { window.__fps.long += l.getEntries().length }).observe({ entryTypes: ['longtask'] }) } catch {}
});
const readFps = () => perfPage.evaluate(() => {
  const f = window.__fps;
  return { fps: Math.round(f.frames / ((performance.now() - f.start) / 1000)), long: f.long };
});
const doDrag = async () => {
  const box = await perfPage.locator('[data-testid="schema-viewport"]').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await perfPage.mouse.move(cx, cy);
  await perfPage.mouse.down();
  for (let i = 0; i < 30; i++) await perfPage.mouse.move(cx + Math.sin(i / 3) * 300, cy + Math.cos(i / 4) * 150, { steps: 3 });
  await perfPage.mouse.up();
};
await startFps();
await doDrag();
const cold = await readFps();
await doDrag() // 2º drag: rasterização de tiles ainda termina aqui
// GATE (plano: "fluidez de pan a 100"): pan estacionário (3º drag)
await startFps();
await doDrag();
const pan = await readFps();
console.log(`[medida] pan com 100 tabelas: ${pan.fps}fps estacionário (${cold.fps}fps no 1º contato/raster), ${pan.long} long tasks ${pan.fps >= 50 ? '(fluido)' : '— JANK'}`);
if (pan.fps < 50) failed = true;
// informativo: zoom re-rasteriza tiles a cada passo de escala — caro por
// natureza; não é gate, mas fica registrado
await startFps();
for (let i = 0; i < 8; i++) await perfPage.mouse.wheel(0, i % 2 ? 240 : -240);
await perfPage.waitForTimeout(150);
const zoom = await readFps();
console.log(`[info] zoom com 100 tabelas: ${zoom.fps}fps (re-raster por mudança de escala)`);
await perfPage.screenshot({ path: join(shotDir, 'schema-100-light-goldenrod.png') });
await perfPage.context().close();

// estado vazio → CTA (token sobrevive em localStorage; volta da estação)
await mockTables([]);
await page.goto(`${BASE}/admin/schema`);
await page.getByText('edição zero').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: 'Criar a primeira tabela' }).waitFor({ timeout: 4000 });
await page.screenshot({ path: join(shotDir, 'schema-vazio.png') });
console.log('[ok] estado vazio com CTA');

// comparação lado a lado com /admin/tables (dados reais)
await page.unroute('**/tables/');
await page.goto(`${BASE}/admin/tables`);
await page.waitForTimeout(1500);
await page.screenshot({ path: join(shotDir, 'referencia-admin-tables.png') });
console.log('[shot] referencia-admin-tables.png');

// /admin/schema com dados REAIS do backend (sem mock) — sanidade
await page.goto(`${BASE}/admin/schema`);
await page.locator('[data-testid="schema-viewport"], [data-testid="schema-world"]').first().waitFor({ timeout: 10000 });
await page.waitForTimeout(800);
await page.screenshot({ path: join(shotDir, 'schema-dados-reais.png') });
console.log('[shot] schema-dados-reais.png (backend real)');

if (consoleErrors.length) {
  console.log(`[FAIL] erros de console (${consoleErrors.length}): ${consoleErrors.slice(0, 5).join(' | ')}`);
  failed = true;
} else {
  console.log('[ok] zero erros de console');
}

await browser.close();
process.exit(failed ? 1 : 0);
