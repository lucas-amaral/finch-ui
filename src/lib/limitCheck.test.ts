import type { CardInvoice, InvoiceItem } from '../api/types'
import { limitCheck } from './limitCheck'

const item = (purchaseDate: string, amount: number, count = 1): InvoiceItem => ({
  purchaseId: 1, description: 'Store', purchaseDate, number: 1, count, amount, categoryId: null, categoryName: null,
})

function invoice(month: string, installments: InvoiceItem[], single: InvoiceItem[]): CardInvoice {
  const sum = (items: InvoiceItem[]) => items.reduce((total, each) => total + each.amount, 0)
  return {
    cardId: 1, month, closingDate: `${month}-10`, dueDate: `${month}-17`,
    total: sum(installments) + sum(single), installmentTotal: sum(installments), singleTotal: sum(single),
    installments, groups: single.length ? [{ categoryId: null, categoryName: null, total: sum(single), items: single }] : [],
    expected: [], expectedTotal: 0,
  }
}

describe('limitCheck', () => {
  // Today is 12 October: the October invoice is closed and due on the 17th; November is the open one.
  const today = '2026-10-12'
  const november = invoice('2026-11', [item('2026-08-01', 800, 3)], [item('2026-10-11', 200), item('2026-11-01', 500.8)])
  const october = invoice('2026-10', [], [item('2026-09-20', 1500)])
  const september = invoice('2026-09', [], [item('2026-08-20', 900)])
  const december = invoice('2026-12', [item('2026-08-01', 800, 3)], [item('2026-12-01', 500.8)])

  it('counts the invoice on screen without what is dated ahead of today', () => {
    const check = limitCheck(november, [], [], today)

    expect(check.counted).toBe(1000)
    expect(check.notYetCharged).toBe(500.8)
  })

  it('always counts an installment, even when it carries a date ahead of today', () => {
    const check = limitCheck(invoice('2026-11', [item('2026-11-01', 300, 3)], [item('2026-11-01', 50)]), [], [], today)

    expect(check.counted).toBe(300)
    expect(check.notYetCharged).toBe(50)
  })

  it('adds the earlier invoices that are closed but not due yet, and no others', () => {
    const check = limitCheck(november, [september, october], [], today)

    expect(check.unpaid).toEqual([october])
    expect(check.expected).toBe(2500)
  })

  it('counts an invoice due today as still unpaid, and one due yesterday as paid', () => {
    expect(limitCheck(november, [october], [], '2026-10-17').unpaid).toEqual([october])
    expect(limitCheck(november, [october], [], '2026-10-18').unpaid).toEqual([])
  })

  it('takes only the installments of the following invoices: single purchases there are forecasts', () => {
    const check = limitCheck(november, [october], [december], today)

    expect(check.nextInstallments).toBe(800)
    expect(check.expected).toBe(3300)
  })
})
