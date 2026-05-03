import React from 'react'

type Tone = 'accent' | 'muted' | 'ok' | 'warn' | 'err' | 'master' | 'admin' | 'moderator'

interface PillProps {
  children: React.ReactNode
  tone?: Tone
  dot?: boolean
  style?: React.CSSProperties
}

const TONE_STYLES: Record<Tone, { bg: string; color: string; dot: string }> = {
  accent:    { bg: 'var(--accent-bg)',   color: 'var(--accent-text)',  dot: 'var(--accent)' },
  muted:     { bg: 'var(--bg-sunken)',   color: 'var(--fg-muted)',     dot: 'var(--fg-muted)' },
  ok:        { bg: 'var(--ok-bg)',       color: 'var(--ok)',           dot: 'var(--ok)' },
  warn:      { bg: 'var(--warn-bg)',     color: 'var(--warn)',         dot: 'var(--warn)' },
  err:       { bg: 'var(--danger-bg)',   color: 'var(--danger)',       dot: 'var(--danger)' },
  master:    { bg: 'color-mix(in srgb, #852E47 14%, transparent)', color: '#852E47', dot: '#852E47' },
  admin:     { bg: 'var(--accent-bg)',   color: 'var(--accent-text)',  dot: 'var(--accent)' },
  moderator: { bg: 'var(--bg-sunken)',   color: 'var(--fg-secondary)', dot: 'var(--fg-muted)' },
}

export default function Pill({ children, tone = 'muted', dot = false, style }: PillProps) {
  const t = TONE_STYLES[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: t.bg,
        color: t.color,
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 500,
        letterSpacing: '0.04em',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: t.dot,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  )
}
