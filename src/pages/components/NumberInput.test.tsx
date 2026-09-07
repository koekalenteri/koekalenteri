import { render, screen, waitFor } from '@testing-library/react'
import { renderWithUserEvents } from '../../test-utils/utils'
import { NumberInput } from './NumberInput'

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
})
