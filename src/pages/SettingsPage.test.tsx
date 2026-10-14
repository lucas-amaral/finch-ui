import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage', () => {
  it('offers each register on a tab and shows the one of the address', () => {
    render(
      <MemoryRouter initialEntries={['/settings/cards']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />}>
            <Route path="lines" element={<p>lines</p>} />
            <Route path="cards" element={<p>cards</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('navigation', { name: 'Cadastros' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contas e rendas' })).toHaveAttribute('href', '/settings/lines')
    expect(screen.getByRole('link', { name: 'Cartões e categorias' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Usuários' })).toHaveAttribute('href', '/settings/users')
    expect(screen.getByRole('link', { name: 'Avisos' })).toHaveAttribute('href', '/settings/notifications')
    expect(screen.getByRole('link', { name: 'Feriados' })).toHaveAttribute('href', '/settings/holidays')
    expect(screen.getByText('cards')).toBeInTheDocument()
  })
})
