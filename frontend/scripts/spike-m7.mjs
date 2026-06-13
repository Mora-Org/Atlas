/**
 * M7 spike — harness de medição dos 2 candidatos de render.
 *
 * Mede por candidato × escala (10/30/60/100):
 *  - mount (ms), nós/edges/cruzamentos/camadas
 *  - JS transferido (KB, encoded) — delta B−A ≈ custo da lib (critério 5)
 *  - FPS médio durante pan contínuo + zoom (critério 2), long tasks
 *  - export PNG off-screen (critério 6): ok/ms/bytes
 *  - screenshots light/dark na escala 30 (+ dagre no B)
 *  - se backend :8000 no ar: screenshot de /admin/tables pra comparação (critério 1)
 *
 * Rodar: node scripts/spike-m7.mjs <shot-dir>
 * Pré-requisito: next start :3000 (backend opcional).
 */
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const [, , shotDir = 'spike-shots'] = process.argv;
mkdirSync(shotDir, { recursive: true });

const BASE = 'http://localhost:3000';
const SCALES = [10, 30, 60, 100];
const CANDIDATES = ['a', 'b'];
const results = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function measure(candidate, scale, extraQuery = '', tag = '') {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(String(e)));

  let jsBytes = 0; // transfer size real (encoded), via CDP sizes()
  const sizePromises = [];
  page.on('requestfinished', req => {
    if (req.resourceType() === 'script') {
      sizePromises.push(req.sizes().then(s => { jsBytes += s.responseBodySize }).catch(() => {}));
    }
  });

  await page.goto(`${BASE}/spike/${candidate}?n=${scale}${extraQuery}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__spike?.mountMs != null, null, { timeout: 20000 });
  await Promise.all(sizePromises);
  const spike = await page.evaluate(() => ({ ...window.__spike, exportPng: undefined }));

  // FPS durante pan contínuo (mouse drag) + zoom (wheel)
  await page.evaluate(() => {
    window.__fps = { frames: 0, long: 0, start: performance.now() };
    const tick = () => { window.__fps.frames++; requestAnimationFrame(tick) };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver(list => { window.__fps.long += list.getEntries().length })
        .observe({ entryTypes: ['longtask'] });
    } catch {}
  });
  const vp = page.locator('[data-testid="spike-viewport"]');
  const box = await vp.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 30; i++) await page.mouse.move(cx + Math.sin(i / 3) * 300, cy + Math.cos(i / 4) * 150, { steps: 3 });
  await page.mouse.up();
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, i % 2 ? 240 : -240);
  await page.waitForTimeout(200);
  const fps = await page.evaluate(() => {
    const f = window.__fps;
    return { fps: Math.round(f.frames / ((performance.now() - f.start) / 1000)), longTasks: f.long };
  });

  // export PNG (critério 6)
  let exportPng = null;
  try {
    exportPng = await page.evaluate(() => window.__spike.exportPng?.() ?? null);
  } catch (e) { exportPng = { ok: false, error: String(e) } }

  // screenshots light/dark na escala 30
  if (scale === 30) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => localStorage.setItem('mora-theme', t), theme);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__spike?.mountMs != null, null, { timeout: 20000 });
      await page.waitForTimeout(500);
      const name = `${candidate}${tag}-30-${theme}.png`;
      await page.screenshot({ path: join(shotDir, name) });
      console.log(`[shot] ${name}`);
    }
  }

  await ctx.close();
  const row = {
    candidate: candidate.toUpperCase() + tag, scale,
    nodes: spike.nodes, edges: spike.edges, crossings: spike.crossings, layers: spike.layers,
    mountMs: spike.mountMs, jsKB: Math.round(jsBytes / 1024),
    fps: fps.fps, longTasks: fps.longTasks,
    exportOk: exportPng?.ok ?? false, exportMs: exportPng?.ms ?? null,
    exportError: exportPng?.error ?? null,
    consoleErrors: errors.length, firstError: errors[0] ?? null,
  };
  results.push(row);
  console.log(`[${row.candidate} n=${scale}] mount=${row.mountMs}ms js=${row.jsKB}KB fps=${row.fps} long=${row.longTasks} cross=${row.crossings} export=${row.exportOk ? row.exportMs + 'ms' : 'FAIL'} errs=${row.consoleErrors}`);
  return row;
}

for (const c of CANDIDATES) for (const s of SCALES) await measure(c, s);
// B com layout dagre (comparação de auto-layout lib-nativo), só escala 30
await measure('b', 30, '&layout=dagre', '-dagre');

// comparação com /admin/tables (critério 1) — precisa de backend
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { timeout: 8000 });
  await page.getByPlaceholder('seu.usuario').fill('testadmin');
  await page.locator('input[type="password"]').fill('TestAdmin123!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/admin**', { timeout: 10000 });
  await page.goto(`${BASE}/admin/tables`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(shotDir, 'referencia-admin-tables.png') });
  console.log('[shot] referencia-admin-tables.png');
  await ctx.close();
} catch {
  console.log('[skip] backend fora do ar — screenshot de /admin/tables não capturado');
}

await browser.close();
writeFileSync(join(shotDir, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length} medições → ${join(shotDir, 'results.json')}`);
