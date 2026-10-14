import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, fieldErrors } from '../api/client'
import { budgetLinesApi, cardCategoriesApi, cardsApi } from '../api/endpoints'
import type { BudgetLine, CardCategory, CreditCard } from '../api/types'
import { ErrorBanner, Field, IconButton, Loading, Modal, PageHeader, Toggle } from '../components/ui'
import { useLoad } from '../lib/useLoad'
import { useStoredFlag } from '../lib/useStoredFlag'

/** `'new'` opens an empty form; an object opens it for editing. */
type Editing<T> = T | 'new' | null

export function CardSettingsPage() {
  const loaded = useLoad(
    async () => ({
      cards: await cardsApi.list(),
      categories: await cardCategoriesApi.list(),
      // Only bills can receive an invoice.
      bills: (await budgetLinesApi.list()).filter((line) => line.kind === 'EXPENSE'),
    }),
    [],
  )
  const [editingCard, setEditingCard] = useState<Editing<CreditCard>>(null)
  const [editingCategory, setEditingCategory] = useState<Editing<CardCategory>>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(question: string, action: () => Promise<void>) {
    if (!window.confirm(question)) return
    setError(null)
    try {
      await action()
      loaded.reload()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const data = loaded.data
  const billName = (id: number | null) => data?.bills.find((line) => line.id === id)?.name ?? '—'
  const [showInactive, toggleInactive] = useStoredFlag('finch.settings.cards.inactive', false)
  const inactiveCount = (data?.cards ?? []).filter((card) => !card.active).length

  return (
    <>
      <PageHeader title="Cartões e categorias" subtitle="Os cartões e os grupos em que as compras aparecem na fatura.">
        <Link to="/cards" className="button">
          <ArrowLeft size={18} aria-hidden />
          Faturas
        </Link>
      </PageHeader>
      <ErrorBanner message={error ?? loaded.error} onRetry={loaded.error ? loaded.reload : undefined} />
      {loaded.loading && !data && <Loading />}
      {data && (
        <div className="columns">
          <section className="card list-card" aria-label="Cartões">
            <header className="list-header">
              <h2>Cartões</h2>
              {inactiveCount > 0 && (
                <Toggle pressed={showInactive} onClick={toggleInactive}>
                  Mostrar inativos ({inactiveCount})
                </Toggle>
              )}
              <button type="button" className="button button-small" onClick={() => setEditingCard('new')}>
                <Plus size={15} aria-hidden />
                Novo cartão
              </button>
            </header>
            {data.cards.length === 0 ? (
              <p className="muted list-empty">Nenhum cartão cadastrado.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Fecha</th>
                    <th>Vence</th>
                    <th>Conta do mês</th>
                    <th>Situação</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {data.cards.filter((card) => showInactive || card.active).map((card) => (
                    <tr key={card.id}>
                      <td className="strong">{card.name}</td>
                      <td className="muted">Dia {card.closingDay}</td>
                      <td className="muted">Dia {card.dueDay}</td>
                      <td className="muted">{billName(card.budgetLineId)}</td>
                      <td className="muted">{card.active ? 'Ativo' : 'Inativo'}</td>
                      <td className="row-actions">
                        <IconButton label={`Editar ${card.name}`} onClick={() => setEditingCard(card)}>
                          <Pencil size={16} aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`Excluir ${card.name}`}
                          onClick={() => remove(`Excluir o cartão "${card.name}"?`, () => cardsApi.remove(card.id))}
                          danger
                        >
                          <Trash2 size={16} aria-hidden />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="card list-card" aria-label="Categorias">
            <header className="list-header">
              <h2>Categorias</h2>
              <button type="button" className="button button-small" onClick={() => setEditingCategory('new')}>
                <Plus size={15} aria-hidden />
                Nova categoria
              </button>
            </header>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Alimentação</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {data.categories.map((category) => (
                  <tr key={category.id}>
                    <td className="strong">{category.name}</td>
                    <td className="muted">{category.food ? 'Sim' : 'Não'}</td>
                    <td className="row-actions">
                      <IconButton label={`Editar ${category.name}`} onClick={() => setEditingCategory(category)}>
                        <Pencil size={16} aria-hidden />
                      </IconButton>
                      <IconButton
                        label={`Excluir ${category.name}`}
                        onClick={() =>
                          remove(`Excluir a categoria "${category.name}"?`, () => cardCategoriesApi.remove(category.id))
                        }
                        danger
                      >
                        <Trash2 size={16} aria-hidden />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
      {editingCard && data && (
        <CardForm
          card={editingCard === 'new' ? null : editingCard}
          bills={data.bills}
          onClose={() => setEditingCard(null)}
          onSaved={() => {
            setEditingCard(null)
            loaded.reload()
          }}
        />
      )}
      {editingCategory && (
        <CategoryForm
          category={editingCategory === 'new' ? null : editingCategory}
          onClose={() => setEditingCategory(null)}
          onSaved={() => {
            setEditingCategory(null)
            loaded.reload()
          }}
        />
      )}
    </>
  )
}

/** What every form here does when submitted: call the API, close on success, show the errors otherwise. */
function useSubmit(onSaved: () => void) {
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent, action: () => Promise<unknown>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setErrors({})
    try {
      await action()
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setErrors(fieldErrors(caught))
      setSubmitting(false)
    }
  }

  return { error, errors, submitting, submit }
}

function FormActions({ submitting, onClose }: { submitting: boolean; onClose: () => void }) {
  return (
    <div className="form-actions">
      <button type="button" className="button" onClick={onClose}>
        Cancelar
      </button>
      <button type="submit" className="button button-primary" disabled={submitting}>
        Salvar
      </button>
    </div>
  )
}

interface CardFormProps {
  /** Null when creating. */
  card: CreditCard | null
  bills: BudgetLine[]
  onClose: () => void
  onSaved: () => void
}

function CardForm({ card, bills, onClose, onSaved }: CardFormProps) {
  const [name, setName] = useState(card?.name ?? '')
  const [closingDay, setClosingDay] = useState(card?.closingDay.toString() ?? '')
  const [dueDay, setDueDay] = useState(card?.dueDay.toString() ?? '')
  const [budgetLineId, setBudgetLineId] = useState(card?.budgetLineId?.toString() ?? '')
  const [active, setActive] = useState(card?.active ?? true)
  const { error, errors, submitting, submit } = useSubmit(onSaved)

  function save(event: FormEvent) {
    const input = {
      name,
      closingDay: Number(closingDay),
      dueDay: Number(dueDay),
      budgetLineId: budgetLineId ? Number(budgetLineId) : null,
      active,
    }
    return submit(event, () => (card ? cardsApi.update(card.id, input) : cardsApi.create(input)))
  }

  return (
    <Modal title={card ? 'Editar cartão' : 'Novo cartão'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <ErrorBanner message={error} />
        <Field label="Nome" error={errors.name}>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required autoFocus />
        </Field>
        <div className="form-row">
          <Field label="Dia de fechamento" error={errors.closingDay} hint="Do fechamento em diante, a compra cai na fatura seguinte.">
            <input type="number" value={closingDay} onChange={(event) => setClosingDay(event.target.value)} min={1} max={31} required />
          </Field>
          <Field label="Dia de vencimento" error={errors.dueDay}>
            <input type="number" value={dueDay} onChange={(event) => setDueDay(event.target.value)} min={1} max={31} required />
          </Field>
        </div>
        <Field
          label="Conta do mês"
          error={errors.budgetLineId}
          hint="A conta que recebe o total da fatura nas contas do mês. Cartões na mesma conta são somados."
        >
          <select value={budgetLineId} onChange={(event) => setBudgetLineId(event.target.value)}>
            <option value="">Nenhuma</option>
            {bills
              .filter((line) => line.active || line.id === card?.budgetLineId)
              .map((line) => (
                <option key={line.id} value={line.id}>
                  {line.groupName ? `${line.name} (${line.groupName})` : line.name}
                </option>
              ))}
          </select>
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Ativo
        </label>
        <FormActions submitting={submitting} onClose={onClose} />
      </form>
    </Modal>
  )
}

interface CategoryFormProps {
  /** Null when creating. */
  category: CardCategory | null
  onClose: () => void
  onSaved: () => void
}

function CategoryForm({ category, onClose, onSaved }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? '')
  const [food, setFood] = useState(category?.food ?? false)
  const { error, errors, submitting, submit } = useSubmit(onSaved)

  function save(event: FormEvent) {
    const input = { name, food }
    return submit(event, () => (category ? cardCategoriesApi.update(category.id, input) : cardCategoriesApi.create(input)))
  }

  return (
    <Modal title={category ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <ErrorBanner message={error} />
        <Field label="Nome" error={errors.name}>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required autoFocus />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={food} onChange={(event) => setFood(event.target.checked)} />
          Conta como alimentação
          <span className="muted"> — entra no orçamento de alimentação da semana</span>
        </label>
        <FormActions submitting={submitting} onClose={onClose} />
      </form>
    </Modal>
  )
}
