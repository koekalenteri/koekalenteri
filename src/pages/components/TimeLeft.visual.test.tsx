import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { TIME_ZONE } from '../../i18n/dates'
import { TimeLeft } from './TimeLeft'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 200 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// A date years out, so the strict distance the component prints stays the same whole unit for a
// long stretch: no fake timers exist in the visual project, only real ones.
const farFuture = new TZDate('2029-01-01', TIME_ZONE)

it('prints the time left inline, with a leading margin', async () => {
  const screen = await render(
    <Frame>
      <TimeLeft date={farFuture} />
    </Frame>
  )

  await expect.element(screen.getByText(/jäljellä/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('time-left')
})
