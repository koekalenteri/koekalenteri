import type { ConfirmedEvent } from '../../../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { screen, within } from '@testing-library/react'
import { Provider } from 'jotai'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates, eventWithStaticDatesAnd3Classes } from '../../../../__mockData__/events'
import theme from '../../../../assets/Theme'
import { locales } from '../../../../i18n'
import * as env from '../../../../lib/env'
import { flushPromises, renderWithUserEvents } from '../../../../test-utils/utils'
import EntrySection from './EntrySection'

describe('EntrySection', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
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
                <SnackbarProvider>
                  <EntrySection event={testEvent} onChange={onChange} open />
                </SnackbarProvider>
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
                <SnackbarProvider>
                  <EntrySection event={testEvent} onChange={onChange} open />
                </SnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    expect(
      screen.queryByText('Ilmoittautumisaika on menneisyydessä. Tämä on sallittu vain kehitysympäristössä.')
    ).not.toBeInTheDocument()

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
                <SnackbarProvider>
                  <EntrySection event={testEvent} entryDatesChanged onChange={onChange} open />
                </SnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    expect(
      screen.getByText('Ilmoittautumisaika on menneisyydessä. Tämä on sallittu vain kehitysympäristössä.')
    ).toBeInTheDocument()
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
                <SnackbarProvider>
                  <EntrySection
                    event={testEvent}
                    errors={[
                      {
                        key: 'classesGroups',
                        opts: { field: 'classes', length: 1, list: ['VOI'] },
                      },
                    ]}
                    helperTexts={{ classes: 'VOI needs an available day' }}
                    open
                  />
                </SnackbarProvider>
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
    expect(screen.getAllByText('VOI needs an available day')).toHaveLength(1)
  })
})
