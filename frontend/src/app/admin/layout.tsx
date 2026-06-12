"use client"
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthContext'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import TweaksPanel from '@/components/TweaksPanel'
import { Eyebrow, Icon, MMonogram, Pill, type IconName } from '@/components/ui'

interface WorkspaceMe {
  workspace_name?: string | null
  workspace_slug?: string | null
}

type NavItem = { href: string; icon: IconName; label: string }
type NavGroup = { title: string; items: NavItem[] }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, token, isAuthenticated, logout } = useAuth()
  const [me, setMe] = useState<WorkspaceMe | null>(null)

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    if (!token) return
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setMe(data) })
      .catch(() => { /* fallback to AuthContext user */ })
  }, [API, token])

  if (!isAuthenticated) return null

  const role = (user?.role ?? 'moderator') as 'master' | 'admin' | 'moderator'
  const adminOnly = role === 'admin' || role === 'master'
  const masterOnly = role === 'master'
  const modOrAdmin = role !== 'master' ? true : false // master typically does not import data, but allow

  const groups: NavGroup[] = []

  // CONTEÚDO
  const contentItems: NavItem[] = [
    { href: '/admin', icon: 'home', label: 'Capa' },
    { href: '/admin/tables', icon: 'table', label: 'Tabelas' },
  ]
  if (adminOnly) contentItems.push({ href: '/admin/import/sql', icon: 'upload', label: 'Importar SQL' })
  if (adminOnly || role === 'moderator') contentItems.push({ href: '/admin/import/data', icon: 'import', label: 'Importar CSV' })
  contentItems.push({ href: '/admin/groups', icon: 'folder', label: 'Grupos' })
  // Publish Studio (M6) — até o M6.5 só se chegava por URL direta.
  if (role !== 'master') contentItems.push({ href: '/admin/publish', icon: 'palette', label: 'Publicação' })
  groups.push({ title: 'Conteúdo', items: contentItems })

  // ACESSO (admin only)
  if (adminOnly) {
    groups.push({
      title: 'Acesso',
      items: [
        { href: '/admin/users', icon: 'users', label: 'Moderadores' },
        { href: '/admin/qr-auth', icon: 'qr', label: 'QR' },
      ],
    })
  }

  // SISTEMA (master only)
  if (masterOnly) {
    groups.push({
      title: 'Sistema',
      items: [{ href: '/admin/admins', icon: 'shield', label: 'Administradores' }],
    })
  }

  const workspaceName = me?.workspace_name ?? user?.workspace_name ?? user?.username ?? 'workspace'
  const workspaceSlug = me?.workspace_slug ?? user?.workspace_slug ?? (user?.username ? user.username.toLowerCase() : 'workspace')

  const roleTone: 'master' | 'admin' | 'moderator' = role
  const roleLabel = role === 'master' ? 'master' : role === 'admin' ? 'admin' : 'moderador'

  const initial = (user?.username ?? '?').charAt(0).toUpperCase()

  // suppress unused-warning for modOrAdmin
  void modOrAdmin

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-page)', color: 'var(--fg-primary)' }}>
      <aside
        className="hidden md:flex flex-col"
        style={{
          width: 280,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--rule)',
          padding: '28px 20px 20px',
          height: '100vh',
          position: 'sticky',
          top: 0,
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, padding: '0 6px' }}>
          <MMonogram size={22} color="var(--accent-text)" />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: 'var(--tracking-tight)', color: 'var(--fg-primary)' }}>
            Atlas
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
            mora · v.1
          </span>
        </div>

        {/* Workspace card */}
        <div
          className="paper-texture"
          style={{
            padding: '12px 14px',
            marginBottom: 22,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--rule-faint)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Eyebrow style={{ fontSize: 9 }}>workspace</Eyebrow>
            <Pill tone={roleTone} dot>{roleLabel}</Pill>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 15,
              lineHeight: 1.2,
              color: 'var(--fg-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 2,
            }}
          >
            {workspaceName}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--fg-muted)',
              letterSpacing: '0.04em',
            }}
          >
            {workspaceSlug}.atlas
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1, overflow: 'auto' }}>
          {groups.map(group => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ padding: '0 8px 4px' }}>
                <Eyebrow style={{ fontSize: 9 }}>{group.title}</Eyebrow>
              </div>
              {group.items.map(item => {
                const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'var(--accent-subtle)' : 'transparent',
                      color: isActive ? 'var(--accent-text)' : 'var(--fg-secondary)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      fontWeight: isActive ? 500 : 400,
                      letterSpacing: '-0.005em',
                      textDecoration: 'none',
                      transition: 'background var(--duration-fast) var(--ease-editorial), color var(--duration-fast) var(--ease-editorial)',
                    }}
                  >
                    <Icon name={item.icon} size={15} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User pill / logout */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rule-faint)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-sunken)',
                color: 'var(--fg-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--fg-primary)',
                  lineHeight: 1.2,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.username}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>
                @{user?.username}
              </div>
            </div>
            <button
              onClick={() => { logout(); router.push('/login') }}
              title="Sair"
              style={{
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                color: 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                padding: 6,
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        <div style={{ flex: 1, padding: '40px 48px 64px', overflow: 'auto' }}>
          {children}
        </div>
      </main>

      <ThemeSwitcher />
      <TweaksPanel />
    </div>
  )
}
