import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockListByReference = jest.fn<any>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../payment/repository', () => ({
  paymentTransactionRepository: { listByReference: mockListByReference },
}))

const { getRegistrationTransactionsLambda } = await import('./handler')

describe('getRegistrationTransactionsLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123', id: 'reg456' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const result = await getRegistrationTransactionsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(result.statusCode).toBe(401)
    expect(mockListByReference).not.toHaveBeenCalled()
  })

  it('returns transactions if authorized', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const reference = `${eventId}:${regId}`
    const transactions = [
      {
        amount: 5000,
        createdAt: '2025-01-01T00:00:00.000Z',
        reference,
        status: 'ok',
        transactionId: 'tx1',
      },
      {
        amount: -5000,
        createdAt: '2025-01-02T00:00:00.000Z',
        reference,
        status: 'refunded',
        transactionId: 'tx2',
      },
    ]

    mockAuthorize.mockResolvedValueOnce(user)
    mockListByReference.mockResolvedValueOnce(transactions)

    const result = await getRegistrationTransactionsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockListByReference).toHaveBeenCalledWith(reference)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(transactions)
  })

  it('returns empty array if no transactions found', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const reference = `${eventId}:${regId}`
    const emptyTransactions: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockListByReference.mockResolvedValueOnce(emptyTransactions)

    const result = await getRegistrationTransactionsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockListByReference).toHaveBeenCalledWith(reference)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(emptyTransactions)
  })

  it('returns undefined if getTransactionsByReference returns undefined', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const reference = `${eventId}:${regId}`

    mockAuthorize.mockResolvedValueOnce(user)
    mockListByReference.mockResolvedValueOnce(undefined)

    const result = await getRegistrationTransactionsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockListByReference).toHaveBeenCalledWith(reference)
    expect(result.statusCode).toBe(200)
    expect(result.body).toBeUndefined()
  })

  it('handles missing eventId or id parameters', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = ''
    const regId = ''
    const reference = ':'
    const emptyTransactions: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockListByReference.mockResolvedValueOnce(emptyTransactions)

    const eventWithoutParams = {
      ...event,
      pathParameters: {},
    }

    const result = await getRegistrationTransactionsLambda(eventWithoutParams)

    expect(mockAuthorize).toHaveBeenCalledWith(eventWithoutParams)
    expect(mockListByReference).toHaveBeenCalledWith(reference)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual(emptyTransactions)
  })

  it('passes through errors from getTransactionsByReference', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const reference = `${eventId}:${regId}`
    const error = new Error('Database error')

    mockAuthorize.mockResolvedValueOnce(user)
    mockListByReference.mockRejectedValueOnce(error)

    await expect(getRegistrationTransactionsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockListByReference).toHaveBeenCalledWith(reference)
  })
})
