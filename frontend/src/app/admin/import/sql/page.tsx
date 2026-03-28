"use client"
import React, { useState } from 'react'
import { useAuth } from '@/components/AuthContext'
import { FileCode, CheckCircle, AlertCircle, AlertTriangle, Loader2, ArrowRight, Database } from 'lucide-react'

type StmtStatus = "ok" | "blocked" | "conflict"

interface StatementResult {
  type: string
  status: StmtStatus
  message: string
  table_name?: string
}

interface DryRunResult {
  summary: { total: number; ok: number; blocked: number; conflicts: number }
  statements: StatementResult[]
}

interface CommitResult {
  created_tables: string[]
  inserted_rows: number
  errors: string[]
}

type Step = "upload" | "preview" | "done"

export default function ImportSQLPage() {
  const { token } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>("upload")
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const authHeaders = { Authorization: `Bearer ${token}` }

  const handleDryRun = async () => {
    if (!file) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API}/api/import/sql/dry-run`, {
        method: 'POST', headers: authHeaders, body: formData
      })
      const data = await res.json()
      setDryRun(data)
      setStep("preview")
    } catch (e: any) {
      setDryRun({ summary: { total: 0, ok: 0, blocked: 0, conflicts: 0 }, statements: [{ type: "ERROR", status: "blocked", message: e.message }] })
      setStep("preview")
    }
    setLoading(false)
  }

  const handleCommit = async () => {
    if (!file) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API}/api/import/sql`, {
        method: 'POST', headers: authHeaders, body: formData
      })
      setCommitResult(await res.json())
      setStep("done")
    } catch (e: any) {
      setCommitResult({ created_tables: [], inserted_rows: 0, errors: [e.message] })
      setStep("done")
    }
    setLoading(false)
  }

  const reset = () => {
    setFile(null); setStep("upload"); setDryRun(null); setCommitResult(null)
  }

  const statusIcon = (s: StmtStatus) => {
    if (s === "ok") return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
    if (s === "conflict") return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
    return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
  }

  const statusColor = (s: StmtStatus) => {
    if (s === "ok") return 'text-emerald-400'
    if (s === "conflict") return 'text-amber-400'
    return 'text-red-400'
  }

  const canCommit = dryRun && dryRun.summary.ok > 0

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--color-text))' }}>Importar Script SQL</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
          Faça upload de um arquivo .sql com comandos CREATE TABLE e INSERT INTO.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "preview", "done"] as Step[]).map((s, i) => (
          <React.Fragment key={s}>
            <span className={`px-3 py-1 rounded-full font-medium transition-colors ${step === s ? 'text-white' : ''}`}
              style={{ background: step === s ? 'hsl(var(--color-primary))' : 'hsl(var(--color-bg-surface))', color: step === s ? '#fff' : 'hsl(var(--color-text-muted))' }}>
              {i + 1}. {s === "upload" ? "Upload" : s === "preview" ? "Preview" : "Resultado"}
            </span>
            {i < 2 && <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'hsl(var(--color-text-muted))' }} />}
          </React.Fragment>
        ))}
      </div>

      {/* STEP 1: Upload */}
      {step === "upload" && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
            onClick={() => document.getElementById('sql-file-input')?.click()}
            className="rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all duration-200"
            style={{
              border: `2px dashed hsl(var(${dragOver ? '--color-primary' : '--color-border'}))`,
              background: dragOver ? 'hsl(var(--color-primary) / 0.05)' : 'hsl(var(--color-bg-card))',
            }}
          >
            <FileCode className="w-12 h-12" style={{ color: 'hsl(var(--color-primary))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
              {file ? file.name : 'Arraste ou clique para selecionar um .sql'}
            </p>
            <input id="sql-file-input" type="file" accept=".sql" className="hidden"
              onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]) }} />
          </div>

          <button onClick={handleDryRun} disabled={!file || loading}
            className="px-6 py-3 rounded-xl text-white text-sm font-semibold flex items-center gap-2 transition-all"
            style={{ background: 'hsl(var(--color-primary))', opacity: (!file || loading) ? 0.5 : 1 }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {loading ? 'Analisando...' : 'Analisar Script'}
          </button>
        </>
      )}

      {/* STEP 2: Dry-run preview */}
      {step === "preview" && dryRun && (
        <div className="space-y-4">
          {/* Summary badges */}
          <div className="flex flex-wrap gap-3">
            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 text-neutral-300">
              Total: {dryRun.summary.total}
            </span>
            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400">
              OK: {dryRun.summary.ok}
            </span>
            {dryRun.summary.conflicts > 0 && (
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400">
                Conflitos: {dryRun.summary.conflicts}
              </span>
            )}
            {dryRun.summary.blocked > 0 && (
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400">
                Bloqueados: {dryRun.summary.blocked}
              </span>
            )}
          </div>

          {/* Statement list */}
          <div className="rounded-2xl overflow-hidden divide-y"
            style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))', borderColor: 'hsl(var(--color-border))' }}>
            {dryRun.statements.map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-4">
                {statusIcon(s.status)}
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-bold uppercase mr-2 ${statusColor(s.status)}`}>{s.type}</span>
                  {s.table_name && <span className="text-xs font-mono mr-2" style={{ color: 'hsl(var(--color-text))' }}>{s.table_name}</span>}
                  <span className="text-xs" style={{ color: 'hsl(var(--color-text-muted))' }}>{s.message}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="px-5 py-2.5 rounded-xl text-sm font-medium border transition-all"
              style={{ borderColor: 'hsl(var(--color-border))', color: 'hsl(var(--color-text-muted))' }}>
              Cancelar
            </button>
            <button onClick={handleCommit} disabled={!canCommit || loading}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center gap-2 transition-all"
              style={{ background: 'hsl(var(--color-primary))', opacity: (!canCommit || loading) ? 0.5 : 1 }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              {loading ? 'Importando...' : `Confirmar Import (${dryRun.summary.ok} statements)`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Commit result */}
      {step === "done" && commitResult && (
        <div className="space-y-4 p-6 rounded-2xl"
          style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
          <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--color-text))' }}>Resultado da Importação:</h3>
          {commitResult.created_tables.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span style={{ color: 'hsl(var(--color-text))' }}>Tabelas criadas: <strong>{commitResult.created_tables.join(', ')}</strong></span>
            </div>
          )}
          {commitResult.inserted_rows > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span style={{ color: 'hsl(var(--color-text))' }}>Linhas inseridas: <strong>{commitResult.inserted_rows}</strong></span>
            </div>
          )}
          {commitResult.errors?.length > 0 && (
            <div className="space-y-1 mt-2">
              {commitResult.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-red-400">{err}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={reset} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all"
            style={{ borderColor: 'hsl(var(--color-border))', color: 'hsl(var(--color-text-muted))' }}>
            Nova Importação
          </button>
        </div>
      )}
    </div>
  )
}
