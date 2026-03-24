"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowLeft, Loader2, Save } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/components/AuthContext"

export default function CreateTable() {
  const router = useRouter()
  const { token } = useAuth()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [columns, setColumns] = useState([
    { id: 1, name: "title", data_type: "String", is_nullable: false, is_unique: false }
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const addColumn = () => {
    setColumns([...columns, { id: Date.now(), name: "", data_type: "String", is_nullable: true, is_unique: false }])
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
      const payload = {
        name: name.toLowerCase(),
        description,
        columns: columns.map(c => ({
          name: c.name.toLowerCase().replace(/\\s+/g, '_'),
          data_type: c.data_type,
          is_nullable: c.is_nullable,
          is_unique: c.is_unique,
          is_primary: false // backend auto adds an ID if there is none
        }))
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/tables/`, {
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
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">
          {error}
        </div>
      )}

      <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-8">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Table Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-400">Table Name (plural)</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. products, events"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-400">Description (optional)</label>
              <input 
                type="text" 
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this table for?"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-6 border-t border-neutral-800">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Columns Schema</h3>
            <button 
              onClick={addColumn}
              className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Column
            </button>
          </div>

          <div className="space-y-3">
            {columns.map((col, index) => (
              <div key={col.id} className="flex flex-col sm:flex-row gap-4 p-4 bg-neutral-950 border border-neutral-800 rounded-xl relative group">
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-neutral-800 rounded-full flex items-center justify-center text-xs text-neutral-400 font-mono border border-neutral-700">
                  {index + 1}
                </div>
                <div className="flex-1 space-y-2">
                  <label className="text-xs text-neutral-500 uppercase tracking-wider">Column Name</label>
                  <input 
                    type="text" 
                    value={col.name}
                    onChange={e => updateColumn(col.id, "name", e.target.value)}
                    placeholder="field_name"
                    className="w-full bg-transparent border-b border-neutral-800 focus:border-indigo-500 pb-1 outline-none font-mono text-sm"
                  />
                </div>
                <div className="w-40 space-y-2">
                  <label className="text-xs text-neutral-500 uppercase tracking-wider">Type</label>
                  <select 
                    value={col.data_type}
                    onChange={e => updateColumn(col.id, "data_type", e.target.value)}
                    className="w-full bg-transparent border-b border-neutral-800 focus:border-indigo-500 pb-1 outline-none text-sm cursor-pointer"
                  >
                    <option value="String">String (Text)</option>
                    <option value="Integer">Integer</option>
                    <option value="Float">Float</option>
                    <option value="Boolean">Boolean</option>
                    <option value="DateTime">DateTime</option>
                  </select>
                </div>
                <div className="flex items-center gap-6 pt-6 px-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={col.is_nullable}
                      onChange={e => updateColumn(col.id, "is_nullable", e.target.checked)}
                      className="accent-indigo-500 w-4 h-4"
                    />
                    <span className="text-sm text-neutral-400">Nullable</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={col.is_unique}
                      onChange={e => updateColumn(col.id, "is_unique", e.target.checked)}
                      className="accent-indigo-500 w-4 h-4"
                    />
                    <span className="text-sm text-neutral-400">Unique</span>
                  </label>
                  <button 
                    onClick={() => removeColumn(col.id)}
                    className="text-neutral-500 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-neutral-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-6">
          <button 
            disabled={isSubmitting}
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSubmitting ? "Generating Schema..." : "Create Table"}
          </button>
        </div>
      </div>
    </div>
  )
}
