import { useState } from 'react'
import type { FormEvent } from 'react'
import { errorMessage, fieldErrors } from '../api/client'
import { budgetLinesApi } from '../api/endpoints'
import type { BudgetYear, BudgetYearLine } from '../api/types'
import { SETTLED_LABELS, entryOf } from '../lib/budget'
import { MONTH_NAMES, toYearMonth } from '../lib/format'
import { CurrencyInput } from './CurrencyInput'
import { ErrorBanner, Field, Modal } from './ui'

/** The value being edited: a line in a month (1 to 12). */
export interface EntryCell {
  line: BudgetYearLine
  month: number
}

interface EntryFormProps {
  budget: BudgetYear
  cell: EntryCell
  onClose: () => void
  onSaved: () => void
}

/** The value of a line in a month: amount, paid or not, repeat as a forecast, clear. */
export function EntryForm({ budget, cell, onClose, onSaved }: EntryFormProps) {
  const { line, month } = cell
  const entry = entryOf(budget.months[month - 1], line.id)
  const [amount, setAmount] = useState(entry ? entry.amount.toFixed(2) : '')
  const [settled, setSettled] = useState(entry?.settled ?? false)
  const [repeat, setRepeat] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  /** What is already paid stays as it is; only forecasts are overwritten by "repeat". */
  const laterOpenMonths = budget.months
    .filter((later) => later.month > month && !entryOf(later, line.id)?.settled)
    .map((later) => later.month)

  async function run(action: () => Promise<unknown>) {
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

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = Number(amount)
    void run(async () => {
      await budgetLinesApi.setEntry(line.id, toYearMonth(budget.year, month), { amount: value, settled })
      if (!repeat) return
      for (const later of laterOpenMonths) {
        await budgetLinesApi.setEntry(line.id, toYearMonth(budget.year, later), { amount: value, settled: false })
      }
    })
  }

  function clear() {
    void run(() => budgetLinesApi.clearEntry(line.id, toYearMonth(budget.year, month)))
  }

  return (
    <Modal title={`${line.name} · ${MONTH_NAMES[month - 1].toLowerCase()} de ${budget.year}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <Field label="Valor" error={errors.amount}>
          <CurrencyInput value={amount} onChange={setAmount} required autoFocus />
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={settled} onChange={(event) => setSettled(event.target.checked)} />
          {SETTLED_LABELS[line.kind]}
        </label>
        {laterOpenMonths.length > 0 && (
          <label className="checkbox">
            <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />
            Repetir como previsão nos meses seguintes
          </label>
        )}
        <div className="form-actions">
          {entry && (
            <button type="button" className="button button-danger push-left" onClick={clear} disabled={submitting}>
              Limpar
            </button>
          )}
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
