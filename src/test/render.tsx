import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { tokenStore } from '../api/client'
import { authApi } from '../api/endpoints'
import type { User } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'

export const ana: User = {
  id: 1,
  name: 'Ana',
  email: 'ana@example.com',
  createdAt: '2026-10-08T15:30:00Z',
  updatedAt: '2026-10-08T15:30:00Z',
}

/**
 * Renders a page inside the router and the session, as App does.
 * With `loggedAs`, the session starts with that user (the `me` call is answered here);
 * without it, nobody is logged in.
 */
export function renderPage(page: ReactElement, { loggedAs }: { loggedAs?: User } = {}) {
  if (loggedAs) {
    tokenStore.set('test-token')
    vi.spyOn(authApi, 'me').mockResolvedValue(loggedAs)
  }
  return render(
    <AuthProvider>
      <MemoryRouter>{page}</MemoryRouter>
    </AuthProvider>,
  )
}
