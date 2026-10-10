import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { usersApi } from '../api/endpoints'
import type { User } from '../api/types'
import { ana, renderPage } from '../test/render'
import { UsersPage } from './UsersPage'

const bia: User = { ...ana, id: 2, name: 'Bia', email: 'bia@example.com' }

/** Renders the page logged as Ana, with Ana and Bia in the list. */
async function renderUsers() {
  const list = vi.spyOn(usersApi, 'list').mockResolvedValue([ana, bia])
  renderPage(<UsersPage />, { loggedAs: ana })
  await screen.findByText('bia@example.com')
  // The session resolves on its own; wait for it so the "Você" chip is already in place.
  await screen.findByText('Você')
  return { list, user: userEvent.setup() }
}

describe('UsersPage', () => {
  it('lists the users with their creation date and marks the logged one', async () => {
    await renderUsers()

    const anaRow = screen.getByText('ana@example.com').closest('tr')!
    expect(within(anaRow).getByText('Você')).toBeInTheDocument()
    expect(within(anaRow).getByText('08/10/2026, 12:30')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('offers no way to delete the logged user', async () => {
    await renderUsers()

    expect(screen.queryByRole('button', { name: 'Excluir Ana' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir Bia' })).toBeInTheDocument()
  })

  it('creates a user and reloads the list', async () => {
    const { list, user } = await renderUsers()
    const create = vi.spyOn(usersApi, 'create').mockResolvedValue({ ...ana, id: 3, name: 'Caio' })

    await user.click(screen.getByRole('button', { name: 'Novo usuário' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' })
    await user.type(within(dialog).getByLabelText(/^Nome/), 'Caio')
    await user.type(within(dialog).getByLabelText(/^E-mail/), 'caio@example.com')
    await user.type(within(dialog).getByLabelText(/^Senha/), '12345678')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(create).toHaveBeenCalledWith({ name: 'Caio', email: 'caio@example.com', password: '12345678' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('edits a user without sending a password when none is typed', async () => {
    const { user } = await renderUsers()
    const update = vi.spyOn(usersApi, 'update').mockResolvedValue({ ...bia, name: 'Bianca' })

    await user.click(screen.getByRole('button', { name: 'Editar Bia' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar usuário' })
    const name = within(dialog).getByLabelText(/^Nome/)
    expect(name).toHaveValue('Bia')
    expect(within(dialog).getByLabelText(/^Nova senha/)).not.toBeRequired()
    await user.clear(name)
    await user.type(name, 'Bianca')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(update).toHaveBeenCalledWith(2, { name: 'Bianca', email: 'bia@example.com', password: undefined })
  })

  it('keeps the form open and shows the server errors when saving fails', async () => {
    const { user } = await renderUsers()
    vi.spyOn(usersApi, 'update').mockRejectedValue(
      new ApiError(400, 'Um ou mais campos são inválidos.', { email: 'E-mail inválido.' }),
    )

    await user.click(screen.getByRole('button', { name: 'Editar Bia' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Um ou mais campos são inválidos.')
    expect(within(dialog).getByText('E-mail inválido.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })

  it('deletes a user only after confirmation', async () => {
    const { list, user } = await renderUsers()
    const remove = vi.spyOn(usersApi, 'remove').mockResolvedValue(undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await user.click(screen.getByRole('button', { name: 'Excluir Bia' }))
    expect(confirm).toHaveBeenCalledWith('Excluir o usuário "Bia"?')
    expect(remove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Excluir Bia' }))
    expect(remove).toHaveBeenCalledWith(2)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  it('shows the error with a retry when the list cannot be loaded', async () => {
    const list = vi.spyOn(usersApi, 'list').mockRejectedValueOnce(new ApiError(0, 'Não foi possível conectar.'))
    renderPage(<UsersPage />, { loggedAs: ana })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar.')

    list.mockResolvedValue([ana])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('ana@example.com')).toBeInTheDocument()
  })
})
