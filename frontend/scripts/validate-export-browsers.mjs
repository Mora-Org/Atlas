/**
 * Gate final M6 Fase 5 — abre o index.html EXPORTADO via file:// em
 * Chrome, Edge e Firefox; valida fontes carregadas, ausência de erros
 * de console e presença dos 3 layouts; tira screenshot de cada um.
 *
 * Rodar: node scripts/validate-export-browsers.mjs <pasta-do-zip-extraido> <pasta-screenshots>
 */
import { chromium, firefox } from 'playwright';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const [, , exportDir, shotDir, heroText = 'Estudio de Teste'] = process.argv;
if (!exportDir || !shotDir) {
  console.error('uso: node validate-export-browsers.mjs <export-dir> <screenshot-dir>');
  process.exit(2);
}
mkdirSync(shotDir, { recursive: true });

const fileUrl = 'file:///' + resolve(exportDir, 'index.html').replaceAll('\\', '/');
const FONTS = ['Fraunces', 'IBM Plex Serif', 'IBM Plex Mono'];

const targets = [
  { name: 'chrome', launch: () => chromium.launch({ channel: 'chrome', headless: true }) },
  { name: 'edge', launch: () => chromium.launch({ channel: 'msedge', headless: true }) },
  { name: 'firefox', launch: () => firefox.launch({ headless: true }) },
];

let failed = false;

for (const t of targets) {
  let browser;
  try {
    browser = await t.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 2000 } });
    const consoleErrors = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    const failedRequests = [];
    page.on('requestfailed', (r) => failedRequests.push(`${r.url()} (${r.failure()?.errorText})`));

    await page.goto(fileUrl, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const fontsOk = await page.evaluate(
      (fams) => fams.map((f) => [f, document.fonts.check(`16px "${f}"`)]),
      FONTS,
    );
    const hero = await page.locator(`text=${heroText}`).first().isVisible().catch(() => false);
    const sections = await page.locator('section').count();

    await page.screenshot({ path: join(shotDir, `${t.name}.png`), fullPage: false });

    const missing = fontsOk.filter(([, ok]) => !ok).map(([f]) => f);
    const problems = [];
    if (missing.length) problems.push(`fontes faltando: ${missing.join(', ')}`);
    if (!hero) problems.push('hero não visível');
    if (sections < 2) problems.push(`só ${sections} sections (esperado hero + ≥1 tabela)`);
    if (consoleErrors.length) problems.push(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
    if (failedRequests.length) problems.push(`requests falhando: ${failedRequests.slice(0, 3).join(' | ')}`);

    if (problems.length) {
      failed = true;
      console.log(`[FAIL] ${t.name}: ${problems.join(' ; ')}`);
    } else {
      console.log(`[OK] ${t.name}: fontes ${FONTS.join('/')} carregadas, hero visível, ${sections} sections, zero erros`);
    }
  } catch (e) {
    failed = true;
    console.log(`[FAIL] ${t.name}: ${e.message ?? e}`);
  } finally {
    await browser?.close();
  }
}

process.exit(failed ? 1 : 0);
