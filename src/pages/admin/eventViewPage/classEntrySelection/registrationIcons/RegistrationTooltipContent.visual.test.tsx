import type { ConfirmedEvent, Registration } from '../../../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { registrationWithStaticDates } from '../../../../../__mockData__/registrations'
import { eventWithStations } from '../../../../../__mockData__/resultsEvent'
import theme from '../../../../../assets/Theme'
import RegistrationTooltipContent from './RegistrationTooltipContent'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 460 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// The ALO class has been invited, so a participant of it is owed a koekutsu.
const event: ConfirmedEvent = {
  ...eventWithStations,
  classes: eventWithStations.classes.map((eventClass) => ({ ...eventClass, state: 'invited' as const })),
  state: 'invited',
}

// Lifted from the reserve list after the class was invited: it has had the koepaikkailmoitus, and
// the koekutsu is the one thing still waiting — for the fee (KOE-1191). The other rows are there so
// the picture shows how the waiting koekutsu sits among the marks the secretary reads at a glance.
const liftedFromReserve: Registration = {
  ...registrationWithStaticDates,
  class: 'ALO',
  confirmed: false,
  eventId: event.id,
  eventType: event.eventType,
  group: { date: event.startDate, key: 'ALO-AP', number: 3, time: 'ap' },
  handler: { ...registrationWithStaticDates.handler, membership: true },
  id: 'lifted-from-reserve',
  internalNotes: '',
  invitationRead: false,
  messagesSent: { picked: true },
  notes: 'Koira saapuu vasta puoleltapäivin',
  paidAmount: undefined,
  paidAt: undefined,
  paymentStatus: undefined,
}

it('says what the koekutsu of a lifted reserve is waiting for', async () => {
  const screen = await render(
    <Frame>
      <RegistrationTooltipContent
        event={event}
        reg={liftedFromReserve}
        priority={false}
        manualResultCount={0}
        rankingPoints={0}
      />
    </Frame>
  )

  await expect.element(screen.getByText('Koekutsu lähtee, kun koepaikka on maksettu')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('invitation-awaiting-payment')
})
