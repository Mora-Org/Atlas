"use client"
import { useState, useEffect } from "react"
import { Users, Plus, Trash2, KeyRound } from "lucide-react"
import { useAuth } from "@/components/AuthContext"

export default function ModeratorsPage() {
  const { token, isAdmin, isMaster } = useAuth()
  const [mods, setMods] = useState<any[]>([])
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [msg, setMsg] = useState("")
  const [error, setError] = useState("")
  const [resetId, setResetId] = useState<number | null>(null)
  const [newPass, setNewPass] = useState("")

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const fetchMods = () => {
    fetch(`${API}/api/moderators`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setMods).catch(console.error)
  }

  useEffect(() => { fetchMods() }, [API, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const createMod = async () => {
    if (!username || !password) return setError("Preencha todos os campos")
    setError(""); setMsg("")
    const res = await fetch(`${API}/api/moderators`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username, password, role: "moderator" })
    })
    if (res.ok) {
      setUsername(""); setPassword("")
      setMsg("Moderador criado!")
      fetchMods()
    } else {
      const err = await res.json()
      setError(err.detail || "Erro")
    }
  }

  const deleteMod = async (id: number) => {
    if (!confirm("Deletar este moderador?")) return
    const res = await fetch(`${API}/api/moderators/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) fetchMods()
  }

  const resetPassword = async (id: number) => {
    if (!newPass) return
    const res = await fetch(`${API}/api/moderators/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ new_password: newPass })
    })
    if (res.ok) {
      setMsg("Senha resetada!")
      setResetId(null); setNewPass("")
      fetchMods()
    }
  }

  if (!isAdmin || isMaster) return <div className="p-8 text-center" style={{ color: 'hsl(var(--color-text-muted))' }}>Acesso restrito a administradores.</div>

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3" style={{ color: 'hsl(var(--color-text))' }}>
          <Users className="w-8 h-8" style={{ color: 'hsl(var(--color-primary))' }} />
          Gerenciar Moderadores
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
          Crie, delete e resete senhas dos seus moderadores. Atribua permissões na página de Grupos.
        </p>
      </div>

      {/* Create Form */}
      <div className="rounded-2xl p-6 space-y-4" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
        <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--color-text))' }}>Novo Moderador</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input type="text" placeholder="Username" value={username} onChange={(e: any) => setUsername(e.target.value)}
            className="rounded-lg px-4 py-2.5 text-sm focus:outline-none"
            style={{ background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }} />
          <input type="password" placeholder="Senha" value={password} onChange={(e: any) => setPassword(e.target.value)}
            className="rounded-lg px-4 py-2.5 text-sm focus:outline-none"
            style={{ background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }} />
        </div>
        <button onClick={createMod} className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium" style={{ background: 'hsl(var(--color-primary))' }}>
          <Plus className="w-4 h-4" /> Criar Moderador
        </button>
        {msg && <p className="text-sm text-emerald-400">{msg}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* Mods List */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
        <div className="p-4 font-semibold text-sm" style={{ background: 'hsl(var(--color-bg-surface))', color: 'hsl(var(--color-text-muted))' }}>
          MODERADORES
        </div>
        {mods.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>Nenhum moderador criado.</div>
        ) : (
          mods.map((mod: any) => (
            <div key={mod.id} className="p-4 space-y-2" style={{ borderBottom: '1px solid hsl(var(--color-border))' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium" style={{ background: 'hsl(var(--color-primary) / 0.6)' }}>
                    {mod.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium" style={{ color: 'hsl(var(--color-text))' }}>{mod.username}</p>
                    <p className="text-xs" style={{ color: 'hsl(var(--color-text-muted))' }}>ID: {mod.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setResetId(resetId === mod.id ? null : mod.id)} className="p-2 rounded-lg transition-colors" style={{ color: 'hsl(var(--color-text-muted))' }} title="Resetar senha">
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteMod(mod.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {resetId === mod.id && (
                <div className="flex gap-2 pl-12">
                  <input type="password" placeholder="Nova senha" value={newPass} onChange={(e: any) => setNewPass(e.target.value)}
                    className="flex-1 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                    style={{ background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', color: 'hsl(var(--color-text))' }} />
                  <button onClick={() => resetPassword(mod.id)} className="px-3 py-1.5 text-sm text-white rounded-lg" style={{ background: 'hsl(var(--color-primary))' }}>
                    Resetar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
