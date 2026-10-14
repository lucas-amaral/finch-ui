import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { localHolidaysApi } from '../api/endpoints'
import { renderPage } from '../test/render'
import { HolidaysPage } from './HolidaysPage'

async function renderHolidays() {
  const list = vi.spyOn(localHolidaysApi, 'list').mockResolvedValue([{ id: 1, month: 9, day: 20, name: 'State day' }])
  renderPage(<HolidaysPage />)
  const local = screen.getByRole('region', { name: 'Feriados estaduais e municipais' })
  await within(local).findByText('State day')
  return { list, local, user: userEvent.setup() }
}

describe('HolidaysPage', () => {
  it('lists the local holidays by day, next to the national ones that are already known', async () => {
    const { local } = await renderHolidays()

    expect(within(local).getByText('20 de setembro')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Feriados nacionais' })).getByText('Sexta-feira Santa')).toBeInTheDocument()
  })

  it('adds a local holiday and removes one', async () => {
    const { list, local, user } = await renderHolidays()
    const create = vi.spyOn(localHolidaysApi, 'create').mockResolvedValue({ id: 2, month: 2, day: 2, name: 'City day' })
    const remove = vi.spyOn(localHolidaysApi, 'remove').mockResolvedValue(undefined)

    await user.type(within(local).getByLabelText('Dia'), '2')
    await user.selectOptions(within(local).getByLabelText('Mês'), 'Fevereiro')
    await user.type(within(local).getByLabelText('Nome'), 'City day')
    await user.click(within(local).getByRole('button', { name: 'Adicionar' }))

    expect(create).toHaveBeenCalledWith({ day: 2, month: 2, name: 'City day' })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await user.click(within(local).getByRole('button', { name: 'Excluir State day' }))
    expect(remove).toHaveBeenCalledWith(1)
  })

  it('shows why a holiday was refused', async () => {
    const { local, user } = await renderHolidays()
    vi.spyOn(localHolidaysApi, 'create').mockRejectedValue(new ApiError(409, 'Já existe um feriado nesse dia.', {}))

    await user.type(within(local).getByLabelText('Dia'), '20')
    await user.selectOptions(within(local).getByLabelText('Mês'), 'Setembro')
    await user.type(within(local).getByLabelText('Nome'), 'Again')
    await user.click(within(local).getByRole('button', { name: 'Adicionar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um feriado nesse dia.')
  })
})
