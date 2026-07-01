import type { Props } from './BasicInfoSection'
import type { PartialEvent } from './types'
import { TZDate } from '@date-fns/tz'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { screen } from '@testing-library/react'
import { add, format } from 'date-fns'
import { enqueueSnackbar } from 'notistack'
import { RecoilRoot } from 'recoil'
import * as eventApi from '../../../../api/event'
import { locales } from '../../../../i18n'
import { TIME_ZONE, zonedDateString } from '../../../../i18n/dates'
import { defaultEntryEndDate, defaultEntryStartDate, newEventStartDate } from '../../../../lib/event'
import { flushPromises, renderWithUserEvents } from '../../../../test-utils/utils'
import BasicInfoSection from './BasicInfoSection'

jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

const renderComponent = (props: Props) => {
  const res = renderWithUserEvents(
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <RecoilRoot>
        <BasicInfoSection {...props} />
      </RecoilRoot>
    </LocalizationProvider>,
    undefined,
    { advanceTimers: jest.advanceTimersByTime }
  )

  const inputs = screen.getAllByRole<HTMLInputElement>('textbox') //'Choose date', { exact: false })
  const buttons = screen.getAllByTestId('CalendarIcon')
  return { ...res, endCalendar: buttons[1], endInput: inputs[1], startCalendar: buttons[0], startInput: inputs[0] }
}

describe('BasicInfoSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
    const changeHandler = jest.fn()
    const { container } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })
    expect(container).toMatchSnapshot()
  })

  describe('interactions', () => {
    beforeAll(() => jest.useFakeTimers())
    afterAll(() => jest.useRealTimers())
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
      const otherDateString = format(otherDate, 'dd.MM.yyyy')
      const changeHandler = jest.fn()
      const { startInput, user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      expect(changeHandler).not.toHaveBeenCalled()

      await user.type(startInput, otherDateString)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledTimes(1)
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
      const otherDateString = format(otherDate, 'dd.MM.yyyy')
      const changeHandler = jest.fn()
      const { startInput, user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      expect(changeHandler).not.toHaveBeenCalled()

      await user.type(startInput, otherDateString)
      await flushPromises()

      expect(changeHandler).toHaveBeenCalledTimes(1)
      expect(changeHandler).toHaveBeenCalledWith({
        classes: [],
        endDate: otherDate,
        entryEndDate: customEntryEndDate,
        entryStartDate: customEntryStartDate,
        startDate: otherDate,
      })
    })

    it('should update local event state when a Kennel Club event is selected', async () => {
      const searchEventKcIdChoices = jest.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
        choices: [
          {
            endDate: new TZDate('2026-07-02', TIME_ZONE),
            eventType: 'NOME-B',
            id: 222,
            location: 'Espoo',
            name: 'Toinen koe',
            organizer: 'Järjestäjä',
            startDate: new TZDate('2026-07-01', TIME_ZONE),
          },
        ],
      })
      const changeHandler = jest.fn()
      const testEvent: PartialEvent = {
        classes: [{ class: 'ALO', date: new TZDate('2026-06-01', TIME_ZONE) }],
        endDate: new TZDate('2026-06-01', TIME_ZONE),
        entryEndDate: defaultEntryEndDate(new TZDate('2026-06-01', TIME_ZONE)),
        entryStartDate: defaultEntryStartDate(new TZDate('2026-06-01', TIME_ZONE)),
        eventType: 'NOME-B',
        id: 'test',
        judges: [],
        organizer: { id: 'org-id', name: 'Organizer' },
        placesPerDay: {
          '2026-06-01': 5,
          '2026-06-02': 6,
          '2026-06-03': 7,
        },
        startDate: new TZDate('2026-06-01', TIME_ZONE),
      }

      const { user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      await user.click(screen.getByText('event.kcIdLookup'))
      expect(await screen.findByText('event.kcIdChoiceTitle')).toBeInTheDocument()
      expect(searchEventKcIdChoices).toHaveBeenCalledWith(
        expect.objectContaining({
          classes: [{ class: 'ALO', date: testEvent.classes[0].date }],
          endDate: testEvent.endDate,
          eventType: 'NOME-B',
          organizer: { id: 'org-id' },
          startDate: testEvent.startDate,
        }),
        'id-token'
      )

      await user.click(screen.getByText('event.kcIdSelect'))

      expect(changeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'NOME-B',
          kcId: 222,
          location: 'Espoo',
          season: '2026',
        })
      )
      expect(zonedDateString(changeHandler.mock.calls.at(-1)?.[0].startDate)).toEqual('2026-07-01')
      expect(zonedDateString(changeHandler.mock.calls.at(-1)?.[0].endDate)).toEqual('2026-07-02')
      expect(zonedDateString(changeHandler.mock.calls.at(-1)?.[0].entryStartDate)).toEqual('2026-05-20')
      expect(zonedDateString(changeHandler.mock.calls.at(-1)?.[0].entryEndDate)).toEqual('2026-06-10')
      expect(changeHandler.mock.calls.at(-1)?.[0].placesPerDay).toEqual({
        '2026-07-01': 5,
        '2026-07-02': 6,
      })
    })

    it('should treat Kennel Club null end date as a one day event when selected', async () => {
      jest.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
        choices: [
          {
            contactInfo: {
              secretary: {
                email: 'nome.maija@gmail.com',
                name: 'Parviainen Niina',
                phone: '358400512651',
              },
            },
            cost: 55,
            description: 'Osallistumismaksu sisältää keittolounaan.',
            endDate: new Date('0001-01-01T00:00:00'),
            entryEndDate: new TZDate('2026-06-07', TIME_ZONE),
            entryStartDate: new TZDate('2026-05-17', TIME_ZONE),
            eventType: 'NOWT SM',
            id: 453830,
            location: 'Jyväskylä, Korpilahti',
            name: '',
            organizer: 'KESKI-SUOMEN NOUTAJAKOIRAYHDISTYS RY.',
            startDate: new TZDate('2026-06-28', TIME_ZONE),
          },
        ],
      })
      const changeHandler = jest.fn()
      const testEvent: PartialEvent = {
        classes: [],
        endDate: new TZDate('2026-06-01', TIME_ZONE),
        entryEndDate: defaultEntryEndDate(new TZDate('2026-06-01', TIME_ZONE)),
        entryStartDate: defaultEntryStartDate(new TZDate('2026-06-01', TIME_ZONE)),
        eventType: 'NOWT',
        id: 'test',
        judges: [],
        organizer: { id: 'org-id', name: 'Organizer' },
        startDate: new TZDate('2026-06-01', TIME_ZONE),
      }

      const { user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      await user.click(screen.getByText('event.kcIdLookup'))
      expect(await screen.findByText('2026-06-28')).toBeInTheDocument()

      await user.click(screen.getByText('event.kcIdSelect'))

      expect(zonedDateString(changeHandler.mock.calls.at(-1)?.[0].startDate)).toEqual('2026-06-28')
      expect(zonedDateString(changeHandler.mock.calls.at(-1)?.[0].endDate)).toEqual('2026-06-28')
      expect(zonedDateString(changeHandler.mock.calls.at(-1)?.[0].entryStartDate)).toEqual('2026-05-17')
      expect(zonedDateString(changeHandler.mock.calls.at(-1)?.[0].entryEndDate)).toEqual('2026-06-07')
      expect(changeHandler.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({
          contactInfo: {
            secretary: {
              email: 'nome.maija@gmail.com',
              name: 'Parviainen Niina',
              phone: '358400512651',
            },
          },
          cost: 55,
          description: 'Osallistumismaksu sisältää keittolounaan.',
          eventType: 'NOWT SM',
          location: 'Jyväskylä, Korpilahti',
        })
      )
    })

    it('should clear an existing Kennel Club ID when remove is selected', async () => {
      const changeHandler = jest.fn()
      const testEvent: PartialEvent = {
        classes: [{ class: 'ALO', date: new TZDate('2026-06-01', TIME_ZONE) }],
        endDate: new TZDate('2026-06-01', TIME_ZONE),
        eventType: 'NOME-B',
        id: 'test',
        judges: [],
        kcId: 222,
        name: 'Koe',
        organizer: { id: 'org-id', name: 'Organizer' },
        startDate: new TZDate('2026-06-01', TIME_ZONE),
      }

      const { user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      await user.click(screen.getByText('event.kcIdRemove'))

      expect(changeHandler.mock.calls.at(-1)?.[0]).toEqual({ kcId: null })
    })

    it('should report Kennel Club event lookup failures', async () => {
      const error = new Error('lookup failed')
      jest.spyOn(eventApi, 'searchEventKcIdChoices').mockRejectedValueOnce(error)
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      const testEvent: PartialEvent = {
        classes: [{ class: 'ALO', date: new TZDate('2026-06-01', TIME_ZONE) }],
        endDate: new TZDate('2026-06-01', TIME_ZONE),
        eventType: 'NOME-B',
        id: 'test',
        judges: [],
        organizer: { id: 'org-id', name: 'Organizer' },
        startDate: new TZDate('2026-06-01', TIME_ZONE),
      }

      try {
        const { user } = renderComponent({ event: testEvent, onChange: jest.fn(), open: true })

        await user.click(screen.getByText('event.kcIdLookup'))
        await flushPromises()

        expect(consoleError).toHaveBeenCalledWith(error)
        expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcIdSearchFailed', { variant: 'error' })
      } finally {
        consoleError.mockRestore()
      }
    })

    it('should clear stale Kennel Club choices when a later lookup returns no matches', async () => {
      const searchEventKcIdChoices = jest
        .spyOn(eventApi, 'searchEventKcIdChoices')
        .mockResolvedValueOnce({
          choices: [
            {
              endDate: new TZDate('2026-07-02', TIME_ZONE),
              eventType: 'NOME-B',
              id: 222,
              location: 'Espoo',
              name: 'Toinen koe',
              organizer: 'Järjestäjä',
              startDate: new TZDate('2026-07-01', TIME_ZONE),
            },
          ],
        })
        .mockResolvedValueOnce({ choices: [] })

      const changeHandler = jest.fn()
      const testEvent: PartialEvent = {
        classes: [{ class: 'ALO', date: new TZDate('2026-06-01', TIME_ZONE) }],
        endDate: new TZDate('2026-06-01', TIME_ZONE),
        eventType: 'NOME-B',
        id: 'test',
        judges: [],
        organizer: { id: 'org-id', name: 'Organizer' },
        startDate: new TZDate('2026-06-01', TIME_ZONE),
      }

      const { user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

      await user.click(screen.getByText('event.kcIdLookup'))
      expect(await screen.findByText('222')).toBeInTheDocument()

      await user.click(screen.getByText('event.kcIdLookup'))
      await flushPromises()

      expect(searchEventKcIdChoices).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('222')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'event.kcIdSelect' })).not.toBeInTheDocument()
      expect(changeHandler).not.toHaveBeenCalled()
    })
  })
})
