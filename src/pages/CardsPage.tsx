import { ChevronLeft, ChevronRight, FileUp, Pencil, Plus, Repeat, Settings2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, fieldErrors } from '../api/client'
import { cardCategoriesApi, cardsApi, recurringChargesApi } from '../api/endpoints'
import type { CardCategory, CardInvoice, CardPurchase, CreditCard, InvoiceItem, RecurringCharge } from '../api/types'
import { CurrencyInput } from '../components/CurrencyInput'
import { InvoiceImport } from '../components/InvoiceImport'
import { ErrorBanner, Field, IconButton, Kpi, Loading, Modal, PageHeader } from '../components/ui'
import { MONTH_NAMES, formatAmount, formatDayMonth, formatMoney, formatMonthLabel, shiftMonth, todayIso } from '../lib/format'
import { useLoad } from '../lib/useLoad'

/** The purchase form is open for a new purchase, or for the one with this id. */
type Editing = 'new' | number

export function CardsPage() {
  const cards = useLoad(() => cardsApi.list(), [])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [chosenMonth, setChosenMonth] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [managingRecurring, setManagingRecurring] = useState(false)
  const [importing, setImporting] = useState(false)
  /** Bumped after a purchase changes, to load the invoice again. */
  const [version, setVersion] = useState(0)

  const active = (cards.data ?? []).filter((card) => card.active)
  const card = active.find((each) => each.id === selectedId) ?? active[0]
  // Until a month is chosen, the screen follows the invoice that is open today for the card on screen.
  const month = chosenMonth ?? card?.currentInvoiceMonth

  return (
    <>
      <PageHeader title="Cartões" subtitle="A fatura de cada mês, compra a compra.">
        {card && month && (
          <div className="stepper" role="group" aria-label="Fatura">
            <button type="button" className="icon-button" onClick={() => setChosenMonth(shiftMonth(month, -1))} aria-label="Fatura anterior">
              <ChevronLeft size={18} aria-hidden />
            </button>
            <span className="stepper-value stepper-wide">{formatMonthLabel(month)}</span>
            <button type="button" className="icon-button" onClick={() => setChosenMonth(shiftMonth(month, 1))} aria-label="Próxima fatura">
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        )}
        <Link to="/settings/cards" className="button">
          <Settings2 size={18} aria-hidden />
          Cartões e categorias
        </Link>
        {card && month && (
          <button type="button" className="button" onClick={() => setImporting(true)}>
            <FileUp size={18} aria-hidden />
            Importar fatura
          </button>
        )}
        {card && (
          <button type="button" className="button" onClick={() => setManagingRecurring(true)}>
            <Repeat size={18} aria-hidden />
            Recorrentes
          </button>
        )}
        {card && (
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            <Plus size={18} aria-hidden />
            Nova compra
          </button>
        )}
      </PageHeader>
      <ErrorBanner message={cards.error} onRetry={cards.reload} />
      {cards.loading && !cards.data && <Loading />}
      {cards.data && !card && (
        <div className="panel empty-state">
          <h2>Nenhum cartão ativo</h2>
          <p className="muted">Cadastre um cartão, com o dia de fechamento e o de vencimento, para lançar as compras.</p>
          <Link to="/settings/cards" className="button button-primary">
            Cadastrar cartão
          </Link>
        </div>
      )}
      {card && month && (
        <>
          {active.length > 1 && (
            <div className="segmented" role="tablist" aria-label="Cartão">
              {active.map((each) => (
                <button
                  key={each.id}
                  type="button"
                  role="tab"
                  aria-selected={each.id === card.id}
                  onClick={() => setSelectedId(each.id)}
                >
                  {each.name}
                </button>
              ))}
            </div>
          )}
          <Invoice key={`${card.id}-${month}-${version}`} card={card} month={month} onEdit={setEditing} onChanged={() => setVersion(version + 1)} />
        </>
      )}
      {importing && card && month && (
        <InvoiceImport
          card={card}
          month={month}
          onClose={() => {
            setImporting(false)
            setVersion(version + 1)
          }}
        />
      )}
      {managingRecurring && card && (
        <RecurringManager
          card={card}
          onClose={() => {
            setManagingRecurring(false)
            setVersion(version + 1)
          }}
        />
      )}
      {editing && card && (
        <PurchaseForm
          card={card}
          purchaseId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setVersion(version + 1)
          }}
        />
      )}
    </>
  )
}

interface InvoiceProps {
  card: CreditCard
  month: string
  onEdit: (purchaseId: number) => void
  onChanged: () => void
}

function Invoice({ card, month, onEdit, onChanged }: InvoiceProps) {
  const invoice = useLoad(() => cardsApi.invoice(card.id, month), [])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('type')

  async function remove(item: InvoiceItem) {
    const all = item.count > 1 ? ` As ${item.count} parcelas saem das faturas.` : ''
    if (!window.confirm(`Excluir a compra "${item.description}"?${all}`)) return
    setError(null)
    try {
      await cardsApi.removePurchase(card.id, item.purchaseId)
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  /** The charge arrived: it becomes a purchase of this invoice, made today, with the usual amount. */
  async function launch(charge: RecurringCharge) {
    setError(null)
    try {
      await cardsApi.createPurchase(card.id, {
        description: charge.description,
        purchaseDate: todayIso(),
        amount: charge.amount,
        installments: 1,
        firstInstallmentNumber: 1,
        totalInstallments: null,
        categoryId: charge.categoryId,
        firstInvoiceMonth: month,
      })
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  if (invoice.loading && !invoice.data) return <Loading />
  if (!invoice.data) return <ErrorBanner message={invoice.error} onRetry={invoice.reload} />
  const data = invoice.data
  const everything = [...data.installments, ...data.groups.flatMap((group) => group.items)].sort((a, b) =>
    b.purchaseDate.localeCompare(a.purchaseDate),
  )

  return (
    <>
      <ErrorBanner message={error} />
      <InvoiceSummary invoice={data} />
      <div className="split">
        <div>
          <div className="segmented" role="tablist" aria-label="Visão">
            {VIEWS.map((each) => (
              <button key={each.id} type="button" role="tab" aria-selected={view === each.id} onClick={() => setView(each.id)}>
                {each.label}
              </button>
            ))}
          </div>
          {data.expected.length > 0 && (
            <section className="panel list-card expected-card" aria-label="Recorrentes previstos">
              <header className="panel-header">
                <h2>Recorrentes previstos</h2>
                <span className="muted">ainda não entraram na fatura</span>
                <strong className="numeric forecast">{formatAmount(data.expectedTotal)}</strong>
              </header>
              <ul className="rows">
                {data.expected.map((charge) => (
                  <li key={charge.id}>
                    <span className="row-text">
                      <strong>{charge.description}</strong>
                      <span className="muted">costuma vir no dia {charge.chargeDay}</span>
                    </span>
                    <span className="numeric forecast">{formatAmount(charge.amount)}</span>
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => launch(charge)}
                      aria-label={`Lançar ${charge.description}`}
                      title="Registra a cobrança deste mês como compra, com este valor. Depois é só editar se veio diferente."
                    >
                      Lançar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {everything.length === 0 ? (
            <div className="panel empty-state">
              <h2>Fatura sem compras</h2>
              <p className="muted">Nada foi lançado em {formatMonthLabel(month)} neste cartão.</p>
            </div>
          ) : view === 'category' ? (
            <section className="panel list-card" aria-label="Compras por categoria">
              <header className="panel-header">
                <h2>Compras por categoria</h2>
                <strong className="numeric">{formatAmount(data.total)}</strong>
              </header>
              {byCategory(everything).map((group) => (
                <div key={group.name} role="group" aria-label={group.name}>
                  <div className="list-subheader">
                    <span>{group.name}</span>
                    <span className="numeric">
                      {formatAmount(group.total)} · {Math.round((group.total / (data.total || 1)) * 100)}%
                    </span>
                  </div>
                  <ItemTable items={group.items} showInstallment onEdit={onEdit} onRemove={remove} />
                </div>
              ))}
            </section>
          ) : view === 'date' ? (
            <section className="panel list-card" aria-label="Compras por data">
              <header className="panel-header">
                <h2>Compras por data</h2>
                <strong className="numeric">{formatAmount(data.total)}</strong>
              </header>
              <ItemTable items={everything} showInstallment onEdit={onEdit} onRemove={remove} />
            </section>
          ) : (
            <div className="columns">
              <section className="panel list-card" aria-label="Parcelado">
                <header className="panel-header">
                  <h2>Parcelado</h2>
                  <strong className="numeric">{formatAmount(data.installmentTotal)}</strong>
                </header>
                {data.installments.length === 0 ? (
                  <p className="muted list-empty">Nenhuma parcela nesta fatura.</p>
                ) : (
                  <ItemTable items={data.installments} showInstallment onEdit={onEdit} onRemove={remove} />
                )}
              </section>
              <section className="panel list-card" aria-label="À vista">
                <header className="panel-header">
                  <h2>À vista</h2>
                  <strong className="numeric">{formatAmount(data.singleTotal)}</strong>
                </header>
                {data.groups.length === 0 && <p className="muted list-empty">Nenhuma compra à vista nesta fatura.</p>}
                {data.groups.map((group) => (
                  <div key={group.categoryId ?? 'none'} role="group" aria-label={group.categoryName ?? 'Sem categoria'}>
                    <div className="list-subheader">
                      <span>{group.categoryName ?? 'Sem categoria'}</span>
                      <span className="numeric">{formatAmount(group.total)}</span>
                    </div>
                    <ItemTable items={group.items} onEdit={onEdit} onRemove={remove} />
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
        <Outlook card={card} invoice={data} />
      </div>
    </>
  )
}

type View = 'type' | 'category' | 'date'

const VIEWS: { id: View; label: string }[] = [
  { id: 'type', label: 'Por tipo' },
  { id: 'category', label: 'Por categoria' },
  { id: 'date', label: 'Por data' },
]

/** Every charge of the invoice, installments included, under its category; the heaviest category first. */
function byCategory(items: InvoiceItem[]): { name: string; total: number; items: InvoiceItem[] }[] {
  const groups = new Map<string, InvoiceItem[]>()
  for (const item of items) {
    const name = item.categoryName ?? 'Sem categoria'
    groups.set(name, [...(groups.get(name) ?? []), item])
  }
  return [...groups.entries()]
    .map(([name, grouped]) => ({ name, items: grouped, total: grouped.reduce((sum, item) => sum + item.amount, 0) }))
    .sort((a, b) => b.total - a.total)
}

/** How many invoices are shown behind the one on screen, and how many ahead. */
const BEHIND = 5
const AHEAD_SHOWN = 6
/** Installments rarely go beyond a year, so this is how far the limit check looks. */
const AHEAD_CHECKED = 12

const shortMonth = (yearMonth: string) => MONTH_NAMES[Number(yearMonth.slice(5)) - 1].slice(0, 3)

/** What surrounds the invoice on screen: the ones before, what is already on the next ones, and the limit check. */
function Outlook({ card, invoice }: { card: CreditCard; invoice: CardInvoice }) {
  const before = Array.from({ length: BEHIND }, (_, index) => shiftMonth(invoice.month, index - BEHIND))
  const after = Array.from({ length: AHEAD_CHECKED }, (_, index) => shiftMonth(invoice.month, index + 1))
  const others = useLoad(() => cardsApi.invoices(card.id, [...before, ...after]), [])
  const [used, setUsed] = useState('')

  if (!others.data) return others.error ? <ErrorBanner message={others.error} onRetry={others.reload} /> : <Loading />
  const past = [...others.data.slice(0, BEHIND), invoice]
  const future = others.data.slice(BEHIND)
  const committed = future.reduce((sum, each) => sum + each.total, 0)
  const expected = invoice.total + committed
  const difference = Number(used) - expected
  const usual = past.slice(0, BEHIND).reduce((sum, each) => sum + each.total, 0) / BEHIND

  return (
    <div className="stack">
      <section className="panel" aria-label="Próximas faturas">
        <header className="panel-header">
          <h2>Próximas faturas</h2>
          <span className="muted">lançado mais recorrentes</span>
        </header>
        <Meters invoices={future.slice(0, AHEAD_SHOWN)} />
      </section>
      <section className="panel" aria-label="Últimas faturas">
        <header className="panel-header">
          <h2>Últimas faturas</h2>
          <span className="muted">média de {formatAmount(usual)}</span>
        </header>
        <Meters invoices={past} current={invoice.month} />
      </section>
      <section className="panel" aria-label="Conferência do limite">
        <header className="panel-header">
          <h2>Conferência do limite</h2>
          <span className="muted">falta lançar algo?</span>
        </header>
        <div className="check-body">
          <Field label="Limite usado, no app do banco">
            <CurrencyInput value={used} onChange={setUsed} />
          </Field>
          <dl className="check-lines">
            <dt>Fatura de {formatMonthLabel(invoice.month)}</dt>
            <dd>{formatAmount(invoice.total)}</dd>
            <dt title="Os recorrentes previstos não entram nesta conta.">Próximas faturas, já lançado</dt>
            <dd>{formatAmount(committed)}</dd>
            <dt>Soma</dt>
            <dd>{formatAmount(expected)}</dd>
          </dl>
          {used !== '' && (
            <p className={Math.abs(difference) < 0.005 ? 'check-result check-ok' : 'check-result'} role="status">
              {Math.abs(difference) < 0.005
                ? 'Tudo conferido'
                : `${difference > 0 ? 'Falta lançar' : 'Lançado a mais'} ${formatMoney(Math.abs(difference))}`}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

/** One line per invoice: the month, a bar as long as its total against the largest, and the total. */
function Meters({ invoices, current }: { invoices: CardInvoice[]; current?: string }) {
  const largest = Math.max(1, ...invoices.map((each) => each.total + each.expectedTotal))
  return (
    <ul className="meters">
      {invoices.map((each) => (
        <li key={each.month} className={each.month === current ? 'meter-current' : undefined}>
          <span className="meter-label">{shortMonth(each.month)}</span>
          <span className="meter-track">
            <span style={{ width: `${(Math.max(0, each.total + each.expectedTotal) / largest) * 100}%` }} />
          </span>
          <span className="numeric">{formatAmount(each.total + each.expectedTotal)}</span>
        </li>
      ))}
    </ul>
  )
}

function InvoiceSummary({ invoice }: { invoice: CardInvoice }) {
  return (
    <div className="kpis">
      <Kpi label="Total da fatura" value={formatMoney(invoice.total)} />
      <Kpi label="Parcelado" value={formatMoney(invoice.installmentTotal)} />
      <Kpi label="À vista" value={formatMoney(invoice.singleTotal)} />
      {invoice.expectedTotal > 0 && (
        <Kpi label="Recorrentes previstos" value={formatMoney(invoice.expectedTotal)} note="fora do total, até entrarem" />
      )}
      <Kpi label={`Fecha em ${formatDayMonth(invoice.closingDate)}`} value={`Vence em ${formatDayMonth(invoice.dueDate)}`} />
    </div>
  )
}

interface ItemTableProps {
  items: InvoiceItem[]
  /** Adds the "2/6" column of split purchases. */
  showInstallment?: boolean
  onEdit: (purchaseId: number) => void
  onRemove: (item: InvoiceItem) => void
}

function ItemTable({ items, showInstallment, onEdit, onRemove }: ItemTableProps) {
  return (
    <table className="item-table">
      <tbody>
        {items.map((item) => (
          <tr key={item.purchaseId}>
            <td>{item.description}</td>
            {showInstallment && (
              <td className="muted">{item.count > 1 ? `${item.number}/${item.count}` : ''}</td>
            )}
            <td className="muted">{formatDayMonth(item.purchaseDate)}</td>
            <td className="numeric">{formatAmount(item.amount)}</td>
            <td className="row-actions">
              <IconButton label={`Editar ${item.description}`} onClick={() => onEdit(item.purchaseId)}>
                <Pencil size={15} aria-hidden />
              </IconButton>
              <IconButton label={`Excluir ${item.description}`} onClick={() => onRemove(item)} danger>
                <Trash2 size={15} aria-hidden />
              </IconButton>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface PurchaseFormProps {
  card: CreditCard
  /** Null when creating. */
  purchaseId: number | null
  onClose: () => void
  onSaved: () => void
}

function PurchaseForm({ card, purchaseId, onClose, onSaved }: PurchaseFormProps) {
  // The invoice only carries the installment of the month, so editing starts from the purchase itself.
  const loaded = useLoad(
    async () => ({
      categories: await cardCategoriesApi.list(),
      purchase: purchaseId === null ? null : await cardsApi.getPurchase(card.id, purchaseId),
    }),
    [],
  )
  const title = purchaseId === null ? `Nova compra · ${card.name}` : `Editar compra · ${card.name}`

  return (
    <Modal title={title} onClose={onClose}>
      {loaded.data ? (
        <PurchaseFields card={card} purchase={loaded.data.purchase} categories={loaded.data.categories} onClose={onClose} onSaved={onSaved} />
      ) : (
        <div className="form">{loaded.error ? <ErrorBanner message={loaded.error} onRetry={loaded.reload} /> : <Loading />}</div>
      )}
    </Modal>
  )
}

interface PurchaseFieldsProps {
  card: CreditCard
  purchase: CardPurchase | null
  categories: CardCategory[]
  onClose: () => void
  onSaved: () => void
}

function PurchaseFields({ card, purchase, categories, onClose, onSaved }: PurchaseFieldsProps) {
  const [description, setDescription] = useState(purchase?.description ?? '')
  const [purchaseDate, setPurchaseDate] = useState(purchase?.purchaseDate ?? todayIso())
  const [amount, setAmount] = useState(purchase ? Math.abs(purchase.amount).toFixed(2) : '')
  const [refund, setRefund] = useState(purchase ? purchase.amount < 0 : false)
  const [installments, setInstallments] = useState(String(purchase?.installments ?? 1))
  const [firstNumber, setFirstNumber] = useState(String(purchase?.firstInstallmentNumber ?? 1))
  // Empty means "the purchase goes to the end of its plan", which is the usual case.
  const underWay = purchase !== null && purchase.totalInstallments !== purchase.firstInstallmentNumber + purchase.installments - 1
  const [totalInstallments, setTotalInstallments] = useState(underWay ? String(purchase.totalInstallments) : '')
  const [categoryId, setCategoryId] = useState(purchase?.categoryId?.toString() ?? '')
  // An existing purchase keeps its invoice unless the user clears the field to let the date decide again.
  const [firstInvoiceMonth, setFirstInvoiceMonth] = useState(purchase?.firstInvoiceMonth ?? '')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setErrors({})
    const input = {
      description,
      purchaseDate,
      amount: Number(amount) * (refund ? -1 : 1),
      installments: Number(installments),
      firstInstallmentNumber: Number(firstNumber),
      totalInstallments: totalInstallments ? Number(totalInstallments) : null,
      categoryId: categoryId ? Number(categoryId) : null,
      firstInvoiceMonth: firstInvoiceMonth || null,
    }
    try {
      if (purchase) await cardsApi.updatePurchase(card.id, purchase.id, input)
      else await cardsApi.createPurchase(card.id, input)
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setErrors(fieldErrors(caught))
      setSubmitting(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <ErrorBanner message={error} />
      <Field label="Descrição" error={errors.description}>
        <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120} required autoFocus />
      </Field>
      <div className="form-row">
        <Field label="Data da compra" error={errors.purchaseDate}>
          <input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required />
        </Field>
        <Field label="Valor total" error={errors.amount} hint="A soma das parcelas lançadas.">
          <CurrencyInput value={amount} onChange={setAmount} required />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Parcelas" error={errors.installments}>
          <input type="number" value={installments} onChange={(event) => setInstallments(event.target.value)} min={1} max={48} required />
        </Field>
        <Field label="Categoria" error={errors.categoryId}>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Começa na parcela" error={errors.firstInstallmentNumber} hint="Acima de 1 se a compra já estava em andamento.">
          <input type="number" value={firstNumber} onChange={(event) => setFirstNumber(event.target.value)} min={1} max={48} required />
        </Field>
        <Field label="Total de parcelas" error={errors.totalInstallments} hint="Em branco, termina na última lançada.">
          <input type="number" value={totalInstallments} onChange={(event) => setTotalInstallments(event.target.value)} min={1} max={48} />
        </Field>
      </div>
      <Field
        label="Primeira fatura"
        error={errors.firstInvoiceMonth}
        hint={`Em branco, vale a data da compra: do dia ${card.closingDay} em diante, a compra cai na fatura seguinte.`}
      >
        <input type="month" value={firstInvoiceMonth} onChange={(event) => setFirstInvoiceMonth(event.target.value)} />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={refund} onChange={(event) => setRefund(event.target.checked)} />
        É um estorno
        <span className="muted"> — entra como crédito na fatura</span>
      </label>
      <div className="form-actions">
        <button type="button" className="button" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="button button-primary" disabled={submitting}>
          Salvar
        </button>
      </div>
    </form>
  )
}

interface RecurringManagerProps {
  card: CreditCard
  onClose: () => void
}

/** What the card charges every month: the list, with a short form to add one more. */
function RecurringManager({ card, onClose }: RecurringManagerProps) {
  const loaded = useLoad(async () => ({ charges: await recurringChargesApi.list(card.id), categories: await cardCategoriesApi.list() }), [])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [chargeDay, setChargeDay] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function run(action: () => Promise<unknown>, done?: () => void) {
    setSubmitting(true)
    setError(null)
    setErrors({})
    try {
      await action()
      done?.()
      loaded.reload()
    } catch (caught) {
      setError(errorMessage(caught))
      setErrors(fieldErrors(caught))
    } finally {
      setSubmitting(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(
      () =>
        recurringChargesApi.create(card.id, {
          description,
          amount: Number(amount),
          chargeDay: Number(chargeDay),
          categoryId: categoryId ? Number(categoryId) : null,
          active: true,
        }),
      () => {
        setDescription('')
        setAmount('')
        setChargeDay('')
      },
    )
  }

  return (
    <Modal title={`Recorrentes · ${card.name}`} onClose={onClose}>
      <div className="form">
        <p className="muted">
          O que este cartão cobra todo mês. Cada fatura aberta conta com esses valores como previstos até a compra com a mesma descrição ser lançada.
        </p>
        <ErrorBanner message={error ?? loaded.error} />
        {loaded.loading && !loaded.data && <Loading />}
        {loaded.data && loaded.data.charges.length === 0 && <p className="muted">Nenhuma compra recorrente neste cartão.</p>}
        {loaded.data && loaded.data.charges.length > 0 && (
          <ul className="rows recurring-list" aria-label="Compras recorrentes">
            {loaded.data.charges.map((charge) => (
              <li key={charge.id}>
                <span className="row-text">
                  <strong>{charge.description}</strong>
                  <span className="muted">dia {charge.chargeDay}</span>
                </span>
                <span className="numeric">{formatAmount(charge.amount)}</span>
                <IconButton
                  label={`Excluir ${charge.description}`}
                  onClick={() => void run(() => recurringChargesApi.remove(card.id, charge.id))}
                  danger
                >
                  <Trash2 size={15} aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <form className="form" onSubmit={submit} aria-label="Nova compra recorrente">
          <Field label="Descrição" error={errors.description} hint="Igual à que aparece na fatura, para o sistema reconhecer quando ela chegar.">
            <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120} required />
          </Field>
          <div className="form-row">
            <Field label="Valor" error={errors.amount}>
              <CurrencyInput value={amount} onChange={setAmount} required />
            </Field>
            <Field label="Dia da cobrança" error={errors.chargeDay}>
              <input type="number" value={chargeDay} onChange={(event) => setChargeDay(event.target.value)} min={1} max={31} required />
            </Field>
          </div>
          <Field label="Categoria">
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Sem categoria</option>
              {(loaded.data?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-actions">
            <button type="button" className="button" onClick={onClose}>
              Fechar
            </button>
            <button type="submit" className="button button-primary" disabled={submitting}>
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
