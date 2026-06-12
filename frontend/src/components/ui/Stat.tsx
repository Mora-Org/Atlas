import React from 'react'

interface StatProps {
  /** O numeral (ou '—' quando o dado falhou — degradação por bloco). */
  value: React.ReactNode
  label: string
  /** 'inline' = numeral e label lado a lado na baseline (padrão da capa). */
  inline?: boolean
  style?: React.CSSProperties
}

/**
 * Numeral editorial: display itálico em accent + label discreta.
 * Substitui o JSX ad-hoc duplicado nas homes (admin/page, dashboard).
 */
export default function Stat({ value, label, inline = false, style }: StatProps) {
  return (
    <div
      style={
        inline
          ? { display: 'flex', alignItems: 'baseline', gap: '14px', ...style }
          : style
      }
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontSize: '38px',
          lineHeight: 1,
          color: 'var(--accent-text)',
          fontVariationSettings: '"opsz" 144',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: inline ? 'var(--font-display)' : undefined,
          fontSize: '13px',
          color: inline ? 'var(--fg-secondary)' : 'var(--fg-muted)',
          marginTop: inline ? 0 : '2px',
        }}
      >
        {label}
      </div>
    </div>
  )
}
