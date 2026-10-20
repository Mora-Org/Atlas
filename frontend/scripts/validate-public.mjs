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

// 3b. o que o runtime redesenha tem estilo (antes: linha sem espaçamento e aba
// ativa sem marca — a folha das classes do runtime não existia)
const estilo = await page.evaluate((tabela) => {
  const td = document.querySelector(`[data-atlas-panel="${tabela}"] [data-atlas-body] td`);
  const aba = document.querySelector(`[data-atlas-tab="${tabela}"]`);
  return {
    pad: td ? getComputedStyle(td).paddingLeft : null,
    abaBorda: aba ? getComputedStyle(aba).borderBottomColor : null,
  };
}, TABELA);
if (estilo.pad === '12px') ok('linha redesenhada pelo runtime tem espaçamento (12px)');
else fail(`linha redesenhada sem espaçamento: padding-left=${estilo.pad}`);
if (estilo.abaBorda === 'rgb(95, 110, 78)') ok('aba ativa marcada com o accent do tema');
else fail(`aba ativa sem marca: border-bottom-color=${estilo.abaBorda}`);

// 4. paginação
const pg = await paginador();
if (/página 1 de 3/.test(pg)) ok('paginação: "página 1 de 3" com 60 linhas');
else fail(`paginação ausente ou errada: "${pg.replace(/\s+/g, ' ').slice(0, 80)}"`);
await painel.locator('[data-atlas-pager] button', { hasText: '2' }).click().catch(() => {});
const primeiraP2 = await painel.locator('[data-atlas-body] tr').first().innerText().catch(() => '');
if (primeiraP2.includes('Templo 26')) ok('paginação: a página 2 começa no registro 26');
else fail(`paginação: página 2 começou em "${primeiraP2.slice(0, 40)}"`);

// 4b. (1.5, revisão P1) digitar no filtro e clicar LOGO DEPOIS: o blur da
// caixa dispara 'change' no mousedown do clique; se isso redesenhar a tabela,
// o botão/link sai do DOM e o 1º clique se perde
await painel.locator('[data-atlas-filter="nome"]').fill('templo');
await painel.locator('[data-atlas-pager] button', { hasText: '2' }).click();
const pgDepois = (await paginador()).replace(/\s+/g, ' ');
if (/página 2 de 3/.test(pgDepois)) ok('1º clique no paginador logo depois de digitar no filtro funciona');
else fail(`1º clique no paginador depois de digitar se perdeu: "${pgDepois.slice(0, 60)}"`);
await painel.locator('[data-atlas-filter="nome"]').fill('Templo 1');
await painel.locator('[data-atlas-body] a.atlas-link').first().click();
await page.waitForTimeout(300);
const abriu = await page.locator('[data-atlas-ficha]').count();
if (abriu === 1) ok('1º clique no link da ficha logo depois de digitar no filtro abre a ficha');
else fail('1º clique no link da ficha depois de digitar se perdeu (ficha não abriu)');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await painel.locator('[data-atlas-filter="nome"]').fill('');

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

// ── 1.4: ficha do registro ────────────────────────────────────────────────
// templo (aba) ← junção (só fichas, com `funcao`) → pessoa (aba)
const T14 = `gt_templo_${TS}`;
const P14 = `gt_pessoa_${TS}`;
const J14 = `gt_junc_${TS}`;
const criarCols = async (nome, cols) => {
  const r = await api(token, 'POST', '/tables/', {
    name: nome, is_public: true,
    columns: cols.map(([n, t]) => ({ name: n, data_type: t, is_nullable: true })),
  });
  if (r.status !== 200) { fail(`1.4: criar ${nome}: ${r.status}`); process.exit(1); }
  return r.body.id;
};
const idT = await criarCols(T14, [['nome', 'String'], ['cidade', 'String']]);
const idP = await criarCols(P14, [['nome_personalidade', 'String']]);
const idJ = await criarCols(J14, [['pt_templo', 'Integer'], ['pt_pessoa', 'Integer'], ['funcao', 'String']]);
await api(token, 'POST', `/api/${T14}`, { nome: 'Templo Zu Lai', cidade: 'Cotia' });
await api(token, 'POST', `/api/${P14}`, { nome_personalidade: 'Monja Coen' });
await api(token, 'POST', `/api/${J14}`, { pt_templo: 1, pt_pessoa: 1, funcao: 'Fundadora' });
for (const [col, alvo] of [['pt_templo', idT], ['pt_pessoa', idP]]) {
  const r = await api(token, 'POST', '/api/relations', {
    name: `${col}_${TS}`, from_table_id: idJ, to_table_id: alvo,
    relation_type: 'many-to-one', from_column_name: col, to_column_name: 'id',
  });
  if (r.status !== 200) fail(`1.4: relação ${col}: ${r.status}`);
}
const v14 = await api(token, 'POST', '/api/publications/me/versions', {
  description: 'gate 1.4', theme_config: THEME,
  table_selection: [
    { table_id: idT, order: 0, layout: 'tabela', label: 'Templos',
      columns: [{ name: 'nome', label: 'Nome' }, { name: 'cidade', label: 'Cidade', placement: 'ficha' }] },
    { table_id: idP, order: 1, layout: 'tabela', label: 'Personalidades' },
    { table_id: idJ, order: 2, layout: 'tabela', role: 'ficha', columns: [{ name: 'funcao', label: 'Função' }] },
  ],
  charts: [],
});
if (v14.status !== 200) { fail(`1.4: publicar: ${v14.status} ${JSON.stringify(v14.body).slice(0, 160)}`); process.exit(1); }
await api(token, 'POST', `/api/publications/me/versions/${v14.body.id}/activate`);
ok(`1.4: v${v14.body.version_number} com aba + junção "só fichas" publicada`);
// A rota tem `revalidate: 30`: o endereço antigo ainda serviria a versão
// anterior. Endereço novo = cache novo, sem esperar relógio.
const SLUG2 = `${SLUG}f`;
await api(token, 'PATCH', '/api/admins/me/workspace', { workspace_name: 'Gate Ficha', workspace_slug: SLUG2 });

const fichaH2 = () => page.locator('[data-atlas-ficha] h2').textContent({ timeout: 3000 }).catch(() => null);
const fichaAberta = () => page.locator('[data-atlas-ficha]').count();
await page.goto(`${BASE}/${SLUG2}#${T14}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const abasDaVersao = await page.$$eval('[data-atlas-tab]', (b) => b.map((x) => x.textContent));
if (JSON.stringify(abasDaVersao) === JSON.stringify(['Início', 'Templos', 'Personalidades'])) ok('1.4: abas com nome de tela; a junção não vira aba');
else fail(`1.4: abas = ${JSON.stringify(abasDaVersao)}`);
const bytesHtml = (await (await fetch(`${BASE}/${SLUG2}`)).text()).length;
console.log(`[medida] HTML de /${SLUG2}: ${bytesHtml} bytes`);

const painelT = page.locator(`[data-atlas-panel="${T14}"]`);
await painelT.locator('[data-atlas-body] a.atlas-link').first().click();
if ((await fichaH2()) === 'Templo Zu Lai') ok('1.4: clicar no título abre a ficha');
else fail(`1.4: ficha não abriu pelo clique (h2=${await fichaH2()})`);
const rel = await page.locator('[data-atlas-ficha] .atlas-ficha-rel li').allTextContents();
if (rel.some((t) => t.includes('Monja Coen') && t.includes('Fundadora'))) ok('1.4: relacionados da junção com o detalhe ("Fundadora")');
else fail(`1.4: relacionados = ${JSON.stringify(rel)}`);
const campos = await page.locator('[data-atlas-ficha] dt').allTextContents();
if (campos.includes('Cidade')) ok('1.4: campo "Só na ficha" aparece rotulado na ficha');
else fail(`1.4: campos da ficha = ${JSON.stringify(campos)}`);
await page.screenshot({ path: join(shotDir, 'ficha.png') });

await page.locator('[data-atlas-ficha] a.atlas-link', { hasText: 'Monja Coen' }).click();
if ((await fichaH2()) === 'Monja Coen' && page.url().endsWith(`#${P14}/1`)) ok('1.4: relacionado navega pra ficha do outro');
else fail(`1.4: navegar relacionado (h2=${await fichaH2()}, url=${page.url()})`);

await page.goBack();
await page.waitForTimeout(400);
if ((await fichaH2()) === 'Templo Zu Lai') ok('1.4: Voltar volta pra ficha anterior');
else fail(`1.4: Voltar 1 (h2=${await fichaH2()})`);
await page.goBack();
await page.waitForTimeout(400);
const linhasDepois = await painelT.locator('[data-atlas-body] tr').count();
const visiveisDepois = await visiveis();
if ((await fichaAberta()) === 0 && linhasDepois === 1 && visiveisDepois.length === 1) {
  ok('1.4: Voltar de novo fecha a ficha, e o Next não desfaz a tabela nem as abas');
} else fail(`1.4: Voltar 2 (ficha=${await fichaAberta()}, linhas=${linhasDepois}, painéis=${JSON.stringify(visiveisDepois)})`);

await page.goto(`${BASE}/${SLUG2}#${P14}/1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
if ((await fichaH2()) === 'Monja Coen') ok('1.4: link direto abre a ficha');
else fail(`1.4: link direto (h2=${await fichaH2()})`);
await page.locator('[data-atlas-ficha-fechar]').click();
await page.waitForTimeout(300);
if ((await fichaAberta()) === 0 && page.url().endsWith(`/${SLUG2}#${P14}`)) ok('1.4: × em link direto fecha e fica no site');
else fail(`1.4: × em link direto (ficha=${await fichaAberta()}, url=${page.url()})`);

await page.goto(`${BASE}/${SLUG2}#${T14}/1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
if ((await fichaAberta()) === 0) ok('1.4: Esc fecha');
else fail('1.4: Esc não fechou');

const hidr14 = erros.filter((e) => /#418|#423|#425|hydrat/i.test(e));
if (hidr14.length === 0) ok('1.4: hidratação limpa com a ficha');
else fail(`1.4: hidratação: ${hidr14[0].slice(0, 160)}`);

for (const [id, nome] of [[idJ, J14], [idT, T14], [idP, P14]]) {
  await api(token, 'DELETE', `/tables/${id}?confirm_name=${nome}`).catch(() => {});
}

// ── 1.5 (fatia 1): busca como a do site antigo ────────────────────────────
const B15 = `gt_busca_${TS}`;
const idB15 = await criarCols(B15, [['nome', 'String'], ['publico', 'String'], ['abertura', 'Date']]);
for (const [nome, publico, abertura] of [
  ['Zendo Brasil', 'Conversão', '1975-01-01'], ['Águia Dourada', 'Misto', null],
  ['Busshinji', 'Étnico', '1955-06-10'], ['Kannon', 'misto', '2003-10-05'],
]) await api(token, 'POST', `/api/${B15}`, { nome, publico, abertura });
const v15 = await api(token, 'POST', '/api/publications/me/versions', {
  description: 'gate 1.5', theme_config: THEME,
  table_selection: [{
    table_id: idB15, order: 0, layout: 'tabela', label: 'Busca', sort: 'titulo',
    columns: [{ name: 'publico', label: 'Público-Alvo', filter: 'lista' }, { name: 'abertura', label: 'Abertura', filter: 'data' }],
  }],
  charts: [],
});
if (v15.status !== 200) { fail(`1.5: publicar: ${v15.status} ${JSON.stringify(v15.body).slice(0, 160)}`); process.exit(1); }
await api(token, 'POST', `/api/publications/me/versions/${v15.body.id}/activate`);
const SLUG3 = `${SLUG}b`;
await api(token, 'PATCH', '/api/admins/me/workspace', { workspace_name: 'Gate Busca', workspace_slug: SLUG3 });
ok(`1.5: v${v15.body.version_number} com filtro de lista, de/até e ordem por nome`);

await page.goto(`${BASE}/${SLUG3}#${B15}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const pB = page.locator(`[data-atlas-panel="${B15}"]`);
const nomesB = () => pB.locator('[data-atlas-body] tr td:first-child').allTextContents();
const ordem = await nomesB();
if (JSON.stringify(ordem) === JSON.stringify(['Águia Dourada', 'Busshinji', 'Kannon', 'Zendo Brasil'])) ok('1.5: ordem pelo nome, sem diferenciar acento');
else fail(`1.5: ordem = ${JSON.stringify(ordem)}`);
const opcoes = await pB.locator('[data-atlas-filtro="lista"] option').allTextContents();
if (JSON.stringify(opcoes) === JSON.stringify(['Todos', 'Conversão', 'Étnico', 'Misto'])) ok('1.5: select sem repetir "misto"/"Misto"');
else fail(`1.5: opções = ${JSON.stringify(opcoes)}`);
await pB.locator('[data-atlas-filtro="lista"]').selectOption('Misto');
const comMisto = await nomesB();
if (JSON.stringify(comMisto) === JSON.stringify(['Águia Dourada', 'Kannon'])) ok('1.5: filtro de lista no navegador');
else fail(`1.5: lista Misto = ${JSON.stringify(comMisto)}`);
await pB.locator('[data-atlas-filtro="lista"]').selectOption('');
await pB.locator('[data-atlas-filtro="de"]').fill('1960-01-01');
const desde60 = await nomesB();
if (JSON.stringify(desde60) === JSON.stringify(['Kannon', 'Zendo Brasil'])) ok('1.5: data "a partir de" (sem data sai)');
else fail(`1.5: de 1960 = ${JSON.stringify(desde60)}`);
const datas = await pB.locator('[data-atlas-body] tr td:nth-child(3)').allTextContents();
if (datas.includes('05/10/2003')) ok('1.5: data em dd/mm/aaaa na grade');
else fail(`1.5: datas = ${JSON.stringify(datas)}`);
await pB.locator('[data-atlas-filtro="ate"]').fill('1961-01-01');
const vazio = await pB.locator('[data-atlas-body] td.atlas-vazio').textContent().catch(() => null);
if (vazio === 'Nenhum registro encontrado com esses filtros.') ok('1.5: lista vazia com mensagem');
else fail(`1.5: lista vazia = ${vazio}`);
await pB.locator('[data-atlas-filtro="de"]').fill('');
await pB.locator('[data-atlas-filtro="ate"]').fill('');
const [dl15] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  pB.locator('[data-atlas-export]').click(),
]);
if (dl15 && dl15.suggestedFilename() === 'Busca.xlsx') ok('1.5: Excel com o nome de tela (Busca.xlsx)');
else fail(`1.5: Excel = ${dl15 ? dl15.suggestedFilename() : 'não baixou'}`);
await page.screenshot({ path: join(shotDir, 'busca.png') });
const hidr15 = erros.filter((e) => /#418|#423|#425|hydrat/i.test(e));
if (hidr15.length === 0) ok('1.5: hidratação limpa com a faixa de filtros');
else fail(`1.5: hidratação: ${hidr15[0].slice(0, 160)}`);
await api(token, 'DELETE', `/tables/${idB15}?confirm_name=${B15}`).catch(() => {});

// 8. console limpo no fim de tudo
if (erros.length) fail(`erros de console (${erros.length}): ${erros.slice(0, 2).join(' | ').slice(0, 240)}`);
else ok('console sem erros');

await api(token, 'DELETE', `/tables/${idA}?confirm_name=${TABELA}`).catch(() => {});
await api(token, 'DELETE', `/tables/${idB}?confirm_name=${OUTRA}`).catch(() => {});
await browser.close();

console.log(failed ? '\n=== GATE DO SITE PÚBLICO: FALHOU ===' : '\n=== GATE DO SITE PÚBLICO: VERDE ===');
process.exit(failed ? 1 : 0);
