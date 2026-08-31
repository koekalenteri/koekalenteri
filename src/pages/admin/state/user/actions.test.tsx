import type { ReactNode } from 'react'
import type { CollectionResponse, User } from '../../../../types'
import { act, renderHook } from '@testing-library/react'
import { useAtomValue } from 'jotai'
import { SnackbarProvider } from 'notistack'
import { TestProvider } from '../../../../test-utils/AtomProvider'
import { TEST_ID_TOKEN } from '../../../../test-utils/utils'
import { idTokenAtom } from '../../../state'
import { useAdminUserActions } from './actions'
import { adminUsersAtom } from './atoms'

// `getUsers` is overloaded on `since`, and a mock typed from the overloads can only answer one of
// the two shapes. Both are real answers here, so the mock is declared with the union the
// implementation returns.
const mockGetUsers = vi.hoisted(() =>
  vi.fn<(token: string, signal?: AbortSignal, since?: Date) => Promise<CollectionResponse<User>>>()
)

vi.mock('../../../../api/user', () => ({
  getUsers: mockGetUsers,
  putAdmin: vi.fn(),
  putRole: vi.fn(),
  putUser: vi.fn(),
}))

const cached: User[] = [
  { email: 'a@user.vi', id: 'u1', modifiedAt: new Date('2026-01-01T00:00:00.000Z'), name: 'Aaro' },
  { email: 'b@user.vi', id: 'u2', lastSeen: new Date('2026-01-05T00:00:00.000Z'), name: 'Bertta' },
]

const wrapper =
  (users: User[]) =>
  ({ children }: { readonly children?: ReactNode }) => (
    <TestProvider
      initializeState={(store) => {
        store.set(idTokenAtom, TEST_ID_TOKEN)
        store.set(adminUsersAtom, users)
      }}
    >
      <SnackbarProvider>{children}</SnackbarProvider>
    </TestProvider>
  )

const useAdminUsers = () => ({ ...useAdminUserActions(), users: useAtomValue(adminUsersAtom) })

describe('useAdminUserActions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshes only what changed after the list it already has', async () => {
    const seen = { ...cached[1], lastSeen: new Date('2026-01-06T00:00:00.000Z') }
    mockGetUsers.mockResolvedValue({ cursor: Date.parse('2026-01-06T00:00:00.000Z'), deletedIds: [], items: [seen] })

    const { result } = renderHook(() => useAdminUsers(), { wrapper: wrapper(cached) })
    await act(async () => {
      await result.current.refresh()
    })

    // Newest timestamp in the cached list, lastSeen included: nothing older has to travel again.
    expect(mockGetUsers).toHaveBeenCalledWith(TEST_ID_TOKEN, undefined, new Date('2026-01-05T00:00:00.000Z'))
    expect(result.current.users).toEqual([cached[0], seen])
  })

  it('asks for the whole list when it has nothing to build on', async () => {
    mockGetUsers.mockResolvedValue(cached)

    const { result } = renderHook(() => useAdminUsers(), { wrapper: wrapper([]) })
    await act(async () => {
      await result.current.refresh()
    })

    expect(mockGetUsers).toHaveBeenCalledWith(TEST_ID_TOKEN)
    expect(result.current.users).toEqual(cached)
  })
})
