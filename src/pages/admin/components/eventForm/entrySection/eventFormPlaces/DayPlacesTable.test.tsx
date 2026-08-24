import { render, screen } from '@testing-library/react'
import { eventWithStaticDates } from '../../../../../../__mockData__/events'
import { flushPromises, renderWithUserEvents } from '../../../../../../test-utils/utils'
import DayPlacesTable from './DayPlacesTable'

describe('DayPlacesTable', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  const eventWithPlacesPerDay = {
    ...eventWithStaticDates,
    classes: [],
    places: 10,
    placesPerDay: {
      '2021-02-10': 5,
      '2021-02-11': 5,
    },
  }

  it('should render correctly', () => {
    const handleDayPlacesChange = vi.fn()

    const { container } = render(
      <DayPlacesTable event={eventWithPlacesPerDay} disabled={false} handleDayPlacesChange={handleDayPlacesChange} />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render with disabled=true', () => {
    const handleDayPlacesChange = vi.fn()

    const { container } = render(
      <DayPlacesTable event={eventWithPlacesPerDay} disabled={true} handleDayPlacesChange={handleDayPlacesChange} />
    )
    expect(container).toMatchSnapshot()
  })

  it('should call handleDayPlacesChange when day places are changed', async () => {
    let changedDate: Date | undefined
    const handleDayPlacesChange = vi.fn((date) => {
      changedDate = date
    })

    const { user } = renderWithUserEvents(
      <DayPlacesTable event={eventWithPlacesPerDay} disabled={false} handleDayPlacesChange={handleDayPlacesChange} />,
      undefined,
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )
    await flushPromises()

    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(2) // 2 days, total is now a read-only display

    // Change the first day places
    await user.clear(inputs[0])
    await user.type(inputs[0], '8')
    await flushPromises()

    expect(handleDayPlacesChange).toHaveBeenCalledWith(
      expect.objectContaining({ toISOString: expect.any(Function) }),
      8
    )
    expect(changedDate?.toISOString().split('T')[0]).toBe('2021-02-10')
  })

  it('should always render day inputs as enabled', () => {
    const handleDayPlacesChange = vi.fn()

    render(
      <DayPlacesTable event={eventWithPlacesPerDay} disabled={false} handleDayPlacesChange={handleDayPlacesChange} />
    )

    const inputs = screen.getAllByRole('textbox')
    for (const input of inputs) {
      expect(input).toBeEnabled()
    }
  })

  it('should display the computed total, not an editable field', () => {
    const handleDayPlacesChange = vi.fn()

    render(
      <DayPlacesTable event={eventWithPlacesPerDay} disabled={false} handleDayPlacesChange={handleDayPlacesChange} />
    )

    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByText('10')).toBeInTheDocument()
  })
})
