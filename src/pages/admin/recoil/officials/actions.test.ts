import { act, renderHook } from '@testing-library/react'
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil'
import { getOfficials } from '../../../../api/official'
import { getUsers } from '../../../../api/user'
import { useAdminOfficialsActions } from './actions'

jest.mock('../../../../api/official', () => ({
  getOfficials: jest.fn(),
}))

jest.mock('../../../../api/user', () => ({
  getUsers: jest.fn(),
}))

jest.mock('recoil', () => {
  const actual = jest.requireActual('recoil')
  return {
    ...actual,
    useRecoilValue: jest.fn(),
    useSetRecoilState: jest.fn(),
  }
})

describe('useAdminOfficialsActions', () => {
  const mockSetOfficials = jest.fn()
  const mockSetUsers = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRecoilValue as jest.Mock).mockReturnValue('token-123')
    ;(useSetRecoilState as jest.Mock).mockReturnValueOnce(mockSetOfficials).mockReturnValueOnce(mockSetUsers)
  })

  it('refresh sorts officials and reloads users', async () => {
    ;(getOfficials as jest.Mock).mockResolvedValue([
      { id: 2, name: 'Örn' },
      { id: 1, name: 'Aaro' },
    ])
    ;(getUsers as jest.Mock).mockResolvedValue([{ id: 'u1', name: 'User One' }])

    const { result } = renderHook(() => useAdminOfficialsActions(), { wrapper: RecoilRoot })

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
    ;(useRecoilValue as jest.Mock).mockReturnValue(undefined)

    const { result } = renderHook(() => useAdminOfficialsActions(), { wrapper: RecoilRoot })

    await expect(result.current.refresh()).rejects.toThrow('missing token')
    expect(getOfficials).not.toHaveBeenCalled()
    expect(getUsers).not.toHaveBeenCalled()
  })
})
