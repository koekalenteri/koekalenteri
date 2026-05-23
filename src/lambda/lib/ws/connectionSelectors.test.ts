import { jest } from '@jest/globals'

const mockListConnections = jest.fn<any>()
const mockQueryAuthenticatedConnections = jest.fn<any>()
const mockCanReceivePublicEvent = jest.fn<any>()
const mockCanReceiveAdminEvent = jest.fn<any>()
const mockCanReceiveAnyAdminEvent = jest.fn<any>()

jest.unstable_mockModule('./connectionRepository', () => ({
  listConnections: mockListConnections,
  queryAuthenticatedConnections: mockQueryAuthenticatedConnections,
}))

jest.unstable_mockModule('./connectionPolicy', () => ({
  canReceiveAdminEvent: mockCanReceiveAdminEvent,
  canReceiveAnyAdminEvent: mockCanReceiveAnyAdminEvent,
  canReceivePublicEvent: mockCanReceivePublicEvent,
}))

const { adminAudience, eventAudience, organizerAudience, publicAudience } = await import('./connectionSelectors')

describe('ws/connectionSelectors', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('filters public audience from all connections', async () => {
    mockListConnections.mockResolvedValueOnce([{ connectionId: 'a' }, { connectionId: 'b' }])
    mockCanReceivePublicEvent.mockReturnValueOnce(true).mockReturnValueOnce(false)
    await expect(publicAudience()).resolves.toEqual([{ connectionId: 'a' }])
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
