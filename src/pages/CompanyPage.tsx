import { ChevronLeft, ChevronRight, Landmark } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { errorMessage, fieldErrors } from '../api/client'
import { budgetLinesApi, companyApi } from '../api/endpoints'
import type { BudgetLine, CompanyBudgetLink, CompanyMonth, IncomeStatement, TaxYear } from '../api/types'
import { CurrencyInput } from '../components/CurrencyInput'
import { ErrorBanner, Field, Loading, Modal, PageHeader, Stepper, SuccessBanner } from '../components/ui'
import { MONTH_NAMES, currentYearMonth, formatAmount, formatDate, formatExchangeRate, formatMoney, formatRate, toYearMonth } from '../lib/format'
import { useLoad } from '../lib/useLoad'

export function CompanyPage() {
  const today = currentYearMonth()
  const [year, setYear] = useState(today.year)
  const loaded = useLoad(async () => {
    // Opening the current year is when the month that just began gets its dollar; failing to is no reason to stop.
    if (year === today.year) await companyApi.prepareCurrentMonth().catch(() => undefined)
    return {
      company: await companyApi.year(year),
      statement: await companyApi.incomeStatement(year),
      taxYears: await companyApi.taxYears(),
      link: await companyApi.budgetLink(),
      lines: await budgetLinesApi.list(),
    }
  }, [year])
  /** The month (1 to 12) whose invoice is being edited. */
  const [editing, setEditing] = useState<number | null>(null)
  const [editingRules, setEditingRules] = useState(false)
  /** The month (1 to 12) shown large; until one is picked, the current month, or December of a year that is over. */
  const [picked, setPicked] = useState<number | null>(null)
  const focus = picked ?? (year === today.year ? today.month : 12)
  const data = loaded.data
  const byMonth = new Map((data?.company.months ?? []).map((month) => [month.month, month]))
  // The rules in force: the ones of the year, or the nearest earlier ones.
  const rules = data?.taxYears.filter((each) => each.year <= year).at(-1) ?? data?.taxYears[0]
  const sum = (field: 'revenue' | 'das' | 'inss' | 'irrf' | 'netProLabore') =>
    (data?.company.months ?? []).reduce((total, month) => total + month[field], 0)

  return (
    <>
      <PageHeader title="Empresa" subtitle="A invoice de cada mês e o que sai dela: nota, pró-labore, INSS, IR e DAS.">
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
      <ErrorBanner message={loaded.error} onRetry={loaded.reload} />
      {loaded.loading && !data && <Loading />}
      {data && (
        <>
          <div className="kpis">
            <Stat label="Notas no ano" value={sum('revenue')} />
            <Stat label="DAS no ano" value={sum('das')} />
            <Stat label="INSS e IR no ano" value={sum('inss') + sum('irrf')} />
            <Stat label="Pró-labore líquido no ano" value={sum('netProLabore')} />
          </div>
          <MonthFocus
            year={year}
            month={focus}
            data={byMonth.get(toYearMonth(year, focus))}
            onPrevious={() => setPicked(Math.max(1, focus - 1))}
            onNext={() => setPicked(Math.min(12, focus + 1))}
            onEdit={() => setEditing(focus)}
            onChanged={loaded.reload}
          />
          <section className="panel budget-card" aria-label="Meses">
            <div className="table-wrapper">
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="numeric">Invoice (US$)</th>
                    <th className="numeric">Dólar</th>
                    <th className="numeric">Nota</th>
                    <th className="numeric">Pró-labore bruto</th>
                    <th className="numeric">INSS</th>
                    <th className="numeric">IR</th>
                    <th className="numeric">Pró-labore líquido</th>
                    <th className="numeric">DAS</th>
                    <th className="numeric" title="INSS, IR e DAS sobre a nota.">
                      Impostos
                    </th>
                    <th className="numeric">Entrou no Brasil</th>
                    <th className="numeric" title="O que entrou menos a nota.">
                      Variação cambial
                    </th>
                    <th className="numeric">Faturamento 12 m</th>
                    <th className="numeric" title="Alíquota efetiva do Simples Nacional.">
                      Alíquota
                    </th>
                    <th className="numeric">Fator R</th>
                    <th className="numeric">Nota nº</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTH_NAMES.map((name, index) => (
                    <MonthRow
                      key={name}
                      name={name}
                      month={byMonth.get(toYearMonth(year, index + 1))}
                      current={year === today.year && index + 1 === today.month}
                      onEdit={() => setEditing(index + 1)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="columns">
            <Statement statement={data.statement} />
            {rules && <Rules rules={rules} year={year} onEdit={() => setEditingRules(true)} />}
            <BudgetLinkForm link={data.link} lines={data.lines} />
          </div>
        </>
      )}
      {editing && data && (
        <InvoiceForm
          year={year}
          month={editing}
          current={byMonth.get(toYearMonth(year, editing))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loaded.reload()
          }}
        />
      )}
      {editingRules && rules && (
        <RulesForm
          year={year}
          rules={rules}
          onClose={() => setEditingRules(false)}
          onSaved={() => {
            setEditingRules(false)
            loaded.reload()
          }}
        />
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel kpi">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{formatMoney(value)}</strong>
    </div>
  )
}

interface MonthRowProps {
  name: string
  month: CompanyMonth | undefined
  current: boolean
  onEdit: () => void
}

function MonthRow({ name, month, current, onEdit }: MonthRowProps) {
  const title = (
    <th scope="row">
      <button type="button" className="cell cell-label" onClick={onEdit} title={`Editar a invoice de ${name.toLowerCase()}`}>
        {name}
      </button>
    </th>
  )
  if (!month) {
    return (
      <tr className={current ? 'current-month' : undefined}>
        {title}
        <td className="amount muted" colSpan={15}>
          sem invoice
        </td>
      </tr>
    )
  }
  const variation = month.exchangeVariation
  return (
    <tr className={[current ? 'current-month' : '', month.estimated ? 'estimated' : ''].join(' ').trim() || undefined}>
      {title}
      <td className="numeric amount">{formatAmount(month.invoiceUsd)}</td>
      <td className="numeric amount" title={month.estimated ? 'Previsão: sem cotação própria, usa a última conhecida.' : undefined}>
        {formatExchangeRate(month.usedExchangeRate)}
        {month.estimated && ' *'}
      </td>
      <td className="numeric total">{formatAmount(month.revenue)}</td>
      <td className="numeric amount">{formatAmount(month.grossProLabore)}</td>
      <td className="numeric amount">{formatAmount(month.inss)}</td>
      <td className="numeric amount">{formatAmount(month.irrf)}</td>
      <td className="numeric total">{formatAmount(month.netProLabore)}</td>
      <td className="numeric total">{formatAmount(month.das)}</td>
      <td className="numeric amount">{formatRate(month.taxRate)}</td>
      <td className="numeric amount">{month.receivedBrl === null ? '—' : formatAmount(month.receivedBrl)}</td>
      <td className={`numeric amount${variation === null || variation === 0 ? '' : variation > 0 ? ' positive' : ' negative'}`}>
        {variation === null ? '—' : formatAmount(variation)}
      </td>
      <td className="numeric amount">{formatAmount(month.revenueLast12Months)}</td>
      <td className="numeric amount">{formatRate(month.effectiveRate)}</td>
      <td className="numeric amount">{month.factorR === null ? '—' : formatRate(month.factorR)}</td>
      <td className="numeric amount">{month.invoiceNumber ?? '—'}</td>
    </tr>
  )
}

function Rules({ rules, year, onEdit }: { rules: TaxYear; year: number; onEdit: () => void }) {
  return (
    <section className="panel list-card" aria-label="Regras do ano">
      <header className="list-header">
        <h2>Regras de {year}</h2>
        <button type="button" className="button button-small" onClick={onEdit}>
          Editar
        </button>
      </header>
      {rules.year !== year && <p className="muted list-empty">Sem regras próprias: valem as de {rules.year}.</p>}
      <table>
        <tbody>
          <tr>
            <td>Teto do INSS</td>
            <td className="numeric">{formatAmount(rules.inssCeiling)}</td>
          </tr>
          <tr>
            <td>Dedução por dependente</td>
            <td className="numeric">{formatAmount(rules.dependentDeduction)}</td>
          </tr>
          {rules.irrfBrackets.map((bracket, index) => (
            <tr key={index}>
              <td>
                IR {bracket.upTo === null ? 'acima disso' : `até ${formatAmount(bracket.upTo)}`}: {formatRate(bracket.rate)}
              </td>
              <td className="numeric">− {formatAmount(bracket.deduction)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** The yearly income statement (DRE), laid out as the spreadsheet does. */
function Statement({ statement }: { statement: IncomeStatement }) {
  const line = (label: string, value: number, kind: 'total' | 'item' = 'item') => (
    <tr className={kind === 'total' ? 'statement-total' : undefined}>
      <td>{label}</td>
      <td className={`numeric${kind === 'total' && value < 0 ? ' negative' : ''}`}>{formatAmount(value)}</td>
    </tr>
  )
  return (
    <section className="panel list-card" aria-label="DRE">
      <header className="list-header">
        <h2>DRE de {statement.year}</h2>
      </header>
      <table>
        <tbody>
          {line('Receita operacional bruta', statement.grossRevenue, 'total')}
          {line('(−) Simples Nacional', statement.simplesNacional)}
          {line('Receita operacional líquida', statement.netRevenue, 'total')}
          {line('(−) Despesas operacionais', statement.operatingExpenses, 'total')}
          {line('Pró-labore', statement.proLabore)}
          {line('Impostos (INSS e IR)', statement.payrollTaxes)}
          {line('(+) Variação cambial ativa', statement.exchangeGains)}
          {line('(−) Variação cambial passiva', statement.exchangeLosses)}
          {line('Resultado', statement.result, 'total')}
        </tbody>
      </table>
    </section>
  )
}

/** Which lines of the monthly budget the company fills in by itself. */
function BudgetLinkForm({ link, lines }: { link: CompanyBudgetLink; lines: BudgetLine[] }) {
  const [incomeLineId, setIncomeLineId] = useState(link.incomeLineId?.toString() ?? '')
  const [payrollTaxLineId, setPayrollTaxLineId] = useState(link.payrollTaxLineId?.toString() ?? '')
  const [dasLineId, setDasLineId] = useState(link.dasLineId?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const id = (value: string) => (value ? Number(value) : null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSaved(false)
    try {
      await companyApi.setBudgetLink({ incomeLineId: id(incomeLineId), payrollTaxLineId: id(payrollTaxLineId), dasLineId: id(dasLineId) })
      setSaved(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  const options = (kind: BudgetLine['kind'], selected: string) =>
    lines
      .filter((line) => line.kind === kind && (line.active || String(line.id) === selected))
      .map((line) => (
        <option key={line.id} value={line.id}>
          {line.groupName ? `${line.name} (${line.groupName})` : line.name}
        </option>
      ))

  return (
    <section className="panel list-card" aria-label="Contas do mês">
      <header className="list-header">
        <h2>Contas do mês</h2>
      </header>
      <form className="form" onSubmit={submit}>
        <p className="muted">
          A empresa preenche sozinha estas linhas das contas do mês, nos meses que têm invoice. Conta já marcada como paga não é alterada.
        </p>
        <ErrorBanner message={error} />
        {saved && <SuccessBanner message="Ligação salva e contas do mês atualizadas." />}
        <Field label="Renda da empresa" hint="O que entrou no Brasil ou, até entrar, a nota menos 1%.">
          <select value={incomeLineId} onChange={(event) => setIncomeLineId(event.target.value)}>
            <option value="">Nenhuma</option>
            {options('INCOME', incomeLineId)}
          </select>
        </Field>
        <Field label="INSS e IR" hint="O INSS do mês mais o IR do mês anterior.">
          <select value={payrollTaxLineId} onChange={(event) => setPayrollTaxLineId(event.target.value)}>
            <option value="">Nenhuma</option>
            {options('EXPENSE', payrollTaxLineId)}
          </select>
        </Field>
        <Field label="DAS" hint="O DAS do próprio mês.">
          <select value={dasLineId} onChange={(event) => setDasLineId(event.target.value)}>
            <option value="">Nenhuma</option>
            {options('EXPENSE', dasLineId)}
          </select>
        </Field>
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={submitting}>
            Salvar ligação
          </button>
        </div>
      </form>
    </section>
  )
}

interface InvoiceFormProps {
  year: number
  month: number
  current: CompanyMonth | undefined
  onClose: () => void
  onSaved: () => void
}

function InvoiceForm({ year, month, current, onClose, onSaved }: InvoiceFormProps) {
  const [invoiceUsd, setInvoiceUsd] = useState(current ? current.invoiceUsd.toFixed(2) : '')
  const [exchangeRate, setExchangeRate] = useState(current?.exchangeRate?.toString() ?? '')
  const [receivedBrl, setReceivedBrl] = useState(current?.receivedBrl?.toFixed(2) ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState(current?.invoiceNumber ?? '')
  const [quoteNote, setQuoteNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const key = toYearMonth(year, month)

  async function run(action: () => Promise<unknown>, done?: () => void) {
    setBusy(true)
    setError(null)
    setErrors({})
    try {
      await action()
      done?.()
    } catch (caught) {
      setError(errorMessage(caught))
      setErrors(fieldErrors(caught))
    } finally {
      setBusy(false)
    }
  }

  function fetchQuote() {
    void run(async () => {
      const quote = await companyApi.invoiceQuote(key)
      setExchangeRate(String(quote.buyRate))
      setQuoteNote(`Dólar de compra de ${formatDate(quote.date)}, penúltimo dia útil do mês anterior.`)
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const input = {
      invoiceUsd: Number(invoiceUsd),
      exchangeRate: exchangeRate ? Number(exchangeRate.replace(',', '.')) : null,
      receivedBrl: receivedBrl ? Number(receivedBrl) : null,
      invoiceNumber: invoiceNumber.trim() || null,
    }
    void run(() => companyApi.setMonth(key, input), onSaved)
  }

  return (
    <Modal title={`Invoice · ${MONTH_NAMES[month - 1].toLowerCase()} de ${year}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <div className="form-row">
          <Field label="Invoice (US$)" error={errors.invoiceUsd}>
            <CurrencyInput value={invoiceUsd} onChange={setInvoiceUsd} required autoFocus />
          </Field>
          <Field label="Nota nº" error={errors.invoiceNumber}>
            <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} maxLength={30} />
          </Field>
        </div>
        <Field
          label="Dólar da nota"
          error={errors.exchangeRate}
          hint={quoteNote ?? 'Em branco, o mês fica como previsão, com a última cotação conhecida.'}
        >
          <div className="input-with-button">
            <input value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} inputMode="decimal" className="numeric" placeholder="0,0000" />
            <button type="button" className="button" onClick={fetchQuote} disabled={busy}>
              <Landmark size={16} aria-hidden />
              Buscar no Banco Central
            </button>
          </div>
        </Field>
        <Field label="Entrou no Brasil (R$)" error={errors.receivedBrl} hint="Preencha quando o dinheiro chegar.">
          <CurrencyInput value={receivedBrl} onChange={setReceivedBrl} />
        </Field>
        <div className="form-actions">
          {current && (
            <button type="button" className="button button-danger push-left" onClick={() => void run(() => companyApi.clearMonth(key), onSaved)} disabled={busy}>
              Limpar
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button button-primary" disabled={busy}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface RulesFormProps {
  year: number
  /** The rules shown as the starting point: the year's own, or the ones it inherits. */
  rules: TaxYear
  onClose: () => void
  onSaved: () => void
}

function RulesForm({ year, rules, onClose, onSaved }: RulesFormProps) {
  const [inssCeiling, setInssCeiling] = useState(rules.inssCeiling.toFixed(2))
  const [dependentDeduction, setDependentDeduction] = useState(rules.dependentDeduction.toFixed(2))
  const [deductions, setDeductions] = useState(rules.irrfBrackets.map((bracket) => bracket.deduction.toFixed(2)))
  const [limits, setLimits] = useState(rules.irrfBrackets.map((bracket) => bracket.upTo?.toFixed(2) ?? ''))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await companyApi.setTaxYear(year, {
        inssCeiling: Number(inssCeiling),
        dependentDeduction: Number(dependentDeduction),
        irrfBrackets: rules.irrfBrackets.map((bracket, index) => ({
          upTo: bracket.upTo === null ? null : Number(limits[index]),
          rate: bracket.rate,
          deduction: Number(deductions[index]),
        })),
      })
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setSubmitting(false)
    }
  }

  const replace = (values: string[], index: number, value: string) => values.map((each, at) => (at === index ? value : each))

  return (
    <Modal title={`Regras de ${year}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <div className="form-row">
          <Field label="Teto do INSS">
            <CurrencyInput value={inssCeiling} onChange={setInssCeiling} required autoFocus />
          </Field>
          <Field label="Dedução por dependente">
            <CurrencyInput value={dependentDeduction} onChange={setDependentDeduction} required />
          </Field>
        </div>
        {rules.irrfBrackets.map((bracket, index) => (
          <div className="form-row" key={index}>
            <Field label={`IR ${formatRate(bracket.rate)}: até`}>
              {bracket.upTo === null ? (
                <input value="sem limite" disabled />
              ) : (
                <CurrencyInput value={limits[index]} onChange={(value) => setLimits(replace(limits, index, value))} required />
              )}
            </Field>
            <Field label="Parcela a deduzir">
              <CurrencyInput value={deductions[index]} onChange={(value) => setDeductions(replace(deductions, index, value))} required />
            </Field>
          </div>
        ))}
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

/** The share of the invoice that is expected to reach the account while the real amount is unknown. */
const EXPECTED_AFTER_FEES = 0.99

interface MonthFocusProps {
  year: number
  /** 1 to 12. */
  month: number
  /** Undefined while the month has no invoice. */
  data: CompanyMonth | undefined
  onPrevious: () => void
  onNext: () => void
  onEdit: () => void
  /** Called after a step was ticked or unticked. */
  onChanged: () => void
}

/** A month of the company, large: the steps of closing it, how each number comes about and what reaches the owner. */
function MonthFocus({ year, month, data, onPrevious, onNext, onEdit, onChanged }: MonthFocusProps) {
  const name = MONTH_NAMES[month - 1]
  const [error, setError] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  if (!data) {
    return (
      <section className="panel month-strip" aria-label="Mês em foco">
        <MonthStepper name={name} year={year} onPrevious={onPrevious} onNext={onNext} />
        <span className="muted month-strip-name">Nenhuma invoice lançada neste mês.</span>
        <button type="button" className="button button-primary" onClick={onEdit}>
          Lançar invoice
        </button>
      </section>
    )
  }

  const received = data.receivedBrl ?? data.revenue * EXPECTED_AFTER_FEES
  const personal = received - data.totalTaxes
  /** The first two steps follow from the invoice; the last two are ticked by hand. */
  const steps: Step[] = [
    { name: 'Emitir a nota', value: data.revenue, done: !data.estimated, pending: 'falta a cotação do dólar' },
    { name: 'Receber o câmbio', value: received, done: data.receivedBrl !== null, pending: 'previsão: a nota menos 1%' },
    { name: 'Pagar DAS, INSS e IR', value: data.totalTaxes, done: data.taxesPaid, pending: 'vencem no dia 20', flag: 'taxesPaid' },
    { name: 'Transferir para a conta pessoal', value: personal, done: data.transferred, pending: 'pró-labore mais lucro', flag: 'transferred' },
  ]

  async function toggle(flag: 'taxesPaid' | 'transferred') {
    setError(null)
    try {
      await companyApi.setClosing(data!.month, { taxesPaid: data!.taxesPaid, transferred: data!.transferred, [flag]: !data![flag] })
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <section className="company-focus" aria-label="Mês em foco">
      <div className="week-focus-head">
        <MonthStepper name={name} year={year} onPrevious={onPrevious} onNext={onNext} />
        {data.estimated && <span className="chip chip-neutral">previsão</span>}
        <button type="button" className="button push-left" onClick={() => setSummarizing(true)}>
          Resumo para a contabilidade
        </button>
        <button type="button" className="button button-primary" onClick={onEdit}>
          Editar invoice
        </button>
      </div>
      <ErrorBanner message={error} />
      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step.name} className={step.done ? 'panel step step-done' : 'panel step'}>
            <span className="step-number">{index + 1}</span>
            <span className="row-text">
              <strong>{step.name}</strong>
              <span className="step-value">{formatMoney(step.value)}</span>
              <span className={step.done ? 'positive' : 'muted'}>{step.done ? 'feito' : step.pending}</span>
              {step.flag && (
                <button
                  type="button"
                  className="button button-small"
                  aria-pressed={step.done}
                  onClick={() => toggle(step.flag!)}
                  aria-label={`${step.done ? 'Desfazer' : 'Marcar como feito'}: ${step.name}`}
                >
                  {step.done ? 'Desfazer' : 'Marcar como feito'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ol>
      <div className="split">
        <div className="panel" role="group" aria-label="Cálculo do mês">
          <header className="panel-header">
            <h2>Cálculo do mês</h2>
            <span className="muted">
              US$ {formatAmount(data.invoiceUsd)} × {formatExchangeRate(data.usedExchangeRate)}
            </span>
          </header>
          <dl className="check-lines statement-lines">
            <dt>Nota fiscal</dt>
            <dd>{formatAmount(data.revenue)}</dd>
            <dt>Simples Nacional (DAS) · alíquota efetiva de {formatRate(data.effectiveRate)}</dt>
            <dd className="negative">-{formatAmount(data.das)}</dd>
            <dt>Pró-labore bruto</dt>
            <dd>{formatAmount(data.grossProLabore)}</dd>
            <dt>INSS</dt>
            <dd className="negative">-{formatAmount(data.inss)}</dd>
            <dt>Imposto de renda retido</dt>
            <dd className="negative">-{formatAmount(data.irrf)}</dd>
            <dt>Pró-labore líquido</dt>
            <dd>{formatAmount(data.netProLabore)}</dd>
            <dt>{data.receivedBrl === null ? 'Deve entrar no banco' : 'Entrou no banco'}</dt>
            <dd>{formatAmount(received)}</dd>
            <dt>Guias do mês (DAS + INSS + IR)</dt>
            <dd className="negative">-{formatAmount(data.totalTaxes)}</dd>
            <dt>Total para a conta pessoal</dt>
            <dd className="positive">{formatAmount(personal)}</dd>
          </dl>
        </div>
        <div className="stack">
          <div className="panel kpi">
            <span className="kpi-label">Vai para a conta pessoal</span>
            <strong className="kpi-value positive">{formatMoney(personal)}</strong>
            <span className="kpi-note">
              Pró-labore líquido de {formatMoney(data.netProLabore)} mais {formatMoney(personal - data.netProLabore)} de lucro distribuído.
            </span>
          </div>
          <div className="panel" role="group" aria-label="Indicadores">
            <dl className="check-lines week-parts indicators">
              <dt>Fator R</dt>
              <dd>{data.factorR === null ? '—' : formatRate(data.factorR)}</dd>
              <dt>Faturamento em 12 meses</dt>
              <dd>{formatAmount(data.revenueLast12Months)}</dd>
              <dt>Variação cambial</dt>
              <dd>{data.exchangeVariation === null ? '—' : formatAmount(data.exchangeVariation)}</dd>
              <dt>Impostos sobre a nota</dt>
              <dd>{formatRate(data.taxRate)}</dd>
            </dl>
          </div>
        </div>
      </div>
      {summarizing && <AccountingSummary name={name} year={year} data={data} received={received} personal={personal} onClose={() => setSummarizing(false)} />}
    </section>
  )
}

interface Step {
  name: string
  value: number
  done: boolean
  /** What is shown while the step is not done. */
  pending: string
  /** Set on the steps that are ticked by hand: the field of the month that holds it. */
  flag?: 'taxesPaid' | 'transferred'
}

interface AccountingSummaryProps {
  name: string
  year: number
  data: CompanyMonth
  received: number
  personal: number
  onClose: () => void
}

/** The month in plain text, ready to be sent to the accountant: copied, or printed (which also saves as PDF). */
function AccountingSummary({ name, year, data, received, personal, onClose }: AccountingSummaryProps) {
  const [copied, setCopied] = useState(false)
  const line = (label: string, value: string) => `${label.padEnd(34, '.')} ${value}`
  const text = [
    `Resumo de ${name.toLowerCase()} de ${year}`,
    '',
    line('Nota fiscal nº', data.invoiceNumber ?? 'não informado'),
    line('Invoice (US$)', formatAmount(data.invoiceUsd)),
    line('Cotação do dólar', formatExchangeRate(data.usedExchangeRate) + (data.estimated ? ' (previsão)' : '')),
    line('Valor da nota (R$)', formatAmount(data.revenue)),
    line(data.receivedBrl === null ? 'Previsto no banco (R$)' : 'Recebido no banco (R$)', formatAmount(received)),
    '',
    line('Faturamento em 12 meses (R$)', formatAmount(data.revenueLast12Months)),
    line('Fator R', data.factorR === null ? 'sem base' : formatRate(data.factorR)),
    line('Alíquota efetiva do Simples', formatRate(data.effectiveRate)),
    line('DAS (R$)', formatAmount(data.das)),
    '',
    line('Pró-labore bruto (R$)', formatAmount(data.grossProLabore)),
    line('INSS (R$)', formatAmount(data.inss)),
    line('IR retido na fonte (R$)', formatAmount(data.irrf)),
    line('Pró-labore líquido (R$)', formatAmount(data.netProLabore)),
    '',
    line('Total das guias (R$)', formatAmount(data.totalTaxes)),
    line('Lucro distribuído (R$)', formatAmount(personal - data.netProLabore)),
    line('Guias pagas', data.taxesPaid ? 'sim' : 'não'),
  ].join('\n')

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return (
    <Modal title={`Resumo para a contabilidade · ${name.toLowerCase()} de ${year}`} onClose={onClose}>
      <div className="form">
        <pre className="summary-text">{text}</pre>
        {copied && <SuccessBanner message="Resumo copiado. É só colar no e-mail ou na mensagem." />}
        <div className="form-actions">
          <button type="button" className="button" onClick={() => window.print()}>
            Imprimir ou salvar em PDF
          </button>
          <button type="button" className="button button-primary" onClick={copy}>
            Copiar texto
          </button>
        </div>
      </div>
    </Modal>
  )
}

interface MonthStepperProps {
  name: string
  year: number
  onPrevious: () => void
  onNext: () => void
}

function MonthStepper({ name, year, onPrevious, onNext }: MonthStepperProps) {
  return (
    <Stepper
      label="Mês"
      value={`${name} ${year}`}
      previousLabel="Mês anterior"
      nextLabel="Próximo mês"
      onPrevious={onPrevious}
      onNext={onNext}
      wide
    />
  )
}
