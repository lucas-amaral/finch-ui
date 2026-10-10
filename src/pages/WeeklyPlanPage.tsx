import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { errorMessage, fieldErrors } from '../api/client'
import { weeklyPlanApi } from '../api/endpoints'
import type { PlannedWeek, WeeklyBudget } from '../api/types'
import { CurrencyInput } from '../components/CurrencyInput'
import { ErrorBanner, Field, IconButton, Loading, Modal, PageHeader, Stepper } from '../components/ui'
import { currentYearMonth, formatAmount, formatDate, formatDayMonth, formatMoney, formatWhole, todayIso } from '../lib/format'
import { useLoad } from '../lib/useLoad'

export function WeeklyPlanPage() {
  const [year, setYear] = useState(currentYearMonth().year)
  const loaded = useLoad(async () => ({ plan: await weeklyPlanApi.get(year), budgets: await weeklyPlanApi.listBudgets() }), [year])
  /** `null` = closed, `'new'` = creating, otherwise the budget being edited. */
  const [editing, setEditing] = useState<WeeklyBudget | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = todayIso()
  const data = loaded.data
  /** The start of the week in focus; until one is picked, the current week (or the last of a year that is over). */
  const [picked, setPicked] = useState<string | null>(null)
  const weeks = data?.plan.weeks ?? []
  const focusIndex = Math.max(
    0,
    picked !== null && weeks.some((week) => week.start === picked)
      ? weeks.findIndex((week) => week.start === picked)
      : weeks.some((week) => week.start <= today && today <= week.end)
        ? weeks.findIndex((week) => week.start <= today && today <= week.end)
        : weeks.length - 1,
  )

  async function remove(budget: WeeklyBudget) {
    if (!window.confirm(`Excluir o orçamento que começa em ${formatDate(budget.validFrom)}?`)) return
    setError(null)
    try {
      await weeklyPlanApi.removeBudget(budget.id)
      loaded.reload()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <>
      <PageHeader title="Semana" subtitle="O que foi gasto nos cartões a cada semana, de domingo a sábado, contra o orçamento.">
        <div className="stepper" role="group" aria-label="Ano">
          <button type="button" className="icon-button" onClick={() => setYear(year - 1)} aria-label="Ano anterior">
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span className="stepper-value">{year}</span>
          <button type="button" className="icon-button" onClick={() => setYear(year + 1)} aria-label="Próximo ano">
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </PageHeader>
      <ErrorBanner message={error ?? loaded.error} onRetry={loaded.error ? loaded.reload : undefined} />
      {loaded.loading && !data && <Loading />}
      {data && weeks.length > 0 && (
        <WeekFocus weeks={weeks} index={focusIndex} today={today} onSelect={(index) => setPicked(weeks[index].start)} />
      )}
      {data && (
        <div className="columns columns-wide-first">
          <section className="panel budget-card" aria-label="Semanas">
            <div className="table-wrapper">
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th className="numeric">Orçamento</th>
                    <th className="numeric" title="Compras à vista feitas na semana.">
                      À vista
                    </th>
                    <th className="numeric" title="A parte da semana nas parcelas do mês: parcelas do mês ÷ dias do mês × 7.">
                      Parcelas
                    </th>
                    <th className="numeric">Gasto total</th>
                    <th className="numeric">Saldo</th>
                    <th className="numeric">Sem alimentação</th>
                    <th className="numeric">Orç. alimentação</th>
                    <th className="numeric">Alimentação</th>
                    <th className="numeric">Saldo alim.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.plan.weeks.map((week) => (
                    <WeekRow key={week.start} week={week} current={week.start <= today && today <= week.end} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel list-card" aria-label="Orçamentos">
            <header className="list-header">
              <h2>Orçamentos</h2>
              <button type="button" className="button button-small" onClick={() => setEditing('new')}>
                <Plus size={15} aria-hidden />
                Novo orçamento
              </button>
            </header>
            {data.budgets.length === 0 ? (
              <p className="muted list-empty">Sem orçamento, as semanas mostram só os gastos. Cadastre o valor semanal total e o de alimentação.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>A partir de</th>
                    <th className="numeric">Total</th>
                    <th className="numeric">Alimentação</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {data.budgets.map((budget) => (
                    <tr key={budget.id}>
                      <td>{formatDate(budget.validFrom)}</td>
                      <td className="numeric">{formatAmount(budget.totalAmount)}</td>
                      <td className="numeric">{formatAmount(budget.foodAmount)}</td>
                      <td className="row-actions">
                        <IconButton label={`Editar o orçamento de ${formatDate(budget.validFrom)}`} onClick={() => setEditing(budget)}>
                          <Pencil size={16} aria-hidden />
                        </IconButton>
                        <IconButton label={`Excluir o orçamento de ${formatDate(budget.validFrom)}`} onClick={() => remove(budget)} danger>
                          <Trash2 size={16} aria-hidden />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
      {editing && (
        <BudgetForm
          budget={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loaded.reload()
          }}
        />
      )}
    </>
  )
}

function WeekRow({ week, current }: { week: PlannedWeek; current: boolean }) {
  const money = (value: number | null) => (value === null ? '—' : formatAmount(value))
  const tone = (value: number | null) => (value === null ? '' : value < 0 ? ' negative' : ' positive')
  return (
    <tr className={current ? 'current-month' : undefined}>
      <th scope="row">
        {formatDayMonth(week.start)} a {formatDayMonth(week.end)}
      </th>
      <td className="numeric amount">{money(week.budgetTotal)}</td>
      <td className="numeric amount">{money(week.directSpending)}</td>
      <td className="numeric amount">{money(week.installmentShare)}</td>
      <td className="numeric total">{money(week.totalSpending)}</td>
      <td className={`numeric total${tone(week.balance)}`}>{money(week.balance)}</td>
      <td className="numeric amount">{money(week.nonFoodSpending)}</td>
      <td className="numeric amount">{money(week.foodBudget)}</td>
      <td className="numeric total">{money(week.foodSpending)}</td>
      <td className={`numeric total${tone(week.foodBalance)}`}>{money(week.foodBalance)}</td>
    </tr>
  )
}

interface BudgetFormProps {
  /** Null when creating. */
  budget: WeeklyBudget | null
  onClose: () => void
  onSaved: () => void
}

function BudgetForm({ budget, onClose, onSaved }: BudgetFormProps) {
  const [validFrom, setValidFrom] = useState(budget?.validFrom ?? todayIso())
  const [totalAmount, setTotalAmount] = useState(budget ? budget.totalAmount.toFixed(2) : '')
  const [foodAmount, setFoodAmount] = useState(budget ? budget.foodAmount.toFixed(2) : '')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setErrors({})
    const input = { validFrom, totalAmount: Number(totalAmount), foodAmount: Number(foodAmount) }
    try {
      if (budget) await weeklyPlanApi.updateBudget(budget.id, input)
      else await weeklyPlanApi.createBudget(input)
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setErrors(fieldErrors(caught))
      setSubmitting(false)
    }
  }

  return (
    <Modal title={budget ? 'Editar orçamento' : 'Novo orçamento'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <Field label="A partir de" error={errors.validFrom} hint="Vale para as semanas que começam nesta data ou depois, até o próximo orçamento.">
          <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} required autoFocus />
        </Field>
        <div className="form-row">
          <Field label="Total por semana" error={errors.totalAmount}>
            <CurrencyInput value={totalAmount} onChange={setTotalAmount} required />
          </Field>
          <Field label="Alimentação por semana" error={errors.foodAmount}>
            <CurrencyInput value={foodAmount} onChange={setFoodAmount} required />
          </Field>
        </div>
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button button-primary" disabled={submitting}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** How many weeks the history strip shows, ending at the week in focus (or a little after it). */
const HISTORY = 10

interface WeekFocusProps {
  weeks: PlannedWeek[]
  index: number
  today: string
  onSelect: (index: number) => void
}

const weekLabel = (week: PlannedWeek) => `${formatDayMonth(week.start)} a ${formatDayMonth(week.end)}`

/** The week that matters now, large: the two limits, what the total is made of and the weeks around it. */
function WeekFocus({ weeks, index, today, onSelect }: WeekFocusProps) {
  const week = weeks[index]
  const state = week.end < today ? 'encerrada' : week.start > today ? 'futura' : 'semana atual'
  const otherDirect = week.directSpending - week.foodSpending
  const first = Math.max(0, Math.min(index - HISTORY + 3, weeks.length - HISTORY))
  const shown = weeks.slice(first, first + HISTORY)
  const largest = Math.max(1, ...shown.map((each) => Math.max(each.totalSpending, each.budgetTotal ?? 0)))

  return (
    <section className="week-focus" aria-label="Semana em foco">
      <div className="week-focus-head">
        <Stepper
          label="Semana"
          value={weekLabel(week)}
          previousLabel="Semana anterior"
          nextLabel="Próxima semana"
          onPrevious={() => onSelect(Math.max(0, index - 1))}
          onNext={() => onSelect(Math.min(weeks.length - 1, index + 1))}
          wide
        />
        <span className={state === 'semana atual' ? 'chip' : 'chip chip-neutral'}>{state}</span>
      </div>
      <div className="week-gauges">
        <Gauge title="Alimentação" spent={week.foodSpending} limit={week.foodBudget} note="Categorias marcadas como alimentação." />
        <Gauge title="Total no cartão" spent={week.totalSpending} limit={week.budgetTotal} note="Compras da semana mais a parte das parcelas." />
        <div className="panel" aria-label="Do que o total é feito" role="group">
          <header className="panel-header">
            <h2>Do que o total é feito</h2>
          </header>
          <dl className="check-lines week-parts">
            <dt>Alimentação</dt>
            <dd>{formatAmount(week.foodSpending)}</dd>
            <dt>Outras compras à vista</dt>
            <dd>{formatAmount(otherDirect)}</dd>
            <dt title="Parcelas da fatura do mês, divididas pelas semanas dela.">Parcelas diluídas</dt>
            <dd>{formatAmount(week.installmentShare)}</dd>
            <dt>Total</dt>
            <dd>{formatAmount(week.totalSpending)}</dd>
          </dl>
        </div>
      </div>
      <div className="panel">
        <header className="panel-header">
          <h2>Semanas próximas</h2>
          <span className="muted">a linha tracejada é o limite total de cada semana</span>
        </header>
        <div className="bars week-bars">
          {shown.map((each, offset) => {
            const over = each.budgetTotal !== null && each.totalSpending > each.budgetTotal
            return (
              <button
                key={each.start}
                type="button"
                className="bar"
                onClick={() => onSelect(first + offset)}
                aria-pressed={first + offset === index}
                aria-label={`Semana de ${weekLabel(each)}: ${formatMoney(each.totalSpending)}`}
              >
                <span className={over ? 'bar-value warning' : 'bar-value'}>{formatWhole(each.totalSpending)}</span>
                <span className="bar-track" style={{ height: '70%' }}>
                  {each.budgetTotal !== null && <i style={{ bottom: `${(each.budgetTotal / largest) * 100}%` }} />}
                  <span className="bar-stack" style={{ height: `${(Math.max(0, each.totalSpending) / largest) * 100}%` }}>
                    <span style={{ flexGrow: Math.max(0, each.foodSpending), background: 'var(--primary)' }} />
                    <span
                      style={{
                        flexGrow: Math.max(0, each.directSpending - each.foodSpending),
                        background: 'color-mix(in srgb, var(--primary) 55%, var(--surface))',
                      }}
                    />
                    <span
                      style={{ flexGrow: Math.max(0, each.installmentShare), background: 'color-mix(in srgb, var(--primary) 25%, var(--surface))' }}
                    />
                  </span>
                </span>
                <span className="bar-label">{formatDayMonth(each.start)}</span>
              </button>
            )
          })}
        </div>
        <p className="legend">
          <span>
            <i className="swatch" /> Alimentação
          </span>
          <span>
            <i className="swatch" style={{ background: 'color-mix(in srgb, var(--primary) 55%, var(--surface))' }} /> Outras compras
          </span>
          <span>
            <i className="swatch" style={{ background: 'color-mix(in srgb, var(--primary) 25%, var(--surface))' }} /> Parcelas diluídas
          </span>
        </p>
      </div>
    </section>
  )
}

interface GaugeProps {
  title: string
  spent: number
  /** Null before the first weekly budget begins. */
  limit: number | null
  note: string
}

function Gauge({ title, spent, limit, note }: GaugeProps) {
  const over = limit !== null && spent > limit
  return (
    <div className="panel gauge" role="group" aria-label={title}>
      <div className="gauge-head">
        <strong>{title}</strong>
        <span className="muted">{limit === null ? 'sem limite cadastrado' : `limite de ${formatMoney(limit)}`}</span>
      </div>
      <div className="gauge-value">
        <strong>{formatMoney(spent)}</strong>
        {limit !== null && <span className={over ? 'warning' : 'positive'}>{over ? `${formatMoney(spent - limit)} acima` : `${formatMoney(limit - spent)} livres`}</span>}
      </div>
      <div className="progress">
        <span className={over ? 'progress-over' : undefined} style={{ width: `${limit ? Math.min(100, (spent / limit) * 100) : 0}%` }} />
      </div>
      <span className="muted">{note}</span>
    </div>
  )
}
