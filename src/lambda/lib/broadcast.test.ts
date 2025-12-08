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

const { wsConnect, wsDisconnect, broadcastEvent, broadcastConnectionCount, CONNECTION_COUNT_ID } =
  await import('./broadcast')

describe('broadcast', () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)

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

    it('should propagate errors from dynamoDB.transaction', async () => {
      const mockError = new Error('Transaction failed')
      mockTransaction.mockRejectedValueOnce(mockError)
      const connectionId = 'conn-123'

      await expect(wsConnect(connectionId)).rejects.toThrow('Transaction failed')

      expect(mockTransaction).toHaveBeenCalled()
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
            ConditionExpression: 'attribute_exists(connectionId)',
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

    it('should propagate errors from dynamoDB.transaction', async () => {
      const mockError = new Error('Transaction failed')
      mockTransaction.mockRejectedValueOnce(mockError)
      const connectionId = 'conn-456'

      await expect(wsDisconnect(connectionId)).rejects.toThrow('Transaction failed')

      expect(mockTransaction).toHaveBeenCalled()
    })

    it('should propagate TransactionCanceledException when connection does not exist', async () => {
      const mockError = new Error('Transaction canceled')
      mockError.name = 'TransactionCanceledException'
      ;(mockError as any).CancellationReasons = [
        { Code: 'ConditionalCheckFailed', Message: 'The conditional request failed' },
        { Code: 'None' },
      ]

      mockTransaction.mockRejectedValueOnce(mockError)
      const connectionId = 'non-existent-conn'

      await expect(wsDisconnect(connectionId)).rejects.toThrow('Transaction canceled')

      expect(mockTransaction).toHaveBeenCalled()
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

    it('should exclude the specified exceptConnectionId from broadcast', async () => {
      const connections = [
        { connectionId: 'conn-1' },
        { connectionId: CONNECTION_COUNT_ID },
        { connectionId: 'conn-2' },
        { connectionId: 'conn-3' },
      ]
      mockReadAll.mockResolvedValueOnce(connections)
      mockSendToConnection.mockResolvedValue(undefined)

      const data = { message: 'hello' }
      await broadcastEvent(data, 'conn-2')

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
          ConnectionId: 'conn-3',
          Data: Buffer.from(JSON.stringify(data)),
        })
      )
      // Verify conn-2 was excluded
      expect(mockSendToConnection).not.toHaveBeenCalledWith(
        expect.objectContaining({
          ConnectionId: 'conn-2',
          Data: expect.any(Buffer),
        })
      )
    })

    it('should handle empty connections array', async () => {
      mockReadAll.mockResolvedValueOnce([])

      const data = { message: 'hello' }
      await broadcastEvent(data)

      expect(mockReadAll).toHaveBeenCalled()
      expect(mockSendToConnection).not.toHaveBeenCalled()
    })

    it('should handle null connections result', async () => {
      mockReadAll.mockResolvedValueOnce(null)

      const data = { message: 'hello' }
      await broadcastEvent(data)

      expect(mockReadAll).toHaveBeenCalled()
      expect(mockSendToConnection).not.toHaveBeenCalled()
    })

    it('should handle generic errors when gateway.send fails', async () => {
      const connections = [{ connectionId: 'conn-1' }]
      mockReadAll.mockResolvedValueOnce(connections)

      // Mock a generic error
      const mockError = new Error('Send failed')
      mockSendToConnection.mockRejectedValueOnce(mockError)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const data = { message: 'hello' }
      await broadcastEvent(data)

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith('broadcast:', mockError)

      // Verify wsDisconnect was NOT called for generic errors
      expect(mockTransaction).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('should call wsDisconnect when gateway.send fails with GoneException', async () => {
      const connections = [{ connectionId: 'conn-1' }]
      mockReadAll.mockResolvedValueOnce(connections)

      // Mock a GoneException error
      const mockError = new Error('Connection gone')
      mockError.name = 'GoneException'
      mockSendToConnection.mockRejectedValueOnce(mockError)

      // Mock successful wsDisconnect
      mockTransaction.mockResolvedValueOnce(undefined)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const data = { message: 'hello' }
      await broadcastEvent(data)

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith('broadcast:', mockError)

      // Verify wsDisconnect was called with the correct connectionId
      expect(mockTransaction).toHaveBeenCalledWith([
        {
          Delete: {
            Key: { connectionId: { S: 'conn-1' } },
            ConditionExpression: 'attribute_exists(connectionId)',
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

      consoleSpy.mockRestore()
    })
  })

  describe('broadcastConnectionCount', () => {
    it('should broadcast the current connection count when count exists', async () => {
      const connections = [{ connectionId: 'conn-1' }]
      const mockCount = { connectionId: CONNECTION_COUNT_ID, connectionCount: 5 }
      mockRead.mockResolvedValueOnce(mockCount)
      mockReadAll.mockResolvedValueOnce(connections)
      mockSendToConnection.mockResolvedValueOnce(undefined)

      await broadcastConnectionCount('test')

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

    it('should not broadcast if connectionCount is 0', async () => {
      const mockCount = { connectionId: CONNECTION_COUNT_ID, connectionCount: 0 }
      mockRead.mockResolvedValueOnce(mockCount)

      await broadcastConnectionCount()

      expect(mockRead).toHaveBeenCalledWith({ connectionId: CONNECTION_COUNT_ID })
      expect(mockSendToConnection).not.toHaveBeenCalled()
    })

    it('should not broadcast if connectionCount is negative', async () => {
      const mockCount = { connectionId: CONNECTION_COUNT_ID, connectionCount: -1 }
      mockRead.mockResolvedValueOnce(mockCount)

      await broadcastConnectionCount()

      expect(mockRead).toHaveBeenCalledWith({ connectionId: CONNECTION_COUNT_ID })
      expect(mockSendToConnection).not.toHaveBeenCalled()
    })

    it('should propagate errors from dynamoDB.read', async () => {
      const mockError = new Error('Read failed')
      mockRead.mockRejectedValueOnce(mockError)

      await expect(broadcastConnectionCount()).rejects.toThrow('Read failed')

      expect(mockRead).toHaveBeenCalledWith({ connectionId: CONNECTION_COUNT_ID })
      expect(mockSendToConnection).not.toHaveBeenCalled()
    })

    it('should handle optional exceptConnectionId parameter', async () => {
      const connections = [{ connectionId: 'conn-1' }]
      const mockCount = { connectionId: CONNECTION_COUNT_ID, connectionCount: 5 }
      mockRead.mockResolvedValueOnce(mockCount)
      mockReadAll.mockResolvedValueOnce(connections)
      mockSendToConnection.mockResolvedValueOnce(undefined)

      // Call without exceptConnectionId parameter
      await broadcastConnectionCount()

      expect(mockRead).toHaveBeenCalledWith({ connectionId: CONNECTION_COUNT_ID })
      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          ConnectionId: expect.any(String),
          Data: Buffer.from(JSON.stringify({ count: mockCount.connectionCount })),
        })
      )
    })

    it('should not boradcast to the excluded connection', async () => {
      const connections = [{ connectionId: 'conn-1' }, { connectionId: 'conn-except' }]
      const mockCount = { connectionId: CONNECTION_COUNT_ID, connectionCount: 5 }
      const exceptId = 'conn-except'

      mockRead.mockResolvedValueOnce(mockCount)
      mockReadAll.mockResolvedValueOnce(connections)
      mockSendToConnection.mockResolvedValueOnce(undefined)

      await broadcastConnectionCount(exceptId)

      expect(mockRead).toHaveBeenCalledWith({ connectionId: CONNECTION_COUNT_ID })
      expect(mockReadAll).toHaveBeenCalled()
      // Verify that exceptConnectionId is passed to broadcastEvent
      expect(mockSendToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          ConnectionId: 'conn-1',
          Data: Buffer.from(JSON.stringify({ count: mockCount.connectionCount })),
        })
      )
      expect(mockSendToConnection).toHaveBeenCalledTimes(1)
    })
  })
})
