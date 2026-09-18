import { ThemeProvider } from '@mui/material/styles'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import theme from '@/assets/Theme'
import { BackLink } from './BackLink'

/**
 * Whether the words are shown or clipped is a breakpoint in CSS, and jsdom does not apply media
 * queries — that half is asserted in BackLink's visual tests, at both widths. What belongs here is
 * what the link is regardless of width: where it goes, and the name it answers to.
 */
describe('BackLink', () => {
  it('is a link to where it says, named by its words at every width', () => {
    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <BackLink headingVariant="h5" label="Takaisin tapahtumalistaan" to="/admin/events" />
        </MemoryRouter>
      </ThemeProvider>
    )

    const link = screen.getByRole('link', { name: 'Takaisin tapahtumalistaan' })
    expect(link).toHaveAttribute('href', '/admin/events')
  })
})
