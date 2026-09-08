import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  // The report names the page, the version and the language, so the reader need not (KOE-1402).
  it('offers a feedback form filled in with where the reader was', async () => {
    renderAt('/ohjeet/ilmoittautujalle/ilmoittautuminen')
    await flushPromises()

    const href = screen.getByRole('link', { name: 'docs.feedback' }).getAttribute('href') ?? ''
    const url = new URL(href)
    expect(url.origin + url.pathname).toBe(
      'https://koekalenteri.atlassian.net/servicedesk/customer/portal/1/group/1/create/1'
    )
    // The test translator echoes the key and the names of the values it was given.
    expect(url.searchParams.get('summary')).toBe('docs.feedbackSummary title')
    expect(url.searchParams.get('description')).toBe('docs.feedbackBody language, path, version')
  })

  it('renders the rules with their sections searchable', async () => {
    const user = userEvent.setup()
    renderAt('/ohjeet/saannot/noutajien-kokeet')
    await flushPromises()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Noutajien rodunomaisten kokeiden säännöt ja ohjeet' })
    ).toBeInTheDocument()
    // §1.1 is reachable as /ohjeet/saannot/noutajien-kokeet#s-1-1, the anchor the code links to.
    expect(document.getElementById('s-1-1')).toContainElement(
      screen.getByRole('heading', { level: 4, name: /MUUTOKSET SÄÄNTÖIHIN/ })
    )

    await user.type(screen.getByRole('searchbox', { name: 'docs.rulesSearch' }), 'jääviyssääntöä')

    expect(await screen.findByRole('heading', { level: 4, name: /JÄÄVIYS/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 4, name: /MUUTOKSET SÄÄNTÖIHIN/ })).not.toBeInTheDocument()
  })

  it('says so when the path names no page', async () => {
    renderAt('/ohjeet/ei-tallaista')
    await flushPromises()

    expect(screen.getByRole('heading', { name: 'docs.notFound' })).toBeInTheDocument()
  })
})
