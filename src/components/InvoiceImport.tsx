import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { errorMessage } from '../api/client'
import { cardCategoriesApi, cardsApi } from '../api/endpoints'
import type { CardPurchaseInput, CreditCard, ImportPreviewLine } from '../api/types'
import { formatAmount, formatDayMonth, formatMoney, formatMonthLabel } from '../lib/format'
import { readFileText } from '../lib/readText'
import { useLoad } from '../lib/useLoad'
import { ErrorBanner, Loading, Modal } from './ui'

/** A charge of the file with what the user decided about it. */
interface Row {
  line: ImportPreviewLine
  selected: boolean
  /** As the select holds it: the id as text, or empty for no category. */
  categoryId: string
}

/** How a charge of the file becomes a purchase of the invoice of `month`. */
function purchaseOf({ line, categoryId }: Row, month: string): CardPurchaseInput {
  // An installment "2/6" registers the purchase from there on: five charges of the plan of six.
  const split = line.installmentNumber !== null && line.installmentCount !== null
  const remaining = split ? line.installmentCount! - line.installmentNumber! + 1 : 1
  return {
    description: line.description,
    purchaseDate: line.date,
    amount: Math.round(line.amount * remaining * 100) / 100,
    installments: remaining,
    firstInstallmentNumber: split ? line.installmentNumber! : 1,
    totalInstallments: split ? line.installmentCount : null,
    categoryId: categoryId ? Number(categoryId) : null,
    firstInvoiceMonth: month,
  }
}

function noteOf(line: ImportPreviewLine): string {
  if (line.duplicate) return 'já está na fatura'
  if (line.installmentNumber !== null) return `parcela ${line.installmentNumber} de ${line.installmentCount}`
  return line.categoryId === null ? 'primeira vez que aparece' : 'categoria sugerida pelo histórico'
}

interface InvoiceImportProps {
  card: CreditCard
  /** `yyyy-MM`: the invoice the charges go to. */
  month: string
  /** Also called after the purchases were registered. */
  onClose: () => void
}

/**
 * Brings the purchases of an invoice file in: the file is read, each charge comes with a suggested
 * category and a warning when it is already on the invoice, and what stays ticked is registered.
 */
export function InvoiceImport({ card, month, onClose }: InvoiceImportProps) {
  const categories = useLoad(() => cardCategoriesApi.list(), [])
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = (rows ?? []).filter((row) => row.selected)

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setReading(true)
    setError(null)
    setRows(null)
    setFileName(file.name)
    try {
      const lines = await cardsApi.importPreview(card.id, month, await readFileText(file))
      setRows(lines.map((line) => ({ line, selected: !line.duplicate, categoryId: line.categoryId?.toString() ?? '' })))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setReading(false)
    }
  }

  const change = (index: number, patch: Partial<Row>) =>
    setRows((current) => current!.map((row, each) => (each === index ? { ...row, ...patch } : row)))

  async function save() {
    setSaving(true)
    setError(null)
    let done = 0
    try {
      for (const row of chosen) {
        await cardsApi.createPurchase(card.id, purchaseOf(row, month))
        done += 1
      }
      onClose()
    } catch (caught) {
      // What was registered stays; the rows that went through are unticked so a retry does not repeat them.
      const registered = new Set(chosen.slice(0, done))
      setRows((current) => current!.map((row) => (registered.has(row) ? { ...row, selected: false, line: { ...row.line, duplicate: true } } : row)))
      setError(`${done} de ${chosen.length} compras foram lançadas. ${errorMessage(caught)}`)
      setSaving(false)
    }
  }

  return (
    <Modal title={`Importar fatura · ${card.name} · ${formatMonthLabel(month)}`} onClose={onClose}>
      <div className="form import">
        <p className="muted">
          Baixe a fatura no site ou no aplicativo do banco, em CSV ou OFX, e escolha o arquivo aqui. Nada é lançado antes de você conferir.
        </p>
        <label className="field">
          <span className="field-label">Arquivo da fatura</span>
          <input type="file" accept=".csv,.ofx,.txt,text/csv" onChange={pick} disabled={reading || saving} />
        </label>
        <ErrorBanner message={error ?? categories.error} />
        {reading && <Loading />}
        {rows && (
          <>
            <table className="import-table" aria-label={`Compras de ${fileName}`}>
              <thead>
                <tr>
                  <th>Lançar</th>
                  <th>Data</th>
                  <th>Compra</th>
                  <th>Categoria</th>
                  <th className="numeric">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className={row.selected ? undefined : 'import-skipped'}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(event) => change(index, { selected: event.target.checked })}
                        aria-label={`Lançar ${row.line.description}`}
                      />
                    </td>
                    <td className="muted">{formatDayMonth(row.line.date)}</td>
                    <td>
                      <strong>{row.line.description}</strong>
                      <span className={row.line.duplicate || row.line.categoryId === null ? 'import-note warning' : 'import-note muted'}>
                        {noteOf(row.line)}
                      </span>
                    </td>
                    <td>
                      <select
                        value={row.categoryId}
                        onChange={(event) => change(index, { categoryId: event.target.value })}
                        aria-label={`Categoria de ${row.line.description}`}
                      >
                        <option value="">Sem categoria</option>
                        {(categories.data ?? []).map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="numeric">{formatAmount(row.line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="import-summary">
              <span>
                {chosen.length} de {rows.length} compras selecionadas
              </span>
              <strong>{formatMoney(chosen.reduce((sum, row) => sum + row.line.amount, 0))}</strong>
            </p>
          </>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            {rows ? 'Cancelar' : 'Fechar'}
          </button>
          {rows && (
            <button type="button" className="button button-primary" onClick={save} disabled={saving || chosen.length === 0}>
              Lançar {chosen.length} {chosen.length === 1 ? 'compra' : 'compras'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
