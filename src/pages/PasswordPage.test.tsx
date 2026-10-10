import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { authApi } from '../api/endpoints'
import { ana, renderPage } from '../test/render'
import { PasswordPage } from './PasswordPage'

async function fillAndSubmit(current: string, next: string, confirmation: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Senha atual'), current)
  await user.type(screen.getByLabelText(/^Nova senha/), next)
  await user.type(screen.getByLabelText('Confirmar nova senha'), confirmation)
  await user.click(screen.getByRole('button', { name: 'Salvar' }))
}

describe('PasswordPage', () => {
  it('changes the password and clears the form', async () => {
    const change = vi.spyOn(authApi, 'changePassword').mockResolvedValue(undefined)
    renderPage(<PasswordPage />, { loggedAs: ana })

    await fillAndSubmit('12345678', 'new-password', 'new-password')

    expect(change).toHaveBeenCalledWith('12345678', 'new-password')
    expect(await screen.findByText('Senha alterada.')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha atual')).toHaveValue('')
  })

  it('does not call the server when the confirmation differs', async () => {
    const change = vi.spyOn(authApi, 'changePassword')
    renderPage(<PasswordPage />, { loggedAs: ana })

    await fillAndSubmit('12345678', 'new-password', 'other-password')

    expect(screen.getByText('A confirmação não confere com a nova senha.')).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('shows the server message when the current password is wrong', async () => {
    vi.spyOn(authApi, 'changePassword').mockRejectedValue(new ApiError(422, 'A senha atual está incorreta.'))
    renderPage(<PasswordPage />, { loggedAs: ana })

    await fillAndSubmit('wrong-one', 'new-password', 'new-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('A senha atual está incorreta.')
  })
})
