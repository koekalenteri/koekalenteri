import { act, renderHook } from '@testing-library/react'
import { Provider, useAtomValue, useSetAtom } from 'jotai'
import { getOfficials } from '../../../../api/official'
import { getUsers } from '../../../../api/user'
import { useAdminOfficialsActions } from './actions'

vi.mock('../../../../api/official', async () => ({
  getOfficials: vi.fn(),
}))

vi.mock('../../../../api/user', async () => ({
  getUsers: vi.fn(),
}))

vi.mock('jotai', async () => {
  const actual = await vi.importActual<typeof import('jotai')>('jotai')
  return {
    ...actual,
    useAtomValue: vi.fn(),
    useSetAtom: vi.fn(),
  }
})

describe('useAdminOfficialsActions', () => {
  const mockSetOfficials = vi.fn()
  const mockSetUsers = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAtomValue as import('vitest').Mock).mockReturnValue('token-123')
    ;(useSetAtom as import('vitest').Mock).mockReturnValueOnce(mockSetOfficials).mockReturnValueOnce(mockSetUsers)
  })

  it('refresh sorts officials and reloads users', async () => {
    ;(getOfficials as import('vitest').Mock).mockResolvedValue([
      { id: 2, name: 'Örn' },
      { id: 1, name: 'Aaro' },
    ])
    ;(getUsers as import('vitest').Mock).mockResolvedValue([{ id: 'u1', name: 'User One' }])

    const { result } = renderHook(() => useAdminOfficialsActions(), { wrapper: Provider })

    await act(async () => {
      await result.current.refresh()
    })

    expect(getOfficials).toHaveBeenCalledWith('token-123', true)
    expect(getUsers).toHaveBeenCalledWith('token-123')
    expect(mockSetOfficials).toHaveBeenCalledWith([
      { id: 1, name: 'Aaro' },
      { id: 2, name: 'Örn' },
    ])
    expect(mockSetUsers).toHaveBeenCalledWith([{ id: 'u1', name: 'User One' }])
  })

  it('refresh throws when token is missing', async () => {
    ;(useAtomValue as import('vitest').Mock).mockReturnValue(undefined)

    const { result } = renderHook(() => useAdminOfficialsActions(), { wrapper: Provider })

    await expect(result.current.refresh()).rejects.toThrow('missing token')
    expect(getOfficials).not.toHaveBeenCalled()
    expect(getUsers).not.toHaveBeenCalled()
  })
})
