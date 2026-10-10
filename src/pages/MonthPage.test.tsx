import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '../api/client'
import { budgetLinesApi, budgetYearsApi } from '../api/endpoints'
import type { BudgetEntry, BudgetYear, BudgetYearLine } from '../api/types'
import { MonthPage } from './MonthPage'

const rent: BudgetYearLine = { id: 1, name: 'Rent', kind: 'EXPENSE', groupName: 'Casa', dueDay: 5, active: true, average: 1000, nature: 'FIXED' }
const power: BudgetYearLine = { id: 2, name: 'Power', kind: 'EXPENSE', groupName: 'Casa', dueDay: 30, active: true, average: 150, nature: 'VARIABLE' }
const school: BudgetYearLine = { id: 4, name: 'School', kind: 'EXPENSE', groupName: null, dueDay: 10, active: true, average: 800, nature: 'VARIABLE' }
const gym: BudgetYearLine = { id: 5, name: 'Gym', kind: 'EXPENSE', groupName: null, dueDay: null, active: true, average: null, nature: 'VARIABLE' }
const doctor: BudgetYearLine = { id: 6, name: 'Doctor', kind: 'EXPENSE', groupName: null, dueDay: null, active: true, average: null, nature: 'OCCASIONAL' }
const fine: BudgetYearLine = { id: 7, name: 'Fine', kind: 'EXPENSE', groupName: null, dueDay: null, active: true, average: null, nature: 'OCCASIONAL' }
const salary: BudgetYearLine = { id: 3, name: 'Salary', kind: 'INCOME', groupName: null, dueDay: null, active: true, average: 5000, nature: 'VARIABLE' }

/** February has the rent paid, the power and the school open, the salary forecast and nothing for the gym. */
function budgetOf(year: number): BudgetYear {
  const february: BudgetEntry[] = [
    { lineId: 2, amount: 200, settled: false },
    { lineId: 1, amount: 1000, settled: true },
    { lineId: 4, amount: 800, settled: false },
    { lineId: 3, amount: 5000, settled: false },
    { lineId: 6, amount: 380, settled: true },
  ]
  return {
    year,
    lines: [rent, power, school, gym, doctor, fine, salary],
    months: Array.from({ length: 12 }, (_, index) => {
      const filled = index === 1
      return { month: index + 1, entries: filled ? february : [], expenseTotal: filled ? 2000 : 0, incomeTotal: filled ? 5000 : 0, balance: filled ? 3000 : 0 }
    }),
    averages: { expenseTotal: 2000, incomeTotal: 5000, balance: 3000 },
  }
}

async function renderMonth(route = '/month') {
  const get = vi.spyOn(budgetYearsApi, 'get').mockImplementation(async (year) => budgetOf(year))
  render(
    <MemoryRouter initialEntries={[route]}>
      <MonthPage />
    </MemoryRouter>,
  )
  await screen.findByRole('region', { name: 'A pagar' })
  return { get, user: userEvent.setup() }
}

const namesIn = (region: string) =>
  within(screen.getByRole('region', { name: region }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByText(/./, { selector: 'strong' }).textContent)

beforeEach(() => {
  // "Today" is in February 2026.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-02-15T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MonthPage', () => {
  it('opens on the current month, with the open bills by due day apart from the paid ones', async () => {
    const { get } = await renderMonth()

    expect(get).toHaveBeenCalledWith(2026)
    expect(screen.getByText('Fevereiro 2026')).toBeInTheDocument()
    expect(namesIn('A pagar')).toEqual(['School', 'Power'])
    expect(namesIn('Pagas')).toEqual(['Rent', 'Doctor'])
    expect(within(screen.getByRole('region', { name: 'A pagar' })).getByText('vence dia 30 · Casa')).toBeInTheDocument()
  })

  it('sums up the month: forecast, paid, still to pay, incomes and what is left', async () => {
    await renderMonth()

    expect(screen.getByText('Gasto previsto').nextSibling).toHaveTextContent('R$ 2.000,00')
    expect(screen.getByText('Já pago').nextSibling).toHaveTextContent('R$ 1.380,00')
    expect(screen.getByText('69% do previsto')).toBeInTheDocument()
    expect(screen.getByText('Falta pagar').nextSibling).toHaveTextContent('R$ 1.000,00')
    expect(screen.getByText('2 em aberto')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Parte do gasto já paga' })).toHaveAttribute('aria-valuenow', '69')
  })

  it('marks a bill as paid with one click, keeping its value', async () => {
    const { get, user } = await renderMonth()
    const setEntry = vi.spyOn(budgetLinesApi, 'setEntry').mockResolvedValue({ lineId: 2, amount: 200, settled: true })

    await user.click(screen.getByRole('button', { name: 'Marcar Power como paga' }))

    expect(setEntry).toHaveBeenCalledWith(2, '2026-02', { amount: 200, settled: true })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  it('undoes a payment the same way', async () => {
    const { user } = await renderMonth()
    const setEntry = vi.spyOn(budgetLinesApi, 'setEntry').mockResolvedValue({ lineId: 1, amount: 1000, settled: false })

    await user.click(screen.getByRole('button', { name: 'Desfazer o pagamento de Rent' }))

    expect(setEntry).toHaveBeenCalledWith(1, '2026-02', { amount: 1000, settled: false })
  })

  it('opens the value of a bill to be changed', async () => {
    const { user } = await renderMonth()
    const setEntry = vi.spyOn(budgetLinesApi, 'setEntry').mockResolvedValue({ lineId: 2, amount: 230, settled: false })

    await user.click(screen.getByRole('button', { name: 'Editar Power' }))
    const dialog = screen.getByRole('dialog', { name: 'Power · fevereiro de 2026' })
    const amount = within(dialog).getByLabelText('Valor')
    await user.clear(amount)
    await user.type(amount, '23000')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(setEntry).toHaveBeenCalledWith(2, '2026-02', { amount: 230, settled: false })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the incomes of the month and what is left', async () => {
    await renderMonth()
    const incomes = screen.getByRole('region', { name: 'Receitas' })

    expect(within(incomes).getByText('Salary')).toBeInTheDocument()
    expect(within(incomes).getByText('previsão')).toBeInTheDocument()
    expect(within(incomes).getByText('Sobra prevista').nextSibling).toHaveTextContent('3.000,00')
  })

  it('lists what has no value in the month, so one can be given', async () => {
    const { user } = await renderMonth()
    const missing = screen.getByRole('region', { name: 'Sem valor neste mês' })

    await user.click(within(missing).getByRole('button', { name: 'Informar valor de Gym' }))

    expect(screen.getByRole('dialog', { name: 'Gym · fevereiro de 2026' })).toBeInTheDocument()
  })

  it('shows only the bills of one nature when asked, without changing the numbers of the month', async () => {
    const { user } = await renderMonth()

    await user.click(screen.getByRole('tab', { name: 'Fixas' }))

    expect(namesIn('Pagas')).toEqual(['Rent'])
    expect(within(screen.getByRole('region', { name: 'A pagar' })).getByText('Nada em aberto.')).toBeInTheDocument()
    expect(screen.getByText('Falta pagar').nextSibling).toHaveTextContent('R$ 1.000,00')

    await user.click(screen.getByRole('tab', { name: 'Extra' }))
    expect(namesIn('Pagas')).toEqual(['Doctor'])
  })

  it('lists the extras of the month apart, and leaves the occasional bills out of what is missing', async () => {
    await renderMonth()

    const extras = screen.getByRole('region', { name: 'Extras deste mês' })
    expect(within(extras).getByText('Doctor')).toBeInTheDocument()
    expect(within(extras).getByText('380,00', { selector: 'strong' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Sem valor neste mês' })).queryByText('Fine')).not.toBeInTheDocument()
  })

  it('registers an extra expense under one of the occasional bills', async () => {
    const { get, user } = await renderMonth()
    const setEntry = vi.spyOn(budgetLinesApi, 'setEntry').mockResolvedValue({ lineId: 7, amount: 195, settled: true })

    await user.click(screen.getByRole('button', { name: 'Lançar gasto extra' }))
    const dialog = screen.getByRole('dialog', { name: 'Gasto extra · fevereiro de 2026' })
    await user.selectOptions(within(dialog).getByLabelText(/^Gasto/), 'Fine')
    await user.type(within(dialog).getByLabelText('Valor'), '19500')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(setEntry).toHaveBeenCalledWith(7, '2026-02', { amount: 195, settled: true })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  it('opens on the month asked for in the address and walks to the next ones, across years', async () => {
    const { get, user } = await renderMonth('/month?m=2025-12')
    expect(screen.getByText('Dezembro 2025')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(2025)

    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))

    expect(await screen.findByText('Janeiro 2026')).toBeInTheDocument()
    expect(get).toHaveBeenLastCalledWith(2026)
  })

  it('fills in the forecasts of the year on request, but not for a year that is over', async () => {
    const { get, user } = await renderMonth()
    const fill = vi.spyOn(budgetYearsApi, 'fillForecasts').mockResolvedValue(budgetOf(2026))

    await user.click(screen.getByRole('button', { name: 'Preencher previsões' }))

    expect(fill).toHaveBeenCalledWith(2026)
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Preencher previsões' })).not.toBeInTheDocument())
  })

  it('shows the error when a bill cannot be marked', async () => {
    const { user } = await renderMonth()
    vi.spyOn(budgetLinesApi, 'setEntry').mockRejectedValue(new ApiError(500, 'Erro inesperado.', {}))

    await user.click(screen.getByRole('button', { name: 'Marcar Power como paga' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro inesperado.')
  })
})
