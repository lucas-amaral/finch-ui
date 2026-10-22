import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { cardCategoriesApi, merchantsApi } from '../api/endpoints'
import type { Merchant, MerchantSuggestion } from '../api/types'
import { renderPage } from '../test/render'
import { MerchantsPage } from './MerchantsPage'

const groceries = { id: 1, name: 'Mercado', food: true, sortOrder: 1 }
const fuel = { id: 2, name: 'Gasolina', food: false, sortOrder: 2 }
const station: Merchant = { id: 10, name: 'Posto Central', categoryId: 2 }

async function renderMerchants(merchants: Merchant[] = [station], suggestions: MerchantSuggestion[] = []) {
  vi.spyOn(cardCategoriesApi, 'list').mockResolvedValue([groceries, fuel])
  const list = vi.spyOn(merchantsApi, 'list').mockResolvedValue(merchants)
  const suggest = vi.spyOn(merchantsApi, 'suggestions').mockResolvedValue(suggestions)
  renderPage(<MerchantsPage />)
  await screen.findByRole('heading', { name: 'Estabelecimentos' })
  await screen.findByRole('region', { name: 'Estabelecimentos cadastrados' })
  return { list, suggest, user: userEvent.setup() }
}

describe('MerchantsPage', () => {
  it('lists the merchants with their category, and changes or removes one', async () => {
    const { list, user } = await renderMerchants()
    const update = vi.spyOn(merchantsApi, 'update').mockResolvedValue(station)
    const remove = vi.spyOn(merchantsApi, 'remove').mockResolvedValue(undefined)
    const registered = screen.getByRole('region', { name: 'Estabelecimentos cadastrados' })

    expect(within(registered).getByText('Posto Central')).toBeInTheDocument()
    await user.selectOptions(within(registered).getByLabelText('Categoria de Posto Central'), 'Mercado')
    expect(update).toHaveBeenCalledWith(10, { name: 'Posto Central', categoryId: 1 })

    await user.click(within(registered).getByRole('button', { name: 'Excluir Posto Central' }))
    expect(remove).toHaveBeenCalledWith(10)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
  })

  it('registers a merchant by hand and shows why the server refused one', async () => {
    const { user } = await renderMerchants([])
    const create = vi
      .spyOn(merchantsApi, 'create')
      .mockRejectedValueOnce(new ApiError(409, 'O estabelecimento "Padaria" já está cadastrado.'))
      .mockResolvedValueOnce({ id: 11, name: 'Padaria', categoryId: 1 })
    const form = screen.getByRole('form', { name: 'Novo estabelecimento' })

    await user.type(within(form).getByLabelText(/^Nome/), 'Padaria')
    await user.selectOptions(within(form).getByLabelText(/^Categoria/), 'Mercado')
    await user.click(within(form).getByRole('button', { name: 'Adicionar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('já está cadastrado')

    await user.click(within(form).getByRole('button', { name: 'Adicionar' }))
    expect(create).toHaveBeenLastCalledWith({ name: 'Padaria', categoryId: 1 })
    await waitFor(() => expect(within(form).getByLabelText(/^Nome/)).toHaveValue(''))
  })

  it('registers the suggestions of the history that were reviewed, with shorter names and the chosen categories', async () => {
    const { user } = await renderMerchants(
      [station],
      [
        { name: 'IFOOD *PIZZARIA', categoryId: 1, purchases: 12 },
        { name: 'LOJA ONLINE', categoryId: null, purchases: 4 },
        { name: 'FARMACIA BOA', categoryId: 1, purchases: 2 },
      ],
    )
    const createAll = vi.spyOn(merchantsApi, 'createAll').mockResolvedValue([])
    const panel = screen.getByRole('region', { name: 'Sugestões do histórico' })

    // Ticked from the start only when the history already gives a category.
    expect(await within(panel).findByLabelText('Cadastrar IFOOD *PIZZARIA')).toBeChecked()
    expect(within(panel).getByLabelText('Cadastrar LOJA ONLINE')).not.toBeChecked()
    await user.clear(within(panel).getByLabelText('Nome de IFOOD *PIZZARIA'))
    await user.type(within(panel).getByLabelText('Nome de IFOOD *PIZZARIA'), 'iFood')
    await user.selectOptions(within(panel).getByLabelText('Categoria de LOJA ONLINE'), 'Gasolina')
    await user.click(within(panel).getByLabelText('Cadastrar FARMACIA BOA'))
    await user.click(within(panel).getByRole('button', { name: 'Cadastrar marcados (2)' }))

    expect(createAll).toHaveBeenCalledWith([
      { name: 'iFood', categoryId: 1 },
      { name: 'LOJA ONLINE', categoryId: 2 },
    ])
  })

  it('filters the suggestions and asks for a category and a single name before saving', async () => {
    const { user } = await renderMerchants(
      [],
      [
        { name: 'UBER *TRIP', categoryId: 2, purchases: 9 },
        { name: 'UBER TRIP SP', categoryId: 2, purchases: 3 },
        { name: 'BANCA', categoryId: null, purchases: 2 },
      ],
    )
    const createAll = vi.spyOn(merchantsApi, 'createAll').mockResolvedValue([])
    const panel = screen.getByRole('region', { name: 'Sugestões do histórico' })

    await user.type(await within(panel).findByLabelText('Filtrar sugestões'), 'uber')
    expect(within(panel).queryByLabelText('Cadastrar BANCA')).not.toBeInTheDocument()
    await user.clear(within(panel).getByLabelText('Nome de UBER *TRIP'))
    await user.type(within(panel).getByLabelText('Nome de UBER *TRIP'), 'Uber')
    await user.clear(within(panel).getByLabelText('Nome de UBER TRIP SP'))
    await user.type(within(panel).getByLabelText('Nome de UBER TRIP SP'), 'uber')
    await user.click(within(panel).getByRole('button', { name: 'Cadastrar marcados (2)' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('"uber" aparece mais de uma vez entre os marcados')

    await user.click(within(panel).getByLabelText('Cadastrar UBER TRIP SP'))
    await user.clear(within(panel).getByLabelText('Filtrar sugestões'))
    await user.click(within(panel).getByLabelText('Cadastrar BANCA'))
    await user.click(within(panel).getByRole('button', { name: 'Cadastrar marcados (2)' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('Escolha a categoria de todos os marcados.')
    expect(createAll).not.toHaveBeenCalled()
  })
})
