import type { Judge } from '../../../../types'
import { act, renderHook } from '@testing-library/react'
import { RecoilRoot, useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import { getJudges, putJudge } from '../../../../api/judge'
import { getUsers } from '../../../../api/user'
import { useAdminJudgesActions } from './actions'

vi.mock('../../../../api/judge', async () => ({
  getJudges: vi.fn(),
  putJudge: vi.fn(),
}))

vi.mock('../../../../api/user', async () => ({
  getUsers: vi.fn(),
}))

vi.mock('recoil', async () => {
  const actual = await vi.importActual<typeof import('recoil')>('recoil')
  return {
    ...actual,
    useRecoilState: vi.fn(),
    useRecoilValue: vi.fn(),
    useSetRecoilState: vi.fn(),
  }
})

describe('useAdminJudgesActions', () => {
  const mockSetJudges = vi.fn()
  const mockSetUsers = vi.fn()

  const initialJudges = [
    { id: 1, name: 'Judge One' },
    { id: 2, name: 'Judge Two' },
  ] as Judge[]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRecoilState as import('vitest').Mock).mockReturnValue([initialJudges, mockSetJudges])
    ;(useSetRecoilState as import('vitest').Mock).mockReturnValue(mockSetUsers)
    ;(useRecoilValue as import('vitest').Mock).mockReturnValue('token-123')
  })

  it('refresh sorts judges and reloads users', async () => {
    ;(getJudges as import('vitest').Mock).mockResolvedValue([
      { id: 2, name: 'Örn' },
      { id: 1, name: 'Aaro' },
    ])
    ;(getUsers as import('vitest').Mock).mockResolvedValue([{ id: 'u1', name: 'User One' }])

    const { result } = renderHook(() => useAdminJudgesActions(), { wrapper: RecoilRoot })

    await act(async () => {
      await result.current.refresh()
    })

    expect(getJudges).toHaveBeenCalledWith('token-123', true)
    expect(getUsers).toHaveBeenCalledWith('token-123')
    expect(mockSetJudges).toHaveBeenCalledWith([
      { id: 1, name: 'Aaro' },
      { id: 2, name: 'Örn' },
    ])
    expect(mockSetUsers).toHaveBeenCalledWith([{ id: 'u1', name: 'User One' }])
  })

  it('save updates an existing judge', async () => {
    const updated = { id: 2, name: 'Judge Two Updated' } as Judge
    ;(putJudge as import('vitest').Mock).mockResolvedValue(updated)

    const { result } = renderHook(() => useAdminJudgesActions(), { wrapper: RecoilRoot })

    await act(async () => {
      await result.current.save(updated)
    })

    expect(putJudge).toHaveBeenCalledWith(updated, 'token-123')
    expect(mockSetJudges).toHaveBeenCalledWith([
      { id: 1, name: 'Judge One' },
      { id: 2, name: 'Judge Two Updated' },
    ])
  })
})
