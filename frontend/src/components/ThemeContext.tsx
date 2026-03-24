"use client"
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type AccentColor = 'blue' | 'red' | 'green' | 'yellow' | 'orange' | 'purple'
type ThemeMode = 'dark' | 'light' | 'dusk' | 'dawn'

interface ThemeContextType {
  accent: AccentColor
  mode: ThemeMode
  setAccent: (color: AccentColor) => void
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const ACCENT_COLORS: Record<AccentColor, { primary: string; primaryHover: string; primaryMuted: string }> = {
  blue:   { primary: '220, 90%, 56%', primaryHover: '220, 90%, 46%', primaryMuted: '220, 50%, 20%' },
  red:    { primary: '0, 85%, 55%',   primaryHover: '0, 85%, 45%',   primaryMuted: '0, 45%, 20%' },
  green:  { primary: '150, 80%, 40%', primaryHover: '150, 80%, 32%', primaryMuted: '150, 40%, 18%' },
  yellow: { primary: '45, 95%, 55%',  primaryHover: '45, 95%, 45%',  primaryMuted: '45, 55%, 20%' },
  orange: { primary: '25, 95%, 55%',  primaryHover: '25, 95%, 45%',  primaryMuted: '25, 55%, 20%' },
  purple: { primary: '270, 75%, 55%', primaryHover: '270, 75%, 45%', primaryMuted: '270, 40%, 20%' },
}

const MODE_COLORS: Record<ThemeMode, { bg: string; bgCard: string; bgSurface: string; text: string; textMuted: string; border: string }> = {
  dark: {
    bg: '0, 0%, 4%',
    bgCard: '0, 0%, 8%',
    bgSurface: '0, 0%, 12%',
    text: '0, 0%, 95%',
    textMuted: '0, 0%, 55%',
    border: '0, 0%, 15%',
  },
  light: {
    bg: '0, 0%, 98%',
    bgCard: '0, 0%, 100%',
    bgSurface: '0, 0%, 96%',
    text: '0, 0%, 10%',
    textMuted: '0, 0%, 45%',
    border: '0, 0%, 88%',
  },
  dusk: {
    bg: '220, 15%, 12%',
    bgCard: '220, 15%, 16%',
    bgSurface: '220, 15%, 20%',
    text: '220, 10%, 92%',
    textMuted: '220, 10%, 55%',
    border: '220, 10%, 22%',
  },
  dawn: {
    bg: '30, 10%, 90%',
    bgCard: '30, 12%, 95%',
    bgSurface: '30, 10%, 88%',
    text: '30, 10%, 15%',
    textMuted: '30, 8%, 45%',
    border: '30, 8%, 80%',
  },
}

function applyTheme(accent: AccentColor, mode: ThemeMode) {
  const root = document.documentElement
  const accentVars = ACCENT_COLORS[accent]
  const modeVars = MODE_COLORS[mode]

  root.style.setProperty('--color-primary', accentVars.primary)
  root.style.setProperty('--color-primary-hover', accentVars.primaryHover)
  root.style.setProperty('--color-primary-muted', accentVars.primaryMuted)

  root.style.setProperty('--color-bg', modeVars.bg)
  root.style.setProperty('--color-bg-card', modeVars.bgCard)
  root.style.setProperty('--color-bg-surface', modeVars.bgSurface)
  root.style.setProperty('--color-text', modeVars.text)
  root.style.setProperty('--color-text-muted', modeVars.textMuted)
  root.style.setProperty('--color-border', modeVars.border)

  root.setAttribute('data-theme', mode)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentColor>('blue')
  const [mode, setModeState] = useState<ThemeMode>('dark')

  useEffect(() => {
    const savedAccent = localStorage.getItem('theme-accent') as AccentColor | null
    const savedMode = localStorage.getItem('theme-mode') as ThemeMode | null
    const a = savedAccent || 'blue'
    const m = savedMode || 'dark'
    setAccentState(a)
    setModeState(m)
    applyTheme(a, m)
  }, [])

  const setAccent = (color: AccentColor) => {
    setAccentState(color)
    localStorage.setItem('theme-accent', color)
    applyTheme(color, mode)
  }

  const setMode = (m: ThemeMode) => {
    setModeState(m)
    localStorage.setItem('theme-mode', m)
    applyTheme(accent, m)
  }

  return (
    <ThemeContext.Provider value={{ accent, mode, setAccent, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
