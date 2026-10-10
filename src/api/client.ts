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

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // The free hosting sleeps when idle, so the first request of the day can fail like this.
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Ele pode estar iniciando; tente de novo em instantes.')
  }

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
