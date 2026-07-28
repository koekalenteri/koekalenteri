import type { DogEvent } from '../../../../types'
import { getAdminEvents } from '../../../../api/event'
import { userSelector, validIdTokenSelector } from '../../../recoil'
import { adminRemoteEventsEffect, reconcileAdminEvents } from './effects'

jest.mock('../../../../api/event', () => ({
  getAdminEvents: jest.fn(),
}))

const event = (id: string, startDate: string, updatedAt: string): DogEvent =>
  ({ id, startDate: new Date(startDate), updatedAt: new Date(updatedAt) }) as DogEvent

describe('reconcileAdminEvents', () => {
  it('merges changed and new events into the cached collection', () => {
    const unchanged = event('unchanged', '2026-02-01', '2026-01-01')
    const stale = event('changed', '2026-03-01', '2026-01-01')
    const changed = event('changed', '2026-04-01', '2026-01-02')
    const added = event('added', '2026-01-01', '2026-01-02')

    expect(reconcileAdminEvents([unchanged, stale], [changed, added])).toEqual([added, unchanged, changed])
  })
})

describe('adminRemoteEventsEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    sessionStorage.clear()
  })

  it('requests and reconciles changes since the newest cached update', async () => {
    const cached = event('cached', '2026-02-01', '2026-01-02T00:00:00.000Z')
    const added = event('added', '2026-01-01', '2026-01-03T00:00:00.000Z')
    const user = { admin: false, id: 'user-1', roles: { org: 'admin' } }
    sessionStorage.setItem('adminEvents', JSON.stringify([cached]))
    sessionStorage.setItem(
      'adminEvents:scope',
      JSON.stringify({ admin: false, id: 'user-1', roles: [['org', 'admin']] })
    )
    jest.mocked(getAdminEvents).mockResolvedValueOnce([added])

    let setSelfValue: Promise<DogEvent[]> | undefined
    const setSelf = jest.fn((value) => {
      setSelfValue = value
    })
    const getPromise = jest.fn((value) => {
      if (value === validIdTokenSelector) return Promise.resolve('token')
      if (value === userSelector) return Promise.resolve(user)
      return Promise.resolve(undefined)
    })
    adminRemoteEventsEffect({ getPromise, node: { key: 'adminEvents' }, setSelf, trigger: 'get' } as never)

    expect(setSelf).toHaveBeenCalledWith(expect.any(Promise))
    await expect(setSelfValue).resolves.toEqual([added, cached])
    expect(getAdminEvents).toHaveBeenCalledWith('token', Date.parse('2026-01-02T00:00:00.000Z'))
  })

  it('does a full fetch when the cached authorization scope differs', async () => {
    sessionStorage.setItem('adminEvents', JSON.stringify([event('cached', '2026-02-01', '2026-01-02')]))
    sessionStorage.setItem('adminEvents:scope', JSON.stringify({ admin: false, id: 'another-user', roles: [] }))
    jest.mocked(getAdminEvents).mockResolvedValueOnce([])

    let setSelfValue: Promise<DogEvent[]> | undefined
    const setSelf = jest.fn((value) => {
      setSelfValue = value
    })
    const getPromise = jest.fn((value) => {
      if (value === validIdTokenSelector) return Promise.resolve('token')
      if (value === userSelector) return Promise.resolve({ admin: true, id: 'user-1' })
      return Promise.resolve(undefined)
    })
    adminRemoteEventsEffect({ getPromise, node: { key: 'adminEvents' }, setSelf, trigger: 'get' } as never)

    expect(setSelf).toHaveBeenCalledWith(expect.any(Promise))
    await expect(setSelfValue).resolves.toEqual([])
    expect(getAdminEvents).toHaveBeenCalledWith('token', undefined)
  })
})
