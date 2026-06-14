import { render, screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'
import OtherViewers from './OtherViewers'

jest.mock('../../recoil/user/selectors', () => ({
  userSelector: require('recoil').selector({
    get: () => ({ id: 'current-user', name: 'Current User' }),
    key: 'otherViewersTestUserSelector',
  }),
}))

describe('OtherViewers', () => {
  it('returns null when there are no viewers', () => {
    render(<OtherViewers viewers={[]} />, { wrapper: RecoilRoot })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('returns null when only the current user is viewing', () => {
    render(<OtherViewers viewers={[{ name: 'Current User', userId: 'current-user' }]} />, { wrapper: RecoilRoot })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows one other viewer with i18n pluralization count', () => {
    render(<OtherViewers viewers={[{ name: 'Viewer One', userId: 'viewer-1' }]} />, { wrapper: RecoilRoot })

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
      { wrapper: RecoilRoot }
    )

    expect(screen.getByRole('alert')).toHaveTextContent('event.viewerBanner_one count, names')
  })
})
