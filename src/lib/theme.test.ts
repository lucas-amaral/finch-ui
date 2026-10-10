import { act, renderHook } from '@testing-library/react'
import { preferredTheme, useTheme } from './theme'

function systemPrefersDark(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: prefersDark && query.includes('dark') }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

describe('preferredTheme', () => {
  it('follows the system until the user chooses', () => {
    systemPrefersDark(true)
    expect(preferredTheme()).toBe('dark')

    systemPrefersDark(false)
    expect(preferredTheme()).toBe('light')
  })

  it('keeps the stored choice over the system and ignores a stored value it does not know', () => {
    systemPrefersDark(true)
    localStorage.setItem('finch.theme', 'light')
    expect(preferredTheme()).toBe('light')

    localStorage.setItem('finch.theme', 'purple')
    expect(preferredTheme()).toBe('dark')
  })

  it('is light where the browser cannot tell the system preference', () => {
    expect(preferredTheme()).toBe('light')
  })
})

describe('useTheme', () => {
  it('applies the theme to the document and remembers the toggle', () => {
    const { result } = renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('light')

    act(() => result.current.toggle())

    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('finch.theme')).toBe('dark')

    act(() => result.current.toggle())
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
