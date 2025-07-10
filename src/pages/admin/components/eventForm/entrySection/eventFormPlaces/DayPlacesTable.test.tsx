import { render, screen } from '@testing-library/react'

import { eventWithStaticDates } from '../../../../../../__mockData__/events'
import { flushPromises, renderWithUserEvents } from '../../../../../../test-utils/utils'

import DayPlacesTable from './DayPlacesTable'

describe('DayPlacesTable', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  const eventWithPlacesPerDay = {
    ...eventWithStaticDates,
    classes: [],
    places: 10,
    placesPerDay: {
      '2021-02-10': 5,
      '2021-02-11': 5,
    },
  }

  it('should render correctly with totalEnabled=true', () => {
    const handleDayPlacesChange = jest.fn()
    const handlePlacesChange = jest.fn()

    const { container } = render(
      <DayPlacesTable
        event={eventWithPlacesPerDay}
        disabled={false}
        handleDayPlacesChange={handleDayPlacesChange}
        handlePlacesChange={handlePlacesChange}
        totalEnabled={true}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render correctly with totalEnabled=false', () => {
    const handleDayPlacesChange = jest.fn()
    const handlePlacesChange = jest.fn()

    const { container } = render(
      <DayPlacesTable
        event={eventWithPlacesPerDay}
        disabled={false}
        handleDayPlacesChange={handleDayPlacesChange}
        handlePlacesChange={handlePlacesChange}
        totalEnabled={false}
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should call handleDayPlacesChange when day places are changed', async () => {
    const handleDayPlacesChange = jest.fn()
    const handlePlacesChange = jest.fn()

    const { user } = renderWithUserEvents(
      <DayPlacesTable
        event={eventWithPlacesPerDay}
        disabled={false}
        handleDayPlacesChange={handleDayPlacesChange}
        handlePlacesChange={handlePlacesChange}
        totalEnabled={false}
      />,
      undefined,
      {
        advanceTimers: jest.advanceTimersByTime,
      }
    )
    await flushPromises()

    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toEqual(3) // 2 days + total

    // Change the first day places
    await user.clear(inputs[0])
    await user.type(inputs[0], '8')
    await flushPromises()

    expect(handleDayPlacesChange).toHaveBeenCalledWith(expect.any(Date), 8)
    expect(handleDayPlacesChange.mock.calls[0][0].toISOString().split('T')[0]).toBe('2021-02-10')
  })

  it('should call handlePlacesChange when total places are changed', async () => {
    const handleDayPlacesChange = jest.fn()
    const handlePlacesChange = jest.fn()

    const { user } = renderWithUserEvents(
      <DayPlacesTable
        event={eventWithPlacesPerDay}
        disabled={false}
        handleDayPlacesChange={handleDayPlacesChange}
        handlePlacesChange={handlePlacesChange}
        totalEnabled={true}
      />,
      undefined,
      {
        advanceTimers: jest.advanceTimersByTime,
      }
    )
    await flushPromises()

    const inputs = screen.getAllByRole('textbox')
    const totalInput = inputs[inputs.length - 1]

    await user.clear(totalInput)
    await user.type(totalInput, '15')
    await flushPromises()

    expect(handlePlacesChange).toHaveBeenCalledWith(15)
  })

  it('should disable day inputs when totalEnabled=true', () => {
    const handleDayPlacesChange = jest.fn()
    const handlePlacesChange = jest.fn()

    render(
      <DayPlacesTable
        event={eventWithPlacesPerDay}
        disabled={false}
        handleDayPlacesChange={handleDayPlacesChange}
        handlePlacesChange={handlePlacesChange}
        totalEnabled={true}
      />
    )

    const inputs = screen.getAllByRole('textbox')
    const [day1, day2, total] = inputs

    // Day inputs should be disabled, total should be enabled
    expect(day1).toBeDisabled()
    expect(day2).toBeDisabled()
    expect(total).toBeEnabled()
  })

  it('should disable total input when totalEnabled=false', () => {
    const handleDayPlacesChange = jest.fn()
    const handlePlacesChange = jest.fn()

    render(
      <DayPlacesTable
        event={eventWithPlacesPerDay}
        disabled={false}
        handleDayPlacesChange={handleDayPlacesChange}
        handlePlacesChange={handlePlacesChange}
        totalEnabled={false}
      />
    )

    const inputs = screen.getAllByRole('textbox')
    const [day1, day2, total] = inputs

    // Day inputs should be enabled, total should be disabled
    expect(day1).toBeEnabled()
    expect(day2).toBeEnabled()
    expect(total).toBeDisabled()
  })
})
