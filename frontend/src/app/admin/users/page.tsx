"use client"
import React, { useState } from 'react'
import { useAuth } from '@/components/AuthContext'
import { UserPlus, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export default function UsersPage() {
  const { token, isAdmin } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${API}/api/auth/register-moderator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, password, role: 'moderator' })
      })

      if (res.ok) {
        setMessage(`Moderador "${username}" criado com sucesso!`)
        setUsername('')
        setPassword('')
      } else {
        const data = await res.json()
        setError(data.detail || 'Erro ao criar moderador')
      }
    } catch {
      setError('Erro de conexão')
    }
    setLoading(false)
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: 'hsl(var(--color-text-muted))' }}>Apenas administradores podem gerenciar usuários.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--color-text))' }}>Gerenciar Moderadores</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
          Crie contas de moderador para seus clientes. Eles poderão visualizar tabelas e dados, mas não criar novas tabelas.
        </p>
      </div>

      <form onSubmit={handleCreate} className="space-y-5 p-6 rounded-2xl" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
        {message && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle className="w-4 h-4" /> {message}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm text-red-400 bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--color-text))' }}>Nome de Usuário</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: 'hsl(var(--color-bg-surface))', color: 'hsl(var(--color-text))', border: '1px solid hsl(var(--color-border))' }}
            placeholder="ex: cliente_empresa"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--color-text))' }}>Senha</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: 'hsl(var(--color-bg-surface))', color: 'hsl(var(--color-text))', border: '1px solid hsl(var(--color-border))' }}
            placeholder="Senha segura"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all"
          style={{ background: 'hsl(var(--color-primary))', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {loading ? 'Criando...' : 'Criar Moderador'}
        </button>
      </form>
    </div>
  )
}
