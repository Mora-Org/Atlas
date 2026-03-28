"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowLeft, Loader2, Save, Link2 } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/components/AuthContext"

interface ColumnDef {
  id: number
  name: string
  data_type: string
  is_nullable: boolean
  is_unique: boolean
  is_fk: boolean
  fk_table: string
  fk_column: string
}

export default function CreateTable() {
  const router = useRouter()
  const { token } = useAuth()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [groupId, setGroupId] = useState<number | null>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [availableTables, setAvailableTables] = useState<any[]>([])
  const [columns, setColumns] = useState<ColumnDef[]>([
    { id: 1, name: "title", data_type: "String", is_nullable: false, is_unique: false, is_fk: false, fk_table: "", fk_column: "" }
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` }
    fetch(`${API}/api/database-groups`, { headers })
      .then(r => r.json()).then(setGroups).catch(console.error)
    fetch(`${API}/tables/`, { headers })
      .then(r => r.json()).then(setAvailableTables).catch(console.error)
  }, [API, token])

  const addColumn = () => {
    setColumns([...columns, {
      id: Date.now(), name: "", data_type: "String",
      is_nullable: true, is_unique: false,
      is_fk: false, fk_table: "", fk_column: ""
    }])
  }

  const removeColumn = (id: number) => {
    setColumns(columns.filter(col => col.id !== id))
  }

  const updateColumn = (id: number, field: string, value: any) => {
    setColumns(columns.map(col => col.id === id ? { ...col, [field]: value } : col))
  }

  const handleSave = async () => {
    if (!name.trim()) return setError("Table name is required")
    setIsSubmitting(true)
    setError("")

    try {
      const payload: any = {
        name: name.toLowerCase(),
        description,
        group_id: groupId,
        columns: columns.map((c) => ({
          name: c.name.toLowerCase().replace(/\s+/g, '_'),
          data_type: c.data_type,
          is_nullable: c.is_nullable,
          is_unique: c.is_unique,
          is_primary: false,
          fk_table: c.is_fk && c.fk_table ? c.fk_table : null,
          fk_column: c.is_fk && c.fk_column ? c.fk_column : null,
        }))
      }

      const res = await fetch(`${API}/tables/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Failed to create table")
      }

      router.push("/admin/tables")
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Link href="/admin/tables" className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg hover:bg-neutral-800 transition-colors">
          <ArrowLeft className="w-5 h-5 text-neutral-400" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Data Model</h1>
          <p className="text-neutral-400 mt-1">Design a new dynamically generated table in your database.</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">{error}</div>
      )}

      <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-8">
        {/* Table Info */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Table Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-400">Table Name (plural)</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. products, events"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-400">Description (optional)</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="What is this table for?"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
            </div>
          </div>
          {/* Group selector */}
          {groups.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-400">Database Group (optional)</label>
              <select value={groupId ?? ""} onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
                className="bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-all">
                <option value="">No group</option>
                {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Columns */}
        <div className="space-y-4 pt-6 border-t border-neutral-800">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Columns Schema</h3>
            <button onClick={addColumn} className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
              <Plus className="w-4 h-4" /> Add Column
            </button>
          </div>

          <div className="space-y-3">
            {columns.map((col, index) => (
              <div key={col.id} className="flex flex-col gap-3 p-4 bg-neutral-950 border border-neutral-800 rounded-xl relative group">
                <div className="absolute -left-3 top-4 w-6 h-6 bg-neutral-800 rounded-full flex items-center justify-center text-xs text-neutral-400 font-mono border border-neutral-700">
                  {index + 1}
                </div>

                {/* Row 1: name + type + checkboxes + delete */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-xs text-neutral-500 uppercase tracking-wider">Column Name</label>
                    <input type="text" value={col.name} onChange={e => updateColumn(col.id, "name", e.target.value)}
                      placeholder="field_name"
                      className="w-full bg-transparent border-b border-neutral-800 focus:border-indigo-500 pb-1 outline-none font-mono text-sm" />
                  </div>
                  <div className="w-40 space-y-2">
                    <label className="text-xs text-neutral-500 uppercase tracking-wider">Type</label>
                    <select value={col.data_type} onChange={e => updateColumn(col.id, "data_type", e.target.value)}
                      className="w-full bg-transparent border-b border-neutral-800 focus:border-indigo-500 pb-1 outline-none text-sm cursor-pointer">
                      <option value="String">String (Text)</option>
                      <option value="Integer">Integer</option>
                      <option value="Float">Float</option>
                      <option value="Boolean">Boolean</option>
                      <option value="DateTime">DateTime</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-6 pt-6 px-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={col.is_nullable} onChange={e => updateColumn(col.id, "is_nullable", e.target.checked)}
                        className="accent-indigo-500 w-4 h-4" />
                      <span className="text-sm text-neutral-400">Nullable</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={col.is_unique} onChange={e => updateColumn(col.id, "is_unique", e.target.checked)}
                        className="accent-indigo-500 w-4 h-4" />
                      <span className="text-sm text-neutral-400">Unique</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={col.is_fk} onChange={e => updateColumn(col.id, "is_fk", e.target.checked)}
                        className="accent-amber-500 w-4 h-4" />
                      <span className="text-sm text-amber-400 flex items-center gap-1">
                        <Link2 className="w-3 h-3" /> FK
                      </span>
                    </label>
                    <button onClick={() => removeColumn(col.id)}
                      className="text-neutral-500 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-neutral-800">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Row 2: FK selectors (only when is_fk is on) */}
                {col.is_fk && (
                  <div className="flex flex-col sm:flex-row gap-4 pl-0 pt-2 border-t border-amber-500/20">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-amber-400 uppercase tracking-wider">References Table</label>
                      <select value={col.fk_table} onChange={e => updateColumn(col.id, "fk_table", e.target.value)}
                        className="w-full bg-neutral-900 border border-amber-500/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-500 transition-all">
                        <option value="">Select table…</option>
                        {availableTables.map((t: any) => (
                          <option key={t.id} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-amber-400 uppercase tracking-wider">References Column</label>
                      <select value={col.fk_column} onChange={e => updateColumn(col.id, "fk_column", e.target.value)}
                        className="w-full bg-neutral-900 border border-amber-500/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-500 transition-all">
                        <option value="">Select column…</option>
                        {col.fk_table && availableTables
                          .find((t: any) => t.name === col.fk_table)
                          ?.columns?.map((c: any) => (
                            <option key={c.id} value={c.name}>{c.name} ({c.data_type})</option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-6">
          <button disabled={isSubmitting} onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSubmitting ? "Generating Schema..." : "Create Table"}
          </button>
        </div>
      </div>
    </div>
  )
}
