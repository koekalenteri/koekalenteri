import type { DogEvent, Registration } from '@/types'
import { ThemeProvider } from '@mui/material'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { act, screen, within } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { Suspense } from 'react'
import { eventWithEntryNotYetOpen, eventWithStaticDates } from '@/__mockData__/events'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { getLocations } from '@/api/location'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { adminEventRegistrationsAtom, adminEventTypesAtom } from '@/pages/admin/state'
import { idTokenAtom } from '@/pages/state'
import { expectConsoleOutput } from '@/test-utils/consoleGuard'
import {
  DataMemoryRouter,
  flushPromises,
  renderSuspended,
  renderSuspendedWithUserEvents,
  runPendingTimers,
  TEST_ID_TOKEN,
} from '@/test-utils/utils'
import EventForm from './EventForm'

vi.mock('@/api/user')
vi.mock('@/api/event')
vi.mock('@/api/eventType')
vi.mock('@/api/judge')
vi.mock('@/api/location')
vi.mock('@/api/official')
vi.mock('@/api/organizer')
vi.mock('@/api/registration')

const renderComponent = (event: DogEvent, onSave?: () => Promise<void>, onCancel?: () => void, onChange?: () => void) =>
  renderSuspendedWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Provider>
          <Suspense fallback={<div>loading?...</div>}>
            <EventForm event={event} canSave onSave={onSave} onCancel={onCancel} onChange={onChange} />
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )

describe('EventForm', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(runPendingTimers)
  afterAll(() => vi.useRealTimers())

  it('should render', async () => {
    await renderComponent(eventWithStaticDates)
    await flushPromises()
    expect(screen.getByLabelText('event.name (locale.fi)')).toHaveValue(eventWithStaticDates.name)
  })

  // KOE-1440: the basic-info slice must carry the translations, or the saved English name reads as
  // empty while the form still holds it, and typing it again is no change to save.
  it('shows the saved English name', async () => {
    await renderComponent({ ...eventWithStaticDates, names: { en: 'Autumn trial' } })
    await flushPromises()
    expect(screen.getByLabelText('event.name (locale.fi)')).toHaveValue(eventWithStaticDates.name)
    expect(screen.getByLabelText('event.name (locale.en)')).toHaveValue('Autumn trial')
  })

  it('should fire onSave and onCancel', async () => {
    const saveHandler = vi.fn()
    const cancelHandler = vi.fn()
    const changeHandler = vi.fn()

    const { user } = await renderComponent(eventWithEntryNotYetOpen, saveHandler, cancelHandler, changeHandler)
    await flushPromises()

    // Find the save button by its role and icon
    const saveButton = screen.getAllByRole('button').find((button) => button.querySelector('[data-testid="SaveIcon"]'))
    expect(saveButton).toBeDefined()
    expect(saveButton).toBeEnabled()

    await user.click(saveButton as HTMLElement)
    await flushPromises()
    expect(saveHandler).toHaveBeenCalledTimes(1)

    // Find the cancel button by its role and icon
    const cancelButton = screen
      .getAllByRole('button')
      .find((button) => button.querySelector('[data-testid="CancelIcon"]'))
    expect(cancelButton).not.toBeUndefined()
    await user.click(cancelButton as HTMLElement)
    await flushPromises()
    expect(cancelHandler).toHaveBeenCalledTimes(1)
  })

  // KOE-1718: every section slice carries the official type an unofficial trial follows, so the judges
  // section reads the NOWT's layout: no judge per class. KOE-1723: and it asks for no number of judges.
  it('reads the judges section by the official type an unofficial trial follows', async () => {
    const { user } = await renderComponent({
      ...eventWithEntryNotYetOpen,
      eventType: 'WT-harjoitus',
      officialFormat: 'NOWT',
      state: 'confirmed',
    })
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'judges' }))
    await flushPromises()

    expect(screen.queryByText(/^validation\.event\.judgeCount/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'judge 1' })).toBeVisible()
    for (const picker of screen.getAllByLabelText('event.judgesEditor.classes')) expect(picker).not.toBeVisible()

    // The entry section offers NOWT's entry times: the whole day, and no half days.
    await user.click(screen.getByRole('button', { name: 'event.entrySectionTitle' }))
    await flushPromises()
    await user.click(screen.getByRole('combobox', { name: 'registration.dates' }))
    const times = screen.getAllByRole('option').map((option) => option.textContent)
    expect(times.length).toBeGreaterThan(0)
    expect(times.every((time) => time?.includes('registration.timeLong.kp'))).toBe(true)
  })

  // KOE-674: the basic-info slice carries the own classes, or a change of type or format reads the
  // trial as having none: their days are dropped, and an official type is not told to drop the list.
  describe("an unofficial trial's own classes", () => {
    const ownClassEvent: DogEvent = {
      ...eventWithEntryNotYetOpen,
      classes: [{ class: 'DERBY', date: eventWithEntryNotYetOpen.startDate }],
      eventType: 'WT-harjoitus',
      ownClasses: [{ code: 'DERBY', name: { fi: 'Derby' } }],
    }
    const eventType = (name: string, official: boolean) => ({
      active: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      createdBy: 'test',
      description: { en: name, fi: name, sv: name },
      eventType: name,
      modifiedAt: new Date('2026-01-01T00:00:00Z'),
      modifiedBy: 'test',
      official,
    })

    it('keeps their days when the format the trial follows changes', async () => {
      const changeHandler = vi.fn()
      const { user } = await renderComponent(ownClassEvent, undefined, undefined, changeHandler)
      await flushPromises()

      await user.click(screen.getByRole('combobox', { name: 'event.officialFormat' }))
      await user.click(screen.getByRole('option', { name: 'NOWT' }))
      await flushPromises()

      expect(changeHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ classes: [expect.objectContaining({ class: 'DERBY' })], officialFormat: 'NOWT' })
      )
    })

    it('drops the list and the days when the trial becomes an official one', async () => {
      const changeHandler = vi.fn()
      const store = createStore()
      void store.set(adminEventTypesAtom, [eventType('WT-harjoitus', false), eventType('NOWT', true)])
      const { user } = await renderSuspendedWithUserEvents(
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
            <Provider store={store}>
              <Suspense fallback={<div>loading?...</div>}>
                <EventForm event={ownClassEvent} canSave onChange={changeHandler} />
              </Suspense>
            </Provider>
          </LocalizationProvider>
        </ThemeProvider>,
        undefined,
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      await user.click(screen.getByRole('combobox', { name: 'event.eventType' }))
      await user.click(screen.getByRole('option', { name: 'NOWT' }))
      await flushPromises()

      // The form drops a field sent as null, as it drops a cleared official format.
      expect(changeHandler).toHaveBeenLastCalledWith(expect.objectContaining({ classes: [], eventType: 'NOWT' }))
      expect(changeHandler).toHaveBeenLastCalledWith(expect.not.objectContaining({ ownClasses: expect.anything() }))
    })
  })

  it('keeps an unsaved past event editable', async () => {
    const saveHandler = vi.fn()

    await renderComponent({ ...eventWithStaticDates, id: '' }, saveHandler)
    await flushPromises()

    const saveButton = screen.getAllByRole('button').find((button) => button.querySelector('[data-testid="SaveIcon"]'))
    expect(saveButton).toBeEnabled()
  })

  it('keeps a past draft editable', async () => {
    const saveHandler = vi.fn()

    await renderComponent({ ...eventWithStaticDates, state: 'draft' }, saveHandler)
    await flushPromises()

    const saveButton = screen.getAllByRole('button').find((button) => button.querySelector('[data-testid="SaveIcon"]'))
    expect(saveButton).toBeEnabled()
  })

  it('locks a saved non-draft past event', async () => {
    const saveHandler = vi.fn()

    await renderComponent(eventWithStaticDates, saveHandler)
    await flushPromises()

    const saveButton = screen.getAllByRole('button').find((button) => button.querySelector('[data-testid="SaveIcon"]'))
    expect(saveButton).toBeDisabled()
  })

  // KOE-1463: the form renders nothing until every list it offers has loaded, so a list that never
  // answers used to leave the secretary looking at the spinner for as long as she cared to wait.
  it('gives up on a load that never finishes instead of spinning forever', async () => {
    expectConsoleOutput(/loading the event form options timed out/)
    vi.mocked(getLocations).mockReturnValueOnce(new Promise(() => {}))
    const store = createStore()
    store.set(idTokenAtom, TEST_ID_TOKEN)

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider store={store}>
            <DataMemoryRouter
              routes={[
                {
                  element: <EventForm event={eventWithStaticDates} canSave />,
                  errorElement: <p>error page</p>,
                  path: '/',
                },
              ]}
            />
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    expect(screen.queryByText('error page')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(screen.getByText('error page')).toBeInTheDocument()
  })

  // KOE-1568: the event's registrations lock its payment terms, and with an early-bird rate the entry
  // start the rate counts from.
  describe('payment terms locked by registrations', () => {
    const pricedEvent: DogEvent = {
      ...eventWithEntryNotYetOpen,
      cost: { earlyBird: { cost: 30, days: 7 }, normal: 40 },
      costMember: { normal: 35 },
      paymentTime: 'registration',
    }

    const ready: Registration = { ...registrationWithStaticDates, state: 'ready' }

    const renderWithRegistrations = async (event: DogEvent, registrations: Registration[]) => {
      const store = createStore()
      store.set(idTokenAtom, TEST_ID_TOKEN)
      store.set(adminEventRegistrationsAtom(event.id), registrations)
      await renderSuspended(
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
            <Provider store={store}>
              <DataMemoryRouter routes={[{ element: <EventForm event={event} canSave />, path: '/' }]} />
            </Provider>
          </LocalizationProvider>
        </ThemeProvider>
      )
      await flushPromises()
    }

    it('locks the payment section and the entry start when the event has registrations', async () => {
      await renderWithRegistrations(pricedEvent, [ready])

      expect(screen.getByText('event.paymentLockedReason')).toBeInTheDocument()
      expect(screen.getByText('event.entryStartLockedReason')).toBeInTheDocument()
      expect(within(screen.getByTestId('cost.normal')).getByRole('textbox', { hidden: true })).toBeDisabled()
    })

    it('leaves the entry start open without an early-bird rate', async () => {
      await renderWithRegistrations({ ...pricedEvent, cost: { normal: 40 } }, [ready])

      expect(screen.getByText('event.paymentLockedReason')).toBeInTheDocument()
      expect(screen.queryByText('event.entryStartLockedReason')).not.toBeInTheDocument()
    })

    it('leaves the payment terms open while the event has no registrations', async () => {
      await renderWithRegistrations(pricedEvent, [])

      expect(screen.queryByText('event.paymentLockedReason')).not.toBeInTheDocument()
      expect(screen.queryByText('event.entryStartLockedReason')).not.toBeInTheDocument()
      expect(within(screen.getByTestId('cost.normal')).getByRole('textbox', { hidden: true })).toBeEnabled()
    })
  })
})
