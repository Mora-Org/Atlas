'use client'

/**
 * Capa editorial (M6.5) — a home do admin como capa de revista do estado
 * REAL do workspace. Zero dado mockado: tudo vem de /tables/,
 * /api/publications/me/versions e /api/database-groups, com degradação
 * por bloco quando uma fonte falha (stat vira "—", a capa não explode).
 * Master é redirecionado pro painel dele (decisão do rebate 2026-06-11).
 * Plano: planning/milestone_6_5_dashboard_editorial.md
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthContext'
import { Button, Eyebrow, Hairline, MMonogram, Pill, Skeleton, Stat } from '@/components/ui'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type TableMeta = {
  id: number
  name: string
  is_public: boolean
  group_id: number | null
  created_at: string
  meta?: { row_count: number; column_count: number; relation_count: number }
}

type VersionLite = {
  id: number
  version_number: number
  created_at: string
  is_active: boolean
  description: string | null
}

type GroupLite = { id: number; name: string }

// created_at vem como UTC "naive" do backend — normaliza antes de formatar.
function fmtDate(iso: string): string {
  const norm = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
  const d = new Date(norm)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
}

export default function AdminCover() {
  const { user, token } = useAuth()
  const router = useRouter()

  const isMaster = user?.role === 'master'

  const [loading, setLoading] = useState(true)
  // null = a fonte falhou (degradação por bloco); [] = sucesso vazio.
  const [tables, setTables] = useState<TableMeta[] | null>([])
  const [versions, setVersions] = useState<VersionLite[] | null>([])
  const [groups, setGroups] = useState<GroupLite[] | null>([])
  const [copied, setCopied] = useState(false)

  // Master não tem workspace nem publicação — a capa não é dele.
  useEffect(() => {
    if (isMaster) router.replace('/admin/admins')
  }, [isMaster, router])

  useEffect(() => {
    if (!token || isMaster) return
    let alive = true
    const get = (path: string) =>
      fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => {
        if (!r.ok) throw new Error(`${path} ${r.status}`)
        return r.json()
      })

    Promise.allSettled([
      get('/tables/'),
      get('/api/publications/me/versions'),
      get('/api/database-groups'),
    ]).then(([t, v, g]) => {
      if (!alive) return
      setTables(t.status === 'fulfilled' && Array.isArray(t.value) ? t.value : null)
      setVersions(v.status === 'fulfilled' && Array.isArray(v.value) ? v.value : null)
      setGroups(g.status === 'fulfilled' && Array.isArray(g.value) ? g.value : null)
      setLoading(false)
    })
    return () => { alive = false }
  }, [token, isMaster])

  const workspaceName = user?.workspace_name ?? user?.username ?? 'Workspace'
  const slug = user?.workspace_slug ?? (user?.username ? user.username.toLowerCase() : 'workspace')

  const active = versions?.find(v => v.is_active) ?? null
  const hasPublished = (versions?.length ?? 0) > 0

  const topTables = useMemo(
    () => [...(tables ?? [])]
      .sort((a, b) => (b.meta?.row_count ?? 0) - (a.meta?.row_count ?? 0))
      .slice(0, 4),
    [tables],
  )

  const groupRows = useMemo(() => {
    if (!groups) return null
    return groups.map(g => ({
      ...g,
      count: (tables ?? []).filter(t => t.group_id === g.id).length,
    }))
  }, [groups, tables])

  // H1 em 2 linhas: última palavra em accent (gramática do handoff).
  const nameWords = workspaceName.trim().split(/\s+/)
  const namePlain = nameWords.length > 1 ? nameWords.slice(0, -1).join(' ') : ''
  const nameAccent = nameWords[nameWords.length - 1]

  if (isMaster) return null

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${slug}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard indisponível — sem feedback */ }
  }

  const dash = <span style={{ opacity: 0.5 }}>—</span>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--fg-primary)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 0 80px' }}>

        {/* ─── Header fora do papel ─── */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, marginBottom: 28, flexWrap: 'wrap' }}>
          <div>
            <Eyebrow accent style={{ marginBottom: 10 }}>Capa · /{slug}</Eyebrow>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, margin: 0, lineHeight: 1.1 }}>
              Estado da edição
            </h1>
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--fg-secondary)', margin: '6px 0 0' }}>
              O que {workspaceName} tem publicado — e o que mudou desde então.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              variant="ghost"
              disabled={!hasPublished}
              title={hasPublished ? `Abrir /${slug} em nova aba` : 'Publique uma edição primeiro'}
              onClick={() => window.open(`/${slug}`, '_blank', 'noopener')}
            >
              Pré-visualizar
            </Button>
            <Button
              variant="secondary"
              disabled={!hasPublished}
              icon="copy"
              title={hasPublished ? 'Copiar o link público' : 'Publique uma edição primeiro'}
              onClick={copyLink}
            >
              {copied ? 'copiado ✓' : 'Copiar link'}
            </Button>
            <Button variant="primary" onClick={() => router.push('/admin/publish')}>
              Publicar
            </Button>
          </div>
        </header>

        {/* ─── O papel ─── */}
        <div
          className="cover-paper paper-texture"
          style={{
            background: 'var(--raw-parchment)',
            border: '1px solid var(--rule)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {loading ? (
            <CoverSkeleton />
          ) : (
            <>
              {/* Masthead */}
              <div style={{ padding: '44px 56px 32px', borderBottom: '2px solid var(--fg-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
                  <Eyebrow accent>
                    {versions === null
                      ? 'edição — · indisponível'
                      : active
                        ? `Edição nº ${String(active.version_number).padStart(2, '0')} · ${fmtDate(active.created_at)}`
                        : hasPublished
                          ? 'nenhuma edição no ar'
                          : 'rascunho · não publicado'}
                  </Eyebrow>
                  <span style={{ ...mono, color: 'var(--fg-muted)' }}>
                    /{slug} · {active ? 'edição vigente' : hasPublished ? 'fora do ar' : 'rascunho'}
                  </span>
                </div>
                <h1
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontWeight: 400,
                    fontSize: 'clamp(40px, 6.5vw, 84px)',
                    lineHeight: 0.95,
                    margin: 0,
                    letterSpacing: '-0.025em',
                    color: 'var(--fg-primary)',
                    fontVariationSettings: '"opsz" 144',
                    overflowWrap: 'break-word',
                  }}
                >
                  {namePlain && <>{namePlain}<br /></>}
                  <span style={{ color: 'var(--accent-text)' }}>{nameAccent}.</span>
                </h1>
              </div>

              {/* Grid principal */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)' }}>
                {/* I · Tabelas em destaque */}
                <div style={{ padding: '32px 56px', borderRight: '1px solid var(--rule-faint)' }}>
                  <Eyebrow style={{ marginBottom: 14 }}>I · Tabelas em destaque</Eyebrow>

                  {tables === null && (
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
                      Não consegui carregar as tabelas agora — os números abaixo podem estar incompletos.
                    </p>
                  )}

                  {tables !== null && topTables.length === 0 && (
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--fg-secondary)', fontStyle: 'italic', margin: '12px 0 0' }}>
                      Edição zero: nenhuma tabela ainda.{' '}
                      <Link href="/admin/tables/create" style={{ color: 'var(--accent-text)' }}>
                        Criar a primeira →
                      </Link>
                    </p>
                  )}

                  {topTables.map((t, i) => (
                    <Link key={t.id} href={`/admin/data/${encodeURIComponent(t.name)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <article
                        style={{
                          padding: '20px 0',
                          borderTop: i === 0 ? '1px solid var(--fg-primary)' : '1px solid var(--rule-faint)',
                          display: 'grid',
                          gridTemplateColumns: '60px 1fr auto',
                          gap: 20,
                          alignItems: 'baseline',
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 36, color: 'var(--accent-text)', fontVariationSettings: '"opsz" 96' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, fontWeight: 400, margin: '0 0 4px', lineHeight: 1.1, color: 'var(--fg-primary)' }}>
                            {t.name}
                          </h3>
                          <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--fg-secondary)', margin: 0, lineHeight: 1.4 }}>
                            {(t.meta?.row_count ?? 0).toLocaleString('pt-BR')} registros · {t.meta?.column_count ?? 0} colunas · criada em {fmtDate(t.created_at)}
                          </p>
                        </div>
                        {t.is_public ? <Pill tone="ok" dot>público</Pill> : <Pill tone="muted">privado</Pill>}
                      </article>
                    </Link>
                  ))}

                  {tables !== null && tables.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <Link href="/admin/tables" style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: 'var(--accent-text)', textDecoration: 'none' }}>
                        Ver todas as {tables.length} tabela{tables.length === 1 ? '' : 's'} →
                      </Link>
                    </div>
                  )}
                </div>

                {/* Aside: Em números + II · Grupos */}
                <aside style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--bg-elevated)' }}>
                  <div>
                    <Eyebrow style={{ marginBottom: 12 }}>Em números</Eyebrow>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <Stat inline value={tables === null ? dash : tables.length} label={`tabela${(tables?.length ?? 0) === 1 ? '' : 's'} · ${tables === null ? '—' : tables.filter(t => t.is_public).length} pública${(tables?.filter(t => t.is_public).length ?? 0) === 1 ? '' : 's'}`} />
                      <Stat inline value={tables === null ? dash : tables.reduce((s, t) => s + (t.meta?.row_count ?? 0), 0).toLocaleString('pt-BR')} label="registros no acervo" />
                      <Stat inline value={versions === null ? dash : versions.length} label={`ediç${(versions?.length ?? 0) === 1 ? 'ão publicada' : 'ões publicadas'}`} />
                      <Stat inline value={groups === null ? dash : groups.length} label={`grupo${(groups?.length ?? 0) === 1 ? '' : 's'} de dados`} />
                    </div>
                  </div>

                  <Hairline strong />

                  <div>
                    <Eyebrow style={{ marginBottom: 12 }}>II · Grupos</Eyebrow>
                    {groupRows === null && (
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontStyle: 'italic', color: 'var(--fg-muted)' }}>indisponível agora</span>
                    )}
                    {groupRows !== null && groupRows.length === 0 && (
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontStyle: 'italic', color: 'var(--fg-muted)' }}>nenhum grupo ainda</span>
                    )}
                    {groupRows !== null && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {groupRows.map((g, i) => (
                          <div
                            key={g.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                              padding: '8px 0',
                              borderBottom: i < groupRows.length - 1 ? '1px dotted var(--rule)' : 'none',
                            }}
                          >
                            <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16, color: 'var(--fg-primary)' }}>{g.name}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>{g.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </aside>
              </div>

              {/* III · Edições publicadas */}
              <div style={{ padding: '32px 56px', borderTop: '2px solid var(--fg-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
                  <Eyebrow>III · Edições publicadas</Eyebrow>
                  <span style={{ ...mono, color: 'var(--fg-muted)' }}>
                    {versions === null ? '—' : `${versions.length} ediç${versions.length === 1 ? 'ão' : 'ões'}`}
                  </span>
                </div>

                {versions === null && (
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontStyle: 'italic', color: 'var(--fg-muted)', margin: 0 }}>
                    Histórico indisponível agora.
                  </p>
                )}

                {versions !== null && !hasPublished && (
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontStyle: 'italic', color: 'var(--fg-secondary)', margin: 0 }}>
                    Nenhuma edição publicada ainda.{' '}
                    <Link href="/admin/publish" style={{ color: 'var(--accent-text)' }}>
                      Publicar a primeira →
                    </Link>
                  </p>
                )}

                {versions !== null && hasPublished && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
                    {versions.slice(0, 3).map(v => (
                      <div key={v.id} style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-text)', letterSpacing: '0.18em', marginBottom: 8 }}>
                          v{v.version_number} · {fmtDate(v.created_at)}
                        </div>
                        <h4 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, fontWeight: 400, margin: '0 0 6px', lineHeight: 1.15, color: 'var(--fg-primary)' }}>
                          {v.description || 'sem rótulo'}
                        </h4>
                        {v.is_active && <Pill tone="ok" dot>no ar</Pill>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Colofão */}
              <div
                style={{
                  padding: '20px 56px',
                  background: 'var(--raw-cover-ink)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ ...mono, color: 'var(--raw-parchment)', opacity: 0.7 }}>
                  publicado por atlas · {workspaceName}
                </span>
                <MMonogram size={20} color="var(--accent)" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Skeleton que preserva o layout da capa (masthead + grid + faixa). */
function CoverSkeleton() {
  return (
    <div aria-busy>
      <div style={{ padding: '44px 56px 32px', borderBottom: '2px solid var(--rule)' }}>
        <Skeleton width={260} height={12} style={{ marginBottom: 28 }} />
        <Skeleton width="55%" height={76} variant="block" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)' }}>
        <div style={{ padding: '32px 56px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Skeleton width={160} height={10} />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={56} variant="block" />)}
        </div>
        <aside style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Skeleton width={120} height={10} />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} width="80%" height={30} />)}
        </aside>
      </div>
      <div style={{ padding: '32px 56px', borderTop: '2px solid var(--rule)' }}>
        <Skeleton width={200} height={10} style={{ marginBottom: 18 }} />
        <Skeleton height={64} variant="block" />
      </div>
    </div>
  )
}
