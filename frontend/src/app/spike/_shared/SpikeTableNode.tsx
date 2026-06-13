'use client'
/**
 * M7 spike — o nó editorial Mora, ENGINE-AGNÓSTICO (princípio 6 do plano).
 * Usado identicamente pelo candidato A (custom) e B (@xyflow/react):
 * se a lib vazar CSS base pra dentro dele, é reprovação no critério 1.
 *
 * Vocabulário: Card + Eyebrow + Hairline + Pill, nome em --font-mono,
 * tipos em display itálico, "FK → {tabela}" do screens-2.jsx.
 */
import React from 'react'
import { Eyebrow, Hairline, Pill } from '@/components/ui'
import type { GraphNode } from '@/lib/spikeLayout'
import type { TableLite } from '@/lib/spikeFixtures'

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

const MAX_ROWS = 8

export default function SpikeTableNode({
  node,
  table,
}: {
  node: GraphNode
  table: TableLite | undefined
}) {
  if (node.ghost) {
    return (
      <div
        style={{
          width: node.width,
          background: 'var(--bg-sunken)',
          border: '1px dashed var(--rule)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          opacity: 0.7,
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

  const cols = table?.columns ?? []
  const shown = cols.slice(0, MAX_ROWS)
  const hidden = cols.length - shown.length

  return (
    <div
      style={{
        width: node.width,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Eyebrow style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{node.name}</Eyebrow>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
          {table?.meta?.row_count ?? 0} reg
        </span>
      </div>
      <Hairline />
      <div style={{ padding: '6px 0' }}>
        {shown.map(c => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
              height: 26,
              fontSize: 12,
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </span>
            {c.is_primary && <Pill tone="accent">PK</Pill>}
            {c.fk_table && (
              <Pill tone="muted" dot>FK → {c.fk_table}</Pill>
            )}
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
