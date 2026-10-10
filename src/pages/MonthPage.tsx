import { Check, Pencil, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage, fieldErrors } from '../api/client'
import { budgetLinesApi, budgetYearsApi } from '../api/endpoints'
import type { BudgetEntry, BudgetNature, BudgetYearLine } from '../api/types'
import { EntryForm } from '../components/EntryForm'
import type { EntryCell } from '../components/EntryForm'
import { CurrencyInput } from '../components/CurrencyInput'
import { ErrorBanner, Field, IconButton, Kpi, Loading, Modal, PageHeader, Stepper } from '../components/ui'
import { NATURES, NATURE_GROUP_LABELS, NATURE_LABELS, entryOf } from '../lib/budget'
import { MONTH_NAMES, currentYearMonth, formatAmount, formatMoney, shiftMonth, toYearMonth } from '../lib/format'
import { useLoad } from '../lib/useLoad'

/** A line of the month together with the value it has there. */
interface Row {
  line: BudgetYearLine
  entry: BudgetEntry
}

/** Bills in the order they fall due; the ones without a day go last, by name. */
function byDueDay(a: Row, b: Row): number {
  return (a.line.dueDay ?? 99) - (b.line.dueDay ?? 99) || a.line.name.localeCompare(b.line.name)
}

const sum = (rows: Row[]) => rows.reduce((total, row) => total + row.entry.amount, 0)

export function MonthPage() {
  const today = currentYearMonth()
  const [params, setParams] = useSearchParams()
  const asked = params.get('m')
  const yearMonth = asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : toYearMonth(today.year, today.month)
  const [year, month] = yearMonth.split('-').map(Number)
  const budget = useLoad(() => budgetYearsApi.get(year), [year])
  const [editing, setEditing] = useState<EntryCell | null>(null)
  const [busy, setBusy] = useState(false)
  /** Which bills the two lists show: all of them, or only the ones of a nature. */
  const [filter, setFilter] = useState<BudgetNature | null>(null)
  const [addingExtra, setAddingExtra] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const data = budget.data
  const goTo = (target: string) => setParams({ m: target })

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      budget.reload()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const settle = ({ line, entry }: Row, settled: boolean) =>
    run(() => budgetLinesApi.setEntry(line.id, yearMonth, { amount: entry.amount, settled }))

  const monthData = data?.months[month - 1]
  const rowsOf = (kind: BudgetYearLine['kind']): Row[] =>
    (data?.lines ?? [])
      .filter((line) => line.kind === kind)
      .flatMap((line) => {
        const entry = monthData && entryOf(monthData, line.id)
        return entry ? [{ line, entry }] : []
      })
  const bills = rowsOf('EXPENSE').sort(byDueDay)
  const shown = bills.filter((row) => filter === null || row.line.nature === filter)
  const open = shown.filter((row) => !row.entry.settled)
  const paid = shown.filter((row) => row.entry.settled)
  const allPaid = bills.filter((row) => row.entry.settled)
  const allOpen = bills.filter((row) => !row.entry.settled)
  const extras = bills.filter((row) => row.line.nature === 'OCCASIONAL')
  const occasional = (data?.lines ?? []).filter((line) => line.kind === 'EXPENSE' && line.nature === 'OCCASIONAL' && line.active)
  const incomes = rowsOf('INCOME')
  // An occasional bill is expected to be empty most months, so it is not listed as missing.
  const withoutValue = (data?.lines ?? []).filter(
    (line) => line.active && line.nature !== 'OCCASIONAL' && monthData && !entryOf(monthData, line.id),
  )
  const monthName = MONTH_NAMES[month - 1]

  return (
    <>
      <PageHeader title="Contas do mês" subtitle="O que já foi pago, o que falta e quanto sobra. Clique em uma conta para marcar como paga ou desfazer.">
        <Stepper
          label="Mês"
          value={`${monthName} ${year}`}
          previousLabel="Mês anterior"
          nextLabel="Próximo mês"
          onPrevious={() => goTo(shiftMonth(yearMonth, -1))}
          onNext={() => goTo(shiftMonth(yearMonth, 1))}
          wide
        />
        {/* A year that is over has nothing left to forecast. */}
        {year >= today.year && (
          <button
            type="button"
            className="button"
            onClick={() => run(() => budgetYearsApi.fillForecasts(year))}
            disabled={busy}
            title="Preenche os meses vazios do ano, a partir do mês atual, com a previsão de cada conta. Não altera o que já tem valor."
          >
            <Sparkles size={16} aria-hidden />
            Preencher previsões
          </button>
        )}
        <button type="button" className="button button-primary" onClick={() => setAddingExtra(true)}>
          <Plus size={16} aria-hidden />
          Lançar gasto extra
        </button>
      </PageHeader>
      <ErrorBanner message={error ?? budget.error} onRetry={budget.error ? budget.reload : undefined} />
      {budget.loading && !data && <Loading />}
      {data && monthData && (
        <>
          <div className="kpis">
            <Kpi label="Gasto previsto" value={formatMoney(monthData.expenseTotal)} note={`${bills.length} contas no mês`} />
            <Kpi
              label="Já pago"
              value={formatMoney(sum(allPaid))}
              note={monthData.expenseTotal > 0 ? `${Math.round((sum(allPaid) / monthData.expenseTotal) * 100)}% do previsto` : undefined}
            />
            <Kpi
              label="Falta pagar"
              value={formatMoney(sum(allOpen))}
              tone={allOpen.length > 0 ? 'warning' : undefined}
              note={`${allOpen.length} em aberto`}
            />
            <Kpi label="Receitas" value={formatMoney(monthData.incomeTotal)} />
            <Kpi
              label="Sobra prevista"
              value={formatMoney(monthData.balance)}
              tone={monthData.balance < 0 ? 'warning' : 'positive'}
              note="receitas menos gasto previsto"
            />
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label="Parte do gasto já paga"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={monthData.expenseTotal > 0 ? Math.round((sum(allPaid) / monthData.expenseTotal) * 100) : 0}
          >
            <span style={{ width: `${monthData.expenseTotal > 0 ? (sum(allPaid) / monthData.expenseTotal) * 100 : 0}%` }} />
          </div>
          <div className="segmented" role="tablist" aria-label="Mostrar">
            <button type="button" role="tab" aria-selected={filter === null} onClick={() => setFilter(null)}>
              Todas
            </button>
            {NATURES.map((nature) => (
              <button key={nature} type="button" role="tab" aria-selected={filter === nature} onClick={() => setFilter(nature)}>
                {NATURE_GROUP_LABELS[nature]}
              </button>
            ))}
          </div>
          <div className="month-columns">
            <BillList title="A pagar" rows={open} total={sum(open)} empty="Nada em aberto." disabled={busy} settled={false} onToggle={settle} onEdit={setEditing} month={month} />
            <BillList title="Pagas" rows={paid} total={sum(paid)} empty="Nada pago ainda." disabled={busy} settled onToggle={settle} onEdit={setEditing} month={month} />
            <div className="stack">
              <section className="panel" aria-label="Receitas">
                <header className="panel-header">
                  <h2>Receitas</h2>
                  <strong className="numeric">{formatAmount(monthData.incomeTotal)}</strong>
                </header>
                <ul className="rows">
                  {incomes.map(({ line, entry }) => (
                    <li key={line.id}>
                      <span className="row-text">
                        <strong>{line.name}</strong>
                        <span className="muted">{entry.settled ? 'recebida' : 'previsão'}</span>
                      </span>
                      <span className={entry.settled ? 'numeric strong' : 'numeric forecast'}>{formatAmount(entry.amount)}</span>
                      <IconButton label={`Editar ${line.name}`} onClick={() => setEditing({ line, month })}>
                        <Pencil size={15} aria-hidden />
                      </IconButton>
                    </li>
                  ))}
                </ul>
                {incomes.length === 0 && <p className="list-empty muted">Nenhuma renda com valor neste mês.</p>}
                <footer className="panel-footer">
                  <span>Sobra prevista</span>
                  <strong className={monthData.balance < 0 ? 'numeric negative' : 'numeric positive'}>{formatAmount(monthData.balance)}</strong>
                </footer>
              </section>
              {extras.length > 0 && (
                <section className="panel" aria-label="Extras deste mês">
                  <header className="panel-header">
                    <h2>Extras deste mês</h2>
                    <strong className="numeric">{formatAmount(sum(extras))}</strong>
                  </header>
                  <ul className="rows">
                    {extras.map(({ line, entry }) => (
                      <li key={line.id}>
                        <span className="row-text">
                          <strong>{line.name}</strong>
                          <span className="muted">{entry.settled ? 'pago' : 'a pagar'}</span>
                        </span>
                        <span className={entry.settled ? 'numeric strong' : 'numeric forecast'}>{formatAmount(entry.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="legend">Na visão do ano, estes gastos aparecem somados na linha Extra.</p>
                </section>
              )}
              {withoutValue.length > 0 && (
                <section className="panel" aria-label="Sem valor neste mês">
                  <header className="panel-header">
                    <h2>Sem valor neste mês</h2>
                  </header>
                  <ul className="rows">
                    {withoutValue.map((line) => (
                      <li key={line.id}>
                        <span className="row-text">
                          <strong>{line.name}</strong>
                          <span className="muted">{line.kind === 'INCOME' ? 'renda' : 'conta'}</span>
                        </span>
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() => setEditing({ line, month })}
                          aria-label={`Informar valor de ${line.name}`}
                        >
                          Informar valor
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </>
      )}
      {addingExtra && (
        <ExtraForm
          lines={occasional}
          yearMonth={yearMonth}
          title={`Gasto extra · ${monthName.toLowerCase()} de ${year}`}
          onClose={() => setAddingExtra(false)}
          onSaved={() => {
            setAddingExtra(false)
            budget.reload()
          }}
        />
      )}
      {editing && data && (
        <EntryForm
          budget={data}
          cell={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            budget.reload()
          }}
        />
      )}
    </>
  )
}

interface BillListProps {
  title: string
  rows: Row[]
  total: number
  empty: string
  /** Whether the list holds the bills already paid. */
  settled: boolean
  disabled: boolean
  month: number
  onToggle: (row: Row, settled: boolean) => void
  onEdit: (cell: EntryCell) => void
}

function BillList({ title, rows, total, empty, settled, disabled, month, onToggle, onEdit }: BillListProps) {
  return (
    <section className="panel" aria-label={title}>
      <header className="panel-header">
        <h2>
          {title} <span className="count">{rows.length}</span>
        </h2>
        <strong className={settled ? 'numeric' : 'numeric warning'}>{formatAmount(total)}</strong>
      </header>
      <ul className="rows">
        {rows.map((row) => (
          <li key={row.line.id}>
            <button
              type="button"
              className="row-toggle"
              onClick={() => onToggle(row, !settled)}
              disabled={disabled}
              aria-label={settled ? `Desfazer o pagamento de ${row.line.name}` : `Marcar ${row.line.name} como paga`}
            >
              <span className={settled ? 'check check-on' : 'check'}>{settled && <Check size={11} strokeWidth={4} aria-hidden />}</span>
              <span className="row-text">
                <strong>{row.line.name}</strong>
                <span className="muted">
                  {[row.line.dueDay !== null && `vence dia ${row.line.dueDay}`, row.line.groupName].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`tag tag-${row.line.nature.toLowerCase()}`}>{NATURE_LABELS[row.line.nature]}</span>
              <span className={settled ? 'numeric strong' : 'numeric forecast'}>{formatAmount(row.entry.amount)}</span>
            </button>
            <IconButton label={`Editar ${row.line.name}`} onClick={() => onEdit({ line: row.line, month })}>
              <Pencil size={15} aria-hidden />
            </IconButton>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="list-empty muted">{empty}</p>}
    </section>
  )
}

interface ExtraFormProps {
  /** The occasional bills an extra expense can be registered under. */
  lines: BudgetYearLine[]
  /** `yyyy-MM`. */
  yearMonth: string
  title: string
  onClose: () => void
  onSaved: () => void
}

/** An expense out of the routine in the month: which occasional bill it is, how much, and whether it is paid. */
function ExtraForm({ lines, yearMonth, title, onClose, onSaved }: ExtraFormProps) {
  const [lineId, setLineId] = useState(lines[0]?.id ?? 0)
  const [amount, setAmount] = useState('')
  const [settled, setSettled] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setErrors({})
    try {
      await budgetLinesApi.setEntry(lineId, yearMonth, { amount: Number(amount), settled })
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setErrors(fieldErrors(caught))
      setSubmitting(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {lines.length === 0 ? (
        <div className="form">
          <p className="muted">
            Ainda não há nenhuma conta esporádica. Cadastre uma (por exemplo "Médico" ou "Carro") escolhendo "Esporádica" no valor de cada mês.
          </p>
          <div className="form-actions">
            <Link to="/settings/lines" className="button button-primary">
              Ir para contas e rendas
            </Link>
          </div>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <ErrorBanner message={error} />
          <Field label="Gasto" hint="Um valor já lançado neste mês para o mesmo gasto é substituído.">
            <select value={lineId} onChange={(event) => setLineId(Number(event.target.value))}>
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor" error={errors.amount}>
            <CurrencyInput value={amount} onChange={setAmount} required autoFocus />
          </Field>
          <label className="checkbox">
            <input type="checkbox" checked={settled} onChange={(event) => setSettled(event.target.checked)} />
            Já está pago
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
      )}
    </Modal>
  )
}
