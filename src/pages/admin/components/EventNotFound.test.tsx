import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { Provider } from 'jotai'
import { initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import theme from '../../../assets/Theme'
import { i18nInit } from '../../../i18n/config'
import { Path } from '../../../routeConfig'
import EventNotFound from './EventNotFound'

vi.unmock('react-i18next')

i18n.use(initReactI18next).init(i18nInit)

// Create a wrapper component with all required providers
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider>
    <ThemeProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </ThemeProvider>
  </Provider>
)

describe('EventNotFound', () => {
  it('renders with error message', () => {
    const { container } = render(<EventNotFound />, { wrapper: Wrapper })

    // Check that the error icon is displayed
    expect(screen.getByTestId('ErrorOutlineIcon')).toBeInTheDocument()

    // Check that the error message is displayed
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()

    // Check that the back button is displayed and links to the events list
    const backButton = screen.getByRole('link', { name: 'backToEventsList' })
    expect(backButton).toBeInTheDocument()
    expect(backButton).toHaveAttribute('href', Path.admin.events)

    // Snapshot test
    expect(container).toMatchSnapshot()
  })

  it('displays the correct text for event deletion message', () => {
    render(<EventNotFound />, { wrapper: Wrapper })

    // Check that the deletion message is displayed
    expect(screen.getByText('error.eventMayHaveBeenDeleted')).toBeInTheDocument()
  })

  it('has a back button that links to the events list', () => {
    render(<EventNotFound />, { wrapper: Wrapper })

    // Check that the back button links to the events list
    const backButton = screen.getByRole('link', { name: 'backToEventsList' })
    expect(backButton).toHaveAttribute('href', Path.admin.events)
  })
})
