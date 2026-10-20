// @vitest-environment jsdom
/**
 * 1.5 (fatia 1) — busca como a do site antigo, sobre o markup DE VERDADE do
 * PublicSite (mesmo arnês do fichaRuntime.test.tsx).
 *
 * O site antigo filtra Público-Alvo por lista, abertura por "a partir de"/"até"
 * e estado (que nem aparece na grade); mostra data em dd/mm/aaaa. Aqui: filtro
 * por coluna (`texto | lista | data | nenhum`), faixa de filtros acima da grade,
 * data fatiada do ISO (igual no SSR e no runtime), lista vazia com mensagem.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicSite, type PublicSiteTableData, type PublicRelation } from '@/components/publish/PublicSite';
import { PRESETS } from '@/contexts/PublishContext';
import { PUBLIC_SITE_RUNTIME } from '../publicSiteRuntime';
import { buildStandaloneHtml, type SnapshotPayload } from '../exportStatic';

const TEMA = PRESETS.academico.config;

const TEMPLO: PublicSiteTableData = {
  table_id: 1, name: 'templo', layout: 'tabela', role: 'aba', label: 'Templos',
  key_column: 'id', title_column: 'nome', total_rows: 5,
  columns: [
    { name: 'nome', data_type: 'Text', label: 'Nome', placement: 'grade', filter: 'texto' },
    { name: 'publico_alvo', data_type: 'Text', label: 'Público-Alvo', placement: 'grade', filter: 'lista' },
    { name: 'escola_id', data_type: 'Integer', label: 'Escola', placement: 'grade', filter: 'lista' },
    { name: 'abertura', data_type: 'Date', label: 'Abertura', placement: 'grade', filter: 'data' },
    { name: 'estado', data_type: 'Text', label: 'Estado', placement: 'ficha', filter: 'texto' },
    { name: 'checagem', data_type: 'DateTime', label: 'Checagem', placement: 'ficha', filter: 'nenhum' },
  ],
  rows: [
    { id: 1, nome: 'Templo Zu Lai', publico_alvo: 'Conversão', escola_id: 7, abertura: '2003-10-05', estado: 'SP', checagem: '2025-09-13T01:24:18+00:00' },
    { id: 2, nome: 'Mosteiro Suddhavāri', publico_alvo: 'Misto', escola_id: 8, abertura: '1995-01-01', estado: 'MG', checagem: null },
    { id: 3, nome: 'Busshinji', publico_alvo: 'Étnico', escola_id: 7, abertura: null, estado: 'SP', checagem: null },
    { id: 4, nome: 'Templo Kannon', publico_alvo: 'misto', escola_id: 8, abertura: '1959-06-10', estado: 'PR', checagem: null },
    { id: 5, nome: 'Casa Dharma', publico_alvo: '', escola_id: null, abertura: '1975-01-01', estado: 'RS', checagem: null },
  ],
};
const ESCOLA: PublicSiteTableData = {
  table_id: 2, name: 'escola', layout: 'tabela', role: 'ficha', label: 'Escolas',
  key_column: 'id', title_column: 'nome', total_rows: 2,
  columns: [{ name: 'nome', data_type: 'Text', label: 'Nome', placement: 'grade' }],
  rows: [{ id: 7, nome: 'Fo Guang Shan' }, { id: 8, nome: 'Theravada' }],
};
const LIGACOES: PublicRelation[] = [{ from: 'templo', from_column: 'escola_id', to: 'escola', to_column: 'id' }];

function montar(tabelas: PublicSiteTableData[] = [TEMPLO, ESCOLA], hash = '') {
  window.history.replaceState(null, '', window.location.pathname + hash);
  document.body.innerHTML = renderToStaticMarkup(
    <PublicSite themeConfig={TEMA} tables={tabelas} relations={LIGACOES} workspaceName="Budismo" workspaceSlug="budismopuc" />,
  );
}
const rodar = () => new Function(PUBLIC_SITE_RUNTIME)();
const painel = () => document.querySelector('[data-atlas-panel="templo"]') as HTMLElement;
const corpo = () => painel().querySelector('[data-atlas-body]') as HTMLElement;
const nomes = () => [...corpo().querySelectorAll('tr')].map((tr) => tr.querySelector('td')?.textContent);
const controle = (col: string, modo?: string) =>
  painel().querySelector(`[data-atlas-filter="${col}"]${modo ? `[data-atlas-filtro="${modo}"]` : ':not([data-atlas-filtro])'}`) as HTMLInputElement;
function mudar(el: HTMLInputElement | HTMLSelectElement, valor: string) {
  el.value = valor;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
});

describe('faixa de filtros (SSR)', () => {
  it('lista mostra o que se vê, sem repetir acento/caixa, em ordem', () => {
    montar();
    const opcoes = [...controle('publico_alvo', 'lista').querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoes).toEqual(['Todos', 'Conversão', 'Étnico', 'Misto']); // "misto" vira um só; vazio não entra
  });

  it('lista de FK mostra o nome do registro apontado, não o id', () => {
    montar();
    const opcoes = [...controle('escola_id', 'lista').querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoes).toEqual(['Todos', 'Fo Guang Shan', 'Theravada']);
  });

  it('cabeçalho só tem caixa de texto; lista, data e coluna da ficha vão pra faixa', () => {
    montar();
    const doCabecalho = [...painel().querySelectorAll('thead [data-atlas-filter]')].map((e) => e.getAttribute('data-atlas-filter'));
    expect(doCabecalho).toEqual(['nome']);
    const daFaixa = [...painel().querySelectorAll('[data-atlas-faixa] [data-atlas-filter]')]
      .map((e) => `${e.getAttribute('data-atlas-filter')}:${e.getAttribute('data-atlas-filtro') ?? 'texto'}`);
    expect(daFaixa).toEqual(['publico_alvo:lista', 'escola_id:lista', 'abertura:de', 'abertura:ate', 'estado:texto']);
  });

  it('snapshot sem filtro (anterior à 1.5) não ganha faixa', () => {
    const antigo = { ...TEMPLO, columns: TEMPLO.columns.map((c) => ({ ...c, filter: undefined })) };
    montar([antigo, ESCOLA]);
    expect(painel().querySelector('[data-atlas-faixa]')).toBeNull();
  });
});

describe('filtros no runtime', () => {
  it('lista casa por igualdade sem acento nem caixa ("Misto" acha "misto")', () => {
    montar();
    rodar();
    mudar(controle('publico_alvo', 'lista'), 'Misto');
    expect(nomes()).toEqual(['Mosteiro Suddhavāri', 'Templo Kannon']);
  });

  it('lista de FK filtra pelo nome', () => {
    montar();
    rodar();
    mudar(controle('escola_id', 'lista'), 'Fo Guang Shan');
    expect(nomes()).toEqual(['Templo Zu Lai', 'Busshinji']);
  });

  it('data "de" compara o ISO e tira quem não tem data', () => {
    montar();
    rodar();
    mudar(controle('abertura', 'de'), '1960-01-01');
    expect(nomes()).toEqual(['Templo Zu Lai', 'Mosteiro Suddhavāri', 'Casa Dharma']);
  });

  it('de + até fecham o intervalo', () => {
    montar();
    rodar();
    mudar(controle('abertura', 'de'), '1950-01-01');
    mudar(controle('abertura', 'ate'), '1980-12-31');
    expect(nomes()).toEqual(['Templo Kannon', 'Casa Dharma']);
  });

  it('filtro de coluna "Só na ficha" filtra a grade', () => {
    montar();
    rodar();
    const estado = painel().querySelector('[data-atlas-faixa] [data-atlas-filter="estado"]') as HTMLInputElement;
    estado.value = 'sp';
    estado.dispatchEvent(new Event('input', { bubbles: true }));
    expect(nomes()).toEqual(['Templo Zu Lai', 'Busshinji']);
  });

  it('nada casa: mensagem no lugar da tabela vazia', () => {
    montar();
    rodar();
    mudar(controle('publico_alvo', 'lista'), 'Étnico');
    mudar(controle('abertura', 'de'), '2000-01-01');
    expect(corpo().querySelectorAll('td.atlas-vazio')).toHaveLength(1);
    expect(corpo().textContent).toBe('Nenhum registro encontrado com esses filtros.');
  });

  it('"Todos" volta tudo', () => {
    montar();
    rodar();
    mudar(controle('publico_alvo', 'lista'), 'Misto');
    mudar(controle('publico_alvo', 'lista'), '');
    expect(nomes()).toHaveLength(5);
  });
});

describe('datas em dd/mm/aaaa', () => {
  it('grade: SSR e runtime mostram o mesmo texto', () => {
    montar();
    const linha1 = () => [...corpo().querySelectorAll('tr')[0].querySelectorAll('td')].map((td) => td.textContent);
    const antes = linha1();
    expect(antes).toEqual(['Templo Zu Lai', 'Conversão', 'Fo Guang Shan', '05/10/2003']);
    rodar();
    expect(linha1()).toEqual(antes);
  });

  it('ficha: DateTime mostra só a data', () => {
    montar(undefined, '#templo/1');
    rodar();
    const campos = Object.fromEntries([...document.querySelectorAll('[data-atlas-ficha] .atlas-ficha-campo')]
      .map((c) => [c.querySelector('dt')?.textContent, c.querySelector('dd')?.textContent]));
    expect(campos['Abertura']).toBe('05/10/2003');
    expect(campos['Checagem']).toBe('13/09/2025');
  });

  it('Excel leva a data em ISO e o nome de tela no arquivo', () => {
    let matriz: unknown[][] = [];
    let arquivo = '';
    (window as unknown as { XLSX: unknown }).XLSX = {
      utils: {
        aoa_to_sheet: (m: unknown[][]) => { matriz = m; return {}; },
        book_new: () => ({}),
        book_append_sheet: () => undefined,
      },
      writeFile: (_wb: unknown, nome: string) => { arquivo = nome; },
    };
    montar();
    rodar();
    (painel().querySelector('[data-atlas-export]') as HTMLElement).click();
    expect(arquivo).toBe('Templos.xlsx');
    expect(matriz[0]).toEqual(['Nome', 'Público-Alvo', 'Escola', 'Abertura', 'Estado', 'Checagem']);
    expect(matriz[1]).toEqual(['Templo Zu Lai', 'Conversão', 'Fo Guang Shan', '2003-10-05', 'SP', '2025-09-13']);
  });
});

describe('ZIP', () => {
  it('a faixa vai no index.html e filtra offline', async () => {
    const snap: SnapshotPayload = {
      schema_version: 1,
      owner: { workspace_slug: 'budismopuc', workspace_name: 'Budismo' },
      version_number: 5, created_at: '2026-10-20T20:00:00', description: null, theme: TEMA,
      tables: [TEMPLO, ESCOLA].map((t) => ({ ...t, truncated: false })),
      relations: LIGACOES,
    };
    const html = await buildStandaloneHtml(snap, '');
    expect(html).toContain('data-atlas-faixa');
    document.documentElement.innerHTML = html.replace(/^<!doctype html>\s*/i, '');
    rodar();
    mudar(controle('publico_alvo', 'lista'), 'Étnico');
    expect(nomes()).toEqual(['Busshinji']);
  });
});

describe('correções da revisão da fatia 1', () => {
  it('P1: "change" sem valor novo (blur da caixa de texto) não redesenha a tabela', () => {
    montar();
    rodar();
    const caixa = painel().querySelector('thead [data-atlas-filter="nome"]') as HTMLInputElement;
    caixa.value = 'templo';
    caixa.dispatchEvent(new Event('input', { bubbles: true }));
    const antes = corpo().querySelector('tr');
    // o blur que antecede o próximo clique dispara 'change' com o MESMO valor:
    // redesenhar ali tirava do DOM o botão/link que ia receber o clique
    caixa.dispatchEvent(new Event('change', { bubbles: true }));
    expect(corpo().querySelector('tr')).toBe(antes);
  });

  it('P2: tabela vazia mostra a mesma mensagem no SSR e no runtime; cortada pelo teto diz que foi cortada', () => {
    const vazia = { ...TEMPLO, rows: [], total_rows: 0 };
    montar([vazia, ESCOLA]);
    const ssr = corpo().innerHTML.replace(/ colspan="\d+"/i, '');
    rodar();
    expect(corpo().innerHTML.replace(/ colspan="\d+"/i, '')).toBe(ssr);
    expect(corpo().textContent).toBe('Nenhum registro.');
    montar([{ ...vazia, total_rows: 500, budget_exceeded: true }, ESCOLA]);
    rodar();
    expect(corpo().textContent).toBe('Registros fora desta versão publicada pelo teto de tamanho.');
  });

  it('P3: FK cujo título é data aparece em dd/mm/aaaa (grade, select e SSR = runtime)', () => {
    const EVENTO: PublicSiteTableData = {
      table_id: 3, name: 'evento', layout: 'tabela', role: 'ficha', label: 'Eventos',
      key_column: 'id', title_column: 'dia', total_rows: 1,
      columns: [{ name: 'dia', data_type: 'Date', label: 'Dia', placement: 'grade' }],
      rows: [{ id: 9, dia: '1975-03-15' }],
    };
    const comEvento = { ...TEMPLO, columns: [...TEMPLO.columns, { name: 'evento_id', data_type: 'Integer', label: 'Evento', placement: 'grade' as const, filter: 'lista' as const }],
      rows: TEMPLO.rows.map((r) => ({ ...r, evento_id: 9 })) };
    window.history.replaceState(null, '', window.location.pathname);
    document.body.innerHTML = renderToStaticMarkup(
      <PublicSite themeConfig={TEMA} tables={[comEvento, ESCOLA, EVENTO]}
        relations={[...LIGACOES, { from: 'templo', from_column: 'evento_id', to: 'evento', to_column: 'id' }]}
        workspaceName="B" workspaceSlug="b" />,
    );
    const ultimaCelula = () => corpo().querySelector('tr')!.lastElementChild!.textContent;
    expect(ultimaCelula()).toBe('15/03/1975');
    const opcoes = [...controle('evento_id', 'lista').querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoes).toEqual(['Todos', '15/03/1975']);
    rodar();
    expect(ultimaCelula()).toBe('15/03/1975');
  });

  it('P5: no Excel, coluna FK do tipo data sai com o nome do alvo, não com a data crua', () => {
    const CAL: PublicSiteTableData = {
      table_id: 4, name: 'calendario', layout: 'tabela', role: 'ficha', label: 'Calendário',
      key_column: 'dia', title_column: 'nome_evento', total_rows: 1,
      columns: [{ name: 'nome_evento', data_type: 'Text', label: 'Evento', placement: 'grade' }],
      rows: [{ dia: '2025-05-12', nome_evento: 'Vesak' }],
    };
    const comDia = { ...TEMPLO, columns: [...TEMPLO.columns, { name: 'dia_ref', data_type: 'Date', label: 'Dia', placement: 'grade' as const }],
      rows: TEMPLO.rows.map((r) => ({ ...r, dia_ref: '2025-05-12' })) };
    let matriz: unknown[][] = [];
    (window as unknown as { XLSX: unknown }).XLSX = {
      utils: { aoa_to_sheet: (m: unknown[][]) => { matriz = m; return {}; }, book_new: () => ({}), book_append_sheet: () => undefined },
      writeFile: () => undefined,
    };
    window.history.replaceState(null, '', window.location.pathname);
    document.body.innerHTML = renderToStaticMarkup(
      <PublicSite themeConfig={TEMA} tables={[comDia, ESCOLA, CAL]}
        relations={[...LIGACOES, { from: 'templo', from_column: 'dia_ref', to: 'calendario', to_column: 'dia' }]}
        workspaceName="B" workspaceSlug="b" />,
    );
    rodar();
    (painel().querySelector('[data-atlas-export]') as HTMLElement).click();
    expect(matriz[1][matriz[0].indexOf('Dia')]).toBe('Vesak');
    expect(matriz[1][matriz[0].indexOf('Abertura')]).toBe('2003-10-05'); // data comum segue ISO
  });

  it('P4: coluna de data da junção aparece em dd/mm/aaaa no detalhe da ficha', () => {
    const JUNC: PublicSiteTableData = {
      table_id: 5, name: 'templo_escola', layout: 'tabela', role: 'ficha', label: 'templo_escola',
      key_column: 'id', title_column: null, total_rows: 1,
      columns: [
        { name: 'te_templo', data_type: 'Integer', label: 'te_templo', placement: 'grade' },
        { name: 'te_escola', data_type: 'Integer', label: 'te_escola', placement: 'grade' },
        { name: 'desde', data_type: 'Date', label: 'Desde', placement: 'grade' },
      ],
      rows: [{ id: 1, te_templo: 1, te_escola: 8, desde: '1990-07-01' }],
    };
    window.history.replaceState(null, '', window.location.pathname + '#templo/1');
    document.body.innerHTML = renderToStaticMarkup(
      <PublicSite themeConfig={TEMA} tables={[TEMPLO, ESCOLA, JUNC]}
        relations={[...LIGACOES,
          { from: 'templo_escola', from_column: 'te_templo', to: 'templo', to_column: 'id' },
          { from: 'templo_escola', from_column: 'te_escola', to: 'escola', to_column: 'id' }]}
        workspaceName="B" workspaceSlug="b" />,
    );
    rodar();
    const itens = [...document.querySelectorAll('[data-atlas-ficha] .atlas-ficha-rel li')].map((li) => li.textContent);
    expect(itens).toContain('Theravada01/07/1990');
  });

  it('subtítulo curado aparece; cortado pelo teto, a seção avisa', () => {
    montar([{ ...TEMPLO, subtitle: 'Pesquise ou filtre os templos.', truncated: true, total_rows: 12000 }, ESCOLA]);
    expect(painel().textContent).toContain('Pesquise ou filtre os templos.');
    expect(painel().textContent).toContain('Mostrando os primeiros 5 de 12.000 registros');
  });
});

