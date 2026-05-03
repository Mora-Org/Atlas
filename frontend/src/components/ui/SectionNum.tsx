import React from 'react'

interface SectionNumProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

export default function SectionNum({ children, style }: SectionNumProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--accent-text)',
        letterSpacing: '0.08em',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
