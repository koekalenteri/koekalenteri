import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { LockedChangeNotice } from './LockedChangeNotice'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 700 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// The who-handles switch that would drop the member price of a paid entry (KOE-1588).
it('tells the participant that a membership change after payment is the secretary’s', async () => {
  const screen = await render(
    <Frame>
      <LockedChangeNotice onClose={() => undefined} reason="paid" section="membership" />
    </Frame>
  )

  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent('Muutosta ei voi tehdä maksun jälkeen: jäsenyystietoja voi nyt muuttaa vain koesihteeri.')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('locked-change-notice-membership-paid')
})
