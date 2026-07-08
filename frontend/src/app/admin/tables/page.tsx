"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/AuthContext"
import { Button, Card, Eyebrow, Hairline, Icon, MMonogram, Pill, SectionNum } from "@/components/ui"

interface TableMeta {
  row_count: number
  column_count: number
  relation_count: number
}

interface DynamicTable {
  id: number
  name: string
  description?: string | null
  created_at: string
  is_public: boolean
  owner_id: number
  columns?: any[]
  meta?: TableMeta
}

type Layout = 'magazine' | 'grid'

const LAYOUT_KEY = 'tables-layout'

function formatDate(): string {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function TablesOverview() {
  const { token, isAdmin } = useAuth()
  const router = useRouter()
  const [tables, setTables] = useState<DynamicTable[]>([])
  const [loading, setLoading] = useState(true)
  const [layout, setLayout] = useState<Layout>('magazine')

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_KEY) as Layout | null
    if (saved === 'magazine' || saved === 'grid') setLayout(saved)
  }, [])

  useEffect(() => {
    fetch(`${API}/tables/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setTables(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [API, token])

  const setLayoutPersist = (l: Layout) => {
    setLayout(l)
    localStorage.setItem(LAYOUT_KEY, l)
  }

  const toggleVisibility = async (tableId: number) => {
    const res = await fetch(`${API}/tables/${tableId}/visibility`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setTables(prev => prev.map(t => t.id === tableId ? { ...t, is_public: data.is_public } : t))
    }
  }

  const today = useMemo(formatDate, [])

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Masthead */}
      <header className="paper-texture" style={{ position: 'relative', padding: '4px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 16 }}>
          <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'flex-start', gap: 18 }}>
            <div style={{ flexShrink: 0, marginTop: 4, opacity: 0.85 }}>
              <MMonogram size={40} color="var(--accent-text)" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Eyebrow accent style={{ marginBottom: 12 }}>
                Volume 1 · {today}
              </Eyebrow>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  fontSize: 48,
                  lineHeight: 1.05,
                  margin: 0,
                  letterSpacing: 'var(--tracking-h1)',
                  color: 'var(--fg-primary)',
                }}
              >
                Modelos de Dados
              </h1>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div
              style={{
                display: 'flex',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setLayoutPersist('magazine')}
                title="Magazine"
                style={{
                  background: layout === 'magazine' ? 'var(--bg-elevated)' : 'transparent',
                  color: layout === 'magazine' ? 'var(--fg-primary)' : 'var(--fg-muted)',
                  border: 0,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="list" size={14} />
              </button>
              <button
                onClick={() => setLayoutPersist('grid')}
                title="Grade"
                style={{
                  background: layout === 'grid' ? 'var(--bg-elevated)' : 'transparent',
                  color: layout === 'grid' ? 'var(--fg-primary)' : 'var(--fg-muted)',
                  border: 0,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Icon name="grid" size={14} />
              </button>
            </div>
            {isAdmin && (
              <Link href="/admin/tables/create" style={{ textDecoration: 'none' }}>
                <Button variant="primary" icon="plus">Nova tabela</Button>
              </Link>
            )}
          </div>
        </div>
        <Hairline strong />
        <p
          style={{
            marginTop: 16,
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 17,
            lineHeight: 1.4,
            color: 'var(--fg-secondary)',
            maxWidth: 640,
          }}
        >
          O índice editorial das tabelas deste workspace. Cada uma tem sua forma — colunas, relações, registros.
        </p>
      </header>

      {/* Body */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                height: 80,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--rule-faint)',
                borderRadius: 'var(--radius-sm)',
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 20px', textAlign: 'center' }}>
            <Icon name="database" size={32} color="var(--fg-muted)" />
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: 0, fontStyle: 'italic' }}>
              Nada catalogado ainda.
            </h3>
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--fg-secondary)', margin: 0, maxWidth: 360 }}>
              Comece criando uma tabela ou importando um script SQL para dar forma ao acervo.
            </p>
            {isAdmin && (
              <Link href="/admin/tables/create" style={{ textDecoration: 'none', marginTop: 8 }}>
                <Button variant="primary" icon="plus">Criar primeira tabela</Button>
              </Link>
            )}
          </div>
        </Card>
      ) : layout === 'magazine' ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Hairline strong />
          {tables.map((t, idx) => (
            <MagazineRow
              key={t.id}
              n={idx + 1}
              table={t}
              isAdmin={isAdmin}
              onOpen={() => router.push(`/admin/data/${t.name}`)}
              onToggle={() => toggleVisibility(t.id)}
              onManage={() => router.push(`/admin/tables/${t.id}/edit`)}
            />
          ))}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {tables.map((t, idx) => (
            <GridCard
              key={t.id}
              n={idx + 1}
              table={t}
              isAdmin={isAdmin}
              onOpen={() => router.push(`/admin/data/${t.name}`)}
              onToggle={() => toggleVisibility(t.id)}
              onManage={() => router.push(`/admin/tables/${t.id}/edit`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function statsLine(meta?: TableMeta): string {
  const r = meta?.row_count ?? 0
  const c = meta?.column_count ?? 0
  const rel = meta?.relation_count ?? 0
  return `${r.toLocaleString('pt-BR')} REGISTROS · ${c} COLUNAS · ${rel} RELAÇÕES`
}

interface RowProps {
  n: number
  table: DynamicTable
  isAdmin: boolean
  onOpen: () => void
  onToggle: () => void
  onManage: () => void
}

function MagazineRow({ n, table, isAdmin, onOpen, onToggle, onManage }: RowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr auto',
        gap: 24,
        alignItems: 'center',
        padding: '24px 4px',
        borderBottom: '1px solid var(--rule-faint)',
        transition: 'background var(--duration-base) var(--ease-editorial)',
      }}
    >
      <SectionNum style={{ fontSize: 18 }}>{String(n).padStart(2, '0')}</SectionNum>

      <div style={{ minWidth: 0 }}>
        <div style={{ marginBottom: 6 }}>
          <Eyebrow style={{ fontSize: 9 }}>{table.is_public ? 'Público' : 'Privado'}</Eyebrow>
        </div>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            fontWeight: 400,
            margin: '0 0 6px',
            letterSpacing: '-0.005em',
            color: 'var(--fg-primary)',
          }}
        >
          {table.name}
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 14,
            color: 'var(--fg-secondary)',
            margin: '0 0 10px',
            lineHeight: 1.4,
            maxWidth: 560,
          }}
        >
          {table.description || '—'}
        </p>
        <div
          className="numeric"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            color: 'var(--fg-muted)',
          }}
        >
          {statsLine(table.meta)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Button variant="ghost" size="sm" iconRight="chevron_right" onClick={onOpen}>
          Ver dados
        </Button>
        {isAdmin && (
          <Button variant="ghost" size="sm" icon="columns" onClick={onManage} title="Editar schema">
            Schema
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            icon={table.is_public ? 'lock' : 'shield'}
            onClick={onToggle}
            title={table.is_public ? 'Tornar privado' : 'Tornar público'}
          >
            {table.is_public ? 'Tornar privado' : 'Tornar público'}
          </Button>
        )}
      </div>
    </div>
  )
}

function GridCard({ n, table, isAdmin, onOpen, onToggle, onManage }: RowProps) {
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionNum>{String(n).padStart(2, '0')}</SectionNum>
          <Pill tone={table.is_public ? 'ok' : 'muted'} dot>
            {table.is_public ? 'público' : 'privado'}
          </Pill>
        </div>
        <Eyebrow style={{ fontSize: 9 }}>{table.is_public ? 'Público' : 'Privado'}</Eyebrow>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 400,
            margin: 0,
            letterSpacing: '-0.005em',
          }}
        >
          {table.name}
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--fg-secondary)',
            margin: 0,
            lineHeight: 1.4,
            minHeight: 36,
          }}
        >
          {table.description || '—'}
        </p>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.10em',
            color: 'var(--fg-muted)',
          }}
        >
          {statsLine(table.meta)}
        </div>
        <Hairline />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Button variant="ghost" size="sm" iconRight="chevron_right" onClick={onOpen}>
            Ver dados
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={onManage} title="Editar schema">
                <Icon name="columns" size={13} />
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                title={table.is_public ? 'Tornar privado' : 'Tornar público'}
              >
                <Icon name={table.is_public ? 'lock' : 'shield'} size={13} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
