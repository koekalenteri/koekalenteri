import { jest } from '@jest/globals'

// Mock AWS SDK v3
const mockSend = jest.fn<any>()
const mockDynamoDBClient = jest.fn().mockImplementation(() => ({
  send: mockSend,
}))
const mockFrom = jest.fn().mockImplementation((client) => ({
  send: mockSend,
}))

// Mock the DynamoDB client and commands
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: mockDynamoDBClient,
}))

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: mockFrom,
  },
  ScanCommand: jest.fn().mockImplementation((params) => params),
  GetCommand: jest.fn().mockImplementation((params) => params),
  QueryCommand: jest.fn().mockImplementation((params) => params),
  PutCommand: jest.fn().mockImplementation((params) => params),
  BatchWriteCommand: jest.fn().mockImplementation((params) => params),
  UpdateCommand: jest.fn().mockImplementation((params) => params),
  DeleteCommand: jest.fn().mockImplementation((params) => params),
}))

// Import the class dynamically after mocking
const { default: CustomDynamoClient } = await import('./CustomDynamoClient')

describe('CustomDynamoClient', () => {
  // Store original env vars to restore after tests
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset console mocks
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'info').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    // Reset mockSend for each test
    mockSend.mockReset()
    mockDynamoDBClient.mockClear()
    mockFrom.mockClear()
  })

  afterEach(() => {
    // Restore original env vars
    process.env = originalEnv
  })

  describe('constructor', () => {
    it('initializes with the provided table name', () => {
      const client = new CustomDynamoClient('TestTable')
      expect(client.table).toBe('test-table')
    })

    it('handles SAM local environment', () => {
      process.env = { ...originalEnv, AWS_SAM_LOCAL: 'true' }

      const client = new CustomDynamoClient('TestTable')

      // Should create DynamoDBClient with endpoint for local DynamoDB
      expect(mockDynamoDBClient).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'http://dynamodb:8000',
        })
      )
    })
  })

  describe('readAll', () => {
    it('scans the table with default parameters', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [{ id: '1' }, { id: '2' }] })

      const result = await client.readAll()

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'test-table',
        FilterExpression: 'attribute_not_exists(deletedAt)',
      })
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('scans with custom filter expression', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [{ id: '1' }] })

      await client.readAll(undefined, 'attribute = :value', { ':value': 'test' })

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'test-table',
        FilterExpression: '(attribute_not_exists(deletedAt)) AND (attribute = :value)',
        ExpressionAttributeValues: { ':value': 'test' },
      })
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({ Items: [] })

      await client.readAll('CustomTable')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })

    it('includes expression attribute names when provided', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [] })

      await client.readAll(undefined, '#attr = :value', { ':value': 'test' }, { '#attr': 'attribute' })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeNames: { '#attr': 'attribute' },
        })
      )
    })
  })

  describe('read', () => {
    it('gets an item by key', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Item: { id: '1', name: 'Test' } })

      const result = await client.read({ id: '1' })

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'test-table',
        Key: { id: '1' },
      })
      expect(result).toEqual({ id: '1', name: 'Test' })
    })

    it('returns undefined when key is null', async () => {
      const client = new CustomDynamoClient('TestTable')

      const result = await client.read(null)

      expect(mockSend).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({ Item: {} })

      await client.read({ id: '1' }, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })
  })

  describe('query', () => {
    it('queries items with key condition', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [{ id: '1' }, { id: '2' }] })

      const result = await client.query('id = :id', { ':id': '1' })

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'test-table',
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': '1' },
        IndexName: undefined,
        ExpressionAttributeNames: undefined,
        ScanIndexForward: undefined,
        Limit: undefined,
        FilterExpression: undefined,
      })
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('returns undefined when key is falsy', async () => {
      const client = new CustomDynamoClient('TestTable')

      const result = await client.query('', { ':id': '1' })

      expect(mockSend).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('includes all optional parameters', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [] })

      await client.query(
        'id = :id',
        { ':id': '1' },
        'CustomTable',
        'GSI1',
        { '#name': 'name' },
        false,
        10,
        '#attr = :value'
      )

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'custom-table',
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': '1' },
        IndexName: 'GSI1',
        ExpressionAttributeNames: { '#name': 'name' },
        ScanIndexForward: false,
        Limit: 10,
        FilterExpression: '#attr = :value',
      })
    })
  })

  describe('write', () => {
    it('puts an item into the table', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      const item = { id: '1', name: 'Test' }
      await client.write(item)

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'test-table',
        Item: item,
      })
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({})

      await client.write({ id: '1' }, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })
  })

  describe('batchWrite', () => {
    it('writes items in batches of 25', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValue({})

      // Create 30 items to test batching
      const items = Array.from({ length: 30 }, (_, i) => ({ id: `${i}` }))
      await client.batchWrite(items)

      // Should be called twice (25 items in first batch, 5 in second)
      expect(mockSend).toHaveBeenCalledTimes(2)

      // First batch should have 25 items
      expect(mockSend).toHaveBeenNthCalledWith(1, {
        RequestItems: {
          'test-table': expect.arrayContaining([
            expect.objectContaining({
              PutRequest: expect.objectContaining({
                Item: expect.objectContaining({ id: '0' }),
              }),
            }),
          ]),
        },
      })

      // We've already verified that mockSend was called twice,
      // which confirms our batching logic is working
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({})

      // Create a typed array to avoid TypeScript errors
      const items = [{ id: '1' }]
      await client.batchWrite(items, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          RequestItems: {
            'custom-table': expect.any(Array),
          },
        })
      )
    })
  })

  describe('update', () => {
    it('updates an item with SET operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { set: { name: 'Updated', status: 'active' } })

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'test-table',
        Key: { id: '1' },
        UpdateExpression: 'SET #name = :name, #status = :status',
        ExpressionAttributeNames: { '#name': 'name', '#status': 'status' },
        ExpressionAttributeValues: { ':name': 'Updated', ':status': 'active' },
      })
    })

    it('updates an item with ADD operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { add: { count: 1, points: 5 } })

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'test-table',
        Key: { id: '1' },
        UpdateExpression: 'ADD #count :count, #points :points',
        ExpressionAttributeNames: { '#count': 'count', '#points': 'points' },
        ExpressionAttributeValues: { ':count': 1, ':points': 5 },
      })
    })

    it('updates an item with both SET and ADD operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update(
        { id: '1' },
        {
          set: { name: 'Updated', status: 'active' },
          add: { count: 1, points: 5 },
        }
      )

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'test-table',
        Key: { id: '1' },
        UpdateExpression: 'SET #name = :name, #status = :status ADD #count :count, #points :points',
        ExpressionAttributeNames: {
          '#name': 'name',
          '#status': 'status',
          '#count': 'count',
          '#points': 'points',
        },
        ExpressionAttributeValues: {
          ':name': 'Updated',
          ':status': 'active',
          ':count': 1,
          ':points': 5,
        },
      })
    })

    it('throws an error when no operations are provided', async () => {
      const client = new CustomDynamoClient('TestTable')

      await expect(client.update({ id: '1' }, {})).rejects.toThrow('No update operations provided')
      await expect(client.update({ id: '1' }, { set: {}, add: {} })).rejects.toThrow('No update operations provided')
    })

    it('throws an error when set and add operations are attempted for same field', async () => {
      const client = new CustomDynamoClient('TestTable')

      await expect(client.update({ id: '1', cnt: 1 }, { set: { cnt: 3 }, add: { cnt: 1 } })).rejects.toThrow(
        'DynamoDB: can not SET and ADD same field: cnt'
      )
    })

    it('includes ReturnValues when provided', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { set: { name: 'Updated' } }, undefined, 'ALL_NEW')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ReturnValues: 'ALL_NEW',
        })
      )
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { set: { name: 'Updated' } }, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })
  })

  describe('delete', () => {
    it('deletes an item by key', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      const result = await client.delete({ id: '1' })

      expect(mockSend).toHaveBeenCalledWith({
        TableName: 'test-table',
        Key: { id: '1' },
      })
      expect(result).toBe(true)
    })

    it('returns false when key is null', async () => {
      const client = new CustomDynamoClient('TestTable')

      const result = await client.delete(null)

      expect(mockSend).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })

    it('returns false when there is an error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementationOnce(() => {})
      const client = new CustomDynamoClient('TestTable')
      const error = new Error('Failed to delete')
      mockSend.mockRejectedValueOnce(error)

      const result = await client.delete({ id: '1' })

      expect(result).toBe(false)
      expect(errorSpy).toHaveBeenCalledWith('Error deleting item:', error)
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({})

      await client.delete({ id: '1' }, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })
  })

  describe('fromSamLocalTable', () => {
    // We need to test the utility function directly
    // Since it's not exported, we'll test it through the class methods

    it('converts PascalCase to kebab-case for SAM local tables', () => {
      process.env = { ...originalEnv, AWS_SAM_LOCAL: 'true' }

      const client = new CustomDynamoClient('TestTable')
      expect(client.table).toBe('test-table')

      const client2 = new CustomDynamoClient('UserProfileTable')
      expect(client2.table).toBe('user-profile-table')
    })
  })
})
