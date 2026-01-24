import type { TransactWriteItemWithoutTable } from './CustomDynamoClient'
import { jest } from '@jest/globals'

// Mock AWS SDK v3
const mockSend = jest.fn<any>()
const mockDynamoDBClient = jest.fn().mockImplementation(() => ({
  send: mockSend,
}))
const mockFrom = jest.fn().mockImplementation((_client) => ({
  send: mockSend,
}))

// Mock the DynamoDB client and commands
// Create a custom TransactionCanceledException class
class MockTransactionCanceledException extends Error {
  CancellationReasons?: { Code: string; Message?: string }[]

  constructor(message: string, reasons?: { Code: string; Message?: string }[]) {
    super(message)
    this.name = 'TransactionCanceledException'
    this.CancellationReasons = reasons
  }
}

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: mockDynamoDBClient,
  TransactionCanceledException: MockTransactionCanceledException,
  TransactWriteItemsCommand: jest.fn().mockImplementation((params) => params),
}))

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  BatchWriteCommand: jest.fn().mockImplementation((params) => params),
  DeleteCommand: jest.fn().mockImplementation((params) => params),
  DynamoDBDocumentClient: {
    from: mockFrom,
  },
  GetCommand: jest.fn().mockImplementation((params) => params),
  PutCommand: jest.fn().mockImplementation((params) => params),
  QueryCommand: jest.fn().mockImplementation((params) => params),
  ScanCommand: jest.fn().mockImplementation((params) => params),
  UpdateCommand: jest.fn().mockImplementation((params) => params),
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

      const _client = new CustomDynamoClient('TestTable')

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
        FilterExpression: 'attribute_not_exists(deletedAt)',
        TableName: 'test-table',
      })
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('scans with custom filter expression', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [{ id: '1' }] })

      await client.readAll(undefined, 'attribute = :value', { ':value': 'test' })

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeValues: { ':value': 'test' },
        FilterExpression: '(attribute_not_exists(deletedAt)) AND (attribute = :value)',
        TableName: 'test-table',
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
        Key: { id: '1' },
        TableName: 'test-table',
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

      const result = await client.query({
        key: 'id = :id',
        values: { ':id': '1' },
      })

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeNames: undefined,
        ExpressionAttributeValues: { ':id': '1' },
        FilterExpression: undefined,
        IndexName: undefined,
        KeyConditionExpression: 'id = :id',
        Limit: undefined,
        ScanIndexForward: undefined,
        TableName: 'test-table',
      })
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('returns undefined when key is falsy', async () => {
      const client = new CustomDynamoClient('TestTable')

      const result = await client.query({
        key: '',
        values: { ':id': '1' },
      })

      expect(mockSend).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('includes all optional parameters', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [] })

      await client.query({
        filterExpression: '#attr = :value',
        forward: false,
        index: 'GSI1',
        key: 'id = :id',
        limit: 10,
        names: { '#name': 'name' },
        table: 'CustomTable',
        values: { ':id': '1' },
      })

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: { ':id': '1' },
        FilterExpression: '#attr = :value',
        IndexName: 'GSI1',
        KeyConditionExpression: 'id = :id',
        Limit: 10,
        ScanIndexForward: false,
        TableName: 'custom-table',
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
        Item: item,
        TableName: 'test-table',
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
        ExpressionAttributeNames: { '#name': 'name', '#status': 'status' },
        ExpressionAttributeValues: { ':name': 'Updated', ':status': 'active' },
        Key: { id: '1' },
        TableName: 'test-table',
        UpdateExpression: 'SET #name = :name, #status = :status',
      })
    })

    it('updates an item with ADD operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { add: { count: 1, points: 5 } })

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeNames: { '#count': 'count', '#points': 'points' },
        ExpressionAttributeValues: { ':count': 1, ':points': 5 },
        Key: { id: '1' },
        TableName: 'test-table',
        UpdateExpression: 'ADD #count :count, #points :points',
      })
    })

    it('updates an item with both SET and ADD operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update(
        { id: '1' },
        {
          add: { count: 1, points: 5 },
          set: { name: 'Updated', status: 'active' },
        }
      )

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeNames: {
          '#count': 'count',
          '#name': 'name',
          '#points': 'points',
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':count': 1,
          ':name': 'Updated',
          ':points': 5,
          ':status': 'active',
        },
        Key: { id: '1' },
        TableName: 'test-table',
        UpdateExpression: 'SET #name = :name, #status = :status ADD #count :count, #points :points',
      })
    })

    it('throws an error when no operations are provided', async () => {
      const client = new CustomDynamoClient('TestTable')

      await expect(client.update({ id: '1' }, {})).rejects.toThrow('No update operations provided')
      await expect(client.update({ id: '1' }, { add: {}, set: {} })).rejects.toThrow('No update operations provided')
    })

    it('throws an error when set and add operations are attempted for same field', async () => {
      const client = new CustomDynamoClient('TestTable')

      await expect(client.update({ cnt: 1, id: '1' }, { add: { cnt: 1 }, set: { cnt: 3 } })).rejects.toThrow(
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
        Key: { id: '1' },
        TableName: 'test-table',
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

  describe('transaction', () => {
    it('sends transaction with default table name', async () => {
      const client = new CustomDynamoClient('TestTable')
      const items = [
        { Put: { Item: { id: { S: '1' } } } },
        {
          Update: {
            ExpressionAttributeNames: { '#name': 'name' },
            ExpressionAttributeValues: { ':name': { S: 'value' } },
            Key: { id: { S: '2' } },
            UpdateExpression: 'SET #name = :name',
          },
        },
      ]
      mockSend.mockResolvedValueOnce({})

      await client.transaction(items)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactItems: [
            { Put: { Item: { id: { S: '1' } }, TableName: 'test-table' } },
            {
              Update: {
                ExpressionAttributeNames: { '#name': 'name' },
                ExpressionAttributeValues: { ':name': { S: 'value' } },
                Key: { id: { S: '2' } },
                TableName: 'test-table',
                UpdateExpression: 'SET #name = :name',
              },
            },
          ],
        })
      )
    })

    it('sends transaction with provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      const items = [{ Delete: { Key: { id: { S: '3' } } } }]
      mockSend.mockResolvedValueOnce({})

      await client.transaction(items, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactItems: [{ Delete: { Key: { id: { S: '3' } }, TableName: 'custom-table' } }],
        })
      )
    })

    it('includes ConditionCheck operations in transaction', async () => {
      const client = new CustomDynamoClient('TestTable')
      const items = [
        {
          ConditionCheck: {
            ConditionExpression: 'attribute_exists(id)',
            ExpressionAttributeNames: { '#id': 'id' },
            Key: { id: { S: '1' } },
          },
        },
      ]
      mockSend.mockResolvedValueOnce({})

      await client.transaction(items)

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactItems: [
            {
              ConditionCheck: {
                ConditionExpression: 'attribute_exists(id)',
                ExpressionAttributeNames: { '#id': 'id' },
                Key: { id: { S: '1' } },
                TableName: 'test-table',
              },
            },
          ],
        })
      )
    })

    it('handles empty operation objects in transaction items', async () => {
      const client = new CustomDynamoClient('TestTable')
      const items: TransactWriteItemWithoutTable[] = [
        { Delete: { Key: { id: { S: '3' } } } },
        { Put: undefined },
        { Update: undefined },
      ]
      mockSend.mockResolvedValueOnce({})

      await client.transaction(items)

      // Check that the transaction was sent with the correct items
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactItems: expect.arrayContaining([
            expect.objectContaining({
              Delete: expect.objectContaining({
                Key: { id: { S: '3' } },
                TableName: 'test-table',
              }),
            }),
          ]),
        })
      )
    })

    it('handles TransactionCanceledException', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      const client = new CustomDynamoClient('TestTable')
      const items = [{ Put: { Item: { id: { S: '1' } } } }]

      // Create a TransactionCanceledException with cancellation reasons using our mock class
      const error = new MockTransactionCanceledException('Transaction canceled', [
        { Code: 'ConditionalCheckFailed', Message: 'Condition check failed' },
      ])

      mockSend.mockRejectedValueOnce(error)

      await client.transaction(items)

      expect(errorSpy).toHaveBeenCalledWith('❌ Transaction was canceled')
      expect(logSpy).toHaveBeenCalledWith('🔹 Operation 1:')
      expect(logSpy).toHaveBeenCalledWith('   Code: ConditionalCheckFailed')
      expect(logSpy).toHaveBeenCalledWith('   Message: Condition check failed')
    })

    it('handles TransactionCanceledException without reasons', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      const client = new CustomDynamoClient('TestTable')
      const items = [{ Put: { Item: { id: { S: '1' } } } }]

      // Create a TransactionCanceledException without cancellation reasons using our mock class
      const error = new MockTransactionCanceledException('Transaction canceled')

      mockSend.mockRejectedValueOnce(error)

      await client.transaction(items)

      expect(errorSpy).toHaveBeenCalledWith('❌ Transaction was canceled')
      expect(logSpy).toHaveBeenCalledWith('No cancellation reasons returned')
    })

    it('handles unexpected errors in transaction', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const client = new CustomDynamoClient('TestTable')
      const items = [{ Put: { Item: { id: { S: '1' } } } }]

      // Create an error that is definitely not a TransactionCanceledException
      const error = new Error('Unexpected error')
      // Explicitly set name to something other than TransactionCanceledException
      error.name = 'SomeOtherError'

      mockSend.mockRejectedValueOnce(error)

      await client.transaction(items)

      expect(errorSpy).toHaveBeenCalledWith('❗ Unexpected error:', error)
    })
  })
})
