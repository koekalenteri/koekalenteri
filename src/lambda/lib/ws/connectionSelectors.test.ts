import { jest } from '@jest/globals'

const mockQueryAuthenticatedConnections = jest.fn<any>()
const mockQueryPublicConnections = jest.fn<any>()
const mockCanReceiveAdminEvent = jest.fn<any>()
const mockCanReceiveAnyAdminEvent = jest.fn<any>()

jest.unstable_mockModule('./connectionRepository', () => ({
  queryAuthenticatedConnections: mockQueryAuthenticatedConnections,
  queryPublicConnections: mockQueryPublicConnections,
}))

jest.unstable_mockModule('./connectionPolicy', () => ({
  canReceiveAdminEvent: mockCanReceiveAdminEvent,
  canReceiveAnyAdminEvent: mockCanReceiveAnyAdminEvent,
}))

const { adminAudience, eventAudience, organizerAudience, publicAudience } = await import('./connectionSelectors')

describe('ws/connectionSelectors', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('filters public audience from indexed public connections only', async () => {
    mockQueryPublicConnections.mockResolvedValueOnce([{ audience: 'public', connectionId: 'a' }])

    await expect(publicAudience()).resolves.toEqual([{ audience: 'public', connectionId: 'a' }])
    expect(mockQueryAuthenticatedConnections).not.toHaveBeenCalled()
  })

  it('filters organizer audience from authenticated connections — adminSubscribed', async () => {
    mockQueryAuthenticatedConnections.mockResolvedValueOnce([
      { adminSubscribed: true, connectionId: 'a' },
      { adminSubscribed: false, connectionId: 'b' },
    ])
    mockCanReceiveAdminEvent.mockReturnValueOnce(true).mockReturnValueOnce(true)
    await expect(organizerAudience('org-1', 'e1')).resolves.toEqual([{ adminSubscribed: true, connectionId: 'a' }])
  })

  it('filters organizer audience from authenticated connections — eventId match', async () => {
    mockQueryAuthenticatedConnections.mockResolvedValueOnce([
      { connectionId: 'a', eventId: 'e1' },
      { connectionId: 'b', eventId: 'e2' },
    ])
    mockCanReceiveAdminEvent.mockReturnValueOnce(true).mockReturnValueOnce(true)
    await expect(organizerAudience('org-1', 'e1')).resolves.toEqual([{ connectionId: 'a', eventId: 'e1' }])
  })

  it('filters admin audience from authenticated connections — requires adminSubscribed', async () => {
    mockQueryAuthenticatedConnections.mockResolvedValueOnce([
      { adminSubscribed: true, connectionId: 'a' },
      { connectionId: 'b' },
    ])
    mockCanReceiveAnyAdminEvent.mockReturnValueOnce(true).mockReturnValueOnce(true)
    await expect(adminAudience()).resolves.toEqual([{ adminSubscribed: true, connectionId: 'a' }])
  })

  it('filters event audience by eventId and admin policy', async () => {
    mockQueryAuthenticatedConnections.mockResolvedValueOnce([
      { connectionId: 'a', eventId: 'e1' },
      { connectionId: 'b', eventId: 'e2' },
    ])
    mockCanReceiveAdminEvent.mockReturnValue(true)
    await expect(eventAudience('e1', 'org-1')).resolves.toEqual([{ connectionId: 'a', eventId: 'e1' }])
  })
})
