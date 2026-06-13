/**
 * M7 PR2 — unit tests do schemaGraph + layout sobre a fixture suja do
 * spike e os casos degenerados da seção 7 do plano.
 */
import { describe, expect, it } from 'vitest'
import { buildSchemaGraph, type SchemaTable, type SchemaRelation } from '../schemaGraph'
import { layoutSchema, NODE_METRICS, NODE_W } from '@/components/schema/layout'
import { generateFixture } from '../spikeFixtures'

const t = (name: string, cols: Array<Partial<SchemaTable['columns'][0]> & { name: string }> = []): SchemaTable => ({
  id: Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)),
  name,
  columns: [
    { id: 1, name: 'id', type: 'integer', is_primary: true },
    ...cols.map((c, i) => ({ id: i + 2, type: 'string', ...c })),
  ],
})

describe('buildSchemaGraph — casos degenerados', () => {
  it('workspace vazio → grafo vazio', () => {
    const g = buildSchemaGraph([])
    expect(g.nodes).toHaveLength(0)
    expect(g.edges).toHaveLength(0)
  })

  it('1 tabela sem FK → 1 órfã', () => {
    const g = buildSchemaGraph([t('solitaria')])
    expect(g.nodes).toHaveLength(1)
    expect(g.nodes[0].orphan).toBe(true)
    expect(g.orphanCount).toBe(1)
  })

  it('FK pra tabela inexistente → nó fantasma, não explode', () => {
    const g = buildSchemaGraph([t('a', [{ name: 'x_id', fk_table: 'deletada', fk_column: 'id' }])])
    const ghost = g.nodes.find(n => n.name === 'deletada')
    expect(ghost?.ghost).toBe(true)
    expect(ghost?.table).toBeNull()
    expect(g.ghostCount).toBe(1)
    expect(g.edges).toHaveLength(1)
  })

  it('auto-referência → edge selfRef, nó NÃO vira órfã nem conectado por ela', () => {
    const g = buildSchemaGraph([t('categorias', [{ name: 'parent_id', fk_table: 'categorias', fk_column: 'id' }])])
    expect(g.edges[0].selfRef).toBe(true)
    // sozinha com self-ref ela é órfã (self-ref não conecta a ninguém)
    expect(g.nodes[0].orphan).toBe(true)
  })

  it('ciclo a→b→c→a → 3 edges, layout não trava', () => {
    const tables = [
      t('a', [{ name: 'b_id', fk_table: 'b' }]),
      t('b', [{ name: 'c_id', fk_table: 'c' }]),
      t('c', [{ name: 'a_id', fk_table: 'a' }]),
    ]
    const g = buildSchemaGraph(tables)
    expect(g.edges).toHaveLength(3)
    const l = layoutSchema(g)
    expect(l.nodes).toHaveLength(3)
    expect(l.layers).toBeGreaterThan(0)
  })

  it('dedup: FK física + DynamicRelation espelho → 1 edge só, física', () => {
    const tables = [t('livros', [{ name: 'autor_id', fk_table: 'autores', fk_column: 'id' }]), t('autores')]
    const mirror: SchemaRelation = {
      id: 9, name: 'livros_autor_id_fk', from_table: 'livros',
      from_column_name: 'autor_id', to_table: 'autores', to_column_name: 'id',
      relation_type: 'many_to_one',
    }
    const g = buildSchemaGraph(tables, [mirror])
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0].logical).toBe(false)
  })

  it('relação lógica pura → edge tracejada (logical=true)', () => {
    const g = buildSchemaGraph(
      [t('a'), t('b')],
      [{ id: 1, name: 'a_b', from_table: 'a', from_column_name: 'nome', to_table: 'b', to_column_name: 'nome', relation_type: 'many_to_one' }],
    )
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0].logical).toBe(true)
  })

  it('relação lógica com column names NULL → entra sem âncora', () => {
    const g = buildSchemaGraph(
      [t('a'), t('b')],
      [{ id: 1, name: 'solta', from_table: 'a', from_column_name: null, to_table: 'b', to_column_name: null, relation_type: 'many_to_one' }],
    )
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0].fromColumn).toBeNull()
  })

  it('só órfãs → todas marcadas, nenhuma edge', () => {
    const g = buildSchemaGraph([t('a'), t('b'), t('c')])
    expect(g.orphanCount).toBe(3)
    expect(g.edges).toHaveLength(0)
  })
})

describe('fixture suja do spike (escala 30)', () => {
  const { tables, relations } = generateFixture(30)
  const g = buildSchemaGraph(
    tables as unknown as SchemaTable[],
    relations as unknown as SchemaRelation[],
  )

  it('tem fantasma (tabela_fantasma), órfãs e edges física+lógica', () => {
    expect(g.ghostCount).toBeGreaterThanOrEqual(1)
    expect(g.orphanCount).toBeGreaterThanOrEqual(1)
    expect(g.edges.some(e => e.logical)).toBe(true)
    expect(g.edges.some(e => !e.logical)).toBe(true)
  })

  it('espelhos deduplicados: nenhuma dupla (from,fromCol,to) repetida', () => {
    const keys = g.edges.map(e => `${e.from}|${e.fromColumn}|${e.to}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('layout: sem NaN, sem sobreposição na mesma coluna, cruzamentos baixos', () => {
    const l = layoutSchema(g, NODE_METRICS.regular)
    for (const n of l.nodes) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
    // nós da mesma coluna x não se sobrepõem verticalmente
    const cols = new Map<number, typeof l.nodes>()
    for (const n of l.nodes) cols.set(n.x, [...(cols.get(n.x) ?? []), n])
    for (const col of cols.values()) {
      const sorted = [...col].sort((a, b) => a.y - b.y)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].y).toBeGreaterThanOrEqual(sorted[i - 1].y + sorted[i - 1].height)
      }
    }
    // gate do spike: 3 cruzamentos a 30 tabelas — regressão se disparar
    expect(l.crossings).toBeLessThanOrEqual(6)
    expect(l.width).toBeGreaterThan(NODE_W)
  })

  it('órfãs ficam na coluna mais à direita do mundo', () => {
    const l = layoutSchema(g)
    const orphanX = Math.min(...l.nodes.filter(n => n.orphan).map(n => n.x))
    const flowMaxX = Math.max(...l.nodes.filter(n => !n.orphan).map(n => n.x))
    expect(orphanX).toBeGreaterThan(flowMaxX)
  })
})

describe('escala 100 — sanidade de perf do layout puro', () => {
  it('constrói e posiciona 100 tabelas em < 200ms', () => {
    const { tables, relations } = generateFixture(100)
    const t0 = performance.now()
    const g = buildSchemaGraph(tables as unknown as SchemaTable[], relations as unknown as SchemaRelation[])
    const l = layoutSchema(g)
    expect(performance.now() - t0).toBeLessThan(200)
    expect(l.nodes.length).toBeGreaterThanOrEqual(100)
  })
})
