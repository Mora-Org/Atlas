"use client"
import { useEffect, useState, use } from "react"
import Link from "next/link"
import { ArrowLeft, Save, Plus } from "lucide-react"
import { useAuth } from "@/components/AuthContext"

export default function DataViewer({ params }: { params: Promise<{ table: string }> }) {
  const { table: tableName } = use(params)
  const { token } = useAuth()
  const [columns, setColumns] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [newRecord, setNewRecord] = useState<any>({})

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` }
    
    fetch(`${API}/tables/`, { headers })
      .then(res => res.json())
      .then(tables => {
        const tableDef = tables.find((t: any) => t.name === tableName)
        if (tableDef?.columns) setColumns(tableDef.columns)
      })
      .catch(console.error)

    fetch(`${API}/api/${tableName}`, { headers })
      .then(res => res.json())
      .then(data => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [tableName, token, API])

  const handleSave = async () => {
    try {
      const res = await fetch(`${API}/api/${tableName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newRecord)
      })
      if (res.ok) {
        setIsAdding(false)
        setNewRecord({})
        const dataRes = await fetch(`${API}/api/${tableName}`, { headers: { Authorization: `Bearer ${token}` } })
        setRecords(await dataRes.json())
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/tables" className="p-2 rounded-lg transition-all" style={{ background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))' }}>
            <ArrowLeft className="w-5 h-5" style={{ color: 'hsl(var(--color-text-muted))' }} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight capitalize" style={{ color: 'hsl(var(--color-text))' }}>{tableName}</h1>
            <p className="mt-1 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>Gerencie os dados desta tabela dinâmica.</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium text-sm transition-all"
          style={{ background: 'hsl(var(--color-primary))' }}
        >
          <Plus className="w-4 h-4" />
          Adicionar Registro
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden overflow-x-auto" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
        {loading ? (
          <div className="p-8 text-center" style={{ color: 'hsl(var(--color-text-muted))' }}>Carregando dados...</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: 'hsl(var(--color-bg-surface))', borderBottom: '1px solid hsl(var(--color-border))' }}>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--color-text-muted))' }}>ID</th>
                {columns.map((c: any) => (
                  <th key={c.id} className="p-4 text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--color-text-muted))' }}>
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isAdding && (
                <tr style={{ background: 'hsl(var(--color-primary) / 0.05)' }}>
                  <td className="p-4">
                    <span className="italic" style={{ color: 'hsl(var(--color-text-muted))' }}>Auto</span>
                  </td>
                  {columns.map((c: any) => (
                    <td key={c.id} className="p-4">
                      {c.data_type === "Boolean" ? (
                        <input 
                          type="checkbox" 
                          checked={newRecord[c.name] || false}
                          onChange={(e: any) => setNewRecord({...newRecord, [c.name]: e.target.checked})}
                          className="w-4 h-4"
                          style={{ accentColor: 'hsl(var(--color-primary))' }}
                        />
                      ) : (
                        <input 
                          type={c.data_type === "Integer" || c.data_type === "Float" ? "number" : "text"}
                          value={newRecord[c.name] || ""}
                          onChange={(e: any) => setNewRecord({...newRecord, [c.name]: c.data_type === "Integer" ? parseInt(e.target.value) : e.target.value})}
                          placeholder={`${c.name}`}
                          className="w-full rounded px-3 py-1.5 focus:outline-none text-sm"
                          style={{ background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }}
                        />
                      )}
                    </td>
                  ))}
                  <td className="p-4 w-12 text-right">
                    <button onClick={handleSave} style={{ color: 'hsl(var(--color-primary))' }}>
                      <Save className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              )}
              {records.length === 0 && !isAdding ? (
                <tr>
                  <td colSpan={columns.length + 1} className="p-8 text-center" style={{ color: 'hsl(var(--color-text-muted))' }}>
                    Nenhum registro encontrado em {tableName}.
                  </td>
                </tr>
              ) : (
                records.map((record: any, i: any) => (
                  <tr key={i} className="transition-all" style={{ borderBottom: '1px solid hsl(var(--color-border))' }}>
                    <td className="p-4 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>{record.id}</td>
                    {columns.map((c: any) => (
                      <td key={c.id} className="p-4 text-sm whitespace-nowrap" style={{ color: 'hsl(var(--color-text))' }}>
                        {typeof record[c.name] === 'boolean' 
                          ? (record[c.name] ? "True" : "False") 
                          : String(record[c.name] ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
