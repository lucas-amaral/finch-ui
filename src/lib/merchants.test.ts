import { findMerchant, merchantKey } from './merchants'

describe('merchants', () => {
  it('keeps only the words that identify the merchant', () => {
    expect(merchantKey('PADARIA SÃO JOÃO 123')).toBe('padaria sao joao')
    expect(merchantKey('Loja 02/06')).toBe('loja')
    expect(merchantKey('Loja - Parcela 2 de 6')).toBe('loja')
    expect(merchantKey('IFOOD *RESTAURANTE')).toBe('ifood restaurante')
  })

  it('finds the merchant by whole words, the longest name first', () => {
    const uber = { id: 1, name: 'Uber', categoryId: 10 }
    const eats = { id: 2, name: 'Uber Eats', categoryId: 20 }

    expect(findMerchant('UBER *TRIP 12', [uber, eats])).toBe(uber)
    expect(findMerchant('Uber Eats - Pizza', [uber, eats])).toBe(eats)
    expect(findMerchant('SUBERB STORE', [uber, eats])).toBeUndefined()
    expect(findMerchant('', [uber])).toBeUndefined()
  })
})
