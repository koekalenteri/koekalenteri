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
      expect(onChange).toHaveBeenLastCalledWith({ places: 20, placesPerDay: {} })
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

    it('should be disabled when classes have places but no classesPerDay', () => {
      const event: PartialEvent = {
        ...eventWithStaticDatesAndClass,
        classes: [{ date: new Date('2021-02-10'), places: 10, class: 'ALO' }],
      }
      render(<EventFormPlaces event={event} />)
      const inputs: HTMLInputElement[] = screen.getAllByRole('textbox')
      const [_class1, total] = inputs
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
      expect(onChange).toHaveBeenLastCalledWith({ places: 20, placesPerDay: {} })
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

    it('should handle setting day places to 0', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 20,
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      }
      const onChange = jest.fn().mockImplementation((props) => {
        Object.assign(event, props)
      })

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: jest.advanceTimersByTime,
      })
      await flushPromises()

      // Checkbox should be checked since placesPerDay is already set
      const check = screen.getByRole('checkbox')
      expect(check).toBeChecked()

      const inputs = screen.getAllByRole('textbox')
      const [day1, _day2, _total] = inputs

      // Clear the first day's places (set to 0)
      await user.clear(day1)
      await user.type(day1, '0')
      await flushPromises()

      // The entry for the first day should be removed from placesPerDay
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: {
            '2021-02-11': 10,
          },
          places: 10, // Total should be updated
        })
      )
    })

    it('should fix places count when totalEnabled is false', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 30, // Incorrect total
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      }
      const onChange = jest.fn().mockImplementation((props) => {
        Object.assign(event, props)
      })

      renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: jest.advanceTimersByTime,
      })

      // The useEffect should fix the places count
      jest.runAllTimers()
      await flushPromises()

      // Total should be corrected to match the sum of placesPerDay
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          places: 20,
        })
      )
    })
  })

  describe('toggling between total and detailed', () => {
    it('should handle toggling between total and detailed multiple times', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 20,
      }
      const onChange = jest.fn().mockImplementation((props) => {
        Object.assign(event, props)
      })

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: jest.advanceTimersByTime,
      })
      await flushPromises()

      const check = screen.getByRole('checkbox')
      expect(check).not.toBeChecked() // Initially in total mode

      // Toggle to detailed mode
      await user.click(check)
      await flushPromises()
      expect(check).toBeChecked()
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: expect.objectContaining({
            '2021-02-10': 10,
            '2021-02-11': 10,
          }),
        })
      )

      // Toggle back to total mode
      await user.click(check)
      await flushPromises()
      expect(check).not.toBeChecked()
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: {},
        })
      )

      // Toggle to detailed mode again
      await user.click(check)
      await flushPromises()
      expect(check).toBeChecked()
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: expect.objectContaining({
            '2021-02-10': 10,
            '2021-02-11': 10,
          }),
        })
      )
    })
  })

  describe('with disabled state', () => {
    it('should disable all inputs when component is disabled', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 20,
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      }

      render(<EventFormPlaces event={event} disabled={true} />)

      // Check that all inputs are disabled
      const check = screen.getByRole('checkbox')
      const inputs = screen.getAllByRole('textbox')

      expect(check).toBeDisabled()
      inputs.forEach((input) => {
        expect(input).toBeDisabled()
      })
    })
  })

  describe('handling placesPerDay modifications', () => {
    it('should update placesPerDay when modifying day places', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 20,
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      }
      const onChange = jest.fn().mockImplementation((props) => {
        Object.assign(event, props)
      })

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: jest.advanceTimersByTime,
      })
      await flushPromises()

      const inputs = screen.getAllByRole('textbox')
      const [_day1, day2, _total] = inputs

      // Modify the second day's places
      await user.clear(day2)
      await user.type(day2, '15')
      await flushPromises()

      // The placesPerDay should be updated and total recalculated
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: {
            '2021-02-10': 10,
            '2021-02-11': 15,
          },
          places: 25, // Total should be updated
        })
      )
    })

    it('should handle invalid inputs for day places', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 20,
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      }
      const onChange = jest.fn().mockImplementation((props) => {
        Object.assign(event, props)
      })

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: jest.advanceTimersByTime,
      })
      await flushPromises()

      const inputs = screen.getAllByRole('textbox')
      const [day1, _day2, _total] = inputs

      // Try to enter a negative value
      await user.clear(day1)
      await user.type(day1, '-5')
      await flushPromises()

      // The value should be clamped to 0 and the entry removed from placesPerDay
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: {
            '2021-02-11': 10,
          },
          places: 10,
        })
      )

      // Reset for next test
      onChange.mockClear()
      Object.assign(event, {
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
        places: 20,
      })

      // Try to enter a value > 200
      await user.clear(day1)
      await user.type(day1, '250')
      await flushPromises()

      // The value should be clamped to 200
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: {
            '2021-02-10': 200,
            '2021-02-11': 10,
          },
          places: 210,
        })
      )
    })

    it('should correctly initialize placesPerDay when toggling to detailed mode', async () => {
      // Test with a multi-day event with uneven places distribution
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 25, // Uneven number to test distribution
      }
      const onChange = jest.fn().mockImplementation((props) => {
        Object.assign(event, props)
      })

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: jest.advanceTimersByTime,
      })
      await flushPromises()

      // Initially in total mode
      const check = screen.getByRole('checkbox')
      expect(check).not.toBeChecked()

      // Toggle to detailed mode
      await user.click(check)
      await flushPromises()

      // Check that placesPerDay was initialized with the correct distribution
      // First day should get the remainder (13 places)
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          placesPerDay: {
            '2021-02-10': 13, // First day gets remainder
            '2021-02-11': 12,
          },
        })
      )
    })
  })
})
