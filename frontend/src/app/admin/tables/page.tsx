"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Database, ChevronRight, Eye, EyeOff } from "lucide-react"
import { useAuth } from "@/components/AuthContext"

type DynamicTable = {
  id: number
  name: string
  description?: string
  created_at: string
  is_public: boolean
  owner_id: number
}

export default function TablesOverview() {
  const { token, isAdmin } = useAuth()
  const [tables, setTables] = useState<DynamicTable[]>([])
  const [loading, setLoading] = useState(true)

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  useEffect(() => {
    fetch(`${API}/tables/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => { setTables(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [API, token])

  const toggleVisibility = async (tableId: number) => {
    const res = await fetch(`${API}/tables/${tableId}/visibility`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setTables(prev => prev.map(t => t.id === tableId ? { ...t, is_public: data.is_public } : t))
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'hsl(var(--color-text))' }}>Modelos de Dados</h1>
          <p className="mt-2 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>Gerencie suas tabelas e schemas dinamicamente.</p>
        </div>
        {isAdmin && (
          <Link 
            href="/admin/tables/create"
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium text-sm transition-all"
            style={{ background: 'hsl(var(--color-primary))' }}
          >
            <Plus className="w-4 h-4" />
            Nova Tabela
          </Link>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
        {loading ? (
          <div className="p-12 text-center" style={{ color: 'hsl(var(--color-text-muted))' }}>Carregando tabelas...</div>
        ) : tables.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="p-4 rounded-full mb-4" style={{ background: 'hsl(var(--color-bg-surface))' }}>
              <Database className="w-8 h-8" style={{ color: 'hsl(var(--color-text-muted))' }} />
            </div>
            <h3 className="text-lg font-medium" style={{ color: 'hsl(var(--color-text))' }}>Nenhuma tabela criada</h3>
            <p className="mt-1 max-w-sm text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>Comece criando uma tabela ou importando um script SQL.</p>
          </div>
        ) : (
          <div>
            {tables.map(table => (
              <div key={table.id} className="p-4 sm:p-6 flex items-center justify-between group transition-all" style={{ borderBottom: '1px solid hsl(var(--color-border))' }}>
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-medium flex items-center gap-3" style={{ color: 'hsl(var(--color-text))' }}>
                    <Database className="w-5 h-5" style={{ color: 'hsl(var(--color-primary))' }} />
                    {table.name}
                    {table.is_public && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Público</span>
                    )}
                  </h3>
                  {table.description && (
                    <p className="text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>{table.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isAdmin && (
                    <button
                      onClick={() => toggleVisibility(table.id)}
                      className="p-2 rounded-lg transition-colors"
                      title={table.is_public ? "Tornar privado" : "Tornar público"}
                      style={{ color: 'hsl(var(--color-text-muted))' }}
                    >
                      {table.is_public ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                  <Link 
                    href={`/admin/data/${table.name}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all"
                    style={{ background: 'hsl(var(--color-bg-surface))', color: 'hsl(var(--color-text))' }}
                  >
                    Ver Dados
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
