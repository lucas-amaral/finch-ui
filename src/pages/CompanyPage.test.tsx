import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { budgetLinesApi, companyApi } from '../api/endpoints'
import type { BudgetLine, CompanyMonth, TaxYear } from '../api/types'
import { renderPage } from '../test/render'
import { CompanyPage } from './CompanyPage'

const rules = (year: number, ceiling: number): TaxYear => ({
  year,
  inssCeiling: ceiling,
  dependentDeduction: 189.59,
  irrfBrackets: [
    { upTo: 2826.65, rate: 0.075, deduction: 182.16 },
    { upTo: null, rate: 0.275, deduction: 908.73 },
  ],
})

const september = (year: number): CompanyMonth => ({
  month: `${year}-09`,
  invoiceUsd: 7200,
  exchangeRate: 5.1999,
  receivedBrl: 36334.98,
  invoiceNumber: '58',
  taxesPaid: true,
  transferred: false,
  estimated: false,
  usedExchangeRate: 5.1999,
  revenue: 37439.28,
  grossProLabore: 8924,
  inss: 932.31,
  irrf: 1236.85,
  netProLabore: 6754.84,
  das: 1829.48,
  totalTaxes: 3998.64,
  taxRate: 0.1068,
  revenueLast12Months: 452334.24,
  effectiveRate: 0.096,
  factorR: 0.28,
  exchangeVariation: -1104.3,
})

const october = (year: number): CompanyMonth => ({
  ...september(year),
  month: `${year}-10`,
  exchangeRate: null,
  receivedBrl: null,
  invoiceNumber: null,
  estimated: true,
  exchangeVariation: null,
})

const line = (id: number, name: string, kind: BudgetLine['kind'], active = true): BudgetLine => ({
  id,
  name,
  kind,
  groupName: kind === 'EXPENSE' ? 'PJ' : null,
  dueDay: null,
  active,
  forecastRule: 'LAST_VALUE',
  nature: 'VARIABLE',
  sortOrder: id,
})

async function renderCompany() {
  vi.spyOn(companyApi, 'prepareCurrentMonth').mockResolvedValue(undefined)
  const year = vi.spyOn(companyApi, 'year').mockImplementation(async (which) => ({ year: which, months: [september(which), october(which)] }))
  vi.spyOn(companyApi, 'taxYears').mockResolvedValue([rules(2025, 8157.41), rules(2026, 8475.55)])
  vi.spyOn(companyApi, 'incomeStatement').mockImplementation(async (which) => ({
    year: which,
    grossRevenue: 74878.56,
    simplesNacional: 3658.96,
    netRevenue: 71219.6,
    proLabore: 20966,
    payrollTaxes: 4338.32,
    operatingExpenses: 25304.32,
    exchangeGains: 0,
    exchangeLosses: 1104.3,
    result: 44810.98,
  }))
  vi.spyOn(companyApi, 'budgetLink').mockResolvedValue({ incomeLineId: 1, payrollTaxLineId: null, dasLineId: null })
  vi.spyOn(budgetLinesApi, 'list').mockResolvedValue([
    line(1, 'Partner', 'INCOME'),
    line(2, 'Taxes', 'EXPENSE'),
    line(3, 'Simples', 'EXPENSE'),
    line(4, 'Old bill', 'EXPENSE', false),
  ])
  renderPage(<CompanyPage />)
  await screen.findByRole('region', { name: 'Meses' })
  return { year, user: userEvent.setup() }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CompanyPage', () => {
  it('shows each month of the current year with the invoice and what comes out of it', async () => {
    const { year } = await renderCompany()

    expect(year).toHaveBeenCalledWith(2026)
    const row = screen.getByRole('row', { name: /^Setembro/ })
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '7.200,00', '5,1999', '37.439,28', '8.924,00', '932,31', '1.236,85', '6.754,84', '1.829,48', '10,68%',
      '36.334,98', '-1.104,30', '452.334,24', '9,60%', '28,00%', '58',
    ])
    expect(within(row).getByText('-1.104,30')).toHaveClass('negative')
    expect(within(screen.getByRole('row', { name: /^Janeiro/ })).getByText('sem invoice')).toBeInTheDocument()
  })

  it('marks a month without its own rate as a forecast, and totals the year', async () => {
    await renderCompany()

    const row = screen.getByRole('row', { name: /^Outubro/ })
    expect(row).toHaveClass('estimated', 'current-month')
    expect(within(row).getByText('5,1999 *')).toBeInTheDocument()
    expect(screen.getByText('Notas no ano').nextElementSibling).toHaveTextContent(/74\.878,56/)
    expect(screen.getByText('INSS e IR no ano').nextElementSibling).toHaveTextContent(/4\.338,32/)
  })

  it('registers the invoice of a month, fetching the dollar from the central bank', async () => {
    const { year, user } = await renderCompany()
    vi.spyOn(companyApi, 'invoiceQuote').mockResolvedValue({ date: '2026-10-29', buyRate: 5.3172 })
    const setMonth = vi.spyOn(companyApi, 'setMonth').mockResolvedValue(undefined)

    await user.click(screen.getByRole('button', { name: 'Novembro' }))
    const dialog = screen.getByRole('dialog', { name: 'Invoice · novembro de 2026' })
    await user.type(within(dialog).getByLabelText(/^Invoice/), '720000')
    await user.click(within(dialog).getByRole('button', { name: 'Buscar no Banco Central' }))
    expect(await within(dialog).findByText(/Dólar de compra de 29\/10\/2026/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Dólar da nota/)).toHaveValue('5.3172')
    await user.type(within(dialog).getByLabelText(/^Nota nº/), '60')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(companyApi.invoiceQuote).toHaveBeenCalledWith('2026-11')
    expect(setMonth).toHaveBeenCalledWith('2026-11', { invoiceUsd: 7200, exchangeRate: 5.3172, receivedBrl: null, invoiceNumber: '60' })
    await waitFor(() => expect(year).toHaveBeenCalledTimes(2))
  })

  it('edits a month typing the rate with a comma, and can clear it', async () => {
    const { user } = await renderCompany()
    const setMonth = vi.spyOn(companyApi, 'setMonth').mockResolvedValue(undefined)
    const clearMonth = vi.spyOn(companyApi, 'clearMonth').mockResolvedValue(undefined)

    await user.click(screen.getByRole('button', { name: 'Outubro' }))
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText(/^Invoice/)).toHaveValue('7.200,00')
    await user.type(within(dialog).getByLabelText(/^Dólar da nota/), '5,25')
    await user.type(within(dialog).getByLabelText(/^Entrou no Brasil/), '3700000')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(setMonth).toHaveBeenCalledWith('2026-10', { invoiceUsd: 7200, exchangeRate: 5.25, receivedBrl: 37000, invoiceNumber: null })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Setembro' }))
    dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Limpar' }))
    expect(clearMonth).toHaveBeenCalledWith('2026-09')
  })

  it('keeps the form open with the message when the central bank has no quote yet', async () => {
    const { user } = await renderCompany()
    vi.spyOn(companyApi, 'invoiceQuote').mockRejectedValue(new ApiError(404, 'O Banco Central ainda não tem cotações suficientes de 11/2026.'))

    await user.click(screen.getByRole('button', { name: 'Dezembro' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Buscar no Banco Central' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ainda não tem cotações suficientes')
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeEnabled()
  })

  it('shows the income statement of the year', async () => {
    await renderCompany()

    const statement = screen.getByRole('region', { name: 'DRE' })
    expect(within(statement).getByRole('heading', { name: 'DRE de 2026' })).toBeInTheDocument()
    const amount = (label: string) => within(within(statement).getByText(label).closest('tr')!).getAllByRole('cell')[1].textContent
    expect(amount('Receita operacional bruta')).toBe('74.878,56')
    expect(amount('(−) Simples Nacional')).toBe('3.658,96')
    expect(amount('Pró-labore')).toBe('20.966,00')
    expect(amount('(−) Variação cambial passiva')).toBe('1.104,30')
    expect(amount('Resultado')).toBe('44.810,98')
  })

  it('chooses the budget lines the company fills in, offering incomes and active bills where each fits', async () => {
    const { user } = await renderCompany()
    const setBudgetLink = vi.spyOn(companyApi, 'setBudgetLink').mockResolvedValue({ incomeLineId: 1, payrollTaxLineId: 2, dasLineId: 3 })
    const form = screen.getByRole('region', { name: 'Contas do mês' })
    expect(within(form).getByLabelText(/^Renda da empresa/)).toHaveValue('1')
    const das = within(form).getByLabelText(/^DAS/)
    expect(within(das).getAllByRole('option').map((option) => option.textContent)).toEqual(['Nenhuma', 'Taxes (PJ)', 'Simples (PJ)'])

    await user.selectOptions(within(form).getByLabelText(/^INSS e IR/), 'Taxes (PJ)')
    await user.selectOptions(das, 'Simples (PJ)')
    await user.click(within(form).getByRole('button', { name: 'Salvar ligação' }))

    expect(setBudgetLink).toHaveBeenCalledWith({ incomeLineId: 1, payrollTaxLineId: 2, dasLineId: 3 })
    expect(await within(form).findByRole('status')).toHaveTextContent('Ligação salva')
  })

  it('shows the rules in force, saying so when the year borrows them, and saves new ones for the year', async () => {
    const { user } = await renderCompany()
    const setTaxYear = vi.spyOn(companyApi, 'setTaxYear').mockResolvedValue(rules(2027, 9000))
    expect(within(screen.getByRole('region', { name: 'Regras do ano' })).getByText('8.475,55')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Próximo ano' }))
    expect(await screen.findByText('Sem regras próprias: valem as de 2026.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Regras de 2027' })
    await user.clear(within(dialog).getByLabelText('Teto do INSS'))
    await user.type(within(dialog).getByLabelText('Teto do INSS'), '900000')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(setTaxYear).toHaveBeenCalledWith(2027, {
      inssCeiling: 9000,
      dependentDeduction: 189.59,
      irrfBrackets: [
        { upTo: 2826.65, rate: 0.075, deduction: 182.16 },
        { upTo: null, rate: 0.275, deduction: 908.73 },
      ],
    })
  })

  it('puts the current month in focus, as a forecast while the dollar is unknown', async () => {
    await renderCompany()
    const focus = screen.getByRole('region', { name: 'Mês em foco' })

    expect(within(focus).getByText('Outubro 2026')).toBeInTheDocument()
    expect(within(focus).getByText('previsão')).toBeInTheDocument()
    const steps = within(focus).getAllByRole('listitem')
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('Emitir a nota'),
      expect.stringContaining('Receber o câmbio'),
      expect.stringContaining('Pagar DAS, INSS e IR'),
      expect.stringContaining('Transferir para a conta pessoal'),
    ])
    expect(steps[0]).toHaveTextContent('falta a cotação do dólar')
    // 99% of the invoice is expected in, and the three taxes go out of it.
    expect(steps[1]).toHaveTextContent('R$ 37.064,89')
    expect(steps[3]).toHaveTextContent('R$ 33.066,25')
  })

  it('shows a closed month with what actually came in and what goes to the owner', async () => {
    const { user } = await renderCompany()
    const focus = screen.getByRole('region', { name: 'Mês em foco' })

    await user.click(within(focus).getByRole('button', { name: 'Mês anterior' }))

    expect(within(focus).getByText('Setembro 2026')).toBeInTheDocument()
    const steps = within(focus).getAllByRole('listitem')
    expect(steps[0]).toHaveTextContent('feito')
    expect(steps[1]).toHaveTextContent('R$ 36.334,98')
    const calculation = within(focus).getByRole('group', { name: 'Cálculo do mês' })
    expect(within(calculation).getByText('Entrou no banco').nextSibling).toHaveTextContent('36.334,98')
    expect(within(calculation).getByText('Total para a conta pessoal').nextSibling).toHaveTextContent('32.336,34')
    // The net pay plus what is left of the company's profit.
    expect(within(focus).getByText(/Pró-labore líquido de R\$\s6\.754,84 mais R\$\s25\.581,50 de lucro distribuído/)).toBeInTheDocument()
  })

  it('offers to register the invoice of a month that has none', async () => {
    const { user } = await renderCompany()
    const focus = screen.getByRole('region', { name: 'Mês em foco' })

    await user.click(within(focus).getByRole('button', { name: 'Próximo mês' }))
    expect(within(focus).getByText('Nenhuma invoice lançada neste mês.')).toBeInTheDocument()
    await user.click(within(focus).getByRole('button', { name: 'Lançar invoice' }))

    expect(screen.getByRole('dialog')).toHaveAccessibleName(/novembro de 2026/)
  })

  it('asks for the current month to be prepared before showing the current year', async () => {
    await renderCompany()

    expect(companyApi.prepareCurrentMonth).toHaveBeenCalledTimes(1)
  })

  it('ticks and unticks by hand the steps that the invoice cannot tell', async () => {
    const { user } = await renderCompany()
    const setClosing = vi.spyOn(companyApi, 'setClosing').mockResolvedValue(undefined)
    const focus = screen.getByRole('region', { name: 'Mês em foco' })
    await user.click(within(focus).getByRole('button', { name: 'Mês anterior' }))

    // September has the taxes paid and nothing transferred yet.
    expect(within(focus).getByRole('button', { name: 'Desfazer: Pagar DAS, INSS e IR' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(focus).getByRole('button', { name: 'Marcar como feito: Transferir para a conta pessoal' }))

    expect(setClosing).toHaveBeenCalledWith('2026-09', { taxesPaid: true, transferred: true })
  })

  it('writes the month up for the accountant, to be copied or printed', async () => {
    const { user } = await renderCompany()
    const focus = screen.getByRole('region', { name: 'Mês em foco' })
    await user.click(within(focus).getByRole('button', { name: 'Mês anterior' }))

    await user.click(within(focus).getByRole('button', { name: 'Resumo para a contabilidade' }))

    const dialog = screen.getByRole('dialog', { name: 'Resumo para a contabilidade · setembro de 2026' })
    expect(dialog).toHaveTextContent('Nota fiscal nº.................... 58')
    expect(dialog).toHaveTextContent('Valor da nota (R$)................ 37.439,28')
    expect(dialog).toHaveTextContent('Lucro distribuído (R$)............ 25.581,50')
    expect(dialog).toHaveTextContent('Guias pagas....................... sim')
    await user.click(within(dialog).getByRole('button', { name: 'Copiar texto' }))
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Resumo copiado')
  })
})
