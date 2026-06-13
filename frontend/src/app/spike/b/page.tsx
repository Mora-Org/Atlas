'use client'
/**
 * M7 spike — CANDIDATO B: @xyflow/react.
 * Nó React custom = MESMO SpikeTableNode do candidato A (critério 1:
 * se o CSS base da lib vazar pra dentro do nó, reprova).
 *
 * /spike/b?n=10|30|60|100            → posições do layout topológico custom
 * /spike/b?n=30&layout=dagre         → auto-layout dagre (lib-nativo)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import SpikeTableNode from '../_shared/SpikeTableNode'
import { useSpikeGraph, worldBounds, exportPngOffscreen } from '../_shared/spikeCommon'
import type { GraphNode } from '@/lib/spikeLayout'
import type { TableLite } from '@/lib/spikeFixtures'

type SpikeNodeData = { graphNode: GraphNode; table: TableLite | undefined }
type SpikeFlowNode = Node<SpikeNodeData, 'spikeTable'>

function FlowTableNode({ data }: NodeProps<SpikeFlowNode>) {
  // handles invisíveis: exigência da engine pra ancorar edges — o nó
  // compartilhado permanece intocado (princípio 6)
  const hidden = { opacity: 0, width: 1, height: 1, border: 0, minWidth: 0, minHeight: 0 }
  return (
    <>
      <Handle type="target" position={Position.Left} style={hidden} isConnectable={false} />
      <SpikeTableNode node={data.graphNode} table={data.table} />
      <Handle type="source" position={Position.Right} style={hidden} isConnectable={false} />
    </>
  )
}

const nodeTypes = { spikeTable: FlowTableNode }

function dagrePositions(nodes: GraphNode[], edges: { from: string; to: string }[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 90 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) g.setNode(n.name, { width: n.width, height: n.height })
  for (const e of edges) if (e.from !== e.to) g.setEdge(e.from, e.to)
  dagre.layout(g)
  const pos = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const p = g.node(n.name)
    pos.set(n.name, { x: p.x - n.width / 2, y: p.y - n.height / 2 })
  }
  return pos
}

function SpikeBInner() {
  const { scale, data } = useSpikeGraph('B')
  const [useDagre, setUseDagre] = useState(false)
  const worldSelector = useRef('.react-flow__viewport')

  useEffect(() => {
    setUseDagre(new URLSearchParams(window.location.search).get('layout') === 'dagre')
  }, [])

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as SpikeFlowNode[], edges: [] as Edge[] }
    const tablesByName = new Map(data.fixture.tables.map(t => [t.name, t]))
    let getPos = (n: GraphNode) => ({ x: n.x, y: n.y })
    if (useDagre) {
      const pos = dagrePositions(data.graph.nodes, data.graph.edges)
      getPos = n => pos.get(n.name) ?? { x: n.x, y: n.y }
    }
    const nodes: SpikeFlowNode[] = data.graph.nodes.map(n => ({
      id: n.name,
      type: 'spikeTable',
      position: getPos(n),
      data: { graphNode: n, table: tablesByName.get(n.name) },
      draggable: true,
    }))
    const edges: Edge[] = data.graph.edges.map(e => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'default',
      style: { stroke: 'var(--rule)', strokeWidth: 1.5, strokeDasharray: e.logical ? '5 4' : undefined },
    }))
    return { nodes, edges }
  }, [data, useDagre])

  // export PNG: mesmo workaround off-screen, sobre o viewport transformado da lib
  useEffect(() => {
    if (!window.__spike || !data) return
    window.__spike.exportPng = async () => {
      const world = document.querySelector(worldSelector.current) as HTMLElement | null
      if (!world) return { ok: false, ms: 0, bytes: 0, error: 'viewport não encontrado' }
      const b = worldBounds(data.graph.nodes)
      return exportPngOffscreen(world, b.w, b.h)
    }
  }, [data])

  if (!data || scale === null) return null

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-page)', color: 'var(--fg-primary)' }}>
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 16, alignItems: 'baseline', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <strong>spike B · @xyflow/react</strong>
        <span>{data.graph.nodes.length} nós · {data.graph.edges.length} edges · {data.graph.crossings} cruzamentos</span>
        <span style={{ color: 'var(--fg-muted)' }}>escala {scale} · layout {useDagre ? 'dagre' : 'topológico custom'}</span>
      </div>
      <div style={{ flex: 1 }} data-testid="spike-viewport">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.05 }}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          elementsSelectable={true}
        >
          <Background variant={BackgroundVariant.Dots} color="var(--rule-faint)" gap={24} />
        </ReactFlow>
      </div>
    </div>
  )
}

export default function SpikeB() {
  return (
    <ReactFlowProvider>
      <SpikeBInner />
    </ReactFlowProvider>
  )
}
