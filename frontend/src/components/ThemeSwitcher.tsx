'use client'
import React, { useState } from 'react'
import { useTheme, type Accent, type Mode } from './ThemeContext'

const ACCENTS: { key: Accent; color: string; label: string }[] = [
  { key: 'goldenrod', color: '#DAA63E', label: 'Goldenrod' },
  { key: 'sage',      color: '#95A581', label: 'Sage'      },
  { key: 'ruby',      color: '#852E47', label: 'Ruby'      },
  { key: 'nectar',    color: '#C2441C', label: 'Nectar'    },
]

export default function ThemeSwitcher() {
  const { mode, accent, setMode, setAccent } = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
      }}
    >
      {open && (
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minWidth: '180px',
          }}
        >
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-muted)', marginBottom: '8px' }}>
              Accent
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {ACCENTS.map(a => (
                <button
                  key={a.key}
                  title={a.label}
                  onClick={() => setAccent(a.key)}
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: a.color,
                    border: accent === a.key ? `2px solid var(--fg-primary)` : '2px solid transparent',
                    outline: accent === a.key ? `2px solid ${a.color}` : 'none',
                    outlineOffset: '2px',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'outline 0.15s, border 0.15s',
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-muted)', marginBottom: '8px' }}>
              Mode
            </p>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['light', 'dark'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--rule)',
                    background: mode === m ? 'var(--accent)' : 'transparent',
                    color: mode === m ? 'var(--fg-inverse)' : 'var(--fg-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {m === 'light' ? '☀' : '◑'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        title="Theme"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'var(--accent)',
          color: 'var(--fg-inverse)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-md)',
          fontSize: '16px',
          transition: 'transform 0.15s',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        ✦
      </button>
    </div>
  )
}
