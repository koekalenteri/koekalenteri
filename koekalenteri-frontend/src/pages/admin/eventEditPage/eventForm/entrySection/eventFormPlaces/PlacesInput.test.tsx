import { render, screen } from '@testing-library/react'

import { renderWithUserEvents, waitForDebounce } from '../../../../../../test-utils/utils'

import PlacesInput from './PlacesInput'

describe('PlacesInput', () => {
  it('should render with zero', () => {
    const { container } = render(<PlacesInput value={0} />)
    expect(container).toMatchSnapshot()
  })

  it('should render with positive number', () => {
    const { container } = render(<PlacesInput value={123} />)
    expect(container).toMatchSnapshot()
  })

  it('should rerender with new value', () => {
    const { container, rerender } = render(<PlacesInput value={11} />)
    rerender(<PlacesInput value={22} />)
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const onChange = jest.fn()
    const { user } = renderWithUserEvents(<PlacesInput value={123} onChange={onChange} />)

    await waitForDebounce()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox')

    await user.clear(input)
    await waitForDebounce()
    expect(onChange).toHaveBeenLastCalledWith(0)

    onChange.mockReset()

    await user.type(input, '53')
    await waitForDebounce()
    expect(onChange).toHaveBeenLastCalledWith(53)
  })
})
