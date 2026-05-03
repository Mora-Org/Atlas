'use client'
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type Accent = 'goldenrod' | 'sage' | 'ruby' | 'nectar'
export type Mode = 'light' | 'dark'

interface ThemeContextType {
  accent: Accent
  mode: Mode
  setAccent: (accent: Accent) => void
  setMode: (mode: Mode) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

function applyTheme(mode: Mode, accent: Accent) {
  const root = document.documentElement
  root.setAttribute('data-theme', mode)
  root.setAttribute('data-accent', accent)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>('light')
  const [accent, setAccentState] = useState<Accent>('goldenrod')

  useEffect(() => {
    const savedMode = localStorage.getItem('mora-theme') as Mode | null
    const savedAccent = localStorage.getItem('mora-accent') as Accent | null
    const m = savedMode === 'dark' ? 'dark' : 'light'
    const a: Accent = ['goldenrod', 'sage', 'ruby', 'nectar'].includes(savedAccent ?? '')
      ? (savedAccent as Accent)
      : 'goldenrod'
    setModeState(m)
    setAccentState(a)
    applyTheme(m, a)
  }, [])

  const setMode = (m: Mode) => {
    setModeState(m)
    localStorage.setItem('mora-theme', m)
    applyTheme(m, accent)
  }

  const setAccent = (a: Accent) => {
    setAccentState(a)
    localStorage.setItem('mora-accent', a)
    applyTheme(mode, a)
  }

  return (
    <ThemeContext.Provider value={{ mode, accent, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
