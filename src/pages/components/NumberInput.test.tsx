import { render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { renderWithUserEvents } from '../../test-utils/utils'
import { NumberInput } from './NumberInput'

/** A field whose parent keeps the number it is handed, as the event form does. */
function KeptNumber({ onChange }: { readonly onChange: (value: number | undefined) => void }) {
  const [value, setValue] = useState<number | undefined>(undefined)
  const handleChange = (next: number | undefined) => {
    onChange(next)
    setValue(next)
  }
  return <NumberInput value={value} onChange={handleChange} />
}

describe('PlacesInput', () => {
  it('should render with zero', () => {
    render(<NumberInput value={0} />)
    expect(screen.getByRole('textbox')).toHaveValue('0')
  })

  it('should render with positive number', () => {
    render(<NumberInput value={123} />)
    expect(screen.getByRole('textbox')).toHaveValue('123')
  })

  it('should rerender with new value', () => {
    const { rerender } = render(<NumberInput value={11} />)
    rerender(<NumberInput value={22} />)
    expect(screen.getByRole('textbox')).toHaveValue('22')
  })

  it('should call onChange', async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(<NumberInput value={123} onChange={onChange} />)

    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox')

    await user.clear(input)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(undefined))

    onChange.mockReset()

    await user.type(input, '0')
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(0))

    onChange.mockReset()

    await user.clear(input)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(undefined))

    onChange.mockReset()

    await user.type(input, '53')
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(53))
  })

  // KOE-1483: the number reached the form 100 ms after the last key, so a field changed or Tallenna
  // pressed sooner did not see it.
  it('delivers the typed number at once when the field loses focus', async () => {
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(<KeptNumber onChange={onChange} />)

    await user.type(screen.getByRole('textbox'), '20')
    expect(onChange).not.toHaveBeenCalled()

    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(20)
    expect(screen.getByRole('textbox')).toHaveValue('20')
  })
})
