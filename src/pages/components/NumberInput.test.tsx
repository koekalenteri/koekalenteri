import { render, screen } from '@testing-library/react'
import { flushPromises, renderWithUserEvents } from '../../test-utils/utils'
import { NumberInput } from './NumberInput'

describe('PlacesInput', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render with zero', () => {
    const { container } = render(<NumberInput value={0} />)
    expect(container).toMatchSnapshot()
  })

  it('should render with positive number', () => {
    const { container } = render(<NumberInput value={123} />)
    expect(container).toMatchSnapshot()
  })

  it('should rerender with new value', () => {
    const { container, rerender } = render(<NumberInput value={11} />)
    rerender(<NumberInput value={22} />)
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const onChange = jest.fn()
    const { user } = renderWithUserEvents(<NumberInput value={123} onChange={onChange} />, undefined, {
      advanceTimers: jest.advanceTimersByTime,
    })

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox')

    await user.clear(input)
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith(undefined)

    onChange.mockReset()

    await user.type(input, '0')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith(0)

    onChange.mockReset()

    await user.clear(input)
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith(undefined)

    onChange.mockReset()

    await user.type(input, '53')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith(53)
  })
})
