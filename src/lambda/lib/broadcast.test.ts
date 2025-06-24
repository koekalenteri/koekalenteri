import { jest } from '@jest/globals'

const mockTransaction = jest.fn<any>()
const mockReadAll = jest.fn<any>()
const mockRead = jest.fn<any>()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    transaction: mockTransaction,
    readAll: mockReadAll,
    read: mockRead,
  })),
}))

const mockSendToConnection = jest.fn<any>()
jest.unstable_mockModule('@aws-sdk/client-apigatewaymanagementapi', () => {
  return {
    ApiGatewayManagementApiClient: jest.fn(() => ({
      send: mockSendToConnection,
    })),
    PostToConnectionCommand: jest.fn((params) => params),
  }
})

const { wsConnect, wsDisconnect, broadcastEvent, broadcastConnectionCount, CONNECTION_COUNT_ID } = await import(
  './broadcast'
)

describe('broadcast', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('wsConnect', () => {
    it('should call dynamoDB.transaction with correct params to add connection and increment count', async () => {
      mockTransaction.mockResolvedValueOnce(undefined)
      const connectionId = 'conn-123'

      await wsConnect(connectionId)

      expect(mockTransaction).toHaveBeenCalledWith([
        {
          Put: {
            Item: { connectionId: { S: connectionId } },
          },
        },
        {
          Update: {
            Key: { connectionId: { S: CONNECTION_COUNT_ID } },
            UpdateExpression: 'ADD connectionCount :delta',
            ExpressionAttributeValues: { ':delta': { N: '1' } },
          },
        },
      ])
    })
  })

  describe('wsDisconnect', () => {
    it('should call dynamoDB.transaction with correct params to delete connection and decrement count', async () => {
      mockTransaction.mockResolvedValueOnce(undefined)
      const connectionId = 'conn-456'

      await wsDisconnect(connectionId)

      expect(mockTransaction).toHaveBeenCalledWith([
        {
          Delete: {
            Key: { connectionId: { S: connectionId } },
          },
        },
        {
          Update: {
            Key: { connectionId: { S: CONNECTION_COUNT_ID } },
            UpdateExpression: 'ADD connectionCount :delta',
            ExpressionAttributeValues: { ':delta': { N: '-1' } },
          },
        },
      ])
    })
  })

  describe('broadcastEvent', () => {
    it('should send data to all connections except the count connection', async () => {
      const connections = [
        { connectionId: 'conn-1' },
        { connectionId: CONNECTION_COUNT_ID },
        { connectionId: 'conn-2' },
      ]
      mockReadAll.mockResolvedValueOnce(connections)
      mockSendToConnection.mockResolvedValue(undefined)

      const data = { message: 'hello' }
      await broadcastEvent(data)

      expect(mockReadAll).toHaveBeenCalled()
      expect(mockSendToConnection).toHaveBeenCalledTimes(2)
      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          ConnectionId: 'conn-1',
          Data: Buffer.from(JSON.stringify(data)),
        })
      )
      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          ConnectionId: 'conn-2',
          Data: Buffer.from(JSON.stringify(data)),
        })
      )
    })
  })

  describe('broadcastConnectionCount', () => {
    it('should broadcast the current connection count when count exists', async () => {
      const connections = [{ connectionId: 'conn-1' }]
      const mockCount = { connectionId: CONNECTION_COUNT_ID, connectionCount: 5 }
      mockRead.mockResolvedValueOnce(mockCount)
      mockReadAll.mockResolvedValueOnce(connections)
      mockSendToConnection.mockResolvedValueOnce(undefined)

      await broadcastConnectionCount()

      expect(mockRead).toHaveBeenCalledWith({ connectionId: CONNECTION_COUNT_ID })
      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          ConnectionId: expect.any(String),
          Data: Buffer.from(JSON.stringify({ count: mockCount.connectionCount })),
        })
      )
    })

    it('should not broadcast if no count exists', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await broadcastConnectionCount()

      expect(mockRead).toHaveBeenCalledWith({ connectionId: CONNECTION_COUNT_ID })
      expect(mockSendToConnection).not.toHaveBeenCalled()
    })
  })
})
