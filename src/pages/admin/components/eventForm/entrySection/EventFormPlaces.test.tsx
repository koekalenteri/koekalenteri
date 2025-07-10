import type { PartialEvent } from '../types'

import { render, screen } from '@testing-library/react'

import { eventWithStaticDates, eventWithStaticDatesAndClass } from '../../../../../__mockData__/events'
import { flushPromises, renderWithUserEvents } from '../../../../../test-utils/utils'

import EventFormPlaces from './EventFormPlaces'

jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

describe('EventFormPlaces', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render with minimal information', () => {
    const event: PartialEvent = {
      startDate: new Date('2023-06-14T12:00:00Z'),
      endDate: new Date('2023-06-14T12:00:00Z'),
      classes: [],
      judges: [],
    }

    const { container } = render(<EventFormPlaces event={event} />)
    expect(container).toMatchSnapshot()
  })

  it('should render with classes', () => {
    const { container } = render(<EventFormPlaces event={eventWithStaticDatesAndClass} />)
    expect(container).toMatchSnapshot()
  })

  it('should render with placesPerDay', () => {
    const eventWithPlacesPerDay: PartialEvent = {
      ...eventWithStaticDates,
      classes: [],
      placesPerDay: {
        '2021-02-10': 5,
        '2021-02-11': 5,
      },
    }

    const { container } = render(<EventFormPlaces event={eventWithPlacesPerDay} />)
    expect(container).toMatchSnapshot()
  })

  describe('with classes', () => {
    it('should call onChange', async () => {
      const event = { ...eventWithStaticDatesAndClass }
      const onChange = jest.fn().mockImplementation((props) => {
        Object.assign(event, props)
      })

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: jest.advanceTimersByTime,
      })
      await flushPromises()
      expect(onChange).not.toHaveBeenCalled()

      const check = screen.getByRole('checkbox')
      const inputs: HTMLInputElement[] = screen.getAllByRole('textbox')

      expect(check).not.toBeChecked()
      expect(inputs.length).toEqual(3) // 2 classes + total

      const [class1, class2, total] = inputs
      expect(class1).toBeDisabled()
      expect(class2).toBeDisabled()
      expect(total).toBeEnabled()

      await user.clear(total)
      await user.type(total, '20')
      await flushPromises()
      expect(onChange).toHaveBeenLastCalledWith({ places: 20 })
      expect(class1).toHaveValue('')
      expect(class2).toHaveValue('')
      expect(total).toHaveValue('20')

      await user.click(check)
      await flushPromises()
      expect(check).toBeChecked()
      expect(onChange).toHaveBeenLastCalledWith({
        classes: [expect.objectContaining({ places: 10 }), expect.objectContaining({ places: 10 })],
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      })
      expect(class1).toHaveValue('10')
      expect(class2).toHaveValue('10')
      expect(total).toHaveValue('20')
      expect(class1).toBeEnabled()
      expect(class2).toBeEnabled()
      expect(total).toBeDisabled()
    })
  })

  describe('without classes', () => {
    it('should call onChange with placesPerDay', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 10,
      }
      const onChange = jest.fn().mockImplementation((props) => {
        Object.assign(event, props)
      })

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: jest.advanceTimersByTime,
      })
      await flushPromises()
      expect(onChange).not.toHaveBeenCalled()

      const check = screen.getByRole('checkbox')
      const inputs = screen.getAllByRole('textbox')

      expect(check).not.toBeChecked()
      expect(inputs.length).toEqual(3) // 2 days + total

      const [day1, day2, total] = inputs
      expect(day1).toBeDisabled()
      expect(day2).toBeDisabled()
      expect(total).toBeEnabled()

      await user.clear(total)
      await user.type(total, '20')
      await flushPromises()
      expect(onChange).toHaveBeenLastCalledWith({ places: 20 })
      expect(day1).toHaveValue('0')
      expect(day2).toHaveValue('0')
      expect(total).toHaveValue('20')

      await user.click(check)
      await flushPromises()
      expect(check).toBeChecked()

      // Check that placesPerDay was initialized with even distribution
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: expect.objectContaining({
            '2021-02-10': 10,
            '2021-02-11': 10,
          }),
        })
      )

      // Now we can edit individual days
      await user.clear(day1)
      await user.type(day1, '15')
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: expect.objectContaining({
            '2021-02-10': 15,
            '2021-02-11': 10,
          }),
          places: 25, // Total should be updated
        })
      )
    })
  })
})
