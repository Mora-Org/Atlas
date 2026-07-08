"use client"
import React from 'react'

interface ToggleProps {
  label: string
  hint?: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}

/**
 * Toggle — switch editorial Mora. Extraído inline do wizard de criar tabela
 * na M8 F2a (create-wizard + editor de schema compartilham). Primitivo pendente
 * do M7.5 (congelado); a extração aqui é mecânica, não puxa o resto do M7.5.
 */
export default function Toggle({ label, hint, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      aria-pressed={checked}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        background: 'transparent', border: 0, cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left', padding: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        width: 32, height: 18, borderRadius: 999, position: 'relative', flexShrink: 0,
        background: checked ? 'var(--accent)' : 'var(--bg-sunken)',
        border: '1px solid var(--rule)', transition: 'background var(--duration-base) var(--ease-editorial)',
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%', background: 'var(--bg-elevated)',
          position: 'absolute', top: 1, left: checked ? 16 : 1, transition: 'left var(--duration-base) var(--ease-paper)',
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500 }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
    </button>
  )
}
