"use client"
import React, { useState } from 'react'
import { useAuth } from '@/components/AuthContext'
import { Upload, FileCode, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export default function ImportSQLPage() {
  const { token } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setResult(null)
    
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      const res = await fetch(`${API}/api/import/sql`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      const data = await res.json()
      setResult(data)
    } catch (e: any) {
      setResult({ errors: [e.message] })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--color-text))' }}>Importar Script SQL</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
          Faça upload de um arquivo .sql com comandos CREATE TABLE e INSERT INTO compatíveis com PostgreSQL ou MySQL.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
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
        <input
          id="sql-file-input"
          type="file"
          accept=".sql"
          className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]) }}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="px-6 py-3 rounded-xl text-white text-sm font-semibold flex items-center gap-2 transition-all"
        style={{ background: 'hsl(var(--color-primary))', opacity: (!file || loading) ? 0.5 : 1 }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {loading ? 'Processando...' : 'Importar Script'}
      </button>

      {/* Results */}
      {result && (
        <div className="space-y-3 p-6 rounded-2xl" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
          <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--color-text))' }}>Resultado:</h3>
          
          {result.created_tables?.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span style={{ color: 'hsl(var(--color-text))' }}>Tabelas criadas: <strong>{result.created_tables.join(', ')}</strong></span>
            </div>
          )}
          {result.inserted_rows > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <span style={{ color: 'hsl(var(--color-text))' }}>Linhas inseridas: <strong>{result.inserted_rows}</strong></span>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="space-y-1 mt-2">
              {result.errors.map((err: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-red-400">{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
