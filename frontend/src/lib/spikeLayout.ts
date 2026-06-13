/**
 * M7 spike — auto-layout topológico custom (engine-agnóstico).
 * Camadas por profundidade de FK (longest-path), órfãs em coluna à margem,
 * ordenação intra-camada por barycenter (reduz cruzamentos), e contagem
 * analítica de cruzamentos (critério 3 do spike).
 *
 * Serve aos DOIS candidatos: o A posiciona divs com estes x/y; o B injeta
 * as mesmas posições nos nós do @xyflow/react.
 */
import type { SpikeFixture } from './spikeFixtures'

export interface GraphNode {
  name: string
  ghost: boolean       // alvo de FK que não existe na resposta
  orphan: boolean
  columnCount: number
  fkCols: { name: string; target: string }[]
  pkName: string | null
  width: number
  height: number
  x: number
  y: number
  layer: number
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  logical: boolean     // true = só DynamicRelation (tracejada); false = FK física
}

export interface SpikeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  crossings: number
  layers: number
}

export const NODE_W = 240
const HEADER_H = 44
const ROW_H = 26
const MAX_ROWS = 8          // semantic clamp: nós não viram torres
const GAP_X = 90
const GAP_Y = 28
const ORPHAN_GAP = 140

export function buildGraph(fixture: SpikeFixture): SpikeGraph {
  const byName = new Map<string, GraphNode>()

  for (const t of fixture.tables) {
    byName.set(t.name, {
      name: t.name,
      ghost: false,
      orphan: false,
      columnCount: t.columns.length,
      fkCols: t.columns.filter(c => c.fk_table).map(c => ({ name: c.name, target: c.fk_table! })),
      pkName: t.columns.find(c => c.is_primary)?.name ?? null,
      width: NODE_W,
      height: HEADER_H + Math.min(t.columns.length, MAX_ROWS) * ROW_H + 12,
      x: 0, y: 0, layer: 0,
    })
  }

  // arestas físicas (das colunas) + dedup (from, fromCol, to)
  const edgeKeys = new Set<string>()
  const edges: GraphEdge[] = []
  for (const t of fixture.tables) {
    for (const c of t.columns) {
      if (!c.fk_table) continue
      const key = `${t.name}|${c.name}|${c.fk_table}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      if (!byName.has(c.fk_table)) {
        // nó fantasma: FK pra tabela deletada/renomeada
        byName.set(c.fk_table, {
          name: c.fk_table, ghost: true, orphan: false, columnCount: 0,
          fkCols: [], pkName: null, width: NODE_W, height: HEADER_H + 8,
          x: 0, y: 0, layer: 0,
        })
      }
      edges.push({ id: key, from: t.name, to: c.fk_table, logical: false })
    }
  }

  // relações lógicas: entram TRACEJADAS; espelho de FK física é deduplicado
  for (const r of fixture.relations) {
    const key = `${r.from_table}|${r.from_column_name ?? '∅'}|${r.to_table}`
    if (edgeKeys.has(key)) continue // espelho da física → dedup
    if (!byName.has(r.from_table) || !byName.has(r.to_table)) continue
    edgeKeys.add(key)
    edges.push({ id: `rel-${r.id}`, from: r.from_table, to: r.to_table, logical: true })
  }

  const nodes = [...byName.values()]
  const out = new Map<string, string[]>()
  const inDeg = new Map<string, number>()
  for (const n of nodes) { out.set(n.name, []); inDeg.set(n.name, 0) }
  for (const e of edges) {
    if (e.from === e.to) continue // auto-referência não move layout
    out.get(e.from)!.push(e.to)
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1)
  }

  // órfãs = grau zero total
  for (const n of nodes) {
    n.orphan = !n.ghost && (out.get(n.name)!.length === 0) && (inDeg.get(n.name) === 0)
  }

  // longest-path layering com quebra de ciclo (DFS, back edges ignoradas)
  const layer = new Map<string, number>()
  const state = new Map<string, 0 | 1 | 2>() // 0=branco 1=na pilha 2=feito
  const depth = (name: string): number => {
    if (state.get(name) === 1) return 0       // ciclo: corta aqui
    if (layer.has(name)) return layer.get(name)!
    state.set(name, 1)
    let d = 0
    for (const next of out.get(name) ?? []) d = Math.max(d, depth(next) + 1)
    state.set(name, 2)
    layer.set(name, d)
    return d
  }
  for (const n of nodes) if (!n.orphan) n.layer = depth(n.name)

  // camadas: maior profundidade à esquerda (quem é referenciado fica à direita)
  const maxLayer = Math.max(0, ...nodes.filter(n => !n.orphan).map(n => n.layer))
  const layers: GraphNode[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const n of nodes) if (!n.orphan) layers[maxLayer - n.layer].push(n)

  // barycenter: 3 passadas pra ordenar intra-camada pela média dos vizinhos
  const pos = new Map<string, number>()
  layers.forEach(l => l.forEach((n, i) => pos.set(n.name, i)))
  const neighbors = new Map<string, string[]>()
  for (const e of edges) {
    if (e.from === e.to) continue
    neighbors.set(e.from, [...(neighbors.get(e.from) ?? []), e.to])
    neighbors.set(e.to, [...(neighbors.get(e.to) ?? []), e.from])
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const l of layers) {
      l.sort((a, b) => {
        const bary = (n: GraphNode) => {
          const ns = neighbors.get(n.name) ?? []
          if (!ns.length) return pos.get(n.name)!
          return ns.reduce((s, m) => s + (pos.get(m) ?? 0), 0) / ns.length
        }
        return bary(a) - bary(b)
      })
      l.forEach((n, i) => pos.set(n.name, i))
    }
  }

  // posições: colunas por camada, stack vertical centrado
  let x = 0
  const colHeights = layers.map(l => l.reduce((s, n) => s + n.height + GAP_Y, 0))
  const tallest = Math.max(0, ...colHeights)
  layers.forEach((l, li) => {
    let y = (tallest - colHeights[li]) / 2
    for (const n of l) { n.x = x; n.y = y; y += n.height + GAP_Y }
    x += NODE_W + GAP_X
  })

  // órfãs: coluna própria à margem direita
  const orphans = nodes.filter(n => n.orphan)
  let oy = 0
  for (const n of orphans) { n.x = x + ORPHAN_GAP - GAP_X; n.y = oy; oy += n.height + GAP_Y }

  return { nodes, edges, crossings: countCrossings(layers, edges, pos), layers: layers.length }
}

/**
 * Critério 3: cruzamentos entre camadas adjacentes = pares de arestas
 * (a→b, c→d) com a acima de c mas b abaixo de d (inversão).
 */
function countCrossings(
  layers: GraphNode[][],
  edges: GraphEdge[],
  pos: Map<string, number>,
): number {
  const layerOf = new Map<string, number>()
  layers.forEach((l, i) => l.forEach(n => layerOf.set(n.name, i)))
  let total = 0
  for (let li = 0; li < layers.length - 1; li++) {
    const between = edges.filter(e =>
      e.from !== e.to &&
      ((layerOf.get(e.from) === li && layerOf.get(e.to) === li + 1) ||
       (layerOf.get(e.to) === li && layerOf.get(e.from) === li + 1)),
    ).map(e => {
      const a = layerOf.get(e.from) === li ? e.from : e.to
      const b = layerOf.get(e.from) === li ? e.to : e.from
      return [pos.get(a) ?? 0, pos.get(b) ?? 0] as const
    })
    for (let i = 0; i < between.length; i++)
      for (let j = i + 1; j < between.length; j++) {
        const [a1, b1] = between[i], [a2, b2] = between[j]
        if ((a1 - a2) * (b1 - b2) < 0) total++
      }
  }
  return total
}
