import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithParticipantsInvited } from '../../../__mockData__/events'
import { registrationsToEventWithParticipantsInvited } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import MessageRecipientsDialog from './MessageRecipientsDialog'

// The dialog shows no dates, so the fixture's rolling entry dates cannot move the capture.
// ALO has two participants and two reserves, AVO two participants and none on the reserve list.
it('names the recipient groups of every class, with the participants picked to begin with (KOE-1073)', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <MessageRecipientsDialog
        event={eventWithParticipantsInvited}
        onCancel={() => {}}
        onContinue={() => {}}
        open
        registrations={registrationsToEventWithParticipantsInvited}
      />
    </ThemeProvider>
  )

  // The dialog renders through a portal, so the capture is the dialog itself, not a frame around it.
  await expect(screen.getByRole('dialog')).toMatchScreenshot('message-recipients')
})
