import { act, render, screen } from '@testing-library/react'
import { SLOW_NOTICE_MS, request, resetWakingState } from '../api/client'
import { WakingNotice } from './ui'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetWakingState()
})

describe('WakingNotice', () => {
  it('appears while a call waits for the server and goes away when it answers', async () => {
    vi.useFakeTimers()
    let answer: (response: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))))
    render(<WakingNotice />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    const result = request('GET', '/api/users')
    await act(() => vi.advanceTimersByTimeAsync(SLOW_NOTICE_MS))
    expect(screen.getByRole('status')).toHaveTextContent('Iniciando o sistema, isso pode levar alguns instantes…')

    await act(async () => {
      answer(new Response('[]', { status: 200 }))
      await result
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
