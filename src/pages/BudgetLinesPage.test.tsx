import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { budgetLinesApi } from '../api/endpoints'
import type { BudgetLine } from '../api/types'
import { renderPage } from '../test/render'
import { BudgetLinesPage } from './BudgetLinesPage'

const rent: BudgetLine = {
  id: 1,
  name: 'Rent',
  kind: 'EXPENSE',
  groupName: 'Casa',
  dueDay: 5,
  active: true,
  forecastRule: 'SAME_MONTH_LAST_YEAR',
  nature: 'VARIABLE',
  sessionPrice: null,
  sessionWeekday: null,
  sessionsFromPreviousMonth: true,
  sortOrder: 1,
}
const salary: BudgetLine = {
  id: 2,
  name: 'Salary',
  kind: 'INCOME',
  groupName: null,
  dueDay: null,
  active: false,
  forecastRule: 'NONE',
  nature: 'VARIABLE',
  sessionPrice: null,
  sessionWeekday: null,
  sessionsFromPreviousMonth: true,
  sortOrder: 1,
}

async function renderLines(lines = [rent, salary]) {
  const list = vi.spyOn(budgetLinesApi, 'list').mockResolvedValue(lines)
  renderPage(<BudgetLinesPage />)
  await screen.findByRole('heading', { name: 'Contas e rendas' })
  await waitFor(() => expect(screen.queryByText('Carregando…')).not.toBeInTheDocument())
  return { list, user: userEvent.setup() }
}

beforeEach(() => {
  localStorage.clear()
})

describe('BudgetLinesPage', () => {
  it('lists bills and incomes with group, due day and situation', async () => {
    await renderLines()

    const rentRow = screen.getByText('Rent').closest('tr')!
    expect(within(rentRow).getByText('Conta')).toBeInTheDocument()
    expect(within(rentRow).getByText('Casa')).toBeInTheDocument()
    expect(within(rentRow).getByText('Dia 5')).toBeInTheDocument()
    expect(within(rentRow).getByText('Mesmo mês do ano anterior')).toBeInTheDocument()
    expect(within(rentRow).getByText('Ativa')).toBeInTheDocument()
  })

  it('hides the inactive ones until asked, and remembers the choice', async () => {
    const { user } = await renderLines()
    expect(screen.queryByText('Salary')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mostrar inativas (1)' }))

    const salaryRow = screen.getByText('Salary').closest('tr')!
    expect(within(salaryRow).getByText('Renda')).toBeInTheDocument()
    expect(within(salaryRow).getByText('Inativa')).toBeInTheDocument()
    expect(localStorage.getItem('finch.settings.lines.inactive')).toBe('true')
  })

  it('creates a bill with what was typed and reloads the list', async () => {
    const { list, user } = await renderLines()
    const create = vi.spyOn(budgetLinesApi, 'create').mockResolvedValue({ ...rent, id: 3, name: 'Power' })

    await user.click(screen.getByRole('button', { name: 'Nova conta' }))
    const dialog = screen.getByRole('dialog', { name: 'Nova conta' })
    await user.type(within(dialog).getByLabelText(/^Nome/), 'Power')
    await user.type(within(dialog).getByLabelText(/^Grupo/), ' Casa ')
    await user.type(within(dialog).getByLabelText(/^Dia de vencimento/), '30')
    await user.selectOptions(within(dialog).getByLabelText(/^Valor de cada mês/), 'Fixa: o mesmo valor todo mês')
    await user.selectOptions(within(dialog).getByLabelText(/^Previsão/), 'Mesmo mês do ano anterior')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(create).toHaveBeenCalledWith({
      name: 'Power',
      kind: 'EXPENSE',
      groupName: 'Casa',
      dueDay: 30,
      active: true,
      forecastRule: 'SAME_MONTH_LAST_YEAR',
      nature: 'FIXED',
      sessionPrice: null,
      sessionWeekday: null,
      sessionsFromPreviousMonth: true,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('creates a bill charged per session, with its price and weekday', async () => {
    const { user } = await renderLines()
    const create = vi.spyOn(budgetLinesApi, 'create').mockResolvedValue({ ...rent, id: 3, name: 'Pilates' })

    await user.click(screen.getByRole('button', { name: 'Nova conta' }))
    const dialog = screen.getByRole('dialog', { name: 'Nova conta' })
    await user.type(within(dialog).getByLabelText(/^Nome/), 'Pilates')
    await user.selectOptions(within(dialog).getByLabelText(/^Previsão/), 'Por sessão: valor × sessões do mês, sem feriados')
    await user.type(within(dialog).getByLabelText('Valor da sessão'), '7000')
    await user.selectOptions(within(dialog).getByLabelText('Dia das sessões'), 'quarta')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ forecastRule: 'PER_SESSION', sessionPrice: 70, sessionWeekday: 3, sessionsFromPreviousMonth: true }),
    )
  })

  it('shows a bill per session by its price and weekday', async () => {
    await renderLines([{ ...rent, name: 'Pilates', forecastRule: 'PER_SESSION', sessionPrice: 70, sessionWeekday: 3 }])

    const row = screen.getByText('Pilates').closest('tr')!
    expect(within(row).getByText(/R\$\s70,00 por sessão, às quartas/)).toBeInTheDocument()
  })

  it('creates an income, with no group and no day when they are left empty', async () => {
    const { user } = await renderLines()
    const create = vi.spyOn(budgetLinesApi, 'create').mockResolvedValue(salary)

    await user.click(screen.getByRole('button', { name: 'Nova renda' }))
    const dialog = screen.getByRole('dialog', { name: 'Nova renda' })
    expect(within(dialog).getByLabelText(/^Dia de recebimento/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Previsão/)).toHaveValue('LAST_VALUE')
    await user.type(within(dialog).getByLabelText(/^Nome/), 'Bonus')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(create).toHaveBeenCalledWith({
      name: 'Bonus',
      kind: 'INCOME',
      groupName: null,
      dueDay: null,
      active: true,
      forecastRule: 'LAST_VALUE',
      nature: 'VARIABLE',
      sessionPrice: null,
      sessionWeekday: null,
      sessionsFromPreviousMonth: true,
    })
  })

  it('edits a line keeping its kind', async () => {
    const { user } = await renderLines()
    const update = vi.spyOn(budgetLinesApi, 'update').mockResolvedValue(rent)

    await user.click(screen.getByRole('button', { name: 'Editar Rent' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar conta' })
    expect(within(dialog).getByLabelText(/^Nome/)).toHaveValue('Rent')
    expect(within(dialog).getByLabelText(/^Dia de vencimento/)).toHaveValue(5)
    await user.click(within(dialog).getByLabelText(/^Ativa/))
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(update).toHaveBeenCalledWith(1, {
      name: 'Rent',
      kind: 'EXPENSE',
      groupName: 'Casa',
      dueDay: 5,
      active: false,
      forecastRule: 'SAME_MONTH_LAST_YEAR',
      nature: 'VARIABLE',
      sessionPrice: null,
      sessionWeekday: null,
      sessionsFromPreviousMonth: true,
    })
  })

  it('keeps the form open with the server errors when saving fails', async () => {
    const { user } = await renderLines()
    vi.spyOn(budgetLinesApi, 'update').mockRejectedValue(new ApiError(409, 'Já existe um cadastro com este nome neste grupo.'))

    await user.click(screen.getByRole('button', { name: 'Editar Rent' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um cadastro com este nome neste grupo.')
  })

  it('deletes only after confirmation and shows why the server refused', async () => {
    const { user } = await renderLines()
    const remove = vi
      .spyOn(budgetLinesApi, 'remove')
      .mockRejectedValue(new ApiError(409, 'Há valores lançados neste cadastro. Desative-o em vez de excluir.'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await user.click(screen.getByRole('button', { name: 'Excluir Rent' }))
    expect(confirm).toHaveBeenCalledWith('Excluir "Rent"?')
    expect(remove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Excluir Rent' }))
    expect(remove).toHaveBeenCalledWith(1)
    expect(await screen.findByRole('alert')).toHaveTextContent('Desative-o em vez de excluir.')
  })

  it('says so when nothing is registered yet', async () => {
    await renderLines([])

    expect(screen.getByText('Nada cadastrado ainda')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
