import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import { eventWithParticipantsInvited } from '@/__mockData__/events'
import theme from '@/assets/Theme'
import { TIME_ZONE } from '@/i18n/dates'
import { EventListItem } from './EventListItem'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </div>
)

const day = (iso: string) => new TZDate(iso, TIME_ZONE)

/**
 * The row has to hold still in two ways at once, and pinning the event's dates only gave one of
 * them. It stopped the date changing pixels every day (KOE-1296), but what the row *says* is read
 * off where the event sits relative to today: the pinned 9.9.2026 was a week ahead when the
 * baselines were taken, and the morning the real clock passed it the row stopped saying the
 * invitations were out and started saying the trial was over. The test names its own today, so
 * neither the wording nor the pixels depend on the day it runs.
 */
const TODAY = day('2026-09-02T12:00:00')

beforeAll(() => {
  // Date alone. The screenshot matcher polls on real timers and MUI's transitions need them too, so
  // freezing those would hang the capture rather than steady it.
  vi.useFakeTimers({ now: TODAY.getTime(), toFake: ['Date'] })
})

afterAll(() => {
  vi.useRealTimers()
})

const invitedEvent = {
  ...eventWithParticipantsInvited,
  classes: eventWithParticipantsInvited.classes.map((c) => ({ ...c, date: day('2026-09-09') })),
  endDate: day('2026-09-09'),
  entryEndDate: day('2026-08-19'),
  entryStartDate: day('2026-08-05'),
  startDate: day('2026-09-09'),
  startListPublished: false,
}

it('says the invitations are out while the start list is still unpublished (KOE-1296)', async () => {
  const screen = await render(
    <Frame>
      <EventListItem event={invitedEvent} />
    </Frame>
  )

  await expect.element(screen.getByText('Koekutsut lähetetty')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-list-item-invited-unpublished')
})

it('names a NOWT that is a Mock trial as one (KOE-308)', async () => {
  const mockTrial = {
    ...invitedEvent,
    classes: [
      { class: 'AVO' as const, date: day('2026-09-09') },
      { class: 'VOI' as const, date: day('2026-09-09') },
    ],
    eventType: 'NOWT',
    mockTrial: true,
  }

  const screen = await render(
    <Frame>
      <EventListItem event={mockTrial} />
    </Frame>
  )

  await expect.element(screen.getByText('NOWT (Mock trial)')).toBeVisible()
  // The same wording this file's other test guards. Without it the drift went unnoticed here: a
  // caption swapped for another of about the same size stays inside the comparator's 1% tolerance,
  // so this screenshot went on passing while the row said the trial was over.
  await expect.element(screen.getByText('Koekutsut lähetetty')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-list-item-mock-trial')
})
