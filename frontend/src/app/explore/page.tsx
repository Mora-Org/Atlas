"use client"
import { useState, useEffect } from "react"
import { Search, Filter, ChevronUp, ChevronDown, Database, ArrowLeft, ArrowRight, X, Link as LinkIcon } from "lucide-react"
import Link from "next/link"

type PublicTable = {
  id: number; name: string; description: string | null
  columns: { name: string; data_type: string; is_primary: boolean }[]
}
type Relation = { id: number; name: string; from_table: string; to_table: string; relation_type: string }

export default function ExplorePage() {
  const [tables, setTables] = useState<PublicTable[]>([])
  const [relations, setRelations] = useState<Relation[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState("")
  const [filterCol, setFilterCol] = useState("")
  const [filterOp, setFilterOp] = useState("contains")
  const [filterVal, setFilterVal] = useState("")
  const [sortCol, setSortCol] = useState("")
  const [sortOrder, setSortOrder] = useState("asc")
  const [offset, setOffset] = useState(0)
  const limit = 50

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  useEffect(() => {
    fetch(`${API}/public/tables/`).then(r => r.json()).then(setTables).catch(console.error)
    fetch(`${API}/public/relations/`).then(r => r.json()).then((d: any) => setRelations(Array.isArray(d) ? d : [])).catch(console.error)
  }, [API])

  useEffect(() => {
    if (!selected) return
    fetchData()
  }, [selected, search, filterCol, filterOp, filterVal, sortCol, sortOrder, offset])

  const fetchData = () => {
    if (!selected) return
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (filterCol && filterVal) { params.set("filter_col", filterCol); params.set("filter_val", filterVal); params.set("filter_op", filterOp) }
    if (sortCol) { params.set("sort", sortCol); params.set("order", sortOrder) }
    params.set("limit", String(limit))
    params.set("offset", String(offset))

    fetch(`${API}/public/api/${selected}?${params}`)
      .then(r => r.json())
      .then(res => { setData(res.data || []); setTotal(res.total || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }

  const selectedTable = tables.find(t => t.name === selected)
  const columns = selectedTable?.columns || []
  const relatedTables = relations.filter(r => r.from_table === selected || r.to_table === selected)

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortCol(col); setSortOrder("asc")
    }
    setOffset(0)
  }

  const clearFilters = () => {
    setSearch(""); setFilterCol(""); setFilterVal(""); setFilterOp("contains"); setSortCol(""); setSortOrder("asc"); setOffset(0)
  }

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--color-bg))', color: 'hsl(var(--color-text))' }}>
      {/* Header */}
      <header className="px-6 py-4 flex items-center gap-4" style={{ borderBottom: '1px solid hsl(var(--color-border))', background: 'hsl(var(--color-bg-card))' }}>
        <Link href="/" className="p-2 rounded-lg transition-colors" style={{ color: 'hsl(var(--color-text-muted))' }}>
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--color-primary))' }}>Data Explorer</h1>
          <p className="text-xs" style={{ color: 'hsl(var(--color-text-muted))' }}>Browse public datasets</p>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar — Table List */}
        <aside className="w-64 p-4 hidden md:block shrink-0" style={{ borderRight: '1px solid hsl(var(--color-border))', background: 'hsl(var(--color-bg-card))', minHeight: 'calc(100vh - 73px)' }}>
          <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'hsl(var(--color-text-muted))' }}>Public Tables</p>
          {tables.length === 0 ? (
            <p className="text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>No public tables available.</p>
          ) : (
            <div className="space-y-1">
              {tables.map(t => (
                <button key={t.id} onClick={() => { setSelected(t.name); setOffset(0); clearFilters() }}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-all"
                  style={{
                    background: selected === t.name ? 'hsl(var(--color-primary) / 0.12)' : 'transparent',
                    color: selected === t.name ? 'hsl(var(--color-primary))' : 'hsl(var(--color-text-muted))'
                  }}>
                  <Database className="w-4 h-4 shrink-0" />
                  <div className="truncate">
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-[10px] truncate opacity-70">{t.description}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Related Tables */}
          {relatedTables.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider flex items-center gap-1" style={{ color: 'hsl(var(--color-text-muted))' }}>
                <LinkIcon className="w-3 h-3" /> Relations
              </p>
              {relatedTables.map(r => {
                const target = r.from_table === selected ? r.to_table : r.from_table
                return (
                  <button key={r.id} onClick={() => { setSelected(target); clearFilters() }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors mb-1"
                    style={{ color: 'hsl(var(--color-text-muted))' }}>
                    <span>{target}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'hsl(var(--color-primary) / 0.1)', color: 'hsl(var(--color-primary))' }}>
                      {r.relation_type}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <Database className="w-16 h-16 mb-4" style={{ color: 'hsl(var(--color-primary) / 0.3)' }} />
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'hsl(var(--color-text))' }}>Select a table</h2>
              <p className="text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>Choose a public table from the sidebar to explore its data.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Table Title */}
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold" style={{ color: 'hsl(var(--color-text))' }}>{selected}</h2>
                <span className="text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>{total} records</span>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-wrap gap-3 items-end">
                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--color-text-muted))' }} />
                    <input type="text" placeholder="Search all columns..." value={search}
                      onChange={(e: any) => { setSearch(e.target.value); setOffset(0) }}
                      className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none"
                      style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }} />
                  </div>
                </div>
                {/* Column Filter */}
                <select value={filterCol} onChange={(e: any) => { setFilterCol(e.target.value); setOffset(0) }}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }}>
                  <option value="">Filter column...</option>
                  {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <select value={filterOp} onChange={(e: any) => setFilterOp(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }}>
                  <option value="eq">= Equal</option>
                  <option value="contains">Contains</option>
                  <option value="gt">&gt; Greater</option>
                  <option value="lt">&lt; Less</option>
                  <option value="neq">≠ Not equal</option>
                </select>
                <input type="text" placeholder="Value..." value={filterVal}
                  onChange={(e: any) => { setFilterVal(e.target.value); setOffset(0) }}
                  className="w-32 px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }} />
                {(search || filterCol || filterVal || sortCol) && (
                  <button onClick={clearFilters} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Data Grid */}
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid hsl(var(--color-border))' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'hsl(var(--color-bg-surface))' }}>
                        {columns.map(col => (
                          <th key={col.name} onClick={() => handleSort(col.name)}
                            className="px-4 py-3 text-left font-medium cursor-pointer select-none whitespace-nowrap"
                            style={{ color: 'hsl(var(--color-text-muted))', borderBottom: '1px solid hsl(var(--color-border))' }}>
                            <div className="flex items-center gap-1">
                              {col.name}
                              {sortCol === col.name && (
                                sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                              )}
                              <span className="text-[10px] opacity-40">{col.data_type}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={columns.length} className="p-8 text-center" style={{ color: 'hsl(var(--color-text-muted))' }}>Loading...</td></tr>
                      ) : data.length === 0 ? (
                        <tr><td colSpan={columns.length} className="p-8 text-center" style={{ color: 'hsl(var(--color-text-muted))' }}>No data found.</td></tr>
                      ) : (
                        data.map((row: any, i: number) => (
                          <tr key={i} className="transition-colors" style={{ background: i % 2 === 0 ? 'hsl(var(--color-bg-card))' : 'transparent' }}>
                            {columns.map(col => (
                              <td key={col.name} className="px-4 py-2.5 whitespace-nowrap"
                                style={{ borderBottom: '1px solid hsl(var(--color-border) / 0.5)', color: col.is_primary ? 'hsl(var(--color-primary))' : 'hsl(var(--color-text))' }}>
                                {row[col.name] !== null && row[col.name] !== undefined ? String(row[col.name]) : <span style={{ color: 'hsl(var(--color-text-muted) / 0.4)' }}>null</span>}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
                      className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 disabled:opacity-30"
                      style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }}>
                      <ArrowLeft className="w-3.5 h-3.5" /> Previous
                    </button>
                    <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}
                      className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 disabled:opacity-30"
                      style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }}>
                      Next <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
