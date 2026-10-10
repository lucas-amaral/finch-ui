import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { errorMessage, fieldErrors } from '../api/client'
import { usersApi } from '../api/endpoints'
import type { User } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Avatar, ErrorBanner, Field, IconButton, Loading, Modal, PageHeader } from '../components/ui'
import { formatDateTime } from '../lib/format'
import { useLoad } from '../lib/useLoad'

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const users = useLoad(() => usersApi.list(), [])
  /** `null` = closed, `'new'` = creating, otherwise the user being edited. */
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(user: User) {
    if (!window.confirm(`Excluir o usuário "${user.name}"?`)) return
    setError(null)
    try {
      await usersApi.remove(user.id)
      users.reload()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <>
      <PageHeader title="Usuários" subtitle="Quem pode entrar no Finch.">
        <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
          <Plus size={18} aria-hidden />
          Novo usuário
        </button>
      </PageHeader>
      <ErrorBanner message={error ?? users.error} onRetry={users.error ? users.reload : undefined} />
      {users.loading && !users.data && <Loading />}
      {users.data && (
        <div className="card table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Criado em</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => {
                const isSelf = user.id === currentUser?.id
                return (
                  <tr key={user.id}>
                    <td>
                      <div className="person">
                        <Avatar name={user.name} />
                        <span className="person-name">{user.name}</span>
                        {isSelf && <span className="chip">Você</span>}
                      </div>
                    </td>
                    <td className="muted">{user.email}</td>
                    <td className="muted">{formatDateTime(user.createdAt)}</td>
                    <td className="row-actions">
                      <IconButton label={`Editar ${user.name}`} onClick={() => setEditing(user)}>
                        <Pencil size={17} aria-hidden />
                      </IconButton>
                      {/* The server refuses it too; hiding the button just avoids the dead end. */}
                      {!isSelf && (
                        <IconButton label={`Excluir ${user.name}`} onClick={() => remove(user)} danger>
                          <Trash2 size={17} aria-hidden />
                        </IconButton>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            users.reload()
          }}
        />
      )}
    </>
  )
}

interface UserFormProps {
  /** `null` when creating. */
  user: User | null
  onClose: () => void
  onSaved: () => void
}

function UserForm({ user, onClose, onSaved }: UserFormProps) {
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setErrors({})
    const input = { name, email, password: password || undefined }
    try {
      if (user) await usersApi.update(user.id, input)
      else await usersApi.create(input)
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setErrors(fieldErrors(caught))
      setSubmitting(false)
    }
  }

  return (
    <Modal title={user ? 'Editar usuário' : 'Novo usuário'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <Field label="Nome" error={errors.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} required autoFocus />
        </Field>
        <Field label="E-mail" error={errors.email} hint="Usado para entrar no sistema.">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
        </Field>
        <Field
          label={user ? 'Nova senha' : 'Senha'}
          error={errors.password}
          hint={user ? 'Deixe em branco para manter a senha atual.' : 'De 8 a 72 caracteres.'}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required={!user}
          />
        </Field>
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button button-primary" disabled={submitting}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  )
}
