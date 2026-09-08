import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import theme from '../assets/Theme'
import { flushPromises } from '../test-utils/utils'
import { DocsIndexPage } from './DocsIndexPage'

vi.mock('./components/Header', () => ({ default: () => <>header</> }))

const Wrapper = ({ children }: { readonly children: ReactNode }) => (
  <ThemeProvider theme={theme}>
    <MemoryRouter initialEntries={['/ohjeet']}>{children}</MemoryRouter>
  </ThemeProvider>
)

describe('DocsIndexPage', () => {
  it('lists the pages under their audience, linking to each', async () => {
    render(<DocsIndexPage />, { wrapper: Wrapper })
    await flushPromises()

    expect(screen.getByRole('heading', { name: 'docs.title' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'docs.audience.participant' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kokeeseen ilmoittautuminen' })).toHaveAttribute(
      'href',
      '/ohjeet/ilmoittautujalle/ilmoittautuminen'
    )
  })

  it('lists the rules after the guides', async () => {
    render(<DocsIndexPage />, { wrapper: Wrapper })
    await flushPromises()

    expect(screen.getByRole('heading', { name: 'docs.rules' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Noutajien rodunomaisten kokeiden säännöt ja ohjeet' })).toHaveAttribute(
      'href',
      '/ohjeet/saannot/noutajien-kokeet'
    )
  })

  // Nothing is written for the other audiences yet, and an empty heading would only puzzle a reader.
  it('leaves out an audience that has no pages', async () => {
    render(<DocsIndexPage />, { wrapper: Wrapper })
    await flushPromises()

    expect(screen.queryByRole('heading', { name: 'docs.audience.admin' })).not.toBeInTheDocument()
  })
})
