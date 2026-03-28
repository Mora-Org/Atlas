"use client"
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: number
  username: string
  role: string
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    }
  }, [])

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const formData = new URLSearchParams()
      formData.append('username', username)
      formData.append('password', password)

      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
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
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const createQRSession = async () => {
    try {
      const res = await fetch(`${API}/api/auth/qr/session`, { method: 'POST' })
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }

  const checkQRStatus = async (session_id: string) => {
    try {
      const res = await fetch(`${API}/api/auth/qr/status/${session_id}`)
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  }

  const authorizeQR = async (session_id: string) => {
    try {
      const res = await fetch(`${API}/api/auth/qr/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ session_id })
      })
      return res.ok
    } catch { return false }
  }

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
      authorizeQR
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
