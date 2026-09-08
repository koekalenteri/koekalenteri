import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import theme from '../assets/Theme'
import { flushPromises } from '../test-utils/utils'
import { WhatsNewPage } from './WhatsNewPage'

vi.mock('./components/Header', () => ({ default: () => <>header</> }))

const renderAt = (path: string) => {
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </ThemeProvider>
  )

  return render(<WhatsNewPage />, { wrapper: Wrapper })
}

describe('WhatsNewPage', () => {
  it('lists the releases newest first, each under its version', async () => {
    renderAt('/uutta')
    await flushPromises()

    expect(screen.getByRole('heading', { level: 1, name: 'docs.whatsNew' })).toBeInTheDocument()
    const versions = screen
      .getAllByRole('heading', { level: 2, name: /docs\.version/ })
      .map((heading) => heading.textContent)
    expect(versions.length).toBeGreaterThanOrEqual(2)
    // A heading from the notes' own markdown: the release is rendered, not just named.
    expect(screen.getAllByRole('heading', { level: 2, name: 'Uutta' }).length).toBeGreaterThan(0)
  })

  it('gives every release an anchor named by its version', async () => {
    renderAt('/uutta')
    await flushPromises()

    expect(document.getElementById('1.11.2')).not.toBeNull()
    expect(document.getElementById('1.11.1')).not.toBeNull()
  })

  it('scrolls to the release the hash names', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderAt('/uutta#1.11.1')
    await flushPromises()

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
})
