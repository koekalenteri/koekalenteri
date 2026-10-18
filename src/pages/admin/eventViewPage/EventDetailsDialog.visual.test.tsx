import type { ConfirmedEvent } from '@/types'
import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { emptyEvent } from '@/__mockData__/emptyEvent'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { TIME_ZONE } from '@/lib/day'
import { Path } from '@/routeConfig'
import { TestProvider } from '@/test-utils/AtomProvider'
import { freezeClockAt } from '@/test-utils/freezeClock'
import { describeInLanguage } from '@/test-utils/language'
import { DataMemoryRouter } from '@/test-utils/utils'
import AppSnackbarProvider from '../../components/AppSnackbarProvider'
import { adminEventsAtom, adminEventTypesAtom, adminJudgesAtom, adminOrganizersAtom, adminUsersAtom } from '../state'
import EventDetailsDialog from './EventDetailsDialog'

// The fixture carries absolute dates; a trial still ahead keeps the form editable.
freezeClockAt('2026-09-07')

const day = (iso: string) => new TZDate(iso, TIME_ZONE)

const event: ConfirmedEvent = {
  ...emptyEvent,
  classes: [{ class: 'ALO', date: day('2026-10-17') }],
  endDate: day('2026-10-17'),
  entryEndDate: day('2026-10-03'),
  entryStartDate: day('2026-09-01'),
  eventType: 'NOME-B',
  id: 'details-event',
  location: 'Vaasa',
  name: 'Syyskoe',
  names: { en: 'Autumn trial' },
  places: 20,
  retrieveType: 'game',
  startDate: day('2026-10-17'),
  state: 'confirmed',
}

const renderDialog = async () => {
  await page.viewport(900, 400)

  return render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.en}>
        <TestProvider
          initializeState={({ set }) => {
            set(adminEventsAtom, [event])
            set(adminEventTypesAtom, [])
            set(adminJudgesAtom, [])
            set(adminOrganizersAtom, [emptyEvent.organizer])
            set(adminUsersAtom, [])
          }}
        >
          <AppSnackbarProvider>
            <Suspense fallback={<div>loading...</div>}>
              <DataMemoryRouter
                initialEntries={[Path.admin.viewEvent(event.id)]}
                routes={[{ element: <EventDetailsDialog eventId={event.id} open />, path: Path.admin.viewEvent() }]}
              />
            </Suspense>
          </AppSnackbarProvider>
        </TestProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

// The event's details open over the entry view titled with the trial's name; a secretary browsing
// in English reads the English one (KOE-1453).
describeInLanguage('en', () => {
  it("titles the event's details with its English name", async () => {
    const screen = await renderDialog()

    await expect.element(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Autumn trial')
    await expect(screen.getByRole('dialog')).toMatchScreenshot('event-details-dialog-en')
  })
})
