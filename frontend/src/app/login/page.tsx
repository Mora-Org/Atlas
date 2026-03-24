"use client"
import React, { useState } from 'react'
import { useAuth } from '@/components/AuthContext'
import { useRouter } from 'next/navigation'
import { Lock, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const success = await login(username, password)
    setLoading(false)

    if (success) {
      router.push('/admin')
    } else {
      setError('Credenciais inválidas. Tente novamente.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'hsl(var(--color-bg))' }}>
      <div className="w-full max-w-md space-y-8">
        {/* Logo section */}
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'hsl(var(--color-primary) / 0.15)' }}>
            <Lock className="w-8 h-8" style={{ color: 'hsl(var(--color-primary))' }} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'hsl(var(--color-text))' }}>
            Dynamic CMS
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
            Faça login para acessar o painel administrativo
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-5 p-8 rounded-2xl" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
          {error && (
            <div className="p-3 rounded-lg text-sm text-red-400 bg-red-500/10 border border-red-500/20">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--color-text))' }}>
              Usuário
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2"
              style={{
                background: 'hsl(var(--color-bg-surface))',
                color: 'hsl(var(--color-text))',
                border: '1px solid hsl(var(--color-border))',
                focusRingColor: 'hsl(var(--color-primary))',
              }}
              placeholder="Digite seu usuário"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--color-text))' }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2"
              style={{
                background: 'hsl(var(--color-bg-surface))',
                color: 'hsl(var(--color-text))',
                border: '1px solid hsl(var(--color-border))',
              }}
              placeholder="Digite sua senha"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2"
            style={{ background: 'hsl(var(--color-primary))', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs" style={{ color: 'hsl(var(--color-text-muted))' }}>
          Apenas contas criadas internamente podem acessar este sistema.
        </p>
      </div>
    </div>
  )
}
