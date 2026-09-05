import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import { eventWithParticipantsInvited } from '../../../__mockData__/events'
import theme from '../../../assets/Theme'
import { TIME_ZONE } from '../../../i18n/dates'
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

// The shared mock places the event a week from the real clock, so its row would show a different
// date every day and drift past the comparator's tolerance; the screenshot needs the dates pinned.
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
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-list-item-mock-trial')
})
