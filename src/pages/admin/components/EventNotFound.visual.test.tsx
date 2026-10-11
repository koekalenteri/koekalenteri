import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import EventNotFound from './EventNotFound'

it('says the trial is gone, as the heading of the page', async () => {
  await page.viewport(800, 500)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', height: 500, width: 800 }}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <EventNotFound />
        </MemoryRouter>
      </ThemeProvider>
    </div>
  )

  // It stands in for a whole admin page, so its one heading is the page's own (KOE-1506).
  await expect.element(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tapahtumaa ei löydy.')
  expect(screen.getByRole('heading').elements()).toHaveLength(1)
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-not-found')
})
