import type { RouteObject } from 'react-router'
import type { Language } from '../types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Suspense } from 'react'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../__mockData__/events'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import theme from '../assets/Theme'
import { locales } from '../i18n'
// The open/download links' black/bold/underlined look is a global class, not a theme override.
import '../index.css'
import { Path } from '../routeConfig'
import { TestProvider } from '../test-utils/AtomProvider'
import { describeInLanguage } from '../test-utils/language'
import { DataMemoryRouter } from '../test-utils/utils'
import { LoadingPage } from './LoadingPage'
import { Component as RegistrationInvitation } from './RegistrationInvitation'

/** The page with its invitation loaded, as the route renders it. */
const renderInvitation = (language: Language = 'fi') => {
  const invitationUrl = '/test-invitation-url'
  const path = Path.invitation(registrationWithStaticDates)
  const routes: RouteObject[] = [
    {
      element: <RegistrationInvitation />,
      hydrateFallbackElement: <>hydrate fallback</>,
      loader: async () => ({
        data: Promise.resolve({
          event: eventWithStaticDates,
          registration: {
            ...registrationWithStaticDates,
            invitationAttachmentUpdatedAt: new Date('2026-07-28T10:00:00.000Z'),
          },
          url: invitationUrl,
        }),
      }),
      path,
    },
  ]

  return render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 500 }}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <TestProvider>
            <Suspense fallback={<LoadingPage />}>
              <DataMemoryRouter initialEntries={[path]} routes={routes} />
            </Suspense>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  )
}

it('shows the printable invitation with its open/download links', async () => {
  const screen = await renderInvitation()

  await expect.element(screen.getByRole('link', { name: 'Avaa koekutsu' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-invitation-open')
})

// The guide's English page shows the page in English (KOE-1437).
describeInLanguage('en', () => {
  it('shows the printable invitation with its open/download links', async () => {
    const screen = await renderInvitation('en')

    await expect.element(screen.getByRole('link', { name: 'Open invitation' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('registration-invitation-open-en')
  })
})
