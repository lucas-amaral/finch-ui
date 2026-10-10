import { request } from './client'
import type {
  BalanceInput,
  BalanceSnapshot,
  BalanceYear,
  BudgetComparison,
  BudgetEntry,
  BudgetEntryInput,
  BudgetLine,
  BudgetLineInput,
  BudgetYear,
  CardCategory,
  CardCategoryInput,
  CardInvoice,
  CardPurchase,
  CardPurchaseInput,
  CardSpendingYear,
  CompanyBudgetLink,
  CompanyMonthInput,
  CompanyYear,
  DollarQuote,
  IncomeStatement,
  TaxYear,
  CreditCard,
  CreditCardInput,
  ImportPreviewLine,
  LoginResult,
  RecurringCharge,
  RecurringChargeInput,
  User,
  UserInput,
  WeeklyBudget,
  WeeklyBudgetInput,
  WeeklyDigest,
  WeeklyPlan,
} from './types'

export const authApi = {
  login: (email: string, password: string) => request<LoginResult>('POST', '/api/auth/login', { email, password }),
  me: () => request<User>('GET', '/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('PUT', '/api/auth/password', { currentPassword, newPassword }),
}

export const usersApi = {
  list: () => request<User[]>('GET', '/api/users'),
  create: (input: UserInput) => request<User>('POST', '/api/users', input),
  update: (id: number, input: UserInput) => request<User>('PUT', `/api/users/${id}`, input),
  remove: (id: number) => request<void>('DELETE', `/api/users/${id}`),
}

export const budgetLinesApi = {
  list: () => request<BudgetLine[]>('GET', '/api/budget-lines'),
  create: (input: BudgetLineInput) => request<BudgetLine>('POST', '/api/budget-lines', input),
  update: (id: number, input: BudgetLineInput) => request<BudgetLine>('PUT', `/api/budget-lines/${id}`, input),
  remove: (id: number) => request<void>('DELETE', `/api/budget-lines/${id}`),
  /** `month` is `yyyy-MM`. Creates the value or replaces the one that is there. */
  setEntry: (lineId: number, month: string, input: BudgetEntryInput) =>
    request<BudgetEntry>('PUT', `/api/budget-lines/${lineId}/entries/${month}`, input),
  clearEntry: (lineId: number, month: string) =>
    request<void>('DELETE', `/api/budget-lines/${lineId}/entries/${month}`),
}

export const budgetYearsApi = {
  get: (year: number) => request<BudgetYear>('GET', `/api/budget-years/${year}`),
  /** Fills the months that are still empty with each line's forecast and returns the year as it became. */
  fillForecasts: (year: number) => request<BudgetYear>('POST', `/api/budget-years/${year}/forecasts`),
}

export const cardsApi = {
  list: () => request<CreditCard[]>('GET', '/api/cards'),
  create: (input: CreditCardInput) => request<CreditCard>('POST', '/api/cards', input),
  update: (id: number, input: CreditCardInput) => request<CreditCard>('PUT', `/api/cards/${id}`, input),
  remove: (id: number) => request<void>('DELETE', `/api/cards/${id}`),
  /** `month` is `yyyy-MM`. */
  invoice: (cardId: number, month: string) => request<CardInvoice>('GET', `/api/cards/${cardId}/invoices/${month}`),
  /** The invoices of several months at once, in the order asked, to look behind and ahead of the one on screen. */
  invoices: (cardId: number, months: string[]) =>
    Promise.all(months.map((month) => request<CardInvoice>('GET', `/api/cards/${cardId}/invoices/${month}`))),
  /** Reads the text of an invoice file and returns its charges, without saving anything. */
  importPreview: (cardId: number, month: string, content: string) =>
    request<ImportPreviewLine[]>('POST', `/api/cards/${cardId}/invoices/${month}/import-preview`, { content }),
  getPurchase: (cardId: number, id: number) => request<CardPurchase>('GET', `/api/cards/${cardId}/purchases/${id}`),
  createPurchase: (cardId: number, input: CardPurchaseInput) =>
    request<CardPurchase>('POST', `/api/cards/${cardId}/purchases`, input),
  updatePurchase: (cardId: number, id: number, input: CardPurchaseInput) =>
    request<CardPurchase>('PUT', `/api/cards/${cardId}/purchases/${id}`, input),
  removePurchase: (cardId: number, id: number) => request<void>('DELETE', `/api/cards/${cardId}/purchases/${id}`),
}

export const recurringChargesApi = {
  list: (cardId: number) => request<RecurringCharge[]>('GET', `/api/cards/${cardId}/recurring-charges`),
  create: (cardId: number, input: RecurringChargeInput) =>
    request<RecurringCharge>('POST', `/api/cards/${cardId}/recurring-charges`, input),
  remove: (cardId: number, id: number) => request<void>('DELETE', `/api/cards/${cardId}/recurring-charges/${id}`),
}

export const cardCategoriesApi = {
  list: () => request<CardCategory[]>('GET', '/api/card-categories'),
  create: (input: CardCategoryInput) => request<CardCategory>('POST', '/api/card-categories', input),
  update: (id: number, input: CardCategoryInput) => request<CardCategory>('PUT', `/api/card-categories/${id}`, input),
  remove: (id: number) => request<void>('DELETE', `/api/card-categories/${id}`),
}

export const cardSpendingApi = {
  /** With `cardId`, only what was spent on that card. */
  get: (year: number, cardId?: number) =>
    request<CardSpendingYear>('GET', `/api/card-spending/${year}${cardId === undefined ? '' : `?cardId=${cardId}`}`),
}

export const weeklyPlanApi = {
  get: (year: number) => request<WeeklyPlan>('GET', `/api/weekly-plans/${year}`),
  listBudgets: () => request<WeeklyBudget[]>('GET', '/api/weekly-budgets'),
  createBudget: (input: WeeklyBudgetInput) => request<WeeklyBudget>('POST', '/api/weekly-budgets', input),
  updateBudget: (id: number, input: WeeklyBudgetInput) => request<WeeklyBudget>('PUT', `/api/weekly-budgets/${id}`, input),
  removeBudget: (id: number) => request<void>('DELETE', `/api/weekly-budgets/${id}`),
}

export const weeklyDigestApi = {
  /** The summary as it would be sent right now. */
  preview: () => request<WeeklyDigest>('GET', '/api/weekly-digest'),
  /** Sends it now to every user; fails with the reason while the server has no mail set up. */
  send: () => request<{ recipients: number }>('POST', '/api/weekly-digest/deliveries'),
}

export const budgetComparisonApi = {
  get: () => request<BudgetComparison>('GET', '/api/budget-comparison'),
}

export const balancesApi = {
  year: (year: number) => request<BalanceYear>('GET', `/api/balance-years/${year}`),
  /** `month` is `yyyy-MM`. Creates the balances of the month or replaces the ones that are there. */
  set: (month: string, input: BalanceInput) => request<BalanceSnapshot>('PUT', `/api/balance-snapshots/${month}`, input),
  clear: (month: string) => request<void>('DELETE', `/api/balance-snapshots/${month}`),
}

export const companyApi = {
  year: (year: number) => request<CompanyYear>('GET', `/api/company-years/${year}`),
  /** `month` is `yyyy-MM`. Creates the invoice of the month or replaces the one that is there. */
  setMonth: (month: string, input: CompanyMonthInput) => request<void>('PUT', `/api/company-months/${month}`, input),
  /** The last steps of closing a month, ticked by hand. Paying the taxes also marks their bills as paid. */
  setClosing: (month: string, closing: { taxesPaid: boolean; transferred: boolean }) =>
    request<void>('PUT', `/api/company-months/${month}/closing`, closing),
  /** Fetches the dollar of the current month when it is still unknown, creating its invoice from the month before. */
  prepareCurrentMonth: () => request<void>('POST', '/api/company-month-preparations'),
  clearMonth: (month: string) => request<void>('DELETE', `/api/company-months/${month}`),
  /** The dollar the invoice of the month must use, from the central bank. */
  invoiceQuote: (month: string) => request<DollarQuote>('GET', `/api/invoice-quotes/${month}`),
  incomeStatement: (year: number) => request<IncomeStatement>('GET', `/api/income-statements/${year}`),
  budgetLink: () => request<CompanyBudgetLink>('GET', '/api/company-budget-link'),
  /** Saving it fills the chosen lines from the current year on. */
  setBudgetLink: (link: CompanyBudgetLink) => request<CompanyBudgetLink>('PUT', '/api/company-budget-link', link),
  taxYears: () => request<TaxYear[]>('GET', '/api/tax-years'),
  setTaxYear: (year: number, input: Omit<TaxYear, 'year'>) => request<TaxYear>('PUT', `/api/tax-years/${year}`, input),
}
