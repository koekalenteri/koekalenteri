import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import theme from '../assets/Theme'
import { flushPromises } from '../test-utils/utils'
import { DocsPage } from './DocsPage'

vi.mock('./components/Header', () => ({ default: () => <>header</> }))

const renderAt = (path: string) => {
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/ohjeet/*" element={children} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  )

  return render(<DocsPage />, { wrapper: Wrapper })
}

describe('DocsPage', () => {
  it('renders the page named by the path', async () => {
    renderAt('/ohjeet/ilmoittautujalle/ilmoittautuminen')
    await flushPromises()

    expect(screen.getByRole('heading', { level: 1, name: 'Kokeeseen ilmoittautuminen' })).toBeInTheDocument()
    // A heading from the markdown itself: the page is rendered, not just its title.
    expect(screen.getByRole('heading', { level: 2, name: 'Etsi koe kalenterista' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'docs.title' })).toHaveAttribute('href', '/ohjeet')
  })

  it('says so when the path names no page', async () => {
    renderAt('/ohjeet/ei-tallaista')
    await flushPromises()

    expect(screen.getByRole('heading', { name: 'docs.notFound' })).toBeInTheDocument()
  })
})
