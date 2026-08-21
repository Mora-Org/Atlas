'use client'
/**
 * M7 — overlay SVG das arestas. Convenção visual fechada no rebate
 * (decisão 1, padrão DBeaver/SqlDBM): sólida = FK física,
 * tracejada = relação lógica.
 *
 * Com seleção (PR3): edges incidentes ao nó selecionado sobem pra
 * var(--accent); as demais caem pra var(--schema-edge-dim). Sem seleção,
 * tudo em var(--schema-edge).
 *
 * B19: a cor vinha de `--rule`/`--rule-faint`, que são tokens de FILETE —
 * pensados pra 1px encostado em conteúdo, não pra linha atravessando canvas
 * aberto. Medido no app: 1,38:1 no claro e 1,35:1 no escuro contra o fundo,
 * ou seja invisível nos dois modos. Os tokens próprios invertem por tema
 * (tinta escura no papel claro, clara no escuro) e sobem pra 6,24:1 / 5,48:1.
 */
import React from 'react'
import type { SchemaEdge } from '@/lib/schemaGraph'
import type { PositionedNode } from './layout'

function edgePath(from: PositionedNode, to: PositionedNode): string {
  if (from.name === to.name) {
    // auto-referência: laço discreto na borda direita
    const x = from.x + from.width
    const y = from.y + 22
    return `M ${x} ${y} C ${x + 46} ${y - 10}, ${x + 46} ${y + 38}, ${x} ${y + 28}`
  }
  const x1 = from.x + from.width
  const y1 = from.y + from.height / 2
  const x2 = to.x
  const y2 = to.y + to.height / 2
  const dx = Math.max(40, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

function EdgeLayerInner({
  edges,
  nodeByName,
  width,
  height,
  selected = null,
}: {
  edges: SchemaEdge[]
  nodeByName: Map<string, PositionedNode>
  width: number
  height: number
  selected?: string | null
}) {
  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
      aria-hidden="true"
    >
      {edges.map(e => {
        const from = nodeByName.get(e.from)
        const to = nodeByName.get(e.to)
        if (!from || !to) return null
        const incident = selected !== null && (e.from === selected || e.to === selected)
        const stroke = selected === null
          ? 'var(--schema-edge)'
          : incident
            ? 'var(--accent)'
            : 'var(--schema-edge-dim)'
        return (
          <path
            key={e.id}
            d={edgePath(from, to)}
            fill="none"
            stroke={stroke}
            strokeWidth={incident ? 2 : 1.5}
            strokeDasharray={e.logical ? '5 4' : undefined}
          />
        )
      })}
    </svg>
  )
}

const EdgeLayer = React.memo(EdgeLayerInner)
export default EdgeLayer
