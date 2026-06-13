'use client'
/**
 * M7 — /admin/schema: o "painelzão" ER read-only.
 * Plano: planning/milestone_7_visualizer_plano.md
 *
 * 1 fetch (GET /tables/) + relações agregadas (GET /api/relations/, PR2b),
 * ambos workspace-scoped pelo backend: admin vê o próprio workspace,
 * moderator só as tabelas dos seus grupos (FK pra fora vira nó fantasma +
 * contador discreto, decisão 3), master vê tudo com dropdown por workspace
 * (decisão 2). Estados difíceis primeiro: loading / erro / vazio / só órfãs.
 *
 * PR3: seleção com painel de detalhe lateral (borderLeft accent, padrão
 * do handoff), busca com dim + centrar, drag persistido por workspace.
 * Edição continua em /admin/tables/create — read-only aqui.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthContext'
import { useTweaks } from '@/contexts/TweaksContext'
import { Button, Eyebrow, Hairline, Icon, Input, MMonogram, Pill, Select, Skeleton } from '@/components/ui'
import {
  buildSchemaGraph,
  neighborsOf,
  type SchemaGraph,
  type SchemaNode,
  type SchemaRelation,
  type SchemaTable,
} from '@/lib/schemaGraph'
import SchemaCanvas from '@/components/schema/SchemaCanvas'
import { NODE_METRICS } from '@/components/schema/layout'
import { friendlyColumnType } from '@/lib/schemaDDL'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface AdminLite {
  id: number
  username: string
  workspace_name?: string | null
}

// created_at vem como UTC "naive" do backend — normaliza antes de formatar.
function fmtDate(iso: string): string {
  const norm = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
  const d = new Date(norm)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Painel de detalhe lateral (PR3) — borderLeft accent, padrão do handoff. */
function DetailPanel({
  node,
  graph,
  onClose,
}: {
  node: SchemaNode
  graph: SchemaGraph
  onClose: () => void
}) {
  const incident = graph.edges.filter(e => e.from === node.name || e.to === node.name)
  const neighbors = neighborsOf(graph, node.name)

  return (
    <aside
      data-testid="schema-detail"
      style={{
        width: 340,
        flexShrink: 0,
        background: 'var(--bg-secondary, var(--bg-surface))',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 'var(--radius-md)',
        padding: '18px 18px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxHeight: '100%',
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Eyebrow accent style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{node.name}</Eyebrow>
        <button
          onClick={onClose}
          title="Fechar"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--fg-muted)', display: 'flex', padding: 4 }}
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      {node.ghost ? (
        <>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--fg-secondary)', margin: 0 }}>
            Tabela não encontrada — foi deletada, renomeada, ou está fora das suas permissões.
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', margin: 0 }}>
            {incident.length} {incident.length === 1 ? 'referência aponta' : 'referências apontam'} pra ela.
          </p>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Pill tone={node.table?.is_public ? 'ok' : 'muted'} dot>
              {node.table?.is_public ? 'público' : 'privado'}
            </Pill>
            {node.orphan && <Pill tone="warn">sem relações</Pill>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
              {node.table?.meta?.row_count ?? 0} registros
              {node.table?.created_at ? ` · criada em ${fmtDate(node.table.created_at)}` : ''}
            </span>
          </div>

          {node.table?.description && (
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--fg-secondary)', margin: 0 }}>
              {node.table.description}
            </p>
          )}

          <Hairline />

          <div>
            <Eyebrow style={{ fontSize: 9, marginBottom: 8 }}>
              Colunas · {node.table?.columns.length ?? 0}
            </Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {(node.table?.columns ?? []).map(c => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 0',
                    borderBottom: '1px solid var(--rule-faint)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-primary)' }}>
                    {c.name}
                  </span>
                  {c.is_primary && <Pill tone="accent">PK</Pill>}
                  {c.fk_table && <Pill tone="muted" dot>FK → {c.fk_table}</Pill>}
                  <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 11, color: 'var(--fg-muted)', marginLeft: 'auto' }}>
                    {friendlyColumnType(c)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {incident.length > 0 && (
            <div>
              <Eyebrow style={{ fontSize: 9, marginBottom: 8 }}>
                Relações · {incident.length}
              </Eyebrow>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {incident.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <span style={{ color: 'var(--fg-muted)', flexShrink: 0 }}>
                      {e.selfRef ? '↻' : e.from === node.name ? '→' : '←'}
                    </span>
                    <span style={{ color: 'var(--fg-primary)' }}>
                      {e.selfRef ? node.name : e.from === node.name ? e.to : e.from}
                    </span>
                    {e.fromColumn && <span style={{ color: 'var(--fg-muted)' }}>via {e.fromColumn}</span>}
                    <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--fg-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                      {e.logical ? 'declarada' : 'física'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', gap: 8, paddingTop: 6 }}>
            <Link href={`/admin/data/${node.name}`} style={{ textDecoration: 'none', flex: 1 }}>
              <Button variant="primary" size="sm" icon="table" style={{ width: '100%', justifyContent: 'center' }}>
                Ver dados
              </Button>
            </Link>
            <Link href="/admin/tables/create" style={{ textDecoration: 'none', flex: 1 }}>
              <Button variant="secondary" size="sm" icon="edit" style={{ width: '100%', justifyContent: 'center' }}>
                Editar schema
              </Button>
            </Link>
          </div>
        </>
      )}
    </aside>
  )
}

export default function SchemaVisualizer() {
  const { token, user, isMaster } = useAuth()
  const { density } = useTweaks()

  const [loading, setLoading] = useState(true)
  // null = fonte falhou; [] = sucesso vazio (padrão da capa, M6.5)
  const [tables, setTables] = useState<SchemaTable[] | null>([])
  // relações lógicas (PR2b): falha degrada pra [] — o mapa fica só com as físicas
  const [relations, setRelations] = useState<SchemaRelation[]>([])
  const [admins, setAdmins] = useState<AdminLite[]>([])
  const [ownerFilter, setOwnerFilter] = useState<number | 'all'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!token) return
    let alive = true
    const get = (path: string) =>
      fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => {
        if (!r.ok) throw new Error(`${path} ${r.status}`)
        return r.json()
      })

    const wants: Promise<unknown>[] = [get('/tables/'), get('/api/relations/')]
    if (isMaster) wants.push(get('/api/admins'))

    Promise.allSettled(wants).then(([t, r, a]) => {
      if (!alive) return
      setTables(t.status === 'fulfilled' && Array.isArray(t.value) ? (t.value as SchemaTable[]) : null)
      setRelations(r.status === 'fulfilled' && Array.isArray(r.value) ? (r.value as SchemaRelation[]) : [])
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

  const graph = useMemo(() => {
    // relações só entre tabelas visíveis — senão o filtro por workspace do
    // master criaria nós fantasmas dos outros tenants
    const names = new Set(visibleTables.map(t => t.name))
    const visibleRelations = relations.filter(r => names.has(r.from_table) && names.has(r.to_table))
    return buildSchemaGraph(visibleTables, visibleRelations)
  }, [visibleTables, relations])

  // seleção não sobrevive a troca de workspace/refetch que remove o nó
  useEffect(() => {
    if (selected && !graph.nodes.some(n => n.name === selected)) setSelected(null)
  }, [graph, selected])

  const metrics = NODE_METRICS[density]
  const selectedNode = selected ? graph.nodes.find(n => n.name === selected) ?? null : null

  const slug = user?.workspace_slug ?? user?.username ?? 'workspace'
  const layoutStorageKey = `mora-schema-layout:${slug}${isMaster ? `:${ownerFilter}` : ''}`

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
            {!loading && !failed && !empty && (
              <div style={{ width: 210 }}>
                <Input
                  icon="search"
                  placeholder="buscar tabela…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            )}
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
          <div style={{ flex: 1, minHeight: 540, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SchemaCanvas
                graph={graph}
                metrics={metrics}
                selected={selected}
                onSelect={setSelected}
                searchQuery={search}
                layoutStorageKey={layoutStorageKey}
                workspace={user?.workspace_name ?? user?.username ?? slug}
              />
            </div>
            {selectedNode && (
              <DetailPanel node={selectedNode} graph={graph} onClose={() => setSelected(null)} />
            )}
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
