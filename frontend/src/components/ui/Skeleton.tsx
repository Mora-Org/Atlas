import React from 'react'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  /** 'text' arredonda pouco; 'block' usa o radius padrão de cards. */
  variant?: 'text' | 'block'
  style?: React.CSSProperties
}

/** Placeholder shimmer pra loading que preserva o layout (M6.5). */
export default function Skeleton({ width = '100%', height = 16, variant = 'text', style }: SkeletonProps) {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        width,
        height,
        borderRadius: variant === 'block' ? 'var(--radius-md, 8px)' : '4px',
        background:
          'linear-gradient(90deg, var(--bg-sunken) 25%, var(--bg-elevated) 50%, var(--bg-sunken) 75%)',
        backgroundSize: '200% 100%',
        animation: 'mora-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  )
}
