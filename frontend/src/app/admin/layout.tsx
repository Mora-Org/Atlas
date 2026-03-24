"use client"
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Database, Link as LinkIcon, Upload, FileSpreadsheet, Settings, Users, LogOut, Palette } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuth } from '@/components/AuthContext'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import { useEffect, useState } from 'react'

const navItems = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/tables', icon: Database, label: 'Tabelas' },
  { href: '/admin/import/sql', icon: Upload, label: 'Importar SQL' },
  { href: '/admin/import/data', icon: FileSpreadsheet, label: 'Importar CSV/XLSX' },
  { href: '/admin/users', icon: Users, label: 'Moderadores', adminOnly: true },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated, isAdmin, logout } = useAuth()
  const [showTheme, setShowTheme] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen flex" style={{ background: 'hsl(var(--color-bg))', color: 'hsl(var(--color-text))' }}>
      {/* Sidebar */}
      <aside className="w-64 p-4 hidden md:flex flex-col" style={{ background: 'hsl(var(--color-bg-card))', borderRight: '1px solid hsl(var(--color-border))' }}>
        <div className="mb-8 px-4">
          <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--color-primary))' }}>
            Dynamic CMS
          </h1>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--color-text-muted))' }}>
            {user?.username} ({user?.role})
          </p>
        </div>
        
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            if ((item as any).adminOnly && !isAdmin) return null
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200",
                  isActive ? "" : ""
                )}
                style={{
                  background: isActive ? 'hsl(var(--color-primary) / 0.12)' : 'transparent',
                  color: isActive ? 'hsl(var(--color-primary))' : 'hsl(var(--color-text-muted))',
                }}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Theme Switcher Toggle */}
        <div className="mt-auto space-y-2">
          <button
            onClick={() => setShowTheme(!showTheme)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm w-full transition-all duration-200"
            style={{ color: 'hsl(var(--color-text-muted))' }}
          >
            <Palette className="w-5 h-5" />
            Personalizar Tema
          </button>
          {showTheme && <ThemeSwitcher />}

          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm w-full transition-all duration-200 text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <header className="h-16 flex items-center px-6" style={{ borderBottom: '1px solid hsl(var(--color-border))', background: 'hsl(var(--color-bg-card))' }}>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-medium text-white text-sm" style={{ background: 'hsl(var(--color-primary))' }}>
              {user?.username?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        
        <div className="flex-1 p-6 lg:p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
