'use client'
/**
 * M7 spike — CANDIDATO A: custom híbrido.
 * Nós HTML position:absolute + overlay SVG pras edges, pan/zoom via
 * transform CSS no container "mundo". Zero dependência nova.
 *
 * /spike/a?n=10|30|60|100
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import SpikeTableNode from '../_shared/SpikeTableNode'
import { useSpikeGraph, worldBounds, edgePath, exportPngOffscreen } from '../_shared/spikeCommon'

export default function SpikeA() {
  const { scale, data } = useSpikeGraph('A')
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 40, y: 40, k: 1 })
  const drag = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null)

  const bounds = useMemo(() => (data ? worldBounds(data.graph.nodes) : { w: 0, h: 0 }), [data])
  const tablesByName = useMemo(
    () => new Map((data?.fixture.tables ?? []).map(t => [t.name, t])),
    [data],
  )

  // fit-view inicial
  useEffect(() => {
    if (!data || !viewportRef.current) return
    const vp = viewportRef.current.getBoundingClientRect()
    const k = Math.min(1, vp.width / bounds.w, vp.height / bounds.h)
    setView({ x: (vp.width - bounds.w * k) / 2, y: 20, k })
  }, [data, bounds])

  // export PNG exposto pra medição
  useEffect(() => {
    if (!window.__spike || !worldRef.current) return
    window.__spike.exportPng = () => exportPngOffscreen(worldRef.current!, bounds.w, bounds.h)
  }, [data, bounds])

  if (!data || scale === null) return null

  const { graph } = data
  const nodeByName = new Map(graph.nodes.map(n => [n.name, n]))

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-page)', color: 'var(--fg-primary)' }}>
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 16, alignItems: 'baseline', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <strong>spike A · custom híbrido</strong>
        <span>{graph.nodes.length} nós · {graph.edges.length} edges · {graph.crossings} cruzamentos · {graph.layers} camadas</span>
        <span style={{ color: 'var(--fg-muted)' }}>escala {scale} — arraste pra pan, roda pra zoom</span>
      </div>

      <div
        ref={viewportRef}
        data-testid="spike-viewport"
        style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={e => {
          drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y }
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={e => {
          if (!drag.current) return
          setView(v => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.px), y: drag.current!.vy + (e.clientY - drag.current!.py) }))
        }}
        onPointerUp={() => { drag.current = null }}
        onWheel={e => {
          const rect = viewportRef.current!.getBoundingClientRect()
          const mx = e.clientX - rect.left
          const my = e.clientY - rect.top
          setView(v => {
            const k = Math.min(2, Math.max(0.15, v.k * (e.deltaY < 0 ? 1.12 : 0.89)))
            // zoom ancorado no cursor
            return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }
          })
        }}
      >
        <div
          ref={worldRef}
          data-testid="spike-world"
          style={{
            position: 'absolute',
            width: bounds.w,
            height: bounds.h,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          <svg width={bounds.w} height={bounds.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
            {graph.edges.map(e => {
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
          {graph.nodes.map(n => (
            <div key={n.name} style={{ position: 'absolute', left: n.x, top: n.y }}>
              <SpikeTableNode node={n} table={tablesByName.get(n.name)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
