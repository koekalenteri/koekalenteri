import type { DayKey, EventType } from '@/types'
import type { Props } from './BasicInfoSection'
import type { PartialEvent } from './types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { locales } from '@/i18n'
import { formatDate } from '@/i18n/dates'
import { addDays, TIME_ZONE, toDayKey } from '@/lib/day'
import { defaultEntryEndDate, defaultEntryStartDate, EVENT_TYPE_CLASSES } from '@/lib/event'
import { idTokenAtom } from '@/pages/state'
import { finnishDayOf } from '@/test-utils/finnishDays'
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
const newEventStartDate: DayKey = '2099-06-06'

describe('BasicInfoSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('the official type an unofficial trial follows (KOE-1718)', () => {
    const unofficial: PartialEvent = {
      classes: [{ class: 'ALO', date: newEventStartDate }],
      endDate: newEventStartDate,
      eventType: 'Harjoitus',
      judges: [],
      startDate: newEventStartDate,
    }
    const harjoitus: EventType = {
      active: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      createdBy: 'test',
      description: { en: 'Training', fi: 'Harjoitus', sv: 'Övning' },
      eventType: 'Harjoitus',
      modifiedAt: new Date('2026-01-01T00:00:00Z'),
      modifiedBy: 'test',
      official: false,
    }
    const field = () => screen.queryByRole('combobox', { name: 'event.officialFormat' })

    it.each<[string, PartialEvent, EventType | undefined]>([
      ['an official type', { ...unofficial, eventType: 'NOME-B' }, undefined],
      ['a type the Kennel Club knows', unofficial, { ...harjoitus, official: true }],
      ['an event with no type yet', { ...unofficial, eventType: undefined }, undefined],
    ])('is not offered for %s', (_name, event, selectedEventType) => {
      renderComponent({ event, open: true, selectedEventType })

      expect(field()).not.toBeInTheDocument()
    })

    it('runs the classes of the type chosen', async () => {
      const changeHandler = vi.fn()
      const { user } = renderComponent({
        event: unofficial,
        eventTypeClasses: EVENT_TYPE_CLASSES,
        onChange: changeHandler,
        open: true,
        selectedEventType: harjoitus,
      })

      await user.click(screen.getByRole('combobox', { name: 'event.officialFormat' }))
      await user.click(screen.getByRole('option', { name: 'NOU' }))

      // NOU runs no classes, so the trial's ALO goes with the choice.
      expect(changeHandler).toHaveBeenCalledWith({ classes: [], officialFormat: 'NOU' })
    })

    it('chooses again when the trial changes type', async () => {
      const changeHandler = vi.fn()
      const { user } = renderComponent({
        event: { ...unofficial, officialFormat: 'NOWT' },
        eventTypes: ['Harjoitus', 'Koulutus'],
        onChange: changeHandler,
        open: true,
        selectedEventType: harjoitus,
      })

      await user.click(screen.getByRole('combobox', { name: 'event.eventType' }))
      await user.click(screen.getByRole('option', { name: 'Koulutus' }))

      expect(changeHandler).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'Koulutus', officialFormat: null })
      )
    })

    // KOE-674: an unofficial trial's own classes are its own, whatever type or format it takes, as long
    // as it stays unofficial; an official type runs none.
    describe("the event's own classes", () => {
      const withOwnClasses: PartialEvent = {
        ...unofficial,
        classes: [{ class: 'DERBY', date: newEventStartDate }],
        ownClasses: [{ code: 'DERBY', name: { fi: 'Derby' } }],
      }

      it('keeps them when the format the trial follows changes', async () => {
        const changeHandler = vi.fn()
        const { user } = renderComponent({
          event: withOwnClasses,
          eventTypeClasses: EVENT_TYPE_CLASSES,
          onChange: changeHandler,
          open: true,
          selectedEventType: harjoitus,
        })

        await user.click(screen.getByRole('combobox', { name: 'event.officialFormat' }))
        await user.click(screen.getByRole('option', { name: 'NOWT' }))

        expect(changeHandler).toHaveBeenCalledWith({
          classes: [expect.objectContaining({ class: 'DERBY', date: newEventStartDate })],
          officialFormat: 'NOWT',
        })
      })

      it('keeps them when the trial changes to another unofficial type', async () => {
        const changeHandler = vi.fn()
        const { user } = renderComponent({
          event: withOwnClasses,
          eventTypeClasses: EVENT_TYPE_CLASSES,
          eventTypes: ['Harjoitus', 'Koulutus'],
          onChange: changeHandler,
          open: true,
          selectedEventType: harjoitus,
        })

        await user.click(screen.getByRole('combobox', { name: 'event.eventType' }))
        await user.click(screen.getByRole('option', { name: 'Koulutus' }))

        expect(changeHandler).toHaveBeenCalledWith(
          expect.objectContaining({ classes: [{ class: 'DERBY', date: newEventStartDate }], eventType: 'Koulutus' })
        )
        expect(changeHandler).toHaveBeenLastCalledWith(expect.not.objectContaining({ ownClasses: expect.anything() }))
      })

      it('drops them, list and days, when the trial becomes an official one', async () => {
        const changeHandler = vi.fn()
        const { user } = renderComponent({
          event: withOwnClasses,
          eventTypeClasses: EVENT_TYPE_CLASSES,
          eventTypes: ['Harjoitus', 'NOWT'],
          onChange: changeHandler,
          open: true,
          selectedEventType: harjoitus,
        })

        await user.click(screen.getByRole('combobox', { name: 'event.eventType' }))
        await user.click(screen.getByRole('option', { name: 'NOWT' }))

        expect(changeHandler).toHaveBeenCalledWith(
          expect.objectContaining({ classes: [], eventType: 'NOWT', ownClasses: null })
        )
      })
    })

    // KOE-674: the secretary lists the trial's own classes, their codes, names and order, and picks
    // their days among the classes; what the save refuses shows on the row (`ownClassErrors`).
    describe('editing own classes', () => {
      /** The section as the form holds it: each change becomes the event the next render shows. */
      const Editing = ({ initial, onChange }: { initial: PartialEvent; onChange: (event: PartialEvent) => void }) => {
        const [event, setEvent] = useState(initial)
        return (
          <BasicInfoSection
            event={event}
            eventTypeClasses={EVENT_TYPE_CLASSES}
            onChange={(change) => {
              const next = { ...event, ...change } as PartialEvent
              setEvent(next)
              onChange(next)
            }}
            open
            selectedEventType={harjoitus}
          />
        )
      }
      const renderEditing = (initial: PartialEvent) => {
        const changed = vi.fn<(event: PartialEvent) => void>()
        const result = renderWithUserEvents(
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
            <Provider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
              <Editing initial={initial} onChange={changed} />
            </Provider>
          </LocalizationProvider>,
          undefined
        )
        return { ...result, changed }
      }
      const derby: PartialEvent = {
        ...unofficial,
        classes: [{ class: 'DERBY', date: newEventStartDate }],
        ownClasses: [{ code: 'DERBY', name: { fi: 'Derby' } }],
      }
      const codeField = (at = 0) => screen.getAllByRole('textbox', { name: 'event.ownClasses.code' })[at]

      it('offers own classes to an unofficial trial only', () => {
        renderComponent({ event: unofficial, open: true, selectedEventType: harjoitus })
        expect(screen.getByRole('button', { name: 'event.ownClasses.add' })).toBeInTheDocument()
      })

      it('offers no own classes to an official trial', () => {
        renderComponent({ event: { ...unofficial, eventType: 'NOME-B' }, open: true })
        expect(screen.queryByRole('button', { name: 'event.ownClasses.add' })).not.toBeInTheDocument()
      })

      // A one-day trial has only the one day to run the class on, so the class gets it at once.
      it('adds an own class with its code in capitals on the day of a one-day trial, and leaves the official class days', async () => {
        const { changed, user } = renderEditing(unofficial)

        await user.click(screen.getByRole('button', { name: 'event.ownClasses.add' }))
        await user.type(codeField(), 'derby')
        await user.type(screen.getAllByRole('textbox', { name: 'event.ownClasses.name language' })[0], 'Derby')

        expect(changed).toHaveBeenLastCalledWith(
          expect.objectContaining({
            classes: [{ class: 'DERBY', date: newEventStartDate }],
            ownClasses: [{ code: 'DERBY', name: { fi: 'Derby' } }],
          })
        )
      })

      it('leaves the day of a class on a longer trial to be chosen, and says so', async () => {
        const { changed, user } = renderEditing({ ...unofficial, endDate: addDays(newEventStartDate, 1) })

        await user.click(screen.getByRole('button', { name: 'event.ownClasses.add' }))
        await user.type(codeField(), 'DERBY')

        expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ classes: [] }))
        expect(screen.getByText('event.ownClasses.errors.noClassDay')).toBeInTheDocument()
      })

      it('offers the own classes in the class choice', async () => {
        const { user } = renderEditing({ ...derby, classes: [] })

        await user.click(screen.getByRole('combobox', { name: 'event.classes' }))

        expect(screen.getByRole('option', { name: 'DERBY' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'ALO' })).not.toBeInTheDocument()
      })

      it('moves the class days with a changed code', async () => {
        const { changed, user } = renderEditing(derby)

        await user.type(codeField(), '2')

        expect(changed).toHaveBeenLastCalledWith(
          expect.objectContaining({
            classes: [{ class: 'DERBY2', date: newEventStartDate }],
            ownClasses: [{ code: 'DERBY2', name: { fi: 'Derby' } }],
          })
        )
      })

      it('removes an own class with its days', async () => {
        const { changed, user } = renderEditing(derby)

        await user.click(screen.getByRole('button', { name: 'event.ownClasses.remove code' }))

        expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ classes: [], ownClasses: null }))
      })

      it("keeps the classes in the secretary's order", async () => {
        const { changed, user } = renderEditing({
          ...derby,
          ownClasses: [...(derby.ownClasses ?? []), { code: 'VET', name: { fi: 'Veteraanit' } }],
        })

        await user.click(screen.getAllByRole('button', { name: 'event.ownClasses.moveUp code' })[1])

        expect(changed).toHaveBeenLastCalledWith(
          expect.objectContaining({
            ownClasses: [
              { code: 'VET', name: { fi: 'Veteraanit' } },
              { code: 'DERBY', name: { fi: 'Derby' } },
            ],
          })
        )
      })

      it('says on the row why the save would refuse the class', () => {
        renderComponent({
          event: { ...derby, classes: [], ownClasses: [{ code: 'NOWT', name: { fi: '' } }] },
          open: true,
          selectedEventType: harjoitus,
        })

        expect(screen.getByText('event.ownClasses.errors.typeName')).toBeInTheDocument()
        expect(screen.getByText('event.ownClasses.errors.unnamed')).toBeInTheDocument()
        expect(screen.getByText('event.ownClasses.errors.noClassDay')).toBeInTheDocument()
      })

      // While a code is typed two rows can share it; the days of a code another row holds are its own,
      // so they are never moved or removed with the row being edited.
      describe('two rows sharing a code', () => {
        const judged = { class: 'OPEN', date: newEventStartDate, judge: { id: 1, name: 'Tuomari' }, places: 10 }
        const open: PartialEvent = {
          ...unofficial,
          classes: [judged],
          ownClasses: [{ code: 'OPEN', name: { fi: 'Avoin' } }],
        }

        it("types a second row's code through the first row's without touching the first row's day", async () => {
          const { changed, user } = renderEditing(open)

          await user.click(screen.getByRole('button', { name: 'event.ownClasses.add' }))
          await user.type(codeField(1), 'open2')

          expect(changed).toHaveBeenLastCalledWith(
            expect.objectContaining({ classes: [judged, { class: 'OPEN2', date: newEventStartDate }] })
          )
        })

        it("edits a code into another row's and back, every day staying with its row", async () => {
          const longer: PartialEvent = {
            ...open,
            classes: [judged, { class: 'OPENB', date: addDays(newEventStartDate, 1) }],
            endDate: addDays(newEventStartDate, 1),
            ownClasses: [...(open.ownClasses ?? []), { code: 'OPENB', name: { fi: 'Avoin B' } }],
          }
          const { changed, user } = renderEditing(longer)

          await user.type(codeField(1), '{Backspace}b')

          expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ classes: longer.classes }))
        })

        it('removes a row whose code another row has without its days', async () => {
          const { changed, user } = renderEditing({
            ...open,
            ownClasses: [...(open.ownClasses ?? []), { code: 'OPEN', name: {} }],
          })

          await user.click(screen.getAllByRole('button', { name: 'event.ownClasses.remove code' })[1])

          expect(changed).toHaveBeenLastCalledWith(
            expect.objectContaining({ classes: [judged], ownClasses: [{ code: 'OPEN', name: { fi: 'Avoin' } }] })
          )
        })
      })

      it('drops the days of a code cleared on a longer trial', async () => {
        const { changed, user } = renderEditing({
          ...derby,
          classes: [
            { class: 'DERBY', date: newEventStartDate },
            { class: 'DERBY', date: addDays(newEventStartDate, 1) },
          ],
          endDate: addDays(newEventStartDate, 1),
        })

        await user.clear(codeField())

        expect(changed).toHaveBeenLastCalledWith(
          expect.objectContaining({ classes: [], ownClasses: [{ code: '', name: { fi: 'Derby' } }] })
        )
      })

      it('names a class day of no class in the list', () => {
        renderComponent({
          event: { ...derby, classes: [...derby.classes, { class: 'VET', date: newEventStartDate }] },
          open: true,
          selectedEventType: harjoitus,
        })

        expect(screen.getByText('event.ownClasses.errors.notOwnClass: VET')).toBeInTheDocument()
      })

      // The save reads the registrations; the form knows the entries by the class days' counts.
      it('adds no own classes while the official classes have entries, and says why', () => {
        renderComponent({
          event: { ...unofficial, classes: [{ class: 'ALO', date: newEventStartDate, entries: 2 }] },
          open: true,
          selectedEventType: harjoitus,
        })

        expect(screen.getByRole('button', { name: 'event.ownClasses.add' })).toBeDisabled()
        expect(screen.getByText('event.ownClasses.entered')).toBeInTheDocument()
      })

      it('keeps the type of a trial whose own classes have entries, and says why', () => {
        renderComponent({
          event: { ...derby, classes: [{ class: 'DERBY', date: newEventStartDate, entries: 2 }] },
          eventTypes: ['Harjoitus', 'NOWT'],
          open: true,
          selectedEventType: harjoitus,
        })

        expect(screen.getByRole('combobox', { name: 'event.eventType' })).toBeDisabled()
        expect(screen.getAllByText('event.ownClasses.entered').length).toBeGreaterThan(0)
      })

      it('keeps the code of a class with entries', () => {
        renderComponent({
          event: { ...derby, classes: [{ class: 'DERBY', date: newEventStartDate, entries: 3 }], entries: 3 },
          open: true,
          selectedEventType: harjoitus,
        })

        expect(codeField()).toBeDisabled()
        expect(screen.getByRole('button', { name: 'event.ownClasses.remove code' })).toBeDisabled()
      })
    })

    it('is locked once a result or a turn is saved', () => {
      renderComponent({
        event: { ...unofficial, officialFormat: 'NOWT' },
        officialFormatLocked: true,
        open: true,
        selectedEventType: harjoitus,
      })

      expect(field()).toBeDisabled()
      expect(screen.getByText('event.officialFormatLocked')).toBeInTheDocument()
    })

    it('offers only the types that keep the classes once the event has entries', async () => {
      const changeHandler = vi.fn()
      const { user } = renderComponent({
        event: { ...unofficial, entries: 2 },
        eventTypeClasses: EVENT_TYPE_CLASSES,
        onChange: changeHandler,
        open: true,
        selectedEventType: harjoitus,
      })

      expect(screen.getByText('event.officialFormatClassShape')).toBeInTheDocument()
      await user.click(screen.getByRole('combobox', { name: 'event.officialFormat' }))

      expect(screen.getByRole('option', { name: 'NOU' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('option', { name: 'NOME-A' })).toHaveAttribute('aria-disabled', 'true')
      await user.click(screen.getByRole('option', { name: 'NOWT' }))
      // A one-day NOWT runs its classes the whole day, as a trial of that type does.
      expect(changeHandler).toHaveBeenCalledWith({
        classes: [{ class: 'ALO', date: newEventStartDate, groups: ['kp'] }],
        officialFormat: 'NOWT',
      })
    })
  })

  it('should render', () => {
    const testEvent: PartialEvent = {
      classes: [],
      description: 'Test!',
      endDate: '2022-06-02',
      id: 'test',
      judges: [],
      startDate: '2022-06-01',
    }
    const changeHandler = vi.fn()
    renderComponent({ event: testEvent, onChange: changeHandler, open: true })
    expect(screen.getByLabelText('event.name (locale.fi)')).toBeInTheDocument()
  })

  describe('the secretary field (KOE-1473)', () => {
    const baseEvent: PartialEvent = {
      classes: [],
      description: '',
      endDate: '2022-06-02',
      id: 'test',
      judges: [],
      startDate: '2022-06-01',
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
      const otherDate = addDays(newEventStartDate, 1)
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
      const customEntryEndDate = addDays(defaultEntryEndDate(newEventStartDate), 7)
      const customEntryStartDate = addDays(defaultEntryStartDate(newEventStartDate), 7)
      const testEvent: PartialEvent = {
        classes: [],
        endDate: newEventStartDate,
        entryEndDate: customEntryEndDate,
        entryStartDate: customEntryStartDate,
        judges: [],
        startDate: newEventStartDate,
      }
      const otherDate = addDays(newEventStartDate, 1)
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
      /** A Finnish day, the way the event holds it. */
      const finnishDay = (year: number, month: number, day: number) => toDayKey(year, month, day)

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

      const days = (dates: readonly (DayKey | undefined)[]) => dates.map((d) => d && finnishDayOf(d))

      // A cleared field keeps the day the event has: the start stays the start of its first day and
      // the end the end of its last (KOE-1548).
      it.each([
        { field: 0, name: 'start' },
        { field: 1, name: 'end' },
      ])('keeps both days when the $name is cleared', async ({ field }) => {
        const event: PartialEvent = {
          classes: [],
          endDate: '2026-10-18',
          judges: [],
          startDate: '2026-10-17',
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
            endDate: '2026-10-18',
            startDate: '2026-10-17',
          })
        )
      })

      it('saves the typed day as the start, a day later than the shown one nowhere', async () => {
        const event: PartialEvent = {
          classes: [],
          endDate: '2026-10-17',
          judges: [],
          startDate: '2026-10-17',
        }
        // Not 16.10. in Tokyo, where the typed day's local midnight is the Finnish day before
        const changes = await moveStart(event, '16.10.2026')

        expect(days([changes.startDate])).toEqual(['2026-10-16'])
      })

      // A regression guard: neither Finland (25.10.) nor New York (1.11.) changes its clock between 23. and
      // 26.10.2026, so a count in the browser's zone agrees here. The days that tell them apart follow.
      it('moves the classes and the entry dates by Finnish days from 23.10. to 24.10.2026', async () => {
        const event: PartialEvent = {
          classes: [{ class: 'AVO', date: '2026-10-25' }],
          endDate: '2026-10-25',
          entryEndDate: defaultEntryEndDate(finnishDay(2026, 10, 23)),
          entryStartDate: defaultEntryStartDate(finnishDay(2026, 10, 23)),
          judges: [],
          startDate: '2026-10-23',
        }
        const changes = await moveStart(event, '24.10.2026')

        expect(days([changes.startDate, changes.endDate])).toEqual(['2026-10-24', '2026-10-26'])
        expect(days(changes.classes.map((c: { date: DayKey }) => c.date))).toEqual(['2026-10-26'])
        expect(days([changes.entryStartDate, changes.entryEndDate])).toEqual(['2026-09-12', '2026-10-03'])
      })

      // New York turns its clocks back on 1.11.2026 and Finland does not: the 2 days from 31.10. to 2.11.
      // are 47 hours there, and a browser that counts hours of its own days finds 1 day.
      it('keeps a class on its day of the trial across the end of New York summer time', async () => {
        const event: PartialEvent = {
          classes: [{ class: 'AVO', date: '2026-11-02' }],
          endDate: '2026-11-02',
          judges: [],
          startDate: '2026-10-31',
        }
        const changes = await moveStart(event, '7.11.2026')

        expect(days(changes.classes.map((c: { date: DayKey }) => c.date))).toEqual(['2026-11-09'])
      })

      // Finland enters summer time on 28.3.2027: the 2 days from 27.3. to 29.3. are 47 hours, and a
      // browser that counts hours of its own days finds 1 day.
      it('keeps a class on its day of the trial across the start of summer time', async () => {
        const event: PartialEvent = {
          classes: [{ class: 'AVO', date: '2027-03-29' }],
          endDate: '2027-03-29',
          judges: [],
          startDate: '2027-03-27',
        }
        const changes = await moveStart(event, '3.4.2027')

        expect(days(changes.classes.map((c: { date: DayKey }) => c.date))).toEqual(['2027-04-05'])
      })
    })
  })
})
