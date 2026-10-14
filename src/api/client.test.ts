import {
  ApiError,
  RETRY_INTERVAL_MS,
  RETRY_LIMIT_MS,
  SLOW_NOTICE_MS,
  errorMessage,
  fieldErrors,
  request,
  resetWakingState,
  setSessionExpiredHandler,
  tokenStore,
  wakingStore,
} from './client'

function respondWith(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setSessionExpiredHandler(null)
  resetWakingState()
})

describe('request', () => {
  it('sends the body as JSON and the stored token, and returns the parsed answer', async () => {
    tokenStore.set('abc')
    const fetchMock = respondWith(200, { id: 1 })

    const result = await request<{ id: number }>('POST', '/api/users', { name: 'Ana' })

    expect(result).toEqual({ id: 1 })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/api/users', {
      method: 'POST',
      headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
      body: '{"name":"Ana"}',
    })
  })

  it('sends neither token nor content type when there is no token and no body', async () => {
    const fetchMock = respondWith(200, [])

    await request('GET', '/api/users')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/api/users', {
      method: 'GET',
      headers: {},
      body: undefined,
    })
  })

  it('returns nothing for a 204', async () => {
    respondWith(204)

    await expect(request('DELETE', '/api/users/1')).resolves.toBeUndefined()
  })

  it('turns a ProblemDetail into an ApiError with the server message and the field errors', async () => {
    respondWith(400, { detail: 'Um ou mais campos são inválidos.', errors: { name: 'Informe o nome.' } })

    const error = await request('POST', '/api/users', {}).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect(errorMessage(error)).toBe('Um ou mais campos são inválidos.')
    expect(fieldErrors(error)).toEqual({ name: 'Informe o nome.' })
  })

  it('falls back to a message of its own when the error has no readable body', async () => {
    respondWith(404)
    await expect(request('GET', '/api/users/9')).rejects.toThrow('Registro não encontrado.')

    respondWith(500)
    await expect(request('GET', '/api/users')).rejects.toThrow('Ocorreu um erro inesperado. Tente novamente.')
  })

  it('ends the session on a 401, except when the 401 is the login itself', async () => {
    const onExpired = vi.fn()
    setSessionExpiredHandler(onExpired)
    respondWith(401, { detail: 'E-mail ou senha inválidos.' })

    await expect(request('POST', '/api/auth/login', {})).rejects.toThrow('E-mail ou senha inválidos.')
    expect(onExpired).not.toHaveBeenCalled()

    await expect(request('GET', '/api/users')).rejects.toBeInstanceOf(ApiError)
    expect(onExpired).toHaveBeenCalledOnce()
  })

  it('explains that the server may be waking up when it never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = request('GET', '/api/users').catch((caught: unknown) => caught)
    await vi.advanceTimersByTimeAsync(RETRY_LIMIT_MS)

    expect(errorMessage(await result)).toMatch(/Não foi possível conectar ao servidor/)
  })
})

describe('request while the server wakes up', () => {
  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
  const asleep = () => new Response('<html>loading</html>', { status: 503 })

  beforeEach(() => vi.useFakeTimers())

  it('tries again until the server answers, showing the notice meanwhile', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(asleep())
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)

    const result = request('GET', '/api/users')
    await vi.advanceTimersByTimeAsync(0)
    expect(wakingStore.getSnapshot()).toBe(true)

    await vi.advanceTimersByTimeAsync(2 * RETRY_INTERVAL_MS)
    await expect(result).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(wakingStore.getSnapshot()).toBe(false)
  })

  it('also retries a write while the server has not answered anything yet, like the login', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)

    const result = request('POST', '/api/auth/login', {})
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS)

    await expect(result).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not repeat a write once the server has answered, so nothing is saved twice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok()).mockRejectedValue(new TypeError('Failed to fetch')))
    await request('GET', '/api/users')

    const fetchMock = vi.mocked(fetch)
    await expect(request('POST', '/api/users', {})).rejects.toThrow(/Não foi possível conectar ao servidor/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wakingStore.getSnapshot()).toBe(false)
  })

  it('shows the notice for a call that is merely slow, and hides it when it ends', async () => {
    let answer: (response: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))))

    const result = request('GET', '/api/users')
    await vi.advanceTimersByTimeAsync(SLOW_NOTICE_MS - 1)
    expect(wakingStore.getSnapshot()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(wakingStore.getSnapshot()).toBe(true)

    answer(ok())
    await result
    expect(wakingStore.getSnapshot()).toBe(false)
  })
})

describe('error helpers', () => {
  it('have safe answers for things that are not ApiError', () => {
    expect(errorMessage('boom')).toBe('Ocorreu um erro inesperado. Tente novamente.')
    expect(fieldErrors(new Error('boom'))).toEqual({})
  })
})
