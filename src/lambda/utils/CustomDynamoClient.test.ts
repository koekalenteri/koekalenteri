import type { TransactWriteItemWithoutTable } from './CustomDynamoClient'
import { vi } from 'vitest'

// Mock AWS SDK v3
let sentCommand: Record<string, any> | undefined
const mockSend = vi.fn((command: Record<string, any>) => {
  sentCommand = command
  return Promise.resolve({})
})
const mockDynamoDBClient = vi.fn().mockImplementation(function MockDynamoDBClient() {
  return { send: mockSend }
})
const mockFrom = vi.fn().mockImplementation((_client) => ({
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

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: mockDynamoDBClient,
  TransactionCanceledException: MockTransactionCanceledException,
  TransactWriteItemsCommand: vi.fn().mockImplementation(function TransactWriteItemsCommand(params) {
    return params
  }),
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  BatchGetCommand: vi.fn().mockImplementation(function BatchGetCommand(params) {
    return params
  }),
  BatchWriteCommand: vi.fn().mockImplementation(function BatchWriteCommand(params) {
    return params
  }),
  DeleteCommand: vi.fn().mockImplementation(function DeleteCommand(params) {
    return params
  }),
  DynamoDBDocumentClient: {
    from: mockFrom,
  },
  GetCommand: vi.fn().mockImplementation(function GetCommand(params) {
    return params
  }),
  PutCommand: vi.fn().mockImplementation(function PutCommand(params) {
    return params
  }),
  QueryCommand: vi.fn().mockImplementation(function QueryCommand(params) {
    return params
  }),
  ScanCommand: vi.fn().mockImplementation(function ScanCommand(params) {
    return params
  }),
  TransactWriteCommand: vi.fn().mockImplementation(function TransactWriteCommand(params) {
    return params
  }),
  UpdateCommand: vi.fn().mockImplementation(function UpdateCommand(params) {
    return params
  }),
}))

// Import the class dynamically after mocking
const { default: CustomDynamoClient } = await import('./CustomDynamoClient')

describe('CustomDynamoClient', () => {
  // Store original env vars to restore after tests
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset console mocks
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Reset mockSend for each test
    mockSend.mockClear()
    sentCommand = undefined
    mockSend.mockImplementation((command: Record<string, any>) => {
      sentCommand = command
      return Promise.resolve({})
    })
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
        ExclusiveStartKey: undefined,
        FilterExpression: 'attribute_not_exists(deletedAt)',
        TableName: 'test-table',
      })
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('scans with custom filter expression', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [{ id: '1' }] })

      await client.readAll({
        filter: '#attribute = :value',
        names: { '#attribute': 'attribute' },
        values: { ':value': 'test' },
      })

      expect(mockSend).toHaveBeenCalledWith({
        ExclusiveStartKey: undefined,
        ExpressionAttributeNames: { '#attribute': 'attribute' },
        ExpressionAttributeValues: { ':value': 'test' },
        FilterExpression: '(attribute_not_exists(deletedAt)) AND (#attribute = :value)',
        TableName: 'test-table',
      })
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({ Items: [] })

      await client.readAll({ table: 'CustomTable' })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExclusiveStartKey: undefined,
          TableName: 'custom-table',
        })
      )
    })

    it('includes expression attribute names when provided', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [] })

      await client.readAll({
        filter: '#attr = :value',
        names: { '#attr': 'attribute' },
        values: { ':value': 'test' },
      })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExclusiveStartKey: undefined,
          ExpressionAttributeNames: { '#attr': 'attribute' },
        })
      )
    })

    it('includes a projection expression when provided', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [{ PK: 'STAT#2025', SK: 'dog' }] })

      await client.readAll({ projection: 'PK, SK' })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ProjectionExpression: 'PK, SK',
        })
      )
    })

    it('continues scanning until all pages are read', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend
        .mockResolvedValueOnce({ Items: [{ id: '1' }], LastEvaluatedKey: { id: '1' } })
        .mockResolvedValueOnce({ Items: [{ id: '2' }] })

      const result = await client.readAll()

      expect(mockSend).toHaveBeenNthCalledWith(1, {
        ExclusiveStartKey: undefined,
        FilterExpression: 'attribute_not_exists(deletedAt)',
        TableName: 'test-table',
      })
      expect(mockSend).toHaveBeenNthCalledWith(2, {
        ExclusiveStartKey: { id: '1' },
        FilterExpression: 'attribute_not_exists(deletedAt)',
        TableName: 'test-table',
      })
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
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

    it('supports strongly consistent base-table queries', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [] })

      await client.query({ consistent: true, key: 'id = :id', values: { ':id': '1' } })

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ ConsistentRead: true }))
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

    it('continues querying until all pages are read', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend
        .mockResolvedValueOnce({ Items: [{ id: '1' }], LastEvaluatedKey: { id: '1' } })
        .mockResolvedValueOnce({ Items: [{ id: '2' }] })

      const result = await client.query({
        key: 'type = :type',
        values: { ':type': 'registration' },
      })

      expect(mockSend).toHaveBeenNthCalledWith(1, {
        ExpressionAttributeNames: undefined,
        ExpressionAttributeValues: { ':type': 'registration' },
        FilterExpression: undefined,
        IndexName: undefined,
        KeyConditionExpression: 'type = :type',
        Limit: undefined,
        ScanIndexForward: undefined,
        TableName: 'test-table',
      })
      expect(mockSend).toHaveBeenNthCalledWith(2, {
        ExclusiveStartKey: { id: '1' },
        ExpressionAttributeNames: undefined,
        ExpressionAttributeValues: { ':type': 'registration' },
        FilterExpression: undefined,
        IndexName: undefined,
        KeyConditionExpression: 'type = :type',
        Limit: undefined,
        ScanIndexForward: undefined,
        TableName: 'test-table',
      })
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('continues querying empty filtered pages when a limit is provided', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend
        .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { id: '1' } })
        .mockResolvedValueOnce({ Items: [{ id: '2' }], LastEvaluatedKey: { id: '2' } })

      const result = await client.query({
        filterExpression: 'active = :active',
        key: 'type = :type',
        limit: 1,
        values: { ':active': true, ':type': 'registration' },
      })

      expect(mockSend).toHaveBeenCalledTimes(2)
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.objectContaining({ ExclusiveStartKey: { id: '1' }, Limit: 1 }))
      expect(result).toEqual([{ id: '2' }])
    })
  })

  describe('write', () => {
    it('puts an item into the table', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockImplementationOnce((command: Record<string, any>) => {
        sentCommand = command
        return Promise.resolve({})
      })

      const item = { id: '1', name: 'Test' }
      await client.write(item)

      expect(mockSend).toHaveBeenCalledWith({
        Item: item,
        TableName: 'test-table',
      })
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockImplementationOnce((command: Record<string, any>) => {
        sentCommand = command
        return Promise.resolve({})
      })

      await client.write({ id: '1' }, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'custom-table',
        })
      )
    })

    it('supports nested dot-path SET operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { set: { 'contactInfo.secretary.email': 'sec@example.com' } })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeNames: expect.objectContaining({
            '#contactInfo': 'contactInfo',
            '#email': 'email',
            '#secretary': 'secretary',
          }),
          ExpressionAttributeValues: {
            ':contactInfo_secretary_email': 'sec@example.com',
          },
          UpdateExpression: 'SET #contactInfo.#secretary.#email = :contactInfo_secretary_email',
        })
      )
    })

    it('supports nested dot-path SET operations with array index segments', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { set: { 'classes.0.class': 'ALO' } })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeNames: expect.objectContaining({
            '#class': 'class',
            '#classes': 'classes',
          }),
          ExpressionAttributeValues: {
            ':classes_0_class': 'ALO',
          },
          UpdateExpression: 'SET #classes[0].#class = :classes_0_class',
        })
      )
    })

    it('supports nested dot-path REMOVE operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { remove: ['contactInfo.secretary.phone'] })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeNames: expect.objectContaining({
            '#contactInfo': 'contactInfo',
            '#phone': 'phone',
            '#secretary': 'secretary',
          }),
          UpdateExpression: 'REMOVE #contactInfo.#secretary.#phone',
        })
      )
      expect(mockSend).toHaveBeenCalledWith(
        expect.not.objectContaining({ ExpressionAttributeValues: expect.anything() })
      )
    })

    it('supports nested dot-path REMOVE operations with array index segments', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { remove: ['classes.0.judge.0'] })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeNames: expect.objectContaining({
            '#classes': 'classes',
            '#judge': 'judge',
          }),
          UpdateExpression: 'REMOVE #classes[0].#judge[0]',
        })
      )
      expect(mockSend).toHaveBeenCalledWith(
        expect.not.objectContaining({ ExpressionAttributeValues: expect.anything() })
      )
    })

    it('supports nested dot-path SET operations with date-string keys (regression: #2026-08-22 is invalid)', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockImplementationOnce((command: Record<string, any>) => {
        sentCommand = command
        return Promise.resolve({})
      })

      await client.update({ id: '1' }, { set: { 'placesPerDay.2026-08-22': 1 } })

      expect(mockSend).toHaveBeenCalledWith(expect.any(Object))
      const call = sentCommand as Record<string, any>
      // All ExpressionAttributeNames keys must start with a letter or underscore after '#'
      for (const key of Object.keys(call.ExpressionAttributeNames ?? {})) {
        expect(key).toMatch(/^#[a-zA-Z_]/)
      }
      expect(call).toMatchObject({
        ExpressionAttributeNames: expect.objectContaining({
          '#n2026_08_22': '2026-08-22',
          '#placesPerDay': 'placesPerDay',
        }),
        ExpressionAttributeValues: {
          ':placesPerDay_2026_08_22': 1,
        },
        UpdateExpression: 'SET #placesPerDay.#n2026_08_22 = :placesPerDay_2026_08_22',
      })
    })
  })

  describe('batchGet', () => {
    it('returns the items for the requested keys', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Responses: { 'test-table': [{ id: '1' }, { id: '2' }] } })

      const items = await client.batchGet([{ id: '1' }, { id: '2' }])

      expect(items).toEqual([{ id: '1' }, { id: '2' }])
      expect(mockSend).toHaveBeenCalledWith({
        RequestItems: { 'test-table': { Keys: [{ id: '1' }, { id: '2' }] } },
      })
    })

    it('does not call DynamoDB without keys', async () => {
      const client = new CustomDynamoClient('TestTable')

      await expect(client.batchGet([])).resolves.toEqual([])

      expect(mockSend).not.toHaveBeenCalled()
    })

    it('splits the keys into requests of 100', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValue({ Responses: { 'test-table': [] } })
      const keys = Array.from({ length: 150 }, (_, i) => ({ id: `${i}` }))

      await client.batchGet(keys)

      expect(mockSend).toHaveBeenCalledTimes(2)
      expect(mockSend).toHaveBeenNthCalledWith(1, {
        RequestItems: { 'test-table': { Keys: keys.slice(0, 100) } },
      })
      expect(mockSend).toHaveBeenNthCalledWith(2, {
        RequestItems: { 'test-table': { Keys: keys.slice(100) } },
      })
    })

    it('retries the keys DynamoDB could not process', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend
        .mockResolvedValueOnce({
          Responses: { 'test-table': [{ id: '1' }] },
          UnprocessedKeys: { 'test-table': { Keys: [{ id: '2' }] } },
        })
        .mockResolvedValueOnce({ Responses: { 'test-table': [{ id: '2' }] } })

      const items = await client.batchGet([{ id: '1' }, { id: '2' }])

      expect(items).toEqual([{ id: '1' }, { id: '2' }])
      expect(mockSend).toHaveBeenCalledTimes(2)
      expect(mockSend).toHaveBeenNthCalledWith(2, {
        RequestItems: { 'test-table': { Keys: [{ id: '2' }] } },
      })
    })

    it('gives up after three attempts rather than looping', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValue({
        Responses: { 'test-table': [] },
        UnprocessedKeys: { 'test-table': { Keys: [{ id: '1' }] } },
      })

      await client.batchGet([{ id: '1' }])

      expect(mockSend).toHaveBeenCalledTimes(3)
    })

    it('uses provided table name', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({ Responses: { 'custom-table': [{ id: '1' }] } })

      await expect(client.batchGet([{ id: '1' }], 'CustomTable')).resolves.toEqual([{ id: '1' }])
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
        'DynamoDB: duplicate field in update expression: cnt'
      )
    })

    it('supports remove operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { remove: ['paymentResponse'], set: { status: 'ok' } })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeNames: {
            '#paymentResponse': 'paymentResponse',
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':status': 'ok',
          },
          Key: { id: '1' },
          TableName: 'test-table',
          UpdateExpression: 'SET #status = :status REMOVE #paymentResponse',
        })
      )
    })

    it('omits ExpressionAttributeValues for remove-only operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { remove: ['eventId'] })

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeNames: { '#eventId': 'eventId' },
        Key: { id: '1' },
        TableName: 'test-table',
        UpdateExpression: 'REMOVE #eventId',
      })
    })

    it('supports combined dotted nested SET and REMOVE operations', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update(
        { id: '1' },
        {
          remove: ['contactInfo.secretary.phone'],
          set: { 'contactInfo.secretary.email': 'sec@example.com' },
        }
      )

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeNames: {
          '#contactInfo': 'contactInfo',
          '#email': 'email',
          '#phone': 'phone',
          '#secretary': 'secretary',
        },
        ExpressionAttributeValues: {
          ':contactInfo_secretary_email': 'sec@example.com',
        },
        Key: { id: '1' },
        TableName: 'test-table',
        UpdateExpression:
          'SET #contactInfo.#secretary.#email = :contactInfo_secretary_email REMOVE #contactInfo.#secretary.#phone',
      })
    })

    it('does not include unused duplicate-key entries in ExpressionAttributeNames (regression)', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockImplementationOnce((command: Record<string, any>) => {
        sentCommand = command
        return Promise.resolve({})
      })

      // Mirrors a real update payload that previously triggered:
      //   "Value provided in ExpressionAttributeNames unused in expressions:
      //    keys: {#official_email, #cost_normal, #placesPerDay_2026_08_22, ...}"
      await client.update(
        { id: 'ZsHxFka3xG' },
        {
          set: {
            'contactInfo.secretary.email': 'kurkle@gmail.com',
            'contactInfo.secretary.name': '',
            'contactInfo.secretary.phone': '',
            'cost.normal': 5,
            modifiedAt: '2026-05-24T21:37:12.375Z',
            'official.createdAt': '2025-08-29T05:14:02.541Z',
            'official.createdBy': 'system',
            'official.email': 'kikke.haverinen@gmail.com',
            'official.id': 'x-lzZyIYnX',
            'official.kcEmail': 'kikke.haverinen@gmail.com',
            'official.kcId': 613302,
            'official.location': 'Rovaniemi',
            'official.modifiedAt': '2026-05-18T23:14:30.960Z',
            'official.modifiedBy': 'system',
            'official.name': 'Kaisa Haverinen',
            'official.officer': ['NOME-A', 'NOME-B', 'NOU', 'NOWT'],
            'official.phone': '045 672 6795',
            places: 1,
            'placesPerDay.2026-08-22': 1,
            state: 'confirmed',
          },
        }
      )

      expect(mockSend).toHaveBeenCalledWith(expect.any(Object))
      const call = sentCommand as Record<string, any>
      const updateExpression: string = call.UpdateExpression
      const names: Record<string, string> = call.ExpressionAttributeNames

      // Every entry in ExpressionAttributeNames must actually be referenced in UpdateExpression
      for (const key of Object.keys(names)) {
        expect(updateExpression).toContain(key)
      }

      // The unused flattened "duplicateKey" entries must NOT be present
      expect(names).not.toHaveProperty('#contactInfo_secretary_email')
      expect(names).not.toHaveProperty('#official_email')
      expect(names).not.toHaveProperty('#cost_normal')
      expect(names).not.toHaveProperty('#placesPerDay_2026_08_22')
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

    it('allows identical placeholders shared by update and condition expressions', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { set: { registrationGroupsLock: { token: 'token' } } }, undefined, undefined, {
        expression: 'attribute_not_exists(#registrationGroupsLock)',
        names: { '#registrationGroupsLock': 'registrationGroupsLock' },
      })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ConditionExpression: 'attribute_not_exists(#registrationGroupsLock)',
          ExpressionAttributeNames: { '#registrationGroupsLock': 'registrationGroupsLock' },
        })
      )
    })

    it('rejects conflicting placeholders shared by update and condition expressions', async () => {
      const client = new CustomDynamoClient('TestTable')

      await expect(
        client.update({ id: '1' }, { set: { registrationGroupsLock: 'locked' } }, undefined, undefined, {
          expression: 'attribute_not_exists(#registrationGroupsLock)',
          names: { '#registrationGroupsLock': 'anotherField' },
        })
      ).rejects.toThrow('DynamoDB: duplicate condition attribute: #registrationGroupsLock')
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
      const errorSpy = vi.spyOn(console, 'error').mockImplementationOnce(() => {})
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
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const client = new CustomDynamoClient('TestTable')
      const items = [{ Put: { Item: { id: { S: '1' } } } }]

      // Create a TransactionCanceledException with cancellation reasons using our mock class
      const error = new MockTransactionCanceledException('Transaction canceled', [
        { Code: 'ConditionalCheckFailed', Message: 'Condition check failed' },
      ])

      mockSend.mockRejectedValueOnce(error)

      await expect(client.transaction(items)).rejects.toBe(error)

      expect(errorSpy).toHaveBeenCalledWith('❌ Transaction was canceled')
      expect(logSpy).toHaveBeenCalledWith('🔹 Operation 1:')
      expect(logSpy).toHaveBeenCalledWith('   Code: ConditionalCheckFailed')
      expect(logSpy).toHaveBeenCalledWith('   Message: Condition check failed')
    })

    it('handles TransactionCanceledException without reasons', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const client = new CustomDynamoClient('TestTable')
      const items = [{ Put: { Item: { id: { S: '1' } } } }]

      // Create a TransactionCanceledException without cancellation reasons using our mock class
      const error = new MockTransactionCanceledException('Transaction canceled')

      mockSend.mockRejectedValueOnce(error)

      await expect(client.transaction(items)).rejects.toBe(error)

      expect(errorSpy).toHaveBeenCalledWith('❌ Transaction was canceled')
      expect(logSpy).toHaveBeenCalledWith('No cancellation reasons returned')
    })

    it('handles unexpected errors in transaction', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const client = new CustomDynamoClient('TestTable')
      const items = [{ Put: { Item: { id: { S: '1' } } } }]

      // Create an error that is definitely not a TransactionCanceledException
      const error = new Error('Unexpected error')
      // Explicitly set name to something other than TransactionCanceledException
      error.name = 'SomeOtherError'

      mockSend.mockRejectedValueOnce(error)

      await expect(client.transaction(items)).rejects.toBe(error)

      expect(errorSpy).toHaveBeenCalledWith('❗ Unexpected error:', error)
    })
  })

  describe('documentTransaction', () => {
    it('sends native values to operations in different tables', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({})

      await client.documentTransaction([
        {
          Put: {
            Item: { id: 'tx-1', status: 'new' },
            TableName: 'TransactionTable',
          },
        },
        {
          Update: {
            ExpressionAttributeValues: { ':amount': 50 },
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: 'RegistrationTable',
            UpdateExpression: 'ADD paidAmount :amount',
          },
        },
      ])

      expect(mockSend).toHaveBeenCalledWith({
        TransactItems: [
          { Put: { Item: { id: 'tx-1', status: 'new' }, TableName: 'transaction-table' } },
          {
            Update: {
              ExpressionAttributeValues: { ':amount': 50 },
              Key: { eventId: 'event-1', id: 'registration-1' },
              TableName: 'registration-table',
              UpdateExpression: 'ADD paidAmount :amount',
            },
          },
        ],
      })
    })
  })
})
