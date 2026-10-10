import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, tokenStore } from '../api/client'
import { authApi } from '../api/endpoints'
import { ana, renderPage } from '../test/render'
import { LoginPage } from './LoginPage'

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('E-mail'), email)
  await user.type(screen.getByLabelText('Senha'), password)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('LoginPage', () => {
  it('logs in with what was typed and keeps the token', async () => {
    const login = vi
      .spyOn(authApi, 'login')
      .mockResolvedValue({ token: 'new-token', expiresAt: '2026-10-09T00:00:00Z', user: ana })
    renderPage(<LoginPage />)

    await fillAndSubmit('ana@example.com', '12345678')

    expect(login).toHaveBeenCalledWith('ana@example.com', '12345678')
    expect(tokenStore.get()).toBe('new-token')
  })

  it('shows the server message when the credentials are refused and lets the user try again', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError(401, 'E-mail ou senha inválidos.'))
    renderPage(<LoginPage />)

    await fillAndSubmit('ana@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    expect(tokenStore.get()).toBeNull()
  })

  it('hides the password until the user asks to see it', async () => {
    renderPage(<LoginPage />)
    const password = screen.getByLabelText('Senha')
    expect(password).toHaveAttribute('type', 'password')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Mostrar senha' }))

    expect(password).toHaveAttribute('type', 'text')
  })
})
