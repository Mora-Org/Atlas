'use client'
/**
 * M7 — o nó editorial do Schema Visualizer. Fino sobre primitivos de
 * @/components/ui (princípio 7: minimiza retrabalho no M7.5).
 * Vocabulário do screens-2.jsx: nome mono, Pill accent pra PK,
 * "FK → {tabela}", tipos em display itálico; seleção = accent-soft +
 * borda accent (PR3).
 *
 * React.memo DELIBERADO: durante drag de nó/seleção o world re-renderiza,
 * e re-renderizar 100 nós por frame custa 19fps (medido no gate do PR2).
 * Com memo, só o nó cujas props mudaram renderiza de novo.
 *
 * Nota de densidade: --row-height (32/44/56) é escala de TABELA DE DADOS;
 * aqui a densidade responde em escala de nó (NODE_METRICS) — 44px/linha
 * viraria torre de 400px e mataria o canvas.
 */
import React from 'react'
import { Eyebrow, Hairline, Pill } from '@/components/ui'
import type { SchemaNode } from '@/lib/schemaGraph'
import { friendlyColumnType } from '@/lib/schemaDDL'
import { MAX_ROWS, type LayoutMetrics } from './layout'

interface TableNodeProps {
  node: SchemaNode
  metrics: LayoutMetrics
  width: number
  height?: number
  selected?: boolean
  dimmed?: boolean
  /** semantic zoom: em zoom-out, colapsa as colunas (só header) */
  collapsed?: boolean
}

function TableNodeInner({ node, metrics, width, height, selected = false, dimmed = false, collapsed = false }: TableNodeProps) {
  const fade: React.CSSProperties = dimmed
    ? { opacity: 0.32, transition: 'opacity var(--duration-fast, 0.15s) ease' }
    : { opacity: 1, transition: 'opacity var(--duration-fast, 0.15s) ease' }

  if (node.ghost) {
    return (
      <div
        data-node={node.name}
        style={{
          width,
          background: 'var(--bg-sunken)',
          border: selected ? '1px dashed var(--accent)' : '1px dashed var(--rule)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          cursor: 'pointer',
          ...fade,
          opacity: dimmed ? 0.32 : 0.75,
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
          {node.name}
        </span>
        <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
          tabela não encontrada
        </div>
      </div>
    )
  }

  const cols = node.table?.columns ?? []

  // semantic zoom (rung 2 da escada de hardening): em zoom-out as colunas
  // viram ruído ilegível — colapsa pro header, mantendo a MESMA altura do
  // layout pra não desalinhar as arestas (que ancoram em y + height/2).
  if (collapsed) {
    return (
      <div
        data-node={node.name}
        style={{
          width,
          height,
          background: selected ? 'var(--accent-soft, var(--accent-bg))' : 'var(--bg-elevated)',
          border: selected ? '1px solid var(--accent)' : '1px solid var(--rule)',
          borderRadius: 'var(--radius-md)',
          boxShadow: selected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          cursor: 'pointer',
          ...fade,
        }}
      >
        <div style={{ height: metrics.headerH, boxSizing: 'border-box', padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
          <Eyebrow style={{ fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </Eyebrow>
          {node.table?.is_public && <Pill tone="ok" dot>público</Pill>}
        </div>
        <Hairline />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
          {cols.length} {cols.length === 1 ? 'coluna' : 'colunas'}
        </div>
      </div>
    )
  }

  const shown = cols.slice(0, MAX_ROWS)
  const hidden = cols.length - shown.length

  return (
    <div
      data-node={node.name}
      style={{
        width,
        background: selected ? 'var(--accent-soft, var(--accent-bg))' : 'var(--bg-elevated)',
        border: selected ? '1px solid var(--accent)' : '1px solid var(--rule)',
        borderRadius: 'var(--radius-md)',
        boxShadow: selected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        overflow: 'hidden',
        cursor: 'pointer',
        ...fade,
      }}
    >
      <div
        style={{
          height: metrics.headerH,
          boxSizing: 'border-box',
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Eyebrow style={{ fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </Eyebrow>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          {node.table?.is_public && <Pill tone="ok" dot>público</Pill>}
          {node.table?.meta?.row_count ?? 0} reg
        </span>
      </div>
      <Hairline />
      <div style={{ padding: '4px 0' }}>
        {shown.map(c => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
              height: metrics.rowH,
              fontSize: 12,
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </span>
            {c.is_primary && <Pill tone="accent">PK</Pill>}
            {c.fk_table && <Pill tone="muted" dot>FK → {c.fk_table}</Pill>}
            {!c.fk_table && !c.is_primary && (
              <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 11, color: 'var(--fg-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                {friendlyColumnType(c)}
              </span>
            )}
          </div>
        ))}
        {hidden > 0 && (
          <div style={{ padding: '2px 14px 4px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>
            +{hidden} colunas
          </div>
        )}
      </div>
    </div>
  )
}

const TableNode = React.memo(TableNodeInner)
export default TableNode
