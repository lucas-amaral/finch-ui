const TIME_ZONE = 'America/Sao_Paulo'

/** An ISO instant shown as date and time in Brazil, whatever the browser's time zone. */
export function formatDateTime(isoInstant: string): string {
  return new Date(isoInstant).toLocaleString('pt-BR', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' })
}

/** `1234.5` → `R$ 1.234,50`. */
export function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** `1234.5` → `1.234,50`: money without the symbol, for tables where every cell is money. */
export function formatAmount(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** `1234.5` → `1.235`: rounded to whole reais, for when the cents only take room. */
export function formatWhole(value: number): string {
  // `|| 0` turns the -0 of a small negative into 0, which would otherwise be written as "-0".
  return (Math.round(value) || 0).toLocaleString('pt-BR')
}

/** `0.096` → `9,60%`: a rate, without a sign. */
export function formatRate(fraction: number): string {
  return `${(fraction * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

/** `5.2` → `5,2000`: an exchange rate, always with its four decimals. */
export function formatExchangeRate(rate: number): string {
  return rate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** `0.1234` → `+12,3%`: a growth, always with its sign. */
export function formatGrowth(fraction: number): string {
  const percent = (fraction * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${fraction > 0 ? '+' : ''}${percent}%`
}

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

/** The year and month (1 to 12) it is now in Brazil, whatever the browser's time zone. */
export function currentYearMonth(now: Date = new Date()): { year: number; month: number } {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now).split('-').map(Number)
  return { year, month }
}

/** `2026-10-05` → `05/10/2026`, without going through Date (no time zone shift). */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

/** `2026-10-05` → `05/10`, for lists where the year is already on screen. */
export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

/** `2026-10` → `outubro de 2026`. */
export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return `${MONTH_NAMES[month - 1].toLowerCase()} de ${year}`
}

/** `('2026-12', 1)` → `2027-01`. */
export function shiftMonth(yearMonth: string, months: number): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const index = year * 12 + (month - 1) + months
  return toYearMonth(Math.floor(index / 12), (index % 12) + 1)
}

/** Today in Brazil as `yyyy-MM-dd`, whatever the browser's time zone. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}

/** `(2026, 3)` → `2026-03`, the way the API identifies a month. */
export function toYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}
