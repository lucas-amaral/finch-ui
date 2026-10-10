import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { balancesApi } from '../api/endpoints'
import type { BalanceSnapshot, BalanceYear } from '../api/types'
import { renderPage } from '../test/render'
import { BalancesPage } from './BalancesPage'

const snapshot = (month: string, checking: number): BalanceSnapshot => ({ month, checking, savings: 100, company: 0, invested: 250.5, total: checking + 350.5 })

function yearOf(year: number): BalanceYear {
  return {
    year,
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      snapshot: index === 0 ? snapshot(`${year}-01`, 1000) : index === 1 ? snapshot(`${year}-02`, 700) : null,
      change: index === 0 ? 500 : index === 1 ? -300 : null,
    })),
  }
}

async function renderBalances() {
  const year = vi.spyOn(balancesApi, 'year').mockImplementation(async (which) => yearOf(which))
  renderPage(<BalancesPage />)
  await screen.findByRole('region', { name: 'Caixa' })
  return { year, user: userEvent.setup() }
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-02-15T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('BalancesPage', () => {
  it('shows each month of the current year with its places, total and change', async () => {
    const { year } = await renderBalances()

    expect(year).toHaveBeenCalledWith(2026)
    const january = screen.getByRole('row', { name: /^Janeiro/ })
    expect(within(january).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '1.000,00', '100,00', '0,00', '250,50', '1.350,50', '+500,00',
    ])
    expect(within(january).getByText('+500,00')).toHaveClass('positive')
    const february = screen.getByRole('row', { name: /^Fevereiro/ })
    expect(february).toHaveClass('current-month')
    expect(within(february).getByText('-300,00')).toHaveClass('negative')
    expect(within(screen.getByRole('row', { name: /^Março/ })).getAllByText('—')).toHaveLength(5)
  })

  it('writes down the balances of an empty month, counting a blank place as zero', async () => {
    const { year, user } = await renderBalances()
    const set = vi.spyOn(balancesApi, 'set').mockResolvedValue(snapshot('2026-03', 1))

    await user.click(screen.getByRole('button', { name: 'Março' }))
    const dialog = screen.getByRole('dialog', { name: 'Caixa · março de 2026' })
    expect(within(dialog).queryByRole('button', { name: 'Limpar' })).not.toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Conta'), '150000')
    await user.type(within(dialog).getByLabelText('Investido'), '20050')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(set).toHaveBeenCalledWith('2026-03', { checking: 1500, savings: 0, company: 0, invested: 200.5 })
    await waitFor(() => expect(year).toHaveBeenCalledTimes(2))
  })

  it('edits a month that has balances, and can clear it', async () => {
    const { user } = await renderBalances()
    const clear = vi.spyOn(balancesApi, 'clear').mockResolvedValue(undefined)

    await user.click(screen.getByRole('button', { name: 'Janeiro' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Conta')).toHaveValue('1.000,00')
    expect(within(dialog).getByLabelText('Investido')).toHaveValue('250,50')
    await user.click(within(dialog).getByRole('button', { name: 'Limpar' }))

    expect(clear).toHaveBeenCalledWith('2026-01')
  })

  it('keeps the form open with the server message when saving fails, and moves between years', async () => {
    const { year, user } = await renderBalances()
    vi.spyOn(balancesApi, 'set').mockRejectedValue(new ApiError(400, 'Um ou mais campos são inválidos.', { checking: 'Informe o valor em conta.' }))

    await user.click(screen.getByRole('button', { name: 'Março' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Um ou mais campos são inválidos.')
    expect(within(dialog).getByText('Informe o valor em conta.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Próximo ano' }))
    await waitFor(() => expect(year).toHaveBeenLastCalledWith(2027))
  })

  it('projects the months without a value from the last total written down, 10 thousand a month', async () => {
    await renderBalances()

    // February closed with 1.050,50.
    expect(within(screen.getByRole('row', { name: /^Março/ })).getByText('11.050,50')).toHaveClass('forecast')
    expect(within(screen.getByRole('row', { name: /^Dezembro/ })).getByText('101.050,50')).toBeInTheDocument()
    expect(screen.getByText('Projeção para dezembro').nextSibling).toHaveTextContent('R$ 101.050,50')
    const chart = screen.getByRole('region', { name: 'Total nas contas' })
    expect(within(chart).getByRole('button', { name: /^Março: R\$\s11\.050,50, projeção$/ })).toBeInTheDocument()
    expect(within(chart).getByRole('button', { name: /^Fevereiro: R\$\s1\.050,50$/ })).toBeInTheDocument()
  })

  it('lets the monthly projection be changed, and remembers it', async () => {
    const { user } = await renderBalances()
    const monthly = screen.getByLabelText('Projetar por mês')

    await user.clear(monthly)
    await user.type(monthly, '50000')

    expect(within(screen.getByRole('row', { name: /^Março/ })).getByText('1.550,50')).toBeInTheDocument()
    expect(localStorage.getItem('finch.future.projection')).toBe('500.00')
  })

  it('sums up where the total stands and how it moved', async () => {
    await renderBalances()

    expect(screen.getByText('Último total informado').nextSibling).toHaveTextContent('R$ 1.050,50')
    expect(screen.getByText('No mês').nextSibling).toHaveTextContent('-R$ 300,00')
    expect(screen.getByText('No ano').nextSibling).toHaveTextContent('-R$ 300,00')
  })

  it('projects a year with nothing written down from where the year before ended', async () => {
    const empty = (which: number) => ({ year: which, months: yearOf(which).months.map((month) => ({ ...month, snapshot: null, change: null })) })
    vi.spyOn(balancesApi, 'year').mockImplementation(async (which) => (which === 2026 ? empty(which) : yearOf(which)))
    renderPage(<BalancesPage />)

    // 2025 ended in February with 1.050,50; January 2026 is eleven months later.
    const january = await screen.findByRole('row', { name: /^Janeiro/ })
    expect(within(january).getByText('111.050,50')).toBeInTheDocument()
  })
})
