'use client'
/**
 * M7 — SchemaCanvas: a ÚNICA peça que conhece a engine de render
 * (princípio 6). Engine = custom híbrido, decisão do spike
 * (planning/m7_spike_resultado.md): divs absolutas + overlay SVG,
 * pan/zoom via transform CSS com zoom ancorado no cursor, fit-view
 * inicial. 60fps a 100 nós medido no spike.
 *
 * Read-only no PR2 — seleção/drag/busca entram no PR3.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { SchemaGraph } from '@/lib/schemaGraph'
import { layoutSchema, type LayoutMetrics, NODE_METRICS } from './layout'
import TableNode from './TableNode'
import EdgeLayer from './EdgeLayer'

export default function SchemaCanvas({
  graph,
  metrics = NODE_METRICS.regular,
}: {
  graph: SchemaGraph
  metrics?: LayoutMetrics
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null)

  const layout = useMemo(() => layoutSchema(graph, metrics), [graph, metrics])
  const nodeByName = useMemo(() => new Map(layout.nodes.map(n => [n.name, n])), [layout])

  // O mundo é memoizado: durante pan/zoom só o transform do container
  // muda — sem isso, cada pointermove re-renderiza 100+ nós (medido:
  // 19fps no gate; com o memo, 60fps como no spike).
  const world = useMemo(
    () => (
      <>
        <EdgeLayer edges={graph.edges} nodeByName={nodeByName} width={layout.width} height={layout.height} />
        {layout.nodes.map(n => (
          <div key={n.name} style={{ position: 'absolute', left: n.x, top: n.y }}>
            <TableNode node={n} metrics={metrics} width={n.width} />
          </div>
        ))}
      </>
    ),
    [graph, nodeByName, layout, metrics],
  )

  // fit-view inicial (e quando o grafo muda)
  useEffect(() => {
    const vp = viewportRef.current?.getBoundingClientRect()
    if (!vp || !layout.nodes.length) return
    const k = Math.min(1, vp.width / layout.width, vp.height / layout.height)
    setView({ x: Math.max(0, (vp.width - layout.width * k) / 2), y: Math.max(0, (vp.height - layout.height * k) / 2), k })
  }, [layout])

  return (
    <div
      ref={viewportRef}
      data-testid="schema-viewport"
      style={{
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        minHeight: 420,
        background: 'var(--bg-page)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius-md)',
        cursor: 'grab',
        touchAction: 'none',
      }}
      onPointerDown={e => {
        drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        ;(e.currentTarget as HTMLElement).style.cursor = 'grabbing'
      }}
      onPointerMove={e => {
        if (!drag.current) return
        drag.current.moved = true
        const { px, py, vx, vy } = drag.current
        setView(v => ({ ...v, x: vx + (e.clientX - px), y: vy + (e.clientY - py) }))
      }}
      onPointerUp={e => {
        drag.current = null
        ;(e.currentTarget as HTMLElement).style.cursor = 'grab'
      }}
      onWheel={e => {
        const rect = viewportRef.current!.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        setView(v => {
          const k = Math.min(2, Math.max(0.15, v.k * (e.deltaY < 0 ? 1.12 : 0.89)))
          return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }
        })
      }}
    >
      <div
        data-testid="schema-world"
        style={{
          position: 'absolute',
          width: layout.width,
          height: layout.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {world}
      </div>
      {/* grain do papel SEM mix-blend-mode: o multiply do .paper-texture
          força recomposição do canvas inteiro a cada frame de pan
          (medido: 17fps a 100 nós; com alpha puro, compositor resolve) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--paper-grain)',
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
