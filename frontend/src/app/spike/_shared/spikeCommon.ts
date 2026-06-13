'use client'
/**
 * M7 spike — utilitários compartilhados entre os candidatos:
 * escala via query (?n=10|30|60|100), bounds do mundo, path das edges,
 * instrumentação de perf (window.__spike) e export PNG off-screen.
 */
import { useEffect, useMemo, useState } from 'react'
import { generateFixture, type SpikeFixture } from '@/lib/spikeFixtures'
import { buildGraph, type SpikeGraph, type GraphNode } from '@/lib/spikeLayout'

declare global {
  interface Window {
    __spike?: {
      candidate: string
      scale: number
      nodes: number
      edges: number
      crossings: number
      layers: number
      mountMs: number | null
      exportPng?: () => Promise<{ ok: boolean; ms: number; bytes: number; error?: string }>
    }
  }
}

export function useSpikeGraph(candidate: string) {
  const [scale, setScale] = useState<number | null>(null)
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('n') ?? 30)
    setScale([10, 30, 60, 100].includes(n) ? n : 30)
  }, [])

  const data = useMemo<{ fixture: SpikeFixture; graph: SpikeGraph } | null>(() => {
    if (scale === null) return null
    const fixture = generateFixture(scale)
    return { fixture, graph: buildGraph(fixture) }
  }, [scale])

  // instrumentação: o script Playwright lê window.__spike
  useEffect(() => {
    if (!data || scale === null) return
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const mountMs = nav ? Math.round(performance.now() - nav.responseEnd) : Math.round(performance.now())
    window.__spike = {
      candidate,
      scale,
      nodes: data.graph.nodes.length,
      edges: data.graph.edges.length,
      crossings: data.graph.crossings,
      layers: data.graph.layers,
      mountMs,
    }
    performance.mark(`spike-${candidate}-mounted`)
  }, [data, scale, candidate])

  return { scale, data }
}

export function worldBounds(nodes: GraphNode[]) {
  const maxX = Math.max(0, ...nodes.map(n => n.x + n.width)) + 80
  const maxY = Math.max(0, ...nodes.map(n => n.y + n.height)) + 80
  return { w: maxX, h: maxY }
}

/** Cubic bezier saindo da borda direita do from pra borda esquerda do to. */
export function edgePath(from: GraphNode, to: GraphNode): string {
  if (from.name === to.name) {
    // auto-referência: laço à direita do nó
    const x = from.x + from.width
    const y = from.y + 20
    return `M ${x} ${y} C ${x + 50} ${y - 10}, ${x + 50} ${y + 40}, ${x} ${y + 30}`
  }
  const x1 = from.x + from.width
  const y1 = from.y + from.height / 2
  const x2 = to.x
  const y2 = to.y + to.height / 2
  const dx = Math.max(40, Math.abs(x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

/**
 * Workaround de export mapeado no plano: clona o MUNDO (sem transform de
 * pan/zoom) num container off-screen e rasteriza a cópia com html2canvas.
 */
export async function exportPngOffscreen(worldEl: HTMLElement, w: number, h: number) {
  const t0 = performance.now()
  try {
    const { default: html2canvas } = await import('html2canvas')
    const holder = document.createElement('div')
    holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${w}px;height:${h}px;background:var(--bg-page);`
    const clone = worldEl.cloneNode(true) as HTMLElement
    clone.style.transform = 'none'
    holder.appendChild(clone)
    document.body.appendChild(holder)
    const canvas = await html2canvas(holder, { width: w, height: h, scale: 1, logging: false })
    document.body.removeChild(holder)
    const dataUrl = canvas.toDataURL('image/png')
    return { ok: dataUrl.length > 1000, ms: Math.round(performance.now() - t0), bytes: dataUrl.length }
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), bytes: 0, error: String(e) }
  }
}
