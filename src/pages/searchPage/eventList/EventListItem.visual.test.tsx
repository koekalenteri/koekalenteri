import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import { eventWithParticipantsInvited } from '../../../__mockData__/events'
import theme from '../../../assets/Theme'
import { EventListItem } from './EventListItem'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </div>
)

it('says the invitations are out while the start list is still unpublished (KOE-1296)', async () => {
  const screen = await render(
    <Frame>
      <EventListItem event={{ ...eventWithParticipantsInvited, startListPublished: false }} />
    </Frame>
  )

  await expect.element(screen.getByText('Koekutsut lähetetty')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-list-item-invited-unpublished')
})
