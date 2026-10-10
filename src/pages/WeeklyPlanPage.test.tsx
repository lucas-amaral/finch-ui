import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { weeklyPlanApi } from '../api/endpoints'
import type { PlannedWeek, WeeklyBudget } from '../api/types'
import { renderPage } from '../test/render'
import { WeeklyPlanPage } from './WeeklyPlanPage'

const budget: WeeklyBudget = { id: 1, validFrom: '2026-01-04', totalAmount: 3000, foodAmount: 1500 }
const week = (start: string, end: string, extra: Partial<PlannedWeek> = {}): PlannedWeek => ({
  start,
  end,
  budgetTotal: 3000,
  directSpending: 2000.5,
  installmentShare: 1500,
  totalSpending: 3500.5,
  balance: -500.5,
  nonFoodSpending: 800.5,
  foodBudget: 1500,
  foodSpending: 1200,
  foodBalance: 300,
  ...extra,
})

async function renderPlan(budgets = [budget]) {
  const get = vi.spyOn(weeklyPlanApi, 'get').mockImplementation(async (year) => ({
    year,
    weeks: [
      week(`${year}-10-04`, `${year}-10-10`),
      week(`${year}-10-11`, `${year}-10-17`, { budgetTotal: null, balance: null, foodBudget: null, foodBalance: null }),
    ],
  }))
  const listBudgets = vi.spyOn(weeklyPlanApi, 'listBudgets').mockResolvedValue(budgets)
  renderPage(<WeeklyPlanPage />)
  await screen.findByRole('region', { name: 'Semanas' })
  return { get, listBudgets, user: userEvent.setup() }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WeeklyPlanPage', () => {
  it('shows each week of the current year against its budget, marking the week of today', async () => {
    const { get } = await renderPlan()

    expect(get).toHaveBeenCalledWith(2026)
    const row = screen.getByRole('row', { name: /^04\/10 a 10\/10/ })
    expect(row).toHaveClass('current-month')
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '3.000,00', '2.000,50', '1.500,00', '3.500,50', '-500,50', '800,50', '1.500,00', '1.200,00', '300,00',
    ])
    expect(within(row).getByText('-500,50')).toHaveClass('negative')
    expect(within(row).getByText('300,00')).toHaveClass('positive')
  })

  it('leaves budget and balances blank in a week without a budget', async () => {
    await renderPlan()

    const row = screen.getByRole('row', { name: /^11\/10 a 17\/10/ })
    expect(row).not.toHaveClass('current-month')
    expect(within(row).getAllByText('—')).toHaveLength(4)
  })

  it('lists the budgets and creates a new one', async () => {
    const { get, user } = await renderPlan()
    const create = vi.spyOn(weeklyPlanApi, 'createBudget').mockResolvedValue(budget)
    const budgets = screen.getByRole('region', { name: 'Orçamentos' })
    expect(within(budgets).getByText('04/01/2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Novo orçamento' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo orçamento' })
    expect(within(dialog).getByLabelText(/^A partir de/)).toHaveValue('2026-10-08')
    await user.type(within(dialog).getByLabelText(/^Total por semana/), '350000')
    await user.type(within(dialog).getByLabelText(/^Alimentação por semana/), '180000')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(create).toHaveBeenCalledWith({ validFrom: '2026-10-08', totalAmount: 3500, foodAmount: 1800 })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  it('edits a budget and shows the server message when it is refused', async () => {
    const { user } = await renderPlan()
    const update = vi
      .spyOn(weeklyPlanApi, 'updateBudget')
      .mockRejectedValue(new ApiError(422, 'O orçamento de alimentação não pode ser maior que o total.'))

    await user.click(screen.getByRole('button', { name: 'Editar o orçamento de 04/01/2026' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar orçamento' })
    expect(within(dialog).getByLabelText(/^Total por semana/)).toHaveValue('3.000,00')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(update).toHaveBeenCalledWith(1, { validFrom: '2026-01-04', totalAmount: 3000, foodAmount: 1500 })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('não pode ser maior que o total')
  })

  it('deletes a budget only after confirmation', async () => {
    const { user } = await renderPlan()
    const remove = vi.spyOn(weeklyPlanApi, 'removeBudget').mockResolvedValue(undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await user.click(screen.getByRole('button', { name: 'Excluir o orçamento de 04/01/2026' }))
    expect(remove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Excluir o orçamento de 04/01/2026' }))
    expect(remove).toHaveBeenCalledWith(1)
  })

  it('explains what budgets are for when there is none, and moves between years', async () => {
    const { get, user } = await renderPlan([])

    expect(screen.getByText(/Sem orçamento, as semanas mostram só os gastos/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ano anterior' }))
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(2025))
  })

  it('puts the current week in focus, with the two limits and what the total is made of', async () => {
    await renderPlan()
    const focus = screen.getByRole('region', { name: 'Semana em foco' })

    expect(within(focus).getByText('04/10 a 10/10')).toBeInTheDocument()
    expect(within(focus).getByText('semana atual')).toBeInTheDocument()
    const food = within(focus).getByRole('group', { name: 'Alimentação' })
    expect(food).toHaveTextContent('R$ 1.200,00')
    expect(food).toHaveTextContent('R$ 300,00 livres')
    const total = within(focus).getByRole('group', { name: 'Total no cartão' })
    expect(total).toHaveTextContent('R$ 3.500,50')
    expect(total).toHaveTextContent('R$ 500,50 acima')
    const parts = within(focus).getByRole('group', { name: 'Do que o total é feito' })
    expect(within(parts).getAllByRole('definition').map((each) => each.textContent)).toEqual(['1.200,00', '800,50', '1.500,00', '3.500,50'])
  })

  it('moves the focus to another week, which may have no limit yet', async () => {
    const { user } = await renderPlan()
    const focus = screen.getByRole('region', { name: 'Semana em foco' })

    await user.click(within(focus).getByRole('button', { name: 'Próxima semana' }))

    expect(within(focus).getByText('11/10 a 17/10')).toBeInTheDocument()
    expect(within(focus).getByText('futura')).toBeInTheDocument()
    expect(within(focus).getByRole('group', { name: 'Alimentação' })).toHaveTextContent('sem limite cadastrado')

    await user.click(within(focus).getByRole('button', { name: /^Semana de 04\/10 a 10\/10/ }))
    expect(within(focus).getByText('semana atual')).toBeInTheDocument()
  })
})
