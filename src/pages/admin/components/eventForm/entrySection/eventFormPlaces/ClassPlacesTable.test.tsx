import type { EntryEvent } from '../../types'
import { render, screen } from '@testing-library/react'
import { eventWithStaticDatesAndClass } from '../../../../../../__mockData__/events'
import { flushPromises, renderWithUserEvents } from '../../../../../../test-utils/utils'
import ClassPlacesTable from './ClassPlacesTable'

describe('ClassPlacesTable', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render correctly', () => {
    const handleChange = vi.fn()

    const { container } = render(
      <ClassPlacesTable event={eventWithStaticDatesAndClass} disabled={false} handleChange={handleChange} />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render with disabled=true', () => {
    const handleChange = vi.fn()

    const { container } = render(
      <ClassPlacesTable event={eventWithStaticDatesAndClass} disabled={true} handleChange={handleChange} />
    )
    expect(container).toMatchSnapshot()
  })

  it('should call handleChange when class places are changed', async () => {
    const handleChange = vi.fn()

    const { user } = renderWithUserEvents(
      <ClassPlacesTable event={eventWithStaticDatesAndClass} disabled={false} handleChange={handleChange} />,
      undefined,
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )
    await flushPromises()

    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(2) // 2 classes, total is now a read-only display

    // Change the first class places
    await user.clear(inputs[0])
    await user.type(inputs[0], '15')
    await flushPromises()

    // Verify handleChange was called with the correct class and value
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ class: 'ALO', date: expect.any(Date) }), 15)
  })

  it('should display the computed total, not an editable field', () => {
    const handleChange = vi.fn()
    const event = {
      ...eventWithStaticDatesAndClass,
      classes: [
        { ...eventWithStaticDatesAndClass.classes[0], places: 5 },
        { ...eventWithStaticDatesAndClass.classes[1], places: 7 },
      ],
    }

    render(<ClassPlacesTable event={event} disabled={false} handleChange={handleChange} />)

    // No editable total field anymore, just the class inputs. The grand total (12) is shown
    // twice: once as the single class's column total, once as the overall row total.
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getAllByText('12')).toHaveLength(2)
  })

  it('should not render an input for a class-day entry deselected via groups: []', () => {
    // Regression: a class can be deselected for a specific day via the class-groups picker
    // (groups: []) while still carrying a stray `places` value from before it was
    // deselected. That day's cell must not be editable, and the value must not count
    // toward any total.
    const handleChange = vi.fn()
    const event: EntryEvent = {
      ...eventWithStaticDatesAndClass,
      classes: [
        { ...eventWithStaticDatesAndClass.classes[0], groups: ['kp'], places: 5 },
        { ...eventWithStaticDatesAndClass.classes[1], groups: [], places: 3 }, // deselected
      ],
    }

    render(<ClassPlacesTable event={event} disabled={false} handleChange={handleChange} />)

    // Only the active day gets an editable input
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    // The stray 3 must not surface anywhere: not the deselected day's total, not the
    // class column total, not the grand total
    expect(screen.queryByText('3')).not.toBeInTheDocument()
    // "5" appears three times: the active day's row total, the class column total, and
    // the grand total
    expect(screen.getAllByText('5')).toHaveLength(3)
  })
})
