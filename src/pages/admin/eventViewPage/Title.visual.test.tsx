import type { ConfirmedEvent } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '@/__mockData__/events'
import theme from '@/assets/Theme'
import { ARROW_TOLERANCE, iconOffsetFromHeadingLine } from '@/test-utils/headingAlignment'
import Title from './Title'

const VIEWPORT = { height: 300, width: 900 }

/** A named trial, so the heading shows every part it can: type, dates, location and name. */
const event: ConfirmedEvent = { ...eventWithStaticDates, name: 'Kevätkokeet' }

// The head of the event view: the way back to the list (KOE-541), the heading with the trial's name
// (KOE-647), and the progress stepper beneath them.
it('heads the event view with a way back, the trial and its progress', async () => {
  await page.viewport(VIEWPORT.width, VIEWPORT.height)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', boxSizing: 'border-box', padding: 8, width: '100%' }}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <Title event={event} />
        </MemoryRouter>
      </ThemeProvider>
    </div>
  )

  const back = screen.getByRole('link', { name: 'Takaisin tapahtumalistaan' })
  await expect.element(back).toBeVisible()
  expect(
    Math.abs(iconOffsetFromHeadingLine(back.element(), screen.getByRole('heading', { level: 5 }).element()))
  ).toBeLessThan(ARROW_TOLERANCE)

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-view-title')
})

/**
 * The way back must not cost a row of its own at any width: below it is the entry list, which is
 * the thing on this page that wants height (KOE-541). On a phone the words fold into the arrow
 * rather than wrapping onto a line of their own — the arrow keeps its name for a screen reader.
 */
it('folds the way back into the arrow on a phone, still on the heading row', async () => {
  await page.viewport(390, 300)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', boxSizing: 'border-box', padding: 8, width: '100%' }}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <Title event={event} />
        </MemoryRouter>
      </ThemeProvider>
    </div>
  )

  const back = screen.getByRole('link', { name: 'Takaisin tapahtumalistaan' })
  await expect.element(back).toBeVisible()

  const backBox = back.element().getBoundingClientRect()
  const heading = screen.getByRole('heading', { level: 5 }).element()
  const headingBox = heading.getBoundingClientRect()

  // The words take no width: what is left is the arrow and the button's own padding.
  expect(backBox.width).toBeLessThan(60)
  // Same row as the heading, and on its first line — their boxes overlap vertically.
  expect(backBox.top).toBeLessThan(headingBox.bottom)
  expect(headingBox.top).toBeLessThan(backBox.bottom)
  // Still centred on that line, though here the heading wraps beneath it.
  expect(Math.abs(iconOffsetFromHeadingLine(back.element(), heading))).toBeLessThan(ARROW_TOLERANCE)

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-view-title-phone')
})
