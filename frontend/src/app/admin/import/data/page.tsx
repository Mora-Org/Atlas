'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthContext'
import { Button, Card, Eyebrow, Field, Hairline, Icon, Input, Pill, SectionNum, Select, Toggle } from '@/components/ui'
import { DATA_TYPES, TYPE_META, fromBackendDataType, toBackendDataType, type DataType } from '@/lib/columnTypes'

type Step = 'upload' | 'preview' | 'done'
type Mode = 'append' | 'create'

type Result = {
  inserted_rows?: number
  total_rows?: number
  matched_columns?: string[]
  created?: boolean
  table?: string
  errors?: string[]
}
type TableMeta = { id: number; name: string; columns?: { name: string }[] }

// dry-run shapes
type AppendCol = { original_header: string; match: 'matched' | 'unmatched'; target_type: string | null; sample_values: string[] }
type CreateCol = { original_header: string; name: string; data_type: string; is_nullable: boolean; note: string; sample_values: string[] }
type DryRun = {
  mode: Mode
  table_name: string
  name_status?: 'ok' | 'reserved' | 'conflict'
  summary: { rows: number; columns: number }
  columns: (AppendCol | CreateCol)[]
  system_columns?: string[]
  target_columns?: string[]
  sample_rows: Record<string, unknown>[]
}
// linha editável do editor de schema (create)
type SchemaRow = { original_header: string; name: string; data_type: DataType; is_nullable: boolean; note: string; sample_values: string[]; dropped: boolean }

export default function ImportDataPage() {
  const { token } = useAuth()
  const [tables, setTables] = useState<TableMeta[]>([])
  const [mode, setMode] = useState<Mode>('append')
  const [selectedTable, setSelectedTable] = useState('')
  const [tableName, setTableName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dry, setDry] = useState<DryRun | null>(null)
  const [schema, setSchema] = useState<SchemaRow[]>([])
  const [result, setResult] = useState<Result | null>(null)

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    fetch(`${API}/tables/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d) => setTables(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [API, token])

  const canProceed = !!file && (mode === 'append' ? !!selectedTable : true)

  // dry-run no servidor (fonte única: parse + infer + sanitize)
  const runDryRun = async () => {
    if (!canProceed || !file) return
    setLoading(true); setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', mode)
    if (mode === 'append') fd.append('table_name', selectedTable)
    else if (tableName) fd.append('table_name', tableName)
    try {
      const res = await fetch(`${API}/api/import/table/dry-run`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Falha no preview'); return }
      setDry(data)
      if (mode === 'create') {
        setSchema((data.columns as CreateCol[]).map(c => ({
          original_header: c.original_header, name: c.name,
          data_type: fromBackendDataType(c.data_type), is_nullable: c.is_nullable,
          note: c.note, sample_values: c.sample_values, dropped: false,
        })))
        setTableName(data.table_name)
      }
      setStep('preview')
    } catch (e) {
      setError((e as Error).message)
    } finally { setLoading(false) }
  }

  // commit do append: endpoint EXISTENTE, intocado
  const commitAppend = async () => {
    if (!file || !selectedTable) return
    setLoading(true)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch(`${API}/api/import/data/${selectedTable}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
      setResult(await res.json()); setStep('done')
    } catch (e) {
      setResult({ errors: [(e as Error).message] }); setStep('done')
    } finally { setLoading(false) }
  }

  // commit do create: cria a tabela + carrega as linhas
  const commitCreate = async () => {
    if (!file || !tableName) return
    setLoading(true)
    const cols = schema.filter(c => !c.dropped).map(c => ({
      original_header: c.original_header, name: c.name,
      data_type: toBackendDataType(c.data_type), is_nullable: c.is_nullable,
    }))
    const fd = new FormData()
    fd.append('file', file); fd.append('table_name', tableName); fd.append('columns', JSON.stringify(cols))
    try {
      const res = await fetch(`${API}/api/import/table/commit`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
      const data = await res.json()
      setResult(res.ok ? data : { errors: [data.detail || 'Falha ao criar tabela'] })
      setStep('done')
    } catch (e) {
      setResult({ errors: [(e as Error).message] }); setStep('done')
    } finally { setLoading(false) }
  }

  const patchRow = (i: number, patch: Partial<SchemaRow>) =>
    setSchema(s => s.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const reset = () => {
    setFile(null); setSelectedTable(''); setTableName(''); setDry(null)
    setSchema([]); setResult(null); setError(null); setStep('upload')
  }

  const keptCount = schema.filter(c => !c.dropped).length

  return (
    <div style={{ maxWidth: 900 }}>
      <header style={{ marginBottom: 28 }}>
        <Eyebrow num="5b">Importar planilha</Eyebrow>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 400, letterSpacing: '-0.02em', marginTop: 12, fontStyle: 'italic' }}>
          A partir de uma planilha
        </h1>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', color: 'var(--fg-secondary)', maxWidth: 640, marginTop: 12, lineHeight: 1.5 }}>
          Excel ou CSV. Atlas infere os tipos e mostra o mapa antes de gravar — criando uma tabela nova ou anexando numa existente.
        </p>
      </header>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        {(['upload', 'preview', 'done'] as Step[]).map((s, i) => {
          const active = step === s
          const done = (['upload', 'preview', 'done'] as Step[]).indexOf(step) > i
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-full)',
                background: active ? 'var(--accent)' : done ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                color: active ? 'var(--fg-inverse)' : done ? 'var(--accent-text)' : 'var(--fg-muted)',
                border: '1px solid var(--rule)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
              }}>
                <SectionNum style={{ color: 'inherit' }}>{`0${i + 1}`}</SectionNum>
                {s === 'upload' ? 'origem' : s === 'preview' ? 'mapa' : 'resultado'}
              </div>
              {i < 2 && <Icon name="chevron_right" size={14} color="var(--fg-muted)" />}
            </div>
          )
        })}
      </div>

      <Hairline strong my={4} />

      {error && (
        <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)', padding: 12, background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}

      {/* STEP 1 — origem */}
      {step === 'upload' && (
        <div style={{ marginTop: 24 }}>
          {/* toggle de modo */}
          <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', borderRadius: 'var(--radius-full)', overflow: 'hidden', marginBottom: 20 }}>
            {(['append', 'create'] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(null) }}
                style={{
                  padding: '8px 18px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
                  background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? 'var(--fg-inverse)' : 'var(--fg-muted)',
                  border: 'none', cursor: 'pointer',
                }}>
                {m === 'append' ? 'anexar em existente' : 'criar tabela nova'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Card>
              <Eyebrow style={{ marginBottom: 12 }}>{mode === 'append' ? 'Tabela destino' : 'Nova tabela'}</Eyebrow>
              {mode === 'append' ? (
                <>
                  <Field label="Onde gravar">
                    <Select value={selectedTable} onChange={e => setSelectedTable(e.target.value)}>
                      <option value="">— escolha uma tabela —</option>
                      {tables.map(t => (<option key={t.id} value={t.name}>{t.name}</option>))}
                    </Select>
                  </Field>
                  <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13, color: 'var(--fg-muted)', marginTop: 12 }}>
                    As colunas da planilha são casadas pelo nome com as colunas existentes.
                  </p>
                </>
              ) : (
                <>
                  <Field label="Nome da tabela (opcional)">
                    <Input value={tableName} onChange={e => setTableName(e.target.value)} placeholder="deriva do arquivo" />
                  </Field>
                  <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13, color: 'var(--fg-muted)', marginTop: 12 }}>
                    Atlas infere os tipos das colunas; você revisa e ajusta no próximo passo.
                  </p>
                </>
              )}
            </Card>

            <Card>
              <Eyebrow style={{ marginBottom: 12 }}>Arquivo</Eyebrow>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
                onClick={() => document.getElementById('sheet-file')?.click()}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--rule)'}`, background: dragOver ? 'var(--accent-subtle)' : 'var(--bg-sunken)',
                  borderRadius: 'var(--radius-md)', padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer',
                }}>
                <Icon name="upload" size={32} color="var(--fg-muted)" />
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', textAlign: 'center' }}>
                  {file ? file.name : 'arraste · csv · xlsx'}
                </p>
                <input id="sheet-file" type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]) }} />
              </div>
            </Card>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <Button variant="primary" size="lg" icon="arrow-right" onClick={runDryRun} disabled={!canProceed || loading}>
                {loading ? 'Lendo…' : 'Próximo · ver mapa'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — mapa */}
      {step === 'preview' && dry && (
        <div style={{ marginTop: 28 }}>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {[
                ['arquivo', file?.name ?? ''],
                ['linhas', String(dry.summary.rows)],
                [mode === 'append' ? 'destino' : 'nova tabela', mode === 'append' ? selectedTable : tableName],
                ['colunas', mode === 'create' ? `${keptCount} de ${dry.summary.columns}` : String(dry.summary.columns)],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <Eyebrow style={{ marginBottom: 6 }}>{k}</Eyebrow>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>

          {mode === 'create' && dry.name_status && dry.name_status !== 'ok' && (
            <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)', padding: 12, background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)' }}>
              {dry.name_status === 'reserved' ? `Nome de tabela reservado — escolha outro.` : `Já existe uma tabela "${tableName}" — escolha outro nome.`}
            </div>
          )}

          {/* APPEND: mapa real matched/unmatched */}
          {mode === 'append' && (
            <>
              <Eyebrow style={{ marginTop: 28, marginBottom: 12 }}>Mapa de colunas</Eyebrow>
              <Card padding={false}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', padding: '10px 18px', background: 'var(--bg-sunken)', borderBottom: '1px solid var(--rule)' }}>
                  <Eyebrow style={{ fontSize: 9 }}>Cabeçalho</Eyebrow>
                  <Eyebrow style={{ fontSize: 9 }}>Amostra</Eyebrow>
                  <Eyebrow style={{ fontSize: 9 }}>Status</Eyebrow>
                </div>
                {(dry.columns as AppendCol[]).map((c) => (
                  <div key={c.original_header} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', padding: '12px 18px', borderBottom: '1px solid var(--rule-faint)', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-primary)' }}>{c.original_header}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sample_values.join(' · ')}</span>
                    <Pill tone={c.match === 'matched' ? 'ok' : 'muted'} dot={c.match === 'matched'}>{c.match === 'matched' ? 'casa' : 'ignorada'}</Pill>
                  </div>
                ))}
              </Card>
            </>
          )}

          {/* CREATE: editor de schema editável */}
          {mode === 'create' && (
            <>
              <Eyebrow style={{ marginTop: 28, marginBottom: 12 }}>Schema inferido — revise antes de criar</Eyebrow>
              <Card padding={false}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1fr 90px 40px', padding: '10px 18px', background: 'var(--bg-sunken)', borderBottom: '1px solid var(--rule)', gap: 10 }}>
                  <Eyebrow style={{ fontSize: 9 }}>Cabeçalho</Eyebrow>
                  <Eyebrow style={{ fontSize: 9 }}>Nome da coluna</Eyebrow>
                  <Eyebrow style={{ fontSize: 9 }}>Tipo</Eyebrow>
                  <Eyebrow style={{ fontSize: 9 }}>Opcional</Eyebrow>
                  <span />
                </div>
                {schema.map((c, i) => (
                  <div key={c.original_header} style={{
                    display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1fr 90px 40px', padding: '10px 18px', borderBottom: '1px solid var(--rule-faint)',
                    alignItems: 'center', gap: 10, opacity: c.dropped ? 0.4 : 1,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.original_header || <em style={{ color: 'var(--fg-muted)' }}>(vazio)</em>}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sample_values.join(' · ')}</div>
                      {c.note !== 'ok' && <Pill tone={c.note === 'reserved' || c.note === 'empty' ? 'muted' : 'accent'}>{c.note}</Pill>}
                    </div>
                    <Input value={c.name} disabled={c.dropped} onChange={e => patchRow(i, { name: e.target.value })} />
                    <Select value={c.data_type} disabled={c.dropped} onChange={e => patchRow(i, { data_type: e.target.value as DataType })}>
                      {DATA_TYPES.map(dt => (<option key={dt} value={dt}>{TYPE_META[dt].label}</option>))}
                    </Select>
                    <Toggle
                      checked={c.is_nullable}
                      disabled={c.dropped}
                      ariaLabel={`Coluna "${c.name}" aceita valor vazio`}
                      onChange={v => patchRow(i, { is_nullable: v })}
                    />
                    <button onClick={() => patchRow(i, { dropped: !c.dropped })} title={c.dropped ? 'restaurar' : 'remover'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.dropped ? 'var(--accent-text)' : 'var(--fg-muted)' }}>
                      <Icon name={c.dropped ? 'refresh' : 'trash'} size={15} color="currentColor" />
                    </button>
                  </div>
                ))}
              </Card>
              {dry.system_columns && dry.system_columns.length > 0 && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 10 }}>
                  Colunas de sistema adicionadas automaticamente: {dry.system_columns.map(s => <code key={s} style={{ marginRight: 8 }}>{s}</code>)}
                </p>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setStep('upload')}>Voltar</Button>
            {mode === 'append' ? (
              <Button variant="primary" size="lg" icon="check" disabled={loading} onClick={commitAppend}>
                {loading ? 'Importando…' : `Importar para ${selectedTable}`}
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon="check"
                disabled={loading || keptCount === 0 || !tableName || (dry.name_status && dry.name_status !== 'ok')}
                onClick={commitCreate}>
                {loading ? 'Criando…' : `Criar "${tableName}" e importar`}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3 — resultado */}
      {step === 'done' && result && (
        <div style={{ marginTop: 28 }}>
          <Card>
            <Eyebrow style={{ marginBottom: 16 }}>Resultado</Eyebrow>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <Stat label="linhas inseridas" n={String(result.inserted_rows ?? 0)} tone="ok" />
              <Stat label={result.created ? 'tabela criada' : 'colunas casadas'} n={result.created ? (result.table ?? '✓') : String(result.matched_columns?.length ?? 0)} tone="accent" />
              <Stat label="erros" n={String(result.errors?.length ?? 0)} tone={result.errors?.length ? 'err' : 'muted'} />
            </div>
            {result.errors && result.errors.length > 0 && (
              <>
                <Hairline my={20} />
                <Eyebrow style={{ marginBottom: 8 }}>Erros</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)', padding: 10, background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)' }}>{e}</div>
                  ))}
                </div>
              </>
            )}
          </Card>
          <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
            <Button variant="primary" icon="upload" onClick={reset}>Importar mais</Button>
            <Button variant="ghost" icon="table" onClick={() => location.assign('/admin/tables')}>Ir pra tabelas</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, n, tone }: { label: string; n: string; tone: 'ok' | 'accent' | 'err' | 'muted' }) {
  const colorMap: Record<string, string> = { ok: 'var(--ok)', accent: 'var(--accent-text)', err: 'var(--danger)', muted: 'var(--fg-muted)' }
  const bgMap: Record<string, string> = { ok: 'var(--ok-bg)', accent: 'var(--accent-bg)', err: 'var(--danger-bg)', muted: 'var(--bg-sunken)' }
  return (
    <div style={{ padding: 16, borderRadius: 'var(--radius-md)', background: bgMap[tone], border: '1px solid var(--rule-faint)' }}>
      <div className="numeric" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: colorMap[tone], lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--fg-muted)', marginTop: 6 }}>{label}</div>
    </div>
  )
}
