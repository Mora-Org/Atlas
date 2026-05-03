'use client'
import React, { useState } from 'react'
import Icon, { type IconName } from './Icon'

/* ─── Field wrapper ─────────────────────────────────────────────────────────── */
interface FieldProps {
  label?: string
  hint?: string
  error?: string
  children: React.ReactNode
  style?: React.CSSProperties
}

export function Field({ label, hint, error, children, style }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', ...style }}>
      {label && (
        <label style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 500, color: 'var(--fg-secondary)', letterSpacing: '0.02em' }}>
          {label}
        </label>
      )}
      {children}
      {(hint || error) && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: error ? 'var(--danger)' : 'var(--fg-muted)', marginTop: '1px' }}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

/* ─── Shared input base styles ──────────────────────────────────────────────── */
const inputBase = (focused: boolean, error?: string, mono?: boolean): React.CSSProperties => ({
  width: '100%',
  background: 'var(--bg-elevated)',
  border: `1px solid ${error ? 'var(--danger)' : focused ? 'var(--accent)' : 'var(--rule)'}`,
  borderRadius: 'var(--radius-sm)',
  fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
  fontSize: '13px',
  color: 'var(--fg-primary)',
  outline: 'none',
  transition: 'border-color 0.15s',
})

/* ─── Input ─────────────────────────────────────────────────────────────────── */
interface InputProps {
  value?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  placeholder?: string
  type?: string
  icon?: IconName
  error?: string
  style?: React.CSSProperties
  mono?: boolean
  disabled?: boolean
}

export function Input({ value, onChange, placeholder, type = 'text', icon, error, style, mono, disabled }: InputProps) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {icon && (
        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)', pointerEvents: 'none', display: 'flex' }}>
          <Icon name={icon} size={14} />
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...inputBase(focused, error, mono),
          padding: icon ? '7px 10px 7px 30px' : '7px 10px',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : undefined,
          ...style,
        }}
      />
    </div>
  )
}

/* ─── Select ────────────────────────────────────────────────────────────────── */
interface SelectProps {
  value?: string
  onChange?: React.ChangeEventHandler<HTMLSelectElement>
  children: React.ReactNode
  error?: string
  style?: React.CSSProperties
  disabled?: boolean
}

export function Select({ value, onChange, children, error, style, disabled }: SelectProps) {
  const [focused, setFocused] = useState(false)
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputBase(focused, error),
        padding: '7px 10px',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: '28px',
        cursor: 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </select>
  )
}

/* ─── Textarea ──────────────────────────────────────────────────────────────── */
interface TextareaProps {
  value?: string
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>
  placeholder?: string
  rows?: number
  error?: string
  style?: React.CSSProperties
  disabled?: boolean
}

export function Textarea({ value, onChange, placeholder, rows = 4, error, style, disabled }: TextareaProps) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputBase(focused, error),
        padding: '7px 10px',
        resize: 'vertical',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : undefined,
        ...style,
      }}
    />
  )
}
