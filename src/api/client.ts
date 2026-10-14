const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')
const TOKEN_KEY = 'finch.token'

/** An error whose message is ready to be shown to the user (the API answers in Portuguese). */
export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string>

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

let onSessionExpired: (() => void) | null = null

/** Registers what to do when the server rejects the stored token. */
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

const FALLBACK_MESSAGES: Record<number, string> = {
  401: 'Sua sessão expirou. Faça login novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Registro não encontrado.',
}

const CONNECTION_MESSAGE = 'Não foi possível conectar ao servidor. Ele pode estar iniciando; tente de novo em instantes.'

// The free hosting puts the back-end to sleep when idle, and it takes a few minutes to wake up: until then the
// request fails without reaching it (or the hosting answers with one of these). The call is retried meanwhile.
const WAKING_STATUSES = new Set([502, 503, 504])
export const RETRY_INTERVAL_MS = 5_000
export const RETRY_LIMIT_MS = 5 * 60_000
/** A call pending this long shows the "starting" notice even before its first retry. */
export const SLOW_NOTICE_MS = 5_000

let waitingCalls = 0
const wakingListeners = new Set<() => void>()

/** Whether some call is waiting for the back-end to wake up (for `useSyncExternalStore`). */
export const wakingStore = {
  subscribe(listener: () => void) {
    wakingListeners.add(listener)
    return () => {
      wakingListeners.delete(listener)
    }
  },
  getSnapshot: () => waitingCalls > 0,
}

function addWaitingCall(delta: number) {
  waitingCalls += delta
  wakingListeners.forEach((listener) => listener())
}

/** True once the back-end answered anything since the page loaded. */
let serverAnswered = false

/** Back to the state of a freshly loaded page; for the tests. */
export function resetWakingState() {
  serverAnswered = false
}

/** `null` when the request didn't get any answer at all. */
async function send(method: string, path: string, body?: unknown): Promise<Response | null> {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  try {
    return await fetch(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return null
  }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // A write is only repeated while the back-end hasn't answered anything yet (it is asleep, so nothing got there).
  // Later on, a write that failed may have been applied, and sending it again could duplicate it.
  const retriable = method === 'GET' || !serverAnswered
  const startedAt = Date.now()
  let noticed = false
  const notice = () => {
    if (noticed) return
    noticed = true
    addWaitingCall(1)
  }
  const slowTimer = setTimeout(notice, SLOW_NOTICE_MS)

  try {
    for (;;) {
      const response = await send(method, path, body)
      if (response && !WAKING_STATUSES.has(response.status)) {
        serverAnswered = true
        return await parse<T>(response, path)
      }
      if (!retriable || Date.now() - startedAt + RETRY_INTERVAL_MS > RETRY_LIMIT_MS) {
        throw new ApiError(response?.status ?? 0, CONNECTION_MESSAGE)
      }
      notice()
      await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS))
    }
  } finally {
    clearTimeout(slowTimer)
    if (noticed) addWaitingCall(-1)
  }
}

async function parse<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    if (response.status === 401 && path !== '/api/auth/login') onSessionExpired?.()
    throw new ApiError(
      response.status,
      problem?.detail ?? FALLBACK_MESSAGES[response.status] ?? 'Ocorreu um erro inesperado. Tente novamente.',
      problem?.errors ?? {},
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.'
}

export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fieldErrors : {}
}
