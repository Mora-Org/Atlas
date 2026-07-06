"use client"
import React, { useEffect } from 'react'
import Icon from './Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: number
}

/**
 * Modal — dialog editorial Mora. Primitivo novo da M8 F2b (não existia em
 * `ui/`). Overlay fixo, fecha no backdrop e no Escape. Sem portal (fixed +
 * z-index alto basta). NÃO usa window.confirm/alert (dialogs nativos travam
 * automação de browser); confirmações destrutivas são digitação-de-nome.
 */
export default function Modal({ open, onClose, title, children, width = 520 }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'color-mix(in srgb, var(--fg-primary) 45%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%', maxWidth: width, maxHeight: '85vh', overflow: 'auto',
          background: 'var(--bg-surface)', border: '1px solid var(--rule)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: 24,
        }}
      >
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'var(--text-xl)', fontWeight: 400, margin: 0 }}>
              {title}
            </h3>
            <button onClick={onClose} title="Fechar" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', padding: 4 }}>
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
