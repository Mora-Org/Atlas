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
 * PR4 (export + polish + hardening):
 *  - export PNG (clone off-screen sem transform, workaround do spike) e
 *    export SQL DDL (PostgreSQL/SQLite, lib/schemaDDL — engine-agnóstico)
 *  - semantic zoom: em zoom-out (k < COLLAPSE_K) os nós colapsam pro
 *    header (rung 2 da escada de hardening; legibilidade + menos paint)
 *  - entrada animada (framer-motion) gateada por nº de nós (rung 1)
 *
 * Perf (lições do gate do PR2, não regredir):
 *  - pan/zoom só tocam o transform — o world é memoizado
 *  - drag de nó re-renderiza o world por frame, mas TableNode/EdgeLayer
 *    são React.memo: só o nó arrastado + as edges re-renderizam
 *  - valores de alta frequência (view, drag) vão por ref pros handlers
 *    dentro do world memoizado
 *  - `collapsed` é boolean derivado de view.k: só entra nas deps do world
 *    quando CRUZA o threshold, não a cada frame de zoom
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { neighborsOf, type SchemaGraph } from '@/lib/schemaGraph'
import { generateDDL, type Dialect } from '@/lib/schemaDDL'
import { layoutSchema, type LayoutMetrics, NODE_METRICS } from './layout'
import TableNode from './TableNode'
import EdgeLayer from './EdgeLayer'
import { Button } from '@/components/ui'

type Overrides = Record<string, { x: number; y: number }>

/** dispara o download de um Blob no browser. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** semantic zoom: abaixo deste fator de escala, nós colapsam pro header. */
const COLLAPSE_K = 0.5
/** entrada animada só compensa abaixo deste nº de nós (rung 1 da escada). */
const ANIMATE_MAX_NODES = 60

export default function SchemaCanvas({
  graph,
  metrics = NODE_METRICS.regular,
  selected = null,
  onSelect,
  searchQuery = '',
  layoutStorageKey,
  workspace,
}: {
  graph: SchemaGraph
  metrics?: LayoutMetrics
  selected?: string | null
  onSelect?: (name: string | null) => void
  searchQuery?: string
  layoutStorageKey?: string
  /** nome do workspace pro cabeçalho do SQL e o nome do arquivo exportado */
  workspace?: string
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const viewRef = useRef(view)
  viewRef.current = view

  const [exporting, setExporting] = useState(false)
  const [sqlOpen, setSqlOpen] = useState(false)

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

  // semantic zoom: boolean derivado — só cruza o threshold, não muda por frame
  const collapsed = view.k < COLLAPSE_K
  const animateEntrance = graph.nodes.length <= ANIMATE_MAX_NODES

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
              height={n.height}
              selected={selected === n.name}
              dimmed={dimmedSet.has(n.name)}
              collapsed={collapsed}
            />
          </div>
        ))}
      </>
    ),
    [graph, nodeByName, nodes, bounds, metrics, selected, dimmedSet, collapsed, persist, select],
  )

  const fileBase = useMemo(() => {
    const slug = (workspace || 'workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace'
    return `esquema-${slug}`
  }, [workspace])

  // B20: a roda do mouse dava zoom E rolava a página junto.
  //
  // O `onWheel` do React não resolve: desde o React 17 os handlers de `wheel`
  // são registrados no root como PASSIVOS, então `preventDefault()` dentro
  // deles é ignorado (com aviso no console). O jeito de barrar o scroll é um
  // listener nativo declarado `{ passive: false }` no próprio viewport.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const aoGirar = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setView(v => {
        const k = Math.min(2, Math.max(0.15, v.k * (e.deltaY < 0 ? 1.12 : 0.89)))
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }
      })
    }
    el.addEventListener('wheel', aoGirar, { passive: false })
    return () => el.removeEventListener('wheel', aoGirar)
  }, [])

  const exportSQL = useCallback((dialect: Dialect) => {
    const sql = generateDDL(graph, dialect, { workspace })
    downloadBlob(new Blob([sql], { type: 'text/plain;charset=utf-8' }), `${fileBase}-${dialect}.sql`)
  }, [graph, workspace, fileBase])

  // export PNG: clona o world SEM o transform de pan/zoom, dimensiona pro
  // bounding box e rasteriza off-screen. Rasterização via html-to-image
  // (foreignObject: o BROWSER renderiza o CSS) — o html2canvas tinha parser
  // próprio de CSS e morria nos `color(srgb …)` que os tokens color-mix do
  // dark mode produzem (B15). Carrega a lib sob demanda pra não pesar o
  // bundle inicial da rota.
  const exportPNG = useCallback(async () => {
    const world = worldRef.current
    const vp = viewportRef.current
    if (!world || !vp || !nodes.length) return
    setExporting(true)
    let holder: HTMLElement | null = null
    try {
      const { toBlob } = await import('html-to-image')
      const bg = getComputedStyle(vp).backgroundColor

      // bounds REAIS incluindo nós arrastados pra coordenada negativa, com
      // padding — o `bounds` do estado só conta extensão positiva e cortaria
      const PAD = 48
      const minX = Math.min(...nodes.map(n => n.x)) - PAD
      const minY = Math.min(...nodes.map(n => n.y)) - PAD
      const maxX = Math.max(...nodes.map(n => n.x + n.width)) + PAD
      const maxY = Math.max(...nodes.map(n => n.y + n.height)) + PAD
      const w = Math.ceil(maxX - minX)
      const h = Math.ceil(maxY - minY)

      const clone = world.cloneNode(true) as HTMLElement
      // sem o transform de pan/zoom; translada pra trazer coords negativas
      // pra dentro da imagem (origem 0,0)
      clone.style.transform = `translate(${-minX}px, ${-minY}px)`
      clone.style.width = `${w}px`
      clone.style.height = `${h}px`

      // as cores das arestas SVG são CSS vars em atributo de apresentação: no
      // clone serializado isolado, var(--rule) pode não resolver (aresta
      // invisível). Resolve cada stroke ANTES de rasterizar.
      const oPaths = world.querySelectorAll('svg path')
      const cPaths = clone.querySelectorAll('svg path')
      cPaths.forEach((p, i) => {
        const o = oPaths[i]
        if (!o) return
        const cs = getComputedStyle(o)
        p.setAttribute('stroke', cs.stroke)
        p.setAttribute('stroke-width', cs.strokeWidth)
        if (cs.strokeDasharray && cs.strokeDasharray !== 'none') {
          p.setAttribute('stroke-dasharray', cs.strokeDasharray)
        }
      })

      holder = document.createElement('div')
      holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${w}px;height:${h}px;background:${bg};`
      holder.appendChild(clone)
      document.body.appendChild(holder)

      // escala: retina (2) só em imagem pequena; e nunca estourar o limite de
      // dimensão de canvas do browser (~16384px/lado) com nós arrastados longe
      let scale = w * h > 2_000_000 ? 1 : 2
      scale = Math.min(scale, 16384 / w, 16384 / h)

      // `style` neutraliza o posicionamento off-screen NA CÓPIA que a lib
      // rasteriza — sem isso o left:-100000px do holder vai junto e o PNG
      // sai só com o fundo.
      const blob = await toBlob(holder, {
        backgroundColor: bg,
        pixelRatio: scale,
        width: w,
        height: h,
        style: { position: 'static', left: '0px', top: '0px' },
      })
      if (blob) downloadBlob(blob, `${fileBase}.png`)
    } catch (e) {
      console.error('[schema] export PNG falhou', e)
    } finally {
      // remove o off-screen em TODOS os caminhos (inclusive erro/toBlob null)
      if (holder) holder.remove()
      setExporting(false)
    }
  }, [nodes, fileBase])

  return (
    <motion.div
      style={{ position: 'relative', height: '100%' }}
      initial={animateEntrance ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
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
          overscrollBehavior: 'contain',
        }}
        onPointerDown={e => {
          setSqlOpen(false) // click fora do menu SQL o fecha (o menu faz stopPropagation)
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
      >
        <div
          ref={worldRef}
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

        {/* toolbar de export (PR4) — stopPropagation no pointerdown pra não
            virar pan; fica fora do world, então não entra no PNG exportado */}
        <div
          style={{ position: 'absolute', left: 14, top: 14, display: 'flex', gap: 8, alignItems: 'flex-start', zIndex: 5 }}
          onPointerDown={e => e.stopPropagation()}
        >
          <Button variant="secondary" size="sm" icon="download" disabled={exporting} onClick={exportPNG}>
            {exporting ? 'exportando…' : 'PNG'}
          </Button>
          <div style={{ position: 'relative' }}>
            <Button variant="secondary" size="sm" icon="download" onClick={() => setSqlOpen(o => !o)}>
              SQL
            </Button>
            {sqlOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  overflow: 'hidden',
                  minWidth: 156,
                }}
              >
                {(['postgres', 'sqlite'] as Dialect[]).map(d => (
                  <button
                    key={d}
                    onClick={() => { exportSQL(d); setSqlOpen(false) }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '9px 13px',
                      background: 'transparent',
                      border: 0,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--fg-primary)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-sunken)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {d === 'postgres' ? 'PostgreSQL' : 'SQLite'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

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
    </motion.div>
  )
}
