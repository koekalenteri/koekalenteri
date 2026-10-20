import { expectTypeOf, vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'

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
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: mockDynamoDBClient,
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
  let infoSpy = vi.spyOn(console, 'info')

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset console mocks
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
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

    // KOE-1415: a type test, checked by tsc (`npm run lint-backend`), which fails on an expected
    // error that does not occur. A client reaches its constructor's table and no other: neither the
    // table nor the SDK clients underneath can be swapped or used past the methods.
    it('keeps its table and SDK clients to itself', () => {
      const client = new CustomDynamoClient('TestTable')

      // @ts-expect-error the table is fixed at construction
      client.table = 'other-table'
      // @ts-expect-error the document client is private
      expectTypeOf(client.docClient).toBeObject()
      expectTypeOf(client).not.toHaveProperty('client')
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

    it('scans only its own table, whatever options it is handed', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({ Items: [] })
      const options = { filter: '#a = :a', table: 'CustomTable' }

      // @ts-expect-error a table option is no option, not even through a variable
      await client.readAll(options)

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ TableName: 'default-table' }))
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

    it('scans without the deletedAt filter when deleted rows are asked for', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [{ deletedAt: '2024-01-01T00:00:00.000Z', id: '1' }, { id: '2' }] })

      const result = await client.readAll({ includeDeleted: true })

      expect(mockSend).toHaveBeenCalledWith({ ExclusiveStartKey: undefined, TableName: 'test-table' })
      expect(result).toEqual([{ deletedAt: '2024-01-01T00:00:00.000Z', id: '1' }, { id: '2' }])
    })

    it('keeps only the custom filter when deleted rows are asked for', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [] })

      await client.readAll({
        filter: '#attribute = :value',
        includeDeleted: true,
        names: { '#attribute': 'attribute' },
        values: { ':value': 'test' },
      })

      expect(mockSend).toHaveBeenCalledWith({
        ExclusiveStartKey: undefined,
        ExpressionAttributeNames: { '#attribute': 'attribute' },
        ExpressionAttributeValues: { ':value': 'test' },
        FilterExpression: '#attribute = :value',
        TableName: 'test-table',
      })
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

    it('normalizes a string set attribute into a sorted plain array', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Item: { id: '1', openPayments: new Set(['b', 'a']) } })

      const result = await client.read<{ id: string; openPayments: string[] }>({ id: '1' })

      expect(result).toEqual({ id: '1', openPayments: ['a', 'b'] })
      expect(Array.isArray(result?.openPayments)).toBe(true)
    })

    // A number set must sort numerically, not lexicographically: the default comparator would put
    // 10 before 2.
    it('normalizes a number set attribute into a numerically sorted plain array', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Item: { id: '1', years: new Set([10, 2, 1]) } })

      const result = await client.read<{ id: string; years: number[] }>({ id: '1' })

      expect(result).toEqual({ id: '1', years: [1, 2, 10] })
    })

    it('returns undefined when key is null', async () => {
      const client = new CustomDynamoClient('TestTable')

      const result = await client.read(null)

      expect(mockSend).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('reads strongly consistent from its own table', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({ Item: {} })

      await client.read({ id: '1' }, true)

      expect(mockSend).toHaveBeenCalledWith({ ConsistentRead: true, Key: { id: '1' }, TableName: 'default-table' })
    })

    it('takes no table argument', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({ Item: {} })

      // @ts-expect-error the second argument is the consistency flag
      await client.read({ id: '1' }, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ TableName: 'default-table' }))
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
        FilterExpression: 'attribute_not_exists(deletedAt)',
        IndexName: undefined,
        KeyConditionExpression: 'id = :id',
        Limit: undefined,
        ScanIndexForward: undefined,
        TableName: 'test-table',
      })
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    // KOE-1585: a query leaves the soft-deleted rows out, as readAll does, unless it asks for them.
    it.each([
      [{}, undefined],
      [{ filterExpression: '#state <> :draft' }, '#state <> :draft'],
    ])('sends the caller filter as it is when the deleted rows are asked for: %o', async (filter, expected) => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [] })

      await client.query({ ...filter, includeDeleted: true, key: 'id = :id', values: { ':id': '1' } })

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ FilterExpression: expected }))
    })

    it('normalizes a string set attribute on each item into a sorted plain array', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [{ id: '1', openRefunds: new Set(['r2', 'r1']) }] })

      const result = await client.query({ key: 'id = :id', values: { ':id': '1' } })

      expect(result).toEqual([{ id: '1', openRefunds: ['r1', 'r2'] }])
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
        values: { ':id': '1' },
      })

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: { ':id': '1' },
        FilterExpression: '(attribute_not_exists(deletedAt)) AND (#attr = :value)',
        IndexName: 'GSI1',
        KeyConditionExpression: 'id = :id',
        Limit: 10,
        ScanIndexForward: false,
        TableName: 'test-table',
      })
    })

    it('queries only its own table, whatever parameters it is handed', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Items: [] })
      const params = { key: 'id = :id', table: 'CustomTable', values: { ':id': '1' } }

      // @ts-expect-error a table parameter is no parameter, not even through a variable
      await client.query(params)

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ TableName: 'test-table' }))
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
        FilterExpression: 'attribute_not_exists(deletedAt)',
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
        FilterExpression: 'attribute_not_exists(deletedAt)',
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

    it('sends a condition with its names and values', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.write(
        { id: '1' },
        {
          expression: '#u = :read',
          names: { '#u': 'updatedAt' },
          values: { ':read': 'then' },
        }
      )

      expect(mockSend).toHaveBeenCalledWith({
        ConditionExpression: '#u = :read',
        ExpressionAttributeNames: { '#u': 'updatedAt' },
        ExpressionAttributeValues: { ':read': 'then' },
        Item: { id: '1' },
        TableName: 'test-table',
      })
    })

    it('sends a condition that needs no names or values as the expression alone', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.write({ id: '1' }, { expression: 'attribute_not_exists(updatedAt)' })

      expect(mockSend).toHaveBeenCalledWith({
        ConditionExpression: 'attribute_not_exists(updatedAt)',
        Item: { id: '1' },
        TableName: 'test-table',
      })
    })

    it('takes no table argument', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({})

      // @ts-expect-error the second argument is the condition
      await client.write({ id: '1' }, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith({ Item: { id: '1' }, TableName: 'default-table' })
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

    it('normalizes a string set attribute on each item into a sorted plain array', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Responses: { 'test-table': [{ id: '1', openPayments: new Set(['b', 'a']) }] } })

      const items = await client.batchGet([{ id: '1' }])

      expect(items).toEqual([{ id: '1', openPayments: ['a', 'b'] }])
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

    it('takes no table argument', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({ Responses: { 'default-table': [{ id: '1' }] } })

      // @ts-expect-error the keys are the only argument
      await expect(client.batchGet([{ id: '1' }], 'CustomTable')).resolves.toEqual([{ id: '1' }])
      expect(mockSend).toHaveBeenCalledWith({ RequestItems: { 'default-table': { Keys: [{ id: '1' }] } } })
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

    it('takes no table argument', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({})

      // @ts-expect-error the items are the only argument
      await client.batchWrite([{ id: '1' }], 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith({
        RequestItems: { 'default-table': [{ PutRequest: { Item: { id: '1' } } }] },
      })
    })

    it('logs one summary line per request instead of the items', async () => {
      const client = new CustomDynamoClient('TestTable')
      const items = Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, secret: 'not-for-the-log' }))

      await client.batchWrite(items)

      const summaries = loggedLines(infoSpy).filter((line) => line.message === 'DB.batchWrite')
      expect(summaries).toEqual([
        { attempt: 1, items: 25, level: 'info', message: 'DB.batchWrite', table: 'test-table', unprocessed: 0 },
        { attempt: 1, items: 5, level: 'info', message: 'DB.batchWrite', table: 'test-table', unprocessed: 0 },
      ])
      expect(JSON.stringify(summaries)).not.toContain('not-for-the-log')
    })

    it('retries the items DynamoDB could not process, after a backoff', async () => {
      vi.useFakeTimers()
      try {
        const client = new CustomDynamoClient('TestTable')
        const leftover = { PutRequest: { Item: { id: '2' } } }
        mockSend
          .mockResolvedValueOnce({ UnprocessedItems: { 'test-table': [leftover] } })
          .mockResolvedValueOnce({ UnprocessedItems: {} })

        const write = client.batchWrite([{ id: '1' }, { id: '2' }])
        await vi.runAllTimersAsync()
        await write

        expect(mockSend).toHaveBeenCalledTimes(2)
        expect(mockSend).toHaveBeenNthCalledWith(2, { RequestItems: { 'test-table': [leftover] } })
      } finally {
        vi.useRealTimers()
      }
    })

    it('fails when items stay unprocessed after every attempt', async () => {
      vi.useFakeTimers()
      try {
        const client = new CustomDynamoClient('TestTable')
        mockSend.mockResolvedValue({ UnprocessedItems: { 'test-table': [{ PutRequest: { Item: { id: '1' } } }] } })

        const write = client.batchWrite([{ id: '1' }])
        // The rejection must be observed before the timers run, or it would surface as unhandled.
        const outcome = expect(write).rejects.toThrow(
          'DynamoDB: 1 items of a batch write to test-table were left unprocessed after 5 attempts'
        )
        await vi.runAllTimersAsync()
        await outcome

        expect(mockSend).toHaveBeenCalledTimes(5)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('batchDelete', () => {
    it('deletes keys in requests of 25', async () => {
      const client = new CustomDynamoClient('TestTable')
      const keys = Array.from({ length: 30 }, (_, i) => ({ PK: 'P', SK: `${i}` }))

      await client.batchDelete(keys)

      expect(mockSend).toHaveBeenCalledTimes(2)
      expect(mockSend).toHaveBeenNthCalledWith(1, {
        RequestItems: { 'test-table': keys.slice(0, 25).map((Key) => ({ DeleteRequest: { Key } })) },
      })
      expect(mockSend).toHaveBeenNthCalledWith(2, {
        RequestItems: { 'test-table': keys.slice(25).map((Key) => ({ DeleteRequest: { Key } })) },
      })
    })

    it('takes no table argument', async () => {
      const client = new CustomDynamoClient('DefaultTable')

      // @ts-expect-error the keys are the only argument
      await client.batchDelete([{ id: '1' }], 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith({
        RequestItems: { 'default-table': [{ DeleteRequest: { Key: { id: '1' } } }] },
      })
    })

    it('does not call DynamoDB without keys', async () => {
      const client = new CustomDynamoClient('TestTable')

      await client.batchDelete([])

      expect(mockSend).not.toHaveBeenCalled()
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

    it('updates an item with a DELETE operation, removing elements from a set', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { delete: { openPayments: new Set(['t1']) } })

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeNames: { '#openPayments': 'openPayments' },
        ExpressionAttributeValues: { ':openPayments': new Set(['t1']) },
        Key: { id: '1' },
        TableName: 'test-table',
        UpdateExpression: 'DELETE #openPayments :openPayments',
      })
    })

    it('normalizes a returned Attributes set into a sorted plain array', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({ Attributes: { openPayments: new Set(['b', 'a']) } })

      const result = await client.update({ id: '1' }, { delete: { openPayments: new Set(['t1']) } }, 'UPDATED_OLD')

      expect(result.Attributes).toEqual({ openPayments: ['a', 'b'] })
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

      await client.update({ id: '1' }, { set: { name: 'Updated' } }, 'ALL_NEW')

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ReturnValues: 'ALL_NEW',
          TableName: 'test-table',
        })
      )
    })

    it('allows identical placeholders shared by update and condition expressions', async () => {
      const client = new CustomDynamoClient('TestTable')
      mockSend.mockResolvedValueOnce({})

      await client.update({ id: '1' }, { set: { registrationGroupsLock: { token: 'token' } } }, undefined, {
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
        client.update({ id: '1' }, { set: { registrationGroupsLock: 'locked' } }, undefined, {
          expression: 'attribute_not_exists(#registrationGroupsLock)',
          names: { '#registrationGroupsLock': 'anotherField' },
        })
      ).rejects.toThrow('DynamoDB: duplicate condition attribute: #registrationGroupsLock')
    })

    it('takes no table argument', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({})

      // @ts-expect-error the third argument is the return values
      await client.update({ id: '1' }, { set: { name: 'Updated' } }, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ TableName: 'default-table' }))
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
      expect(loggedLines(errorSpy)).toContainEqual(
        expect.objectContaining({ key: { id: '1' }, message: 'error deleting item' })
      )
    })

    it('takes no table argument', async () => {
      const client = new CustomDynamoClient('DefaultTable')
      mockSend.mockResolvedValueOnce({})

      // @ts-expect-error the key is the only argument
      await client.delete({ id: '1' }, 'CustomTable')

      expect(mockSend).toHaveBeenCalledWith({ Key: { id: '1' }, TableName: 'default-table' })
    })

    it('has no transaction of its own: a write across tables names them in documentTransaction', () => {
      const client = new CustomDynamoClient('DefaultTable')

      expect('transaction' in client).toBe(false)
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
