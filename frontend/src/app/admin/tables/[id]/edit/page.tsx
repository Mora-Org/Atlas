"use client"
/**
 * Editor de schema de tabela EXISTENTE — M8 F2a.
 *
 * Liga a UI aos 3 endpoints backend-only da F0:
 *   - POST   /tables/{id}/columns            (add-column)
 *   - DELETE /tables/{id}/columns/{col_id}   (drop-column)
 *   - DELETE /tables/{id}?confirm_name=      (delete-table)
 *
 * Guards são server-enforced (admin+mod mutam; master 403). O front espelha:
 * esconde os controles de mutação pro master e trata os 400 de guard
 * (coluna de sistema/PK, relação-em-uso, drop em SQLite) surfaçando a
 * mensagem do backend. Tipos de mídia (image/file/attachment) aparecem no
 * seletor de tipo do add-column — o widget de upload/preview na célula é F2b.
 */
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthContext'
import { Button, Card, Eyebrow, Field, Hairline, Icon, Input, Pill, SectionNum, Select, Toggle } from '@/components/ui'
import { type DataType, DATA_TYPES, TYPE_META, toBackendDataType, labelForBackendType, isMediaBackendType } from '@/lib/columnTypes'

interface Column {
  id: number
  name: string
  data_type: string
  is_nullable?: boolean
  is_unique?: boolean
  is_primary?: boolean
  fk_table?: string | null
  fk_column?: string | null
}

interface TableDef {
  id: number
  name: string
  description?: string | null
  is_public?: boolean
  columns?: Column[]
}

const SYSTEM_COLS = ['id', 'tenant_id']

export default function SchemaEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const tableId = Number(id)
  const router = useRouter()
  const { token, user } = useAuth()

  // isAdmin do contexto inclui master; F0 403a master → régua própria.
  const canMutate = user?.role === 'admin' || user?.role === 'moderator'
  const isMaster = user?.role === 'master'

  const [table, setTable] = useState<TableDef | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // add-column
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<DataType>('string')
  const [newUnique, setNewUnique] = useState(false)
  const [adding, setAdding] = useState(false)

  // drop-column / delete-table
  const [droppingId, setDroppingId] = useState<number | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const loadTable = useCallback(async () => {
    try {
      const res = await fetch(`${API}/tables/`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => [])
      const t = Array.isArray(data) ? data.find((x: TableDef) => x.id === tableId) : null
      setTable(t ?? null)
    } catch {
      setTable(null)
    } finally {
      setLoading(false)
    }
  }, [API, token, tableId])

  useEffect(() => {
    if (!token) return
    loadTable()
  }, [token, loadTable])

  const columns = table?.columns ?? []
  const canDrop = (c: Column) => !c.is_primary && !SYSTEM_COLS.includes(c.name)

  const addColumn = async () => {
    const nm = newName.trim().toLowerCase().replace(/\s+/g, '_')
    if (!nm) { setErr('Dê um nome à coluna.'); return }
    setErr(''); setAdding(true)
    try {
      const res = await fetch(`${API}/tables/${tableId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: nm,
          data_type: toBackendDataType(newType),
          is_nullable: true,   // F0: coluna nova em tabela com dados precisa ser nullable
          is_unique: newUnique,
          is_primary: false,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || 'Falha ao adicionar coluna.')
      }
      setNewName(''); setNewType('string'); setNewUnique(false)
      await loadTable()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const dropColumn = async (c: Column) => {
    if (!confirm(`Remover a coluna "${c.name}"? Os dados dela são apagados — irreversível.`)) return
    setErr(''); setDroppingId(c.id)
    try {
      const res = await fetch(`${API}/tables/${tableId}/columns/${c.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || 'Falha ao remover coluna.')
      }
      await loadTable()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setDroppingId(null)
    }
  }

  const deleteTable = async () => {
    setErr(''); setDeleting(true)
    try {
      const res = await fetch(`${API}/tables/${tableId}?confirm_name=${encodeURIComponent(confirmName)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || 'Falha ao excluir tabela.')
      }
      router.push('/admin/tables')
    } catch (e) {
      setErr((e as Error).message)
      setDeleting(false)
    }
  }

  const errorBox = err && (
    <div style={{
      marginTop: 16, padding: 14, background: 'var(--danger-bg)',
      border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
      borderRadius: 'var(--radius-md)', color: 'var(--danger)',
      fontFamily: 'var(--font-mono)', fontSize: 12,
    }}>
      {err}
    </div>
  )

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
          <Link href="/admin/tables" style={{ color: 'var(--accent-text)', textDecoration: 'none' }}>Tabelas</Link>
          <span>/</span>
          <span>{table?.name ?? '…'}</span>
          <span>/</span>
          <span>Editar</span>
        </div>
        <Eyebrow num={3}>Editor de schema</Eyebrow>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 400,
          letterSpacing: 'var(--tracking-h1)', marginTop: 12, fontStyle: 'italic',
        }}>
          {table?.name ?? 'tabela'}
        </h1>
        <p style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', color: 'var(--fg-secondary)',
          maxWidth: 640, marginTop: 12, lineHeight: 1.5,
        }}>
          Mude a forma da tabela: adicione ou remova colunas, ou apague a tabela. Alterações de schema são físicas e irreversíveis.
        </p>
      </header>

      <Hairline strong my={4} />

      {loading ? (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 52, background: 'var(--bg-elevated)', border: '1px solid var(--rule-faint)', borderRadius: 'var(--radius-sm)', opacity: 0.5 }} />
          ))}
        </div>
      ) : !table ? (
        <Card style={{ marginTop: 24 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--fg-muted)' }}>
            Tabela não encontrada ou sem acesso.
          </p>
        </Card>
      ) : (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
          {isMaster && (
            <div style={{
              padding: 14, background: 'var(--bg-sunken)', border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-display)', fontStyle: 'italic',
              fontSize: 14, color: 'var(--fg-secondary)',
            }}>
              Master não edita schema — entre com uma conta admin para adicionar/remover colunas ou apagar a tabela.
            </div>
          )}

          {/* Colunas existentes */}
          <section>
            <Eyebrow style={{ marginBottom: 12 }}>Colunas · {columns.length}</Eyebrow>
            <div style={{ border: '1px solid var(--rule)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
              {columns.map((c, i) => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderBottom: i < columns.length - 1 ? '1px solid var(--rule-faint)' : 0,
                }}>
                  <SectionNum>{String(i + 1).padStart(2, '0')}</SectionNum>
                  <div style={{ flexShrink: 0, color: 'var(--fg-muted)', display: 'flex' }}>
                    <Icon name={isMediaBackendType(c.data_type) ? (c.data_type === 'image' ? 'image' : c.data_type === 'attachment' ? 'paperclip' : 'file') : 'columns'} size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                      {labelForBackendType(c.data_type)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {c.is_primary && <Pill tone="accent">PK</Pill>}
                    {c.is_unique && !c.is_primary && <Pill tone="muted">UNIQ</Pill>}
                    {c.fk_table && <Pill tone="warn" dot>FK</Pill>}
                  </div>
                  {canMutate && canDrop(c) && (
                    <button
                      onClick={() => dropColumn(c)}
                      disabled={droppingId === c.id}
                      title="Remover coluna"
                      style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--fg-muted)', padding: 4, display: 'flex', opacity: droppingId === c.id ? 0.4 : 1 }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Adicionar coluna */}
          {canMutate && (
            <section>
              <Eyebrow accent style={{ marginBottom: 12 }}>Adicionar coluna</Eyebrow>
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Nome (snake_case)">
                    <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ex.: foto, anexo, preco" mono />
                  </Field>
                  <Field label="Tipo">
                    <Select value={newType} onChange={e => setNewType(e.target.value as DataType)}>
                      {DATA_TYPES.map(k => (
                        <option key={k} value={k}>{TYPE_META[k].label} ({k})</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Hairline my={16} />
                <Toggle
                  label="Único"
                  hint="sem valores duplicados nesta coluna"
                  checked={newUnique}
                  onChange={() => setNewUnique(v => !v)}
                />
                <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 12, color: 'var(--fg-muted)', marginTop: 14 }}>
                  {TYPE_META[newType].media
                    ? 'Coluna de mídia: guarda o arquivo enviado pela grade de dados (upload chega na grade). Nasce opcional.'
                    : 'Colunas novas nascem opcionais (aceitam nulo) — o banco não tem como preencher registros já existentes.'}
                </p>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="primary" icon="plus" onClick={addColumn} disabled={adding}>
                    {adding ? 'Adicionando…' : 'Adicionar coluna'}
                  </Button>
                </div>
              </Card>
            </section>
          )}

          {errorBox}

          {/* Zona de perigo */}
          {canMutate && (
            <section>
              <Eyebrow style={{ marginBottom: 12, color: 'var(--danger)' }}>Zona de perigo</Eyebrow>
              <Card style={{ borderColor: 'color-mix(in srgb, var(--danger) 30%, var(--rule))' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 400, fontStyle: 'italic', margin: '0 0 8px' }}>
                  Apagar esta tabela
                </h3>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--fg-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                  Remove a tabela, todas as colunas, relações e registros. Não há como desfazer. Digite <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-primary)' }}>{table.name}</strong> para confirmar.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Nome da tabela">
                      <Input value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder={table.name} mono />
                    </Field>
                  </div>
                  <Button
                    variant="ghost"
                    icon="trash"
                    onClick={deleteTable}
                    disabled={deleting || confirmName !== table.name}
                    style={{ color: 'var(--danger)' }}
                  >
                    {deleting ? 'Excluindo…' : 'Excluir tabela'}
                  </Button>
                </div>
              </Card>
            </section>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', justifyContent: 'flex-start' }}>
        <Button variant="ghost" icon="arrow-left" onClick={() => router.push('/admin/tables')}>
          Voltar às tabelas
        </Button>
      </div>
    </div>
  )
}
