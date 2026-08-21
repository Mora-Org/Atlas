'use client'
import { useRef, useState, type ChangeEvent } from 'react'
import { useAuth } from '@/components/AuthContext'
import { Button, Card, Eyebrow, Hairline, Icon, Pill, SectionNum, Textarea } from '@/components/ui'

type Step = 'compose' | 'plan' | 'done'
type StmtStatus = 'ok' | 'blocked' | 'conflict' | 'warn' | 'err'

interface Statement {
  type?: string
  status: StmtStatus
  message?: string
  sql?: string
  table_name?: string
}

interface DryRun {
  summary?: { total?: number; ok?: number; blocked?: number; conflicts?: number; relations?: number }
  statements: Statement[]
}

interface CommitResult {
  created_tables?: string[]
  inserted_rows?: number
  errors?: string[]
  /** 1.2.0: FKs do arquivo viram relação declarada no catálogo. */
  relations_created?: number
  warnings?: string[]
}

const toneFor = (s: StmtStatus): 'ok' | 'warn' | 'err' | 'muted' => {
  if (s === 'ok') return 'ok'
  if (s === 'conflict' || s === 'warn') return 'warn'
  if (s === 'blocked' || s === 'err') return 'err'
  return 'muted'
}

export default function ImportSQLPage() {
  const { token } = useAuth()
  const [sql, setSql] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('compose')
  const [dry, setDry] = useState<DryRun | null>(null)
  const [committed, setCommitted] = useState<CommitResult | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setSql(await f.text())
    setFileName(f.name)
    e.target.value = ''  // permite re-escolher o mesmo arquivo
  }

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const auth = { Authorization: `Bearer ${token}` }

  const handleValidate = async () => {
    if (!sql.trim()) return
    setLoading(true)
    try {
      // The backend accepts either multipart `file` or JSON `sql_content` — try JSON first
      let res = await fetch(`${API}/api/import/sql/dry-run`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql_content: sql }),
      })
      if (!res.ok) {
        const fileFD = new FormData()
        const blob = new Blob([sql], { type: 'text/plain' })
        fileFD.append('file', blob, 'pasted.sql')
        res = await fetch(`${API}/api/import/sql/dry-run`, {
          method: 'POST', headers: auth, body: fileFD,
        })
      }
      const data: DryRun = await res.json()
      setDry(data)
      setStep('plan')
    } catch (e) {
      setDry({ statements: [{ status: 'err', message: (e as Error).message }] })
      setStep('plan')
    } finally {
      setLoading(false)
    }
  }

  const handleCommit = async () => {
    if (!sql.trim()) return
    setLoading(true)
    try {
      let res = await fetch(`${API}/api/import/sql`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql_content: sql }),
      })
      if (!res.ok) {
        const fd = new FormData()
        const blob = new Blob([sql], { type: 'text/plain' })
        fd.append('file', blob, 'pasted.sql')
        res = await fetch(`${API}/api/import/sql`, {
          method: 'POST', headers: auth, body: fd,
        })
      }
      const data: CommitResult = await res.json()
      setCommitted(data)
      setStep('done')
    } catch (e) {
      setCommitted({ errors: [(e as Error).message] })
      setStep('done')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setSql(''); setFileName(null); setDry(null); setCommitted(null); setStep('compose')
  }

  const stmts = dry?.statements ?? []
  const okCount = stmts.filter(s => s.status === 'ok').length
  const warnCount = stmts.filter(s => s.status === 'conflict' || s.status === 'warn').length
  const errCount = stmts.filter(s => s.status === 'blocked' || s.status === 'err').length

  return (
    <div style={{ maxWidth: 1080 }}>
      {/* Header */}
      <header style={{ marginBottom: 32 }}>
        <Eyebrow num="5a">Importar SQL</Eyebrow>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 400,
          letterSpacing: '-0.02em', marginTop: 12, fontStyle: 'italic',
        }}>
          A partir de SQL
        </h1>
        <p style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', color: 'var(--fg-secondary)',
          maxWidth: 640, marginTop: 12, lineHeight: 1.5,
        }}>
          Cole o conteúdo ou suba um arquivo .sql. Atlas faz dry-run antes — você decide se executa.
          Chaves estrangeiras do arquivo viram relações declaradas, e o Esquema já as desenha.
        </p>
      </header>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        {(['compose', 'plan', 'done'] as Step[]).map((s, i) => {
          const active = step === s
          const done = (['compose', 'plan', 'done'] as Step[]).indexOf(step) > i
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 'var(--radius-full)',
                background: active ? 'var(--accent)' : done ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                color: active ? 'var(--fg-inverse)' : done ? 'var(--accent-text)' : 'var(--fg-muted)',
                border: '1px solid var(--rule)',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
              }}>
                <SectionNum style={{ color: 'inherit' }}>{`0${i + 1}`}</SectionNum>
                {s === 'compose' ? 'colar' : s === 'plan' ? 'plano' : 'resultado'}
              </div>
              {i < 2 && <Icon name="chevron_right" size={14} color="var(--fg-muted)" />}
            </div>
          )
        })}
      </div>

      <Hairline strong my={4} />

      {/* STEP 1 */}
      {step === 'compose' && (
        <div style={{ marginTop: 28 }}>
          <Eyebrow style={{ marginBottom: 10 }}>cole seu SQL</Eyebrow>
          <Textarea
            value={sql}
            onChange={e => setSql(e.target.value)}
            placeholder={`-- ex.: CREATE TABLE retiros (\n--   id INTEGER PRIMARY KEY,\n--   nome VARCHAR(200) NOT NULL\n-- );`}
            rows={18}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input ref={fileRef} type="file" accept=".sql,text/plain" onChange={handleFile} style={{ display: 'none' }} />
              <Button variant="ghost" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
                Subir arquivo .sql
              </Button>
              <span className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
                {fileName ? `${fileName} · ` : ''}{sql.length} caracteres · {sql.split('\n').length} linhas
              </span>
            </div>
            <Button variant="primary" size="lg" icon="arrow-right" onClick={handleValidate}
              disabled={!sql.trim() || loading}>
              {loading ? 'Analisando…' : 'Validar dry-run'}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {step === 'plan' && dry && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dry.summary?.relations ? 4 : 3}, 1fr)`, gap: 14, marginBottom: 24 }}>
            <Stat label="vão executar" n={String(okCount)} tone="ok" />
            <Stat label="conflitos" n={String(warnCount)} tone="warn" />
            <Stat label="bloqueadas" n={String(errCount)} tone="err" />
            {!!dry.summary?.relations && (
              <Stat label="relações do arquivo" n={String(dry.summary.relations)} tone="accent" />
            )}
          </div>

          <Eyebrow style={{ marginBottom: 12 }}>plano de execução</Eyebrow>
          <Card padding={false}>
            {stmts.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 14, color: 'var(--fg-muted)' }}>
                Nenhuma operação detectada.
              </div>
            ) : stmts.map((op, i) => {
              const tone = toneFor(op.status)
              const borderC = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'err' ? 'var(--danger)' : 'var(--rule)'
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '32px 110px 1fr auto',
                  gap: 12, alignItems: 'flex-start',
                  padding: '14px 18px', borderBottom: '1px solid var(--rule-faint)',
                  borderLeft: `3px solid ${borderC}`,
                }}>
                  <SectionNum>{String(i + 1).padStart(2, '0')}</SectionNum>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-text)', letterSpacing: '0.04em' }}>
                    {op.type || op.status.toUpperCase()}
                  </code>
                  <div style={{ minWidth: 0 }}>
                    {op.table_name && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-primary)', marginBottom: 2 }}>
                        {op.table_name}
                      </div>
                    )}
                    {op.sql && (
                      <pre style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-secondary)',
                        margin: '4px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: 120, overflow: 'hidden',
                      }}>
                        {op.sql.length > 240 ? `${op.sql.slice(0, 240)}…` : op.sql}
                      </pre>
                    )}
                    {op.message && (
                      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13, color: 'var(--fg-secondary)' }}>
                        {op.message}
                      </div>
                    )}
                  </div>
                  <Pill tone={tone}>{op.status}</Pill>
                </div>
              )
            })}
          </Card>

          {errCount > 0 && (
            <div style={{
              marginTop: 16, padding: 14, background: 'var(--danger-bg)',
              border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
              borderRadius: 'var(--radius-md)', display: 'flex', gap: 10,
            }}>
              <Icon name="warning" size={16} color="var(--danger)" />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--fg-primary)', marginBottom: 4 }}>
                  {errCount} operaç{errCount === 1 ? 'ão bloqueada' : 'ões bloqueadas'}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13, color: 'var(--fg-secondary)' }}>
                  Atlas não executa DROP, ALTER ou TRUNCATE em import. Edite o SQL e refaça.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setStep('compose')}>Voltar</Button>
            <Button
              variant={warnCount > 0 ? 'danger' : 'primary'}
              size="lg"
              icon="check"
              disabled={loading || okCount === 0}
              onClick={handleCommit}
            >
              {loading ? 'Executando…' : `Executar ${okCount} operações`}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 'done' && committed && (
        <div style={{ marginTop: 28 }}>
          <Card>
            <Eyebrow style={{ marginBottom: 16 }}>Resultado</Eyebrow>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <Stat label="tabelas criadas" n={String(committed.created_tables?.length ?? 0)} tone="ok" />
              {/* o backend conta STATEMENTS (mysqldump agrupa a tabela num INSERT só) */}
              <Stat label="INSERTs executados" n={String(committed.inserted_rows ?? 0)} tone="accent" />
              <Stat label="relações criadas" n={String(committed.relations_created ?? 0)} tone="ok" />
              <Stat label="erros" n={String(committed.errors?.length ?? 0)} tone={committed.errors?.length ? 'err' : 'muted'} />
            </div>

            {committed.created_tables && committed.created_tables.length > 0 && (
              <>
                <Hairline my={20} />
                <Eyebrow style={{ marginBottom: 8 }}>Criadas</Eyebrow>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {committed.created_tables.map(c => <Pill key={c} tone="ok" dot>{c}</Pill>)}
                </div>
              </>
            )}

            {committed.warnings && committed.warnings.length > 0 && (
              <>
                <Hairline my={20} />
                <Eyebrow style={{ marginBottom: 8 }}>Avisos</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {committed.warnings.map((w, i) => (
                    <div key={i} style={{
                      fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13,
                      color: 'var(--fg-secondary)', padding: 10,
                      background: 'var(--warn-bg)', borderRadius: 'var(--radius-sm)',
                    }}>
                      {w}
                    </div>
                  ))}
                </div>
              </>
            )}

            {committed.errors && committed.errors.length > 0 && (
              <>
                <Hairline my={20} />
                <Eyebrow style={{ marginBottom: 8 }}>Erros</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {committed.errors.map((e, i) => (
                    <div key={i} style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)',
                      padding: 10, background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)',
                    }}>
                      {e}
                    </div>
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

function Stat({ label, n, tone }: { label: string; n: string; tone: 'ok' | 'accent' | 'warn' | 'err' | 'muted' }) {
  const colorMap: Record<string, string> = {
    ok: 'var(--ok)', accent: 'var(--accent-text)', warn: 'var(--warn)', err: 'var(--danger)', muted: 'var(--fg-muted)',
  }
  const bgMap: Record<string, string> = {
    ok: 'var(--ok-bg)', accent: 'var(--accent-bg)', warn: 'var(--warn-bg)', err: 'var(--danger-bg)', muted: 'var(--bg-sunken)',
  }
  return (
    <div style={{
      padding: 16, borderRadius: 'var(--radius-md)',
      background: bgMap[tone], border: '1px solid var(--rule-faint)',
    }}>
      <div className="numeric" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: colorMap[tone], lineHeight: 1 }}>
        {n}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--fg-muted)', marginTop: 6 }}>
        {label}
      </div>
    </div>
  )
}
