import React from 'react'

interface EyebrowProps {
  children: React.ReactNode
  num?: string | number
  accent?: boolean
  style?: React.CSSProperties
}

export default function Eyebrow({ children, num, accent = false, style }: EyebrowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
        color: accent ? 'var(--accent-text)' : 'var(--fg-muted)',
        ...style,
      }}
    >
      {num !== undefined && (
        <span style={{ opacity: 0.6 }}>{String(num).padStart(2, '0')}</span>
      )}
      <span>{children}</span>
    </div>
  )
}
