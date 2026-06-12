/**
 * Gate M6.5 PR2 — valida a capa editorial:
 * - matriz light/dark × 4 acentos com screenshot de cada combinação
 * - tempo até a capa renderizar (budget: < 1.5s pós-login warm)
 * - master é redirecionado pro painel
 * - zero erros de console
 *
 * Rodar: node scripts/validate-cover.mjs <screenshot-dir>
 * Pré-requisito: backend :8000 + next start :3000 no ar.
 */
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const [, , shotDir = 'cover-shots'] = process.argv;
mkdirSync(shotDir, { recursive: true });

const BASE = 'http://localhost:3000';
const THEMES = ['light', 'dark'];
const ACCENTS = ['goldenrod', 'sage', 'ruby', 'nectar'];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
const consoleErrors = [];
page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', e => consoleErrors.push(String(e)));

let failed = false;

// login testadmin via UI
await page.goto(`${BASE}/login`);
await page.getByPlaceholder('seu.usuario').fill('testadmin');
await page.locator('input[type="password"]').fill('TestAdmin123!');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL('**/admin**', { timeout: 15000 });
console.log('[ok] login testadmin');

// medição warm: navega de novo pra /admin e mede até o masthead aparecer
await page.goto(`${BASE}/admin`);
await page.locator('.cover-paper').waitFor({ timeout: 10000 });
const t0 = Date.now();
await page.reload();
await page.locator('text=/Edição nº|nenhuma edição no ar|rascunho · não publicado/').first().waitFor({ timeout: 10000 });
const mountMs = Date.now() - t0;
console.log(`[medida] reload → masthead visível: ${mountMs}ms ${mountMs < 1500 ? '(dentro do budget 1.5s)' : '— ACIMA DO BUDGET 1.5s'}`);
if (mountMs >= 1500) failed = true;

// matriz 2×4
for (const theme of THEMES) {
  for (const accent of ACCENTS) {
    await page.evaluate(([t, a]) => {
      localStorage.setItem('mora-theme', t);
      localStorage.setItem('mora-accent', a);
    }, [theme, accent]);
    await page.reload();
    await page.locator('.cover-paper').waitFor({ timeout: 10000 });
    await page.waitForTimeout(400); // fontes/texture assentarem
    const name = `${theme}-${accent}.png`;
    await page.screenshot({ path: join(shotDir, name), fullPage: true });
    console.log(`[shot] ${name}`);
  }
}

// estado: master redireciona
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p2 = await ctx2.newPage();
await p2.goto(`${BASE}/login`);
await p2.getByPlaceholder('seu.usuario').fill('puczaras');
await p2.locator('input[type="password"]').fill('Zup Paras');
await p2.getByRole('button', { name: 'Entrar' }).click();
await p2.waitForURL('**/admin**', { timeout: 15000 });
await p2.goto(`${BASE}/admin`);
try {
  await p2.waitForURL('**/admin/admins', { timeout: 8000 });
  console.log('[ok] master redirecionado pra /admin/admins');
} catch {
  console.log(`[FAIL] master NÃO redirecionou — url: ${p2.url()}`);
  failed = true;
}
await ctx2.close();

if (consoleErrors.length) {
  console.log(`[FAIL] erros de console (${consoleErrors.length}): ${consoleErrors.slice(0, 5).join(' | ')}`);
  failed = true;
} else {
  console.log('[ok] zero erros de console');
}

await browser.close();
process.exit(failed ? 1 : 0);
