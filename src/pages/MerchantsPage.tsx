import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { errorMessage, fieldErrors } from '../api/client'
import { cardCategoriesApi, merchantsApi } from '../api/endpoints'
import type { CardCategory, Merchant, MerchantSuggestion } from '../api/types'
import { ErrorBanner, Field, IconButton, Loading, PageHeader } from '../components/ui'
import { merchantKey } from '../lib/merchants'
import { useLoad } from '../lib/useLoad'

/** A suggestion as the user reviews it: the name can be shortened ("IFOOD *PIZZA X" → "iFood") and the category changed. */
interface Review {
  original: string
  name: string
  categoryId: string
  purchases: number
  selected: boolean
}

const toReview = (suggestion: MerchantSuggestion): Review => ({
  original: suggestion.name,
  name: suggestion.name,
  categoryId: suggestion.categoryId?.toString() ?? '',
  purchases: suggestion.purchases,
  // Only the ones the history already gives a category start ticked; the others need one first.
  selected: suggestion.categoryId !== null,
})

/**
 * The merchants and the category of their purchases: typing a purchase whose description has the name
 * of one of them fills in the category. The history suggests the ones to register.
 */
export function MerchantsPage() {
  const loaded = useLoad(async () => ({ categories: await cardCategoriesApi.list(), merchants: await merchantsApi.list() }), [])
  const suggestions = useLoad(() => merchantsApi.suggestions(), [])
  const [error, setError] = useState<string | null>(null)

  function reloadAll() {
    loaded.reload()
    suggestions.reload()
  }

  return (
    <>
      <PageHeader
        title="Estabelecimentos"
        subtitle="Ao lançar uma compra cuja descrição tem o nome de um estabelecimento daqui, a categoria vem preenchida."
      />
      <ErrorBanner message={error ?? loaded.error} onRetry={loaded.error ? loaded.reload : undefined} />
      {loaded.loading && !loaded.data && <Loading />}
      {loaded.data && (
        <div className="columns columns-wide-right">
          <Registered categories={loaded.data.categories} merchants={loaded.data.merchants} onChanged={reloadAll} onError={setError} />
          <Suggestions
            categories={loaded.data.categories}
            suggestions={suggestions.data}
            loading={suggestions.loading}
            loadError={suggestions.error}
            onRetry={suggestions.reload}
            onSaved={reloadAll}
          />
        </div>
      )}
    </>
  )
}

interface RegisteredProps {
  categories: CardCategory[]
  merchants: Merchant[]
  onChanged: () => void
  onError: (message: string | null) => void
}

function Registered({ categories, merchants, onChanged, onError }: RegisteredProps) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const categoryName = (id: number) => categories.find((category) => category.id === id)?.name ?? '—'

  async function run(action: () => Promise<unknown>, done?: () => void) {
    setSubmitting(true)
    onError(null)
    setErrors({})
    try {
      await action()
      done?.()
      onChanged()
    } catch (caught) {
      onError(errorMessage(caught))
      setErrors(fieldErrors(caught))
    } finally {
      setSubmitting(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(
      () => merchantsApi.create({ name, categoryId: Number(categoryId) }),
      () => setName(''),
    )
  }

  return (
    <section className="panel list-card" aria-label="Estabelecimentos cadastrados">
      <header className="panel-header">
        <h2>Cadastrados</h2>
        <span className="muted">{merchants.length}</span>
      </header>
      {merchants.length === 0 && <p className="muted list-empty">Nenhum cadastrado. Comece pelas sugestões do histórico.</p>}
      {merchants.length > 0 && (
        <ul className="rows">
          {merchants.map((merchant) => (
            <li key={merchant.id}>
              <span className="row-text">
                <strong>{merchant.name}</strong>
                <span className="muted">{categoryName(merchant.categoryId)}</span>
              </span>
              <select
                aria-label={`Categoria de ${merchant.name}`}
                value={merchant.categoryId}
                disabled={submitting}
                onChange={(event) => void run(() => merchantsApi.update(merchant.id, { name: merchant.name, categoryId: Number(event.target.value) }))}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <IconButton label={`Excluir ${merchant.name}`} onClick={() => void run(() => merchantsApi.remove(merchant.id))} danger>
                <Trash2 size={15} aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <form className="form check-body" onSubmit={submit} aria-label="Novo estabelecimento">
        <div className="form-row">
          <Field label="Nome" error={errors.name} hint="As palavras que aparecem na descrição da compra.">
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
          </Field>
          <Field label="Categoria" error={errors.categoryId}>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
              <option value="">Escolha…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={submitting}>
            <Plus size={16} aria-hidden />
            Adicionar
          </button>
        </div>
      </form>
    </section>
  )
}

interface SuggestionsProps {
  categories: CardCategory[]
  suggestions: MerchantSuggestion[] | null
  loading: boolean
  loadError: string | null
  onRetry: () => void
  onSaved: () => void
}

function Suggestions({ categories, suggestions, loading, loadError, onRetry, onSaved }: SuggestionsProps) {
  const [reviews, setReviews] = useState<Review[]>(() => (suggestions ?? []).map(toReview))
  // New suggestions (after saving) start a new review; adjusting state while rendering avoids an effect.
  const [source, setSource] = useState(suggestions)
  if (suggestions !== source) {
    setSource(suggestions)
    setReviews((suggestions ?? []).map(toReview))
  }
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const change = (original: string, patch: Partial<Review>) =>
    setReviews((current) => current.map((review) => (review.original === original ? { ...review, ...patch } : review)))
  // By the description of the history, so a row being renamed does not vanish from the filter.
  const shown = reviews.filter((review) => !filter || merchantKey(review.original).includes(merchantKey(filter)))
  const selected = reviews.filter((review) => review.selected)

  async function save() {
    setError(null)
    if (selected.some((review) => !review.categoryId)) {
      setError('Escolha a categoria de todos os marcados.')
      return
    }
    const keys = selected.map((review) => merchantKey(review.name))
    const repeated = selected.find((_, index) => keys.indexOf(keys[index]) !== index)
    if (repeated) {
      setError(`"${repeated.name}" aparece mais de uma vez entre os marcados: deixe um só.`)
      return
    }
    setSaving(true)
    try {
      await merchantsApi.createAll(selected.map((review) => ({ name: review.name.trim(), categoryId: Number(review.categoryId) })))
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel" aria-label="Sugestões do histórico">
      <header className="panel-header">
        <h2>Sugestões do histórico</h2>
        <span className="muted">compras dos últimos 3 anos que se repetem e ainda não têm estabelecimento</span>
      </header>
      <ErrorBanner message={error ?? loadError} onRetry={loadError ? onRetry : undefined} />
      {loading && !suggestions && <Loading />}
      {suggestions && suggestions.length === 0 && <p className="muted list-empty">Nada a sugerir: as compras repetidas já têm estabelecimento.</p>}
      {reviews.length > 0 && (
        <>
          <div className="panel-toolbar">
            <input
              type="search"
              placeholder="Filtrar"
              aria-label="Filtrar sugestões"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <span className="muted">
              Encurte o nome para o que identifica o lugar (ex.: só "iFood") para valer para todas as compras dele.
            </span>
          </div>
          <div className="table-wrapper">
            <table className="budget-table budget-table-wide">
              <thead>
                <tr>
                  <th aria-label="Cadastrar" />
                  <th>Nome</th>
                  <th className="numeric">Compras</th>
                  <th>Categoria</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((review) => (
                  <tr key={review.original}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Cadastrar ${review.original}`}
                        checked={review.selected}
                        onChange={(event) => change(review.original, { selected: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Nome de ${review.original}`}
                        value={review.name}
                        maxLength={80}
                        onChange={(event) => change(review.original, { name: event.target.value })}
                      />
                    </td>
                    <td className="numeric">{review.purchases}</td>
                    <td>
                      <select
                        aria-label={`Categoria de ${review.original}`}
                        value={review.categoryId}
                        onChange={(event) => change(review.original, { categoryId: event.target.value, selected: event.target.value !== '' })}
                      >
                        <option value="">Escolha…</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="panel-footer">
            <button type="button" className="button button-primary" disabled={saving || selected.length === 0} onClick={() => void save()}>
              Cadastrar marcados ({selected.length})
            </button>
          </footer>
        </>
      )}
    </section>
  )
}
