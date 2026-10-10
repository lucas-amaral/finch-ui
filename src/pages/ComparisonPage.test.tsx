import { screen, within } from '@testing-library/react'
import { budgetComparisonApi } from '../api/endpoints'
import type { BudgetComparison } from '../api/types'
import { renderPage } from '../test/render'
import { ComparisonPage } from './ComparisonPage'

const comparison: BudgetComparison = {
  years: [
    { year: 2024, averageExpense: 1250.4, averageIncome: 4000, averageBalance: 2749.6, incomeGrowth: null, expenseGrowth: null },
    { year: 2025, averageExpense: 1500, averageIncome: 1200, averageBalance: -300, incomeGrowth: -0.7, expenseGrowth: 0.2 },
  ],
  lines: [
    { id: 1, name: 'Rent', kind: 'EXPENSE', groupName: 'Casa', averages: [1100, 1500] },
    { id: 2, name: 'Gone', kind: 'EXPENSE', groupName: null, averages: [300, null] },
    { id: 4, name: 'Salary', kind: 'INCOME', groupName: null, averages: [4000, 1200] },
  ],
}

const cells = (name: RegExp) => within(screen.getByRole('row', { name })).getAllByRole('cell').map((cell) => cell.textContent)

describe('ComparisonPage', () => {
  it('shows the totals of each year and how they moved, colored by whether that is good news', async () => {
    vi.spyOn(budgetComparisonApi, 'get').mockResolvedValue(comparison)
    renderPage(<ComparisonPage />)
    await screen.findByRole('region', { name: 'Comparativo' })

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['', '2024', '2025'])
    expect(cells(/^Contas 1\.250/)).toEqual(['1.250', '1.500'])
    expect(cells(/^Saldo/)).toEqual(['2.750', '-300'])
    expect(within(screen.getByRole('row', { name: /^Saldo/ })).getByText('-300')).toHaveClass('negative')
    expect(cells(/^Variação das contas/)).toEqual(['—', '+20,0%'])
    expect(screen.getByText('+20,0%')).toHaveClass('negative')
    expect(screen.getByText('-70,0%')).toHaveClass('negative')
  })

  it('lists each bill and income with its average per year, blank where it has none', async () => {
    vi.spyOn(budgetComparisonApi, 'get').mockResolvedValue(comparison)
    renderPage(<ComparisonPage />)
    await screen.findByRole('region', { name: 'Comparativo' })

    expect(cells(/^Rent/)).toEqual(['1.100', '1.500'])
    expect(cells(/^Gone/)).toEqual(['300', ''])
    expect(cells(/^Salary/)).toEqual(['4.000', '1.200'])
    expect(screen.getByText('Contas, uma a uma')).toBeInTheDocument()
    expect(screen.getByText('Rendas, uma a uma')).toBeInTheDocument()
  })

  it('says so when there is nothing to compare', async () => {
    vi.spyOn(budgetComparisonApi, 'get').mockResolvedValue({ years: [], lines: [] })
    renderPage(<ComparisonPage />)

    expect(await screen.findByText('Nada para comparar')).toBeInTheDocument()
  })
})
