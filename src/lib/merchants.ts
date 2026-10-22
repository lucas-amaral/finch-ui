import type { Merchant } from '../api/types'

const INSTALLMENT = /\s*(?:parc(?:ela)?\.?\s*)?\b\d{1,2}\s*(?:\/|\bde\b)\s*\d{1,2}\b\s*$/i

/**
 * The words that identify the merchant in a purchase description, the same way the server compares them:
 * lower case, without accents, punctuation, numbers on their own and the installment ("2/6").
 */
export function merchantKey(description: string): string {
  return description
    .replace(INSTALLMENT, '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word !== '' && !/^\d+$/.test(word))
    .join(' ')
}

/** The merchant whose name is among the words of `description`; the longest name wins ("uber eats" over "uber"). */
export function findMerchant(description: string, merchants: Merchant[]): Merchant | undefined {
  const words = ` ${merchantKey(description)} `
  let found: Merchant | undefined
  for (const merchant of merchants) {
    const key = merchantKey(merchant.name)
    if (key && words.includes(` ${key} `) && (!found || key.length > merchantKey(found.name).length)) found = merchant
  }
  return found
}
