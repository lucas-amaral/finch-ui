import { NavLink, Outlet } from 'react-router-dom'

/** The registers of the system, each on its own tab. A new one needs a line here and a route in App. */
const TABS = [
  { to: '/settings/lines', label: 'Contas e rendas' },
  { to: '/settings/cards', label: 'Cartões e categorias' },
  { to: '/settings/users', label: 'Usuários' },
  { to: '/settings/notifications', label: 'Avisos' },
]

export function SettingsPage() {
  return (
    <>
      <nav className="tabs" aria-label="Cadastros">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className="tab">
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
