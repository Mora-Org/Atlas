/**
 * M8.5 F2.2b — pivot do preview vivo (recharts) por UNIÃO de categorias.
 *
 * O ponto: ausência de uma categoria num recorte NÃO pode virar barra de zero
 * (é o "número que mente" do projeto). O pivot omite a chave, e o recharts não
 * desenha barra — mesma honestidade do SVG congelado do backend.
 */
import { describe, expect, it } from 'vitest'
import { pivot } from '../LiveChartPreview'

// helper de série
function s(label: string, points: [string, number | null][], truncated = false, rest: number | null = null) {
  return {
    label,
    truncated,
    rest: rest === null ? null : { value: rest },
    points: points.map(([category, value]) => ({ category, value })),
  }
}

describe('pivot do preview vivo', () => {
  it('une categorias das duas séries', () => {
    const { rows, seriesLabels } = pivot({
      operation: 'count',
      rest_label: '(resto)',
      series: [s('A', [['sul', 10], ['norte', 5]]), s('B', [['sul', 3], ['leste', 2]])],
    })
    expect(seriesLabels).toEqual(['A', 'B'])
    expect(rows.map((r) => r.category)).toEqual(['sul', 'norte', 'leste'])
  })

  it('categoria fora do top-N de um recorte fica SEM chave (não vira 0)', () => {
    const { rows } = pivot({
      operation: 'count',
      rest_label: '(resto)',
      series: [s('A', [['sul', 10], ['norte', 5]], true), s('B', [['sul', 3]], true)],
    })
    const norte = rows.find((r) => r.category === 'norte')!
    // A tem norte; B não (e B truncou) → a chave 'B' NÃO existe na linha do norte
    expect(norte.A).toBe(5)
    expect('B' in norte).toBe(false) // sem barra pra B, não B=0
  })

  it('inclui o (resto) quando algum recorte truncou', () => {
    const { rows } = pivot({
      operation: 'count',
      rest_label: '(resto)',
      series: [s('Total', [['sul', 10]], true, 7)],
    })
    const resto = rows.find((r) => r.category === '(resto)')
    expect(resto).toBeDefined()
    expect(resto!.Total).toBe(7)
  })

  it('value=None do core não vira barra', () => {
    const { rows } = pivot({
      operation: 'count_distinct',
      rest_label: '(resto)',
      series: [s('Total', [['sul', 3], ['norte', null]])],
    })
    const norte = rows.find((r) => r.category === 'norte')!
    expect('Total' in norte).toBe(false)
  })

  it('sem truncamento não inventa resto', () => {
    const { rows } = pivot({
      operation: 'count',
      rest_label: '(resto)',
      series: [s('Total', [['sul', 10], ['norte', 5]])],
    })
    expect(rows.find((r) => r.category === '(resto)')).toBeUndefined()
  })
})
