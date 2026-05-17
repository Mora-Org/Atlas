"use client"
/**
 * AuthContext — M4 Auth Unification (Supabase Auth).
 *
 * Interface pública (`token`, `user`, `login`, `logout`, `isMaster`, ...)
 * preservada do M3 — chamadas existentes em ~15 arquivos não mudam.
 * Por baixo, autenticação delegada ao Supabase Auth:
 *
 * - `login(username, password)`: converte username → email e chama
 *   `supabase.auth.signInWithPassword`. Sessão fica persistida no
 *   localStorage do SDK do Supabase (não usamos mais nossa key).
 * - `token`: agora é o `session.access_token` ES256 do Supabase
 *   (renovado automaticamente pelo SDK).
 * - `user`: composto de `session.user.app_metadata` (role, tenant_id)
 *   + dados do nosso backend via `/api/auth/me` (workspace_name/slug).
 *
 * Fallback dev: se Supabase não configurado, cai pro fluxo
 * username/password antigo via `/api/auth/login` (que está em modo
 * dual no backend, devolvendo token fake `test-<username>`).
 *
 * QR login está suspenso no M4 — funções retornam null/false com
 * mensagem clara.
 */
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { getSupabase, isSupabaseConfigured, usernameToEmail } from '@/lib/supabaseClient'

interface User {
  id: number
  username: string
  role: 'master' | 'admin' | 'moderator'
  workspace_name?: string | null
  workspace_slug?: string | null
  parent_id?: number | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  isAuthenticated: boolean
  isMaster: boolean
  isAdmin: boolean
  isModerator: boolean
  createQRSession: () => Promise<{ session_id: string; expires_at: string } | null>
  checkQRStatus: (session_id: string) => Promise<{ is_authorized: boolean; access_token?: string; user?: User } | null>
  authorizeQR: (session_id: string) => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | null>(null)

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const SUPABASE_ON = isSupabaseConfigured()

async function fetchMe(token: string): Promise<User | null> {
  try {
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)

  // Hidrata da sessão atual. Em Supabase mode, lê do SDK; em fallback
  // dev, lê do localStorage (compat M3).
  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      if (SUPABASE_ON) {
        const supabase = getSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (session) {
          const me = await fetchMe(session.access_token)
          if (cancelled) return
          if (me) {
            setToken(session.access_token)
            setUser(me)
          }
        }

        // Refresca o token quando o SDK rotaciona.
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (cancelled) return
          if (session) {
            setToken(session.access_token)
          } else {
            setToken(null)
            setUser(null)
          }
        })
        return () => sub.subscription.unsubscribe()
      }

      // Fallback dev/test: localStorage do M3
      const savedToken = localStorage.getItem('token')
      const savedUser = localStorage.getItem('user')
      if (savedToken && savedUser) {
        setToken(savedToken)
        setUser(JSON.parse(savedUser))
      }
    }

    hydrate()
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    if (SUPABASE_ON) {
      try {
        const supabase = getSupabase()
        const email = usernameToEmail(username)
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error || !data.session) return false
        const me = await fetchMe(data.session.access_token)
        if (!me) return false
        setToken(data.session.access_token)
        setUser(me)
        return true
      } catch {
        return false
      }
    }

    // Fallback dev/test
    try {
      const formData = new URLSearchParams()
      formData.append('username', username)
      formData.append('password', password)
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      })
      if (!res.ok) return false
      const data = await res.json()
      setToken(data.access_token)
      setUser(data.user)
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      return true
    } catch {
      return false
    }
  }, [])

  const logout = useCallback(() => {
    if (SUPABASE_ON) {
      getSupabase().auth.signOut().catch(() => {})
    } else {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
    setToken(null)
    setUser(null)
  }, [])

  // QR login suspenso no M4 — preserva assinatura pra não quebrar
  // imports existentes; UI deve mostrar mensagem alternativa.
  const createQRSession = useCallback(async () => null, [])
  const checkQRStatus = useCallback(async (_session_id: string) => null, [])
  const authorizeQR = useCallback(async (_session_id: string) => false, [])

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      logout,
      isAuthenticated: !!token,
      isMaster: user?.role === 'master',
      isAdmin: user?.role === 'admin' || user?.role === 'master',
      isModerator: user?.role === 'moderator',
      createQRSession,
      checkQRStatus,
      authorizeQR,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
