import {
  currentYearMonth,
  formatAmount,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatExchangeRate,
  formatGrowth,
  formatMoney,
  formatMonthLabel,
  formatRate,
  formatWhole,
  shiftMonth,
  todayIso,
  toYearMonth,
} from './format'

describe('formatDateTime', () => {
  it('shows the instant in Brazilian time and format', () => {
    expect(formatDateTime('2026-10-08T15:30:00Z')).toBe('08/10/2026, 12:30')
  })

  it('moves to the previous day when it is still yesterday in Brazil', () => {
    expect(formatDateTime('2026-10-08T01:00:00Z')).toBe('07/10/2026, 22:00')
  })
})

describe('money', () => {
  it('is shown the Brazilian way, with or without the symbol', () => {
    expect(formatMoney(1234.5)).toMatch(/^R\$\s1\.234,50$/)
    expect(formatAmount(1234.5)).toBe('1.234,50')
    expect(formatAmount(-0.5)).toBe('-0,50')
    expect(formatAmount(0)).toBe('0,00')
  })

  it('shows a growth as a signed percentage', () => {
    expect(formatGrowth(0.1234)).toBe('+12,3%')
    expect(formatGrowth(-0.05)).toBe('-5,0%')
    expect(formatGrowth(0)).toBe('0,0%')
  })

  it('shows rates and exchange rates with fixed decimals', () => {
    expect(formatRate(0.096)).toBe('9,60%')
    expect(formatExchangeRate(5.2)).toBe('5,2000')
  })

  it('can be rounded to whole reais', () => {
    expect(formatWhole(1234.5)).toBe('1.235')
    expect(formatWhole(1234.49)).toBe('1.234')
    expect(formatWhole(-0.4)).toBe('0')
  })
})

describe('months', () => {
  it('reads the current month in Brazil, not in the browser time zone', () => {
    expect(currentYearMonth(new Date('2026-11-01T02:00:00Z'))).toEqual({ year: 2026, month: 10 })
    expect(currentYearMonth(new Date('2027-01-01T03:00:00Z'))).toEqual({ year: 2027, month: 1 })
  })

  it('have a label and can be walked through, across years', () => {
    expect(formatMonthLabel('2026-10')).toBe('outubro de 2026')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-05', 0)).toBe('2026-05')
  })

  it('are identified as yyyy-MM', () => {
    expect(toYearMonth(2026, 3)).toBe('2026-03')
    expect(toYearMonth(2026, 12)).toBe('2026-12')
  })
})

describe('dates', () => {
  it('are written the Brazilian way straight from the text', () => {
    expect(formatDate('2026-10-05')).toBe('05/10/2026')
    expect(formatDayMonth('2026-10-05')).toBe('05/10')
  })

  it('know which day it is in Brazil', () => {
    expect(todayIso(new Date('2026-10-09T02:00:00Z'))).toBe('2026-10-08')
  })
})
