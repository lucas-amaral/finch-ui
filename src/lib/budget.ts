import type { BudgetEntry, BudgetKind, BudgetMonth, BudgetNature, ForecastRule } from '../api/types'

export const KIND_LABELS: Record<BudgetKind, string> = { EXPENSE: 'Conta', INCOME: 'Renda' }

/** How a settled value is called: a bill is paid, an income is received. */
export const SETTLED_LABELS: Record<BudgetKind, string> = { EXPENSE: 'Paga', INCOME: 'Recebida' }

export const FORECAST_LABELS: Record<ForecastRule, string> = {
  LAST_VALUE: 'Repetir o último valor',
  SAME_MONTH_LAST_YEAR: 'Mesmo mês do ano anterior',
  NONE: 'Não prever',
}

/** In the order the screens show them. The occasional bills are the ones summed up as "Extra". */
export const NATURES: BudgetNature[] = ['FIXED', 'VARIABLE', 'OCCASIONAL']

export const NATURE_LABELS: Record<BudgetNature, string> = { FIXED: 'Fixa', VARIABLE: 'Variável', OCCASIONAL: 'Extra' }

export const NATURE_GROUP_LABELS: Record<BudgetNature, string> = { FIXED: 'Fixas', VARIABLE: 'Variáveis', OCCASIONAL: 'Extra' }

export const NATURE_HINTS: Record<BudgetNature, string> = {
  FIXED: 'Fixa: o mesmo valor todo mês',
  VARIABLE: 'Variável: muda todo mês',
  OCCASIONAL: 'Esporádica: só de vez em quando (entra em Extra)',
}

export interface LineGroup<T> {
  groupName: string | null
  lines: T[]
}

/**
 * Puts the lines of the same group side by side, so each group gets one header.
 * Groups keep the order in which they first appear, and so do the lines inside them.
 */
export function groupLines<T extends { groupName: string | null }>(lines: T[]): LineGroup<T>[] {
  const groups: LineGroup<T>[] = []
  for (const line of lines) {
    const group = groups.find((candidate) => candidate.groupName === line.groupName)
    if (group) group.lines.push(line)
    else groups.push({ groupName: line.groupName, lines: [line] })
  }
  return groups
}

/** Where a month stands against today: already over, the one running, or still ahead. */
export type MonthState = 'closed' | 'current' | 'forecast'

export const MONTH_STATE_LABELS: Record<MonthState, string> = { closed: 'Mês fechado', current: 'Mês atual', forecast: 'Projeção' }

export function monthStateOf(year: number, month: number, today: { year: number; month: number }): MonthState {
  const distance = year * 12 + month - (today.year * 12 + today.month)
  return distance < 0 ? 'closed' : distance === 0 ? 'current' : 'forecast'
}

/**
 * How far a value is from what is usual for it: `above` or `below` when it differs from the
 * average by more than `threshold` (a fraction), null when it is close or there is no average.
 */
export function deviationOf(value: number, average: number | null, threshold: number): 'above' | 'below' | null {
  if (!average || average <= 0) return null
  const deviation = (value - average) / average
  return deviation > threshold ? 'above' : deviation < -threshold ? 'below' : null
}

/** The value a line has in a month, if any. */
export function entryOf(month: BudgetMonth, lineId: number): BudgetEntry | undefined {
  return month.entries.find((entry) => entry.lineId === lineId)
}
