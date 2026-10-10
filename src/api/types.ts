/** Mirrors the JSON of finch-service; change both together. */
export interface User {
  id: number
  name: string
  email: string
  /** ISO instants, e.g. `2026-10-08T15:00:00Z`. */
  createdAt: string
  updatedAt: string
}

export interface UserInput {
  name: string
  email: string
  /** Required when creating; when updating, omit to keep the current password. */
  password?: string
}

export interface LoginResult {
  token: string
  expiresAt: string
  user: User
}

/** Something paid (`EXPENSE`) or received (`INCOME`) month after month. */
export type BudgetKind = 'EXPENSE' | 'INCOME'

/** How the empty months ahead are filled in when forecasts are asked for. */
export type ForecastRule = 'NONE' | 'LAST_VALUE' | 'SAME_MONTH_LAST_YEAR'

/** How the value of a bill behaves: the same every month, different every month, or only now and then. */
export type BudgetNature = 'FIXED' | 'VARIABLE' | 'OCCASIONAL'

export interface BudgetLine {
  id: number
  name: string
  kind: BudgetKind
  groupName: string | null
  dueDay: number | null
  active: boolean
  forecastRule: ForecastRule
  sortOrder: number
  nature: BudgetNature
}

export interface BudgetLineInput {
  name: string
  kind: BudgetKind
  groupName: string | null
  dueDay: number | null
  active: boolean
  forecastRule: ForecastRule
  nature: BudgetNature
}

export interface BudgetEntryInput {
  amount: number
  /** False while the amount is a forecast; true once it was paid or received. */
  settled: boolean
}

export interface BudgetEntry extends BudgetEntryInput {
  lineId: number
}

export interface BudgetYearLine extends Omit<BudgetLine, 'sortOrder' | 'forecastRule'> {
  /** Average of the months that have a value; null when the year has none. */
  average: number | null
}

export interface BudgetMonth {
  /** 1 to 12. */
  month: number
  entries: BudgetEntry[]
  expenseTotal: number
  incomeTotal: number
  balance: number
}

export interface BudgetYear {
  year: number
  lines: BudgetYearLine[]
  months: BudgetMonth[]
  averages: { expenseTotal: number | null; incomeTotal: number | null; balance: number | null }
}

export interface CreditCard {
  id: number
  name: string
  /** Purchases made from this day of the month on go to the next invoice. */
  closingDay: number
  dueDay: number
  /** The bill of the monthly budget that receives the invoice total, if any. */
  budgetLineId: number | null
  active: boolean
  /** `yyyy-MM`: the invoice a purchase made today would fall in. */
  currentInvoiceMonth: string
}

export type CreditCardInput = Omit<CreditCard, 'id' | 'currentInvoiceMonth'>

export interface CardCategory {
  id: number
  name: string
  /** Counts as food in the weekly planning. */
  food: boolean
  sortOrder: number
}

export type CardCategoryInput = Pick<CardCategory, 'name' | 'food'>

export interface CardPurchaseInput {
  description: string
  /** `yyyy-MM-dd`. */
  purchaseDate: string
  /** What the installments registered add up to, not one of them. Negative for a refund. */
  amount: number
  /** How many charges the purchase puts on the invoices. */
  installments: number
  /** Above 1 for a purchase registered when it was already under way: "installment 8 of 10" onwards. */
  firstInstallmentNumber: number
  /** The size of the whole plan; null when the purchase carries it to the end. */
  totalInstallments: number | null
  categoryId: number | null
  /** `yyyy-MM`; null lets the card's closing day decide. */
  firstInvoiceMonth: string | null
}

export interface CardPurchase extends CardPurchaseInput {
  id: number
  cardId: number
  totalInstallments: number
  firstInvoiceMonth: string
}

/** A charge on an invoice: for a split purchase, installment `number` of `count`. */
export interface InvoiceItem {
  purchaseId: number
  description: string
  purchaseDate: string
  number: number
  count: number
  amount: number
  /** Null for a purchase without a category. */
  categoryId: number | null
  categoryName: string | null
}

export interface InvoiceGroup {
  /** Null for the purchases without a category. */
  categoryId: number | null
  categoryName: string | null
  total: number
  items: InvoiceItem[]
}

export interface CardInvoice {
  cardId: number
  month: string
  closingDate: string
  dueDate: string
  total: number
  installmentTotal: number
  singleTotal: number
  /** The charges of purchases split in more than one installment. */
  installments: InvoiceItem[]
  /** The single-payment purchases, by category. */
  groups: InvoiceGroup[]
  /** The recurring charges the invoice still waits for; they are not part of `total`. */
  expected: RecurringCharge[]
  expectedTotal: number
}

/** The summary of the week that goes out by e-mail every Monday. */
export interface WeeklyDigest {
  subject: string
  text: string
}

/** A charge read from the invoice file of a bank, as it would enter the invoice. */
export interface ImportPreviewLine {
  /** `yyyy-MM-dd`. */
  date: string
  description: string
  /** What the invoice shows: for a split purchase, one installment. */
  amount: number
  /** "2" and "6" of "2/6" when the file says the charge is an installment; null otherwise. */
  installmentNumber: number | null
  installmentCount: number | null
  /** The category this description was given most often before; null when it is new. */
  categoryId: number | null
  /** The invoice already has a charge that looks like this one. */
  duplicate: boolean
}

/** What is typed in for something a card charges every month: a streaming service, the gym. */
export interface RecurringChargeInput {
  /** A purchase of the invoice with this description means the charge of the month has arrived. */
  description: string
  amount: number
  /** Day of the month the charge usually shows up. */
  chargeDay: number
  categoryId: number | null
  active: boolean
}

export interface RecurringCharge extends RecurringChargeInput {
  id: number
  cardId: number
}

/** What the invoices of a month (or of a year, added up or averaged) hold, by kind of spending. */
export interface SpendingRow {
  /** Single-payment purchases by category id; a category with nothing spent is absent. */
  byCategory: Record<string, number>
  uncategorized: number
  /** Installments of split purchases, whatever their category. */
  installments: number
  foodTotal: number
  nonFoodTotal: number
  total: number
}

export interface SpendingMonth {
  /** 1 to 12. */
  month: number
  spending: SpendingRow
  /** How much more (or, negative, less) was spent than in the month before. */
  changeFromPrevious: number
}

export interface CardSpendingYear {
  year: number
  /** The categories with something spent in the year, in display order. */
  categories: CardCategory[]
  months: SpendingMonth[]
  total: SpendingRow
  /** Null when nothing was spent in the year. */
  average: SpendingRow | null
}

/** How much may be spent in a week from `validFrom` on, until another budget begins. */
export interface WeeklyBudget {
  id: number
  /** `yyyy-MM-dd`. */
  validFrom: string
  totalAmount: number
  foodAmount: number
}

export type WeeklyBudgetInput = Omit<WeeklyBudget, 'id'>

/** A week, Sunday to Saturday. Budgets and balances are null before the first budget begins. */
export interface PlannedWeek {
  start: string
  end: string
  budgetTotal: number | null
  /** Single-payment purchases made in the week. */
  directSpending: number
  /** The week's share of the month's installments. */
  installmentShare: number
  totalSpending: number
  balance: number | null
  nonFoodSpending: number
  foodBudget: number | null
  foodSpending: number
  foodBalance: number | null
}

export interface WeeklyPlan {
  year: number
  weeks: PlannedWeek[]
}

export interface ComparedYear {
  year: number
  averageExpense: number | null
  averageIncome: number | null
  averageBalance: number | null
  /** Growth over the year before, as a fraction (0.12 is 12%); null when the year before has no average. */
  incomeGrowth: number | null
  expenseGrowth: number | null
}

export interface ComparedLine {
  id: number
  name: string
  kind: BudgetKind
  groupName: string | null
  /** The monthly average of the line in each year, in the order of `years`; null where it has no value. */
  averages: (number | null)[]
}

export interface BudgetComparison {
  years: ComparedYear[]
  lines: ComparedLine[]
}

/** How much money there was at each place in a month. */
export interface BalanceInput {
  checking: number
  savings: number
  company: number
  invested: number
}

export interface BalanceSnapshot extends BalanceInput {
  /** `yyyy-MM`. */
  month: string
  total: number
}

export interface BalanceMonth {
  /** 1 to 12. */
  month: number
  /** Null when nothing was written down for the month. */
  snapshot: BalanceSnapshot | null
  /** How much the total moved since the month before; null unless both months were written down. */
  change: number | null
}

export interface BalanceYear {
  year: number
  months: BalanceMonth[]
}

/** What is typed in for a month of the company. */
export interface CompanyMonthInput {
  invoiceUsd: number
  /** Reais per dollar on the invoice; null while unknown, which makes the month an estimate. */
  exchangeRate: number | null
  /** What actually reached the account in Brazil. */
  receivedBrl: number | null
  invoiceNumber: string | null
}

/** A month of the company with the taxes and the pay worked out. */
export interface CompanyMonth extends CompanyMonthInput {
  /** `yyyy-MM`. */
  month: string
  /** Ticked by hand once the taxes of the month were paid. */
  taxesPaid: boolean
  /** Ticked by hand once what was left of the month went to the owner's account. */
  transferred: boolean
  estimated: boolean
  /** The rate the numbers were worked out with: the typed one, or the last known while estimated. */
  usedExchangeRate: number
  /** The invoice in reais. */
  revenue: number
  grossProLabore: number
  inss: number
  irrf: number
  netProLabore: number
  das: number
  totalTaxes: number
  /** `totalTaxes` over `revenue`, as a fraction. */
  taxRate: number
  revenueLast12Months: number
  effectiveRate: number
  /** Payroll over revenue of the last 12 months, as a fraction; null with nothing behind the month. */
  factorR: number | null
  exchangeVariation: number | null
}

export interface CompanyYear {
  year: number
  /** Only the months that have an invoice, oldest first. */
  months: CompanyMonth[]
}

/** The lines of the monthly budget the company fills in by itself; null leaves that one to be typed. */
export interface CompanyBudgetLink {
  incomeLineId: number | null
  payrollTaxLineId: number | null
  dasLineId: number | null
}

/** The yearly income statement (DRE) of the company, line by line. */
export interface IncomeStatement {
  year: number
  grossRevenue: number
  simplesNacional: number
  netRevenue: number
  proLabore: number
  payrollTaxes: number
  operatingExpenses: number
  exchangeGains: number
  exchangeLosses: number
  result: number
}

export interface DollarQuote {
  /** `yyyy-MM-dd`. */
  date: string
  buyRate: number
}

export interface TaxBracket {
  /** Null on the last bracket, which has no limit. */
  upTo: number | null
  /** A fraction: 0.275 is 27.5%. */
  rate: number
  deduction: number
}

export interface TaxYear {
  year: number
  inssCeiling: number
  dependentDeduction: number
  irrfBrackets: TaxBracket[]
}
