import type { ConfirmedEvent } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../../../__mockData__/events'
import theme from '../../../assets/Theme'
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

  await expect.element(screen.getByRole('link', { name: 'Takaisin tapahtumalistaan' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-view-title')
})
