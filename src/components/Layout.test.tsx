import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { tokenStore } from '../api/client'
import { ana, renderPage } from '../test/render'
import { Layout } from './Layout'

async function renderLayout() {
  renderPage(<Layout />, { loggedAs: ana })
  await screen.findByText('ana@example.com')
  return userEvent.setup()
}

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('Layout', () => {
  it('shows the menu and who is logged in', async () => {
    await renderLayout()

    expect(screen.getByRole('navigation', { name: 'Menu principal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cadastros' })).toHaveAttribute('href', '/settings')
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  it('switches between the light and the dark theme', async () => {
    const user = await renderLayout()

    await user.click(screen.getByRole('button', { name: 'Tema escuro' }))
    expect(document.documentElement.dataset.theme).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Tema claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('opens the menu as a drawer and closes it when a screen is chosen', async () => {
    const user = await renderLayout()
    const sidebar = screen.getByRole('complementary')

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }))
    expect(sidebar).toHaveClass('sidebar-open')

    await user.click(screen.getByRole('link', { name: 'Cadastros' }))
    expect(sidebar).not.toHaveClass('sidebar-open')
  })

  it('shrinks to its icons and back, remembering the choice', async () => {
    const user = await renderLayout()
    const shell = screen.getByRole('complementary').parentElement!

    await user.click(screen.getByRole('button', { name: 'Recolher menu' }))
    expect(shell).toHaveClass('shell-collapsed')
    expect(localStorage.getItem('finch.sidebar.collapsed')).toBe('true')
    // The labels are hidden by CSS only, so the links keep their names for screen readers.
    expect(screen.getByRole('link', { name: 'Cadastros' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expandir menu' }))
    expect(shell).not.toHaveClass('shell-collapsed')
  })

  it('ends the session on logout', async () => {
    const user = await renderLayout()

    await user.click(screen.getByRole('button', { name: 'Sair' }))

    expect(tokenStore.get()).toBeNull()
    expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument()
  })
})
