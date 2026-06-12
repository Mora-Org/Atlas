import React from 'react'

interface StatProps {
  /** O numeral (ou '—' quando o dado falhou — degradação por bloco). */
  value: React.ReactNode
  label: string
  style?: React.CSSProperties
}

/**
 * Numeral editorial: display itálico em accent + label discreta.
 * Substitui o JSX ad-hoc duplicado nas homes (admin/page, dashboard).
 */
export default function Stat({ value, label, style }: StatProps) {
  return (
    <div style={style}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: '38px',
          lineHeight: 1.1,
          color: 'var(--accent-text)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'var(--fg-muted)',
          marginTop: '2px',
        }}
      >
        {label}
      </div>
    </div>
  )
}
