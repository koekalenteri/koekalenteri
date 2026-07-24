import { render, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import { getUser } from '../../api/user'
import { TEST_ID_TOKEN } from '../../test-utils/utils'
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
    const error = new Error('temporary user lookup failure')
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    ;(getUser as jest.Mock).mockRejectedValueOnce(error)

    try {
      render(
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={null}>
              <Header />
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      )

      await waitFor(() => expect(getUser).toHaveBeenCalledWith(TEST_ID_TOKEN))
      expect(consoleErrorSpy).toHaveBeenCalledWith('reportError', error)
      expect(mockSignOut).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
