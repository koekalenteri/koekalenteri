import type { PartialEvent } from '../types'
import { render, screen } from '@testing-library/react'
import {
  eventWithStaticDates,
  eventWithStaticDatesAnd3Classes,
  eventWithStaticDatesAndClass,
} from '../../../../../__mockData__/events'
import { flushPromises, renderWithUserEvents } from '../../../../../test-utils/utils'
import EventFormPlaces from './EventFormPlaces'

vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

// The mocked react-i18next (src/__mocks__/react-i18next) returns the translation key itself,
// so the toggle buttons render with their i18n keys as accessible names in tests.
type Mode = 'total' | 'perDay' | 'perClass'
const modeButton = (mode: Mode) => screen.getByRole('button', { name: `event.placesEditor.${mode}` })
const isPressed = (mode: Mode) => modeButton(mode).getAttribute('aria-pressed') === 'true'

describe('EventFormPlaces', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render with minimal information', () => {
    const event: PartialEvent = {
      classes: [],
      endDate: new Date('2023-06-14T12:00:00Z'),
      judges: [],
      startDate: new Date('2023-06-14T12:00:00Z'),
    }

    const { container } = render(<EventFormPlaces event={event} />)
    expect(container).toMatchSnapshot()
  })

  it('should render with classes but no class places (total mode)', () => {
    const { container } = render(<EventFormPlaces event={eventWithStaticDatesAndClass} />)
    expect(container).toMatchSnapshot()
  })

  it('should render with class places (per-class mode)', () => {
    const event: PartialEvent = {
      ...eventWithStaticDatesAndClass,
      classes: [
        { ...eventWithStaticDatesAndClass.classes[0], places: 5 },
        { ...eventWithStaticDatesAndClass.classes[1], places: 5 },
      ],
    }
    const { container } = render(<EventFormPlaces event={event} />)
    expect(container).toMatchSnapshot()
  })

  it('should render with placesPerDay (per-day mode)', () => {
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

  it('should render a classed event in per-day mode', () => {
    // The gap this redesign closes: a classed event whose capacity is tracked per day
    // (e.g. by judge availability), independent of any class breakdown.
    const event: PartialEvent = {
      ...eventWithStaticDatesAndClass,
      places: 10,
      placesPerDay: { '2021-02-10': 5, '2021-02-11': 5 },
    }
    const { container } = render(<EventFormPlaces event={event} />)
    expect(container).toMatchSnapshot()
  })

  describe('mode inference', () => {
    it('infers total mode when classes have no places and placesPerDay is empty', () => {
      render(<EventFormPlaces event={eventWithStaticDatesAndClass} />)
      expect(isPressed('total')).toBe(true)
    })

    it('infers per-class mode when any class has places', () => {
      const event: PartialEvent = {
        ...eventWithStaticDatesAndClass,
        classes: [{ class: 'ALO', date: new Date('2021-02-10'), places: 10 }],
      }
      render(<EventFormPlaces event={event} />)
      expect(isPressed('perClass')).toBe(true)
    })

    it('infers per-day mode for a classed event with no class places but a placesPerDay value', () => {
      // Regression: events can end up with classes that have no per-class places
      // (classPlaces === 0) while still carrying a placesPerDay value. This must be
      // treated as per-day mode, not per-class mode, so the places count isn't
      // incorrectly corrected to 0.
      const event: PartialEvent = {
        ...eventWithStaticDatesAndClass,
        places: 6,
        placesPerDay: { '2021-02-10': 6 },
      }
      const onChange = vi.fn()

      renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })

      expect(isPressed('perDay')).toBe(true)
      vi.runAllTimers()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('infers per-day mode for a multi-day classed event with no class places but placesPerDay values', () => {
      const event: PartialEvent = {
        ...eventWithStaticDatesAnd3Classes,
        places: 6,
        placesPerDay: { '2021-02-10': 3, '2021-02-11': 3 },
      }
      const onChange = vi.fn()

      renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })

      expect(isPressed('perDay')).toBe(true)
      vi.runAllTimers()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('excludes class-day entries deselected via groups: [] from the class total, correcting stray stored data', async () => {
      // Regression from a real event: a class deselected for a day via the class-groups
      // picker (groups: []) can still carry a stray `places` value from before it was
      // deselected (e.g. left over from an earlier edit). That value must not count
      // toward the event's total places.
      const event: PartialEvent = {
        ...eventWithStaticDatesAndClass,
        classes: [
          { class: 'ALO', date: eventWithStaticDatesAndClass.classes[0].date, groups: ['kp'], places: 5 },
          { class: 'AVO', date: eventWithStaticDatesAndClass.classes[0].date, groups: ['kp'], places: 5 },
          { class: 'VOI', date: eventWithStaticDatesAndClass.classes[0].date, groups: [], places: 3 }, // deselected
          { class: 'VOI', date: eventWithStaticDatesAndClass.classes[1].date, groups: ['kp'], places: 3 },
        ],
        places: 16, // stale stored total that includes the stray 3
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })

      expect(isPressed('perClass')).toBe(true)
      vi.runAllTimers()
      await flushPromises()

      // 5 (ALO) + 5 (AVO) + 3 (VOI, active day only) = 13, not 16
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ places: 13 }))
    })
  })

  describe('mode transitions for classed events', () => {
    it('total -> perClass distributes the current total evenly across classes', async () => {
      const event = { ...eventWithStaticDatesAndClass, places: 20 }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()
      expect(isPressed('total')).toBe(true)

      await user.click(modeButton('perClass'))
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith({
        classes: [expect.objectContaining({ places: 10 }), expect.objectContaining({ places: 10 })],
      })
      expect(isPressed('perClass')).toBe(true)
      expect(screen.getAllByRole('textbox')).toHaveLength(2)
    })

    it('total -> perDay distributes the current total evenly across days and zeroes classes', async () => {
      const event = { ...eventWithStaticDatesAndClass, places: 10 }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()

      await user.click(modeButton('perDay'))
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith({
        classes: [expect.objectContaining({ places: 0 }), expect.objectContaining({ places: 0 })],
        placesPerDay: { '2021-02-10': 5, '2021-02-11': 5 },
      })
    })

    it('perClass -> perDay preserves each day’s already-set total instead of re-splitting evenly', async () => {
      const event = {
        ...eventWithStaticDatesAndClass,
        classes: [
          { ...eventWithStaticDatesAndClass.classes[0], places: 4 },
          { ...eventWithStaticDatesAndClass.classes[1], places: 6 },
        ],
        eventType: 'NOME-A', // not NOME-B, so switching modes isn't locked
        places: 10,
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()
      expect(isPressed('perClass')).toBe(true)

      await user.click(modeButton('perDay'))
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith({
        classes: [expect.objectContaining({ places: 0 }), expect.objectContaining({ places: 0 })],
        placesPerDay: { '2021-02-10': 4, '2021-02-11': 6 },
      })
    })

    it('perDay -> perClass splits each day’s total across that day’s classes, not the grand total across all classes', async () => {
      const event = {
        ...eventWithStaticDatesAnd3Classes, // ALO+AVO on day 1, VOI on day 2
        places: 10,
        placesPerDay: { '2021-02-10': 6, '2021-02-11': 4 },
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()
      expect(isPressed('perDay')).toBe(true)

      await user.click(modeButton('perClass'))
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith({
        classes: [
          expect.objectContaining({ class: 'ALO', places: 3 }),
          expect.objectContaining({ class: 'AVO', places: 3 }),
          expect.objectContaining({ class: 'VOI', places: 4 }),
        ],
      })
    })

    it('perClass -> total zeroes classes and clears placesPerDay', async () => {
      const event = {
        ...eventWithStaticDatesAndClass,
        classes: [
          { ...eventWithStaticDatesAndClass.classes[0], places: 5 },
          { ...eventWithStaticDatesAndClass.classes[1], places: 5 },
        ],
        eventType: 'NOME-A', // not NOME-B, so switching modes isn't locked
        places: 10,
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()
      expect(isPressed('perClass')).toBe(true)

      await user.click(modeButton('total'))
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith({
        classes: [expect.objectContaining({ places: 0 }), expect.objectContaining({ places: 0 })],
        placesPerDay: null,
      })
      expect(screen.getAllByRole('textbox')).toHaveLength(1)
    })

    it('should call handleChange when editing a class place in per-class mode', async () => {
      const event = {
        ...eventWithStaticDatesAndClass,
        classes: [
          { ...eventWithStaticDatesAndClass.classes[0], places: 5 },
          { ...eventWithStaticDatesAndClass.classes[1], places: 5 },
        ],
        places: 10,
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()

      const inputs = screen.getAllByRole('textbox')
      await user.clear(inputs[0])
      await user.type(inputs[0], '15')
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          classes: [expect.objectContaining({ places: 15 }), expect.objectContaining({ places: 5 })],
          places: 20,
        })
      )
    })
  })

  describe('locking per-class mode for saved NOME-B trials', () => {
    it('disables Yhteensä/Päivittäin once a saved NOME-B event has class places', async () => {
      const event = {
        ...eventWithStaticDatesAndClass, // eventType: 'NOME-B', createdAt already set (saved)
        classes: [
          { ...eventWithStaticDatesAndClass.classes[0], places: 5 },
          { ...eventWithStaticDatesAndClass.classes[1], places: 5 },
        ],
        places: 10,
      }
      const onChange = vi.fn()

      renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()

      expect(isPressed('perClass')).toBe(true)
      expect(modeButton('total')).toBeDisabled()
      expect(modeButton('perDay')).toBeDisabled()
      // A disabled MUI ToggleButton refuses pointer interaction entirely, so there's nothing
      // further to exercise here beyond the disabled state itself.
      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not lock an unsaved NOME-B event even with class places already entered', async () => {
      const event = {
        ...eventWithStaticDatesAndClass,
        classes: [
          { ...eventWithStaticDatesAndClass.classes[0], places: 5 },
          { ...eventWithStaticDatesAndClass.classes[1], places: 5 },
        ],
        createdAt: undefined, // never saved yet
        places: 10,
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()

      expect(modeButton('total')).toBeEnabled()

      await user.click(modeButton('total'))
      await flushPromises()
      expect(onChange).toHaveBeenLastCalledWith({
        classes: [expect.objectContaining({ places: 0 }), expect.objectContaining({ places: 0 })],
        placesPerDay: null,
      })
    })

    it('does not lock a saved non-NOME-B event with class places', () => {
      const event = {
        ...eventWithStaticDatesAndClass,
        classes: [
          { ...eventWithStaticDatesAndClass.classes[0], places: 5 },
          { ...eventWithStaticDatesAndClass.classes[1], places: 5 },
        ],
        eventType: 'NOME-A',
        places: 10,
      }

      render(<EventFormPlaces event={event} />)
      expect(modeButton('total')).toBeEnabled()
    })
  })

  describe('without classes', () => {
    it('should call onChange with the total field', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 10,
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()
      expect(onChange).not.toHaveBeenCalled()
      expect(isPressed('total')).toBe(true)

      const [total] = screen.getAllByRole('textbox')
      await user.clear(total)
      await user.type(total, '20')
      await flushPromises()
      expect(onChange).toHaveBeenLastCalledWith({ places: 20 })
    })

    it('total -> perDay initializes placesPerDay with an even distribution', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 25, // uneven, to exercise the remainder distribution
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()
      expect(isPressed('total')).toBe(true)

      await user.click(modeButton('perDay'))
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith({
        placesPerDay: {
          '2021-02-10': 13, // first day gets the remainder
          '2021-02-11': 12,
        },
      })
    })

    it('perDay -> total clears placesPerDay', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 20,
        placesPerDay: { '2021-02-10': 10, '2021-02-11': 10 },
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()
      expect(isPressed('perDay')).toBe(true)

      await user.click(modeButton('total'))
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith({ placesPerDay: null })
    })

    it('should handle setting a day’s places to 0', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 20,
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()
      expect(isPressed('perDay')).toBe(true)

      const [day1] = screen.getAllByRole('textbox')
      await user.clear(day1)
      await user.type(day1, '0')
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          places: 10,
          placesPerDay: { '2021-02-11': 10 },
        })
      )
    })

    it('should fix places count when it drifts from the per-day totals', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 30, // incorrect total
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })

      vi.runAllTimers()
      await flushPromises()

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ places: 20 }))
    })

    it('should update placesPerDay when modifying a day’s places', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 20,
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()

      const [, day2] = screen.getAllByRole('textbox')
      await user.clear(day2)
      await user.type(day2, '15')
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          places: 25,
          placesPerDay: { '2021-02-10': 10, '2021-02-11': 15 },
        })
      )
    })

    it('should clamp invalid inputs for a day’s places', async () => {
      const event = {
        ...eventWithStaticDates,
        classes: [],
        places: 20,
        placesPerDay: {
          '2021-02-10': 10,
          '2021-02-11': 10,
        },
      }
      const onChange = vi.fn().mockImplementation((props) => Object.assign(event, props))

      const { user } = renderWithUserEvents(<EventFormPlaces event={event} onChange={onChange} />, undefined, {
        advanceTimers: vi.advanceTimersByTime,
      })
      await flushPromises()

      const [day1] = screen.getAllByRole('textbox')

      await user.clear(day1)
      await user.type(day1, '-5')
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          places: 10,
          placesPerDay: { '2021-02-11': 10 },
        })
      )

      onChange.mockClear()
      Object.assign(event, {
        places: 20,
        placesPerDay: { '2021-02-10': 10, '2021-02-11': 10 },
      })

      await user.clear(day1)
      await user.type(day1, '250')
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          places: 210,
          placesPerDay: { '2021-02-10': 200, '2021-02-11': 10 },
        })
      )
    })
  })

  describe('with disabled state', () => {
    it('should disable all controls when component is disabled', () => {
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

      for (const name of ['total', 'perDay'] as const) {
        expect(modeButton(name)).toBeDisabled()
      }
      for (const input of screen.getAllByRole('textbox')) {
        expect(input).toBeDisabled()
      }
    })
  })
})
