"use client"
import React, { useState, useEffect } from 'react'
import { useAuth } from '@/components/AuthContext'
import { FileSpreadsheet, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export default function ImportDataPage() {
  const { token } = useAuth()
  const [tables, setTables] = useState<any[]>([])
  const [selectedTable, setSelectedTable] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  useEffect(() => {
    fetch(`${API}/tables/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setTables(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [API, token])

  const handleUpload = async () => {
    if (!file || !selectedTable) return
    setLoading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API}/api/import/data/${selectedTable}`, {
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
        <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--color-text))' }}>Importar Dados (CSV / XLSX)</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
          Selecione uma tabela existente e faça upload de um arquivo CSV ou Excel. As colunas do arquivo serão mapeadas automaticamente.
        </p>
      </div>

      {/* Table selector */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--color-text))' }}>Tabela Destino</label>
        <select
          value={selectedTable}
          onChange={e => setSelectedTable(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none"
          style={{ background: 'hsl(var(--color-bg-surface))', color: 'hsl(var(--color-text))', border: '1px solid hsl(var(--color-border))' }}
        >
          <option value="">Selecione uma tabela...</option>
          {tables.map(t => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
        onClick={() => document.getElementById('data-file-input')?.click()}
        className="rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all"
        style={{
          border: `2px dashed hsl(var(${dragOver ? '--color-primary' : '--color-border'}))`,
          background: dragOver ? 'hsl(var(--color-primary) / 0.05)' : 'hsl(var(--color-bg-card))',
        }}
      >
        <FileSpreadsheet className="w-12 h-12" style={{ color: 'hsl(var(--color-primary))' }} />
        <p className="text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
          {file ? file.name : 'Arraste ou clique para selecionar .csv ou .xlsx'}
        </p>
        <input
          id="data-file-input"
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]) }}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || !selectedTable || loading}
        className="px-6 py-3 rounded-xl text-white text-sm font-semibold flex items-center gap-2 transition-all"
        style={{ background: 'hsl(var(--color-primary))', opacity: (!file || !selectedTable || loading) ? 0.5 : 1 }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {loading ? 'Inserindo dados...' : 'Importar Dados'}
      </button>

      {/* Results */}
      {result && (
        <div className="space-y-3 p-6 rounded-2xl" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
          <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--color-text))' }}>Resultado:</h3>
          
          {result.inserted_rows > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5" />
              <span style={{ color: 'hsl(var(--color-text))' }}>
                <strong>{result.inserted_rows}</strong> de {result.total_rows} linhas inseridas
              </span>
            </div>
          )}
          {result.matched_columns?.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5" />
              <span style={{ color: 'hsl(var(--color-text))' }}>Colunas mapeadas: {result.matched_columns.join(', ')}</span>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="space-y-1 mt-2">
              {result.errors.map((err: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />
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
