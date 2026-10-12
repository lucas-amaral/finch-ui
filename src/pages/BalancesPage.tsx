import { ChevronLeft, ChevronRight, Landmark, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { errorMessage, fieldErrors } from '../api/client'
import { balanceAccountsApi, balancesApi } from '../api/endpoints'
import type { BalanceAccount, BalanceInput, BalanceKind, BalanceMonth, BalanceYear } from '../api/types'
import { CurrencyInput } from '../components/CurrencyInput'
import { ErrorBanner, Field, IconButton, Kpi, Loading, Modal, PageHeader } from '../components/ui'
import { MONTH_NAMES, currentYearMonth, formatAmount, formatMoney, formatWhole, toYearMonth } from '../lib/format'
import { useLoad } from '../lib/useLoad'

/** The places the money can be, in the order of the columns. */
const PLACES: { field: keyof BalanceInput; kind: BalanceKind; label: string }[] = [
  { field: 'checking', kind: 'CHECKING', label: 'Conta' },
  { field: 'savings', kind: 'SAVINGS', label: 'Guardado' },
  { field: 'company', kind: 'COMPANY', label: 'Empresa' },
  { field: 'invested', kind: 'INVESTED', label: 'Investido' },
]

export function BalancesPage() {
  const today = currentYearMonth()
  const [year, setYear] = useState(today.year)
  const balances = useLoad(async () => {
    const current = await balancesApi.year(year)
    // A year with nothing written down is projected from where the year before ended.
    const previous = current.months.some((month) => month.snapshot) ? null : await balancesApi.year(year - 1)
    return { current, previous }
  }, [year])
  const accounts = useLoad(() => balanceAccountsApi.list(), [])
  const [managingAccounts, setManagingAccounts] = useState(false)
  const [editing, setEditing] = useState<BalanceMonth | null>(null)
  const [monthly, setMonthly] = useState(() => localStorage.getItem(PROJECTION_KEY) ?? '10000.00')
  const data = balances.data?.current
  const projected = data ? projectionOf(data, balances.data?.previous ?? null, Number(monthly)) : []

  function changeMonthly(value: string) {
    localStorage.setItem(PROJECTION_KEY, value)
    setMonthly(value)
  }

  return (
    <>
      <PageHeader title="Futuro" subtitle="Quanto havia em cada lugar, mês a mês, para acompanhar a evolução. Clique em um mês para anotar.">
        <div className="stepper" role="group" aria-label="Ano">
          <button type="button" className="icon-button" onClick={() => setYear(year - 1)} aria-label="Ano anterior">
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span className="stepper-value">{year}</span>
          <button type="button" className="icon-button" onClick={() => setYear(year + 1)} aria-label="Próximo ano">
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
        <button type="button" className="button" onClick={() => setManagingAccounts(true)}>
          <Landmark size={16} aria-hidden />
          Contas
        </button>
        <Link to="/future/history" className="button">
          Histórico dos anos
        </Link>
      </PageHeader>
      <ErrorBanner message={balances.error} onRetry={balances.reload} />
      {balances.loading && !data && <Loading />}
      {data && <Outlook year={data} projected={projected} monthly={monthly} onMonthlyChange={changeMonthly} onPick={setEditing} />}
      {data && (
        <section className="panel budget-card" aria-label="Caixa">
          <div className="table-wrapper">
            <table className="budget-table budget-table-wide">
              <thead>
                <tr>
                  <th>Mês</th>
                  {PLACES.map((place) => (
                    <th key={place.field} className="numeric">
                      {place.label}
                    </th>
                  ))}
                  <th className="numeric">Total</th>
                  <th className="numeric" title="Quanto o total mudou em relação ao mês anterior.">
                    Variação
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((month) => {
                  const name = MONTH_NAMES[month.month - 1]
                  const { snapshot, change } = month
                  return (
                    <tr key={month.month} className={data.year === today.year && month.month === today.month ? 'current-month' : undefined}>
                      <th scope="row">
                        <button type="button" className="cell cell-label" onClick={() => setEditing(month)} title={`Anotar ${name.toLowerCase()}`}>
                          {name}
                        </button>
                      </th>
                      {PLACES.map((place) => (
                        <td key={place.field} className="numeric amount">
                          {snapshot ? formatAmount(snapshot[place.field]) : '—'}
                        </td>
                      ))}
                      <td className={snapshot ? 'numeric total' : 'numeric forecast'}>
                        {snapshot
                          ? formatAmount(snapshot.total)
                          : projected[month.month - 1] === null
                            ? '—'
                            : formatAmount(projected[month.month - 1]!)}
                      </td>
                      <td className={`numeric total${change === null || change === 0 ? '' : change > 0 ? ' positive' : ' negative'}`}>
                        {change === null ? '—' : `${change > 0 ? '+' : ''}${formatAmount(change)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {managingAccounts && (
        <AccountsManager
          accounts={accounts.data ?? []}
          onChanged={accounts.reload}
          onClose={() => setManagingAccounts(false)}
        />
      )}
      {editing && data && (accounts.data ?? []).some((account) => account.active) && (
        <AccountBalancesForm
          year={data.year}
          month={editing}
          accounts={(accounts.data ?? []).filter((account) => account.active)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            balances.reload()
          }}
        />
      )}
      {editing && data && !(accounts.data ?? []).some((account) => account.active) && (
        <BalanceForm
          year={data.year}
          month={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            balances.reload()
          }}
        />
      )}
    </>
  )
}

const PROJECTION_KEY = 'finch.future.projection'

/**
 * What each month without a value is expected to hold: the last total written down plus `monthly`
 * for every month since. Null for the months that have a value, and for all when there is nothing to start from.
 */
function projectionOf(year: BalanceYear, previous: BalanceYear | null, monthly: number): (number | null)[] {
  const before = previous ? [...previous.months].reverse().find((month) => month.snapshot) : undefined
  let base = before?.snapshot?.total ?? null
  let since = before ? 12 - before.month : 0
  return year.months.map((month) => {
    if (month.snapshot) {
      base = month.snapshot.total
      since = 0
      return null
    }
    since += 1
    return base === null ? null : base + monthly * since
  })
}

interface OutlookProps {
  year: BalanceYear
  projected: (number | null)[]
  monthly: string
  onMonthlyChange: (value: string) => void
  onPick: (month: BalanceMonth) => void
}

/** The year at a glance: where the total stands, how it moved and where the projection takes it. */
function Outlook({ year, projected, monthly, onMonthlyChange, onPick }: OutlookProps) {
  const written = year.months.filter((month) => month.snapshot)
  const last = written[written.length - 1]
  const first = written[0]
  const totals = year.months.map((month, index) => month.snapshot?.total ?? projected[index])
  const largest = Math.max(1, ...totals.map((total) => total ?? 0))
  const december = totals[11]

  return (
    <>
      <div className="kpis">
        <Kpi
          label="Último total informado"
          value={last?.snapshot ? formatMoney(last.snapshot.total) : '—'}
          note={last ? MONTH_NAMES[last.month - 1].toLowerCase() : 'nada anotado neste ano'}
        />
        {last && last.change !== null && (
          <Kpi
            label="No mês"
            value={`${last.change > 0 ? '+' : ''}${formatMoney(last.change)}`}
            tone={last.change < 0 ? 'warning' : 'positive'}
            note="contra o mês anterior"
          />
        )}
        {last?.snapshot && first?.snapshot && last !== first && (
          <Kpi
            label="No ano"
            value={`${last.snapshot.total > first.snapshot.total ? '+' : ''}${formatMoney(last.snapshot.total - first.snapshot.total)}`}
            tone={last.snapshot.total < first.snapshot.total ? 'warning' : 'positive'}
            note={`desde ${MONTH_NAMES[first.month - 1].toLowerCase()}`}
          />
        )}
        {december !== null && !year.months[11].snapshot && (
          <Kpi label="Projeção para dezembro" value={formatMoney(december)} note="some quando o valor real for informado" />
        )}
      </div>
      <section className="panel chart-panel year-panel" aria-label="Total nas contas">
        <header className="panel-header">
          <h2>Total nas contas</h2>
          <label className="inline-field">
            Projetar por mês
            <CurrencyInput value={monthly} onChange={onMonthlyChange} aria-label="Projetar por mês" />
          </label>
        </header>
        <div className="bars">
          {year.months.map((month, index) => {
            const total = totals[index]
            const name = MONTH_NAMES[month.month - 1]
            return (
              <button
                key={month.month}
                type="button"
                className="bar"
                onClick={() => onPick(month)}
                aria-label={`${name}: ${total === null ? 'sem valor' : formatMoney(total)}${month.snapshot ? '' : total === null ? '' : ', projeção'}`}
              >
                <span className="bar-value">{total === null ? '' : formatWhole(total / 1000)}</span>
                <span
                  className={month.snapshot ? 'bar-stack bar-solid' : 'bar-stack bar-projected'}
                  style={{ height: `${total === null ? 0 : (Math.max(0, total) / largest) * 78}%` }}
                />
                <span className="bar-label">{name.slice(0, 3)}</span>
              </button>
            )
          })}
        </div>
        <p className="legend">
          <span>
            <i className="swatch" /> Valor informado
          </span>
          <span>
            <i className="swatch swatch-projected" /> Projeção
          </span>
          <span>Valores em milhares. Clique em um mês para anotar.</span>
        </p>
      </section>
    </>
  )
}

interface BalanceFormProps {
  year: number
  month: BalanceMonth
  onClose: () => void
  onSaved: () => void
}

function BalanceForm({ year, month, onClose, onSaved }: BalanceFormProps) {
  const [amounts, setAmounts] = useState<Record<keyof BalanceInput, string>>(() => ({
    checking: month.snapshot?.checking.toFixed(2) ?? '',
    savings: month.snapshot?.savings.toFixed(2) ?? '',
    company: month.snapshot?.company.toFixed(2) ?? '',
    invested: month.snapshot?.invested.toFixed(2) ?? '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const key = toYearMonth(year, month.month)

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
    // A place left empty has nothing in it.
    const input = { checking: Number(amounts.checking), savings: Number(amounts.savings), company: Number(amounts.company), invested: Number(amounts.invested) }
    void run(() => balancesApi.set(key, input))
  }

  return (
    <Modal title={`Caixa · ${MONTH_NAMES[month.month - 1].toLowerCase()} de ${year}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <div className="form-row">
          {PLACES.map((place, index) => (
            <Field key={place.field} label={place.label} error={errors[place.field]}>
              <CurrencyInput
                value={amounts[place.field]}
                onChange={(value) => setAmounts({ ...amounts, [place.field]: value })}
                autoFocus={index === 0}
              />
            </Field>
          ))}
        </div>
        <div className="form-actions">
          {month.snapshot && (
            <button type="button" className="button button-danger push-left" onClick={() => void run(() => balancesApi.clear(key))} disabled={submitting}>
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

interface AccountBalancesFormProps {
  year: number
  month: BalanceMonth
  /** The active accounts, in the order of the screen. */
  accounts: BalanceAccount[]
  onClose: () => void
  onSaved: () => void
}

/** The balances of a month, account by account; the four totals of the month become their sums. */
function AccountBalancesForm({ year, month, accounts, onClose, onSaved }: AccountBalancesFormProps) {
  const key = toYearMonth(year, month.month)
  const stored = useLoad(() => balancesApi.accounts(key), [])
  /** What was typed, by account id; an account not touched keeps what was stored. */
  const [typed, setTyped] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const storedOf = (id: number) => stored.data?.find((each) => each.accountId === id)?.amount.toFixed(2) ?? ''
  const valueOf = (id: number) => typed[id] ?? storedOf(id)
  const sumOf = (kind: BalanceKind) =>
    accounts.filter((account) => account.kind === kind).reduce((total, account) => total + Number(valueOf(account.id)), 0)
  /** Written down before the accounts existed: only the four totals are known. */
  const totalsOnly = month.snapshot !== null && stored.data?.length === 0

  async function run(action: () => Promise<unknown>) {
    setSubmitting(true)
    setError(null)
    try {
      await action()
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setSubmitting(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    // An account left empty has nothing in it that month.
    const amounts = accounts.filter((account) => valueOf(account.id) !== '').map((account) => ({ accountId: account.id, amount: Number(valueOf(account.id)) }))
    void run(() => balancesApi.setAccounts(key, amounts))
  }

  return (
    <Modal title={`Caixa · ${MONTH_NAMES[month.month - 1].toLowerCase()} de ${year}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error ?? stored.error} />
        {stored.loading && !stored.data && <Loading />}
        {totalsOnly && (
          <p className="muted">
            Este mês foi anotado só pelos totais ({formatMoney(month.snapshot!.total)}). Ao salvar por conta, os totais passam a ser a soma das
            contas.
          </p>
        )}
        {stored.data &&
          PLACES.filter((place) => accounts.some((account) => account.kind === place.kind)).map((place) => (
            <fieldset key={place.kind} className="account-group">
              <legend>
                <span>{place.label}</span>
                <span className="numeric">{formatAmount(sumOf(place.kind))}</span>
              </legend>
              {accounts
                .filter((account) => account.kind === place.kind)
                .map((account) => (
                  <label key={account.id} className="account-row">
                    <span>{account.name}</span>
                    <CurrencyInput value={valueOf(account.id)} onChange={(value) => setTyped({ ...typed, [account.id]: value })} />
                  </label>
                ))}
            </fieldset>
          ))}
        <p className="import-summary">
          <span>Total do mês</span>
          <strong className="numeric">{formatMoney(PLACES.reduce((total, place) => total + sumOf(place.kind), 0))}</strong>
        </p>
        <div className="form-actions">
          {month.snapshot && (
            <button type="button" className="button button-danger push-left" onClick={() => void run(() => balancesApi.clear(key))} disabled={submitting}>
              Limpar
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button button-primary" disabled={submitting || !stored.data}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface AccountsManagerProps {
  accounts: BalanceAccount[]
  onChanged: () => void
  onClose: () => void
}

/** The accounts behind each of the four totals: the list, by kind, with a short form to add one more. */
function AccountsManager({ accounts, onChanged, onClose }: AccountsManagerProps) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<BalanceKind>('CHECKING')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function run(action: () => Promise<unknown>, done?: () => void) {
    setSubmitting(true)
    setError(null)
    try {
      await action()
      done?.()
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(() => balanceAccountsApi.create({ name, kind, active: true }), () => setName(''))
  }

  return (
    <Modal title="Contas" onClose={onClose}>
      <div className="form">
        <p className="muted">
          Cada conta entra em um dos quatro totais. Com contas cadastradas, o saldo do mês é informado conta a conta e os totais são somados
          sozinhos.
        </p>
        <ErrorBanner message={error} />
        {accounts.length === 0 && <p className="muted">Nenhuma conta ainda: os meses são anotados direto pelos quatro totais.</p>}
        {accounts.length > 0 && (
          <ul className="rows recurring-list" aria-label="Contas cadastradas">
            {accounts.map((account) => (
              <li key={account.id}>
                <span className="row-text">
                  <strong>{account.name}</strong>
                  <span className="muted">
                    {PLACES.find((place) => place.kind === account.kind)!.label}
                    {account.active ? '' : ' · inativa'}
                  </span>
                </span>
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => void run(() => balanceAccountsApi.update(account.id, { name: account.name, kind: account.kind, active: !account.active }))}
                  aria-label={`${account.active ? 'Desativar' : 'Reativar'} ${account.name}`}
                >
                  {account.active ? 'Desativar' : 'Reativar'}
                </button>
                <IconButton label={`Excluir ${account.name}`} onClick={() => void run(() => balanceAccountsApi.remove(account.id))} danger>
                  <Trash2 size={15} aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <form className="form" onSubmit={submit} aria-label="Nova conta">
          <div className="form-row">
            <Field label="Nome da conta">
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
            </Field>
            <Field label="Entra em">
              <select value={kind} onChange={(event) => setKind(event.target.value as BalanceKind)}>
                {PLACES.map((place) => (
                  <option key={place.kind} value={place.kind}>
                    {place.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
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
