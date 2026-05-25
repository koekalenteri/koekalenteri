import { jest } from '@jest/globals'

const mockQueryAdminConnections = jest.fn<any>()
const mockQueryPublicConnections = jest.fn<any>()
const mockCanReceiveAdminEvent = jest.fn<any>()
const mockCanReceiveAnyAdminEvent = jest.fn<any>()

jest.unstable_mockModule('./connectionRepository', () => ({
  queryAdminConnections: mockQueryAdminConnections,
  queryPublicConnections: mockQueryPublicConnections,
}))

jest.unstable_mockModule('./connectionPolicy', () => ({
  canReceiveAdminEvent: mockCanReceiveAdminEvent,
  canReceiveAnyAdminEvent: mockCanReceiveAnyAdminEvent,
}))

const { adminAudience, eventAudience, organizerAudience, publicAudience } = await import('./connectionSelectors')

describe('ws/connectionSelectors', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockQueryAdminConnections.mockResolvedValue([])
    mockQueryPublicConnections.mockResolvedValue([])
  })

  it('filters public audience from indexed public connections only', async () => {
    mockQueryPublicConnections.mockResolvedValueOnce([{ audience: 'public', connectionId: 'a' }])

    await expect(publicAudience()).resolves.toEqual([{ audience: 'public', connectionId: 'a' }])
    expect(mockQueryAdminConnections).not.toHaveBeenCalled()
  })

  it('excludes admin-subscribed connections from public audience', async () => {
    mockQueryPublicConnections.mockResolvedValueOnce([{ audience: 'public', connectionId: 'p1' }])
    mockQueryAdminConnections.mockResolvedValueOnce([{ audience: 'admin', connectionId: 'admin-1' }])

    await expect(publicAudience()).resolves.toEqual([{ audience: 'public', connectionId: 'p1' }])
    expect(mockQueryAdminConnections).not.toHaveBeenCalled()
  })

  it('filters organizer audience from admin connections — adminSubscribed', async () => {
    mockQueryAdminConnections.mockResolvedValueOnce([{ adminSubscribed: true, connectionId: 'a' }])
    mockCanReceiveAdminEvent.mockReturnValueOnce(true)
    await expect(organizerAudience('org-1', 'e1')).resolves.toEqual([{ adminSubscribed: true, connectionId: 'a' }])
  })

  it('filters organizer audience from admin connections — eventId match', async () => {
    mockQueryAdminConnections.mockResolvedValueOnce([
      { connectionId: 'a', eventId: 'e1' },
      { connectionId: 'b', eventId: 'e2' },
    ])
    mockCanReceiveAdminEvent.mockReturnValueOnce(true).mockReturnValueOnce(true)
    await expect(organizerAudience('org-1', 'e1')).resolves.toEqual([{ connectionId: 'a', eventId: 'e1' }])
  })

  it('filters admin audience from admin connections — requires adminSubscribed', async () => {
    mockQueryAdminConnections.mockResolvedValueOnce([
      { adminSubscribed: true, connectionId: 'a' },
      { connectionId: 'b' },
    ])
    mockCanReceiveAnyAdminEvent.mockReturnValueOnce(true).mockReturnValueOnce(true)
    await expect(adminAudience()).resolves.toEqual([{ adminSubscribed: true, connectionId: 'a' }])
  })

  it('filters event audience by eventId and admin policy', async () => {
    mockQueryAdminConnections.mockResolvedValueOnce([
      { connectionId: 'a', eventId: 'e1' },
      { connectionId: 'b', eventId: 'e2' },
    ])
    mockCanReceiveAdminEvent.mockReturnValue(true)
    await expect(eventAudience('e1', 'org-1')).resolves.toEqual([{ connectionId: 'a', eventId: 'e1' }])
  })

  it('includes provided subscribed connection when index query has not caught up', async () => {
    mockQueryAdminConnections.mockResolvedValueOnce([])
    mockCanReceiveAdminEvent.mockReturnValue(true)

    await expect(
      eventAudience('e1', 'org-1', { include: { connectionId: 'subscribed', eventId: 'e1' } })
    ).resolves.toEqual([{ connectionId: 'subscribed', eventId: 'e1' }])
  })

  it('does not duplicate provided subscribed connection', async () => {
    mockQueryAdminConnections.mockResolvedValueOnce([{ connectionId: 'subscribed', eventId: 'e1' }])
    mockCanReceiveAdminEvent.mockReturnValue(true)

    await expect(
      eventAudience('e1', 'org-1', { include: { connectionId: 'subscribed', eventId: 'e1' } })
    ).resolves.toEqual([{ connectionId: 'subscribed', eventId: 'e1' }])
  })

  it('excludes provided unsubscribed connection when index query has not caught up', async () => {
    mockQueryAdminConnections.mockResolvedValueOnce([
      { connectionId: 'stale', eventId: 'e1' },
      { connectionId: 'other', eventId: 'e1' },
    ])
    mockCanReceiveAdminEvent.mockReturnValue(true)

    await expect(eventAudience('e1', 'org-1', { excludeConnectionId: 'stale' })).resolves.toEqual([
      { connectionId: 'other', eventId: 'e1' },
    ])
  })
})
