import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { EventStateInfo } from './EventStateInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 360 }}>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </div>
)

it('says the start list is live while a post is being run (KOE-1259)', async () => {
  const screen = await render(
    <Frame>
      <EventStateInfo id="event-1" live startListPublished state="invited" />
    </Frame>
  )

  await expect.element(screen.getByText('Katso osallistujalista')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-state-info-live')
})
