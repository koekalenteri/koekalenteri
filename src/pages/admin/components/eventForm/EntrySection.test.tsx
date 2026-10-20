import type { ConfirmedEvent, DayKey } from '@/types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { screen, within } from '@testing-library/react'
import { Provider } from 'jotai'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates, eventWithStaticDatesAnd3Classes } from '@/__mockData__/events'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TIME_ZONE } from '@/lib/day'
import * as env from '@/lib/env'
import AppSnackbarProvider from '@/pages/components/AppSnackbarProvider'
import { describeInTimeZone } from '@/test-utils/timeZone'
import { flushPromises, renderWithUserEvents, runPendingTimers, typeDateKeyByKey } from '@/test-utils/utils'
import EntrySection from './EntrySection'

describe('EntrySection', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    runPendingTimers()
    vi.restoreAllMocks()
  })
  afterAll(() => vi.useRealTimers())

  it('does not allow selecting registration dates before creation outside development', async () => {
    const onChange = vi.fn()
    const testEvent = {
      ...eventWithStaticDates,
      createdAt: new Date('2021-02-05'),
    }
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <EntrySection event={testEvent} onChange={onChange} open />
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

    const calendarButtons = screen.getAllByTestId('CalendarIcon')
    const startCalendarButton = calendarButtons[0]

    await user.click(startCalendarButton)
    await flushPromises()

    const dialog = await screen.findByRole('dialog')

    const btn4 = within(dialog).getByRole('gridcell', { name: '4' })
    expect(btn4).toBeDisabled()

    const btn5 = within(dialog).getByRole('gridcell', { name: '5' })
    expect(btn5).toBeEnabled()

    const btn10 = within(dialog).getByRole('gridcell', { name: '10' })
    expect(btn10).toBeEnabled()

    const btn11 = within(dialog).getByRole('gridcell', { name: '11' })
    expect(btn11).toBeDisabled()
  })

  it('allows selecting past registration dates but hides the note when entry dates are not changed in development', async () => {
    vi.spyOn(env, 'isDevEnv').mockReturnValue(true)
    const onChange = vi.fn()
    const testEvent = {
      ...eventWithStaticDates,
      createdAt: new Date('2021-02-05'),
      entryEndDate: undefined,
    }
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <EntrySection event={testEvent} onChange={onChange} open />
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

    expect(screen.queryByText('event.entryInPastDevOnly')).not.toBeInTheDocument()

    const calendarButtons = screen.getAllByTestId('CalendarIcon')
    const startCalendarButton = calendarButtons[0]

    await user.click(startCalendarButton)
    await flushPromises()

    const dialog = await screen.findByRole('dialog')

    const btn4 = within(dialog).getByRole('gridcell', { name: '4' })
    expect(btn4).toBeEnabled()

    const btn11 = within(dialog).getByRole('gridcell', { name: '11' })
    expect(btn11).toBeDisabled()
  })

  it('notes the dev-only allowance when changed entry dates are in the past', async () => {
    vi.spyOn(env, 'isDevEnv').mockReturnValue(true)
    const onChange = vi.fn()
    const testEvent = {
      ...eventWithStaticDates,
      createdAt: new Date('2021-02-05'),
      entryEndDate: undefined,
    }
    renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <EntrySection event={testEvent} entryDatesChanged onChange={onChange} open />
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

    expect(screen.getByText('event.entryInPastDevOnly')).toBeInTheDocument()
  })

  it('shows a missing NOWT day error only on the affected class group', async () => {
    const testEvent: ConfirmedEvent = {
      ...eventWithStaticDatesAnd3Classes,
      classes: eventWithStaticDatesAnd3Classes.classes.map((eventClass) => ({ ...eventClass, groups: ['kp'] })),
      eventType: 'NOWT',
    }

    renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <EntrySection
                    event={testEvent}
                    errors={[
                      {
                        key: 'classesGroups',
                        opts: { field: 'classes', length: 1, list: ['VOI'] },
                      },
                    ]}
                    open
                  />
                </AppSnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    const groupSelectors = screen.getAllByRole('combobox', { name: 'registration.dates' })
    expect(groupSelectors).toHaveLength(3)
    expect(groupSelectors[0]).toHaveAttribute('aria-invalid', 'false')
    expect(groupSelectors[1]).toHaveAttribute('aria-invalid', 'false')
    expect(groupSelectors[2]).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText('validation.event.classesGroups field, length, list')).toHaveLength(1)
  })

  // KOE-808: a class dated outside the trial's days moves to its nearest day, and the secretary is told.
  // The days are keys (KOE-1547), clamped as text.
  it('moves a class dated before the start or after the end onto the trial, and says so', async () => {
    const onChange = vi.fn()
    const testEvent: ConfirmedEvent = {
      ...eventWithStaticDatesAnd3Classes,
      classes: [
        { class: 'ALO', date: '2021-02-09' },
        { class: 'AVO', date: '2021-02-10' },
        { class: 'VOI', date: '2021-02-12' },
      ],
      endDate: '2021-02-11',
      startDate: '2021-02-10',
    }
    renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <EntrySection event={testEvent} onChange={onChange} open />
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

    expect(onChange).toHaveBeenCalledWith({
      classes: [
        { class: 'ALO', date: '2021-02-10' },
        { class: 'AVO', date: '2021-02-10' },
        { class: 'VOI', date: '2021-02-11' },
      ],
    })
    // The snackbar shows the same text once, however many classes moved.
    expect(await screen.findByText('event.classMoved from, to')).toBeInTheDocument()
  })

  it('lets the secretary restrict the entry to members and named breeds (KOE-524)', async () => {
    const onChange = vi.fn()
    const testEvent = { ...eventWithStaticDates, restrictions: ['member'] }
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <AppSnackbarProvider>
                  <EntrySection event={testEvent} onChange={onChange} open />
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

    const restrictions = screen.getByTestId('event.restrictions')
    expect(within(restrictions).getByText('priority.members')).toBeInTheDocument()

    await user.click(within(restrictions).getByRole('combobox'))
    await flushPromises()

    const listbox = await screen.findByRole('listbox')
    // an invitation singles out dogs; it is not something the entry can be restricted to
    expect(within(listbox).queryByText('priority.invited')).not.toBeInTheDocument()

    await user.click(within(listbox).getByText('breed:312'))
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({ restrictions: ['member', '312'] })
  })

  describe.each([TIME_ZONE, 'America/New_York', 'Asia/Tokyo'])('the registration days in %s (KOE-1539)', (zone) => {
    describeInTimeZone(zone, () => {
      const eventStart: DayKey = '2026-12-05'
      const eventWith = (startDate: DayKey, entryStartDate?: DayKey, entryEndDate?: DayKey) => ({
        ...eventWithStaticDates,
        entryEndDate,
        entryStartDate,
        startDate,
      })
      let testEvent = eventWith(eventStart)

      const renderEntrySection = async (onChange = vi.fn()) => {
        vi.spyOn(env, 'isDevEnv').mockReturnValue(true)
        const res = renderWithUserEvents(
          <ThemeProvider theme={theme}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
              <Provider>
                <MemoryRouter>
                  <Suspense fallback={<div>loading...</div>}>
                    <AppSnackbarProvider>
                      <EntrySection event={testEvent} onChange={onChange} open />
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
        return { ...res, onChange }
      }

      it('saves the typed days as the Finnish days they show', async () => {
        const { onChange, user } = await renderEntrySection()

        await typeDateKeyByKey(user, screen.getAllByRole('group')[0], '02112026')

        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ entryStartDate: '2026-11-02' }))
      })

      it('stores the entry as open from the start of its first Finnish day to the end of its last (KOE-1548)', async () => {
        testEvent = eventWith(eventStart, '2026-11-02')
        const { onChange, user } = await renderEntrySection()

        await typeDateKeyByKey(user, screen.getAllByRole('group')[1], '20112026')

        expect(onChange).toHaveBeenLastCalledWith({
          entryEndDate: '2026-11-20',
          entryStartDate: '2026-11-02',
        })
      })

      // KOE-1568: rewriting the start when only the end changes would move the early-bird window, which a
      // trial with registrations refuses: the start is kept as it was stored.
      it('keeps the stored entry start when only the end changes', async () => {
        const stored: DayKey = '2026-11-02'
        testEvent = eventWith(eventStart, stored)
        const { onChange, user } = await renderEntrySection()

        await typeDateKeyByKey(user, screen.getAllByRole('group')[1], '20112026')

        expect(onChange).toHaveBeenLastCalledWith({
          entryEndDate: '2026-11-20',
          entryStartDate: stored,
        })
      })

      it('keeps the stored entry end when only the start changes', async () => {
        const stored: DayKey = '2026-11-20'
        testEvent = eventWith(eventStart, undefined, stored)
        const { onChange, user } = await renderEntrySection()

        await typeDateKeyByKey(user, screen.getAllByRole('group')[0], '02112026')

        expect(onChange).toHaveBeenLastCalledWith({
          entryEndDate: stored,
          entryStartDate: '2026-11-02',
        })
      })

      // A stored day moved to another one (only its day typed over) takes the new day's bound; the other
      // keeps its stored value.
      it.each([
        { field: 'start', group: 0, moved: { entryStartDate: '2026-11-04' }, typed: '04' },
        { field: 'end', group: 1, moved: { entryEndDate: '2026-11-18' }, typed: '18' },
      ])('moves a stored $field to the day typed', async ({ group, moved, typed }) => {
        const start: DayKey = '2026-11-02'
        const end: DayKey = '2026-11-20'
        testEvent = eventWith(eventStart, start, end)
        const { onChange, user } = await renderEntrySection()

        await typeDateKeyByKey(user, screen.getAllByRole('group')[group], typed)

        expect(onChange).toHaveBeenLastCalledWith({ entryEndDate: end, entryStartDate: start, ...moved })
      })

      // A cleared field empties its date, however the other one was stored.
      it.each([
        { calendar: 0, cleared: { entryStartDate: undefined }, field: 'start' },
        { calendar: 1, cleared: { entryEndDate: undefined }, field: 'end' },
      ])('empties the $field when it is cleared', async ({ calendar, cleared }) => {
        const start: DayKey = '2026-11-02'
        const end: DayKey = '2026-11-20'
        testEvent = eventWith(eventStart, start, end)
        const { onChange, user } = await renderEntrySection()

        await user.click(screen.getAllByTestId('CalendarIcon')[calendar])
        await flushPromises()
        await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Clear' }))
        await flushPromises()

        expect(onChange).toHaveBeenLastCalledWith({ entryEndDate: end, entryStartDate: start, ...cleared })
      })

      // The default days are whole Finnish weeks before the trial. Counted in the browser's zone the
      // day lands a day early: over the end of summer time in New York (the changes of Finland and the
      // US are a week apart), over the start of it in Tokyo.
      it.each([
        {
          calendar: 0,
          case: 'start over the end of summer time',
          day: 29,
          eventDay: '2026-12-10' as const,
        },
        {
          calendar: 1,
          case: 'end over the start of summer time',
          day: 27,
          eventDay: '2027-04-17' as const,
        },
      ])('marks the default $case in the calendar', async ({ calendar, day, eventDay }) => {
        testEvent = eventWith(eventDay)
        const { user } = await renderEntrySection()

        await user.click(screen.getAllByTestId('CalendarIcon')[calendar])
        const dialog = await screen.findByRole('dialog')

        expect(getComputedStyle(within(dialog).getByRole('gridcell', { name: String(day) })).borderTopWidth).toBe('2px')
        expect(
          getComputedStyle(within(dialog).getByRole('gridcell', { name: String(day - 1) })).borderTopWidth
        ).not.toBe('2px')
      })
    })
  })

  // KOE-1568: the early-bird rate counts its days from the entry start, so a registration fixes it.
  describe('a locked entry start', () => {
    const renderLocked = async (entryStartLocked: boolean) => {
      renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
            <Provider>
              <MemoryRouter>
                <Suspense fallback={<div>loading...</div>}>
                  <AppSnackbarProvider>
                    <EntrySection
                      entryStartLocked={entryStartLocked}
                      event={eventWithStaticDates}
                      onChange={vi.fn()}
                      open
                    />
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
      return screen.getAllByTestId('CalendarIcon').map((icon) => icon.closest('button'))
    }

    it('disables the start, keeps the end, and says why', async () => {
      const [start, end] = await renderLocked(true)

      expect(start).toBeDisabled()
      expect(end).toBeEnabled()
      expect(screen.getByText('event.entryStartLockedReason')).toBeInTheDocument()
    })

    it('leaves the start editable when not locked', async () => {
      const [start] = await renderLocked(false)

      expect(start).toBeEnabled()
      expect(screen.queryByText('event.entryStartLockedReason')).not.toBeInTheDocument()
    })
  })
})
