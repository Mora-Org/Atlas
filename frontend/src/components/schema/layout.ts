/**
 * M7 — auto-layout topológico do Schema Visualizer (validado no spike,
 * planning/m7_spike_resultado.md: 3 cruzamentos na fixture de 30).
 *
 * Camadas por profundidade de FK (longest-path; ciclos cortados via DFS),
 * barycenter 3 passadas pra reduzir cruzamentos, órfãs em coluna à margem
 * direita. Módulo puro: recebe o grafo + métrica de altura, devolve
 * posições — nenhuma engine de render aqui.
 */
import type { SchemaGraph, SchemaNode } from '@/lib/schemaGraph'

export interface PositionedNode extends SchemaNode {
  x: number
  y: number
  width: number
  height: number
}

export interface SchemaLayout {
  nodes: PositionedNode[]
  /** bounding box do mundo (pra fit-view e export) */
  width: number
  height: number
  crossings: number
  layers: number
}

export const NODE_W = 240
export const MAX_ROWS = 8 // clamp: nós não viram torres ("+N colunas")
const GAP_X = 90
const GAP_Y = 28
const ORPHAN_GAP = 140
const PAD = 48

export interface LayoutMetrics {
  headerH: number
  rowH: number
  footerH: number
}

/** Densidade do TweaksContext em escala de nó (não a de tabela de dados). */
export const NODE_METRICS: Record<'compact' | 'regular' | 'loose', LayoutMetrics> = {
  compact: { headerH: 38, rowH: 24, footerH: 10 },
  regular: { headerH: 44, rowH: 28, footerH: 12 },
  loose: { headerH: 50, rowH: 32, footerH: 14 },
}

export function nodeHeight(n: SchemaNode, m: LayoutMetrics): number {
  if (n.ghost) return m.headerH + 8
  const rows = Math.min(n.table?.columns.length ?? 0, MAX_ROWS)
  const clampNote = (n.table?.columns.length ?? 0) > MAX_ROWS ? 18 : 0
  return m.headerH + rows * m.rowH + clampNote + m.footerH
}

export function layoutSchema(
  graph: SchemaGraph,
  metrics: LayoutMetrics = NODE_METRICS.regular,
): SchemaLayout {
  const nodes: PositionedNode[] = graph.nodes.map(n => ({
    ...n,
    x: 0,
    y: 0,
    width: NODE_W,
    height: nodeHeight(n, metrics),
  }))
  const byName = new Map(nodes.map(n => [n.name, n]))

  const out = new Map<string, string[]>()
  for (const n of nodes) out.set(n.name, [])
  for (const e of graph.edges) {
    if (e.selfRef) continue
    out.get(e.from)?.push(e.to)
  }

  // longest-path layering com quebra de ciclo (back edges ignoradas)
  const layer = new Map<string, number>()
  const state = new Map<string, 1 | 2>()
  const depth = (name: string): number => {
    if (state.get(name) === 1) return 0 // ciclo: corta aqui
    if (layer.has(name)) return layer.get(name)!
    state.set(name, 1)
    let d = 0
    for (const next of out.get(name) ?? []) {
      if (byName.has(next)) d = Math.max(d, depth(next) + 1)
    }
    state.set(name, 2)
    layer.set(name, d)
    return d
  }
  const flow = nodes.filter(n => !n.orphan)
  for (const n of flow) depth(n.name)

  // referenciados à direita (quem aponta fica à esquerda)
  const maxLayer = Math.max(0, ...flow.map(n => layer.get(n.name) ?? 0))
  const layers: PositionedNode[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const n of flow) layers[maxLayer - (layer.get(n.name) ?? 0)].push(n)

  // barycenter: ordena cada camada pela média da posição dos vizinhos
  const pos = new Map<string, number>()
  layers.forEach(l => l.forEach((n, i) => pos.set(n.name, i)))
  const neighbors = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (e.selfRef) continue
    neighbors.set(e.from, [...(neighbors.get(e.from) ?? []), e.to])
    neighbors.set(e.to, [...(neighbors.get(e.to) ?? []), e.from])
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const l of layers) {
      l.sort((a, b) => bary(a) - bary(b))
      l.forEach((n, i) => pos.set(n.name, i))
    }
  }
  function bary(n: PositionedNode): number {
    const ns = neighbors.get(n.name) ?? []
    if (!ns.length) return pos.get(n.name) ?? 0
    return ns.reduce((s, m) => s + (pos.get(m) ?? 0), 0) / ns.length
  }

  // posições: colunas por camada, stacks centrados verticalmente
  let x = PAD
  const colHeights = layers.map(l => l.reduce((s, n) => s + n.height + GAP_Y, -GAP_Y))
  const tallest = Math.max(0, ...colHeights)
  layers.forEach((l, li) => {
    let y = PAD + Math.max(0, (tallest - colHeights[li]) / 2)
    for (const n of l) {
      n.x = x
      n.y = y
      y += n.height + GAP_Y
    }
    if (l.length) x += NODE_W + GAP_X
  })

  // órfãs: coluna própria, claramente à margem
  const orphans = nodes.filter(n => n.orphan)
  if (orphans.length) {
    const ox = x + (ORPHAN_GAP - GAP_X)
    let oy = PAD
    for (const n of orphans) {
      n.x = ox
      n.y = oy
      oy += n.height + GAP_Y
    }
    x = ox + NODE_W
  }

  const width = Math.max(0, ...nodes.map(n => n.x + n.width)) + PAD
  const height = Math.max(0, ...nodes.map(n => n.y + n.height)) + PAD

  return { nodes, width, height, crossings: countCrossings(layers, graph, pos), layers: layers.length }
}

/** Cruzamentos entre camadas adjacentes (inversões) — gate do spike. */
function countCrossings(
  layers: PositionedNode[][],
  graph: SchemaGraph,
  pos: Map<string, number>,
): number {
  const layerOf = new Map<string, number>()
  layers.forEach((l, i) => l.forEach(n => layerOf.set(n.name, i)))
  let total = 0
  for (let li = 0; li < layers.length - 1; li++) {
    const between: Array<readonly [number, number]> = []
    for (const e of graph.edges) {
      if (e.selfRef) continue
      const lf = layerOf.get(e.from)
      const lt = layerOf.get(e.to)
      if (lf === li && lt === li + 1) between.push([pos.get(e.from) ?? 0, pos.get(e.to) ?? 0])
      else if (lt === li && lf === li + 1) between.push([pos.get(e.to) ?? 0, pos.get(e.from) ?? 0])
    }
    for (let i = 0; i < between.length; i++)
      for (let j = i + 1; j < between.length; j++) {
        if ((between[i][0] - between[j][0]) * (between[i][1] - between[j][1]) < 0) total++
      }
  }
  return total
}
