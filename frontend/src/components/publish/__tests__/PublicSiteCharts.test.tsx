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

/** Fiel ao que o `chart_svg.py` emite: o TÍTULO é desenhado dentro do SVG (em
 *  `<text>`) e repetido no `aria-label`. A fixture antiga não tinha título, o
 *  que escondia a duplicação do B2 — o `<h2>` do componente era a única fonte
 *  do título no teste. */
function chartWith(title: string, view_id = 7): PublicSiteChartData {
  return {
    view_id,
    title,
    chart_type: 'bar',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" role="img" aria-label="${title}">`
      + `<rect width="10" height="10" fill="#0072B2"/><text>${title}</text><text>sul</text></svg>`,
    alt_table: {
      header: ['Categoria', 'Total'],
      rows: [['sul', '10'], ['norte', '8'], ['(resto)', 'fora do top-N']],
    },
    warnings: ['categorias cortadas no top-N; ver grupo (resto) e a tabela'],
  }
}

const CHART: PublicSiteChartData = chartWith('Vendas por região')

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
    const html = render([chartWith('PRIMEIRO', 1), chartWith('SEGUNDO', 2)])
    expect(html.indexOf('PRIMEIRO')).toBeLessThan(html.indexOf('SEGUNDO'))
  })

  // B2 — o título saía 2× (o <h2> da seção + o título desenhado dentro do SVG),
  // no site e no ZIP. Fonte única: o SVG, que precisa dele pra ser figura
  // autossuficiente. Contar ocorrências é o único jeito de travar isso: um
  // `toContain` passa com 1 ou com 5.
  it('não repete o título: quem o carrega é o SVG', () => {
    const html = render([chartWith('Vendas por região')])
    const ocorrencias = html.split('Vendas por região').length - 1
    // 3 = <text> do desenho + aria-label do SVG (os dois vêm do gerador) +
    // <caption> da tabela-alternativa, que nomeia a tabela pro leitor de tela
    // dentro de um <details> fechado. Nenhuma delas é título visível repetido.
    expect(ocorrencias).toBe(3)
    // o que não pode voltar: um heading com o mesmo texto logo acima da figura
    expect(html).not.toContain('<h2')
  })
})
