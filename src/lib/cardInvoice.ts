import type { CreditCard } from '../api/types'
import { shiftMonth, toYearMonth } from './format'

/** The same rules as the server's `CreditCard`, to tell on screen where a purchase will fall before it is saved. */
type CardDays = Pick<CreditCard, 'closingDay' | 'dueDay'>

/** Day 31 of a month with 30 days is its last day. `yyyy-MM` → `yyyy-MM-dd`. */
function dayIn(yearMonth: string, day: number): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${yearMonth}-${String(Math.min(day, last)).padStart(2, '0')}`
}

/** Whether the invoice is paid in the month after it closes (closes on the 28th, due on the 5th). */
const dueInFollowingMonth = (card: CardDays) => card.dueDay <= card.closingDay

/** The invoice (`yyyy-MM`, the month it is due) of a purchase made on `date` (`yyyy-MM-dd`). */
export function invoiceMonthOf(card: CardDays, date: string): string {
  const [year, month] = date.split('-').map(Number)
  const purchaseMonth = toYearMonth(year, month)
  const closingMonth = date < dayIn(purchaseMonth, card.closingDay) ? purchaseMonth : shiftMonth(purchaseMonth, 1)
  return dueInFollowingMonth(card) ? shiftMonth(closingMonth, 1) : closingMonth
}

/** The first day whose purchases no longer enter the invoice of `invoiceMonth`: from then on it is closed. */
export function closingDateOf(card: CardDays, invoiceMonth: string): string {
  return dayIn(dueInFollowingMonth(card) ? shiftMonth(invoiceMonth, -1) : invoiceMonth, card.closingDay)
}

/** The day the invoice of `invoiceMonth` is due. */
export function dueDateOf(card: CardDays, invoiceMonth: string): string {
  return dayIn(invoiceMonth, card.dueDay)
}
