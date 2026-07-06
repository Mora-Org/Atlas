"use client"
import { Icon } from '@/components/ui'

interface MediaPreviewProps {
  url: string
  mediaType: string   // 'image' | 'file' | 'attachment'
  size?: number       // dimensão do thumbnail de imagem (px)
}

function basename(url: string): string {
  try {
    return decodeURIComponent(url.split('?')[0].split('/').pop() || 'arquivo')
  } catch {
    return 'arquivo'
  }
}

/**
 * MediaPreview — render read-only de uma célula de mídia (M8 F2b).
 * Compartilhado entre `displayValue` do DataViewer e o `MediaField`.
 * imagem → thumbnail que abre o original; file/attachment → ícone + nome +
 * download (decisão D6). Sem gerar thumbnail server-side (cortado na F1):
 * original + CSS `object-fit`.
 */
export default function MediaPreview({ url, mediaType, size = 40 }: MediaPreviewProps) {
  if (mediaType === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex' }} title="Abrir imagem">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          style={{ height: size, width: size, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--rule)', display: 'block' }}
        />
      </a>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--accent-text)', fontFamily: 'var(--font-mono)', fontSize: 12, maxWidth: 200 }}
      title={basename(url)}
    >
      <Icon name={mediaType === 'attachment' ? 'paperclip' : 'file'} size={14} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{basename(url)}</span>
      <Icon name="download" size={12} />
    </a>
  )
}
