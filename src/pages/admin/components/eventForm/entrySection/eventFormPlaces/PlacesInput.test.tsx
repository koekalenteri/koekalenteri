import { render, screen } from '@testing-library/react'

import { flushPromises, renderWithUserEvents } from '../../../../../../test-utils/utils'

import PlacesInput from './PlacesInput'

describe('PlacesInput', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

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
    const { user } = renderWithUserEvents(<PlacesInput value={123} onChange={onChange} />, undefined, {
      advanceTimers: jest.advanceTimersByTime,
    })

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox')

    await user.clear(input)
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith(0)

    onChange.mockReset()

    await user.type(input, '53')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith(53)
  })
})
