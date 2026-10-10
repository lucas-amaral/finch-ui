import { useState } from 'react'
import type { FormEvent } from 'react'
import { errorMessage, fieldErrors } from '../api/client'
import { authApi } from '../api/endpoints'
import { ErrorBanner, Field, PageHeader, SuccessBanner } from '../components/ui'

export function PasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    setError(null)
    setErrors({})
    if (newPassword !== confirmation) {
      setErrors({ confirmation: 'A confirmação não confere com a nova senha.' })
      return
    }
    setSubmitting(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setSaved(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
    } catch (caught) {
      setError(errorMessage(caught))
      setErrors(fieldErrors(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Alterar senha" subtitle="A nova senha vale a partir do próximo login." />
      <form className="card form narrow" onSubmit={submit}>
        <ErrorBanner message={error} />
        {saved && <SuccessBanner message="Senha alterada." />}
        <Field label="Senha atual" error={errors.currentPassword}>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="Nova senha" error={errors.newPassword} hint="De 8 a 72 caracteres.">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
        </Field>
        <Field label="Confirmar nova senha" error={errors.confirmation}>
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={submitting}>
            Salvar
          </button>
        </div>
      </form>
    </>
  )
}
