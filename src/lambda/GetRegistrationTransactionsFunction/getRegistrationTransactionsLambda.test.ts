import { jest } from '@jest/globals'

const mockAuthorize = jest.fn<any>()
const mockGetParam = jest.fn<any>()
const mockLambda = jest.fn((_name, fn) => fn)
const mockResponse = jest.fn<any>()
const mockGetTransactionsByReference = jest.fn<any>()
const mockRefreshTransactionStatusesFromPaytrail = jest.fn<any>()

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  getParam: mockGetParam,
  lambda: mockLambda,
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/payment', () => ({
  getTransactionsByReference: mockGetTransactionsByReference,
  refreshTransactionStatusesFromPaytrail: mockRefreshTransactionStatusesFromPaytrail,
}))

const { default: getRegistrationTransactionsLambda } = await import('./handler')

describe('getRegistrationTransactionsLambda', () => {
  const event = {
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123', id: 'reg456' },
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
    mockRefreshTransactionStatusesFromPaytrail.mockImplementation((transactions: unknown) =>
      Promise.resolve(transactions)
    )
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    await getRegistrationTransactionsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(401, 'Unauthorized', event)
    expect(mockGetParam).not.toHaveBeenCalled()
    expect(mockGetTransactionsByReference).not.toHaveBeenCalled()
    expect(mockRefreshTransactionStatusesFromPaytrail).not.toHaveBeenCalled()
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
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockResolvedValueOnce(transactions)
    mockRefreshTransactionStatusesFromPaytrail.mockResolvedValueOnce([
      transactions[0],
      {
        ...transactions[1],
        status: 'ok',
      },
    ])

    await getRegistrationTransactionsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetTransactionsByReference).toHaveBeenCalledWith(reference)
    expect(mockRefreshTransactionStatusesFromPaytrail).toHaveBeenCalledWith(transactions)
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      [
        transactions[0],
        {
          ...transactions[1],
          status: 'ok',
        },
      ],
      event
    )
  })

  it('returns empty array if no transactions found', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const reference = `${eventId}:${regId}`
    const emptyTransactions: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockResolvedValueOnce(emptyTransactions)

    await getRegistrationTransactionsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetTransactionsByReference).toHaveBeenCalledWith(reference)
    expect(mockRefreshTransactionStatusesFromPaytrail).toHaveBeenCalledWith(emptyTransactions)
    expect(mockResponse).toHaveBeenCalledWith(200, emptyTransactions, event)
  })

  it('returns undefined if getTransactionsByReference returns undefined', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const reference = `${eventId}:${regId}`

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockResolvedValueOnce(undefined)

    await getRegistrationTransactionsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetTransactionsByReference).toHaveBeenCalledWith(reference)
    expect(mockRefreshTransactionStatusesFromPaytrail).toHaveBeenCalledWith(undefined)
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('handles missing eventId or id parameters', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = undefined
    const regId = undefined
    const reference = 'undefined:undefined'
    const emptyTransactions: any[] = []

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockResolvedValueOnce(emptyTransactions)

    await getRegistrationTransactionsLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetTransactionsByReference).toHaveBeenCalledWith(reference)
    expect(mockRefreshTransactionStatusesFromPaytrail).toHaveBeenCalledWith(emptyTransactions)
    expect(mockResponse).toHaveBeenCalledWith(200, emptyTransactions, event)
  })

  it('passes through errors from getTransactionsByReference', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const reference = `${eventId}:${regId}`
    const error = new Error('Database error')

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockRejectedValueOnce(error)

    await expect(getRegistrationTransactionsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetTransactionsByReference).toHaveBeenCalledWith(reference)
    expect(mockRefreshTransactionStatusesFromPaytrail).not.toHaveBeenCalled()
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('passes through errors from refreshTransactionStatusesFromPaytrail', async () => {
    const user = { id: 'user1', name: 'Test User' }
    const eventId = 'event123'
    const regId = 'reg456'
    const reference = `${eventId}:${regId}`
    const transactions = [
      {
        amount: 5000,
        createdAt: '2025-01-01T00:00:00.000Z',
        reference,
        status: 'pending',
        transactionId: 'tx1',
        type: 'payment',
      },
    ]
    const error = new Error('Paytrail error')

    mockAuthorize.mockResolvedValueOnce(user)
    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockResolvedValueOnce(transactions)
    mockRefreshTransactionStatusesFromPaytrail.mockRejectedValueOnce(error)

    await expect(getRegistrationTransactionsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetTransactionsByReference).toHaveBeenCalledWith(reference)
    expect(mockRefreshTransactionStatusesFromPaytrail).toHaveBeenCalledWith(transactions)
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
