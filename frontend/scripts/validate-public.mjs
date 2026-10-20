/**
 * Gate 1.3.2 — o site público interativo funciona num browser de verdade, com
 * o React hidratando a página (o que nenhum teste da 1.3 fazia).
 *
 * O defeito que este gate fecha: o `PUBLIC_SITE_RUNTIME` rodava inline, no
 * DOMContentLoaded, ANTES da hidratação. Ele redesenha o `<tbody>` e o
 * paginador; o React encontrava um DOM diferente do que o servidor mandou
 * (erro #418), descartava tudo e redesenhava do zero — e os listeners que o
 * runtime tinha ligado morriam junto. Resultado no ar: filtro, paginação e
 * Excel mortos e todos os painéis empilhados. O vitest não via porque roda o
 * runtime em jsdom sobre markup estático, sem React; o ZIP não sofria porque
 * não tem React. Só um browser com a rota real do Next reproduz.
 *
 * Também cobre a página ocupando a tela inteira (o rodapé não pode deixar uma
 * faixa sem fundo embaixo quando o painel é curto).
 *
 * Rodar: npm run gate:public  (ou node scripts/validate-public.mjs <shot-dir>)
 * Pré-requisito (3 terminais), igual aos outros gates:
 *   T1  cd backend && venv/Scripts/python -m uvicorn main:app --port 8000
 *   T2  cd frontend && npm run build && npm run start   (start, não dev)
 *   T3  cd frontend && npm run gate:public
 */
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync, statSync } from 'node:fs';

const [, , shotDir = 'public-shots'] = process.argv;
mkdirSync(shotDir, { recursive: true });

const BASE = process.env.GATE_BASE || 'http://localhost:3000';
const API = process.env.GATE_API || 'http://localhost:8000';
const TS = Date.now();
const TABELA = `gate_pub_${TS}`;
const OUTRA = `gate_pub_b_${TS}`;
const SLUG = `gatepub${TS}`;
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

// Tema completo, como o Studio manda (o `PublicSite` não aceita tema vazio).
const THEME = {
  version: 1, preset: 'editorial',
  typography: { display: { family: "'Fraunces', Georgia, serif", italic: false, size: 88, weight: 400 }, body: { family: "'IBM Plex Serif', Georgia, serif" }, mono: { family: "'IBM Plex Mono', monospace" } },
  colors: { bg: '#F0EFE2', surface: '#FFFCF3', ink: '#2A2E25', muted: '#5C6650', accent: '#5F6E4E', rule: '#2A2E25' },
  layout: { density: 'regular', radius: 6, default_table_layout: 'tabela' },
  copy: { hero_eyebrow: 'Gate', hero_title: 'Gate do site público', hero_sub: '1.3.2', footer_note: 'gate público' },
};

// ── fixture: 60 linhas (3 páginas de 25), metade em cada cidade ──
const token = await login();
ok('login API (fixture)');
await api(token, 'PATCH', '/api/admins/me/workspace', { workspace_name: 'Gate Público', workspace_slug: SLUG });

const criar = async (nome) => {
  const r = await api(token, 'POST', '/tables/', {
    name: nome, is_public: true,
    columns: [
      { name: 'nome', data_type: 'String', is_nullable: true },
      { name: 'cidade', data_type: 'String', is_nullable: true },
    ],
  });
  if (r.status !== 200) { fail(`criar tabela ${nome}: ${r.status}`); process.exit(1); }
  return r.body.id;
};
const idA = await criar(TABELA);
const idB = await criar(OUTRA);
for (let i = 1; i <= 60; i++) {
  await api(token, 'POST', `/api/${TABELA}`, {
    nome: `Templo ${String(i).padStart(2, '0')}`,
    cidade: i % 2 ? 'São Paulo' : 'Curitiba',
  });
}
await api(token, 'POST', `/api/${OUTRA}`, { nome: 'Só uma linha', cidade: 'Recife' });
ok(`fixture: ${TABELA} (60 linhas) + ${OUTRA} (1 linha)`);

const ver = await api(token, 'POST', '/api/publications/me/versions', {
  description: 'gate público', theme_config: THEME,
  table_selection: [
    { table_id: idA, order: 0, layout: 'tabela' },
    { table_id: idB, order: 1, layout: 'tabela' },
  ],
  charts: [],
});
if (ver.status !== 200) { fail(`publicar: ${ver.status} ${JSON.stringify(ver.body).slice(0, 140)}`); process.exit(1); }
const act = await api(token, 'POST', `/api/publications/me/versions/${ver.body.id}/activate`);
if (act.status === 200) ok(`v${ver.body.version_number} publicada e ativa`);
else fail(`ativar: ${act.status}`);

// ── browser ──
const launch = async () => {
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { return await chromium.launch({ ...(channel ? { channel } : {}), headless: true }); }
    catch { /* próximo */ }
  }
  throw new Error('nenhum chromium — rode: npx playwright install chromium');
};
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const page = await context.newPage();
const erros = [];
const ALLOW = [/favicon/i];
page.on('console', (m) => { if (m.type() === 'error' && !ALLOW.some((re) => re.test(m.text()))) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(String(e)));

await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle' });
// folga pra hidratação terminar: o defeito acontece DEPOIS do load
await page.waitForTimeout(1500);

// 1. hidratação limpa — o sintoma-raiz
const hidratacao = erros.filter((e) => /#418|#423|#425|hydrat/i.test(e));
if (hidratacao.length === 0) ok('hidratação sem erro (#418/#423/#425)');
else fail(`hidratação quebrou: ${hidratacao[0].slice(0, 160)}`);

const pronto = await page.evaluate(() => document.documentElement.getAttribute('data-atlas-ready'));
if (pronto === '1') ok('runtime subiu (data-atlas-ready=1)');
else fail('runtime não marcou data-atlas-ready');

// 2. ocupa a tela inteira com o painel curto (Início)
const altura = await page.evaluate(() => {
  // o gancho nasceu na 1.3.2; antes dela a raiz é o pai dos painéis
  const raiz = document.querySelector('[data-atlas-site]')
    || (document.querySelector('[data-atlas-panel]') || {}).parentElement;
  return { raiz: raiz ? raiz.getBoundingClientRect().height : 0, janela: window.innerHeight };
});
if (altura.raiz >= altura.janela - 1) ok(`site ocupa a tela inteira (${altura.raiz.toFixed(0)}px ≥ ${altura.janela}px)`);
else fail(`site não ocupa a tela: ${altura.raiz.toFixed(0)}px de ${altura.janela}px`);
await page.screenshot({ path: join(shotDir, 'inicio.png') });

// 3. abas: clicar mostra SÓ o painel escolhido
const visiveis = () => page.$$eval('[data-atlas-panel]', (ps) => ps.filter((p) => !p.hidden).map((p) => p.getAttribute('data-atlas-panel')));
await page.click(`[data-atlas-tab="${TABELA}"]`);
const v1 = await visiveis();
if (v1.length === 1 && v1[0] === TABELA) ok('aba: clicar mostra só o painel da tabela');
else fail(`aba: painéis visíveis depois do clique = ${JSON.stringify(v1)}`);
await page.click(`[data-atlas-tab="${OUTRA}"]`);
const v2 = await visiveis();
if (v2.length === 1 && v2[0] === OUTRA) ok('aba: trocar de aba esconde a anterior');
else fail(`aba: depois de trocar = ${JSON.stringify(v2)}`);
await page.click(`[data-atlas-tab="${TABELA}"]`);

const painel = page.locator(`[data-atlas-panel="${TABELA}"]`);
const contador = () => painel.locator('[data-atlas-count]').innerText();
const linhas = () => painel.locator('[data-atlas-body] tr').count();
const paginador = () => painel.locator('[data-atlas-pager]').innerText();

// 4. paginação
const pg = await paginador();
if (/página 1 de 3/.test(pg)) ok('paginação: "página 1 de 3" com 60 linhas');
else fail(`paginação ausente ou errada: "${pg.replace(/\s+/g, ' ').slice(0, 80)}"`);
await painel.locator('[data-atlas-pager] button', { hasText: '2' }).click().catch(() => {});
const primeiraP2 = await painel.locator('[data-atlas-body] tr').first().innerText().catch(() => '');
if (primeiraP2.includes('Templo 26')) ok('paginação: a página 2 começa no registro 26');
else fail(`paginação: página 2 começou em "${primeiraP2.slice(0, 40)}"`);

// 5. filtro (sem acento casa com acento) + contador
await painel.locator('[data-atlas-filter="cidade"]').fill('sao paulo');
const c1 = await contador();
if (/^30 de 60/.test(c1.trim())) ok('filtro: "sao paulo" acha as 30 de "São Paulo"');
else fail(`filtro não filtrou: contador = "${c1}"`);
await painel.locator('[data-atlas-filter="nome"]').fill('templo 0');
const c2 = await contador();
if (/^5 de 60/.test(c2.trim())) ok('filtro: duas colunas combinam com E (5 de 60)');
else fail(`filtro combinado: contador = "${c2}"`);

// 6. Excel leva o filtrado
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  painel.locator('[data-atlas-export]').click(),
]);
if (download) {
  const caminho = join(shotDir, download.suggestedFilename());
  await download.saveAs(caminho);
  const tam = statSync(caminho).size;
  if (download.suggestedFilename() === `${TABELA}.xlsx` && tam > 0) ok(`Excel: baixou ${download.suggestedFilename()} (${tam} bytes)`);
  else fail(`Excel: arquivo inesperado ${download.suggestedFilename()} (${tam} bytes)`);
} else fail('Excel: o clique não baixou nada');

// 7. tamanho da página
await painel.locator('[data-atlas-filter="nome"]').fill('');
await painel.locator('[data-atlas-filter="cidade"]').fill('');
await painel.locator('[data-atlas-pagesize]').selectOption('50');
const n50 = await linhas();
if (n50 === 50) ok('por página: 50 mostra 50 linhas');
else fail(`por página: 50 mostrou ${n50}`);
await page.screenshot({ path: join(shotDir, 'tabela.png') });

// 8. console limpo no fim de tudo
if (erros.length) fail(`erros de console (${erros.length}): ${erros.slice(0, 2).join(' | ').slice(0, 240)}`);
else ok('console sem erros');

await api(token, 'DELETE', `/tables/${idA}?confirm_name=${TABELA}`).catch(() => {});
await api(token, 'DELETE', `/tables/${idB}?confirm_name=${OUTRA}`).catch(() => {});
await browser.close();

console.log(failed ? '\n=== GATE DO SITE PÚBLICO: FALHOU ===' : '\n=== GATE DO SITE PÚBLICO: VERDE ===');
process.exit(failed ? 1 : 0);
