// @vitest-environment jsdom
/**
 * 1.4 — ficha do registro, sobre o markup DE VERDADE do PublicSite.
 *
 * Os testes de `publicSiteRuntime.test.ts` montam o DOM à mão; aqui o HTML
 * sai do `renderToStaticMarkup(<PublicSite/>)` (o mesmo caminho do RSC e do
 * ZIP) e o runtime roda por cima. Assim o contrato novo (scripts do acervo,
 * ligações, links) não pode divergir do componente sem um teste ver — que foi
 * exatamente a classe do B21.
 *
 * Fixture espelha o acervo do budismopuc: `templo` (aba, com FK pra `escola`),
 * `escola` (só ficha), `personalidade` (aba) e a junção `personalidade_templo`
 * (só ficha, com a coluna extra `funcao`).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicSite, type PublicSiteTableData, type PublicRelation } from '@/components/publish/PublicSite';
import { PRESETS } from '@/contexts/PublishContext';
import { PUBLIC_SITE_RUNTIME } from '../publicSiteRuntime';
import { buildStandaloneHtml, type SnapshotPayload } from '../exportStatic';

const TEMA = PRESETS.editorial.config;

const TEMPLO: PublicSiteTableData = {
  table_id: 1, name: 'templo', layout: 'tabela', role: 'aba', label: 'Templos',
  key_column: 'id', title_column: 'nome', total_rows: 2,
  columns: [
    { name: 'nome', data_type: 'String', label: 'Nome', placement: 'grade' },
    { name: 'escola_id', data_type: 'Integer', label: 'Escola / Tradição', placement: 'grade' },
    { name: 'cidade', data_type: 'String', label: 'Cidade', placement: 'ficha' },
  ],
  rows: [
    { id: 1, nome: 'Templo Zu Lai', escola_id: 7, cidade: 'Cotia' },
    { id: 2, nome: 'Mosteiro Suddhavāri', escola_id: 8, cidade: 'Soledade de Minas' },
  ],
};
const ESCOLA: PublicSiteTableData = {
  table_id: 2, name: 'escola', layout: 'tabela', role: 'ficha', label: 'Escolas',
  key_column: 'id', title_column: 'nome', total_rows: 2,
  columns: [{ name: 'nome', data_type: 'String', label: 'Nome', placement: 'grade' }],
  rows: [{ id: 7, nome: 'Fo Guang Shan' }, { id: 8, nome: 'Theravada da Floresta' }],
};
const PESSOA: PublicSiteTableData = {
  table_id: 3, name: 'personalidade', layout: 'tabela', role: 'aba', label: 'Personalidades',
  key_column: 'id', title_column: 'nome_personalidade', total_rows: 1,
  columns: [{ name: 'nome_personalidade', data_type: 'String', label: 'Nome', placement: 'grade' }],
  rows: [{ id: 1, nome_personalidade: 'Monja Coen' }],
};
const JUNCAO: PublicSiteTableData = {
  table_id: 4, name: 'personalidade_templo', layout: 'tabela', role: 'ficha', label: 'personalidade_templo',
  key_column: 'id', title_column: 'funcao', total_rows: 1,
  columns: [
    { name: 'pt_templo', data_type: 'Integer', label: 'pt_templo', placement: 'grade' },
    { name: 'pt_personalidade', data_type: 'Integer', label: 'pt_personalidade', placement: 'grade' },
    { name: 'funcao', data_type: 'String', label: 'Função', placement: 'grade' },
  ],
  rows: [{ id: 1, pt_templo: 1, pt_personalidade: 1, funcao: 'Fundadora' }],
};
const LIGACOES: PublicRelation[] = [
  { from: 'templo', from_column: 'escola_id', to: 'escola', to_column: 'id' },
  { from: 'personalidade_templo', from_column: 'pt_templo', to: 'templo', to_column: 'id' },
  { from: 'personalidade_templo', from_column: 'pt_personalidade', to: 'personalidade', to_column: 'id' },
];

function montar(tabelas: PublicSiteTableData[] = [TEMPLO, ESCOLA, PESSOA, JUNCAO], hash = '') {
  window.history.replaceState(null, '', window.location.pathname + hash);
  document.body.innerHTML = renderToStaticMarkup(
    <PublicSite themeConfig={TEMA} tables={tabelas} relations={LIGACOES} workspaceName="Templos Budistas" workspaceSlug="budismopuc" />,
  );
}
const rodar = () => new Function(PUBLIC_SITE_RUNTIME)();
const painelFicha = () => document.querySelector('[data-atlas-ficha]') as HTMLElement | null;
const corpoTemplo = () => document.querySelector('[data-atlas-panel="templo"] [data-atlas-body]') as HTMLElement;
const clicar = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
const secoes = () => [...(painelFicha()?.querySelectorAll('.atlas-ficha-rel') ?? [])].map((s) => ({
  titulo: s.querySelector('h3')?.textContent,
  itens: [...s.querySelectorAll('li')].map((li) => li.textContent),
}));

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
});

describe('grade: FK vira nome, igual no SSR e no runtime', () => {
  it('o HTML servido já mostra o nome da escola e o título como link', () => {
    montar();
    const tds = [...corpoTemplo().querySelectorAll('tr')[0].querySelectorAll('td')];
    expect(tds.map((td) => td.textContent)).toEqual(['Templo Zu Lai', 'Fo Guang Shan']);
    expect(tds[0].querySelector('a')?.getAttribute('href')).toBe('#templo/1');
    expect(tds[1].querySelector('a')?.getAttribute('href')).toBe('#escola/7');
  });

  it('o runtime redesenha com o MESMO texto e os mesmos links', () => {
    montar();
    const antes = corpoTemplo().innerHTML.replace(/ style="[^"]*"/g, '').replace(/ class="atlas-td"/g, '');
    rodar();
    const depois = corpoTemplo().innerHTML.replace(/ style="[^"]*"/g, '').replace(/ class="atlas-td"/g, '');
    expect(depois).toBe(antes);
    expect(corpoTemplo().textContent).toContain('Fo Guang Shan');
  });

  it('cabeçalho com nome de tela; coluna "Só na ficha" não vira coluna', () => {
    montar();
    const ths = [...document.querySelectorAll('[data-atlas-panel="templo"] thead tr:first-child th')].map((t) => t.textContent);
    expect(ths).toEqual(['Nome', 'Escola / Tradição']);
  });

  it('só as tabelas "aba" viram aba', () => {
    montar();
    rodar();
    const abas = [...document.querySelectorAll('[data-atlas-tab]')].map((b) => b.textContent);
    expect(abas).toEqual(['Início', 'Templos', 'Personalidades']);
  });

  it('o filtro casa com o que se vê (o nome), não com o id', () => {
    montar();
    rodar();
    const f = document.querySelector('[data-atlas-panel="templo"] [data-atlas-filter="escola_id"]') as HTMLInputElement;
    f.value = 'guang';
    f.dispatchEvent(new Event('input'));
    expect(corpoTemplo().querySelectorAll('tr')).toHaveLength(1);
    expect(corpoTemplo().textContent).toContain('Templo Zu Lai');
  });

  it('o Excel leva nome de tela, FK como nome e a coluna da ficha', () => {
    let matriz: unknown[][] = [];
    (window as unknown as { XLSX: unknown }).XLSX = {
      utils: {
        aoa_to_sheet: (m: unknown[][]) => { matriz = m; return {}; },
        book_new: () => ({}),
        book_append_sheet: () => undefined,
      },
      writeFile: () => undefined,
    };
    montar();
    rodar();
    (document.querySelector('[data-atlas-panel="templo"] [data-atlas-export]') as HTMLElement).click();
    expect(matriz[0]).toEqual(['Nome', 'Escola / Tradição', 'Cidade']);
    expect(matriz[1]).toEqual(['Templo Zu Lai', 'Fo Guang Shan', 'Cotia']);
  });
});

describe('ficha', () => {
  it('clicar no título abre a ficha rotulada, com relacionados da junção', () => {
    montar();
    rodar();
    clicar(corpoTemplo().querySelector('a.atlas-link')!);
    const p = painelFicha();
    expect(p).not.toBeNull();
    expect(p!.querySelector('.atlas-ficha-eyebrow')?.textContent).toBe('Templos');
    expect(p!.querySelector('h2')?.textContent).toBe('Templo Zu Lai');
    const campos = [...p!.querySelectorAll('.atlas-ficha-campo')].map((c) => [c.querySelector('dt')?.textContent, c.querySelector('dd')?.textContent]);
    expect(campos).toEqual([['Cidade', 'Cotia']]); // título não se repete; FK vai pra Relacionados
    expect(secoes()).toEqual([
      { titulo: 'Escola / Tradição', itens: ['Fo Guang Shan'] },
      { titulo: 'Personalidades', itens: ['Monja CoenFundadora'] },
    ]);
    expect(window.location.hash).toBe('#templo/1');
  });

  it('link direto abre a ficha no carregamento (e o outro lado da junção)', () => {
    montar(undefined, '#personalidade/1');
    rodar();
    expect(painelFicha()?.querySelector('h2')?.textContent).toBe('Monja Coen');
    expect(secoes()).toEqual([{ titulo: 'Templos', itens: ['Templo Zu LaiFundadora'] }]);
    // a aba da tabela vai junto
    expect((document.querySelector('[data-atlas-panel="personalidade"]') as HTMLElement).hidden).toBe(false);
  });

  it('tabela "Só nas fichas" também tem ficha, com quem aponta pra ela', () => {
    montar(undefined, '#escola/7');
    rodar();
    expect(painelFicha()?.querySelector('h2')?.textContent).toBe('Fo Guang Shan');
    expect(secoes()).toEqual([{ titulo: 'Templos', itens: ['Templo Zu Lai'] }]);
  });

  it('relacionado navega pra ficha do outro', () => {
    montar(undefined, '#templo/1');
    rodar();
    const link = [...painelFicha()!.querySelectorAll('a.atlas-link')].find((a) => a.textContent === 'Monja Coen')!;
    clicar(link);
    expect(painelFicha()?.querySelector('h2')?.textContent).toBe('Monja Coen');
    expect(window.location.hash).toBe('#personalidade/1');
  });

  it('× fecha a ficha aberta por link direto e deixa só a aba no endereço', () => {
    montar(undefined, '#templo/1');
    rodar();
    (painelFicha()!.querySelector('[data-atlas-ficha-fechar]') as HTMLElement).click();
    expect(painelFicha()).toBeNull();
    expect(window.location.hash).toBe('#templo');
  });

  it('Esc fecha', () => {
    montar(undefined, '#templo/1');
    rodar();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(painelFicha()).toBeNull();
  });

  it('chave inexistente abre só a aba', () => {
    montar(undefined, '#templo/999');
    rodar();
    expect(painelFicha()).toBeNull();
    expect((document.querySelector('[data-atlas-panel="templo"]') as HTMLElement).hidden).toBe(false);
  });
});

describe('ficha: entrada hostil', () => {
  it.each([
    ['#templo/%E0%A4%A'],
    ['#"]<img src=x onerror=alert(1)>/1'],
    ['#__proto__/1'],
    ['#constructor/1'],
  ])('hash %s não lança, não abre nada e não cria elemento', (hash) => {
    montar(undefined, hash);
    expect(() => rodar()).not.toThrow();
    expect(document.documentElement.getAttribute('data-atlas-ready')).toBe('1');
    expect(painelFicha()).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('valor com markup sai como texto na ficha', () => {
    const hostil = { ...TEMPLO, rows: [{ id: 1, nome: '<img src=x onerror=alert(1)>', escola_id: 7, cidade: '<b>x</b>' }] };
    montar([hostil, ESCOLA, PESSOA, JUNCAO], '#templo/1');
    rodar();
    expect(painelFicha()?.querySelector('img')).toBeNull();
    expect(painelFicha()?.querySelector('h2')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(painelFicha()?.querySelector('b')).toBeNull();
  });

  it('chave com barra, espaço e acento vai codificada e volta', () => {
    const t = { ...TEMPLO, key_column: 'nome', rows: [{ id: 1, nome: 'a/b ç', escola_id: 7, cidade: 'x' }] };
    montar([t, ESCOLA]);
    rodar();
    const link = corpoTemplo().querySelector('a.atlas-link')!;
    expect(link.getAttribute('href')).toBe('#templo/a%2Fb%20%C3%A7');
    clicar(link);
    expect(painelFicha()?.querySelector('h2')?.textContent).toBe('a/b ç');
  });
});

describe('ZIP', () => {
  it('o index.html do export abre a ficha offline', async () => {
    const snap: SnapshotPayload = {
      schema_version: 1,
      owner: { workspace_slug: 'budismopuc', workspace_name: 'Templos Budistas' },
      version_number: 4, created_at: '2026-10-20T15:00:00', description: null, theme: TEMA,
      tables: [TEMPLO, ESCOLA, PESSOA, JUNCAO].map((t) => ({ ...t, truncated: false })),
      relations: LIGACOES,
    };
    const html = await buildStandaloneHtml(snap, '');
    expect(html).toContain('data-atlas-relations');
    window.history.replaceState(null, '', window.location.pathname + '#templo/1');
    document.documentElement.innerHTML = html.replace(/^<!doctype html>\s*/i, '');
    rodar();
    expect(painelFicha()?.querySelector('h2')?.textContent).toBe('Templo Zu Lai');
    expect(secoes().map((s) => s.titulo)).toEqual(['Escola / Tradição', 'Personalidades']);
  });
});
