"use client"
import { useEffect, useState, use } from "react"
import Link from "next/link"
import { ArrowLeft, Save, Plus, Pencil, Trash, X } from "lucide-react"
import { useAuth } from "@/components/AuthContext"

interface RelationInfo {
  id: number
  from_column_name: string
  to_table_name: string
  to_column_name: string
  relation_type: string
}

interface RefData {
  [toTableName: string]: any[]
}

export default function DataViewer({ params }: { params: Promise<{ table: string }> }) {
  const { table: tableName } = use(params)
  const { token } = useAuth()
  const [columns, setColumns] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [relations, setRelations] = useState<RelationInfo[]>([])
  const [refData, setRefData] = useState<RefData>({})

  const [isAdding, setIsAdding] = useState(false)
  const [newRecord, setNewRecord] = useState<any>({})

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<any>({})

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const fetchRecords = async () => {
    const res = await fetch(`${API}/api/${tableName}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setRecords(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` }

    // Fetch table schema
    fetch(`${API}/tables/`, { headers })
      .then(res => res.json())
      .then(tables => {
        const tableDef = tables.find((t: any) => t.name === tableName)
        if (tableDef?.columns) setColumns(tableDef.columns)
      })
      .catch(console.error)

    // Fetch records
    fetch(`${API}/api/${tableName}`, { headers })
      .then(res => res.json())
      .then(data => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))

    // Fetch FK relations for this table
    fetch(`${API}/api/relations/table/${tableName}`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(async (rels: RelationInfo[]) => {
        setRelations(rels)
        // Pre-fetch reference data for each FK target table
        const refMap: RefData = {}
        for (const rel of rels) {
          try {
            const r = await fetch(`${API}/api/${rel.to_table_name}`, { headers })
            if (r.ok) refMap[rel.to_table_name] = await r.json()
          } catch { /* no ref data available */ }
        }
        setRefData(refMap)
      })
      .catch(console.error)
  }, [tableName, token, API]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Return the RelationInfo for a column if it is a FK, otherwise null */
  const getFKRelation = (colName: string): RelationInfo | null =>
    relations.find(r => r.from_column_name === colName) ?? null

  /** Render an input or FK-select for a given column in add/edit mode */
  const renderField = (col: any, value: any, onChange: (v: any) => void) => {
    const fk = getFKRelation(col.name)
    if (fk) {
      const rows = refData[fk.to_table_name] ?? []
      // Find best label column: first String column that isn't the PK
      const labelCol = rows.length > 0
        ? Object.keys(rows[0]).find(k => k !== fk.to_column_name) ?? fk.to_column_name
        : fk.to_column_name
      return (
        <select
          value={value ?? ""}
          onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full rounded px-3 py-1.5 focus:outline-none text-sm"
          style={{ background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-primary) / 0.5)', color: 'hsl(var(--color-text))' }}
        >
          <option value="">— select {fk.to_table_name} —</option>
          {rows.map((row: any) => (
            <option key={row[fk.to_column_name]} value={row[fk.to_column_name]}>
              {row[fk.to_column_name]} — {row[labelCol]}
            </option>
          ))}
        </select>
      )
    }

    if (col.data_type === "Boolean") {
      return (
        <input type="checkbox" checked={value || false} onChange={e => onChange(e.target.checked)}
          className="w-4 h-4" style={{ accentColor: 'hsl(var(--color-primary))' }} />
      )
    }

    return (
      <input
        type={col.data_type === "Integer" || col.data_type === "Float" ? "number" : "text"}
        value={value ?? ""}
        onChange={e => onChange(col.data_type === "Integer" ? parseInt(e.target.value) : e.target.value)}
        placeholder={col.name}
        className="w-full rounded px-3 py-1.5 focus:outline-none text-sm"
        style={{ background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }}
      />
    )
  }

  /** Display value for a cell — resolve FK to label if possible */
  const displayValue = (col: any, record: any) => {
    const raw = record[col.name]
    const fk = getFKRelation(col.name)
    if (fk && raw != null) {
      const rows = refData[fk.to_table_name] ?? []
      const ref = rows.find((r: any) => r[fk.to_column_name] == raw)
      if (ref) {
        const labelCol = Object.keys(ref).find(k => k !== fk.to_column_name) ?? fk.to_column_name
        return `${ref[labelCol]} (id: ${raw})`
      }
    }
    if (typeof raw === 'boolean') return raw ? "True" : "False"
    return String(raw ?? "-")
  }

  const handleSaveAdd = async () => {
    try {
      const res = await fetch(`${API}/api/${tableName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newRecord)
      })
      if (res.ok) { setIsAdding(false); setNewRecord({}); await fetchRecords() }
    } catch (err) { console.error(err) }
  }

  const handleSaveEdit = async (id: number) => {
    try {
      const res = await fetch(`${API}/api/${tableName}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(editData)
      })
      if (res.ok) { setEditingId(null); setEditData({}); await fetchRecords() }
    } catch (err) { console.error(err) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente excluir este registro?')) return
    try {
      const res = await fetch(`${API}/api/${tableName}/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) await fetchRecords()
    } catch (err) { console.error(err) }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/tables" className="p-2 rounded-lg transition-all"
            style={{ background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))' }}>
            <ArrowLeft className="w-5 h-5" style={{ color: 'hsl(var(--color-text-muted))' }} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight capitalize" style={{ color: 'hsl(var(--color-text))' }}>{tableName}</h1>
            <p className="mt-1 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>Gerencie os dados desta tabela dinâmica.</p>
          </div>
        </div>
        <button onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium text-sm transition-all"
          style={{ background: 'hsl(var(--color-primary))' }}>
          <Plus className="w-4 h-4" /> Adicionar Registro
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden overflow-x-auto"
        style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
        {loading ? (
          <div className="p-8 text-center" style={{ color: 'hsl(var(--color-text-muted))' }}>Carregando dados...</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: 'hsl(var(--color-bg-surface))', borderBottom: '1px solid hsl(var(--color-border))' }}>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--color-text-muted))' }}>ID</th>
                {columns.map((c: any) => (
                  <th key={c.id} className="p-4 text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--color-text-muted))' }}>
                    {c.name}{getFKRelation(c.name) ? ' 🔗' : ''}
                  </th>
                ))}
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-right" style={{ color: 'hsl(var(--color-text-muted))' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {/* ADD ROW */}
              {isAdding && (
                <tr style={{ background: 'hsl(var(--color-primary) / 0.05)' }}>
                  <td className="p-4"><span className="italic" style={{ color: 'hsl(var(--color-text-muted))' }}>Auto</span></td>
                  {columns.map((c: any) => (
                    <td key={c.id} className="p-4">
                      {renderField(c, newRecord[c.name], v => setNewRecord({ ...newRecord, [c.name]: v }))}
                    </td>
                  ))}
                  <td className="p-4 w-24 text-right align-middle">
                    <div className="flex justify-end items-center gap-2">
                      <button onClick={handleSaveAdd} style={{ color: 'hsl(var(--color-primary))' }}>
                        <Save className="w-5 h-5" />
                      </button>
                      <button onClick={() => setIsAdding(false)} className="text-red-500">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {records.length === 0 && !isAdding ? (
                <tr>
                  <td colSpan={columns.length + 2} className="p-8 text-center" style={{ color: 'hsl(var(--color-text-muted))' }}>
                    Nenhum registro encontrado em {tableName}.
                  </td>
                </tr>
              ) : (
                records.map((record: any, i: number) => {
                  const isEditing = editingId === record.id
                  return (
                    <tr key={record.id || i} className="transition-all" style={{ borderBottom: '1px solid hsl(var(--color-border))' }}>
                      <td className="p-4 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>{record.id}</td>
                      {columns.map((c: any) => (
                        <td key={c.id} className="p-4 text-sm whitespace-nowrap" style={{ color: 'hsl(var(--color-text))' }}>
                          {isEditing
                            ? renderField(c, editData[c.name], v => setEditData({ ...editData, [c.name]: v }))
                            : displayValue(c, record)
                          }
                        </td>
                      ))}
                      <td className="p-4 w-24 text-right align-middle">
                        <div className="flex justify-end items-center gap-2">
                          {isEditing ? (
                            <>
                              <button onClick={() => handleSaveEdit(record.id)} className="text-green-500 hover:text-green-600 transition-colors">
                                <Save className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="text-gray-400">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditingId(record.id); setEditData({ ...record }) }}
                                style={{ color: 'hsl(var(--color-primary))' }} className="opacity-80 hover:opacity-100 transition-opacity">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(record.id)} className="text-red-500 opacity-80 hover:opacity-100 transition-opacity">
                                <Trash className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
