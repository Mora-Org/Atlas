import React from 'react'
import Icon, { type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps {
  children?: React.ReactNode
  variant?: Variant
  size?: Size
  icon?: IconName
  iconRight?: IconName
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  style?: React.CSSProperties
  title?: string
}

const VARIANT_STYLES: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--fg-inverse)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--bg-elevated)',
    color: 'var(--fg-primary)',
    border: '1px solid var(--rule)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--fg-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--danger-bg)',
    color: 'var(--danger)',
    border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
  },
  link: {
    background: 'transparent',
    color: 'var(--accent-text)',
    border: '1px solid transparent',
    textDecoration: 'underline',
    padding: '0',
  },
}

const SIZE_STYLES: Record<Size, React.CSSProperties> = {
  sm: { fontSize: '12px', padding: '5px 10px', gap: '5px', borderRadius: 'var(--radius-sm)' },
  md: { fontSize: '13px', padding: '7px 14px', gap: '6px', borderRadius: 'var(--radius-sm)' },
  lg: { fontSize: '15px', padding: '10px 20px', gap: '8px', borderRadius: 'var(--radius-md)' },
}

const ICON_SIZE: Record<Size, number> = { sm: 13, md: 14, lg: 16 }

export default function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  onClick,
  disabled = false,
  type = 'button',
  style,
  title,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'opacity 0.15s, background 0.15s',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={ICON_SIZE[size]} />}
      {children}
      {iconRight && <Icon name={iconRight} size={ICON_SIZE[size]} />}
    </button>
  )
}
