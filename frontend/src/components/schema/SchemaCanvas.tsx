'use client'
/**
 * M7 — SchemaCanvas: a ÚNICA peça que conhece a engine de render
 * (princípio 6). Engine = custom híbrido, decisão do spike
 * (planning/m7_spike_resultado.md): divs absolutas + overlay SVG,
 * pan/zoom via transform CSS, fit-view inicial. 60fps a 100 nós medido.
 *
 * PR3 (interação):
 *  - seleção CONTROLADA (selected/onSelect) — o painel de detalhe mora
 *    na page; click no fundo limpa, click no nó alterna
 *  - drag de nó com threshold de 4px (abaixo = click); posições viram
 *    overrides persistidos em localStorage[layoutStorageKey]
 *  - "reorganizar" (overlay) descarta overrides e reaplica o auto-layout
 *  - busca: dim dos não-matches + centrar no primeiro match
 *
 * Perf (lições do gate do PR2, não regredir):
 *  - pan/zoom só tocam o transform — o world é memoizado
 *  - drag de nó re-renderiza o world por frame, mas TableNode/EdgeLayer
 *    são React.memo: só o nó arrastado + as edges re-renderizam
 *  - valores de alta frequência (view, drag) vão por ref pros handlers
 *    dentro do world memoizado
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { neighborsOf, type SchemaGraph } from '@/lib/schemaGraph'
import { layoutSchema, type LayoutMetrics, NODE_METRICS } from './layout'
import TableNode from './TableNode'
import EdgeLayer from './EdgeLayer'
import { Button } from '@/components/ui'

type Overrides = Record<string, { x: number; y: number }>

export default function SchemaCanvas({
  graph,
  metrics = NODE_METRICS.regular,
  selected = null,
  onSelect,
  searchQuery = '',
  layoutStorageKey,
}: {
  graph: SchemaGraph
  metrics?: LayoutMetrics
  selected?: string | null
  onSelect?: (name: string | null) => void
  searchQuery?: string
  layoutStorageKey?: string
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const viewRef = useRef(view)
  viewRef.current = view

  const pan = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null)
  const nodeDrag = useRef<{ name: string; px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null)

  const [overrides, setOverrides] = useState<Overrides>({})
  const overridesRef = useRef(overrides)
  overridesRef.current = overrides

  // carrega layout persistido (chave muda com workspace/filtro do master)
  useEffect(() => {
    if (!layoutStorageKey) { setOverrides({}); return }
    try {
      setOverrides(JSON.parse(localStorage.getItem(layoutStorageKey) ?? '{}') as Overrides)
    } catch {
      setOverrides({})
    }
  }, [layoutStorageKey])

  const persist = useCallback((o: Overrides) => {
    if (!layoutStorageKey) return
    if (Object.keys(o).length === 0) localStorage.removeItem(layoutStorageKey)
    else localStorage.setItem(layoutStorageKey, JSON.stringify(o))
  }, [layoutStorageKey])

  const baseLayout = useMemo(() => layoutSchema(graph, metrics), [graph, metrics])
  const nodes = useMemo(
    () => baseLayout.nodes.map(n => (overrides[n.name] ? { ...n, ...overrides[n.name] } : n)),
    [baseLayout, overrides],
  )
  const nodeByName = useMemo(() => new Map(nodes.map(n => [n.name, n])), [nodes])
  const bounds = useMemo(() => ({
    w: Math.max(baseLayout.width, ...nodes.map(n => n.x + n.width + 48)),
    h: Math.max(baseLayout.height, ...nodes.map(n => n.y + n.height + 48)),
  }), [baseLayout, nodes])

  // dim: busca ativa manda; senão, seleção esmaece não-vizinhos
  const dimmedSet = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      return new Set(nodes.filter(n => !n.name.toLowerCase().includes(q)).map(n => n.name))
    }
    if (selected && nodeByName.has(selected)) {
      const keep = neighborsOf(graph, selected)
      keep.add(selected)
      return new Set(nodes.filter(n => !keep.has(n.name)).map(n => n.name))
    }
    return new Set<string>()
  }, [searchQuery, selected, nodes, nodeByName, graph])

  // fit-view inicial (e quando o grafo/layout base muda — drag não re-fita)
  useEffect(() => {
    const vp = viewportRef.current?.getBoundingClientRect()
    if (!vp || !baseLayout.nodes.length) return
    const k = Math.min(1, vp.width / baseLayout.width, vp.height / baseLayout.height)
    setView({
      x: Math.max(0, (vp.width - baseLayout.width * k) / 2),
      y: Math.max(0, (vp.height - baseLayout.height * k) / 2),
      k,
    })
  }, [baseLayout])

  // busca: centra no primeiro match (alfabético) sem mexer no zoom
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || !viewportRef.current) return
    const match = [...nodeByName.values()]
      .filter(n => n.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))[0]
    if (!match) return
    const vp = viewportRef.current.getBoundingClientRect()
    setView(v => ({
      ...v,
      x: vp.width / 2 - (match.x + match.width / 2) * v.k,
      y: vp.height / 2 - (match.y + match.height / 2) * v.k,
    }))
    // deliberadamente NÃO depende de nodeByName: centrar de novo a cada
    // drag/override seria roubar o canvas do usuário
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const select = useCallback((name: string | null) => { onSelect?.(name) }, [onSelect])

  // o mundo: memoizado pra pan/zoom não re-renderizarem 100 nós (PR2)
  const world = useMemo(
    () => (
      <>
        <EdgeLayer
          edges={graph.edges}
          nodeByName={nodeByName}
          width={bounds.w}
          height={bounds.h}
          selected={selected}
        />
        {nodes.map(n => (
          <div
            key={n.name}
            style={{ position: 'absolute', left: n.x, top: n.y, touchAction: 'none' }}
            onPointerDown={e => {
              e.stopPropagation()
              nodeDrag.current = { name: n.name, px: e.clientX, py: e.clientY, ox: n.x, oy: n.y, moved: false }
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              const d = nodeDrag.current
              if (!d || d.name !== n.name) return
              if (!d.moved && Math.hypot(e.clientX - d.px, e.clientY - d.py) < 4) return
              d.moved = true
              const k = viewRef.current.k
              setOverrides(o => ({
                ...o,
                [d.name]: { x: d.ox + (e.clientX - d.px) / k, y: d.oy + (e.clientY - d.py) / k },
              }))
            }}
            onPointerUp={e => {
              const d = nodeDrag.current
              if (!d || d.name !== n.name) return
              nodeDrag.current = null
              e.stopPropagation()
              if (d.moved) persist(overridesRef.current)
              else select(n.name)
            }}
          >
            <TableNode
              node={n}
              metrics={metrics}
              width={n.width}
              selected={selected === n.name}
              dimmed={dimmedSet.has(n.name)}
            />
          </div>
        ))}
      </>
    ),
    [graph, nodeByName, nodes, bounds, metrics, selected, dimmedSet, persist, select],
  )

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
        pan.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        ;(e.currentTarget as HTMLElement).style.cursor = 'grabbing'
      }}
      onPointerMove={e => {
        if (!pan.current) return
        const p = pan.current
        if (!p.moved && Math.hypot(e.clientX - p.px, e.clientY - p.py) < 4) return
        p.moved = true
        setView(v => ({ ...v, x: p.vx + (e.clientX - p.px), y: p.vy + (e.clientY - p.py) }))
      }}
      onPointerUp={e => {
        const p = pan.current
        pan.current = null
        ;(e.currentTarget as HTMLElement).style.cursor = 'grab'
        // click no fundo (sem arrasto) limpa a seleção
        if (p && !p.moved) select(null)
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
          width: bounds.w,
          height: bounds.h,
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
      {Object.keys(overrides).length > 0 && (
        // stopPropagation: sem isso o pointerdown borbulha pro viewport,
        // que faz setPointerCapture pro pan — o pointerup é redirecionado
        // e o browser nunca sintetiza o click do botão
        <div
          style={{ position: 'absolute', right: 14, bottom: 14 }}
          onPointerDown={e => e.stopPropagation()}
        >
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            onClick={() => { setOverrides({}); persist({}) }}
          >
            reorganizar
          </Button>
        </div>
      )}
    </div>
  )
}
