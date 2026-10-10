import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { budgetYearsApi } from '../api/endpoints'
import type { BudgetEntry, BudgetYear, BudgetYearLine } from '../api/types'
import { renderPage } from '../test/render'
import { YearPage } from './YearPage'

const rent: BudgetYearLine = { id: 1, name: 'Rent', kind: 'EXPENSE', groupName: 'Casa', dueDay: 5, active: true, average: 1000, nature: 'FIXED' }
const power: BudgetYearLine = { id: 2, name: 'Power', kind: 'EXPENSE', groupName: 'Casa', dueDay: null, active: true, average: 150, nature: 'VARIABLE' }
const fine: BudgetYearLine = { id: 4, name: 'Fine', kind: 'EXPENSE', groupName: null, dueDay: null, active: true, average: 50, nature: 'OCCASIONAL' }
const doctor: BudgetYearLine = { id: 5, name: 'Doctor', kind: 'EXPENSE', groupName: null, dueDay: null, active: true, average: 80, nature: 'OCCASIONAL' }
const salary: BudgetYearLine = { id: 3, name: 'Salary', kind: 'INCOME', groupName: null, dueDay: null, active: true, average: 5000, nature: 'VARIABLE' }

/** January is closed, February (the current month) has the rent paid and the power still open, March is a forecast. */
function budgetOf(year: number, lines = [rent, power, fine, doctor, salary]): BudgetYear {
  const filled: Record<number, BudgetEntry[]> = {
    1: [
      { lineId: 1, amount: 1000, settled: true },
      { lineId: 2, amount: 120, settled: true },
      { lineId: 3, amount: 5000, settled: true },
      { lineId: 4, amount: 50, settled: true },
    ],
    2: [
      { lineId: 1, amount: 1000, settled: true },
      { lineId: 2, amount: 200, settled: false },
      { lineId: 3, amount: 5000, settled: false },
    ],
    3: [
      { lineId: 1, amount: 1000, settled: false },
      { lineId: 5, amount: 80, settled: false },
    ],
  }
  const totals: Record<number, [number, number]> = { 1: [1120, 5000], 2: [1200, 5000], 3: [1000, 0] }
  return {
    year,
    lines,
    months: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1
      const [expenseTotal, incomeTotal] = totals[month] ?? [0, 0]
      return { month, entries: filled[month] ?? [], expenseTotal, incomeTotal, balance: incomeTotal - expenseTotal }
    }),
    averages: { expenseTotal: 1106.67, incomeTotal: 5000, balance: 2226.67 },
  }
}

async function renderYear() {
  const get = vi.spyOn(budgetYearsApi, 'get').mockImplementation(async (year) => budgetOf(year))
  renderPage(<YearPage />)
  await screen.findByRole('region', { name: 'Contas do ano' })
  return { get, user: userEvent.setup() }
}

const cellsOf = (name: RegExp | string) =>
  within(screen.getByRole('row', { name }))
    .getAllByRole('cell')
    .map((cell) => cell.textContent)

beforeEach(() => {
  localStorage.clear()
  // "Today" is in February 2026.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-02-15T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('YearPage', () => {
  it('opens on the current year with the bills in rows, by group, and the months in columns', async () => {
    const { get } = await renderYear()

    expect(get).toHaveBeenCalledWith(2026)
    expect(screen.getByRole('cell', { name: 'Fixas' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Variáveis' })).toBeInTheDocument()
    expect(cellsOf(/^Rent/)).toEqual(['1.000', '1.000', '1.000', '', '', '', '', '', '', '', '', '', '3.000', '1.000'])
    expect(cellsOf(/^Power/).slice(0, 3)).toEqual(['120', '200', ''])
  })

  it('sums the occasional bills in one row until their detail is asked for', async () => {
    const { user } = await renderYear()

    expect(cellsOf(/^Extra 2 itens/)).toEqual(['50', '', '80', '', '', '', '', '', '', '', '', '', '130', '11'])
    expect(screen.queryByRole('row', { name: /^Fine/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Detalhar extras' }))

    expect(cellsOf(/^Fine/).slice(0, 3)).toEqual(['50', '', ''])
    expect(cellsOf(/^Doctor/).slice(0, 3)).toEqual(['', '', '80'])
    expect(screen.queryByRole('row', { name: /^Extra 2 itens/ })).not.toBeInTheDocument()
  })

  it('closes the table with what was spent and what was left in each month', async () => {
    await renderYear()

    expect(cellsOf(/^Total gasto/).slice(0, 3)).toEqual(['1.120', '1.200', '1.000'])
    expect(cellsOf(/^Total gasto/).slice(12)).toEqual(['3.320', '1.107'])
    expect(cellsOf(/^Sobra/).slice(0, 3)).toEqual(['3.880', '3.800', '-1.000'])
    const balances = within(screen.getByRole('row', { name: /^Sobra/ })).getAllByRole('cell')
    expect(balances[0]).toHaveClass('positive')
    expect(balances[2]).toHaveClass('negative')
  })

  it('tells what is paid from what is a forecast, and what strays from the average of the bill', async () => {
    await renderYear()
    const power = within(screen.getByRole('row', { name: /^Power/ })).getAllByRole('cell')

    expect(power[0]).toHaveClass('settled', 'below')
    expect(power[1]).toHaveClass('forecast', 'above')
  })

  it('stops highlighting when asked, and remembers it', async () => {
    const { user } = await renderYear()

    await user.click(screen.getByRole('button', { name: 'Destacar variações' }))

    const power = within(screen.getByRole('row', { name: /^Power/ })).getAllByRole('cell')
    expect(power[1]).not.toHaveClass('above')
    expect(localStorage.getItem('finch.year.highlight')).toBe('false')
  })

  it('keeps the incomes out of the table until they are asked for', async () => {
    const { user } = await renderYear()
    expect(screen.queryByRole('row', { name: /^Salary/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mostrar receitas' }))

    expect(cellsOf(/^Salary/).slice(0, 2)).toEqual(['5.000', '5.000'])
    expect(cellsOf(/^Total de receitas/).slice(0, 2)).toEqual(['5.000', '5.000'])
  })

  it('sums up the year and the current month above the table', async () => {
    await renderYear()

    expect(screen.getByText('Gasto no ano').nextSibling).toHaveTextContent('R$ 3.320,00')
    expect(screen.getByText('Sobra no ano').nextSibling).toHaveTextContent('R$ 6.680,00')
    expect(screen.getByText('Fevereiro até agora').nextSibling).toHaveTextContent('R$ 1.000,00')
    expect(screen.getByText(/de R\$ 1\.200,00 previstos · faltam R\$ 200,00/)).toBeInTheDocument()
    expect(screen.getByText('Próximos 3 meses').nextSibling).toHaveTextContent('R$ 1.000,00')
  })

  it('details the current month first and any other month when it is clicked', async () => {
    const { user } = await renderYear()
    const strip = screen.getByRole('region', { name: 'Mês selecionado' })

    expect(within(strip).getByText('Mês atual')).toBeInTheDocument()
    expect(within(strip).getByText('Fevereiro de 2026')).toBeInTheDocument()
    expect(within(strip).getByText('Falta pagar').nextSibling).toHaveTextContent('R$ 200,00')
    expect(within(strip).getByRole('link', { name: 'Abrir contas do mês' })).toHaveAttribute('href', '/month?m=2026-02')

    await user.click(screen.getByRole('button', { name: 'Março' }))

    expect(within(strip).getByText('Projeção')).toBeInTheDocument()
    expect(within(strip).getByText('Sobra').nextSibling).toHaveTextContent('-R$ 1.000,00')
    expect(within(strip).getByRole('link', { name: 'Abrir contas do mês' })).toHaveAttribute('href', '/month?m=2026-03')
  })

  it('loads another year when the year is changed', async () => {
    const { get, user } = await renderYear()

    await user.click(screen.getByRole('button', { name: 'Ano anterior' }))

    expect(get).toHaveBeenLastCalledWith(2025)
    expect(await screen.findByText('Fevereiro de 2025')).toBeInTheDocument()
    expect(screen.getByText('Mês fechado')).toBeInTheDocument()
  })

  it('says so when the year has nothing', async () => {
    vi.spyOn(budgetYearsApi, 'get').mockResolvedValue(budgetOf(2026, []))
    renderPage(<YearPage />)

    expect(await screen.findByRole('heading', { name: 'Nada em 2026' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver contas e rendas' })).toHaveAttribute('href', '/settings/lines')
  })

  it('shows the error of the API and lets the user try again', async () => {
    const get = vi.spyOn(budgetYearsApi, 'get').mockRejectedValueOnce(new ApiError(500, 'Erro inesperado.', {}))
    renderPage(<YearPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro inesperado.')

    get.mockImplementation(async (year) => budgetOf(year))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('region', { name: 'Contas do ano' })).toBeInTheDocument()
  })
})
