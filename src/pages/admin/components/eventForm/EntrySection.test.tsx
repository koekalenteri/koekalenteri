import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { screen, within } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../../../../__mockData__/events'
import theme from '../../../../assets/Theme'
import { locales } from '../../../../i18n'
import { flushPromises, renderWithUserEvents } from '../../../../test-utils/utils'

import EntrySection from './EntrySection'

describe('EntrySection', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should not allow selecting dates outside of range', async () => {
    const onChange = jest.fn()
    const testEvent = {
      ...eventWithStaticDates,
      createdAt: new Date('2021-02-05'),
    }
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <RecoilRoot>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <SnackbarProvider>
                  <EntrySection event={testEvent} onChange={onChange} open />
                </SnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </RecoilRoot>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
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
})
