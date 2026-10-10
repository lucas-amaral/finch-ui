import { Send } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../api/client'
import { weeklyDigestApi } from '../api/endpoints'
import { ErrorBanner, Loading, PageHeader, SuccessBanner } from '../components/ui'
import { useLoad } from '../lib/useLoad'

/** What the system tells the users by itself: for now, the summary of the week by e-mail. */
export function NotificationsPage() {
  const digest = useLoad(() => weeklyDigestApi.preview(), [])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<number | null>(null)

  async function send() {
    setSending(true)
    setError(null)
    setSentTo(null)
    try {
      setSentTo((await weeklyDigestApi.send()).recipients)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Avisos"
        subtitle="Toda segunda de manhã, cada usuário recebe por e-mail o resumo abaixo: o que vence na semana, como foi a semana passada no cartão e como está o mês."
      >
        <button type="button" className="button button-primary" onClick={send} disabled={sending || !digest.data}>
          <Send size={16} aria-hidden />
          Enviar agora
        </button>
      </PageHeader>
      <ErrorBanner message={error ?? digest.error} onRetry={digest.error ? digest.reload : undefined} />
      {sentTo !== null && (
        <SuccessBanner message={sentTo === 1 ? 'Resumo enviado para 1 usuário.' : `Resumo enviado para ${sentTo} usuários.`} />
      )}
      {digest.loading && !digest.data && <Loading />}
      {digest.data && (
        <section className="panel narrow-card" aria-label="Resumo da semana">
          <header className="panel-header">
            <h2>{digest.data.subject}</h2>
          </header>
          <pre className="summary-text digest-text">{digest.data.text}</pre>
        </section>
      )}
    </>
  )
}
