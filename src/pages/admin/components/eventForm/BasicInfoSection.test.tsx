import type { Props } from './BasicInfoSection'
import type { PartialEvent } from './types'
import { TZDate } from '@date-fns/tz'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { screen, waitFor } from '@testing-library/react'
import { add } from 'date-fns'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { locales } from '@/i18n'
import { formatDate } from '@/i18n/dates'
import { TIME_ZONE } from '@/lib/day'
import { defaultEntryEndDate, defaultEntryStartDate } from '@/lib/event'
import { idTokenAtom } from '@/pages/state'
import { endOfFinnishDay, finnishDayOf, startOfFinnishDay } from '@/test-utils/finnishDays'
import { describeInTimeZone } from '@/test-utils/timeZone'
import { renderWithUserEvents } from '@/test-utils/utils'
import BasicInfoSection from './BasicInfoSection'

const renderComponent = (props: Props) => {
  const res = renderWithUserEvents(
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <Provider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
        <BasicInfoSection {...props} />
      </Provider>
    </LocalizationProvider>,
    undefined
  )

  const inputs = screen.getAllByRole('group')
  const buttons = screen.getAllByTestId('CalendarIcon')
  return { ...res, endCalendar: buttons[1], endInput: inputs[1], startCalendar: buttons[0], startInput: inputs[0] }
}

/** A Saturday far ahead, as the form offers for a new event. */
const newEventStartDate = startOfFinnishDay('2099-06-06')

describe('BasicInfoSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render', () => {
    const testEvent = {
      classes: [],
      description: 'Test!',
      endDate: new TZDate('2022-06-02', TIME_ZONE),
      id: 'test',
      judges: [],
      startDate: new TZDate('2022-06-01', TIME_ZONE),
    }
    const changeHandler = vi.fn()
    renderComponent({ event: testEvent, onChange: changeHandler, open: true })
    expect(screen.getByLabelText('event.name (locale.fi)')).toBeInTheDocument()
  })

  describe('the secretary field (KOE-1473)', () => {
    const baseEvent = {
      classes: [],
      description: '',
      endDate: new TZDate('2022-06-02', TIME_ZONE),
      id: 'test',
      judges: [],
      startDate: new TZDate('2022-06-01', TIME_ZONE),
    }
    const minsu = { email: 'minsu@example.com', id: 'u1', name: 'Minsu Rauramo', roles: { org1: 'secretary' as const } }

    it('tells to choose the organizer first while there is none, under the field and in the empty list', async () => {
      const { user } = renderComponent({ event: baseEvent, open: true, secretaries: [] })

      expect(screen.getByText('event.secretaryRequiresOrganizer')).toBeInTheDocument()

      await user.type(screen.getByLabelText('event.secretary'), 'minsu')
      expect(screen.getByRole('presentation')).toHaveTextContent('event.secretaryRequiresOrganizer')
    })

    it('offers the members once the organizer is chosen, without the guidance', async () => {
      const event = { ...baseEvent, organizer: { id: 'org1', name: 'Yhdistys' } }
      const { user } = renderComponent({ event, open: true, secretaries: [minsu] })

      expect(screen.queryByText('event.secretaryRequiresOrganizer')).not.toBeInTheDocument()

      await user.type(screen.getByLabelText('event.secretary'), 'minsu')
      expect(screen.getByRole('option', { name: 'Minsu Rauramo' })).toBeInTheDocument()
    })

    it('shows the validation message, not the guidance, when the field is disabled', () => {
      renderComponent({ disabled: true, event: baseEvent, open: true, secretaries: [] })

      expect(screen.queryByText('event.secretaryRequiresOrganizer')).not.toBeInTheDocument()
    })
  })

  describe('interactions', () => {
    it('marks a NOWT as a Mock trial and drops its ALO classes (KOE-308)', async () => {
      const testEvent: PartialEvent = {
        classes: [
          { class: 'ALO', date: newEventStartDate },
          { class: 'AVO', date: newEventStartDate },
        ],
        endDate: newEventStartDate,
        eventType: 'NOWT',
        judges: [],
        startDate: newEventStartDate,
      }
      const changeHandler = vi.fn()
      const { user } = renderComponent({
        event: testEvent,
        eventTypeClasses: { NOWT: ['ALO', 'AVO', 'VOI'] },
        onChange: changeHandler,
        open: true,
      })

      await user.click(screen.getByRole('checkbox', { name: 'event.mockTrial' }))

      expect(changeHandler).toHaveBeenCalledTimes(1)
      expect(changeHandler).toHaveBeenCalledWith({
        classes: [{ class: 'AVO', date: newEventStartDate }],
        mockTrial: true,
      })
    })

    it('keeps the classes when the Mock trial mark comes off', async () => {
      const testEvent: PartialEvent = {
        classes: [{ class: 'AVO', date: newEventStartDate }],
        endDate: newEventStartDate,
        eventType: 'NOWT',
        judges: [],
        mockTrial: true,
        startDate: newEventStartDate,
      }
      const changeHandler = vi.fn()
      const { user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      await user.click(screen.getByRole('checkbox', { name: 'event.mockTrial' }))

      expect(changeHandler).toHaveBeenCalledWith({ classes: testEvent.classes, mockTrial: false })
    })

    it.each([
      ['a new trial becomes a B-trial with game', undefined, undefined, 'NOME-B', 'game'],
      ['a B-trial keeps its choice in the championship', 'NOME-B', 'dummies' as const, 'NOME-B SM', 'dummies'],
      ['a B-trial without the choice gets game in the championship', 'NOME-B', undefined, 'NOME-B SM', 'game'],
      ['a trial that is no B-trial drops the choice', 'NOME-B', 'dummies' as const, 'NOU', null],
    ])('%s (KOE-1570)', async (_name, eventType, stored, picked, retrieveType) => {
      const testEvent: PartialEvent = {
        classes: [],
        endDate: newEventStartDate,
        eventType,
        judges: [],
        retrieveType: stored,
        startDate: newEventStartDate,
      }
      const changeHandler = vi.fn()
      const { user } = renderComponent({
        event: testEvent,
        eventTypes: ['NOME-B', 'NOME-B SM', 'NOU'],
        onChange: changeHandler,
        open: true,
      })

      await user.click(screen.getByRole('combobox', { name: 'event.eventType' }))
      await user.click(screen.getByRole('option', { name: picked }))

      expect(changeHandler).toHaveBeenCalledWith(expect.objectContaining({ eventType: picked, retrieveType }))
    })

    it('has no Mock trial mark for the other event types', () => {
      const testEvent: PartialEvent = {
        classes: [],
        endDate: newEventStartDate,
        eventType: 'NOME-B',
        judges: [],
        startDate: newEventStartDate,
      }
      renderComponent({ event: testEvent, open: true })

      expect(screen.queryByRole('checkbox', { name: 'event.mockTrial' })).toBeNull()
    })

    it('should fire onChange with the translations map for a translated name', async () => {
      // KOE-1263: the name can also be given in the other app languages.
      const testEvent: PartialEvent = {
        classes: [],
        endDate: newEventStartDate,
        judges: [],
        name: 'Nimi',
        startDate: newEventStartDate,
      }
      const changeHandler = vi.fn()
      const { user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      const input = screen.getByLabelText<HTMLInputElement>('event.name (locale.en)')
      expect(input).toHaveValue('')

      await user.type(input, 'In English')
      await waitFor(() => expect(changeHandler).toHaveBeenCalledTimes(1))

      expect(changeHandler).toHaveBeenCalledWith({ names: { en: 'In English' } })
    })

    it('should update entry dates when event start date changes and entry dates are the defaults', async () => {
      const testEvent: PartialEvent = {
        classes: [],
        endDate: newEventStartDate,
        entryEndDate: defaultEntryEndDate(newEventStartDate),
        entryStartDate: defaultEntryStartDate(newEventStartDate),
        judges: [],
        startDate: newEventStartDate,
      }
      const otherDate = add(newEventStartDate, { days: 1 })
      const otherDateString = formatDate(otherDate, 'dd.MM.yyyy')
      const changeHandler = vi.fn()
      const { startInput, user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      expect(changeHandler).not.toHaveBeenCalled()

      // The picker field is a group of per-section spinbuttons, so the date is pasted into the
      // first section rather than typed through the separators.
      const startDay = startInput.querySelector<HTMLElement>('[role="spinbutton"]')
      if (!startDay) throw new Error('Start date day section not found')
      await user.click(startDay)
      await user.keyboard('{Control>}a{/Control}')
      await user.paste(otherDateString)
      await waitFor(() => expect(changeHandler).toHaveBeenCalledTimes(1))
      expect(changeHandler).toHaveBeenCalledWith({
        classes: [],
        endDate: otherDate,
        entryEndDate: defaultEntryEndDate(otherDate),
        entryStartDate: defaultEntryStartDate(otherDate),
        startDate: otherDate,
      })
    })

    it('should not update entry dates when event start date changes and entry dates are not the defaults', async () => {
      const customEntryEndDate = add(defaultEntryEndDate(newEventStartDate), { days: 7 })
      const customEntryStartDate = add(defaultEntryStartDate(newEventStartDate), { days: 7 })
      const testEvent: PartialEvent = {
        classes: [],
        endDate: newEventStartDate,
        entryEndDate: customEntryEndDate,
        entryStartDate: customEntryStartDate,
        judges: [],
        startDate: newEventStartDate,
      }
      const otherDate = add(newEventStartDate, { days: 1 })
      const otherDateString = formatDate(otherDate, 'dd.MM.yyyy')
      const changeHandler = vi.fn()
      const { startInput, user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      expect(changeHandler).not.toHaveBeenCalled()

      // The picker field is a group of per-section spinbuttons, so the date is pasted into the
      // first section rather than typed through the separators.
      const startDay = startInput.querySelector<HTMLElement>('[role="spinbutton"]')
      if (!startDay) throw new Error('Start date day section not found')
      await user.click(startDay)
      await user.keyboard('{Control>}a{/Control}')
      await user.paste(otherDateString)
      await waitFor(() => expect(changeHandler).toHaveBeenCalledTimes(1))
      expect(changeHandler).toHaveBeenCalledWith({
        classes: [],
        endDate: otherDate,
        entryEndDate: customEntryEndDate,
        entryStartDate: customEntryStartDate,
        startDate: otherDate,
      })
    })
  })

  describe.each([TIME_ZONE, 'America/New_York', 'Asia/Tokyo'])('moving the start day in %s (KOE-1539)', (zone) => {
    describeInTimeZone(zone, () => {
      /** A Finnish day's start, the way the event stores it. */
      const finnishDay = (year: number, month: number, day: number) =>
        new Date(new TZDate(year, month - 1, day, TIME_ZONE).getTime())

      const moveStart = async (event: PartialEvent, keys: string) => {
        const changeHandler = vi.fn()
        const { startInput, user } = renderComponent({ event, onChange: changeHandler, open: true })
        const startDay = startInput.querySelector<HTMLElement>('[role="spinbutton"]')
        if (!startDay) throw new Error('Start date day section not found')
        await user.click(startDay)
        await user.keyboard('{Control>}a{/Control}')
        await user.paste(keys)
        await waitFor(() => expect(changeHandler).toHaveBeenCalledTimes(1))
        const [changes] = changeHandler.mock.lastCall ?? []
        return changes
      }

      const days = (dates: readonly (Date | undefined)[]) => dates.map((d) => d && finnishDayOf(d))

      // A cleared field keeps the day the event has: the start stays the start of its first day and
      // the end the end of its last (KOE-1548).
      it.each([
        { field: 0, name: 'start' },
        { field: 1, name: 'end' },
      ])('keeps both days when the $name is cleared', async ({ field }) => {
        const event: PartialEvent = {
          classes: [],
          endDate: endOfFinnishDay(finnishDay(2026, 10, 18)),
          judges: [],
          startDate: finnishDay(2026, 10, 17),
        }
        const changeHandler = vi.fn()
        const { user } = renderComponent({ event, onChange: changeHandler, open: true })
        const day = screen.getAllByRole('group')[field].querySelector<HTMLElement>('[role="spinbutton"]')
        if (!day) throw new Error('Date day section not found')

        await user.click(day)
        await user.keyboard('{Control>}a{/Control}{Backspace}')
        await waitFor(() => expect(changeHandler).toHaveBeenCalledTimes(1))

        expect(changeHandler).toHaveBeenLastCalledWith(
          expect.objectContaining({
            endDate: endOfFinnishDay(finnishDay(2026, 10, 18)),
            startDate: finnishDay(2026, 10, 17),
          })
        )
      })

      it('saves the typed day as the start, a day later than the shown one nowhere', async () => {
        const event: PartialEvent = {
          classes: [],
          endDate: endOfFinnishDay(finnishDay(2026, 10, 17)),
          judges: [],
          startDate: finnishDay(2026, 10, 17),
        }
        // Not 16.10. in Tokyo, where the typed day's local midnight is the Finnish day before
        const changes = await moveStart(event, '16.10.2026')

        expect(days([changes.startDate])).toEqual(['2026-10-16'])
      })

      // A regression guard: neither Finland (25.10.) nor New York (1.11.) changes its clock between 23. and
      // 26.10.2026, so a count in the browser's zone agrees here. The days that tell them apart follow.
      it('moves the classes and the entry dates by Finnish days from 23.10. to 24.10.2026', async () => {
        const event: PartialEvent = {
          classes: [{ class: 'AVO', date: finnishDay(2026, 10, 25) }],
          endDate: endOfFinnishDay(finnishDay(2026, 10, 25)),
          entryEndDate: defaultEntryEndDate(finnishDay(2026, 10, 23)),
          entryStartDate: defaultEntryStartDate(finnishDay(2026, 10, 23)),
          judges: [],
          startDate: finnishDay(2026, 10, 23),
        }
        const changes = await moveStart(event, '24.10.2026')

        expect(days([changes.startDate, changes.endDate])).toEqual(['2026-10-24', '2026-10-26'])
        expect(days(changes.classes.map((c: { date: Date }) => c.date))).toEqual(['2026-10-26'])
        expect(days([changes.entryStartDate, changes.entryEndDate])).toEqual(['2026-09-12', '2026-10-03'])
      })

      // New York turns its clocks back on 1.11.2026 and Finland does not: the 2 days from 31.10. to 2.11.
      // are 47 hours there, and a browser that counts hours of its own days finds 1 day.
      it('keeps a class on its day of the trial across the end of New York summer time', async () => {
        const event: PartialEvent = {
          classes: [{ class: 'AVO', date: finnishDay(2026, 11, 2) }],
          endDate: endOfFinnishDay(finnishDay(2026, 11, 2)),
          judges: [],
          startDate: finnishDay(2026, 10, 31),
        }
        const changes = await moveStart(event, '7.11.2026')

        expect(days(changes.classes.map((c: { date: Date }) => c.date))).toEqual(['2026-11-09'])
      })

      // Finland enters summer time on 28.3.2027: the 2 days from 27.3. to 29.3. are 47 hours, and a
      // browser that counts hours of its own days finds 1 day.
      it('keeps a class on its day of the trial across the start of summer time', async () => {
        const event: PartialEvent = {
          classes: [{ class: 'AVO', date: finnishDay(2027, 3, 29) }],
          endDate: endOfFinnishDay(finnishDay(2027, 3, 29)),
          judges: [],
          startDate: finnishDay(2027, 3, 27),
        }
        const changes = await moveStart(event, '3.4.2027')

        expect(days(changes.classes.map((c: { date: Date }) => c.date))).toEqual(['2027-04-05'])
      })
    })
  })
})
