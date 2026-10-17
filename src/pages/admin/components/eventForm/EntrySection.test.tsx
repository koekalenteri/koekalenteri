import type { ConfirmedEvent } from '@/types'
import { TZDate } from '@date-fns/tz'
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
import { TIME_ZONE, zonedDateString } from '@/i18n/dates'
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
      const eventStart = new Date(new TZDate(2026, 11, 5, TIME_ZONE).getTime())
      const eventWith = (startDate: Date) => ({
        ...eventWithStaticDates,
        entryEndDate: undefined,
        entryStartDate: undefined,
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

        const [saved] = onChange.mock.lastCall ?? []
        expect(zonedDateString(saved.entryStartDate)).toBe('2026-11-02')
        expect(saved.entryStartDate.getTime()).toBe(new TZDate(2026, 10, 2, TIME_ZONE).getTime())
      })

      // The default days are whole Finnish weeks before the trial. Counted in the browser's zone the
      // day lands a day early: over the end of summer time in New York (the changes of Finland and the
      // US are a week apart), over the start of it in Tokyo.
      it.each([
        {
          calendar: 0,
          case: 'start over the end of summer time',
          day: 29,
          eventDay: new TZDate(2026, 11, 10, TIME_ZONE),
        },
        {
          calendar: 1,
          case: 'end over the start of summer time',
          day: 27,
          eventDay: new TZDate(2027, 3, 17, TIME_ZONE),
        },
      ])('marks the default $case in the calendar', async ({ calendar, day, eventDay }) => {
        testEvent = eventWith(new Date(eventDay.getTime()))
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
})
