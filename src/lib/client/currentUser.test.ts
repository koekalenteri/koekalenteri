import type { User } from '../../types'
import { getUser } from '../../api/user'
import { getCurrentUser } from './currentUser'

jest.mock('../../api/user', () => ({
  getUser: jest.fn(),
}))

describe('current user request guard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('coalesces concurrent requests with the same selector dependencies', async () => {
    const user = { id: 'user-1' } as User
    jest.mocked(getUser).mockResolvedValue(user)

    const first = getCurrentUser('id-token', 0)
    const second = getCurrentUser('id-token', 0)

    expect(second).toBe(first)
    await expect(first).resolves.toBe(user)
    await expect(getCurrentUser('id-token', 0)).resolves.toBe(user)
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('allows a new request when the token or explicit refresh revision changes', async () => {
    jest.mocked(getUser).mockResolvedValue({ id: 'user-1' } as User)

    await getCurrentUser('first-token', 0)
    await getCurrentUser('second-token', 0)
    await getCurrentUser('second-token', 1)

    expect(getUser).toHaveBeenCalledTimes(3)
    expect(getUser).toHaveBeenNthCalledWith(3, 'second-token', undefined, 1)
  })

  it('evicts a failed request so a later evaluation can retry', async () => {
    const error = new TypeError('Failed to fetch')
    const user = { id: 'user-1' } as User
    jest.mocked(getUser).mockRejectedValueOnce(error).mockResolvedValueOnce(user)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    const first = getCurrentUser('id-token', 0)
    const concurrent = getCurrentUser('id-token', 0)

    expect(concurrent).toBe(first)
    await expect(first).rejects.toBe(error)
    await expect(getCurrentUser('id-token', 0)).resolves.toBe(user)
    expect(getUser).toHaveBeenCalledTimes(2)
  })
})
