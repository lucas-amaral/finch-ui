import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { errorMessage, fieldErrors } from '../api/client'
import { localHolidaysApi } from '../api/endpoints'
import type { LocalHoliday } from '../api/types'
import { ErrorBanner, Field, IconButton, Loading, PageHeader } from '../components/ui'
import { MONTH_NAMES } from '../lib/format'
import { useLoad } from '../lib/useLoad'

/** The national holidays the server already knows, shown so nobody registers them again. */
const NATIONAL = [
  '1º de janeiro',
  'Sexta-feira Santa',
  '21 de abril',
  '1º de maio',
  '7 de setembro',
  '12 de outubro',
  '2 de novembro',
  '15 de novembro',
  '20 de novembro',
  '25 de dezembro',
]

const dayLabel = (holiday: LocalHoliday) => `${holiday.day} de ${MONTH_NAMES[holiday.month - 1].toLowerCase()}`

/** The state and city holidays, which cancel the sessions of the bills charged per session. */
export function HolidaysPage() {
  const holidays = useLoad(() => localHolidaysApi.list(), [])
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('1')
  const [name, setName] = useState('')
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
      holidays.reload()
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
      () => localHolidaysApi.create({ day: Number(day), month: Number(month), name }),
      () => {
        setDay('')
        setName('')
      },
    )
  }

  return (
    <>
      <PageHeader
        title="Feriados"
        subtitle="Nos feriados não há sessão: as contas cobradas por sessão (aulas, terapia) contam só os dias que sobram."
      />
      <ErrorBanner message={error ?? holidays.error} onRetry={holidays.error ? holidays.reload : undefined} />
      <div className="columns">
        <section className="panel list-card" aria-label="Feriados estaduais e municipais">
          <header className="panel-header">
            <h2>Estaduais e municipais</h2>
          </header>
          {holidays.loading && !holidays.data && <Loading />}
          {holidays.data && holidays.data.length === 0 && <p className="muted list-empty">Nenhum cadastrado.</p>}
          {holidays.data && holidays.data.length > 0 && (
            <ul className="rows">
              {holidays.data.map((holiday) => (
                <li key={holiday.id}>
                  <span className="row-text">
                    <strong>{holiday.name}</strong>
                    <span className="muted">{dayLabel(holiday)}</span>
                  </span>
                  <IconButton label={`Excluir ${holiday.name}`} onClick={() => void run(() => localHolidaysApi.remove(holiday.id))} danger>
                    <Trash2 size={15} aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <form className="form check-body" onSubmit={submit} aria-label="Novo feriado">
            <div className="form-row">
              <Field label="Dia" error={errors.day}>
                <input type="number" min={1} max={31} value={day} onChange={(event) => setDay(event.target.value)} required />
              </Field>
              <Field label="Mês" error={errors.month}>
                <select value={month} onChange={(event) => setMonth(event.target.value)}>
                  {MONTH_NAMES.map((monthName, index) => (
                    <option key={monthName} value={index + 1}>
                      {monthName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Nome" error={errors.name}>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
            </Field>
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={submitting}>
                <Plus size={16} aria-hidden />
                Adicionar
              </button>
            </div>
          </form>
        </section>
        <section className="panel list-card" aria-label="Feriados nacionais">
          <header className="panel-header">
            <h2>Nacionais</h2>
            <span className="muted">já considerados</span>
          </header>
          <ul className="rows">
            {NATIONAL.map((holiday) => (
              <li key={holiday}>
                <span className="row-text">{holiday}</span>
              </li>
            ))}
          </ul>
          <p className="legend">Pontos facultativos, como Carnaval e Corpus Christi, não contam como feriado.</p>
        </section>
      </div>
    </>
  )
}
