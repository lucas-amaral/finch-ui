import type { CardInvoice } from '../api/types'

/** What the bank should be showing as used limit, piece by piece, as far as Finch knows. */
export interface LimitCheck {
  /** Invoices before the one on screen that are closed but whose due day has not come: still on the limit. */
  unpaid: CardInvoice[]
  /** What the invoice on screen holds that the bank has already seen. */
  counted: number
  /** Single purchases of the invoice on screen dated ahead of today: registered to plan for them, not charged yet. */
  notYetCharged: number
  /** The installments already committed on the following invoices; single purchases there are only forecasts. */
  nextInstallments: number
  expected: number
}

/** Under this, a difference is put down to how each bank rounds the cents of the installments. */
export const CENTS_TOLERANCE = 1

const cents = (value: number) => Math.round(value * 100) / 100

/**
 * Works out the limit that should be in use. `before` and `after` are the invoices around the one
 * on screen; `today` is `yyyy-MM-dd`.
 */
export function limitCheck(invoice: CardInvoice, before: CardInvoice[], after: CardInvoice[], today: string): LimitCheck {
  const unpaid = before.filter((each) => each.total !== 0 && each.dueDate >= today)
  // Only single purchases: an installment is on the limit from the day of the purchase, whatever date it carries.
  const single = invoice.groups.flatMap((group) => group.items)
  const notYetCharged = cents(single.filter((item) => item.purchaseDate > today).reduce((sum, item) => sum + item.amount, 0))
  const counted = cents(invoice.total - notYetCharged)
  const nextInstallments = cents(after.reduce((sum, each) => sum + each.installmentTotal, 0))
  const expected = cents(unpaid.reduce((sum, each) => sum + each.total, 0) + counted + nextInstallments)
  return { unpaid, counted, notYetCharged, nextInstallments, expected }
}
