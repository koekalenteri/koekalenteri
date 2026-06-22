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
  authenticateConnection,
  createConnection,
  getConnection,
  listConnections,
  queryAdminConnections,
  queryPublicConnections,
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
    expect(mockWrite).toHaveBeenCalledWith({ audience: 'public', connectionId: 'c1' })
  })

  it('createConnection writes expiresAt but ignores legacy auth fields', async () => {
    await createConnection({
      admin: true,
      connectionId: 'c1',
      expiresAt: 123,
      memberOf: ['org-1'],
      userId: 'u1',
    } as any)

    expect(mockWrite).toHaveBeenCalledWith({ audience: 'public', connectionId: 'c1', expiresAt: 123 })
  })

  it('authenticateConnection stores user display metadata', async () => {
    await authenticateConnection({
      admin: true,
      connectionId: 'c1',
      expiresAt: 123,
      memberOf: ['org-1'],
      userEmail: 'user@example.com',
      userId: 'u1',
      userName: 'User One',
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      { connectionId: 'c1' },
      {
        remove: ['eventId'],
        set: {
          admin: true,
          audience: 'public',
          expiresAt: 123,
          memberOf: ['org-1'],
          userEmail: 'user@example.com',
          userId: 'u1',
          userName: 'User One',
        },
      }
    )
  })

  it('subscribeConnection moves event subscribers to admin audience', async () => {
    await subscribeConnection('c1', 'e1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { set: { audience: 'admin', eventId: 'e1' } })
  })

  it('unsubscribeConnection removes only eventId and keeps audience unchanged', async () => {
    await unsubscribeConnection('c1')
    expect(mockUpdate).toHaveBeenCalledWith({ connectionId: 'c1' }, { remove: ['eventId'] })
  })

  it('subscribeAdminChannel sets adminSubscribed and moves connection to admin audience', async () => {
    await subscribeAdminChannel('c1')
    expect(mockUpdate).toHaveBeenCalledWith(
      { connectionId: 'c1' },
      { set: { adminSubscribed: true, audience: 'admin' } }
    )
  })

  it('unsubscribeAdminChannel removes adminSubscribed and moves connection to public audience', async () => {
    await unsubscribeAdminChannel('c1')
    expect(mockUpdate).toHaveBeenCalledWith(
      { connectionId: 'c1' },
      { remove: ['adminSubscribed'], set: { audience: 'public' } }
    )
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

  it('queryAdminConnections queries audience index', async () => {
    mockQuery.mockResolvedValueOnce([{ connectionId: 'c1' }])
    await expect(queryAdminConnections()).resolves.toEqual([{ connectionId: 'c1' }])
    expect(mockQuery).toHaveBeenCalledWith({
      index: 'audience-index',
      key: 'audience = :audience',
      values: { ':audience': 'admin' },
    })
  })

  it('queryPublicConnections queries audience index', async () => {
    mockQuery.mockResolvedValueOnce([{ connectionId: 'c1' }])
    await expect(queryPublicConnections()).resolves.toEqual([{ connectionId: 'c1' }])
    expect(mockQuery).toHaveBeenCalledWith({
      index: 'audience-index',
      key: 'audience = :audience',
      values: { ':audience': 'public' },
    })
  })
})
