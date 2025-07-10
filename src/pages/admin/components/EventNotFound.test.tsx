import { initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { RecoilRoot } from 'recoil'

import theme from '../../../assets/Theme'
import { i18nInit } from '../../../i18n/config'
import { Path } from '../../../routeConfig'

import EventNotFound from './EventNotFound'

jest.unmock('react-i18next')

i18n.use(initReactI18next).init(i18nInit)

// Create a wrapper component with all required providers
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </RecoilRoot>
)

describe('EventNotFound', () => {
  it('renders with error message', () => {
    const { container } = render(<EventNotFound />, { wrapper: Wrapper })

    // Check that the error icon is displayed
    expect(screen.getByTestId('ErrorOutlineIcon')).toBeInTheDocument()

    // Check that the error message is displayed
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()

    // Check that the back button is displayed and links to the events list
    const backButton = screen.getByRole('link', { name: /Takaisin tapahtumalistaan/i })
    expect(backButton).toBeInTheDocument()
    expect(backButton).toHaveAttribute('href', Path.admin.events)

    // Snapshot test
    expect(container).toMatchSnapshot()
  })

  it('renders with event ID when provided', () => {
    const testEventId = 'test-event-123'
    render(<EventNotFound eventId={testEventId} />, { wrapper: Wrapper })

    // Check that the error message includes the event ID
    expect(screen.getByText(/test-event-123/i)).toBeInTheDocument()
  })

  it('does not display event ID message when no ID is provided', () => {
    render(<EventNotFound />, { wrapper: Wrapper })

    // The secondary text should not be present
    const secondaryTexts = screen.queryAllByText(/Tapahtumaa tunnuksella/i)
    expect(secondaryTexts.length).toBe(0)
  })

  it('displays the correct text for event deletion message', () => {
    render(<EventNotFound />, { wrapper: Wrapper })

    // Check that the deletion message is displayed
    expect(screen.getByText(/Tapahtuma on saatettu poistaa tai sinulla ei ole oikeuksia/i)).toBeInTheDocument()
  })

  it('has a back button that links to the events list', () => {
    render(<EventNotFound />, { wrapper: Wrapper })

    // Check that the back button links to the events list
    const backButton = screen.getByRole('link', { name: /Takaisin tapahtumalistaan/i })
    expect(backButton).toHaveAttribute('href', Path.admin.events)
  })
})
