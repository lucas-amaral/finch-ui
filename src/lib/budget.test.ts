import { deviationOf, groupLines, monthStateOf } from './budget'

const line = (name: string, groupName: string | null) => ({ name, groupName })

describe('groupLines', () => {
  it('gathers the lines of a group even when they are apart, keeping the order of first appearance', () => {
    const groups = groupLines([line('Rent', 'Home'), line('Taxes', 'Company'), line('Power', 'Home'), line('Gym', null)])

    expect(groups).toEqual([
      { groupName: 'Home', lines: [line('Rent', 'Home'), line('Power', 'Home')] },
      { groupName: 'Company', lines: [line('Taxes', 'Company')] },
      { groupName: null, lines: [line('Gym', null)] },
    ])
  })

  it('has no groups when there are no lines', () => {
    expect(groupLines([])).toEqual([])
  })
})

describe('monthStateOf', () => {
  const today = { year: 2026, month: 10 }

  it('tells the months that are over from the current one and from the ones ahead', () => {
    expect(monthStateOf(2026, 9, today)).toBe('closed')
    expect(monthStateOf(2025, 12, today)).toBe('closed')
    expect(monthStateOf(2026, 10, today)).toBe('current')
    expect(monthStateOf(2026, 11, today)).toBe('forecast')
    expect(monthStateOf(2027, 1, today)).toBe('forecast')
  })
})

describe('deviationOf', () => {
  it('flags only what is further from the average than the threshold', () => {
    expect(deviationOf(120, 100, 0.1)).toBe('above')
    expect(deviationOf(80, 100, 0.1)).toBe('below')
    expect(deviationOf(105, 100, 0.1)).toBeNull()
  })

  it('has nothing to say without an average', () => {
    expect(deviationOf(120, null, 0.1)).toBeNull()
    expect(deviationOf(120, 0, 0.1)).toBeNull()
  })
})
