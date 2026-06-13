'use client'
/**
 * M7 — overlay SVG das arestas. Convenção visual fechada no rebate
 * (decisão 1, padrão DBeaver/SqlDBM): sólida = FK física,
 * tracejada = relação lógica. Tokens: var(--rule); seleção/hover
 * em var(--accent) entra no PR3.
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

export default function EdgeLayer({
  edges,
  nodeByName,
  width,
  height,
}: {
  edges: SchemaEdge[]
  nodeByName: Map<string, PositionedNode>
  width: number
  height: number
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
        return (
          <path
            key={e.id}
            d={edgePath(from, to)}
            fill="none"
            stroke="var(--rule)"
            strokeWidth={1.5}
            strokeDasharray={e.logical ? '5 4' : undefined}
          />
        )
      })}
    </svg>
  )
}
