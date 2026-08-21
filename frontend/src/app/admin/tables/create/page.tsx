'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthContext'
import { Button, Card, Eyebrow, Field, Hairline, Icon, Input, Pill, SectionNum, Select, Textarea, Toggle } from '@/components/ui'
import { type DataType, TYPE_META, toBackendDataType } from '@/lib/columnTypes'

interface ColumnDef {
  id: number
  name: string
  data_type: DataType
  is_primary: boolean
  is_nullable: boolean
  is_unique: boolean
  is_fk: boolean
  fk_table: string
  fk_column: string
}

interface ExistingTable {
  id: number
  name: string
  columns?: { name: string; data_type?: string }[]
}

export default function SchemaEditorPage() {
  const { token } = useAuth()
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [columns, setColumns] = useState<ColumnDef[]>([
    { id: 1, name: 'id', data_type: 'integer', is_primary: true, is_nullable: false, is_unique: true, is_fk: false, fk_table: '', fk_column: '' },
    { id: 2, name: 'title', data_type: 'string', is_primary: false, is_nullable: false, is_unique: false, is_fk: false, fk_table: '', fk_column: '' },
  ])
  const [selectedId, setSelectedId] = useState<number>(2)
  const [available, setAvailable] = useState<ExistingTable[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    fetch(`${API}/tables/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d) => setAvailable(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [API, token])

  const selected = columns.find(c => c.id === selectedId) || null

  const addColumn = () => {
    const nid = columns.length ? Math.max(...columns.map(c => c.id)) + 1 : 1
    setColumns([...columns, {
      id: nid, name: 'nova_coluna', data_type: 'string',
      is_primary: false, is_nullable: true, is_unique: false,
      is_fk: false, fk_table: '', fk_column: '',
    }])
    setSelectedId(nid)
  }

  const removeColumn = (id: number) => {
    setColumns(cs => cs.filter(c => c.id !== id))
    if (selectedId === id && columns.length > 1) setSelectedId(columns[0].id)
  }

  const updateColumn = (id: number, patch: Partial<ColumnDef>) => {
    setColumns(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  const handleSave = async () => {
    if (!name.trim()) return setErr('Dê um nome à tabela.')
    setErr(''); setSubmitting(true)
    try {
      const payload = {
        name: name.toLowerCase().replace(/\s+/g, '_'),
        description,
        columns: columns.map(c => ({
          name: c.name.toLowerCase().replace(/\s+/g, '_'),
          data_type: toBackendDataType(c.data_type),
          is_primary: c.is_primary,
          is_nullable: c.is_nullable,
          is_unique: c.is_unique,
        })),
      }
      const res = await fetch(`${API}/tables/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || 'Falha ao criar tabela.')
      }
      const created = await res.json().catch(() => null)

      // B16: este loop mandava from_table_name/to_table_name sem `name` — o
      // backend espera ids (RelationCreate) e respondia 422, engolido pelo
      // .catch. Nenhuma relação nasceu por aqui até a 1.1. Falha agora é
      // VISÍVEL: a tabela já existe, então não redireciona escondendo o erro.
      const errosRel: string[] = []
      for (const c of columns) {
        if (!c.is_fk || !c.fk_table || !c.fk_column) continue
        const alvo = available.find(t => t.name === c.fk_table)
        const fromCol = c.name.toLowerCase().replace(/\s+/g, '_')
        if (!created?.id || !alvo) {
          errosRel.push(`${fromCol} → ${c.fk_table}.${c.fk_column}`)
          continue
        }
        try {
          const r = await fetch(`${API}/api/relations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              name: `rel_${payload.name}_${fromCol}__${c.fk_table}_${c.fk_column}`.slice(0, 100),
              from_table_id: created.id,
              to_table_id: alvo.id,
              relation_type: 'many-to-one',
              from_column_name: fromCol,
              to_column_name: c.fk_column,
            }),
          })
          if (!r.ok) errosRel.push(`${fromCol} → ${c.fk_table}.${c.fk_column}`)
        } catch {
          errosRel.push(`${fromCol} → ${c.fk_table}.${c.fk_column}`)
        }
      }
      if (errosRel.length) {
        setErr(`Tabela criada, mas ${errosRel.length} relação(ões) falharam: ${errosRel.join(', ')}. Declare-as no editor da tabela.`)
        return
      }

      router.push('/admin/tables')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // Generate SQL preview
  const sqlPreview = `CREATE TABLE ${name || 'sua_tabela'} (\n${columns.map(c => {
    const meta = TYPE_META[c.data_type]
    let line = `  ${c.name.padEnd(16)} ${meta.sql}`
    if (!c.is_nullable) line += ' NOT NULL'
    if (c.is_unique) line += ' UNIQUE'
    if (c.is_primary) line += ' PRIMARY KEY'
    return line
  }).join(',\n')}\n);${columns.filter(c => c.is_fk && c.fk_table).map(c =>
    `\n\nALTER TABLE ${name || 'sua_tabela'}\n  ADD CONSTRAINT fk_${c.name}\n  FOREIGN KEY (${c.name}) REFERENCES ${c.fk_table}(${c.fk_column});`
  ).join('')}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
          <Link href="/admin/tables" style={{ color: 'var(--accent-text)', textDecoration: 'none' }}>
            Tabelas
          </Link>
          <span>/</span>
          <span>Nova</span>
        </div>
        <Eyebrow num={3}>Editor de schema</Eyebrow>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 400,
          letterSpacing: 'var(--tracking-h1)', marginTop: 12, fontStyle: 'italic',
        }}>
          {name || 'sua nova tabela'}
        </h1>
        <p style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', color: 'var(--fg-secondary)',
          maxWidth: 640, marginTop: 12, lineHeight: 1.5,
        }}>
          Esta é a forma da tabela. Defina colunas, tipos e relações antes de povoar.
        </p>
      </header>

      <Hairline strong my={4} />

      {/* 3-col layout */}
      <div style={{
        display: 'grid', gridTemplateColumns: '320px 1fr 340px', gap: 24,
        marginTop: 24, flex: 1, alignItems: 'flex-start',
      }}>
        {/* LEFT — column list */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <Eyebrow>Colunas · {columns.length}</Eyebrow>
          </div>
          <div style={{
            border: '1px solid var(--rule)', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)', overflow: 'hidden',
          }}>
            {columns.map((c, i) => {
              const active = selectedId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                    background: active ? 'var(--accent-subtle)' : 'transparent',
                    borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
                    borderTop: 0, borderRight: 0,
                    borderBottom: i < columns.length - 1 ? '1px solid var(--rule-faint)' : 0,
                  }}
                >
                  <SectionNum>{String(i + 1).padStart(2, '0')}</SectionNum>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 13,
                      color: 'var(--fg-primary)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.name || '—'}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 12,
                      color: 'var(--fg-muted)', marginTop: 2,
                    }}>
                      {TYPE_META[c.data_type].label}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                    {c.is_primary && <Pill tone="accent">PK</Pill>}
                    {c.is_unique && !c.is_primary && <Pill tone="muted">UNIQ</Pill>}
                    {c.is_fk && <Pill tone="warn" dot>FK</Pill>}
                    {c.is_nullable && <Pill tone="muted">NULL</Pill>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeColumn(c.id) }}
                    style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--fg-muted)', padding: 4, display: 'flex' }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </button>
              )
            })}
          </div>

          <Button variant="ghost" size="sm" icon="plus" onClick={addColumn} style={{ marginTop: 12 }}>
            Adicionar coluna
          </Button>
        </div>

        {/* CENTER — table form + SQL preview */}
        <div>
          <Card>
            <Eyebrow style={{ marginBottom: 14 }}>Sobre a tabela</Eyebrow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
              <Field label="Nome da tabela (snake_case)">
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="ex.: produtos, eventos" mono />
              </Field>
              <Field label="Descrição (opcional)">
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Pra que serve esta tabela?" />
              </Field>
            </div>
          </Card>

          <div style={{ marginTop: 24 }}>
            <Eyebrow accent style={{ marginBottom: 10 }}>SQL gerado · preview</Eyebrow>
            <Card style={{ background: 'var(--bg-sunken)', borderLeft: '3px solid var(--accent)' }}>
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7,
                color: 'var(--fg-secondary)', margin: 0, whiteSpace: 'pre-wrap',
              }}>
                {sqlPreview}
              </pre>
            </Card>
          </div>

          {err && (
            <div style={{
              marginTop: 16, padding: 14, background: 'var(--danger-bg)',
              border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
              borderRadius: 'var(--radius-md)', color: 'var(--danger)',
              fontFamily: 'var(--font-mono)', fontSize: 12,
            }}>
              {err}
            </div>
          )}
        </div>

        {/* RIGHT — inspector */}
        <div>
          <Eyebrow style={{ marginBottom: 12 }}>Inspetor</Eyebrow>
          {selected ? (
            <Card>
              <SectionNum>{`#${selected.id}`}</SectionNum>
              <h3 style={{
                fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 400,
                margin: '6px 0 16px', fontStyle: 'italic',
              }}>
                {selected.name || '—'}
              </h3>

              <Field label="Nome">
                <Input value={selected.name} mono onChange={e => updateColumn(selected.id, { name: e.target.value })} />
              </Field>

              <div style={{ marginTop: 14 }}>
                <Field label="Tipo">
                  <Select value={selected.data_type} onChange={e => updateColumn(selected.id, { data_type: e.target.value as DataType })}>
                    {(Object.keys(TYPE_META) as DataType[]).map(k => (
                      <option key={k} value={k}>{TYPE_META[k].label} ({k})</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Hairline my={18} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Toggle label="Chave primária" hint="identifica o registro"
                  checked={selected.is_primary}
                  onChange={() => updateColumn(selected.id, { is_primary: !selected.is_primary })} />
                <Toggle label="Aceita nulo" hint="pode ficar vazio"
                  checked={selected.is_nullable}
                  onChange={() => updateColumn(selected.id, { is_nullable: !selected.is_nullable })} />
                <Toggle label="Único" hint="sem duplicatas"
                  checked={selected.is_unique}
                  onChange={() => updateColumn(selected.id, { is_unique: !selected.is_unique })} />
                <Toggle label="Foreign key" hint="aponta pra outra tabela"
                  checked={selected.is_fk}
                  onChange={() => updateColumn(selected.id, { is_fk: !selected.is_fk })} />
              </div>

              {selected.is_fk && (
                <>
                  <Hairline my={18} />
                  <Eyebrow accent style={{ marginBottom: 10 }}>Referência</Eyebrow>
                  <Field label="Tabela alvo">
                    <Select value={selected.fk_table} onChange={e => updateColumn(selected.id, { fk_table: e.target.value, fk_column: '' })}>
                      <option value="">— escolha —</option>
                      {available.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </Select>
                  </Field>
                  {selected.fk_table && (
                    <div style={{ marginTop: 14 }}>
                      <Field label="Coluna alvo">
                        <Select value={selected.fk_column} onChange={e => updateColumn(selected.id, { fk_column: e.target.value })}>
                          <option value="">— escolha —</option>
                          {available.find(t => t.name === selected.fk_table)?.columns?.map(c => (
                            <option key={c.name} value={c.name}>{c.name} ({c.data_type})</option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  )}
                </>
              )}
            </Card>
          ) : (
            <Card>
              <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--fg-muted)' }}>
                Selecione uma coluna na lista para editar suas propriedades.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--rule)',
        display: 'flex', gap: 8, justifyContent: 'flex-end',
      }}>
        <Button variant="ghost" onClick={() => router.push('/admin/tables')}>Cancelar</Button>
        <Button variant="primary" size="lg" icon="save" onClick={handleSave} disabled={submitting}>
          {submitting ? 'Criando…' : 'Criar tabela'}
        </Button>
      </div>
    </div>
  )
}
