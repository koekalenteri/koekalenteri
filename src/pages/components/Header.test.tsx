import { render, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import { getUser } from '../../api/user'
import { TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../recoil'
import Header from './Header'

const mockSignOut = vi.fn()

vi.mock('../../api/user', () => ({
  getUser: vi.fn(),
}))

vi.mock('../recoil/user/actions', () => ({
  useUserActions: () => ({
    signOut: mockSignOut,
  }),
}))

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not sign out when user lookup temporarily fails', async () => {
    const error = new Error('temporary user lookup failure')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    ;(getUser as import('vitest').Mock).mockRejectedValueOnce(error)

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

      await waitFor(() => expect(getUser).toHaveBeenCalledWith(TEST_ID_TOKEN, undefined, 0))
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'auth: /user request failed',
        expect.objectContaining({ error, refresh: 0, requestId: expect.any(Number) })
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith('reportError', error)
      expect(mockSignOut).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    }
  })
})
