import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { cardSpendingApi, cardsApi } from '../api/endpoints'
import type { CardSpendingYear, CreditCard, SpendingRow } from '../api/types'
import { renderPage } from '../test/render'
import { SpendingPage } from './SpendingPage'

const empty: SpendingRow = { byCategory: {}, uncategorized: 0, installments: 0, foodTotal: 0, nonFoodTotal: 0, total: 0 }
const january: SpendingRow = { byCategory: { 1: 400.5, 3: 80 }, uncategorized: 20, installments: 200, foodTotal: 400.5, nonFoodTotal: 300, total: 700.5 }
const february: SpendingRow = { byCategory: { 1: 300 }, uncategorized: 0, installments: 200, foodTotal: 300, nonFoodTotal: 200, total: 500 }

function spendingOf(year: number, withData = true): CardSpendingYear {
  return {
    year,
    categories: withData ? [{ id: 1, name: 'Mercado', food: true, sortOrder: 1 }, { id: 3, name: 'Gasolina', food: false, sortOrder: 3 }] : [],
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      spending: withData ? ([january, february][index] ?? empty) : empty,
      changeFromPrevious: withData ? ([150.5, -200.5, -500][index] ?? 0) : 0,
    })),
    total: withData ? { byCategory: { 1: 700.5, 3: 80 }, uncategorized: 20, installments: 400, foodTotal: 700.5, nonFoodTotal: 500, total: 1200.5 } : empty,
    average: withData ? { byCategory: { 1: 350.25, 3: 40 }, uncategorized: 10, installments: 200, foodTotal: 350.25, nonFoodTotal: 250, total: 600.25 } : null,
  }
}

const card = (id: number, name: string, active = true): CreditCard => ({ id, name, closingDay: 10, dueDay: 17, budgetLineId: null, active, currentInvoiceMonth: '2026-02' })

async function renderSpending() {
  vi.spyOn(cardsApi, 'list').mockResolvedValue([card(1, 'Main'), card(2, 'Second'), card(3, 'Retired', false)])
  const get = vi.spyOn(cardSpendingApi, 'get').mockImplementation(async (year) => spendingOf(year))
  renderPage(<SpendingPage />)
  const table = await screen.findByRole('region', { name: 'Gasto por categoria' })
  return { get, table, user: userEvent.setup() }
}

const cellsOf = (table: HTMLElement, name: RegExp) =>
  within(within(table).getByRole('row', { name }))
    .getAllByRole('cell')
    .map((cell) => cell.textContent)

beforeEach(() => {
  vi.spyOn(cardsApi, 'list').mockResolvedValue([])
  localStorage.clear()
  // "Today" is in February 2026.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-02-15T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SpendingPage', () => {
  it('opens on the current year with one row per kind of spending and the months in columns', async () => {
    const { get, table } = await renderSpending()

    expect(get).toHaveBeenCalledWith(2026, undefined)
    expect(within(table).getAllByRole('rowheader').map((header) => header.textContent)).toEqual([
      'Mercado', 'Gasolina', 'Outros', 'Parcelado', 'Alimentação', 'Sem alimentação', 'Total', 'Variação',
    ])
    expect(cellsOf(table, /^Mercado/)).toEqual(['400,50', '300,00', '', '', '', '', '', '', '', '', '', '', '700,50', '350,25'])
    expect(cellsOf(table, /^Total/).slice(0, 3)).toEqual(['700,50', '500,00', ''])
  })

  it('shows how the total moved from the month before, with more spending as the bad direction', async () => {
    const { table } = await renderSpending()
    const change = within(within(table).getByRole('row', { name: /^Variação/ })).getAllByRole('cell')

    expect(change[0]).toHaveTextContent('+150,50')
    expect(change[0]).toHaveClass('negative')
    expect(change[1]).toHaveTextContent('-200,50')
    expect(change[1]).toHaveClass('positive')
  })

  it('highlights what strays more than 10% from the average of the category, only in months with spending', async () => {
    const { table } = await renderSpending()
    const market = within(within(table).getByRole('row', { name: /^Mercado/ })).getAllByRole('cell')

    expect(market[0]).toHaveClass('above')
    expect(market[1]).toHaveClass('below')
    expect(market[2]).not.toHaveClass('below')
  })

  it('stops highlighting when asked, and remembers it', async () => {
    const { table, user } = await renderSpending()

    await user.click(screen.getByRole('button', { name: 'Destacar variações' }))

    const market = within(within(table).getByRole('row', { name: /^Mercado/ })).getAllByRole('cell')
    expect(market[0]).not.toHaveClass('above')
    expect(localStorage.getItem('finch.spending.highlight')).toBe('false')
    expect(screen.queryByText(/mais de 10% acima/)).not.toBeInTheDocument()
  })

  it('details the current month against the month before and the average', async () => {
    await renderSpending()
    const detail = screen.getByRole('region', { name: 'Detalhe de fevereiro' })

    expect(within(detail).getByText('R$ 500,00')).toBeInTheDocument()
    const market = within(within(detail).getByRole('row', { name: /Mercado/ })).getAllByRole('cell')
    expect(market.map((cell) => cell.textContent)).toEqual(['300', '-25,1%', '-14,3%'])
    expect(market[1]).toHaveClass('positive')
  })

  it('details another month when its bar or its column is clicked', async () => {
    const { table, user } = await renderSpending()

    await user.click(screen.getByRole('button', { name: /^Janeiro: R\$\s700,50$/ }))
    expect(screen.getByRole('region', { name: 'Detalhe de janeiro' })).toBeInTheDocument()

    await user.click(within(table).getByRole('button', { name: 'Fevereiro' }))
    expect(screen.getByRole('region', { name: 'Detalhe de fevereiro' })).toBeInTheDocument()
  })

  it('points out where the month ran over, what weighs the most and where it was light', async () => {
    const { user } = await renderSpending()
    await user.click(screen.getByRole('button', { name: /^Janeiro: R\$\s700,50$/ }))

    expect(screen.getByText('Mercado: R$ 50,25 acima da média')).toBeInTheDocument()
    expect(screen.getByText('Mercado: 57% do mês')).toBeInTheDocument()
    expect(screen.queryByText(/abaixo da média/)).not.toBeInTheDocument()
  })

  it('shows the spending of one card only when it is picked among the active ones', async () => {
    const { get, user } = await renderSpending()
    expect(screen.queryByRole('tab', { name: 'Retired' })).not.toBeInTheDocument()

    await user.click(await screen.findByRole('tab', { name: 'Second' }))
    expect(get).toHaveBeenLastCalledWith(2026, 2)

    await user.click(screen.getByRole('tab', { name: 'Todos os cartões' }))
    expect(get).toHaveBeenLastCalledWith(2026, undefined)
  })

  it('loads another year when the year is changed', async () => {
    const { get, user } = await renderSpending()

    await user.click(screen.getByRole('button', { name: 'Ano anterior' }))

    expect(get).toHaveBeenLastCalledWith(2025, undefined)
    // Out of the current year, the detail goes to the last month with spending.
    expect(await screen.findByRole('region', { name: 'Detalhe de fevereiro' })).toBeInTheDocument()
  })

  it('says so when the year has no spending', async () => {
    vi.spyOn(cardSpendingApi, 'get').mockResolvedValue(spendingOf(2026, false))
    renderPage(<SpendingPage />)

    expect(await screen.findByRole('heading', { name: 'Nada em 2026' })).toBeInTheDocument()
  })

  it('shows the error of the API and lets the user try again', async () => {
    const get = vi.spyOn(cardSpendingApi, 'get').mockRejectedValueOnce(new ApiError(500, 'Erro inesperado.', {}))
    renderPage(<SpendingPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro inesperado.')

    get.mockImplementation(async (year) => spendingOf(year))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('region', { name: 'Gasto por categoria' })).toBeInTheDocument()
  })
})
