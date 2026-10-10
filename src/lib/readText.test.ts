import { readFileText } from './readText'

describe('readFileText', () => {
  it('reads a UTF-8 file as it is', async () => {
    expect(await readFileText(new Blob(['Farmácia;10,00']))).toBe('Farmácia;10,00')
  })

  it('falls back to the Windows encoding when UTF-8 leaves broken characters', async () => {
    // "Farmácia" the way Windows-1252 writes it: the á is the single byte 0xE1.
    const bytes = new Uint8Array([0x46, 0x61, 0x72, 0x6d, 0xe1, 0x63, 0x69, 0x61])

    expect(await readFileText(new Blob([bytes]))).toBe('Farmácia')
  })
})
