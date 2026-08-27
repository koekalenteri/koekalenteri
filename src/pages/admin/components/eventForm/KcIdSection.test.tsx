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
    expect(enqueueSnackbar).toHaveBeenCalledWith('event.kcIdSelected id', { variant: 'success' })
  })

  it('should let the user pick from multiple matching Kennel Club events', async () => {
    const searchEventKcIdChoices = vi.spyOn(eventApi, 'searchEventKcIdChoices').mockResolvedValueOnce({
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
        {
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

    const selectButtons = screen.getAllByRole('button', { name: 'event.kcIdSelect' })
    expect(selectButtons[0]).toHaveClass('MuiButton-contained')
    expect(screen.getByRole('button', { name: 'close' })).toHaveClass('MuiButton-outlined')

    await user.click(selectButtons[0])
    await flushPromises()

    expect(changeHandler).toHaveBeenCalledWith(expect.objectContaining({ kcId: 222 }))
    expect(screen.queryByText('event.kcIdChoiceTitle')).not.toBeInTheDocument()
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

    expect(changeHandler.mock.calls.at(-1)?.[0]).toEqual({ kcId: null })

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
})
