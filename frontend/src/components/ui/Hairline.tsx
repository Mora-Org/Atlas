import React from 'react'

interface HairlineProps {
  strong?: boolean
  my?: number
  style?: React.CSSProperties
}

export default function Hairline({ strong = false, my = 0, style }: HairlineProps) {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: `1px solid ${strong ? 'var(--rule)' : 'var(--rule-faint)'}`,
        margin: my ? `${my}px 0` : undefined,
        ...style,
      }}
    />
  )
}
