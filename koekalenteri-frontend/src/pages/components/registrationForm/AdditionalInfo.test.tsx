import { render, screen } from '@testing-library/react'

import { renderWithUserEvents, waitForDebounce } from '../../../test-utils/utils'

import { AdditionalInfo } from './AdditionalInfo'

describe('PlacesInput', () => {
  it('should render with minimal info', () => {
    const { container } = render(<AdditionalInfo />)
    expect(container).toMatchSnapshot()
  })

  it('should render with text', () => {
    const { container } = render(<AdditionalInfo notes="test" />)
    expect(container).toMatchSnapshot()
  })

  it('should rerender with new value', () => {
    const { container, rerender } = render(<AdditionalInfo notes="test a" />)
    rerender(<AdditionalInfo notes="changed notes" />)
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const onChange = jest.fn()
    const { user } = renderWithUserEvents(<AdditionalInfo notes="test" onChange={onChange} />)

    await waitForDebounce()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox')

    await user.clear(input)
    await waitForDebounce()
    expect(onChange).toHaveBeenLastCalledWith({ notes: '' })
    expect(onChange).toHaveBeenCalledTimes(1)

    onChange.mockReset()

    await user.type(input, 'testing notes')
    await waitForDebounce()
    expect(onChange).toHaveBeenLastCalledWith({ notes: 'testing notes' })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
