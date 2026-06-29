import { render, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import { getUser } from '../../api/user'
import { idTokenAtom } from '../recoil'
import Header from './Header'

const mockSignOut = jest.fn()

jest.mock('../../api/user', () => ({
  getUser: jest.fn(),
}))

jest.mock('../recoil/user/actions', () => ({
  useUserActions: () => ({
    signOut: mockSignOut,
  }),
}))

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not sign out when user lookup temporarily fails', async () => {
    ;(getUser as jest.Mock).mockRejectedValueOnce(new Error('temporary user lookup failure'))

    render(
      <RecoilRoot initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
        <MemoryRouter>
          <Suspense fallback={null}>
            <Header />
          </Suspense>
        </MemoryRouter>
      </RecoilRoot>
    )

    await waitFor(() => expect(getUser).toHaveBeenCalledWith('id-token'))
    expect(mockSignOut).not.toHaveBeenCalled()
  })
})
