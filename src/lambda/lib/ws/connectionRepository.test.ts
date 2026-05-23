import { jest } from '@jest/globals'

const mockReadAll = jest.fn<any>()
const mockRead = jest.fn<any>()
const mockWrite = jest.fn<any>()
const mockUpdate = jest.fn<any>()
const mockDelete = jest.fn<any>()
const mockQuery = jest.fn<any>()

jest.unstable_mockModule('../../config', () => ({
  CONFIG: { wsConnectionsTable: 'ws-connections' },
}))

jest.unstable_mockModule('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    readAll = (...args: any[]) => mockReadAll(...args)
    read = (...args: any[]) => mockRead(...args)
    write = (...args: any[]) => mockWrite(...args)
    update = (...args: any[]) => mockUpdate(...args)
    delete = (...args: any[]) => mockDelete(...args)
    query = (...args: any[]) => mockQuery(...args)
  },
}))

const {
  createConnection,
  getConnection,
  listConnections,
  queryAuthenticatedConnections,
  removeConnection,
  subscribeAdminChannel,
  subscribeConnection,
  unsubscribeAdminChannel,
  unsubscribeConnection,
} = await import('./connectionRepository')

describe('ws/connectionRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('listConnections returns empty array for undefined db result', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)
    await expect(listConnections()).resolves.toEqual([])
  })

  it('getConnection reads by connectionId', async () => {
    mockRead.mockResolvedValueOnce({ connectionId: 'c1' })
    await expect(getConnection('c1')).resolves.toEqual({ connectionId: 'c1' })
    expect(mockRead).toHaveBeenCalledWith({ connectionId: 'c1' })
  })

  it('createConnection writes minimal payload when optional fields are missing', async () => {
    await createConnection({ connectionId: 'c1' } as any)
    expect(mockWrite).toHaveBeenCalledWith({ connectionId: 'c1' })
  })

  it('createConnection writes all optional fields when present', async () => {
    await createConnection({
      admin: true,
      connectionId: 'c1',
      expiresAt: 123,
      memberOf: ['org-1'],
      userId: 'u1',
    } as any)

    expect(mockWrite).toHaveBeenCalledWith({
      admin: true,
      audience: 'auth',
      connectionId: 'c1',
      expiresAt: 123,
      memberOf: ['org-1'],
      userId: 'u1',
    })
  })

  it('subscribeConnection updates eventId', async () => {
    await subscribeConnection('c1', 'e1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { set: { eventId: 'e1' } })
  })

  it('unsubscribeConnection removes eventId', async () => {
    await unsubscribeConnection('c1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { remove: ['eventId'] })
  })

  it('subscribeAdminChannel sets adminSubscribed', async () => {
    await subscribeAdminChannel('c1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { set: { adminSubscribed: true } })
  })

  it('unsubscribeAdminChannel removes adminSubscribed', async () => {
    await unsubscribeAdminChannel('c1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { remove: ['adminSubscribed'] })
  })

  it('removeConnection does nothing when no existing connection', async () => {
    mockRead.mockResolvedValueOnce(undefined)
    await removeConnection('c1')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('removeConnection deletes existing connection', async () => {
    mockRead.mockResolvedValueOnce({ connectionId: 'c1' })
    await removeConnection('c1')
    expect(mockDelete).toHaveBeenCalledWith({ connectionId: 'c1' })
  })

  it('queryAuthenticatedConnections returns empty array for undefined result', async () => {
    mockQuery.mockResolvedValueOnce(undefined)
    await expect(queryAuthenticatedConnections()).resolves.toEqual([])
  })

  it('queryAuthenticatedConnections queries audience index', async () => {
    mockQuery.mockResolvedValueOnce([{ connectionId: 'c1' }])
    await expect(queryAuthenticatedConnections()).resolves.toEqual([{ connectionId: 'c1' }])
    expect(mockQuery).toHaveBeenCalledWith({
      index: 'audience-index',
      key: 'audience = :audience',
      values: { ':audience': 'auth' },
    })
  })
})
