'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/components/AuthContext'
import { useRouter } from 'next/navigation'
import { Lock, Loader2, QrCode, ArrowLeft } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [qrSession, setQrSession] = useState<{ session_id: string, expires_at: string } | null>(null)
  const { login, createQRSession, checkQRStatus } = useAuth()
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

  const handleShowQR = async () => {
    setError('')
    setLoading(true)
    const session = await createQRSession()
    setLoading(false)
    if (session) {
      setQrSession(session)
      setShowQR(true)
    } else {
      setError('Não foi possível gerar o QR Code.')
    }
  }

  // Polling for QR status
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (showQR && qrSession) {
      interval = setInterval(async () => {
        const status = await checkQRStatus(qrSession.session_id)
        if (status?.is_authorized && status.access_token) {
          // Manually update localStorage and state if the context didn't do it automatically
          // (The context setToken/setUser happens inside the checkQRStatus if implemented there, 
          // but here it returns state, so we handle it)
          localStorage.setItem('token', status.access_token)
          localStorage.setItem('user', JSON.stringify(status.user))
          window.location.href = '/admin' // Force reload to pick up new auth state
        }
      }, 2000)
    }
    return () => clearInterval(interval)
  }, [showQR, qrSession, checkQRStatus])

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'hsl(var(--color-bg))' }}>
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'hsl(var(--color-primary) / 0.15)' }}>
            {showQR ? <QrCode className="w-8 h-8" style={{ color: 'hsl(var(--color-primary))' }} /> : <Lock className="w-8 h-8" style={{ color: 'hsl(var(--color-primary))' }} />}
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'hsl(var(--color-text))' }}>
            Dynamic CMS
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
            {showQR ? 'Escaneie o código com seu celular já logado' : 'Faça login para acessar o painel administrativo'}
          </p>
        </div>

        <div className="p-8 rounded-2xl space-y-5" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
          {error && (
            <div className="p-3 rounded-lg text-sm text-red-400 bg-red-500/10 border border-red-500/20">
              {error}
            </div>
          )}

          {showQR ? (
            <div className="flex flex-col items-center space-y-6">
              <div className="p-4 bg-white rounded-2xl shadow-xl">
                {qrSession && (
                  <QRCodeCanvas 
                    value={`${window.location.origin}/admin/qr-auth?session_id=${qrSession.session_id}`} 
                    size={200}
                    level="H"
                  />
                )}
              </div>
              <p className="text-xs text-center px-4" style={{ color: 'hsl(var(--color-text-muted))' }}>
                Abra o sistema no seu celular logado e autorize este acesso.
              </p>
              <button onClick={() => setShowQR(false)} className="flex items-center gap-2 text-sm font-medium transition-colors" style={{ color: 'hsl(var(--color-primary))' }}>
                <ArrowLeft className="w-4 h-4" /> Voltar para senha
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--color-text))' }}>Usuário</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} required
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2"
                    style={{ background: 'hsl(var(--color-bg-surface))', color: 'hsl(var(--color-text))', border: '1px solid hsl(var(--color-border))' }}
                    placeholder="Digite seu usuário" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--color-text))' }}>Senha</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2"
                    style={{ background: 'hsl(var(--color-bg-surface))', color: 'hsl(var(--color-text))', border: '1px solid hsl(var(--color-border))' }}
                    placeholder="Digite sua senha" />
                </div>
                <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 flex items-center justify-center gap-2"
                  style={{ background: 'hsl(var(--color-primary))', opacity: loading ? 0.7 : 1 }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar'}
                </button>
              </form>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t" style={{ borderColor: 'hsl(var(--color-border))' }}></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="px-2 bg-transparent" style={{ background: 'hsl(var(--color-bg-card))', color: 'hsl(var(--color-text-muted))' }}>Ou</span></div>
              </div>

              <button onClick={handleShowQR} disabled={loading} className="w-full py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 border"
                style={{ color: 'hsl(var(--color-text))', borderColor: 'hsl(var(--color-border))' }}>
                <QrCode className="w-4 h-4" /> Logar com QR Code
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs" style={{ color: 'hsl(var(--color-text-muted))' }}>
          Aprovação via celular requer dispositivo previamente autenticado.
        </p>
      </div>
    </div>
  )
}
