import React from 'react'

interface CardProps {
  children: React.ReactNode
  padding?: boolean
  raised?: boolean
  interactive?: boolean
  style?: React.CSSProperties
}

export default function Card({
  children,
  padding = true,
  raised = false,
  interactive = false,
  style,
}: CardProps) {
  return (
    <div
      style={{
        background: raised ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius-md)',
        padding: padding ? '20px' : undefined,
        boxShadow: raised ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        cursor: interactive ? 'pointer' : undefined,
        transition: interactive ? 'box-shadow 0.15s, transform 0.15s' : undefined,
        ...style,
      }}
      onMouseEnter={interactive ? e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = 'var(--shadow-lg)'
        el.style.transform = 'translateY(-1px)'
      } : undefined}
      onMouseLeave={interactive ? e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = raised ? 'var(--shadow-md)' : 'var(--shadow-sm)'
        el.style.transform = 'none'
      } : undefined}
    >
      {children}
    </div>
  )
}
