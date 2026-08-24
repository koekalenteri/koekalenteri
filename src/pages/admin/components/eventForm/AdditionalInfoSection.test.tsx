import { render, screen } from '@testing-library/react'
import { flushPromises, renderWithUserEvents } from '../../../../test-utils/utils'
import AdditionalInfoSection from './AdditionalInfoSection'

describe('AdditionalInfoSection', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render', () => {
    const changeHandler = vi.fn()
    const { container } = render(<AdditionalInfoSection description="Test!" onChange={changeHandler} open />)
    expect(container).toMatchSnapshot()
  })

  it('should fire onChange', async () => {
    const changeHandler = vi.fn()

    const { user } = renderWithUserEvents(<AdditionalInfoSection onChange={changeHandler} open />, undefined, {
      advanceTimers: vi.advanceTimersByTime,
    })

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('')

    await user.type(input, 'Testing!')

    // typing updates local state immediately, without waiting for the debounced onChange
    expect(input).toHaveValue('Testing!')

    await flushPromises()

    expect(changeHandler).toHaveBeenCalledTimes(1)
    expect(changeHandler).toHaveBeenLastCalledWith({ description: 'Testing!' })
  })
})
