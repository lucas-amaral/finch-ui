import type { InputHTMLAttributes } from 'react'

interface CurrencyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  /** Plain decimal text such as `1234.50`, or empty. */
  value: string
  onChange: (value: string) => void
}

// NUMERIC(15,2) holds 13 digits before the decimal point.
const MAX_DIGITS = 15

/**
 * Money field typed like a bank app: digits fill in from the right, so `123456` shows as `1.234,56`.
 * The value handed to the form stays a plain decimal string (`1234.56`).
 */
export function CurrencyInput({ value, onChange, ...rest }: CurrencyInputProps) {
  const display =
    value === '' ? '' : Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  function change(text: string) {
    const digits = text.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS)
    onChange(digits === '' ? '' : (Number(digits) / 100).toFixed(2))
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      className="numeric"
      value={display}
      onChange={(event) => change(event.target.value)}
      placeholder="0,00"
    />
  )
}
