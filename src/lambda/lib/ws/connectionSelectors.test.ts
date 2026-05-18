import { jest } from '@jest/globals'

const mockListConnections = jest.fn<any>()
const mockQueryAuthenticatedConnections = jest.fn<any>()
const mockCanReceivePublicEvent = jest.fn<any>()
const mockCanReceiveAdminEvent = jest.fn<any>()

jest.unstable_mockModule('./connectionRepository', () => ({
  listConnections: mockListConnections,
  queryAuthenticatedConnections: mockQueryAuthenticatedConnections,
}))

jest.unstable_mockModule('./connectionPolicy', () => ({
  canReceiveAdminEvent: mockCanReceiveAdminEvent,
  canReceivePublicEvent: mockCanReceivePublicEvent,
}))

const { eventAudience, organizerAudience, publicAudience } = await import('./connectionSelectors')

describe('ws/connectionSelectors', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('filters public audience from all connections', async () => {
    mockListConnections.mockResolvedValueOnce([{ connectionId: 'a' }, { connectionId: 'b' }])
    mockCanReceivePublicEvent.mockReturnValueOnce(true).mockReturnValueOnce(false)
    await expect(publicAudience()).resolves.toEqual([{ connectionId: 'a' }])
  })

  it('filters organizer audience from authenticated connections', async () => {
    mockQueryAuthenticatedConnections.mockResolvedValueOnce([{ connectionId: 'a' }, { connectionId: 'b' }])
    mockCanReceiveAdminEvent.mockReturnValueOnce(true).mockReturnValueOnce(false)
    await expect(organizerAudience('org-1')).resolves.toEqual([{ connectionId: 'a' }])
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
