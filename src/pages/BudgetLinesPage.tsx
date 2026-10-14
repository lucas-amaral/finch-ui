import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, fieldErrors } from '../api/client'
import { budgetLinesApi } from '../api/endpoints'
import type { BudgetKind, BudgetLine, BudgetNature, ForecastRule } from '../api/types'
import { ErrorBanner, Field, IconButton, Loading, Modal, PageHeader, Toggle } from '../components/ui'
import { FORECAST_LABELS, KIND_LABELS, NATURES, NATURE_HINTS, NATURE_LABELS, WEEKDAYS, sessionSummary } from '../lib/budget'
import { CurrencyInput } from '../components/CurrencyInput'
import { useLoad } from '../lib/useLoad'
import { useStoredFlag } from '../lib/useStoredFlag'

/** The form is open for a new line of a kind, or for an existing line. */
type Editing = { kind: BudgetKind; line: null } | { kind: BudgetKind; line: BudgetLine }

export function BudgetLinesPage() {
  const lines = useLoad(() => budgetLinesApi.list(), [])
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(line: BudgetLine) {
    if (!window.confirm(`Excluir "${line.name}"?`)) return
    setError(null)
    try {
      await budgetLinesApi.remove(line.id)
      lines.reload()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const groupNames = [...new Set((lines.data ?? []).flatMap((line) => line.groupName ?? []))]
  const [showInactive, toggleInactive] = useStoredFlag('finch.settings.lines.inactive', false)
  const inactiveCount = (lines.data ?? []).filter((line) => !line.active).length
  const shown = (lines.data ?? []).filter((line) => showInactive || line.active)

  return (
    <>
      <PageHeader title="Contas e rendas" subtitle="O que entra como coluna na tela das contas do mês.">
        <Toggle pressed={showInactive} onClick={toggleInactive} title="As inativas só aparecem nos anos em que têm valores.">
          Mostrar inativas ({inactiveCount})
        </Toggle>
        <Link to="/month" className="button">
          <ArrowLeft size={18} aria-hidden />
          Contas do mês
        </Link>
        <button type="button" className="button" onClick={() => setEditing({ kind: 'INCOME', line: null })}>
          <Plus size={18} aria-hidden />
          Nova renda
        </button>
        <button type="button" className="button button-primary" onClick={() => setEditing({ kind: 'EXPENSE', line: null })}>
          <Plus size={18} aria-hidden />
          Nova conta
        </button>
      </PageHeader>
      <ErrorBanner message={error ?? lines.error} onRetry={lines.error ? lines.reload : undefined} />
      {lines.loading && !lines.data && <Loading />}
      {lines.data && lines.data.length === 0 && (
        <div className="card empty-state">
          <h2>Nada cadastrado ainda</h2>
          <p className="muted">Comece pelas contas fixas, como aluguel e luz, e depois cadastre as rendas.</p>
        </div>
      )}
      {lines.data && lines.data.length > 0 && (
        <div className="card table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Grupo</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Previsão</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {shown.map((line) => (
                <tr key={line.id}>
                  <td className="strong">{line.name}</td>
                  <td>
                    <span className={line.kind === 'INCOME' ? 'chip' : 'chip chip-neutral'}>{KIND_LABELS[line.kind]}</span>
                  </td>
                  <td className="muted">{line.groupName ?? '—'}</td>
                  <td className="muted">{line.dueDay ? `Dia ${line.dueDay}` : '—'}</td>
                  <td className="muted">{line.kind === 'EXPENSE' ? NATURE_LABELS[line.nature] : '—'}</td>
                  <td className="muted">
                    {line.forecastRule === 'PER_SESSION' ? sessionSummary(line.sessionPrice, line.sessionWeekday) : FORECAST_LABELS[line.forecastRule]}
                  </td>
                  <td className="muted">{line.active ? 'Ativa' : 'Inativa'}</td>
                  <td className="row-actions">
                    <IconButton label={`Editar ${line.name}`} onClick={() => setEditing({ kind: line.kind, line })}>
                      <Pencil size={17} aria-hidden />
                    </IconButton>
                    <IconButton label={`Excluir ${line.name}`} onClick={() => remove(line)} danger>
                      <Trash2 size={17} aria-hidden />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <LineForm
          editing={editing}
          groupNames={groupNames}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            lines.reload()
          }}
        />
      )}
    </>
  )
}

interface LineFormProps {
  editing: Editing
  /** Groups already in use, offered as suggestions. */
  groupNames: string[]
  onClose: () => void
  onSaved: () => void
}

function LineForm({ editing, groupNames, onClose, onSaved }: LineFormProps) {
  const { kind, line } = editing
  const [name, setName] = useState(line?.name ?? '')
  const [groupName, setGroupName] = useState(line?.groupName ?? '')
  const [dueDay, setDueDay] = useState(line?.dueDay?.toString() ?? '')
  const [active, setActive] = useState(line?.active ?? true)
  const [forecastRule, setForecastRule] = useState<ForecastRule>(line?.forecastRule ?? 'LAST_VALUE')
  const [sessionPrice, setSessionPrice] = useState(line?.sessionPrice?.toFixed(2) ?? '')
  const [sessionWeekday, setSessionWeekday] = useState(line?.sessionWeekday?.toString() ?? '3')
  const [fromPreviousMonth, setFromPreviousMonth] = useState(line?.sessionsFromPreviousMonth ?? true)
  const perSession = forecastRule === 'PER_SESSION'
  const [nature, setNature] = useState<BudgetNature>(line?.nature ?? 'VARIABLE')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const label = KIND_LABELS[kind].toLowerCase()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setErrors({})
    const input = {
      name,
      kind,
      groupName: groupName.trim() || null,
      dueDay: dueDay ? Number(dueDay) : null,
      active,
      forecastRule,
      nature,
      sessionPrice: perSession && sessionPrice !== '' ? Number(sessionPrice) : null,
      sessionWeekday: perSession ? Number(sessionWeekday) : null,
      sessionsFromPreviousMonth: fromPreviousMonth,
    }
    try {
      if (line) await budgetLinesApi.update(line.id, input)
      else await budgetLinesApi.create(input)
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setErrors(fieldErrors(caught))
      setSubmitting(false)
    }
  }

  return (
    <Modal title={line ? `Editar ${label}` : `Nova ${label}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <Field label="Nome" error={errors.name}>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required autoFocus />
        </Field>
        <Field label="Grupo" error={errors.groupName} hint="Opcional. Junta as colunas sob um mesmo título, como Casa ou Empresa.">
          <input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={60} list="group-names" />
        </Field>
        <datalist id="group-names">
          {groupNames.map((existing) => (
            <option key={existing} value={existing} />
          ))}
        </datalist>
        <Field label={kind === 'EXPENSE' ? 'Dia de vencimento' : 'Dia de recebimento'} error={errors.dueDay} hint="Opcional.">
          <input type="number" value={dueDay} onChange={(event) => setDueDay(event.target.value)} min={1} max={31} />
        </Field>
        {kind === 'EXPENSE' && (
          <Field label="Valor de cada mês" hint="As esporádicas nunca são previstas e aparecem somadas em Extra na visão do ano.">
            <select value={nature} onChange={(event) => setNature(event.target.value as BudgetNature)}>
              {NATURES.map((value) => (
                <option key={value} value={value}>
                  {NATURE_HINTS[value]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Previsão dos próximos meses" hint="Usada ao preencher as previsões na tela das contas do mês.">
          <select value={forecastRule} onChange={(event) => setForecastRule(event.target.value as ForecastRule)}>
            {Object.entries(FORECAST_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </Field>
        {perSession && (
          <>
            <div className="form-row">
              <Field label="Valor da sessão" error={errors.sessionPrice}>
                <CurrencyInput value={sessionPrice} onChange={setSessionPrice} required />
              </Field>
              <Field label="Dia das sessões">
                <select value={sessionWeekday} onChange={(event) => setSessionWeekday(event.target.value)}>
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index + 1}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={fromPreviousMonth} onChange={(event) => setFromPreviousMonth(event.target.checked)} />
              O valor do mês paga as sessões do mês anterior
            </label>
            <p className="field-hint">
              Feriados nacionais e os cadastrados em Cadastros → Feriados não contam. Ao salvar, os meses em aberto daqui até o fim do ano que
              vem são recalculados; o que já foi pago fica como está.
            </p>
          </>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Ativa
          <span className="muted"> — as inativas só aparecem nos anos em que têm valores</span>
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
    </Modal>
  )
}
