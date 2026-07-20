/**
 * M8.5 F2.2 — gráfico congelado no render público.
 *
 * O teste que importa é `renderToStaticMarkup`: é exatamente onde o recharts
 * FALHA (não renderiza fora do browser — produz <div> vazia), e é o caminho do
 * RSC público e do export estático script-free. Se o gráfico aparece aqui, ele
 * aparece nos 3 contextos.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicSite, type PublicSiteChartData } from '../PublicSite'
import { PRESETS } from '@/contexts/PublishContext'

// Preset REAL do produto em vez de mock inventado — um mock incompleto testa
// o mock, não o componente.
const THEME = PRESETS.editorial.config

const CHART: PublicSiteChartData = {
  view_id: 7,
  title: 'Vendas por região',
  chart_type: 'bar',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420"><rect width="10" height="10" fill="#0072B2"/><text>sul</text></svg>',
  alt_table: {
    header: ['Categoria', 'Total'],
    rows: [['sul', '10'], ['norte', '8'], ['(resto)', 'fora do top-N']],
  },
  warnings: ['categorias cortadas no top-N; ver grupo (resto) e a tabela'],
}

function render(charts: PublicSiteChartData[]) {
  return renderToStaticMarkup(
    <PublicSite themeConfig={THEME} tables={[]} charts={charts} workspaceName="W" workspaceSlug="w" />,
  )
}

describe('gráfico congelado no PublicSite', () => {
  it('injeta o SVG no markup estático (onde recharts sairia vazio)', () => {
    const html = render([CHART])
    expect(html).toContain('<svg')
    expect(html).toContain('fill="#0072B2"')
    expect(html).toContain('Vendas por região')
  })

  it('não exige JS: o SVG e a tabela vêm no HTML servido', () => {
    const html = render([CHART])
    // export é script-free por contrato — nenhum <script> pode entrar por aqui
    expect(html).not.toContain('<script')
    expect(html).toContain('<details')
    expect(html).toContain('<table')
  })

  it('leva a tabela-alternativa com os números (a11y + daltônico + no-JS)', () => {
    const html = render([CHART])
    expect(html).toContain('Ver os dados deste gráfico')
    expect(html).toContain('sul')
    expect(html).toContain('scope="col"')
    // o "fora do top-N" tem que chegar ao leitor: é a diferença entre
    // "não sabemos" e "zero" — o ponto da reconciliação A×B
    expect(html).toContain('fora do top-N')
  })

  it('mostra o aviso de truncamento como legenda', () => {
    const html = render([CHART])
    expect(html).toContain('categorias cortadas no top-N')
  })

  it('gráfico com erro NÃO aparece no público (nada de figura quebrada)', () => {
    const html = render([{ view_id: 9, title: 'quebrado', chart_type: 'bar', error: 'render_failed' }])
    expect(html).not.toContain('quebrado')
  })

  it('snapshot antigo sem charts continua renderizando', () => {
    const html = renderToStaticMarkup(
      <PublicSite themeConfig={THEME} tables={[]} workspaceName="W" workspaceSlug="w" />,
    )
    expect(html).toContain('W')
  })

  it('respeita a ordem que o backend mandou', () => {
    const html = render([
      { ...CHART, view_id: 1, title: 'PRIMEIRO' },
      { ...CHART, view_id: 2, title: 'SEGUNDO' },
    ])
    expect(html.indexOf('PRIMEIRO')).toBeLessThan(html.indexOf('SEGUNDO'))
  })
})
