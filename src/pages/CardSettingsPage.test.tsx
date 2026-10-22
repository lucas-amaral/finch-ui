import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { budgetLinesApi, cardCategoriesApi, cardsApi } from '../api/endpoints'
import type { BudgetLine, CardCategory, CreditCard } from '../api/types'
import { renderPage } from '../test/render'
import { CardSettingsPage } from './CardSettingsPage'

const main: CreditCard = { id: 1, name: 'Main', closingDay: 10, dueDay: 17, budgetLineId: 7, active: true, currentInvoiceMonth: '2026-10' }
const groceries: CardCategory = { id: 1, name: 'Mercado', food: true, sortOrder: 1 }
const fuel: CardCategory = { id: 2, name: 'Gasolina', food: false, sortOrder: 2 }
const line = (id: number, name: string, extra: Partial<BudgetLine> = {}): BudgetLine => ({
  id,
  name,
  kind: 'EXPENSE',
  groupName: 'Casa',
  dueDay: null,
  active: true,
  forecastRule: 'LAST_VALUE',
  nature: 'VARIABLE',
  sessionPrice: null,
  sessionWeekday: null,
  sessionsFromPreviousMonth: true,
  sessionFrequency: 'WEEKLY',
  sessionReferenceDate: null,
  sortOrder: id,
  ...extra,
})

async function renderSettings(cards = [main]) {
  const list = vi.spyOn(cardsApi, 'list').mockResolvedValue(cards)
  vi.spyOn(cardCategoriesApi, 'list').mockResolvedValue([groceries, fuel])
  vi.spyOn(budgetLinesApi, 'list').mockResolvedValue([
    line(7, 'Card bill'),
    line(8, 'Old bill', { active: false }),
    line(9, 'Salary', { kind: 'INCOME', groupName: null }),
  ])
  renderPage(<CardSettingsPage />)
  await screen.findByRole('region', { name: 'Categorias' })
  return { list, user: userEvent.setup() }
}

beforeEach(() => {
  localStorage.clear()
})

describe('CardSettingsPage', () => {
  it('hides the inactive cards until asked', async () => {
    const { user } = await renderSettings([main, { ...main, id: 2, name: 'Retired', active: false }])
    const cards = screen.getByRole('region', { name: 'Cartões' })
    expect(within(cards).queryByText('Retired')).not.toBeInTheDocument()

    await user.click(within(cards).getByRole('button', { name: 'Mostrar inativos (1)' }))

    expect(within(cards).getByText('Retired')).toBeInTheDocument()
  })

  it('lists the cards with the bill they feed, and the categories', async () => {
    await renderSettings()

    const row = within(screen.getByRole('region', { name: 'Cartões' })).getByText('Main').closest('tr')!
    expect(within(row).getByText('Dia 10')).toBeInTheDocument()
    expect(within(row).getByText('Dia 17')).toBeInTheDocument()
    expect(within(row).getByText('Card bill')).toBeInTheDocument()
    const categories = screen.getByRole('region', { name: 'Categorias' })
    expect(within(within(categories).getByText('Mercado').closest('tr')!).getByText('Sim')).toBeInTheDocument()
    expect(within(within(categories).getByText('Gasolina').closest('tr')!).getByText('Não')).toBeInTheDocument()
  })

  it('creates a card, offering only the active bills', async () => {
    const { list, user } = await renderSettings()
    const create = vi.spyOn(cardsApi, 'create').mockResolvedValue(main)

    await user.click(screen.getByRole('button', { name: 'Novo cartão' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo cartão' })
    const bill = within(dialog).getByLabelText(/^Conta do mês/)
    expect(within(bill).getAllByRole('option').map((option) => option.textContent)).toEqual(['Nenhuma', 'Card bill (Casa)'])
    await user.type(within(dialog).getByLabelText(/^Nome/), 'Second')
    await user.type(within(dialog).getByLabelText(/^Dia de fechamento/), '6')
    await user.type(within(dialog).getByLabelText(/^Dia de vencimento/), '14')
    await user.selectOptions(bill, 'Card bill (Casa)')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(create).toHaveBeenCalledWith({ name: 'Second', closingDay: 6, dueDay: 14, budgetLineId: 7, active: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('edits a card, and may leave it without a bill', async () => {
    const { user } = await renderSettings()
    const update = vi.spyOn(cardsApi, 'update').mockResolvedValue(main)

    await user.click(screen.getByRole('button', { name: 'Editar Main' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar cartão' })
    expect(within(dialog).getByLabelText(/^Dia de fechamento/)).toHaveValue(10)
    await user.selectOptions(within(dialog).getByLabelText(/^Conta do mês/), 'Nenhuma')
    await user.click(within(dialog).getByLabelText('Ativo'))
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(update).toHaveBeenCalledWith(1, { name: 'Main', closingDay: 10, dueDay: 17, budgetLineId: null, active: false })
  })

  it('creates and edits a category', async () => {
    const { user } = await renderSettings()
    const create = vi.spyOn(cardCategoriesApi, 'create').mockResolvedValue(fuel)
    const update = vi.spyOn(cardCategoriesApi, 'update').mockResolvedValue(fuel)

    await user.click(screen.getByRole('button', { name: 'Nova categoria' }))
    let dialog = screen.getByRole('dialog', { name: 'Nova categoria' })
    await user.type(within(dialog).getByLabelText(/^Nome/), 'Padaria')
    await user.click(within(dialog).getByLabelText(/^Conta como alimentação/))
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(create).toHaveBeenCalledWith({ name: 'Padaria', food: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Editar Mercado' }))
    dialog = screen.getByRole('dialog', { name: 'Editar categoria' })
    expect(within(dialog).getByLabelText(/^Conta como alimentação/)).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(update).toHaveBeenCalledWith(1, { name: 'Mercado', food: true })
  })

  it('keeps the form open with the server message when saving fails', async () => {
    const { user } = await renderSettings()
    vi.spyOn(cardsApi, 'update').mockRejectedValue(new ApiError(409, 'Já existe um cartão com este nome.'))

    await user.click(screen.getByRole('button', { name: 'Editar Main' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um cartão com este nome.')
  })

  it('deletes after confirmation and shows why the server refused', async () => {
    const { user } = await renderSettings()
    const removeCard = vi.spyOn(cardsApi, 'remove').mockRejectedValue(new ApiError(409, 'Este cartão tem compras lançadas.'))
    const removeCategory = vi.spyOn(cardCategoriesApi, 'remove').mockResolvedValue(undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await user.click(screen.getByRole('button', { name: 'Excluir Main' }))
    expect(confirm).toHaveBeenCalledWith('Excluir o cartão "Main"?')
    expect(removeCard).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Excluir Main' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este cartão tem compras lançadas.')
    await user.click(screen.getByRole('button', { name: 'Excluir Gasolina' }))
    expect(removeCategory).toHaveBeenCalledWith(2)
  })

  it('says so when there is no card yet', async () => {
    await renderSettings([])

    expect(screen.getByText('Nenhum cartão cadastrado.')).toBeInTheDocument()
  })
})
