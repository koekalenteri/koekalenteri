import { ThemeProvider } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { ARROW_TOLERANCE, iconOffsetFromHeadingLine } from '@/test-utils/headingAlignment'
import { EntryPageHeader } from './EntryPageHeader'

const DESKTOP = { height: 200, width: 900 }
const PHONE = { height: 220, width: 390 }

const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', boxSizing: 'border-box', width: '100%' }}>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </div>
)

const event = {
  endDate: '2021-02-11',
  eventType: 'NOME-B',
  id: 'test-event',
  location: 'Vaasa',
  name: 'Kevätkoe',
  startDate: '2021-02-10',
} as const

const header = (
  <EntryPageHeader event={event} title="Starttinumerot">
    <Typography sx={{ color: 'text.secondary' }} variant="body2">
      Numerot syötetään arvonnan jälkeen.
    </Typography>
  </EntryPageHeader>
)

// The head of a batch entry screen: the way back on the title's row (KOE-541), which trial this is
// beneath them (KOE-1699), and then what the screen itself says.
it('heads a batch entry screen with the way back beside the title', async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height)

  const screen = await render(<Frame>{header}</Frame>)

  const back = screen.getByRole('link', { name: 'Takaisin tapahtumaan' })
  await expect.element(back).toBeVisible()
  expect(
    Math.abs(iconOffsetFromHeadingLine(back.element(), screen.getByRole('heading', { level: 1 }).element()))
  ).toBeLessThan(ARROW_TOLERANCE)

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-page-header')
})

/** On a phone the words fold into the arrow, so the way back never costs a row of its own. */
it('folds the way back into the arrow on a phone', async () => {
  await page.viewport(PHONE.width, PHONE.height)

  const screen = await render(<Frame>{header}</Frame>)

  const back = screen.getByRole('link', { name: 'Takaisin tapahtumaan' })
  await expect.element(back).toBeVisible()
  expect(back.element().getBoundingClientRect().width).toBeLessThan(60)
  expect(
    Math.abs(iconOffsetFromHeadingLine(back.element(), screen.getByRole('heading', { level: 1 }).element()))
  ).toBeLessThan(ARROW_TOLERANCE)

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-page-header-phone')
})

/**
 * The case that rules out centring the arrow on the heading's box: once the heading wraps, its middle
 * is a line below the arrow's. The arrow belongs to the first line and stays there (KOE-541).
 */
it('keeps the arrow on the first line when the heading wraps', async () => {
  await page.viewport(PHONE.width, PHONE.height)

  const screen = await render(
    <Frame>
      <EntryPageHeader event={event} title="Starttinumerot ja niiden julkaisu luokittain ja päivittäin" />
    </Frame>
  )

  const back = screen.getByRole('link', { name: 'Takaisin tapahtumaan' })
  const heading = screen.getByRole('heading', { level: 1 }).element()
  await expect.element(back).toBeVisible()

  // Really wrapped: more than one line of heading beneath the arrow.
  const range = document.createRange()
  range.selectNodeContents(heading)
  expect(range.getClientRects().length).toBeGreaterThan(1)
  expect(Math.abs(iconOffsetFromHeadingLine(back.element(), heading))).toBeLessThan(ARROW_TOLERANCE)

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('entry-page-header-wrapped')
})
