import { closingDateOf, invoiceMonthOf } from './cardInvoice'

describe('card invoices', () => {
  const closesOn10 = { closingDay: 10, dueDay: 17 }
  const closesOn28 = { closingDay: 28, dueDay: 5 }

  it('puts a purchase before the closing day on that invoice, and from the closing day on in the next', () => {
    expect(invoiceMonthOf(closesOn10, '2026-10-09')).toBe('2026-10')
    expect(invoiceMonthOf(closesOn10, '2026-10-10')).toBe('2026-11')
    expect(invoiceMonthOf(closesOn10, '2026-12-15')).toBe('2027-01')
  })

  it('names the invoice after the month it is due, the month after closing when due comes first', () => {
    expect(invoiceMonthOf(closesOn28, '2026-10-27')).toBe('2026-11')
    expect(invoiceMonthOf(closesOn28, '2026-10-28')).toBe('2026-12')
  })

  it('takes the last day of a short month as the closing day', () => {
    const closesOn31 = { closingDay: 31, dueDay: 8 }
    expect(closingDateOf(closesOn31, '2026-03')).toBe('2026-02-28')
    expect(invoiceMonthOf(closesOn31, '2026-02-28')).toBe('2026-04')
  })

  it('tells when an invoice closes', () => {
    expect(closingDateOf(closesOn10, '2026-11')).toBe('2026-11-10')
    expect(closingDateOf(closesOn28, '2026-11')).toBe('2026-10-28')
  })
})
