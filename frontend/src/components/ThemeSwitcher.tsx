"use client"
import React from 'react'
import { useTheme } from './ThemeContext'
import { Palette, Sun, Moon, Sunset, Sunrise } from 'lucide-react'

const accentOptions = [
  { key: 'blue', label: 'Azul', css: 'hsl(220, 90%, 56%)' },
  { key: 'red', label: 'Vermelho', css: 'hsl(0, 85%, 55%)' },
  { key: 'green', label: 'Verde', css: 'hsl(150, 80%, 40%)' },
  { key: 'yellow', label: 'Amarelo', css: 'hsl(45, 95%, 55%)' },
  { key: 'orange', label: 'Laranja', css: 'hsl(25, 95%, 55%)' },
  { key: 'purple', label: 'Roxo', css: 'hsl(270, 75%, 55%)' },
] as const

const modeOptions = [
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dusk', label: 'Dusk', icon: Sunset },
  { key: 'dawn', label: 'Dawn', icon: Sunrise },
] as const

export default function ThemeSwitcher() {
  const { accent, mode, setAccent, setMode } = useTheme()

  return (
    <div className="space-y-4 p-4 rounded-2xl" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
      <div className="flex items-center gap-2 mb-2">
        <Palette className="w-4 h-4" style={{ color: 'hsl(var(--color-primary))' }} />
        <span className="text-sm font-semibold" style={{ color: 'hsl(var(--color-text))' }}>Tema</span>
      </div>

      {/* Accent color */}
      <div>
        <p className="text-xs mb-2" style={{ color: 'hsl(var(--color-text-muted))' }}>Cor Principal</p>
        <div className="flex gap-2">
          {accentOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setAccent(opt.key as any)}
              title={opt.label}
              className="w-7 h-7 rounded-full transition-all duration-200 ring-offset-2"
              style={{
                backgroundColor: opt.css,
                boxShadow: accent === opt.key ? `0 0 0 2px ${opt.css}` : 'none',
                transform: accent === opt.key ? 'scale(1.15)' : 'scale(1)',
                ringOffsetColor: 'hsl(var(--color-bg))'
              }}
            />
          ))}
        </div>
      </div>

      {/* Mode toggle */}
      <div>
        <p className="text-xs mb-2" style={{ color: 'hsl(var(--color-text-muted))' }}>Modo</p>
        <div className="grid grid-cols-4 gap-1 rounded-xl p-1" style={{ background: 'hsl(var(--color-bg-surface))' }}>
          {modeOptions.map(opt => {
            const Icon = opt.icon
            const isActive = mode === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => setMode(opt.key as any)}
                className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs transition-all duration-200"
                style={{
                  background: isActive ? 'hsl(var(--color-primary))' : 'transparent',
                  color: isActive ? 'white' : 'hsl(var(--color-text-muted))',
                }}
              >
                <Icon className="w-4 h-4" />
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
