import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { cardCategoriesApi, cardsApi } from '../api/endpoints'
import type { CardPurchase, CreditCard, ImportPreviewLine } from '../api/types'
import { InvoiceImport } from './InvoiceImport'

const card: CreditCard = { id: 1, name: 'Main', closingDay: 10, dueDay: 17, budgetLineId: null, active: true, currentInvoiceMonth: '2026-10' }
const line = (description: string, amount: number, extra: Partial<ImportPreviewLine> = {}): ImportPreviewLine => ({
  date: '2026-10-02',
  description,
  amount,
  installmentNumber: null,
  installmentCount: null,
  categoryId: null,
  duplicate: false,
  ...extra,
})
const preview = [
  line('Market', 412.3, { categoryId: 1 }),
  line('Bakery', 38.5, { duplicate: true }),
  line('Notebook', 520, { installmentNumber: 2, installmentCount: 6, categoryId: 2 }),
  line('New store', 74),
]

async function renderImport() {
  vi.spyOn(cardCategoriesApi, 'list').mockResolvedValue([
    { id: 1, name: 'Mercado', food: true, sortOrder: 1 },
    { id: 2, name: 'Compras online', food: false, sortOrder: 2 },
  ])
  const importPreview = vi.spyOn(cardsApi, 'importPreview').mockResolvedValue(preview)
  const create = vi.spyOn(cardsApi, 'createPurchase').mockResolvedValue({} as CardPurchase)
  const onClose = vi.fn()
  render(<InvoiceImport card={card} month="2026-10" onClose={onClose} />)
  const user = userEvent.setup()
  await user.upload(screen.getByLabelText('Arquivo da fatura'), new File(['date,title,amount'], 'october.csv', { type: 'text/csv' }))
  const table = await screen.findByRole('table', { name: 'Compras de october.csv' })
  return { importPreview, create, onClose, table, user }
}

describe('InvoiceImport', () => {
  it('sends the text of the file and shows each charge with its note, leaving out what is already on the invoice', async () => {
    const { importPreview, table } = await renderImport()

    expect(importPreview).toHaveBeenCalledWith(1, '2026-10', 'date,title,amount')
    expect(within(table).getByText('categoria sugerida pelo histórico')).toBeInTheDocument()
    expect(within(table).getByText('já está na fatura')).toBeInTheDocument()
    expect(within(table).getByText('parcela 2 de 6')).toBeInTheDocument()
    expect(within(table).getByText('primeira vez que aparece')).toBeInTheDocument()
    expect(within(table).getByRole('checkbox', { name: 'Lançar Market' })).toBeChecked()
    expect(within(table).getByRole('checkbox', { name: 'Lançar Bakery' })).not.toBeChecked()
    expect(within(table).getByLabelText('Categoria de Market')).toHaveValue('1')
    expect(screen.getByText('3 de 4 compras selecionadas').nextSibling).toHaveTextContent('R$ 1.006,30')
  })

  it('registers what stays ticked, with the chosen categories and an installment as the rest of its plan', async () => {
    const { create, onClose, table, user } = await renderImport()
    await user.selectOptions(within(table).getByLabelText('Categoria de New store'), 'Mercado')
    await user.click(within(table).getByRole('checkbox', { name: 'Lançar Market' }))

    await user.click(screen.getByRole('button', { name: 'Lançar 2 compras' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(create).toHaveBeenCalledTimes(2)
    // Installment 2 of 6 at 520 each: the five charges that are left add up to 2600.
    expect(create).toHaveBeenNthCalledWith(1, 1, {
      description: 'Notebook',
      purchaseDate: '2026-10-02',
      amount: 2600,
      installments: 5,
      firstInstallmentNumber: 2,
      totalInstallments: 6,
      categoryId: 2,
      firstInvoiceMonth: '2026-10',
    })
    expect(create).toHaveBeenNthCalledWith(2, 1, {
      description: 'New store',
      purchaseDate: '2026-10-02',
      amount: 74,
      installments: 1,
      firstInstallmentNumber: 1,
      totalInstallments: null,
      categoryId: 1,
      firstInvoiceMonth: '2026-10',
    })
  })

  it('says how far it got when a purchase fails, and does not repeat the ones that went through', async () => {
    const { create, onClose, user } = await renderImport()
    create.mockResolvedValueOnce({} as CardPurchase).mockRejectedValueOnce(new ApiError(500, 'Erro inesperado.', {}))

    await user.click(screen.getByRole('button', { name: 'Lançar 3 compras' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('1 de 3 compras foram lançadas. Erro inesperado.')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Lançar Market' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Lançar 2 compras' })).toBeEnabled()
  })

  it('shows why a file could not be read', async () => {
    vi.spyOn(cardCategoriesApi, 'list').mockResolvedValue([])
    vi.spyOn(cardsApi, 'importPreview').mockRejectedValue(new ApiError(422, 'Não encontrei compras no arquivo.', {}))
    render(<InvoiceImport card={card} month="2026-10" onClose={vi.fn()} />)

    await userEvent.setup().upload(screen.getByLabelText('Arquivo da fatura'), new File(['x'], 'photo.csv'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não encontrei compras no arquivo.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
