'use client'
/**
 * M7 — o nó editorial do Schema Visualizer. Fino sobre primitivos de
 * @/components/ui (princípio 7: minimiza retrabalho no M7.5).
 * Vocabulário do screens-2.jsx: nome mono, Pill accent pra PK,
 * "FK → {tabela}", tipos em display itálico.
 *
 * Nota de densidade: --row-height (32/44/56) é escala de TABELA DE DADOS;
 * aqui a densidade responde em escala de nó (NODE_METRICS) — 44px/linha
 * viraria torre de 400px e mataria o canvas.
 */
import React from 'react'
import { Eyebrow, Hairline, Pill } from '@/components/ui'
import type { SchemaNode } from '@/lib/schemaGraph'
import { MAX_ROWS, type LayoutMetrics } from './layout'

const TYPE_LABEL: Record<string, string> = {
  integer: 'número inteiro',
  number: 'número',
  string: 'texto curto',
  longtext: 'texto longo',
  date: 'data',
  boolean: 'verdadeiro/falso',
  fk: 'relacionamento',
  json: 'json',
}

export default function TableNode({
  node,
  metrics,
  width,
}: {
  node: SchemaNode
  metrics: LayoutMetrics
  width: number
}) {
  if (node.ghost) {
    return (
      <div
        style={{
          width,
          background: 'var(--bg-sunken)',
          border: '1px dashed var(--rule)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          opacity: 0.75,
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
  const shown = cols.slice(0, MAX_ROWS)
  const hidden = cols.length - shown.length

  return (
    <div
      style={{
        width,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
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
                {TYPE_LABEL[c.type] ?? c.type}
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
