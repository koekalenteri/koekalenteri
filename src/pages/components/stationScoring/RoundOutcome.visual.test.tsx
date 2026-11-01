import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { RoundOutcome } from './RoundOutcome'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 320 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// A NOWT round ends early one of four ways, the hylkäävät virheet waiting on KOE-1299: the handler withdraws,
// the dog is hurt or falls ill, or the judge stops the trial (KOE-1669). The menu opens over the page,
// so the capture is the menu itself.
it('offers the ways a NOWT round ends', async () => {
  await render(
    <Frame>
      <RoundOutcome
        eventType="NOWT"
        onChange={() => {}}
        stations={eventWithStations.stations ?? []}
        value={{ tasks: [] }}
      />
    </Frame>
  )

  await page.getByRole('combobox', { name: 'Keskeytys' }).click()
  const menu = page.getByRole('listbox')
  await expect.element(menu.getByRole('option', { name: 'Koira sairastui' })).toBeVisible()
  await expect(menu).toMatchScreenshot('round-outcome-nowt')
})
