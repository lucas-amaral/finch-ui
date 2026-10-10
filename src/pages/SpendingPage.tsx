import { useState } from 'react'
import { cardSpendingApi, cardsApi } from '../api/endpoints'
import type { CardSpendingYear, SpendingRow } from '../api/types'
import { ErrorBanner, Loading, PageHeader, Stepper, Toggle } from '../components/ui'
import { deviationOf } from '../lib/budget'
import { MONTH_NAMES, currentYearMonth, formatGrowth, formatMoney, formatWhole } from '../lib/format'
import { useLoad } from '../lib/useLoad'
import { useStoredFlag } from '../lib/useStoredFlag'

/** A cell stands out when it is this far (as a fraction) from the average of its category. */
const HIGHLIGHT_THRESHOLD = 0.1

/** A kind of spending that gets a row in the table and a slice in the chart. */
interface Slice {
  key: string
  name: string
  pick: (row: SpendingRow) => number
}

function slicesOf(data: CardSpendingYear): Slice[] {
  const slices: Slice[] = data.categories.map((category) => ({
    key: String(category.id),
    name: category.name,
    pick: (row) => row.byCategory[category.id] ?? 0,
  }))
  if (data.total.uncategorized !== 0) slices.push({ key: 'other', name: 'Outros', pick: (row) => row.uncategorized })
  if (data.total.installments !== 0) slices.push({ key: 'installments', name: 'Parcelado', pick: (row) => row.installments })
  return slices
}

/** One hue only: each slice is the accent colour a little more washed out than the one before. */
function shadeOf(index: number, count: number): string {
  const strength = count <= 1 ? 100 : Math.round(100 - (index * 78) / (count - 1))
  return `color-mix(in srgb, var(--primary) ${strength}%, var(--surface))`
}

const growth = (value: number, base: number) => (base > 0 ? formatGrowth(value / base - 1) : '')
/** Spending more than the reference is the bad direction. */
const toneOf = (value: number, base: number) => (base <= 0 || value === base ? undefined : value > base ? 'negative' : 'positive')

export function SpendingPage() {
  const today = currentYearMonth()
  const [year, setYear] = useState(today.year)
  /** Null for every card together. */
  const [cardId, setCardId] = useState<number | null>(null)
  const cards = useLoad(() => cardsApi.list(), [])
  const spending = useLoad(() => cardSpendingApi.get(year, cardId ?? undefined), [year, cardId])
  const active = (cards.data ?? []).filter((card) => card.active)
  const [picked, setPicked] = useState<number | null>(null)
  const [highlight, toggleHighlight] = useStoredFlag('finch.spending.highlight', true)
  const data = spending.data

  return (
    <>
      <PageHeader title="Gastos por mês" subtitle="O que as faturas de todos os cartões somam em cada mês, por categoria.">
        <Stepper
          label="Ano"
          value={year}
          previousLabel="Ano anterior"
          nextLabel="Próximo ano"
          onPrevious={() => setYear(year - 1)}
          onNext={() => setYear(year + 1)}
        />
        <Toggle
          pressed={highlight}
          onClick={toggleHighlight}
          title="Pinta o valor que ficou mais de 10% acima ou abaixo da média da categoria."
        >
          Destacar variações
        </Toggle>
      </PageHeader>
      <ErrorBanner message={spending.error} onRetry={spending.reload} />
      {active.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Cartão">
          <button type="button" role="tab" aria-selected={cardId === null} onClick={() => setCardId(null)}>
            Todos os cartões
          </button>
          {active.map((card) => (
            <button key={card.id} type="button" role="tab" aria-selected={cardId === card.id} onClick={() => setCardId(card.id)}>
              {card.name}
            </button>
          ))}
        </div>
      )}
      {spending.loading && !data && <Loading />}
      {data && data.average === null && (
        <div className="panel empty-state">
          <h2>Nada em {data.year}</h2>
          <p className="muted">Nenhuma compra {cardId === null ? 'de cartão' : 'deste cartão'} cai nas faturas deste ano.</p>
        </div>
      )}
      {data && data.average !== null && (
        <Spending
          data={data}
          average={data.average}
          highlight={highlight}
          selected={picked ?? defaultMonth(data, today)}
          onSelect={setPicked}
        />
      )}
    </>
  )
}

/** The current month while its year is on screen; otherwise the last month with something spent. */
function defaultMonth(data: CardSpendingYear, today: { year: number; month: number }): number {
  if (data.year === today.year) return today.month
  return [...data.months].reverse().find((month) => month.spending.total !== 0)?.month ?? 12
}

interface SpendingProps {
  data: CardSpendingYear
  average: SpendingRow
  highlight: boolean
  selected: number
  onSelect: (month: number) => void
}

function Spending({ data, average, highlight, selected, onSelect }: SpendingProps) {
  const slices = slicesOf(data)
  const row = data.months[selected - 1].spending
  const previous = selected > 1 ? data.months[selected - 2].spending : null
  const monthName = MONTH_NAMES[selected - 1]

  return (
    <>
      <section className="panel year-panel" aria-label="Gasto por categoria">
        <div className="table-wrapper">
          <table className="year-table">
            <thead>
              <tr>
                <th>Categoria</th>
                {data.months.map(({ month }) => (
                  <th key={month} className={month === selected ? 'selected' : undefined}>
                    <button
                      type="button"
                      className="month-head"
                      onClick={() => onSelect(month)}
                      aria-pressed={month === selected}
                      aria-label={MONTH_NAMES[month - 1]}
                    >
                      {MONTH_NAMES[month - 1].slice(0, 3)}
                    </button>
                  </th>
                ))}
                <th>Total</th>
                <th>Média</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((slice) => (
                <tr key={slice.key}>
                  <th scope="row">{slice.name}</th>
                  {data.months.map(({ month, spending: monthRow }) => {
                    const value = slice.pick(monthRow)
                    // A month with nothing at all is still ahead (or empty), not a month of savings.
                    const deviation = highlight && monthRow.total !== 0 && deviationOf(value, slice.pick(average), HIGHLIGHT_THRESHOLD)
                    return (
                      <td key={month} className={[month === selected && 'selected', deviation].filter(Boolean).join(' ') || undefined}>
                        {value === 0 ? '' : formatWhole(value)}
                      </td>
                    )
                  })}
                  <td className="strong">{formatWhole(slice.pick(data.total))}</td>
                  <td className="muted">{formatWhole(slice.pick(average))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <SummaryRow label="Alimentação" data={data} average={average} selected={selected} pick={(r) => r.foodTotal} />
              <SummaryRow label="Sem alimentação" data={data} average={average} selected={selected} pick={(r) => r.nonFoodTotal} />
              <SummaryRow label="Total" data={data} average={average} selected={selected} pick={(r) => r.total} />
              <tr>
                <th scope="row" title="Quanto o total mudou em relação ao mês anterior.">
                  Variação
                </th>
                {data.months.map(({ month, changeFromPrevious }) => (
                  <td
                    key={month}
                    className={[month === selected && 'selected', changeFromPrevious > 0 ? 'negative' : changeFromPrevious < 0 ? 'positive' : '']
                      .filter(Boolean)
                      .join(' ') || undefined}
                  >
                    {changeFromPrevious > 0 ? '+' : ''}
                    {changeFromPrevious === 0 ? '' : formatWhole(changeFromPrevious)}
                  </td>
                ))}
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {highlight && (
          <p className="legend">
            <span>
              <i className="swatch above" /> mais de 10% acima da média da categoria
            </span>
            <span>
              <i className="swatch below" /> mais de 10% abaixo
            </span>
          </p>
        )}
      </section>

      <div className="split">
        <section className="panel chart-panel" aria-label="Evolução no ano">
          <header className="panel-header">
            <h2>Evolução no ano</h2>
            <span className="muted">Média de {formatMoney(average.total)} por mês</span>
          </header>
          <Chart data={data} slices={slices} average={average.total} selected={selected} onSelect={onSelect} />
          <p className="legend">
            {slices.map((slice, index) => (
              <span key={slice.key}>
                <i className="swatch" style={{ background: shadeOf(index, slices.length) }} /> {slice.name}
              </span>
            ))}
          </p>
        </section>

        <section className="panel" aria-label={`Detalhe de ${monthName.toLowerCase()}`}>
          <header className="panel-header">
            <h2>{monthName}</h2>
            <strong className="numeric">{formatMoney(row.total)}</strong>
          </header>
          <table className="detail-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Valor</th>
                <th>Mês anterior</th>
                <th>Média</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((slice, index) => {
                const value = slice.pick(row)
                const before = previous ? slice.pick(previous) : 0
                return (
                  <tr key={slice.key}>
                    <th scope="row">
                      <i className="swatch" style={{ background: shadeOf(index, slices.length) }} /> {slice.name}
                    </th>
                    <td className="strong">{formatWhole(value)}</td>
                    <td className={toneOf(value, before)}>{growth(value, before)}</td>
                    <td className={toneOf(value, slice.pick(average))}>{growth(value, slice.pick(average))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>

      {row.total !== 0 && <Bottlenecks slices={slices} row={row} average={average} monthName={monthName} />}
    </>
  )
}

interface SummaryRowProps {
  label: string
  data: CardSpendingYear
  average: SpendingRow
  selected: number
  pick: (row: SpendingRow) => number
}

function SummaryRow({ label, data, average, selected, pick }: SummaryRowProps) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {data.months.map(({ month, spending }) => (
        <td key={month} className={month === selected ? 'selected' : undefined}>
          {pick(spending) === 0 ? '' : formatWhole(pick(spending))}
        </td>
      ))}
      <td>{formatWhole(pick(data.total))}</td>
      <td>{formatWhole(pick(average))}</td>
    </tr>
  )
}

interface ChartProps {
  data: CardSpendingYear
  slices: Slice[]
  average: number
  selected: number
  onSelect: (month: number) => void
}

function Chart({ data, slices, average, selected, onSelect }: ChartProps) {
  const largest = Math.max(1, ...data.months.map((month) => month.spending.total))
  return (
    <div className="bars">
      <span className="bars-average" style={{ bottom: `calc(1.6rem + ${(average / largest) * 100}% * 0.78)` }} />
      {data.months.map(({ month, spending }) => (
        <button
          key={month}
          type="button"
          className="bar"
          onClick={() => onSelect(month)}
          aria-pressed={month === selected}
          aria-label={`${MONTH_NAMES[month - 1]}: ${formatMoney(spending.total)}`}
        >
          <span className="bar-value">{spending.total === 0 ? '' : formatWhole(spending.total)}</span>
          <span className="bar-stack" style={{ height: `${(Math.max(0, spending.total) / largest) * 78}%` }}>
            {slices.map((slice, index) => (
              <span
                key={slice.key}
                style={{ flexGrow: Math.max(0, slice.pick(spending)), background: shadeOf(index, slices.length) }}
              />
            ))}
          </span>
          <span className="bar-label">{MONTH_NAMES[month - 1].slice(0, 3)}</span>
        </button>
      ))}
    </div>
  )
}

interface BottlenecksProps {
  slices: Slice[]
  row: SpendingRow
  average: SpendingRow
  monthName: string
}

/** Where the month stood out: what ran over, what weighs the most and where it was light. */
function Bottlenecks({ slices, row, average, monthName }: BottlenecksProps) {
  const ranked = slices.map((slice) => ({ name: slice.name, value: slice.pick(row), usual: slice.pick(average) }))
  if (ranked.length === 0) return null
  const over = [...ranked].sort((a, b) => b.value - b.usual - (a.value - a.usual))[0]
  const under = [...ranked].sort((a, b) => a.value - a.usual - (b.value - b.usual))[0]
  const heaviest = [...ranked].sort((a, b) => b.value - a.value)[0]

  return (
    <div className="kpis">
      {over.value > over.usual && (
        <article className="panel callout callout-warning">
          <span className="kpi-label">Gargalo de {monthName.toLowerCase()}</span>
          <strong>
            {over.name}: {formatMoney(over.value - over.usual)} acima da média
          </strong>
          <span className="muted">
            {formatMoney(over.value)} no mês contra {formatMoney(over.usual)} de média.
          </span>
        </article>
      )}
      <article className="panel callout">
        <span className="kpi-label">Maior peso</span>
        <strong>
          {heaviest.name}: {Math.round((heaviest.value / row.total) * 100)}% do mês
        </strong>
        <span className="muted">
          {formatMoney(heaviest.value)} de um total de {formatMoney(row.total)}.
        </span>
      </article>
      {under.value < under.usual && (
        <article className="panel callout callout-positive">
          <span className="kpi-label">Onde economizou</span>
          <strong>
            {under.name}: {formatMoney(under.usual - under.value)} abaixo da média
          </strong>
          <span className="muted">
            {formatMoney(under.value)} no mês contra {formatMoney(under.usual)} de média.
          </span>
        </article>
      )}
    </div>
  )
}
