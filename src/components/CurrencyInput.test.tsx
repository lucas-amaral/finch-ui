import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CurrencyInput } from './CurrencyInput'

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <CurrencyInput aria-label="Valor" value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  )
}

describe('CurrencyInput', () => {
  it('fills the digits in from the right and hands over a plain decimal', async () => {
    render(<Harness />)

    await userEvent.setup().type(screen.getByLabelText('Valor'), '123456')

    expect(screen.getByLabelText('Valor')).toHaveValue('1.234,56')
    expect(screen.getByRole('status')).toHaveTextContent('1234.56')
  })

  it('ignores what is not a digit and becomes empty when everything is erased', async () => {
    render(<Harness initial="5.00" />)
    const input = screen.getByLabelText('Valor')
    expect(input).toHaveValue('5,00')
    const user = userEvent.setup()

    await user.type(input, 'a')
    expect(input).toHaveValue('5,00')

    await user.clear(input)
    expect(input).toHaveValue('')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
