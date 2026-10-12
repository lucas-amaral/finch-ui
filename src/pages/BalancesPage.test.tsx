import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { balanceAccountsApi, balancesApi } from '../api/endpoints'
import type { BalanceAccount, BalanceSnapshot, BalanceYear } from '../api/types'
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
  vi.spyOn(balanceAccountsApi, 'list').mockResolvedValue([])
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

  describe('with accounts', () => {
    const account = (id: number, name: string, kind: BalanceAccount['kind'], active = true): BalanceAccount => ({ id, name, kind, active, sortOrder: id })
    const accounts = [account(1, 'Bank A', 'CHECKING'), account(2, 'Bank B', 'CHECKING'), account(3, 'Fund', 'INVESTED'), account(4, 'Old', 'SAVINGS', false)]

    async function openMarch() {
      const rendered = await renderBalances()
      vi.spyOn(balanceAccountsApi, 'list').mockResolvedValue(accounts)
      return rendered
    }

    it('asks for the balance of each active account, by kind, and sends them all', async () => {
      vi.spyOn(balanceAccountsApi, 'list').mockResolvedValue(accounts)
      vi.spyOn(balancesApi, 'accounts').mockResolvedValue([{ accountId: 1, amount: 1000 }])
      const set = vi.spyOn(balancesApi, 'setAccounts').mockResolvedValue(snapshot('2026-03', 1))
      const { user } = await renderBalances()

      await user.click(screen.getByRole('button', { name: 'Março' }))
      const dialog = screen.getByRole('dialog', { name: 'Caixa · março de 2026' })
      expect(await within(dialog).findByLabelText('Bank A')).toHaveValue('1.000,00')
      expect(within(dialog).queryByLabelText('Old')).not.toBeInTheDocument()
      await user.type(within(dialog).getByLabelText('Bank B'), '25050')
      await user.type(within(dialog).getByLabelText('Fund'), '500000')

      // The total of each kind and of the month follow what is typed.
      expect(within(dialog).getByRole('group', { name: /^Conta/ })).toHaveTextContent('1.250,50')
      expect(within(dialog).getByText('Total do mês').nextSibling).toHaveTextContent('R$ 6.250,50')
      await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      expect(set).toHaveBeenCalledWith('2026-03', [
        { accountId: 1, amount: 1000 },
        { accountId: 2, amount: 250.5 },
        { accountId: 3, amount: 5000 },
      ])
    })

    it('says so when the month was written down by its totals only', async () => {
      vi.spyOn(balanceAccountsApi, 'list').mockResolvedValue(accounts)
      vi.spyOn(balancesApi, 'accounts').mockResolvedValue([])
      const { user } = await renderBalances()

      await user.click(screen.getByRole('button', { name: 'Janeiro' }))

      expect(await screen.findByText(/Este mês foi anotado só pelos totais \(R\$\s1\.350,50\)/)).toBeInTheDocument()
    })

    it('manages the accounts: adds one under a kind, switches one off, removes one', async () => {
      const { user } = await openMarch()
      const create = vi.spyOn(balanceAccountsApi, 'create').mockResolvedValue(account(5, 'Pot', 'SAVINGS'))
      const update = vi.spyOn(balanceAccountsApi, 'update').mockResolvedValue(account(1, 'Bank A', 'CHECKING', false))
      const remove = vi.spyOn(balanceAccountsApi, 'remove').mockResolvedValue(undefined)

      await user.click(screen.getByRole('button', { name: 'Contas' }))
      const dialog = screen.getByRole('dialog', { name: 'Contas' })
      await user.type(within(dialog).getByLabelText('Nome da conta'), 'Pot')
      await user.selectOptions(within(dialog).getByLabelText('Entra em'), 'Guardado')
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))
      expect(create).toHaveBeenCalledWith({ name: 'Pot', kind: 'SAVINGS', active: true })

      await user.click(await within(dialog).findByRole('button', { name: 'Desativar Bank A' }))
      expect(update).toHaveBeenCalledWith(1, { name: 'Bank A', kind: 'CHECKING', active: false })
      await user.click(within(dialog).getByRole('button', { name: 'Excluir Fund' }))
      expect(remove).toHaveBeenCalledWith(3)
    })
  })
})
