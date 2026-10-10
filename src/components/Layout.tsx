import { Building2, CalendarDays, CalendarRange, ChartColumn, CreditCard, KeyRound, ListChecks, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, PiggyBank, Settings2, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../lib/theme'
import { Brand } from './Brand'
import { Avatar } from './ui'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** The screens of the main menu, in order. A new screen only needs a line here and a route in App. */
const NAV_ITEMS: NavItem[] = [
  { to: '/year', label: 'Visão do ano', icon: CalendarRange },
  { to: '/month', label: 'Contas do mês', icon: ListChecks },
  { to: '/cards', label: 'Cartões', icon: CreditCard },
  { to: '/spending', label: 'Gastos por mês', icon: ChartColumn },
  { to: '/weekly', label: 'Semana', icon: CalendarDays },
  { to: '/future', label: 'Futuro', icon: PiggyBank },
  { to: '/company', label: 'Empresa', icon: Building2 },
  { to: '/settings', label: 'Cadastros', icon: Settings2 },
]

const COLLAPSED_KEY = 'finch.sidebar.collapsed'

export function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  /** Only matters on small screens, where the sidebar is a drawer. */
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  /** On wide screens the sidebar can shrink to its icons, to leave the width to wide tables. */
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true')

  function toggleCollapsed() {
    localStorage.setItem(COLLAPSED_KEY, String(!collapsed))
    setCollapsed(!collapsed)
  }

  if (!user) return null

  return (
    <div className={collapsed ? 'shell shell-collapsed' : 'shell'}>
      <header className="mobile-bar">
        <button type="button" className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
          <Menu size={20} aria-hidden />
        </button>
        <Brand />
      </header>
      {menuOpen && <div className="sidebar-scrim" onClick={closeMenu} />}
      <aside className={menuOpen ? 'sidebar sidebar-open' : 'sidebar'}>
        <Link to="/" className="sidebar-brand" onClick={closeMenu}>
          <Brand />
        </Link>
        <nav className="sidebar-nav" aria-label="Menu principal">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="nav-item" onClick={closeMenu} title={label}>
              <Icon size={18} aria-hidden />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <Avatar name={user.name} />
            <div className="user-card-text">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <NavLink to="/password" className="nav-item" onClick={closeMenu} title="Alterar senha">
            <KeyRound size={18} aria-hidden />
            <span className="nav-label">Alterar senha</span>
          </NavLink>
          <button type="button" className="nav-item" onClick={toggle} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
            {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            <span className="nav-label">{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
          </button>
          <button
            type="button"
            className="nav-item sidebar-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            <span className="nav-label">{collapsed ? 'Expandir menu' : 'Recolher menu'}</span>
          </button>
          <button type="button" className="nav-item" onClick={logout} title="Sair">
            <LogOut size={18} aria-hidden />
            <span className="nav-label">Sair</span>
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
