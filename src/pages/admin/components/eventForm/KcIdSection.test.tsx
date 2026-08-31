import type { Props } from './KcIdSection'
import type { PartialEvent } from './types'
import { TZDate } from '@date-fns/tz'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { screen } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import * as eventApi from '../../../../api/event'
import { locales } from '../../../../i18n'
import { TIME_ZONE, zonedDateString } from '../../../../i18n/dates'
import { flushPromises, renderWithUserEvents } from '../../../../test-utils/utils'
import { idTokenAtom } from '../../../state'
import KcIdSection from './KcIdSection'

vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

const renderComponent = (props: Props) =>
  renderWithUserEvents(
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <Provider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
        <KcIdSection {...props} />
      </Provider>
    </LocalizationProvider>,
    undefined
  )

describe('KcIdSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render', () => {
    const testEvent: PartialEvent = {
      classes: [],
      endDate: new TZDate('2022-06-02', TIME_ZONE),
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: new TZDate('2022-06-01', TIME_ZONE),
    }
    const { container } = renderComponent({ event: testEvent, onChange: vi.fn(), open: true })
    expect(container).toMatchSnapshot()
  })

  it('should tell the user to pick an organizer before a lookup is possible', () => {
    const testEvent: PartialEvent = {
      classes: [],
      endDate: new TZDate('2022-06-02', TIME_ZONE),
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      startDate: new TZDate('2022-06-01', TIME_ZONE),
    }

    renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    expect(screen.getByText('event.kcIdRequiresOrganizer')).toBeInTheDocument()
    expect(screen.queryByText('event.kcIdLookup')).not.toBeInTheDocument()
  })

  it('should not show the organizer hint once an organizer is selected', () => {
    const testEvent: PartialEvent = {
      classes: [],
      endDate: new TZDate('2022-06-02', TIME_ZONE),
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: new TZDate('2022-06-01', TIME_ZONE),
    }

    renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    expect(screen.queryByText('event.kcIdRequiresOrganizer')).not.toBeInTheDocument()
    expect(screen.getByText('event.kcIdLookup')).toBeInTheDocument()
  })

  it('should apply the single matching Kennel Club event directly without a picker', async () => {
    const searchEventKcIdChoices = vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
      choices: [
        {
          classes: ['ALO', 'AVO'],
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
    const changeHandler = vi.fn()
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
    await flushPromises()

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
    expect(screen.queryByText('event.kcIdChoiceTitle')).not.toBeInTheDocument()
    // exact top-level match: linking must not touch the event's own fields (that's the whole
    // point of the snapshot) — only kcEvent/kcId are set, nothing else
    expect(changeHandler).toHaveBeenLastCalledWith({
      kcEvent: expect.objectContaining({
        classes: ['ALO', 'AVO'],
        eventType: 'NOME-B',
        location: 'Espoo',
      }),
      kcId: 222,
    })
    expect(zonedDateString(changeHandler.mock.lastCall?.[0].kcEvent.startDate)).toEqual('2026-07-01')
    expect(zonedDateString(changeHandler.mock.lastCall?.[0].kcEvent.endDate)).toEqual('2026-07-02')
    expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcIdSelected id', { variant: 'success' })
  })

  it('should let the user pick from multiple matching Kennel Club events', async () => {
    const searchEventKcIdChoices = vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
      choices: [
        {
          classes: ['ALO', 'AVO'],
          endDate: new TZDate('2026-07-02', TIME_ZONE),
          eventType: 'NOME-B',
          id: 222,
          location: 'Espoo',
          name: 'Toinen koe',
          organizer: 'Järjestäjä',
          startDate: new TZDate('2026-07-01', TIME_ZONE),
        },
        {
          classes: ['VOI'],
          endDate: new TZDate('2026-08-02', TIME_ZONE),
          eventType: 'NOME-B',
          id: 333,
          location: 'Vantaa',
          name: 'Kolmas koe',
          organizer: 'Järjestäjä',
          startDate: new TZDate('2026-08-01', TIME_ZONE),
        },
      ],
    })
    const changeHandler = vi.fn()
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
    expect(await screen.findByText('event.kcIdChoiceTitle')).toBeInTheDocument()
    expect(searchEventKcIdChoices).toHaveBeenCalledTimes(1)
    expect(screen.getByText('ALO, AVO')).toBeInTheDocument()
    expect(screen.getByText('VOI')).toBeInTheDocument()

    const selectButtons = screen.getAllByRole('button', { name: 'event.kcIdSelect' })
    expect(selectButtons[0]).toHaveClass('MuiButton-contained')
    expect(screen.getByRole('button', { name: 'close' })).toHaveClass('MuiButton-outlined')

    await user.click(selectButtons[0])
    await flushPromises()

    expect(changeHandler).toHaveBeenLastCalledWith({
      kcEvent: expect.objectContaining({ classes: ['ALO', 'AVO'], eventType: 'NOME-B', location: 'Espoo' }),
      kcId: 222,
    })
    expect(screen.queryByText('event.kcIdChoiceTitle')).not.toBeInTheDocument()
  })

  it('should refuse a single match that is already linked to another event', async () => {
    vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
      choices: [
        {
          classes: ['ALO', 'AVO'],
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
    const changeHandler = vi.fn()
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: new TZDate('2026-06-01', TIME_ZONE) }],
      endDate: new TZDate('2026-06-01', TIME_ZONE),
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: new TZDate('2026-06-01', TIME_ZONE),
    }

    const { user } = renderComponent({
      event: testEvent,
      linkedKcIds: new Set([222]),
      onChange: changeHandler,
      open: true,
    })

    await user.click(screen.getByText('event.kcIdLookup'))
    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcIdConflict', { variant: 'error' })
    expect(changeHandler).not.toHaveBeenCalled()
  })

  it('should not offer a choice that is already linked to another event', async () => {
    vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
      choices: [
        {
          classes: ['ALO', 'AVO'],
          endDate: new TZDate('2026-07-02', TIME_ZONE),
          eventType: 'NOME-B',
          id: 222,
          location: 'Espoo',
          name: 'Toinen koe',
          organizer: 'Järjestäjä',
          startDate: new TZDate('2026-07-01', TIME_ZONE),
        },
        {
          classes: ['VOI'],
          endDate: new TZDate('2026-08-02', TIME_ZONE),
          eventType: 'NOME-B',
          id: 333,
          location: 'Vantaa',
          name: 'Kolmas koe',
          organizer: 'Järjestäjä',
          startDate: new TZDate('2026-08-01', TIME_ZONE),
        },
      ],
    })
    const changeHandler = vi.fn()
    const testEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: new TZDate('2026-06-01', TIME_ZONE) }],
      endDate: new TZDate('2026-06-01', TIME_ZONE),
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: new TZDate('2026-06-01', TIME_ZONE),
    }

    const { user } = renderComponent({
      event: testEvent,
      linkedKcIds: new Set([222]),
      onChange: changeHandler,
      open: true,
    })

    await user.click(screen.getByText('event.kcIdLookup'))
    expect(await screen.findByText('event.kcIdChoiceTitle')).toBeInTheDocument()
    expect(screen.getByText('event.kcIdChoiceLinked')).toBeInTheDocument()

    const selectButtons = screen.getAllByRole('button', { name: 'event.kcIdSelect' })
    expect(selectButtons).toHaveLength(1)

    await user.click(selectButtons[0])
    await flushPromises()

    expect(changeHandler).toHaveBeenLastCalledWith({
      kcEvent: expect.objectContaining({ classes: ['VOI'] }),
      kcId: 333,
    })
  })

  it('should show the fetched Kennel Club ID as static, non-editable text', () => {
    const testEvent: PartialEvent = {
      classes: [],
      endDate: new TZDate('2026-06-01', TIME_ZONE),
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      kcId: 222,
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: new TZDate('2026-06-01', TIME_ZONE),
    }

    renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    expect(screen.getByText('222')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'event.kcId' })).not.toBeInTheDocument()
  })

  it('should clear an existing Kennel Club ID when remove is selected', async () => {
    const changeHandler = vi.fn()
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

    const { rerender, user } = renderComponent({ event: testEvent, onChange: changeHandler, open: true })

    await user.click(screen.getByText('event.kcIdRemove'))

    expect(changeHandler).toHaveBeenLastCalledWith({ kcEvent: null, kcId: null })

    rerender(
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Provider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
          <KcIdSection {...{ event: { ...testEvent, kcId: null }, onChange: changeHandler, open: true }} />
        </Provider>
      </LocalizationProvider>
    )

    expect(screen.queryByText('222')).not.toBeInTheDocument()
    expect(screen.getByText('event.kcIdEmpty')).toBeInTheDocument()
  })

  it('should show a not-found message including the search criteria when there are no matches', async () => {
    vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({ choices: [] })
    const testEvent: PartialEvent = {
      classes: [],
      endDate: new TZDate('2026-06-01', TIME_ZONE),
      eventType: 'NOME-B',
      id: 'test',
      judges: [],
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: new TZDate('2026-06-01', TIME_ZONE),
    }

    const { user } = renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

    await user.click(screen.getByText('event.kcIdLookup'))
    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcIdNotFound criteria', { variant: 'warning' })
  })

  it('should report Kennel Club event lookup failures', async () => {
    const error = new Error('lookup failed')
    vi.spyOn(eventApi, 'searchEventKcIdChoices').mockRejectedValueOnce(error)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
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
      const { user } = renderComponent({ event: testEvent, onChange: vi.fn(), open: true })

      await user.click(screen.getByText('event.kcIdLookup'))
      await flushPromises()

      expect(consoleError).toHaveBeenCalledWith(error)
      expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcIdSearchFailed', { variant: 'error' })
    } finally {
      consoleError.mockRestore()
    }
  })

  describe('drift warnings', () => {
    const kcEvent = {
      classes: ['ALO'],
      endDate: new TZDate('2026-06-01', TIME_ZONE),
      eventType: 'NOME-B',
      judge: 'Tuomari Testi',
      location: 'Espoo',
      startDate: new TZDate('2026-06-01', TIME_ZONE),
    }
    const baseEvent: PartialEvent = {
      classes: [{ class: 'ALO', date: new TZDate('2026-06-01', TIME_ZONE) }],
      endDate: new TZDate('2026-06-01', TIME_ZONE),
      eventType: 'NOME-B',
      id: 'test',
      judges: [{ id: 1, name: 'Tuomari Testi' }],
      kcEvent,
      kcId: 222,
      location: 'Espoo',
      organizer: { id: 'org-id', name: 'Organizer' },
      startDate: new TZDate('2026-06-01', TIME_ZONE),
    }

    it('should show no warnings when the event matches the linked Kennel Club event', () => {
      renderComponent({ event: baseEvent, onChange: vi.fn(), open: true })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('should show no warnings when a koetunnus is set without a stored snapshot', () => {
      renderComponent({ event: { ...baseEvent, kcEvent: undefined }, onChange: vi.fn(), open: true })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('should warn when the event type differs from the linked Kennel Club event', () => {
      renderComponent({ event: { ...baseEvent, eventType: 'NOWT' }, onChange: vi.fn(), open: true })

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('event.kcIdWarningType eventType, kcEventType')).toBeInTheDocument()
    })

    it('should warn when the classes differ from the linked Kennel Club event', () => {
      renderComponent({
        event: {
          ...baseEvent,
          classes: [
            { class: 'ALO', date: new TZDate('2026-06-01', TIME_ZONE) },
            { class: 'AVO', date: new TZDate('2026-06-01', TIME_ZONE) },
          ],
        },
        onChange: vi.fn(),
        open: true,
      })

      expect(screen.getByText('event.kcIdWarningClasses classes, kcClasses')).toBeInTheDocument()
    })

    it('should warn when the dates differ from the linked Kennel Club event', () => {
      renderComponent({
        event: { ...baseEvent, endDate: new TZDate('2026-06-02', TIME_ZONE) },
        onChange: vi.fn(),
        open: true,
      })

      expect(screen.getByText('event.kcIdWarningDates dates, kcDates')).toBeInTheDocument()
    })

    it('should warn when the location differs from the linked Kennel Club event', () => {
      renderComponent({ event: { ...baseEvent, location: 'Vantaa' }, onChange: vi.fn(), open: true })

      expect(screen.getByText('event.kcIdWarningLocation kcLocation, location')).toBeInTheDocument()
    })

    it('should warn when the Kennel Club head judge is not among the event judges', () => {
      renderComponent({
        event: { ...baseEvent, judges: [{ id: 1, name: 'Joku Muu' }] },
        onChange: vi.fn(),
        open: true,
      })

      expect(screen.getByText('event.kcIdWarningJudge kcJudge')).toBeInTheDocument()
    })

    it('should not warn about judges when the Kennel Club event has no head judge on record', () => {
      renderComponent({
        event: { ...baseEvent, judges: [{ id: 1, name: 'Joku Muu' }], kcEvent: { ...kcEvent, judge: undefined } },
        onChange: vi.fn(),
        open: true,
      })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
