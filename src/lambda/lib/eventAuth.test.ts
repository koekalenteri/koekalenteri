import { vi } from 'vitest'

const mockAuthorizeWithMemberOf = vi.fn()
const mockGetEvent = vi.fn()

vi.doMock('./auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

vi.doMock('./event', () => ({
  getEvent: mockGetEvent,
}))

const { authorizeEvent } = await import('./eventAuth')

describe('authorizeEvent', () => {
  const request = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns authentication failures without loading the event', async () => {
    const res = { body: 'Unauthorized', statusCode: 401 }
    const getEventId = vi.fn(() => 'event1')
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res })

    await expect(authorizeEvent(request, getEventId)).resolves.toEqual({ res })
    expect(getEventId).not.toHaveBeenCalled()
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it('returns the user and event for an organizer member', async () => {
    const user = { admin: false, id: 'user1' }
    const item = { id: 'event1', organizer: { id: 'org1' } }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: ['org1'], user })
    mockGetEvent.mockResolvedValueOnce(item)

    await expect(authorizeEvent(request, 'event1')).resolves.toEqual({ eventId: 'event1', item, user })
  })

  it('allows admins regardless of organizer membership', async () => {
    const user = { admin: true, id: 'admin1' }
    const item = { id: 'event1', organizer: { id: 'org1' } }
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: [], user })
    mockGetEvent.mockResolvedValueOnce(item)

    await expect(authorizeEvent(request, 'event1')).resolves.toEqual({ eventId: 'event1', item, user })
  })

  it('rejects users outside the event organizer', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({
      memberOf: ['org2'],
      user: { admin: false, id: 'user1' },
    })
    mockGetEvent.mockResolvedValueOnce({ id: 'event1', organizer: { id: 'org1' } })

    await expect(authorizeEvent(request, 'event1')).rejects.toMatchObject({ error: 'Forbidden', status: 403 })
  })
})
