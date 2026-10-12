import { useState } from 'react'
import { Link } from 'react-router-dom'
import { budgetYearsApi, cardsApi } from '../api/endpoints'
import type { BudgetMonth, BudgetYear, BudgetYearLine } from '../api/types'
import { ErrorBanner, Kpi, Loading, PageHeader, Stepper, Toggle } from '../components/ui'
import { MONTH_STATE_LABELS, NATURES, NATURE_GROUP_LABELS, deviationOf, entryOf, monthStateOf } from '../lib/budget'
import { MONTH_NAMES, currentYearMonth, formatAmount, formatMoney, toYearMonth } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { useStoredFlag } from '../lib/useStoredFlag'

/** A cell stands out when it is this far (as a fraction) from the average of its line. */
const HIGHLIGHT_THRESHOLD = 0.08

/** What was already paid of the bills of a month. */
function paidOf(month: BudgetMonth, expenseIds: Set<number>): number {
  return month.entries
    .filter((entry) => entry.settled && expenseIds.has(entry.lineId))
    .reduce((sum, entry) => sum + entry.amount, 0)
}

export function YearPage() {
  const today = currentYearMonth()
  const [year, setYear] = useState(today.year)
  const [selected, setSelected] = useState(today.month)
  const budget = useLoad(() => budgetYearsApi.get(year), [year])
  // Only to keep the bills of the cards side by side; without them the table just keeps its usual order.
  const cards = useLoad(() => cardsApi.list().catch(() => []), [])
  const cardLineIds = new Set((cards.data ?? []).flatMap((card) => card.budgetLineId ?? []))
  const [showIncome, toggleIncome] = useStoredFlag('finch.year.income', false)
  const [highlight, toggleHighlight] = useStoredFlag('finch.year.highlight', true)
  const [detailExtras, toggleExtras] = useStoredFlag('finch.year.extras', false)
  const data = budget.data

  return (
    <>
      <PageHeader title="Visão do ano" subtitle="Cada conta mês a mês, o total gasto e quanto sobrou. Os valores são alterados em Contas do mês.">
        <Stepper
          label="Ano"
          value={year}
          previousLabel="Ano anterior"
          nextLabel="Próximo ano"
          onPrevious={() => setYear(year - 1)}
          onNext={() => setYear(year + 1)}
        />
        <Toggle pressed={detailExtras} onClick={toggleExtras} title="Abre a linha Extra, mostrando cada gasto esporádico.">
          Detalhar extras
        </Toggle>
        <Toggle pressed={showIncome} onClick={toggleIncome} title="Mostra também as rendas, linha a linha.">
          Mostrar receitas
        </Toggle>
        <Toggle
          pressed={highlight}
          onClick={toggleHighlight}
          title="Pinta o valor que ficou mais de 8% acima ou abaixo da média da conta."
        >
          Destacar variações
        </Toggle>
      </PageHeader>
      <ErrorBanner message={budget.error} onRetry={budget.reload} />
      {budget.loading && !data && <Loading />}
      {data && data.lines.length === 0 && (
        <div className="panel empty-state">
          <h2>Nada em {data.year}</h2>
          <p className="muted">
            Um ano passado só mostra as contas e rendas que têm valores nele. As ativas aparecem a partir do ano atual.
          </p>
          <Link to="/settings/lines" className="button button-primary">
            Ver contas e rendas
          </Link>
        </div>
      )}
      {data && data.lines.length > 0 && (
        <>
          <Summary budget={data} today={today} />
          <SelectedMonth budget={data} month={selected} today={today} />
          <YearTable
            budget={data}
            today={today}
            selected={selected}
            onSelect={setSelected}
            showIncome={showIncome}
            highlight={highlight}
            detailExtras={detailExtras}
            cardLineIds={cardLineIds}
          />
        </>
      )}
    </>
  )
}

interface Today {
  year: number
  month: number
}

function expenseIdsOf(budget: BudgetYear): Set<number> {
  return new Set(budget.lines.filter((line) => line.kind === 'EXPENSE').map((line) => line.id))
}

function Summary({ budget, today }: { budget: BudgetYear; today: Today }) {
  const spent = budget.months.reduce((sum, month) => sum + month.expenseTotal, 0)
  const left = budget.months.reduce((sum, month) => sum + month.balance, 0)
  const { averages } = budget
  const current = budget.year === today.year ? budget.months[today.month - 1] : null
  const paid = current ? paidOf(current, expenseIdsOf(budget)) : 0
  const ahead = current ? budget.months.slice(today.month, today.month + 3) : []

  return (
    <div className="kpis">
      <Kpi
        label="Gasto no ano"
        value={formatMoney(spent)}
        note={averages.expenseTotal === null ? undefined : `média de ${formatMoney(averages.expenseTotal)} por mês`}
      />
      <Kpi
        label="Sobra no ano"
        value={formatMoney(left)}
        tone={left < 0 ? 'warning' : 'positive'}
        note={averages.balance === null ? undefined : `média de ${formatMoney(averages.balance)} por mês`}
      />
      {current && (
        <Kpi
          label={`${MONTH_NAMES[today.month - 1]} até agora`}
          value={formatMoney(paid)}
          note={`de ${formatMoney(current.expenseTotal)} previstos · faltam ${formatMoney(current.expenseTotal - paid)}`}
        />
      )}
      {ahead.length > 0 && (
        <Kpi
          label={ahead.length === 1 ? 'Próximo mês' : `Próximos ${ahead.length} meses`}
          value={formatMoney(ahead.reduce((sum, month) => sum + month.expenseTotal, 0))}
          note="projeção de gasto"
        />
      )}
    </div>
  )
}

function SelectedMonth({ budget, month, today }: { budget: BudgetYear; month: number; today: Today }) {
  const data = budget.months[month - 1]
  const paid = paidOf(data, expenseIdsOf(budget))
  const open = data.expenseTotal - paid

  return (
    <section className="panel month-strip" aria-label="Mês selecionado">
      <div className="month-strip-name">
        <span className="kpi-label">{MONTH_STATE_LABELS[monthStateOf(budget.year, month, today)]}</span>
        <strong>
          {MONTH_NAMES[month - 1]} de {budget.year}
        </strong>
      </div>
      <Figure label="Total gasto" value={data.expenseTotal} />
      <Figure label="Já pago" value={paid} />
      <Figure label="Falta pagar" value={open} tone={open > 0 ? 'warning' : undefined} />
      <Figure label="Receitas" value={data.incomeTotal} />
      <Figure label="Sobra" value={data.balance} tone={data.balance < 0 ? 'warning' : 'positive'} />
      <Link to={`/month?m=${toYearMonth(budget.year, month)}`} className="button button-primary">
        Abrir contas do mês
      </Link>
    </section>
  )
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: 'positive' | 'warning' }) {
  return (
    <div className="figure">
      <span className="kpi-label">{label}</span>
      <strong className={tone}>{formatMoney(value)}</strong>
    </div>
  )
}

interface YearTableProps {
  budget: BudgetYear
  today: Today
  selected: number
  onSelect: (month: number) => void
  showIncome: boolean
  highlight: boolean
  /** Whether the occasional bills get a row each instead of one row with their sum. */
  detailExtras: boolean
  /** The bills that receive the invoice of a card: shown together, where the first of them is. */
  cardLineIds: Set<number>
}

function YearTable({ budget, today, selected, onSelect, showIncome, highlight, detailExtras, cardLineIds }: YearTableProps) {
  const expenses = keepTogether(budget.lines.filter((line) => line.kind === 'EXPENSE'), (line) => cardLineIds.has(line.id))
  const incomeLines = budget.lines.filter((line) => line.kind === 'INCOME')
  const largestBalance = Math.max(1, ...budget.months.map((month) => Math.abs(month.balance)))
  const columnClass = (month: number) => (month === selected ? 'selected' : undefined)
  const sumOf = (pick: (month: BudgetMonth) => number) => budget.months.reduce((sum, month) => sum + pick(month), 0)

  function lineRow(line: BudgetYearLine) {
    const total = budget.months.reduce((sum, month) => sum + (entryOf(month, line.id)?.amount ?? 0), 0)
    return (
      <tr key={line.id}>
        <th scope="row">{line.name}</th>
        {budget.months.map((month) => {
          const entry = entryOf(month, line.id)
          const classes = [
            columnClass(month.month),
            entry && (entry.settled ? 'settled' : 'forecast'),
            entry && highlight && line.kind === 'EXPENSE' && deviationOf(entry.amount, line.average, HIGHLIGHT_THRESHOLD),
          ]
          return (
            <td key={month.month} className={classes.filter(Boolean).join(' ') || undefined}>
              {entry ? formatAmount(entry.amount) : ''}
            </td>
          )
        })}
        <td className="strong">{formatAmount(total)}</td>
        <td className="muted">{line.average === null ? '' : formatAmount(line.average)}</td>
      </tr>
    )
  }

  /** The occasional bills as one row: what they add up to in each month. */
  function extrasRow(lines: BudgetYearLine[]) {
    const ids = new Set(lines.map((line) => line.id))
    const sumIn = (month: BudgetMonth) =>
      month.entries.filter((entry) => ids.has(entry.lineId)).reduce((sum, entry) => sum + entry.amount, 0)
    return (
      <tr>
        <th scope="row">
          Extra <span className="count">{lines.length === 1 ? '1 item' : `${lines.length} itens`}</span>
        </th>
        {budget.months.map((month) => (
          <td key={month.month} className={columnClass(month.month)}>
            {sumIn(month) === 0 ? '' : formatAmount(sumIn(month))}
          </td>
        ))}
        <td className="strong">{formatAmount(sumOf(sumIn))}</td>
        <td className="muted">{formatAmount(sumOf(sumIn) / 12)}</td>
      </tr>
    )
  }

  function totalRow(label: string, pick: (month: BudgetMonth) => number, average: number | null, signed = false) {
    const toneOf = (value: number) => (signed ? (value < 0 ? 'negative' : 'positive') : undefined)
    return (
      <tr key={label} className="summary-row">
        <th scope="row">{label}</th>
        {budget.months.map((month) => (
          <td key={month.month} className={[columnClass(month.month), toneOf(pick(month))].filter(Boolean).join(' ') || undefined}>
            {formatAmount(pick(month))}
          </td>
        ))}
        <td className={toneOf(sumOf(pick))}>{formatAmount(sumOf(pick))}</td>
        <td className={average === null ? undefined : toneOf(average)}>{average === null ? '' : formatAmount(average)}</td>
      </tr>
    )
  }

  return (
    <section className="panel year-panel" aria-label="Contas do ano">
      <div className="table-wrapper">
        <table className="year-table">
          <thead>
            <tr>
              <th>Conta</th>
              {budget.months.map((month) => {
                const name = MONTH_NAMES[month.month - 1]
                const state = monthStateOf(budget.year, month.month, today)
                return (
                  <th key={month.month} className={columnClass(month.month)}>
                    <button
                      type="button"
                      className={`month-head month-${state}`}
                      onClick={() => onSelect(month.month)}
                      aria-pressed={month.month === selected}
                      aria-label={name}
                    >
                      <span className="month-bar" title={`Sobra: ${formatMoney(month.balance)}`}>
                        <span
                          className={month.balance < 0 ? 'negative-bar' : undefined}
                          style={{ height: `${Math.max(8, (Math.abs(month.balance) / largestBalance) * 100)}%` }}
                        />
                      </span>
                      <span>{name.slice(0, 3)}</span>
                    </button>
                  </th>
                )
              })}
              <th>Total</th>
              <th>Média</th>
            </tr>
          </thead>
          <tbody>
            {/* What matters most comes first: how much was spent and how much was left. */}
            {totalRow('Total gasto', (month) => month.expenseTotal, budget.averages.expenseTotal)}
            {showIncome && totalRow('Total de receitas', (month) => month.incomeTotal, budget.averages.incomeTotal)}
            {totalRow('Sobra', (month) => month.balance, budget.averages.balance, true)}
            {NATURES.map((nature) => {
              const lines = expenses.filter((line) => line.nature === nature)
              if (lines.length === 0) return null
              return (
                <Group key={nature} name={NATURE_GROUP_LABELS[nature]}>
                  {nature === 'OCCASIONAL' && !detailExtras ? extrasRow(lines) : lines.map(lineRow)}
                </Group>
              )
            })}
            {showIncome && incomeLines.length > 0 && <Group name="Receitas">{incomeLines.map(lineRow)}</Group>}
          </tbody>
        </table>
      </div>
      <p className="legend">
        <span>
          <strong>Negrito</strong>: pago
        </span>
        <span>
          <em>Itálico</em>: previsão
        </span>
        <span>Barras no topo: a sobra de cada mês</span>
        {highlight && (
          <>
            <span>
              <i className="swatch above" /> mais de 8% acima da média da conta
            </span>
            <span>
              <i className="swatch below" /> mais de 8% abaixo
            </span>
          </>
        )}
      </p>
    </section>
  )
}

/** Moves the items that match to right after the first of them, keeping every other item where it was. */
function keepTogether<T>(items: T[], matches: (item: T) => boolean): T[] {
  const first = items.findIndex(matches)
  if (first < 0) return items
  const others = items.filter((item, index) => index <= first || !matches(item))
  const moved = items.filter((item, index) => index > first && matches(item))
  return [...others.slice(0, first + 1), ...moved, ...others.slice(first + 1)]
}

function Group({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="section-row">
        <td colSpan={15}>{name}</td>
      </tr>
      {children}
    </>
  )
}
