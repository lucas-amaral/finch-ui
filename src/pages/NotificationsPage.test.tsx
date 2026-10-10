import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../api/client'
import { weeklyDigestApi } from '../api/endpoints'
import { renderPage } from '../test/render'
import { NotificationsPage } from './NotificationsPage'

const digest = { subject: 'Finch: sua semana, de 12/10 a 18/10', text: 'VENCE NOS PRÓXIMOS 7 DIAS\n- 15/10 · Rent · R$ 3.200,00' }

async function renderNotifications() {
  vi.spyOn(weeklyDigestApi, 'preview').mockResolvedValue(digest)
  renderPage(<NotificationsPage />)
  const summary = await screen.findByRole('region', { name: 'Resumo da semana' })
  return { summary, user: userEvent.setup() }
}

describe('NotificationsPage', () => {
  it('shows the summary of the week as it would be sent', async () => {
    const { summary } = await renderNotifications()

    expect(within(summary).getByRole('heading', { name: digest.subject })).toBeInTheDocument()
    expect(summary).toHaveTextContent('- 15/10 · Rent · R$ 3.200,00')
  })

  it('sends it right away on request and says to how many people it went', async () => {
    const { user } = await renderNotifications()
    const send = vi.spyOn(weeklyDigestApi, 'send').mockResolvedValue({ recipients: 2 })

    await user.click(screen.getByRole('button', { name: 'Enviar agora' }))

    expect(send).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent('Resumo enviado para 2 usuários.')
  })

  it('explains why it could not be sent', async () => {
    const { user } = await renderNotifications()
    vi.spyOn(weeklyDigestApi, 'send').mockRejectedValue(new ApiError(422, 'O envio de e-mail não está configurado no servidor.', {}))

    await user.click(screen.getByRole('button', { name: 'Enviar agora' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O envio de e-mail não está configurado no servidor.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
