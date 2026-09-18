import { ThemeProvider } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { ARROW_TOLERANCE, iconOffsetFromHeadingLine } from '@/test-utils/headingAlignment'
import { EntryPageHeader } from './EntryPageHeader'

const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', boxSizing: 'border-box', width: '100%' }}>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </div>
)

const header = (
  <EntryPageHeader eventId="test-event" title="Starttinumerot">
    <Typography variant="body2">NOME-B, 10.–11.2.2021, test location</Typography>
  </EntryPageHeader>
)

// The head of a batch entry screen: the way back on the title's row, and what the screen says about
// the trial beneath them (KOE-541).
it('heads a batch entry screen with the way back beside the title', async () => {
  await page.viewport(900, 200)

  const screen = await render(<Frame>{header}</Frame>)

  const back = screen.getByRole('link', { name: 'Takaisin tapahtumaan' })
  await expect.element(back).toBeVisible()
  expect(
    Math.abs(iconOffsetFromHeadingLine(back.element(), screen.getByRole('heading', { level: 6 }).element()))
  ).toBeLessThan(ARROW_TOLERANCE)

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-page-header')
})

/** On a phone the words fold into the arrow, so the way back never costs a row of its own. */
it('folds the way back into the arrow on a phone', async () => {
  await page.viewport(390, 200)

  const screen = await render(<Frame>{header}</Frame>)

  const back = screen.getByRole('link', { name: 'Takaisin tapahtumaan' })
  await expect.element(back).toBeVisible()
  expect(back.element().getBoundingClientRect().width).toBeLessThan(60)
  expect(
    Math.abs(iconOffsetFromHeadingLine(back.element(), screen.getByRole('heading', { level: 6 }).element()))
  ).toBeLessThan(ARROW_TOLERANCE)

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-page-header-phone')
})

/**
 * The case that rules out centring the arrow on the heading's box: once the heading wraps, its middle
 * is a line below the arrow's. The arrow belongs to the first line and stays there (KOE-541).
 */
it('keeps the arrow on the first line when the heading wraps', async () => {
  await page.viewport(420, 220)

  const screen = await render(
    <Frame>
      <EntryPageHeader eventId="test-event" title="Starttinumerot ja niiden julkaisu luokittain ja päivittäin">
        <Typography variant="body2">NOME-B, 10.–11.2.2021, test location</Typography>
      </EntryPageHeader>
    </Frame>
  )

  const back = screen.getByRole('link', { name: 'Takaisin tapahtumaan' })
  const heading = screen.getByRole('heading', { level: 6 }).element()
  await expect.element(back).toBeVisible()

  // Really wrapped: more than one line of heading beneath the arrow.
  const range = document.createRange()
  range.selectNodeContents(heading)
  expect(range.getClientRects().length).toBeGreaterThan(1)
  expect(Math.abs(iconOffsetFromHeadingLine(back.element(), heading))).toBeLessThan(ARROW_TOLERANCE)

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-page-header-wrapped')
})
