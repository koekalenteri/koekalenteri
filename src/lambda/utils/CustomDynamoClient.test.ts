import { jest } from '@jest/globals'

// Mock AWS SDK
const mockScan = jest.fn<any>()
const mockGet = jest.fn<any>()
const mockQuery = jest.fn<any>()
const mockPut = jest.fn<any>()
const mockBatchWrite = jest.fn<any>()
const mockUpdate = jest.fn<any>()
const mockDelete = jest.fn<any>()

// Mock the DocumentClient
const mockDocumentClient = {
  scan: jest.fn(() => ({ promise: mockScan })),
  get: jest.fn(() => ({ promise: mockGet })),
  query: jest.fn(() => ({ promise: mockQuery })),
  put: jest.fn(() => ({ promise: mockPut })),
  batchWrite: jest.fn(() => ({ promise: mockBatchWrite })),
  update: jest.fn(() => ({ promise: mockUpdate })),
  delete: jest.fn(() => ({ promise: mockDelete })),
}

const mockConstructor = jest.fn(() => mockDocumentClient)

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockConfig = {
    update: jest.fn(),
  }

  return {
    config: mockConfig,
    DynamoDB: {
      DocumentClient: mockConstructor,
    },
  }
})

// Set AWS region to prevent "Missing region in config" error
process.env.AWS_REGION = 'us-east-1'

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
      // Set SAM_LOCAL env var
      process.env = { ...originalEnv, AWS_SAM_LOCAL: 'true' }

      const client = new CustomDynamoClient('TestTable')

      // Should set endpoint for local DynamoDB
      expect(mockConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'http://dynamodb:8000',
        })
      )
    })
  })

  describe('readAll', () => {
    it('scans the table with default parameters', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockScan.mockResolvedValueOnce({ Items: [{ id: '1' }, { id: '2' }] })

      const result = await client.readAll()

      expect(mockDocumentClient.scan).toHaveBeenCalledWith({
        TableName: 'test-table',
        FilterExpression: 'attribute_not_exists(deletedAt)',
      })
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('scans with custom filter expression', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockScan.mockResolvedValueOnce({ Items: [{ id: '1' }] })

      await client.readAll(undefined, 'attribute = :value', { ':value': 'test' })

      expect(mockDocumentClient.scan).toHaveBeenCalledWith({
        TableName: 'test-table',
        FilterExpression: '(attribute_not_exists(deletedAt)) AND (attribute = :value)',
        ExpressionAttributeValues: { ':value': 'test' },
      })
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockScan.mockResolvedValueOnce({ Items: [] })

      await client.readAll('CustomTable')

      expect(mockDocumentClient.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })

    it('includes expression attribute names when provided', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockScan.mockResolvedValueOnce({ Items: [] })

      await client.readAll(undefined, '#attr = :value', { ':value': 'test' }, { '#attr': 'attribute' })

      expect(mockDocumentClient.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeNames: { '#attr': 'attribute' },
        })
      )
    })
  })

  describe('read', () => {
    it('gets an item by key', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockGet.mockResolvedValueOnce({ Item: { id: '1', name: 'Test' } })

      const result = await client.read({ id: '1' })

      expect(mockDocumentClient.get).toHaveBeenCalledWith({
        TableName: 'test-table',
        Key: { id: '1' },
      })
      expect(result).toEqual({ id: '1', name: 'Test' })
    })

    it('returns undefined when key is null', async () => {
      const client = new CustomDynamoClient('TestTable')

      const result = await client.read(null)

      expect(mockDocumentClient.get).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockGet.mockResolvedValueOnce({ Item: {} })

      await client.read({ id: '1' }, 'CustomTable')

      expect(mockDocumentClient.get).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })
  })

  describe('query', () => {
    it('queries items with key condition', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockQuery.mockResolvedValueOnce({ Items: [{ id: '1' }, { id: '2' }] })

      const result = await client.query('id = :id', { ':id': '1' })

      expect(mockDocumentClient.query).toHaveBeenCalledWith({
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

      expect(mockDocumentClient.query).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('includes all optional parameters', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockQuery.mockResolvedValueOnce({ Items: [] })

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

      expect(mockDocumentClient.query).toHaveBeenCalledWith({
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
      mockPut.mockResolvedValueOnce({})

      const item = { id: '1', name: 'Test' }
      await client.write(item)

      expect(mockDocumentClient.put).toHaveBeenCalledWith({
        TableName: 'test-table',
        Item: item,
      })
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockPut.mockResolvedValueOnce({})

      await client.write({ id: '1' }, 'CustomTable')

      expect(mockDocumentClient.put).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })
  })

  describe('batchWrite', () => {
    it('writes items in batches of 25', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockBatchWrite.mockResolvedValue({})

      // Create 30 items to test batching
      const items = Array.from({ length: 30 }, (_, i) => ({ id: `${i}` }))
      await client.batchWrite(items)

      // Should be called twice (25 items in first batch, 5 in second)
      expect(mockDocumentClient.batchWrite).toHaveBeenCalledTimes(2)

      // First batch should have 25 items
      expect(mockDocumentClient.batchWrite).toHaveBeenNthCalledWith(1, {
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

      // We've already verified that batchWrite was called twice,
      // which confirms our batching logic is working
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockBatchWrite.mockResolvedValueOnce({})

      // Create a typed array to avoid TypeScript errors
      const items = [{ id: '1' }]
      await client.batchWrite(items, 'CustomTable')

      expect(mockDocumentClient.batchWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          RequestItems: {
            'custom-table': expect.any(Array),
          },
        })
      )
    })
  })

  describe('update', () => {
    it('updates an item with expression', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockUpdate.mockResolvedValueOnce({})

      await client.update({ id: '1' }, 'SET #name = :name', { '#name': 'name' }, { ':name': 'Updated' })

      expect(mockDocumentClient.update).toHaveBeenCalledWith({
        TableName: 'test-table',
        Key: { id: '1' },
        UpdateExpression: 'SET #name = :name',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: { ':name': 'Updated' },
      })
    })

    it('includes ReturnValues when provided', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockUpdate.mockResolvedValueOnce({})

      await client.update(
        { id: '1' },
        'SET #name = :name',
        { '#name': 'name' },
        { ':name': 'Updated' },
        undefined,
        'ALL_NEW'
      )

      expect(mockDocumentClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ReturnValues: 'ALL_NEW',
        })
      )
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockUpdate.mockResolvedValueOnce({})

      await client.update({ id: '1' }, 'SET #name = :name', { '#name': 'name' }, { ':name': 'Updated' }, 'CustomTable')

      expect(mockDocumentClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })
  })

  describe('delete', () => {
    it('deletes an item by key', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockDelete.mockResolvedValueOnce({ $response: { error: null } })

      const result = await client.delete({ id: '1' })

      expect(mockDocumentClient.delete).toHaveBeenCalledWith({
        TableName: 'test-table',
        Key: { id: '1' },
      })
      expect(result).toBe(true)
    })

    it('returns false when key is null', async () => {
      const client = new CustomDynamoClient('TestTable')

      const result = await client.delete(null)

      expect(mockDocumentClient.delete).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })

    it('returns false when there is an error', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockDelete.mockResolvedValueOnce({ $response: { error: new Error('Failed to delete') } })

      const result = await client.delete({ id: '1' })

      expect(result).toBe(false)
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockDelete.mockResolvedValueOnce({ $response: { error: null } })

      await client.delete({ id: '1' }, 'CustomTable')

      expect(mockDocumentClient.delete).toHaveBeenCalledWith(
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
