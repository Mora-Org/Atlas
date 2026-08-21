// @vitest-environment jsdom
//
// Opt-in POR ARQUIVO, não na config global: o default `node` do projeto existe
// porque o que importa nos outros testes é `renderToStaticMarkup` (o caminho do
// RSC público e do export). Aqui é o oposto — o runtime roda no browser, no site
// e dentro do ZIP, então testá-lo sem DOM não provaria nada.
/**
 * Runtime do site público (1.3) — abas, filtro, paginação e Excel.
 *
 * O que estes testes guardam, e por que:
 *
 * - **O escapador é a única defesa contra XSS deste caminho.** No JSX o React
 *   escapa tudo por nós; aqui o markup é montado à mão e o dado do tenant vai
 *   pra dentro de um `<script type="application/json">`. Um valor com
 *   `</script>` fecharia o bloco e o resto viraria HTML executável.
 * - **O runtime roda no ZIP, onde não há React nem build.** Se ele tiver erro
 *   de sintaxe, o site offline degrada calado. Por isso o teste o executa.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { PUBLIC_SITE_RUNTIME, jsonParaScript } from '../publicSiteRuntime';

describe('jsonParaScript — escape do dado do tenant', () => {
  it('neutraliza </script> vindo de uma célula', () => {
    const payload = { rows: [{ nome: '</script><img src=x onerror=alert(1)>' }] };
    const saida = jsonParaScript(payload);
    expect(saida).not.toContain('</script');
    expect(saida).not.toContain('<');
    expect(saida).not.toContain('>');
  });

  it('o JSON continua válido e devolve o valor original', () => {
    const payload = { rows: [{ nome: '</script>', obs: 'a & b', tag: '<b>x</b>' }] };
    expect(JSON.parse(jsonParaScript(payload))).toEqual(payload);
  });

  it('escapa U+2028/U+2029, que quebram o parser de JS mas não o de JSON', () => {
    const payload = { s: 'antes depois fim' };
    const saida = jsonParaScript(payload);
    expect(saida).not.toContain(' ');
    expect(saida).not.toContain(' ');
    expect(JSON.parse(saida)).toEqual(payload);
  });

  it('não corrompe acento — o acervo é em português', () => {
    const payload = { s: 'Associação Budista de São Paulo — ¾ dos templos' };
    expect(JSON.parse(jsonParaScript(payload))).toEqual(payload);
  });
});

/** Monta o DOM que o `PublicSite` emite, pra exercitar o runtime de verdade. */
function montarDom(rows: Record<string, unknown>[]) {
  const dados = {
    name: 'templo',
    columns: [{ name: 'nome', data_type: 'String' }, { name: 'estado', data_type: 'String' }],
    rows,
  };
  document.body.innerHTML = `
    <button data-atlas-tab="inicio">Início</button>
    <button data-atlas-tab="templo">templo</button>
    <div data-atlas-panel="inicio">capa</div>
    <div data-atlas-panel="templo">
      <div data-atlas-table="templo">
        <script type="application/json" data-atlas-data>${jsonParaScript(dados)}</script>
        <input data-atlas-filter="nome" />
        <input data-atlas-filter="estado" />
        <span data-atlas-count></span>
        <select data-atlas-pagesize><option value="25">25</option><option value="50">50</option></select>
        <table><tbody data-atlas-body></tbody></table>
        <div data-atlas-pager></div>
        <button data-atlas-export>Excel</button>
      </div>
    </div>`;
}

function rodarRuntime() {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(PUBLIC_SITE_RUNTIME)();
}

const LINHAS = [
  { nome: 'Templo Zu Lai', estado: 'SP' },
  { nome: 'Mosteiro Suddhavāri', estado: 'MG' },
  { nome: 'Templo Kannon', estado: 'SP' },
];

describe('runtime — abas', () => {
  beforeEach(() => {
    window.location.hash = '';
    montarDom(LINHAS);
    rodarRuntime();
  });

  it('executa sem erro de sintaxe e sinaliza que subiu', () => {
    expect(document.documentElement.getAttribute('data-atlas-ready')).toBe('1');
  });

  it('abre na primeira aba e esconde as outras', () => {
    const inicio = document.querySelector('[data-atlas-panel="inicio"]') as HTMLElement;
    const templo = document.querySelector('[data-atlas-panel="templo"]') as HTMLElement;
    expect(inicio.hidden).toBe(false);
    expect(templo.hidden).toBe(true);
  });

  it('clicar na aba troca o painel', () => {
    (document.querySelector('[data-atlas-tab="templo"]') as HTMLElement).click();
    expect((document.querySelector('[data-atlas-panel="templo"]') as HTMLElement).hidden).toBe(false);
    expect((document.querySelector('[data-atlas-panel="inicio"]') as HTMLElement).hidden).toBe(true);
  });
});

describe('runtime — filtro e paginação', () => {
  beforeEach(() => {
    window.location.hash = '';
    montarDom(LINHAS);
    rodarRuntime();
  });

  const corpo = () => document.querySelector('[data-atlas-body]') as HTMLElement;
  const contador = () => (document.querySelector('[data-atlas-count]') as HTMLElement).textContent;

  it('desenha todas as linhas quando não há filtro', () => {
    expect(corpo().querySelectorAll('tr')).toHaveLength(3);
    expect(contador()).toBe('3 registros');
  });

  it('filtra por uma coluna e atualiza a contagem', () => {
    const f = document.querySelector('[data-atlas-filter="estado"]') as HTMLInputElement;
    f.value = 'SP';
    f.dispatchEvent(new Event('input'));
    expect(corpo().querySelectorAll('tr')).toHaveLength(2);
    expect(contador()).toBe('2 de 3 registros');
  });

  it('ignora acento e caixa — "suddhavari" acha "Suddhavāri"', () => {
    const f = document.querySelector('[data-atlas-filter="nome"]') as HTMLInputElement;
    f.value = 'suddhavari';
    f.dispatchEvent(new Event('input'));
    expect(corpo().querySelectorAll('tr')).toHaveLength(1);
  });

  it('colunas combinam com E', () => {
    const nome = document.querySelector('[data-atlas-filter="nome"]') as HTMLInputElement;
    const estado = document.querySelector('[data-atlas-filter="estado"]') as HTMLInputElement;
    nome.value = 'templo';
    nome.dispatchEvent(new Event('input'));
    estado.value = 'MG';
    estado.dispatchEvent(new Event('input'));
    expect(corpo().querySelectorAll('tr')).toHaveLength(0);
  });

  it('a célula entra como texto, nunca como HTML', () => {
    montarDom([{ nome: '<img src=x onerror=alert(1)>', estado: 'SP' }]);
    rodarRuntime();
    expect(corpo().querySelector('img')).toBeNull();
    expect(corpo().textContent).toContain('<img');
  });
});

describe('runtime — paginação com volume', () => {
  const muitas = Array.from({ length: 120 }, (_, i) => ({
    nome: `Templo ${i + 1}`,
    estado: i % 2 === 0 ? 'SP' : 'MG',
  }));

  beforeEach(() => {
    window.location.hash = '';
    montarDom(muitas);
    rodarRuntime();
  });

  it('mostra só a primeira página (25 por padrão) mas conta o total', () => {
    expect((document.querySelector('[data-atlas-body]') as HTMLElement).querySelectorAll('tr')).toHaveLength(25);
    expect((document.querySelector('[data-atlas-count]') as HTMLElement).textContent).toBe('120 registros');
  });

  it('o pager aparece e navegar troca as linhas', () => {
    const pager = document.querySelector('[data-atlas-pager]') as HTMLElement;
    expect(pager.querySelectorAll('button').length).toBeGreaterThan(1);
    const primeira = (document.querySelector('[data-atlas-body]') as HTMLElement).textContent;
    const btn2 = [...pager.querySelectorAll('button')].find(b => b.textContent === '2') as HTMLButtonElement;
    btn2.click();
    expect((document.querySelector('[data-atlas-body]') as HTMLElement).textContent).not.toBe(primeira);
  });

  it('trocar pra 50 por página redesenha', () => {
    const sel = document.querySelector('[data-atlas-pagesize]') as HTMLSelectElement;
    sel.value = '50';
    sel.dispatchEvent(new Event('change'));
    expect((document.querySelector('[data-atlas-body]') as HTMLElement).querySelectorAll('tr')).toHaveLength(50);
  });
});

describe('runtime — export', () => {
  it('o xlsx leva TODAS as linhas do filtro, não só a página visível', () => {
    const muitas = Array.from({ length: 120 }, (_, i) => ({
      nome: `Templo ${i + 1}`,
      estado: i % 2 === 0 ? 'SP' : 'MG',
    }));
    montarDom(muitas);

    let matrizRecebida: unknown[][] = [];
    // Dublê do SheetJS: interessa QUANTAS linhas chegam ao writer.
    (window as unknown as { XLSX: unknown }).XLSX = {
      utils: {
        aoa_to_sheet: (m: unknown[][]) => { matrizRecebida = m; return {}; },
        book_new: () => ({}),
        book_append_sheet: () => undefined,
      },
      writeFile: () => undefined,
    };
    rodarRuntime();

    const f = document.querySelector('[data-atlas-filter="estado"]') as HTMLInputElement;
    f.value = 'SP';
    f.dispatchEvent(new Event('input'));
    // a tela mostra 25; o filtro casa 60
    expect((document.querySelector('[data-atlas-body]') as HTMLElement).querySelectorAll('tr')).toHaveLength(25);

    (document.querySelector('[data-atlas-export]') as HTMLElement).click();
    expect(matrizRecebida).toHaveLength(61); // 60 linhas + cabeçalho
    expect(matrizRecebida[0]).toEqual(['nome', 'estado']);
  });
});
