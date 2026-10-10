import { Link } from 'react-router-dom'
import { budgetComparisonApi } from '../api/endpoints'
import type { BudgetComparison, BudgetKind, ComparedYear } from '../api/types'
import { ErrorBanner, Loading, PageHeader } from '../components/ui'
import { formatGrowth, formatWhole } from '../lib/format'
import { useLoad } from '../lib/useLoad'

export function ComparisonPage() {
  const comparison = useLoad(() => budgetComparisonApi.get(), [])
  const data = comparison.data

  return (
    <>
      <PageHeader title="Histórico dos anos" subtitle="A média mensal de cada conta e renda, ano a ano. Valores em reais, sem centavos.">
        <Link to="/future" className="button">
          Voltar ao Futuro
        </Link>
      </PageHeader>
      <ErrorBanner message={comparison.error} onRetry={comparison.reload} />
      {comparison.loading && !data && <Loading />}
      {data && data.years.length === 0 && (
        <div className="card empty-state">
          <h2>Nada para comparar</h2>
          <p className="muted">O comparativo aparece quando houver valores lançados nas contas do mês.</p>
        </div>
      )}
      {data && data.years.length > 0 && (
        <section className="card budget-card" aria-label="Comparativo">
          <div className="table-wrapper">
            <table className="budget-table">
              <thead>
                <tr>
                  <th />
                  {data.years.map(({ year }) => (
                    <th key={year} className="numeric">
                      {year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <SummaryRow label="Contas" years={data.years} value={(year) => year.averageExpense} />
                <SummaryRow label="Rendas" years={data.years} value={(year) => year.averageIncome} />
                <SummaryRow label="Saldo" years={data.years} value={(year) => year.averageBalance} signed />
                <GrowthRow label="Variação das contas" years={data.years} value={(year) => year.expenseGrowth} goodWhen="down" />
                <GrowthRow label="Variação das rendas" years={data.years} value={(year) => year.incomeGrowth} goodWhen="up" />
                <LineRows comparison={data} kind="EXPENSE" title="Contas, uma a uma" />
                <LineRows comparison={data} kind="INCOME" title="Rendas, uma a uma" />
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

interface SummaryRowProps {
  label: string
  years: ComparedYear[]
  value: (year: ComparedYear) => number | null
  /** Colors the amounts by their sign. */
  signed?: boolean
}

function SummaryRow({ label, years, value, signed }: SummaryRowProps) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {years.map((year) => {
        const amount = value(year)
        const tone = signed && amount !== null ? (amount < 0 ? ' negative' : ' positive') : ''
        return (
          <td key={year.year} className={`numeric total${tone}`}>
            {amount === null ? '—' : formatWhole(amount)}
          </td>
        )
      })}
    </tr>
  )
}

interface GrowthRowProps {
  label: string
  years: ComparedYear[]
  value: (year: ComparedYear) => number | null
  /** Whether growing is good news (income) or bad news (bills). */
  goodWhen: 'up' | 'down'
}

function GrowthRow({ label, years, value, goodWhen }: GrowthRowProps) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {years.map((year) => {
        const growth = value(year)
        const good = growth !== null && growth !== 0 && growth > 0 === (goodWhen === 'up')
        const tone = growth === null || growth === 0 ? '' : good ? ' positive' : ' negative'
        return (
          <td key={year.year} className={`numeric amount${tone}`}>
            {growth === null ? '—' : formatGrowth(growth)}
          </td>
        )
      })}
    </tr>
  )
}

function LineRows({ comparison, kind, title }: { comparison: BudgetComparison; kind: BudgetKind; title: string }) {
  const lines = comparison.lines.filter((line) => line.kind === kind)
  if (lines.length === 0) return null
  return (
    <>
      <tr className="section-row">
        <td colSpan={comparison.years.length + 1}>{title}</td>
      </tr>
      {lines.map((line) => (
        <tr key={line.id}>
          <th scope="row">
            {line.name}
            {line.groupName && <span className="muted"> · {line.groupName}</span>}
          </th>
          {line.averages.map((average, index) => (
            <td key={comparison.years[index].year} className="numeric amount">
              {average === null ? '' : formatWhole(average)}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
