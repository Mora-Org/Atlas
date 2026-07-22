/**
 * M8.5 F3.2a — a versão acadêmica cita honesto e estampa o truncamento.
 * renderToStaticMarkup (o caminho da página impressa, sem browser).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AcademicPrint } from '../AcademicPrint';
import { citeTable, formatPublishedDate, type SnapshotPayload } from '@/lib/snapshot';
import { PRESETS } from '@/contexts/PublishContext';

function snap(over: Partial<SnapshotPayload> = {}): SnapshotPayload {
  return {
    schema_version: 1,
    owner: { workspace_slug: 'acervo', workspace_name: 'Centro de Memória' },
    version_number: 3,
    created_at: '2026-05-18T12:00:00',
    description: null,
    theme: PRESETS.editorial.config,
    tables: [
      {
        name: 'clientes', layout: 'list', source: 'Censo IBGE 2022',
        columns: [{ name: 'nome', data_type: 'String' }, { name: 'uf', data_type: 'String' }],
        rows: [{ nome: 'Ana', uf: 'BA' }, { nome: 'Bia', uf: 'SP' }],
        truncated: true, total_rows: 5000,
      },
    ],
    charts: [],
    ...over,
  };
}

const render = (s: SnapshotPayload) => renderToStaticMarkup(<AcademicPrint snap={s} />);

describe('AcademicPrint', () => {
  it('cita a fonte informada (source) da tabela', () => {
    const html = render(snap());
    expect(html).toContain('Censo IBGE 2022');
    expect(html).toContain('Centro de Memória');
    expect(html).toContain('Versão 3');
  });

  it('NÃO fabrica fonte quando source é null (só metadado)', () => {
    const s = snap();
    s.tables[0].source = null;
    const html = render(s);
    // a citação existe, mas sem "Fonte:"
    expect(html).toContain('[conjunto de dados]');
    expect(html).not.toContain('Fonte:');
  });

  it('estampa a honestidade M6 F5: N de M quando truncado', () => {
    const html = render(snap());
    expect(html).toContain('de 5.000 registros');
    expect(html).toContain('amostra da versão publicada');
  });

  it('tabela não-truncada mostra só o total, sem "de M"', () => {
    const s = snap();
    s.tables[0].truncated = false;
    s.tables[0].total_rows = 2;
    const html = render(s);
    expect(html).toContain('2 registros.');
    expect(html).not.toContain('Mostrando');
  });

  it('mostra os NÚMEROS do gráfico (alt-table), não a figura colorida', () => {
    const s = snap({ charts: [{
      view_id: 1, title: 'Por UF', chart_type: 'bar',
      svg: '<svg><rect fill="#0072B2"/></svg>',
      alt_table: { header: ['Categoria', 'Total'], rows: [['BA', '1'], ['SP', '1']] },
    }] });
    const html = render(s);
    expect(html).toContain('Por UF');
    expect(html).toContain('Categoria');
    // o acadêmico usa os numeros, nao injeta o SVG colorido
    expect(html).not.toContain('<rect fill="#0072B2"');
  });

  it('tem uma seção de Fontes com uma citação por tabela', () => {
    const html = render(snap());
    expect(html).toContain('Fontes');
    expect(html).toContain('Publicado via Atlas');
  });

  it('esconde o botão de imprimir na impressão (.no-print + @media print)', () => {
    const html = render(snap());
    expect(html).toContain('no-print');
    expect(html).toContain('@media print');
  });
});

describe('citeTable / formatPublishedDate (puros)', () => {
  it('formata a data em pt-BR (UTC)', () => {
    expect(formatPublishedDate('2026-05-18T12:00:00')).toContain('2026');
    expect(formatPublishedDate('2026-05-18T12:00:00')).toContain('maio');
  });
  it('citação com source inclui Fonte; sem source, não', () => {
    const s = snap();
    expect(citeTable(s, s.tables[0])).toContain('Fonte: Censo IBGE 2022');
    s.tables[0].source = null;
    expect(citeTable(s, s.tables[0])).not.toContain('Fonte:');
  });
});
