"use client"
import React, { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthContext'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, XCircle, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react'

export default function QRAuthPage() {
  const { authorizeQR, token, user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const session_id = searchParams.get('session_id')

  const [status, setStatus] = useState<'pending' | 'loading' | 'success' | 'error'>('pending')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      // If not logged in on this device (phone), go to login first
      router.push(`/login?redirect=/admin/qr-auth?session_id=${session_id}`)
    }
  }, [token, session_id, router])

  const handleAuthorize = async () => {
    if (!session_id) return
    setStatus('loading')
    const success = await authorizeQR(session_id)
    if (success) {
      setStatus('success')
    } else {
      setStatus('error')
      setErrorMsg('Falha ao autorizar. A sessão pode ter expirado.')
    }
  }

  if (!token) return <div className="p-8 text-center text-sm font-medium">Redirecionando para login...</div>

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'hsl(var(--color-bg))' }}>
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="mx-auto w-20 h-20 rounded-3xl flex items-center justify-center mb-6" 
          style={{ background: status === 'success' ? 'hsl(142 76% 36% / 0.15)' : 'hsl(var(--color-primary) / 0.15)' }}>
          {status === 'success' ? (
            <CheckCircle className="w-10 h-10 text-green-500" />
          ) : status === 'error' ? (
            <XCircle className="w-10 h-10 text-red-500" />
          ) : (
            <ShieldCheck className="w-10 h-10" style={{ color: 'hsl(var(--color-primary))' }} />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--color-text))' }}>
            Autorizar Dispositivo?
          </h1>
          <p className="text-sm" style={{ color: 'hsl(var(--color-text-muted))' }}>
            Você está prestes a autorizar o login de outro dispositivo como <strong>{user?.username}</strong>.
          </p>
        </div>

        <div className="p-6 rounded-2xl space-y-4" style={{ background: 'hsl(var(--color-bg-card))', border: '1px solid hsl(var(--color-border))' }}>
          {status === 'pending' && (
            <button onClick={handleAuthorize} className="w-full py-4 rounded-xl font-bold bg-white text-black text-sm shadow-xl transition-transform active:scale-95">
              Sim, Autorizar Acesso
            </button>
          )}

          {status === 'loading' && (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'hsl(var(--color-primary))' }} />
              <span className="text-sm font-medium">Processando...</span>
            </div>
          )}

          {status === 'success' && (
            <div className="py-4 text-green-500 font-bold flex flex-col items-center gap-2">
              <CheckCircle className="w-6 h-6" />
              <span>Dispositivo Autorizado!</span>
              <p className="text-xs font-normal text-neutral-400 mt-2">Você já pode fechar esta página.</p>
            </div>
          )}

          {status === 'error' && (
            <div className="py-4 text-red-500 font-bold flex flex-col items-center gap-2">
              <XCircle className="w-6 h-6" />
              <span>{errorMsg}</span>
              <button onClick={() => setStatus('pending')} className="text-xs underline mt-2">Tentar novamente</button>
            </div>
          )}

          <button onClick={() => router.push('/admin')} className="w-full py-3 rounded-xl font-medium text-sm transition-all" 
            style={{ color: 'hsl(var(--color-text-muted))' }}>
            Cancelar e sair
          </button>
        </div>

        <p className="text-xs opacity-50">Session ID: {session_id?.slice(0, 8)}...</p>
      </div>
    </div>
  )
}
