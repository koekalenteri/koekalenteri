import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import OtherViewers from './OtherViewers'

vi.mock('../../state/user/derivedAtoms', () => ({
  userAtom: require('jotai').atom(() => ({ id: 'current-user', name: 'Current User' })),
}))

describe('OtherViewers', () => {
  it('returns null when there are no viewers', () => {
    render(<OtherViewers viewers={[]} />, { wrapper: Provider })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('returns null when only the current user is viewing', () => {
    render(<OtherViewers viewers={[{ name: 'Current User', userId: 'current-user' }]} />, { wrapper: Provider })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows one other viewer with i18n pluralization count', () => {
    render(<OtherViewers viewers={[{ name: 'Viewer One', userId: 'viewer-1' }]} />, { wrapper: Provider })

    expect(screen.getByRole('alert')).toHaveTextContent('event.viewerBanner_one count, names')
  })

  it('shows multiple other viewers with joined names', () => {
    render(
      <OtherViewers
        viewers={[
          { name: 'Current User', userId: 'current-user' },
          { name: 'Viewer One', userId: 'viewer-1' },
          { name: 'Viewer Two', userId: 'viewer-2' },
        ]}
      />,
      { wrapper: Provider }
    )

    expect(screen.getByRole('alert')).toHaveTextContent('event.viewerBanner_one count, names')
  })
})
