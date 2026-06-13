'use client'
/**
 * M7 — /admin/schema: o "painelzão" ER read-only.
 * Plano: planning/milestone_7_visualizer_plano.md
 *
 * 1 fetch (GET /tables/) já workspace-scoped pelo backend
 * (get_accessible_tables): admin vê o próprio workspace, moderator só as
 * tabelas dos seus grupos (FK pra fora vira nó fantasma + contador
 * discreto, decisão 3), master vê tudo com dropdown por workspace
 * (decisão 2). Estados difíceis primeiro: loading / erro / vazio /
 * só órfãs. Edição continua em /admin/tables/create — read-only aqui.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthContext'
import { useTweaks } from '@/contexts/TweaksContext'
import { Button, Eyebrow, MMonogram, Select, Skeleton } from '@/components/ui'
import { buildSchemaGraph, type SchemaTable } from '@/lib/schemaGraph'
import SchemaCanvas from '@/components/schema/SchemaCanvas'
import { NODE_METRICS } from '@/components/schema/layout'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface AdminLite {
  id: number
  username: string
  workspace_name?: string | null
}

export default function SchemaVisualizer() {
  const { token, user, isMaster } = useAuth()
  const { density } = useTweaks()

  const [loading, setLoading] = useState(true)
  // null = fonte falhou; [] = sucesso vazio (padrão da capa, M6.5)
  const [tables, setTables] = useState<SchemaTable[] | null>([])
  const [admins, setAdmins] = useState<AdminLite[]>([])
  const [ownerFilter, setOwnerFilter] = useState<number | 'all'>('all')

  useEffect(() => {
    if (!token) return
    let alive = true
    const get = (path: string) =>
      fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => {
        if (!r.ok) throw new Error(`${path} ${r.status}`)
        return r.json()
      })

    const wants: Promise<unknown>[] = [get('/tables/')]
    if (isMaster) wants.push(get('/api/admins'))

    Promise.allSettled(wants).then(([t, a]) => {
      if (!alive) return
      setTables(t.status === 'fulfilled' && Array.isArray(t.value) ? (t.value as SchemaTable[]) : null)
      if (a && a.status === 'fulfilled' && Array.isArray(a.value)) setAdmins(a.value as AdminLite[])
      setLoading(false)
    })
    return () => { alive = false }
  }, [token, isMaster])

  // master: dropdown client-side por owner_id (decisão 2)
  const owners = useMemo(() => {
    if (!isMaster || !tables) return []
    const ids = [...new Set(tables.map(t => t.owner_id).filter((v): v is number => v != null))]
    return ids.map(id => ({
      id,
      label: admins.find(a => a.id === id)?.workspace_name
        ?? admins.find(a => a.id === id)?.username
        ?? `workspace #${id}`,
    }))
  }, [isMaster, tables, admins])

  const visibleTables = useMemo(() => {
    if (!tables) return []
    if (!isMaster || ownerFilter === 'all') return tables
    return tables.filter(t => t.owner_id === ownerFilter)
  }, [tables, isMaster, ownerFilter])

  const graph = useMemo(() => buildSchemaGraph(visibleTables), [visibleTables])
  const metrics = NODE_METRICS[density]

  const today = useMemo(
    () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    [],
  )

  const failed = tables === null
  const empty = !loading && !failed && visibleTables.length === 0
  const onlyOrphans = !loading && !failed && visibleTables.length > 0 && graph.edges.length === 0

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
      {/* Masthead — mesma gramática de /admin/tables */}
      <header className="paper-texture" style={{ padding: '4px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
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
                Esquema
              </h1>
              <p
                style={{
                  fontFamily: 'var(--font-serif, var(--font-display))',
                  fontStyle: 'italic',
                  fontSize: 15,
                  color: 'var(--fg-secondary)',
                  margin: '10px 0 0',
                  maxWidth: 560,
                }}
              >
                Como as tabelas deste workspace se conectam — cada relação, física ou declarada, no mesmo mapa.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginTop: 6 }}>
            {isMaster && owners.length > 0 && (
              <Select
                value={String(ownerFilter)}
                onChange={e => setOwnerFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{ minWidth: 200 }}
              >
                <option value="all">todos os workspaces</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </Select>
            )}
            {!loading && !failed && !empty && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                {visibleTables.length} {visibleTables.length === 1 ? 'tabela' : 'tabelas'} · {graph.edges.length} {graph.edges.length === 1 ? 'relação' : 'relações'}
                {graph.ghostCount > 0 && ` · ${graph.ghostCount} fora do seu acesso`}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Estados difíceis primeiro */}
      {loading && (
        <div style={{ flex: 1, minHeight: 480 }}>
          <Skeleton variant="block" height="100%" style={{ minHeight: 480 }} />
        </div>
      )}

      {!loading && failed && (
        <div
          style={{
            flex: 1,
            minHeight: 480,
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'var(--bg-surface)',
          }}
        >
          <Eyebrow>o mapa não carregou</Eyebrow>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg-secondary)', margin: 0 }}>
            Não foi possível ler as tabelas agora.
          </p>
          <Button variant="secondary" onClick={() => location.reload()}>Tentar de novo</Button>
        </div>
      )}

      {empty && (
        <div
          style={{
            flex: 1,
            minHeight: 480,
            border: '1px dashed var(--rule)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            background: 'var(--bg-surface)',
          }}
        >
          <Eyebrow>edição zero</Eyebrow>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--fg-secondary)', margin: 0, maxWidth: 380, textAlign: 'center' }}>
            Nenhuma tabela ainda — o esquema nasce quando a primeira forma for definida.
          </p>
          <Link href="/admin/tables/create" style={{ textDecoration: 'none' }}>
            <Button>Criar a primeira tabela</Button>
          </Link>
        </div>
      )}

      {!loading && !failed && !empty && (
        <div style={{ flex: 1, minHeight: 560, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {onlyOrphans && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', margin: 0 }}>
              nenhuma relação declarada ainda — as tabelas aparecem soltas; crie FKs no editor de schema
            </p>
          )}
          <div style={{ flex: 1, minHeight: 540 }}>
            <SchemaCanvas graph={graph} metrics={metrics} />
          </div>
        </div>
      )}

      {/* assinatura discreta do rodapé, padrão das telas admin */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--fg-muted)' }}>
          {user?.workspace_name ?? user?.username ?? 'workspace'} · esquema lógico — read-only
        </span>
      </div>
    </div>
  )
}
