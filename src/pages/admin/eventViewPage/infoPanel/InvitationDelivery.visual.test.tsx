import type { ConfirmedEvent, Registration } from '../../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import { registrationWithStaticDates } from '../../../../__mockData__/registrations'
import { eventWithStations } from '../../../../__mockData__/resultsEvent'
import theme from '../../../../assets/Theme'
import InvitationDelivery from './InvitationDelivery'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 460 }}>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </div>
)

// Both classes have been invited. ALO is the case KOE-1191 is about: one dog was lifted from the
// reserve list after the others were invited, and its koekutsu waits for the fee. AVO shows the
// finished state next to it, so the picture holds both faces of the row.
const event: ConfirmedEvent = {
  ...eventWithStations,
  classes: eventWithStations.classes.map((eventClass) => ({ ...eventClass, state: 'invited' as const })),
  state: 'invited',
}

const participant = (id: string, eventClass: 'ALO' | 'AVO', overrides: Partial<Registration>): Registration => ({
  ...registrationWithStaticDates,
  class: eventClass,
  eventId: event.id,
  eventType: event.eventType,
  group: { date: event.startDate, key: `${eventClass}-AP`, number: 1, time: 'ap' },
  id,
  ...overrides,
})

const invited = { messagesSent: { invitation: true, picked: true } }
const liftedFromReserve = {
  messagesSent: { picked: true },
  paidAmount: undefined,
  paidAt: undefined,
  paymentStatus: undefined,
}

const numbers = { cancelled: 0, invalid: false, participants: 2, places: 8, reserve: 1, value: 25 }

it('names the koekutsu that waits for its payment, beside a class that is done', async () => {
  const screen = await render(
    <Frame>
      <InvitationDelivery
        attachmentHistory={{}}
        classAttachmentKeys={{}}
        entryEnded
        event={event}
        eventFinished={false}
        numbersByClass={{ ALO: numbers, AVO: numbers }}
        onUpload={() => () => undefined}
        selectedByClass={{
          ALO: [participant('alo-1', 'ALO', invited), participant('alo-2', 'ALO', liftedFromReserve)],
          AVO: [participant('avo-1', 'AVO', invited)],
        }}
        stateByClass={{ ALO: 'invited', AVO: 'invited' }}
      />
    </Frame>
  )

  await expect.element(screen.getByText('1 koekutsu odottaa koepaikan maksua')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('invitation-delivery')
})
