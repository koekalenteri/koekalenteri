import type { DayKey, DogEvent } from '@/types'
import type { Language } from '../../i18n'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { act, fireEvent, screen } from '@testing-library/react'
import { createStore } from 'jotai'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithEntryNotYetOpen } from '@/__mockData__/events'
import { putEvent } from '@/api/event'
import { addDays } from '@/lib/day'
import { copyDogEvent } from '@/lib/event'
import { idTokenAtom } from '@/pages/state'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import {
  flushPromises,
  renderSuspended,
  renderSuspendedWithUserEvents,
  runPendingTimers,
  TEST_ID_TOKEN,
} from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import EventCreatePage from './EventCreatePage'
import { adminNewEventAtom } from './state'

vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/location')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')
vi.mock('../../api/user')

describe('EventEditPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(runPendingTimers)
  afterAll(() => vi.useRealTimers())

  it('initializes a new event with an unpublished start list', async () => {
    const event = await createStore().get(adminNewEventAtom)

    expect(event.startListPublished).toBe(false)
  })

  it('renders properly when creating a new event', async () => {
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    const eventDate: DayKey = '2021-04-23'
    const defaultValue = await createStore().get(adminNewEventAtom)
    const initialValue: typeof defaultValue = {
      ...defaultValue,
      cost: { normal: 0 },
      endDate: eventDate,
      entryEndDate: '2021-04-09',
      entryStartDate: '2021-03-23',
      startDate: eventDate,
    }

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <Provider initializeState={({ set }) => set(adminNewEventAtom, initialValue)}>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <EventCreatePage />
                </AppSnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(screen.getByRole('group', { name: 'event.startDate' })).toHaveTextContent('23.04.2021')
    expect(screen.getByRole('group', { name: 'event.endDate' })).toHaveTextContent('23.04.2021')
  })

  /** The create page holding a new event that is ready to save, so Tallenna is enabled from the start. */
  const renderReadyToSave = () =>
    renderSuspendedWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider
            initializeState={({ set }) => {
              set(idTokenAtom, TEST_ID_TOKEN)
              set(adminNewEventAtom, { ...eventWithEntryNotYetOpen, id: '', name: '' })
            }}
          >
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <EventCreatePage />
                </AppSnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

  // KOE-1483: each change was merged into the event of the last render, so the second of two changes
  // arriving before the form rendered again put back the event without the first.
  it('keeps both of two changes that reach the form before it renders again', async () => {
    const { user } = await renderReadyToSave()
    await flushPromises()

    fireEvent.change(screen.getByLabelText('event.name (locale.fi)'), { target: { value: 'Syyskoe' } })
    fireEvent.change(screen.getByLabelText('event.name (locale.en)'), { target: { value: 'Autumn trial' } })
    // Both fields' debounces run out in one go, before React has rendered either change.
    act(() => {
      vi.advanceTimersByTime(300)
    })
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(putEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Syyskoe', names: { en: 'Autumn trial' } }),
      expect.anything(),
      undefined,
      undefined
    )
  })

  // KOE-1483: the name reaches the form 300 ms after the last key, and Tallenna pressed sooner saved
  // the event without it.
  it('saves a name typed just before Tallenna', async () => {
    const { user } = await renderReadyToSave()
    await flushPromises()

    await user.type(screen.getByLabelText('event.name (locale.fi)'), 'Syyskoe')
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(putEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Syyskoe' }),
      expect.anything(),
      undefined,
      undefined
    )
  })

  // KOE-1741: a copy is saved as a new event, which has no stored posts for the save to move, so a start
  // changed on the form moves the copy's posts as it moves the classes. The save then keeps them all.
  it('saves the posts and groups of a copy on the start chosen on the form', async () => {
    const source: DogEvent = {
      ...eventWithEntryNotYetOpen,
      rotations: [{ class: 'AVO', exercises: [{ stationId: 'post-1' }] }],
      stations: [
        { date: eventWithEntryNotYetOpen.startDate, id: 'post-1', number: 1 },
        { date: eventWithEntryNotYetOpen.endDate, id: 'post-2', number: 1 },
      ],
    }
    const copy = copyDogEvent(source)
    const start = addDays(copy.startDate, 7)
    const { user } = await renderSuspendedWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider
            initializeState={({ set }) => {
              set(idTokenAtom, TEST_ID_TOKEN)
              set(adminNewEventAtom, copy)
            }}
          >
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <EventCreatePage />
                </AppSnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    // The picker field is a group of per-section spinbuttons, so the day is pasted into the first one.
    const startDay = screen
      .getByRole('group', { name: 'event.startDate' })
      .querySelector<HTMLElement>('[role="spinbutton"]')
    if (!startDay) throw new Error('Start date day section not found')
    await user.click(startDay)
    await user.keyboard('{Control>}a{/Control}')
    await user.paste(start.split('-').reverse().join('.'))
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(putEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        rotations: source.rotations,
        startDate: start,
        stations: [
          { date: start, id: 'post-1', number: 1 },
          { date: addDays(start, 1), id: 'post-2', number: 1 },
        ],
      }),
      expect.anything(),
      undefined,
      undefined
    )
  })
})
