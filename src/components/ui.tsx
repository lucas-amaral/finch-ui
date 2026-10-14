import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, X } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { wakingStore } from '../api/client'

export function ErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null
  return (
    <div className="banner banner-error" role="alert">
      <CircleAlert size={18} aria-hidden />
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="button button-small" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="banner banner-success" role="status">
      <CircleCheck size={18} aria-hidden />
      <span>{message}</span>
    </div>
  )
}

/** Shown over any screen while a call waits for the back-end to wake up (the call retries by itself). */
export function WakingNotice() {
  const waking = useSyncExternalStore(wakingStore.subscribe, wakingStore.getSnapshot)
  if (!waking) return null
  return (
    <div className="waking-notice" role="status">
      <span className="waking-spinner" aria-hidden="true" />
      Iniciando o sistema, isso pode levar alguns instantes…
    </div>
  )
}

export function Loading() {
  return <p className="muted">Carregando…</p>
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Buttons shown on the right. */
  children?: ReactNode
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}

/** The initials of a person in a circle, e.g. "Ana Maria Souza" → "AS". */
export function Avatar({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = (words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')
  return (
    <span className="avatar" aria-hidden="true">
      {initials.toUpperCase() || '?'}
    </span>
  )
}

interface IconButtonProps {
  /** Read by screen readers and shown as the tooltip. */
  label: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}

export function IconButton({ label, onClick, danger, children }: IconButtonProps) {
  return (
    <button
      type="button"
      className={danger ? 'icon-button icon-button-danger' : 'icon-button'}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

interface FieldProps {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <IconButton label="Fechar" onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  )
}

interface StepperProps {
  /** What is being stepped through, e.g. "Ano"; names the group and the two buttons. */
  label: string
  value: ReactNode
  previousLabel: string
  nextLabel: string
  onPrevious: () => void
  onNext: () => void
  wide?: boolean
}

/** A value with a button on each side to go to the one before and the one after. */
export function Stepper({ label, value, previousLabel, nextLabel, onPrevious, onNext, wide }: StepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="icon-button" onClick={onPrevious} aria-label={previousLabel}>
        <ChevronLeft size={18} aria-hidden />
      </button>
      <span className={wide ? 'stepper-value stepper-wide' : 'stepper-value'}>{value}</span>
      <button type="button" className="icon-button" onClick={onNext} aria-label={nextLabel}>
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  )
}

interface KpiProps {
  label: string
  value: string
  note?: string
  /** Colours the value: good news, a warning, or neither. */
  tone?: 'positive' | 'warning'
}

/** A headline number with what it is and a line of context. */
export function Kpi({ label, value, note, tone }: KpiProps) {
  return (
    <div className="panel kpi">
      <span className="kpi-label">{label}</span>
      <strong className={tone ? `kpi-value ${tone}` : 'kpi-value'}>{value}</strong>
      {note && <span className="kpi-note">{note}</span>}
    </div>
  )
}

interface ToggleProps {
  pressed: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}

/** A button that stays pressed while the option it names is on. */
export function Toggle({ pressed, onClick, title, children }: ToggleProps) {
  return (
    <button type="button" className="button" aria-pressed={pressed} onClick={onClick} title={title}>
      {children}
    </button>
  )
}
