"use client"
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Icon, Input, Modal } from '@/components/ui'
import MediaPreview from './MediaPreview'

interface Asset {
  id: number
  url: string
  mime: string
  size_bytes: number
  original_name: string
  created_at?: string | null
}

interface MediaFieldProps {
  value: string | null
  onChange: (v: string | null) => void
  mediaType: string          // 'image' | 'file' | 'attachment'
  token: string | null
  api: string
  canEdit?: boolean          // false pro master (403 no backend) → só leitura
}

const miniBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)',
  cursor: 'pointer', color: 'var(--fg-muted)', padding: 3, display: 'flex',
}

/**
 * MediaField — widget de célula de mídia (M8 F2b).
 *
 * Mostra o preview do valor atual + abre um modal com (a) upload (dropzone,
 * precedente do import) e (b) a biblioteca do workspace (GET /api/assets,
 * reuso de asset). Grava na célula a URL string absoluta devolvida pelo
 * backend (não FK, não objeto — decisão #8 da F1). Sem progresso real de
 * upload (fetch+FormData não emite eventos → swap de texto "Enviando…").
 * Filtro do picker é client-side (backend só expõe limit/offset). Master:
 * canEdit=false → só preview.
 */
export default function MediaField({ value, onChange, mediaType, token, api, canEdit = true }: MediaFieldProps) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [loadingLib, setLoadingLib] = useState(false)
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const isImage = mediaType === 'image'

  const loadLibrary = useCallback(async () => {
    setLoadingLib(true)
    try {
      const r = await fetch(`${api}/api/assets?limit=60&offset=0`, { headers: { Authorization: `Bearer ${token}` } })
      const j = await r.json().catch(() => ({}))
      const rows: Asset[] = Array.isArray(j) ? j : (j.data ?? [])
      setAssets(rows)
    } catch {
      setAssets([])
    } finally {
      setLoadingLib(false)
    }
  }, [api, token])

  useEffect(() => {
    if (open) { setErr(''); loadLibrary() }
  }, [open, loadLibrary])

  const doUpload = async (file: File) => {
    setErr(''); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)   // multipart field 'file' (main.py upload_asset)
      const r = await fetch(`${api}/api/assets/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },   // NÃO setar Content-Type: o browser põe o boundary
        body: fd,
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.detail || 'Falha no upload.')
      onChange(j.url)
      setOpen(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) doUpload(f)
  }

  const shown = assets.filter(a => {
    if (isImage && !a.mime.startsWith('image/')) return false
    if (q.trim() && !(a.original_name || '').toLowerCase().includes(q.trim().toLowerCase())) return false
    return true
  })

  // Só leitura (master ou canEdit=false)
  if (!canEdit) {
    return value ? <MediaPreview url={value} mediaType={mediaType} /> : <span style={{ color: 'var(--fg-muted)' }}>—</span>
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {value ? (
        <>
          <MediaPreview url={value} mediaType={mediaType} />
          <button onClick={() => setOpen(true)} title="Trocar" style={miniBtn}><Icon name="edit" size={13} /></button>
          <button onClick={() => onChange(null)} title="Remover" style={miniBtn}><Icon name="close" size={13} /></button>
        </>
      ) : (
        <Button variant="ghost" size="sm" icon="upload" onClick={() => setOpen(true)}>Arquivo…</Button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={isImage ? 'Imagem' : 'Arquivo'} width={560}>
        {/* Upload */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{ border: '1.5px dashed var(--rule)', borderRadius: 'var(--radius-md)', padding: 24, textAlign: 'center', cursor: 'pointer', background: 'var(--bg-sunken)' }}
        >
          <Icon name="upload" size={22} color="var(--fg-muted)" />
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--fg-secondary)', margin: '8px 0 0' }}>
            {uploading ? 'Enviando…' : 'Arraste um arquivo ou clique para escolher'}
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', margin: '6px 0 0' }}>
            máx. 10MB{isImage ? ' · imagens' : ''}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept={isImage ? 'image/*' : undefined}
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = '' }}
          />
        </div>

        {err && (
          <div style={{ marginTop: 12, color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{err}</div>
        )}

        {/* Biblioteca */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-muted)', marginBottom: 10 }}>
            Biblioteca do workspace
          </div>
          <Input mono value={q} onChange={e => setQ(e.target.value)} placeholder="buscar por nome…" icon="search" />
          <div style={{ marginTop: 12, maxHeight: 260, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
            {loadingLib ? (
              <span style={{ gridColumn: '1/-1', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>carregando…</span>
            ) : shown.length === 0 ? (
              <span style={{ gridColumn: '1/-1', color: 'var(--fg-muted)', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13 }}>
                {q.trim() ? 'Nada corresponde à busca.' : 'Nada na biblioteca ainda — envie o primeiro arquivo acima.'}
              </span>
            ) : shown.map(a => (
              <button
                key={a.id}
                onClick={() => { onChange(a.url); setOpen(false) }}
                title={a.original_name}
                style={{ border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', padding: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              >
                {a.mime.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt="" style={{ width: '100%', height: 56, objectFit: 'cover', borderRadius: 2 }} />
                ) : (
                  <div style={{ height: 56, display: 'flex', alignItems: 'center' }}><Icon name="file" size={22} color="var(--fg-muted)" /></div>
                )}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-muted)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.original_name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </span>
  )
}
