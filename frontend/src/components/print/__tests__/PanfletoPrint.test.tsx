/**
 * M8.5 F3.2b — o panfleto é o VISUAL: injeta o SVG colorido (contraponto do
 * acadêmico, que mostra número), usa a cor do tema, e mantém os totais honestos.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PanfletoPrint } from '../PanfletoPrint';
import { type SnapshotPayload } from '@/lib/snapshot';
import { PRESETS } from '@/contexts/PublishContext';

function snap(over: Partial<SnapshotPayload> = {}): SnapshotPayload {
  return {
    schema_version: 1,
    owner: { workspace_slug: 'memoria', workspace_name: 'Centro de Memória do Recôncavo' },
    version_number: 4,
    created_at: '2026-05-18T12:00:00',
    description: 'Levantamento das vilas litorâneas.',
    theme: PRESETS.editorial.config,
    tables: [
      {
        name: 'acervo', layout: 'list', source: 'Arquivo Público da Bahia',
        columns: [{ name: 'titulo', data_type: 'String' }, { name: 'autor', data_type: 'String' }],
        rows: [{ titulo: 'Cadernos de Viagem', autor: 'Aurélio Telles' }, { titulo: 'Cartografia', autor: 'Anônimo' }],
        truncated: true, total_rows: 1284,
      },
      {
        name: 'vilas', layout: 'list', source: null,
        columns: [{ name: 'nome', data_type: 'String' }],
        rows: [{ nome: 'Cachoeira' }, { nome: 'Maragogipe' }],
        truncated: false, total_rows: 2,
      },
    ],
    charts: [{
      view_id: 1, title: 'Documentos por século', chart_type: 'bar',
      // o título vem DENTRO do SVG (chart_svg.py desenha), como em produção —
      // o panfleto nao adiciona figcaption pra nao dobrar.
      svg: '<svg width="400"><text>Documentos por século</text><rect fill="#0072B2" width="10" height="10"/></svg>',
      alt_table: { header: ['Século', 'Total'], rows: [['XVIII', '412']] },
      warnings: ['categorias cortadas no top-N'],
    }],
    ...over,
  };
}

const render = (s: SnapshotPayload) => renderToStaticMarkup(<PanfletoPrint snap={s} />);

describe('PanfletoPrint', () => {
  it('mostra o nome do workspace e a versão', () => {
    const html = render(snap());
    expect(html).toContain('Centro de Memória do Recôncavo');
    expect(html).toContain('Versão 4');
  });

  it('estampa o TOTAL REAL somado (honesto mesmo com amostra truncada)', () => {
    const html = render(snap());
    // 1284 + 2 = 1286, formatado pt-BR
    expect(html).toContain('1.286');
    expect(html).toContain('registros');
  });

  it('INJETA o SVG colorido (distinção do acadêmico, que mostra número)', () => {
    const html = render(snap());
    expect(html).toContain('<rect fill="#0072B2"');
    expect(html).toContain('Documentos por século');
  });

  it('usa a cor do tema (accent do preset editorial) — lição BUG-CHART01', () => {
    const html = render(snap());
    // accent editorial = #C2441C: aparece na faixa de stats e no filete
    expect(html).toContain('#C2441C');
  });

  it('carrega os avisos do gráfico (top-N)', () => {
    const html = render(snap());
    expect(html).toContain('categorias cortadas no top-N');
  });

  it('Destaques é rotulado como SELEÇÃO, não como o conjunto todo', () => {
    const html = render(snap());
    expect(html).toContain('Destaques');
    expect(html).toContain('Seleção de 2 de 1.284');
  });

  it('gráfico sem svg (falhou no publish) não aparece', () => {
    const s = snap({ charts: [{ view_id: 9, title: 'Quebrado', chart_type: 'bar', error: 'boom' }] });
    const html = render(s);
    expect(html).not.toContain('Quebrado');
  });

  it('sem description, o lead cai pro hero_sub do tema', () => {
    const s = snap({ description: null });
    const html = render(s);
    expect(html).toContain(PRESETS.editorial.config.copy.hero_sub);
  });

  it('esconde o botão na impressão e força cor no PDF', () => {
    const html = render(snap());
    expect(html).toContain('no-print');
    expect(html).toContain('@media print');
    expect(html).toContain('print-color-adjust: exact');
  });
});
