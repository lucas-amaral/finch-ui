import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { budgetYearsApi, cardCategoriesApi, cardsApi, merchantsApi, recurringChargesApi } from '../api/endpoints'
import type { BudgetYear, CardInvoice, CardPurchase, CreditCard, Merchant, RecurringCharge } from '../api/types'
import { renderPage } from '../test/render'
import { CardsPage } from './CardsPage'

const main: CreditCard = { id: 1, name: 'Main', closingDay: 10, dueDay: 17, budgetLineId: 7, active: true, currentInvoiceMonth: '2026-10' }
const second: CreditCard = { ...main, id: 2, name: 'Second', closingDay: 6, dueDay: 14, currentInvoiceMonth: '2026-11' }
const retired: CreditCard = { ...main, id: 3, name: 'Retired', active: false }

function invoiceOf(cardId: number, month: string): CardInvoice {
  return {
    cardId,
    month,
    closingDate: `${month}-10`,
    dueDate: `${month}-17`,
    total: 263.34,
    installmentTotal: 133.34,
    singleTotal: 130,
    expected: [],
    expectedTotal: 0,
    installments: [{ purchaseId: 11, description: 'Flight', purchaseDate: '2026-08-20', number: 2, count: 3, amount: 133.34, categoryId: 1, categoryName: 'Mercado' }],
    groups: [
      {
        categoryId: 1,
        categoryName: 'Mercado',
        total: 100,
        items: [
          { purchaseId: 12, description: 'Market A', purchaseDate: '2026-09-11', number: 1, count: 1, amount: 60, categoryId: 1, categoryName: 'Mercado' },
          { purchaseId: 13, description: 'Market B', purchaseDate: '2026-09-12', number: 1, count: 1, amount: 40, categoryId: 1, categoryName: 'Mercado' },
        ],
      },
      {
        categoryId: null,
        categoryName: null,
        total: 30,
        items: [{ purchaseId: 14, description: 'Gift', purchaseDate: '2026-09-20', number: 1, count: 1, amount: 30, categoryId: null, categoryName: null }],
      },
    ],
  }
}

const emptyInvoice = (cardId: number, month: string): CardInvoice => ({
  ...invoiceOf(cardId, month),
  total: 0,
  installmentTotal: 0,
  singleTotal: 0,
  installments: [],
  groups: [],
})

async function renderCards(cards = [main, second, retired], merchants: Merchant[] = []) {
  vi.spyOn(merchantsApi, 'list').mockResolvedValue(merchants)
  vi.spyOn(cardsApi, 'list').mockResolvedValue(cards)
  const invoice = vi.spyOn(cardsApi, 'invoice').mockImplementation(async (cardId, month) => invoiceOf(cardId, month))
  // The invoices around the one on screen: each month ahead still carries 100 of installments.
  vi.spyOn(cardsApi, 'invoices').mockImplementation(async (cardId, months) =>
    months.map((month) => ({ ...emptyInvoice(cardId, month), total: 100, installmentTotal: 100 })),
  )
  vi.spyOn(cardCategoriesApi, 'list').mockResolvedValue([
    { id: 1, name: 'Mercado', food: true, sortOrder: 1 },
    { id: 2, name: 'Gasolina', food: false, sortOrder: 2 },
  ])
  renderPage(<CardsPage />)
  await screen.findByRole('region', { name: 'Parcelado' })
  return { invoice, user: userEvent.setup() }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CardsPage', () => {
  it('opens on the invoice that is open today for the first active card', async () => {
    const { invoice } = await renderCards()

    expect(invoice).toHaveBeenCalledWith(1, '2026-10')
    expect(screen.getByText('outubro de 2026')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Main' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: 'Retired' })).not.toBeInTheDocument()
  })

  it('shows the totals, the installments and the single purchases by category', async () => {
    await renderCards()

    expect(screen.getByText('Total da fatura').nextElementSibling).toHaveTextContent(/263,34/)
    expect(screen.getByText('Fecha em 10/10').nextElementSibling).toHaveTextContent('Vence em 17/10')
    const split = screen.getByRole('region', { name: 'Parcelado' })
    const flight = within(split).getByText('Flight').closest('tr')!
    expect(within(flight).getByText('2/3')).toBeInTheDocument()
    expect(within(flight).getByText('20/08')).toBeInTheDocument()
    expect(within(flight).getByText('133,34')).toBeInTheDocument()
    const groceries = screen.getByRole('group', { name: 'Mercado' })
    expect(within(groceries).getByText('100,00')).toBeInTheDocument()
    expect(within(groceries).getAllByRole('row')).toHaveLength(2)
    expect(within(screen.getByRole('group', { name: 'Sem categoria' })).getByText('Gift')).toBeInTheDocument()
  })

  it('walks through the invoices and keeps the month when the card changes', async () => {
    const { invoice, user } = await renderCards()

    await user.click(screen.getByRole('button', { name: 'Próxima fatura' }))
    await waitFor(() => expect(invoice).toHaveBeenLastCalledWith(1, '2026-11'))
    await user.click(screen.getByRole('tab', { name: 'Second' }))
    await waitFor(() => expect(invoice).toHaveBeenLastCalledWith(2, '2026-11'))
    await user.click(screen.getByRole('button', { name: 'Fatura anterior' }))
    await user.click(screen.getByRole('button', { name: 'Fatura anterior' }))
    await waitFor(() => expect(invoice).toHaveBeenLastCalledWith(2, '2026-09'))
    expect(screen.getByText('setembro de 2026')).toBeInTheDocument()
  })

  it('follows the open invoice of the other card while no month was chosen', async () => {
    const { invoice, user } = await renderCards()

    await user.click(screen.getByRole('tab', { name: 'Second' }))

    await waitFor(() => expect(invoice).toHaveBeenLastCalledWith(2, '2026-11'))
  })

  it('registers a purchase on the card on screen and reloads the invoice', async () => {
    const { invoice, user } = await renderCards()
    const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova compra · Main' })
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'Bookshop')
    expect(within(dialog).getByLabelText(/^Data da compra/)).toHaveValue('2026-10-08')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '9990')
    await user.selectOptions(within(dialog).getByLabelText(/^Categoria/), 'Gasolina')
    expect(within(dialog).queryByLabelText(/^Total de parcelas/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Parcelado' }))
    expect(within(dialog).getByLabelText(/^Parcela número/)).toHaveValue(1)
    await user.type(within(dialog).getByLabelText(/^Total de parcelas/), '3')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(create).toHaveBeenCalledWith(1, {
      description: 'Bookshop',
      purchaseDate: '2026-10-08',
      amount: 99.9,
      installments: 3,
      firstInstallmentNumber: 1,
      totalInstallments: 3,
      categoryId: 2,
      firstInvoiceMonth: null,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(invoice).toHaveBeenCalledTimes(2))
  })

  it('registers a refund as a negative amount', async () => {
    const { user } = await renderCards()
    const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'Returned shoes')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '5000')
    await user.click(within(dialog).getByLabelText(/^É um estorno/))
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(create).toHaveBeenCalledWith(1, expect.objectContaining({ amount: -50, installments: 1, categoryId: null }))
  })

  it('edits a purchase starting from the whole purchase, not from the installment of the month', async () => {
    const { user } = await renderCards()
    vi.spyOn(cardsApi, 'getPurchase').mockResolvedValue({
      id: 11,
      cardId: 1,
      categoryId: null,
      description: 'Flight',
      purchaseDate: '2026-08-20',
      amount: 400,
      installments: 3,
      firstInstallmentNumber: 1,
      totalInstallments: 3,
      firstInvoiceMonth: '2026-09',
    })
    const update = vi.spyOn(cardsApi, 'updatePurchase').mockResolvedValue({} as CardPurchase)

    await user.click(screen.getByRole('button', { name: 'Editar Flight' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar compra · Main' })
    expect(await within(dialog).findByLabelText(/^Valor total/)).toHaveValue('400,00')
    expect(within(dialog).getByRole('button', { name: 'Parcelado' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByLabelText(/^Parcela número/)).toHaveValue(1)
    expect(within(dialog).getByLabelText(/^Total de parcelas/)).toHaveValue(3)
    expect(within(dialog).getByLabelText(/^Primeira fatura/)).toHaveValue('2026-09')
    expect(within(dialog).queryByRole('button', { name: 'Salvar e nova' })).not.toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText(/^Descrição/))
    await user.type(within(dialog).getByLabelText(/^Descrição/), 'Flight home')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(update).toHaveBeenCalledWith(1, 11, {
      description: 'Flight home',
      purchaseDate: '2026-08-20',
      amount: 400,
      installments: 3,
      firstInstallmentNumber: 1,
      totalInstallments: 3,
      categoryId: null,
      firstInvoiceMonth: '2026-09',
    })
  })

  it('registers a purchase that was already under way from the installment it is on', async () => {
    const { user } = await renderCards()
    const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'Sofa')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '20000')
    await user.click(within(dialog).getByRole('button', { name: 'Parcelado' }))
    await user.clear(within(dialog).getByLabelText(/^Parcela número/))
    await user.type(within(dialog).getByLabelText(/^Parcela número/), '9')
    await user.type(within(dialog).getByLabelText(/^Total de parcelas/), '10')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ amount: 200, installments: 2, firstInstallmentNumber: 9, totalInstallments: 10 }),
    )
  })

  it('shows the plan of a purchase under way when editing it', async () => {
    const { user } = await renderCards()
    vi.spyOn(cardsApi, 'getPurchase').mockResolvedValue({
      id: 11,
      cardId: 1,
      categoryId: null,
      description: 'Flight',
      purchaseDate: '2026-08-20',
      amount: 200,
      installments: 2,
      firstInstallmentNumber: 2,
      totalInstallments: 6,
      firstInvoiceMonth: '2026-10',
    })

    await user.click(screen.getByRole('button', { name: 'Editar Flight' }))
    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByLabelText(/^Parcela número/)).toHaveValue(2)
    expect(within(dialog).getByLabelText(/^Total de parcelas/)).toHaveValue(6)
  })

  it('keeps the plan of a purchase registered without its last installments while the plan is not changed', async () => {
    const { user } = await renderCards()
    vi.spyOn(cardsApi, 'getPurchase').mockResolvedValue({
      id: 11, cardId: 1, categoryId: null, description: 'Flight', purchaseDate: '2026-08-20', amount: 200,
      installments: 2, firstInstallmentNumber: 2, totalInstallments: 6, firstInvoiceMonth: '2026-10',
    })
    const update = vi.spyOn(cardsApi, 'updatePurchase').mockResolvedValue({} as CardPurchase)

    await user.click(screen.getByRole('button', { name: 'Editar Flight' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Salvar' }))
    expect(update).toHaveBeenLastCalledWith(1, 11, expect.objectContaining({ installments: 2, firstInstallmentNumber: 2, totalInstallments: 6 }))
  })

  it('refuses a split purchase without a sensible plan before calling the server', async () => {
    const { user } = await renderCards()
    const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'Sofa')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '20000')
    await user.click(within(dialog).getByRole('button', { name: 'Parcelado' }))
    await user.clear(within(dialog).getByLabelText(/^Parcela número/))
    await user.type(within(dialog).getByLabelText(/^Parcela número/), '7')
    await user.type(within(dialog).getByLabelText(/^Total de parcelas/), '6')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(within(dialog).getByText('A parcela deve estar entre 1 e 6.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('saves and opens a blank form for the next purchase, keeping the date', async () => {
    const { invoice, user } = await renderCards()
    const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova compra · Main' })
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'Bakery')
    await user.clear(within(dialog).getByLabelText(/^Data da compra/))
    await user.type(within(dialog).getByLabelText(/^Data da compra/), '2026-10-05')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '1200')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar e nova' }))

    expect(create).toHaveBeenCalledWith(1, expect.objectContaining({ description: 'Bakery', purchaseDate: '2026-10-05', amount: 12 }))
    const next = await screen.findByRole('dialog', { name: 'Nova compra · Main' })
    expect(await within(next).findByRole('status')).toHaveTextContent('"Bakery" lançada.')
    expect(within(next).getByLabelText(/^Descrição/)).toHaveValue('')
    expect(within(next).getByLabelText(/^Valor total/)).toHaveValue('')
    expect(within(next).getByLabelText(/^Data da compra/)).toHaveValue('2026-10-05')
    await waitFor(() => expect(invoice).toHaveBeenCalledTimes(2))
  })

  it('suggests the category of the merchant typed, until a category is picked by hand', async () => {
    const { user } = await renderCards([main, second, retired], [{ id: 1, name: 'Posto Shell', categoryId: 2 }])
    const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'POSTO SHELL 123')
    expect(within(dialog).getByLabelText(/^Categoria/)).toHaveValue('2')
    expect(within(dialog).getByText('Sugerida pelo estabelecimento Posto Shell.')).toBeInTheDocument()

    await user.selectOptions(within(dialog).getByLabelText(/^Categoria/), 'Mercado')
    await user.type(within(dialog).getByLabelText(/^Descrição/), ' loja')
    expect(within(dialog).getByLabelText(/^Categoria/)).toHaveValue('1')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '5000')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(create).toHaveBeenCalledWith(1, expect.objectContaining({ categoryId: 1 }))
  })

  it('tells the invoice a purchase falls in, and lets another one be chosen', async () => {
    const { user } = await renderCards()
    const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'Shoes')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '5000')
    expect(within(dialog).getByText(/Entra na fatura de outubro de 2026/)).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText(/^Data da compra/))
    await user.type(within(dialog).getByLabelText(/^Data da compra/), '2026-10-12')
    expect(within(dialog).getByText(/Entra na fatura de novembro de 2026/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Escolher outra fatura' }))
    await user.type(within(dialog).getByLabelText(/^Fatura/), '2026-12')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(create).toHaveBeenCalledWith(1, expect.objectContaining({ firstInvoiceMonth: '2026-12' }))
  })

  it('asks before putting a purchase on an invoice that already closed and was paid', async () => {
    const { user } = await renderCards()
    const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)
    const paidSeptember = { months: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, entries: index === 8 ? [{ lineId: 7, amount: 900, settled: true }] : [] })) }
    vi.spyOn(budgetYearsApi, 'get').mockResolvedValue(paidSeptember as unknown as BudgetYear)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'Late charge')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '5000')
    await user.clear(within(dialog).getByLabelText(/^Data da compra/))
    await user.type(within(dialog).getByLabelText(/^Data da compra/), '2026-09-02')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(confirm).toHaveBeenCalledWith('A fatura de setembro de 2026 já fechou e foi paga. Lançar a compra nela mesmo assim?')
    expect(create).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(1, expect.objectContaining({ purchaseDate: '2026-09-02' })))
  })

  it('does not ask for an invoice that closed but is still to be paid', async () => {
    const { user } = await renderCards()
    const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)
    vi.spyOn(budgetYearsApi, 'get').mockResolvedValue({ months: [] } as unknown as BudgetYear)
    const confirm = vi.spyOn(window, 'confirm')

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'Late charge')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '5000')
    await user.clear(within(dialog).getByLabelText(/^Data da compra/))
    await user.type(within(dialog).getByLabelText(/^Data da compra/), '2026-09-02')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(confirm).not.toHaveBeenCalled()
  })

  it('keeps the form open with the server errors when saving fails', async () => {
    const { user } = await renderCards()
    vi.spyOn(cardsApi, 'createPurchase').mockRejectedValue(
      new ApiError(400, 'Um ou mais campos são inválidos.', { description: 'A descrição deve ter no máximo 120 caracteres.' }),
    )

    await user.click(screen.getByRole('button', { name: 'Nova compra' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(await within(dialog).findByLabelText(/^Descrição/), 'X')
    await user.type(within(dialog).getByLabelText(/^Valor total/), '100')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Um ou mais campos são inválidos.')
    expect(within(dialog).getByText('A descrição deve ter no máximo 120 caracteres.')).toBeInTheDocument()
  })

  it('deletes a purchase after confirmation, warning that every installment goes', async () => {
    const { invoice, user } = await renderCards()
    const remove = vi.spyOn(cardsApi, 'removePurchase').mockResolvedValue(undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await user.click(screen.getByRole('button', { name: 'Excluir Flight' }))
    expect(confirm).toHaveBeenCalledWith('Excluir a compra "Flight"? As 3 parcelas saem das faturas.')
    expect(remove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Excluir Gift' }))
    expect(confirm).toHaveBeenLastCalledWith('Excluir a compra "Gift"?')
    expect(remove).toHaveBeenCalledWith(1, 14)
    await waitFor(() => expect(invoice).toHaveBeenCalledTimes(2))
  })

  it('says so when the invoice has no purchases', async () => {
    vi.spyOn(cardsApi, 'list').mockResolvedValue([main])
    vi.spyOn(cardsApi, 'invoice').mockImplementation(async (cardId, month) => emptyInvoice(cardId, month))
    renderPage(<CardsPage />)

    expect(await screen.findByText('Fatura sem compras')).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Cartão' })).not.toBeInTheDocument()
  })

  it('invites to register a card when none is active', async () => {
    vi.spyOn(cardsApi, 'list').mockResolvedValue([retired])
    renderPage(<CardsPage />)

    expect(await screen.findByText('Nenhum cartão ativo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cadastrar cartão' })).toHaveAttribute('href', '/settings/cards')
    expect(screen.queryByRole('button', { name: 'Nova compra' })).not.toBeInTheDocument()
  })

  it('lists every purchase of the invoice by date, newest first, when asked', async () => {
    const { user } = await renderCards()

    await user.click(screen.getByRole('tab', { name: 'Por data' }))

    const list = screen.getByRole('region', { name: 'Compras por data' })
    expect(within(list).getAllByRole('row').map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      'Gift', 'Market B', 'Market A', 'Flight',
    ])
    expect(within(list).getByText('2/3')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Parcelado' })).not.toBeInTheDocument()
  })

  it('groups every charge, installments included, by category when asked, the heaviest first', async () => {
    const { user } = await renderCards()

    await user.click(screen.getByRole('tab', { name: 'Por categoria' }))

    const list = screen.getByRole('region', { name: 'Compras por categoria' })
    const groups = within(list).getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Mercado', 'Sem categoria'])
    expect(groups[0]).toHaveTextContent('233,34 · 89%')
    expect(within(groups[0]).getByText('Flight')).toBeInTheDocument()
    expect(within(groups[1]).getByText('Gift')).toBeInTheDocument()
  })

  it('shows what is already on the next invoices and how the last ones went', async () => {
    await renderCards()

    const next = await screen.findByRole('region', { name: 'Próximas faturas' })
    expect(within(next).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Nov100,00', 'Dez100,00', 'Jan100,00', 'Fev100,00', 'Mar100,00', 'Abr100,00',
    ])
    const last = screen.getByRole('region', { name: 'Últimas faturas' })
    const items = within(last).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[5]).toHaveTextContent('Out263,34')
    expect(items[5]).toHaveClass('meter-current')
    expect(cardsApi.invoices).toHaveBeenCalledWith(1, expect.arrayContaining(['2026-05', '2026-09', '2026-11', '2027-10']))
  })

  it('checks the limit used at the bank against the invoice on screen plus what is on the next ones', async () => {
    const { user } = await renderCards()
    const check = await screen.findByRole('region', { name: 'Conferência do limite' })
    // 263,34 of this invoice plus twelve months with 100 each.
    expect(within(check).getByText('1.463,34')).toBeInTheDocument()
    expect(within(check).queryByRole('status')).not.toBeInTheDocument()

    await user.type(within(check).getByLabelText('Limite usado, no app do banco'), '150000')
    expect(within(check).getByRole('status')).toHaveTextContent('Falta lançar R$ 36,66')

    await user.clear(within(check).getByLabelText('Limite usado, no app do banco'))
    await user.type(within(check).getByLabelText('Limite usado, no app do banco'), '146334')
    expect(within(check).getByRole('status')).toHaveTextContent('Tudo conferido')

    await user.clear(within(check).getByLabelText('Limite usado, no app do banco'))
    await user.type(within(check).getByLabelText('Limite usado, no app do banco'), '140000')
    expect(within(check).getByRole('status')).toHaveTextContent('Lançado a mais R$ 63,34')
  })

  it('counts in the limit the closed invoice that is not due yet, and leaves out what is dated ahead', async () => {
    vi.spyOn(cardsApi, 'list').mockResolvedValue([main])
    // Today is 8 October: the gift is dated after it, so the bank has not charged it yet.
    vi.spyOn(cardsApi, 'invoice').mockImplementation(async (cardId, month) => {
      const invoice = invoiceOf(cardId, month)
      invoice.groups[1].items[0].purchaseDate = '2026-10-20'
      return invoice
    })
    // The September invoice closed with 500 and is only due on the 17th of October in this scenario.
    vi.spyOn(cardsApi, 'invoices').mockImplementation(async (cardId, months) =>
      months.map((month) => ({
        ...emptyInvoice(cardId, month),
        total: month === '2026-09' ? 500 : 0,
        dueDate: month === '2026-09' ? '2026-10-17' : `${month}-17`,
      })),
    )
    vi.spyOn(cardCategoriesApi, 'list').mockResolvedValue([])
    renderPage(<CardsPage />)
    const check = await screen.findByRole('region', { name: 'Conferência do limite' })
    const user = userEvent.setup()

    expect(within(check).getByText('Fatura de setembro de 2026, ainda não paga (vence 17/10)').nextSibling).toHaveTextContent('500,00')
    expect(within(check).getByText('Fatura de outubro de 2026, já cobrado').nextSibling).toHaveTextContent('233,34')
    expect(within(check).getByText(/Fora da conta: R\$\s30,00 de compras à vista desta fatura com data futura/)).toBeInTheDocument()
    expect(within(check).getByText('Soma').nextSibling).toHaveTextContent('733,34')

    // A few cents apart is how banks round installments, not a missing purchase.
    await user.type(within(check).getByLabelText('Limite usado, no app do banco'), '73315')
    expect(within(check).getByRole('status')).toHaveTextContent('Conferido, com R$ 0,19 de diferença')
    expect(within(check).getByRole('status')).toHaveClass('check-ok')
  })

  describe('recurring charges', () => {
    const gym: RecurringCharge = { id: 21, cardId: 1, categoryId: 2, description: 'Gym', amount: 139.9, chargeDay: 3, active: true }

    async function renderExpecting() {
      const rendered = await renderCards()
      rendered.invoice.mockImplementation(async (cardId, month) => ({ ...invoiceOf(cardId, month), expected: [gym], expectedTotal: 139.9 }))
      await rendered.user.click(screen.getByRole('button', { name: 'Próxima fatura' }))
      await rendered.user.click(screen.getByRole('button', { name: 'Fatura anterior' }))
      return { ...rendered, expected: await screen.findByRole('region', { name: 'Recorrentes previstos' }) }
    }

    it('shows what the invoice still waits for, apart from its total', async () => {
      const { expected } = await renderExpecting()

      expect(within(expected).getByText('Gym')).toBeInTheDocument()
      expect(within(expected).getByText('costuma vir no dia 3')).toBeInTheDocument()
      expect(screen.getByText('Recorrentes previstos', { selector: '.kpi-label' }).nextSibling).toHaveTextContent('R$ 139,90')
      expect(screen.getByText('Total da fatura').nextSibling).toHaveTextContent('R$ 263,34')
    })

    it('registers the charge of the month as a purchase of the invoice on screen', async () => {
      const { expected, user } = await renderExpecting()
      const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)

      await user.click(within(expected).getByRole('button', { name: 'Lançar Gym' }))

      expect(create).toHaveBeenCalledWith(1, {
        description: 'Gym',
        purchaseDate: '2026-10-08',
        amount: 139.9,
        installments: 1,
        firstInstallmentNumber: 1,
        totalInstallments: null,
        categoryId: 2,
        firstInvoiceMonth: '2026-10',
      })
    })

    it('manages what the card charges every month', async () => {
      const { user } = await renderCards()
      const list = vi.spyOn(recurringChargesApi, 'list').mockResolvedValue([gym])
      const create = vi.spyOn(recurringChargesApi, 'create').mockResolvedValue({ ...gym, id: 22, description: 'Streaming' })
      const remove = vi.spyOn(recurringChargesApi, 'remove').mockResolvedValue(undefined)

      await user.click(screen.getByRole('button', { name: 'Recorrentes' }))
      const dialog = await screen.findByRole('dialog', { name: 'Recorrentes · Main' })
      expect(await within(dialog).findByText('dia 3')).toBeInTheDocument()

      await user.type(within(dialog).getByLabelText(/^Descrição/), 'Streaming')
      await user.type(within(dialog).getByLabelText('Valor'), '5590')
      await user.type(within(dialog).getByLabelText('Dia da cobrança'), '1')
      await user.selectOptions(within(dialog).getByLabelText('Categoria'), 'Gasolina')
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))

      expect(create).toHaveBeenCalledWith(1, { description: 'Streaming', amount: 55.9, chargeDay: 1, categoryId: 2, active: true })
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2))

      await user.click(within(dialog).getByRole('button', { name: 'Excluir Gym' }))
      expect(remove).toHaveBeenCalledWith(1, 21)
    })
  })
})
