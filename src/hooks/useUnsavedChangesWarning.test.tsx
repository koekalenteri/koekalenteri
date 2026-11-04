import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmProvider } from 'material-ui-confirm'
import { Link } from 'react-router'
import { DataMemoryRouter } from '../test-utils/utils'
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning'

const onLeave = vi.fn()

function DirtyPage({ dirty }: { readonly dirty: boolean }) {
  useUnsavedChangesWarning(dirty, onLeave)
  return (
    <div>
      <h1>Dirty page</h1>
      <Link to="/other">away</Link>
    </div>
  )
}

const renderPage = (dirty: boolean) =>
  render(
    <ConfirmProvider>
      <DataMemoryRouter
        initialEntries={['/']}
        routes={[
          { element: <DirtyPage dirty={dirty} />, path: '/' },
          { element: <h1>Other page</h1>, path: '/other' },
        ]}
      />
    </ConfirmProvider>
  )

describe('useUnsavedChangesWarning', () => {
  beforeEach(() => onLeave.mockClear())

  it('lets a clean page navigate without asking', async () => {
    const user = userEvent.setup()
    renderPage(false)

    await user.click(screen.getByRole('link', { name: 'away' }))

    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeInTheDocument()
  })

  it('stays on the page when the user cancels', async () => {
    const user = userEvent.setup()
    renderPage(true)

    await user.click(screen.getByRole('link', { name: 'away' }))
    await user.click(await screen.findByRole('button', { name: 'unsavedChanges.stay' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'unsavedChanges.stay' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Dirty page' })).toBeInTheDocument()
    expect(onLeave).not.toHaveBeenCalled()
  })

  it('navigates when the user confirms leaving', async () => {
    const user = userEvent.setup()
    renderPage(true)

    await user.click(screen.getByRole('link', { name: 'away' }))
    await user.click(await screen.findByRole('button', { name: 'unsavedChanges.leave' }))

    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeInTheDocument()
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('asks without an onLeave too, the way a page with no stored draft uses it', async () => {
    function PlainDirtyPage() {
      useUnsavedChangesWarning(true)
      return <Link to="/other">away</Link>
    }
    const user = userEvent.setup()
    render(
      <ConfirmProvider>
        <DataMemoryRouter
          initialEntries={['/']}
          routes={[
            { element: <PlainDirtyPage />, path: '/' },
            { element: <h1>Other page</h1>, path: '/other' },
          ]}
        />
      </ConfirmProvider>
    )

    await user.click(screen.getByRole('link', { name: 'away' }))
    await user.click(await screen.findByRole('button', { name: 'unsavedChanges.leave' }))

    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeInTheDocument()
  })
})
