import type { Judge } from '../../../../types'

import { act, renderHook } from '@testing-library/react'
import { RecoilRoot, useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'

import { getJudges, putJudge } from '../../../../api/judge'
import { getUsers } from '../../../../api/user'

import { useAdminJudgesActions } from './actions'

jest.mock('../../../../api/judge', () => ({
  getJudges: jest.fn(),
  putJudge: jest.fn(),
}))

jest.mock('../../../../api/user', () => ({
  getUsers: jest.fn(),
}))

jest.mock('recoil', () => {
  const actual = jest.requireActual('recoil')
  return {
    ...actual,
    useRecoilState: jest.fn(),
    useRecoilValue: jest.fn(),
    useSetRecoilState: jest.fn(),
  }
})

describe('useAdminJudgesActions', () => {
  const mockSetJudges = jest.fn()
  const mockSetUsers = jest.fn()

  const initialJudges = [
    { id: 1, name: 'Judge One' },
    { id: 2, name: 'Judge Two' },
  ] as Judge[]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRecoilState as jest.Mock).mockReturnValue([initialJudges, mockSetJudges])
    ;(useSetRecoilState as jest.Mock).mockReturnValue(mockSetUsers)
    ;(useRecoilValue as jest.Mock).mockReturnValue('token-123')
  })

  it('refresh sorts judges and reloads users', async () => {
    ;(getJudges as jest.Mock).mockResolvedValue([
      { id: 2, name: 'Örn' },
      { id: 1, name: 'Aaro' },
    ])
    ;(getUsers as jest.Mock).mockResolvedValue([{ id: 'u1', name: 'User One' }])

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
    ;(putJudge as jest.Mock).mockResolvedValue(updated)

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
