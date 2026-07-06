"use client"
import { useEffect, useState, use, useCallback, useRef } from "react"
import Link from "next/link"
import { useAuth } from "@/components/AuthContext"
import { Button, Card, Eyebrow, Hairline, Icon, Input, Pill, Select } from "@/components/ui"
import { isMediaBackendType } from "@/lib/columnTypes"
import MediaField from "@/components/media/MediaField"
import MediaPreview from "@/components/media/MediaPreview"

interface RelationInfo {
  id: number
  from_column_name: string
  to_table_name: string
  to_column_name: string
  relation_type: string
}

interface RefData { [toTableName: string]: any[] }

type ViewMode = 'dense' | 'cards'
type Density = 'compact' | 'regular' | 'loose'

const ROW_HEIGHTS: Record<Density, string> = {
  compact: '32px',
  regular: '44px',
  loose: '56px',
}

const PAGE_SIZE = 50

export default function DataViewer({ params }: { params: Promise<{ table: string }> }) {
  const { table: tableName } = use(params)
  const { token, isMaster } = useAuth()
  const [columns, setColumns] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [relations, setRelations] = useState<RelationInfo[]>([])
  const [refData, setRefData] = useState<RefData>({})
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)

  const [viewMode, setViewMode] = useState<ViewMode>('dense')
  const [density, setDensity] = useState<Density>('regular')

  const [isAdding, setIsAdding] = useState(false)
  const [newRecord, setNewRecord] = useState<any>({})

  const [editingCell, setEditingCell] = useState<{ id: number; col: string } | null>(null)
  const [editValue, setEditValue] = useState<any>('')

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  // localStorage persistence
  useEffect(() => {
    const v = localStorage.getItem(`data-view-${tableName}`) as ViewMode | null
    if (v === 'dense' || v === 'cards') setViewMode(v)
    const d = localStorage.getItem('data-density') as Density | null
    if (d === 'compact' || d === 'regular' || d === 'loose') setDensity(d)
  }, [tableName])

  const setViewModePersist = (v: ViewMode) => {
    setViewMode(v)
    localStorage.setItem(`data-view-${tableName}`, v)
  }

  // M-Ops F3: a rota autenticada agora pagina ({data,total,limit,offset}).
  // Toleramos os dois shapes (array antigo / objeto novo) por segurança.
  const load = useCallback(async (off: number, q: string) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) })
    if (q.trim()) params.set('search', q.trim())
    const res = await fetch(`${API}/api/${tableName}?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json().catch(() => ({}))
    const rows = Array.isArray(json) ? json : (json.data ?? [])
    setRecords(rows)
    setTotal(Array.isArray(json) ? rows.length : (typeof json.total === 'number' ? json.total : rows.length))
  }, [API, tableName, token])

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` }

    fetch(`${API}/tables/`, { headers })
      .then(r => r.json())
      .then(tables => {
        const tableDef = tables.find((t: any) => t.name === tableName)
        if (tableDef?.columns) setColumns(tableDef.columns)
      })
      .catch(console.error)

    setOffset(0)
    load(0, '').finally(() => setLoading(false))

    fetch(`${API}/api/relations/table/${tableName}`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(async (rels: RelationInfo[]) => {
        setRelations(rels)
        const refMap: RefData = {}
        for (const rel of rels) {
          try {
            const r = await fetch(`${API}/api/${rel.to_table_name}?limit=500`, { headers })
            if (r.ok) { const j = await r.json(); refMap[rel.to_table_name] = Array.isArray(j) ? j : (j.data ?? []) }
          } catch { /* ignore */ }
        }
        setRefData(refMap)
      })
      .catch(console.error)
  }, [tableName, token, API, load])

  // busca server-side, debounced; reseta pra primeira página (pula o mount)
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return }
    const t = setTimeout(() => { setOffset(0); load(0, search) }, 300)
    return () => clearTimeout(t)
  }, [search, load])

  const getFK = (colName: string): RelationInfo | null =>
    relations.find(r => r.from_column_name === colName) ?? null

  const isNumeric = (col: any) => col?.data_type === 'Integer' || col?.data_type === 'Float'

  const renderField = (col: any, value: any, onChange: (v: any) => void) => {
    const fk = getFK(col.name)
    if (fk) {
      const rows = refData[fk.to_table_name] ?? []
      const labelCol = rows.length > 0
        ? Object.keys(rows[0]).find(k => k !== fk.to_column_name) ?? fk.to_column_name
        : fk.to_column_name
      return (
        <Select
          value={value != null ? String(value) : ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">— escolha —</option>
          {rows.map((row: any) => (
            <option key={row[fk.to_column_name]} value={row[fk.to_column_name]}>
              {row[fk.to_column_name]} — {row[labelCol]}
            </option>
          ))}
        </Select>
      )
    }
    if (col.data_type === 'Boolean') {
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
        />
      )
    }
    if (isMediaBackendType(col.data_type)) {
      return (
        <MediaField
          value={value ?? null}
          onChange={onChange}
          mediaType={col.data_type}
          token={token}
          api={API}
          canEdit={!isMaster}
        />
      )
    }
    return (
      <Input
        type={isNumeric(col) ? 'number' : 'text'}
        value={value != null ? String(value) : ''}
        onChange={e => onChange(col.data_type === 'Integer' ? parseInt(e.target.value) : e.target.value)}
        placeholder={col.name}
      />
    )
  }

  const displayValue = (col: any, record: any) => {
    const raw = record[col.name]
    const fk = getFK(col.name)
    if (fk && raw != null) {
      const rows = refData[fk.to_table_name] ?? []
      const ref = rows.find((r: any) => r[fk.to_column_name] == raw)
      if (ref) {
        const labelCol = Object.keys(ref).find(k => k !== fk.to_column_name) ?? fk.to_column_name
        return ref[labelCol]
      }
    }
    if (isMediaBackendType(col.data_type)) {
      return (raw == null || raw === '') ? '—' : <MediaPreview url={String(raw)} mediaType={col.data_type} />
    }
    if (typeof raw === 'boolean') return raw ? 'Sim' : 'Não'
    return raw == null || raw === '' ? '—' : String(raw)
  }

  const handleSaveAdd = async () => {
    const res = await fetch(`${API}/api/${tableName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(newRecord),
    })
    if (res.ok) { setIsAdding(false); setNewRecord({}); await load(offset, search) }
  }

  const startEdit = (id: number, colName: string, current: any) => {
    setEditingCell({ id, col: colName })
    setEditValue(current ?? '')
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditValue('')
  }

  const commitEdit = async () => {
    if (!editingCell) return
    const { id, col } = editingCell
    const record = records.find(r => r.id === id)
    if (!record) return cancelEdit()
    const colDef = columns.find((c: any) => c.name === col)
    let v: any = editValue
    if (colDef?.data_type === 'Integer') v = parseInt(editValue)
    else if (colDef?.data_type === 'Float') v = parseFloat(editValue)
    const payload = { ...record, [col]: v }
    const res = await fetch(`${API}/api/${tableName}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      cancelEdit()
      await load(offset, search)
    }
  }

  // Edição de mídia em registro EXISTENTE: PUT full-record (ecoa o registro
  // inteiro com a célula trocada) — mesmo caminho do commitEdit, sem parse.
  const commitMediaEdit = async (record: any, col: string, v: string | null) => {
    const payload = { ...record, [col]: v }
    const res = await fetch(`${API}/api/${tableName}/${record.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (res.ok) await load(offset, search)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este registro?')) return
    const res = await fetch(`${API}/api/${tableName}/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) await load(offset, search)
  }

  // busca agora é server-side (param `search`); a lista renderizada é a página atual
  const filtered = records

  const rowHeight = ROW_HEIGHTS[density]
  const containerStyle = { '--row-height': rowHeight } as React.CSSProperties

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Breadcrumb + masthead */}
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
          <Link href="/admin/tables" style={{ color: 'var(--accent-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrow-left" size={11} /> Tabelas
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--fg-secondary)' }}>{tableName}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: 40,
                lineHeight: 1.05,
                margin: '0 0 10px',
                letterSpacing: '-0.02em',
                color: 'var(--fg-primary)',
              }}
            >
              {tableName}
            </h1>
            <Eyebrow style={{ fontSize: 10 }}>
              <span className="numeric">{total.toLocaleString('pt-BR')} REGISTROS · {columns.length} COLUNAS · {relations.length} RELAÇÕES</span>
            </Eyebrow>
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
                onClick={() => setViewModePersist('dense')}
                title="Denso"
                style={{
                  background: viewMode === 'dense' ? 'var(--bg-elevated)' : 'transparent',
                  color: viewMode === 'dense' ? 'var(--fg-primary)' : 'var(--fg-muted)',
                  border: 0, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                }}
              >
                <Icon name="table" size={14} />
              </button>
              <button
                onClick={() => setViewModePersist('cards')}
                title="Cartões"
                style={{
                  background: viewMode === 'cards' ? 'var(--bg-elevated)' : 'transparent',
                  color: viewMode === 'cards' ? 'var(--fg-primary)' : 'var(--fg-muted)',
                  border: 0, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                }}
              >
                <Icon name="grid" size={14} />
              </button>
            </div>
            <Button variant="primary" icon="plus" onClick={() => setIsAdding(true)}>
              Novo registro
            </Button>
          </div>
        </div>
        <Hairline strong style={{ marginTop: 18 }} />
      </header>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, maxWidth: 360 }}>
          <Input
            mono
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="buscar…"
            icon="search"
          />
        </div>
        <Button variant="ghost" size="sm" icon="refresh" onClick={() => load(offset, search)}>
          Recarregar
        </Button>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.12em' }}>
          DENSIDADE · {density.toUpperCase()}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          carregando…
        </div>
      ) : viewMode === 'dense' ? (
        <div style={containerStyle}>
          <div style={{ overflow: 'auto', border: '1px solid var(--rule-faint)', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--fg-primary)' }}>
                  <th style={headStyle('right')}>id</th>
                  {columns.map((c: any) => (
                    <th key={c.id} style={headStyle(isNumeric(c) ? 'right' : 'left')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {c.name}
                        {getFK(c.name) && <Icon name="link" size={10} color="var(--fg-muted)" />}
                      </span>
                    </th>
                  ))}
                  <th style={{ ...headStyle('right'), width: 80 }}>ações</th>
                </tr>
              </thead>
              <tbody>
                {isAdding && (
                  <tr style={{ background: 'var(--accent-subtle)' }}>
                    <td style={cellStyle('right', 'muted')}>auto</td>
                    {columns.map((c: any) => (
                      <td key={c.id} style={cellStyle()}>
                        {renderField(c, newRecord[c.name], v => setNewRecord({ ...newRecord, [c.name]: v }))}
                      </td>
                    ))}
                    <td style={cellStyle('right')}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button onClick={handleSaveAdd} title="Salvar" style={iconBtnStyle('var(--ok)')}>
                          <Icon name="check" size={14} />
                        </button>
                        <button onClick={() => { setIsAdding(false); setNewRecord({}) }} title="Cancelar" style={iconBtnStyle('var(--fg-muted)')}>
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {filtered.length === 0 && !isAdding ? (
                  <tr>
                    <td colSpan={columns.length + 2} style={{ padding: 32, textAlign: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
                      Nenhum registro {search ? 'corresponde à busca' : `em ${tableName}`}.
                    </td>
                  </tr>
                ) : (
                  filtered.map(record => (
                    <tr key={record.id} style={{ borderTop: '1px solid var(--rule-faint)' }}>
                      <td style={cellStyle('right', 'muted', true)}>{record.id}</td>
                      {columns.map((c: any) => {
                        const fk = getFK(c.name)
                        const isEditing = editingCell?.id === record.id && editingCell?.col === c.name
                        return (
                          <td
                            key={c.id}
                            style={cellStyle(isNumeric(c) ? 'right' : 'left', undefined, isNumeric(c))}
                            onDoubleClick={() => !isEditing && !isMediaBackendType(c.data_type) && startEdit(record.id, c.name, record[c.name])}
                          >
                            {isMediaBackendType(c.data_type) ? (
                              <MediaField
                                value={record[c.name] ?? null}
                                onChange={v => commitMediaEdit(record, c.name, v)}
                                mediaType={c.data_type}
                                token={token}
                                api={API}
                                canEdit={!isMaster}
                              />
                            ) : isEditing ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input
                                  autoFocus
                                  value={editValue ?? ''}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') commitEdit()
                                    if (e.key === 'Escape') cancelEdit()
                                  }}
                                  style={{
                                    flex: 1,
                                    minWidth: 60,
                                    padding: '2px 6px',
                                    background: 'var(--accent-subtle)',
                                    border: '1px solid var(--accent)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontFamily: 'var(--font-sans)',
                                    fontSize: 13,
                                    color: 'var(--fg-primary)',
                                    outline: 'none',
                                  }}
                                />
                                <button onClick={commitEdit} style={iconBtnStyle('var(--ok)')} title="Salvar">
                                  <Icon name="check" size={12} />
                                </button>
                                <button onClick={cancelEdit} style={iconBtnStyle('var(--fg-muted)')} title="Cancelar">
                                  <Icon name="close" size={12} />
                                </button>
                              </div>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'text' }}>
                                <span>{displayValue(c, record)}</span>
                                {fk && (
                                  <Pill tone="accent" style={{ fontSize: 10 }}>
                                    {fk.to_table_name}
                                  </Pill>
                                )}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td style={cellStyle('right')}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          {!isMediaBackendType(columns[0]?.data_type) && (
                            <button
                              onClick={() => startEdit(record.id, columns[0]?.name, record[columns[0]?.name])}
                              style={iconBtnStyle('var(--fg-muted)')}
                              title="Editar primeira coluna"
                            >
                              <Icon name="edit" size={13} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(record.id)} style={iconBtnStyle('var(--danger)')} title="Excluir">
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // CARDS mode
        <>
          {isAdding && (
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Eyebrow accent>novo registro</Eyebrow>
                {columns.map((c: any) => (
                  <div key={c.id}>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-muted)', marginBottom: 4 }}>
                      {c.name}
                    </label>
                    {renderField(c, newRecord[c.name], v => setNewRecord({ ...newRecord, [c.name]: v }))}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <Button variant="primary" onClick={handleSaveAdd}>Salvar</Button>
                  <Button variant="ghost" onClick={() => { setIsAdding(false); setNewRecord({}) }}>Cancelar</Button>
                </div>
              </div>
            </Card>
          )}

          {filtered.length === 0 && !isAdding ? (
            <Card>
              <p style={{ textAlign: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-display)', fontStyle: 'italic', margin: 0, padding: 24 }}>
                Nenhum registro em {tableName}.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
              {filtered.map(record => {
                const titleCol = columns.find((c: any) => !isMediaBackendType(c.data_type)) ?? columns[0]
                const otherCols = columns.filter((c: any) => c.id !== titleCol?.id)
                return (
                  <Card key={record.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Eyebrow style={{ fontSize: 9 }}>id · {String(record.id).padStart(3, '0')}</Eyebrow>
                      <button onClick={() => handleDelete(record.id)} style={iconBtnStyle('var(--danger)')} title="Excluir">
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                    {titleCol && (
                      <h3
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          fontSize: 22,
                          fontWeight: 400,
                          margin: '0 0 12px',
                          lineHeight: 1.15,
                          letterSpacing: '-0.005em',
                        }}
                      >
                        {displayValue(titleCol, record)}
                      </h3>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {otherCols.map((c: any) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
                            {c.name}
                          </span>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-primary)', textAlign: 'right' }}>
                            {isMediaBackendType(c.data_type) ? (
                              <MediaField
                                value={record[c.name] ?? null}
                                onChange={v => commitMediaEdit(record, c.name, v)}
                                mediaType={c.data_type}
                                token={token}
                                api={API}
                                canEdit={!isMaster}
                              />
                            ) : (
                              <>
                                {displayValue(c, record)}
                                {getFK(c.name) && (
                                  <Pill tone="accent" style={{ marginLeft: 6, fontSize: 9 }}>
                                    {getFK(c.name)?.to_table_name}
                                  </Pill>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* paginação (M-Ops F3): só aparece quando passa de uma página */}
      {!loading && total > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
          <span className="numeric">{total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total.toLocaleString('pt-BR')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" icon="arrow-left" disabled={offset === 0}
              onClick={() => { const o = Math.max(0, offset - PAGE_SIZE); setOffset(o); load(o, search) }}>
              Anterior
            </Button>
            <Button variant="ghost" size="sm" disabled={offset + PAGE_SIZE >= total}
              onClick={() => { const o = offset + PAGE_SIZE; setOffset(o); load(o, search) }}>
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function headStyle(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 12px',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--fg-muted)',
    fontWeight: 500,
  }
}

function cellStyle(align: 'left' | 'right' = 'left', tone?: 'muted', tabular?: boolean): React.CSSProperties {
  return {
    textAlign: align,
    padding: '0 12px',
    height: 'var(--row-height)',
    color: tone === 'muted' ? 'var(--fg-muted)' : 'var(--fg-primary)',
    verticalAlign: 'middle',
    fontVariantNumeric: tabular ? 'tabular-nums' : undefined,
    fontFamily: tone === 'muted' || tabular ? 'var(--font-mono)' : undefined,
    fontSize: tone === 'muted' || tabular ? 12 : undefined,
  }
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    color,
    display: 'inline-flex',
    alignItems: 'center',
    padding: 4,
    borderRadius: 'var(--radius-sm)',
    transition: 'background var(--duration-fast) var(--ease-editorial), color var(--duration-fast) var(--ease-editorial)',
  }
}
