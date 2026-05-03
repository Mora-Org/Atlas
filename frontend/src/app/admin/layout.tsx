"use client"
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Database, Upload, FileSpreadsheet, Users, LogOut, Shield, FolderOpen } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import { useEffect } from 'react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated, isMaster, isAdmin, logout } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  if (!isAuthenticated) return null

  const navItems: { href: string; icon: any; label: string }[] = [
    { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  ]

  if (isMaster) {
    navItems.push({ href: '/admin/admins', icon: Shield, label: 'Administradores' })
  }

  if (isAdmin && !isMaster) {
    navItems.push({ href: '/admin/groups', icon: FolderOpen, label: 'Database Groups' })
    navItems.push({ href: '/admin/tables', icon: Database, label: 'Tabelas' })
    navItems.push({ href: '/admin/import/sql', icon: Upload, label: 'Importar SQL' })
    navItems.push({ href: '/admin/import/data', icon: FileSpreadsheet, label: 'Importar CSV/XLSX' })
    navItems.push({ href: '/admin/users', icon: Users, label: 'Moderadores' })
  }

  if (user?.role === 'moderator') {
    navItems.push({ href: '/admin/groups', icon: FolderOpen, label: 'Meus Grupos' })
    navItems.push({ href: '/admin/tables', icon: Database, label: 'Tabelas' })
    navItems.push({ href: '/admin/import/data', icon: FileSpreadsheet, label: 'Importar CSV/XLSX' })
  }

  const roleLabel = user?.role === 'master' ? 'Master' : user?.role === 'admin' ? 'Admin' : 'Moderador'

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-page)', color: 'var(--fg-primary)' }}>
      {/* Sidebar */}
      <aside className="w-64 p-4 hidden md:flex flex-col" style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--rule)' }}>
        <div className="mb-8 px-4">
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-text)' }}>
            Dynamic CMS
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
            {user?.username}
          </p>
          <span
            className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)', fontFamily: 'var(--font-mono)' }}
          >
            {roleLabel}
          </span>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200"
                style={{
                  background: isActive ? 'var(--accent-subtle)' : 'transparent',
                  color: isActive ? 'var(--accent-text)' : 'var(--fg-muted)',
                }}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto">
          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm w-full transition-all duration-200"
            style={{ color: 'var(--danger)' }}
          >
            <LogOut className="w-5 h-5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <header
          className="h-16 flex items-center px-6"
          style={{ borderBottom: '1px solid var(--rule)', background: 'var(--bg-surface)' }}
        >
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm"
              style={{ background: 'var(--accent)', color: 'var(--fg-inverse)' }}
            >
              {user?.username?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 lg:p-8 overflow-auto">
          {children}
        </div>
      </main>

      <ThemeSwitcher />
    </div>
  )
}
