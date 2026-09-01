import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeWithMemberOf = vi.fn()
const mockGetParam = vi.fn()
const mockGetEvent = vi.fn()
const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockGetTransactionsByReference = vi.fn()
const mockRefreshTransactionStatusesFromPaytrail = vi.fn()

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

vi.doMock('../lib/lambda', () => ({
  getParam: mockGetParam,
  LambdaError: class LambdaError extends Error {
    constructor(
      public statusCode: number,
      message: string
    ) {
      super(message)
    }
  },
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../lib/payment', () => ({
  getTransactionsByReference: mockGetTransactionsByReference,
  refreshTransactionStatusesFromPaytrail: mockRefreshTransactionStatusesFromPaytrail,
}))

const { default: getRegistrationTransactionsLambda } = await import('./handler')

describe('getRegistrationTransactionsLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    pathParameters: { eventId: 'event123', id: 'reg456' },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthorizeWithMemberOf.mockResolvedValue({
      memberOf: ['org1'],
      user: { id: 'user1', name: 'Test User' },
    })
    mockGetEvent.mockResolvedValue({ organizer: { id: 'org1' } })
    mockRefreshTransactionStatusesFromPaytrail.mockImplementation((transactions: unknown) =>
      Promise.resolve(transactions)
    )
  })

  it('returns 401 if not authorized', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ res: { body: 'Unauthorized', statusCode: 401 } })

    await getRegistrationTransactionsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).not.toHaveBeenCalled()
    expect(mockGetTransactionsByReference).not.toHaveBeenCalled()
    expect(mockRefreshTransactionStatusesFromPaytrail).not.toHaveBeenCalled()
  })

  it('rejects users outside the event organizer before reading transactions', async () => {
    mockGetParam.mockReturnValueOnce('event123')
    mockGetEvent.mockResolvedValueOnce({ organizer: { id: 'org2' } })

    await expect(getRegistrationTransactionsLambda(event)).rejects.toMatchObject({
      message: 'Forbidden',
      statusCode: 403,
    })

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

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
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

    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockResolvedValueOnce(emptyTransactions)

    await getRegistrationTransactionsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
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

    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockResolvedValueOnce(undefined)

    await getRegistrationTransactionsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
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

    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockResolvedValueOnce(emptyTransactions)

    await getRegistrationTransactionsLambda(event)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
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

    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockRejectedValueOnce(error)

    await expect(getRegistrationTransactionsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
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

    mockGetParam.mockReturnValueOnce(eventId).mockReturnValueOnce(regId)
    mockGetTransactionsByReference.mockResolvedValueOnce(transactions)
    mockRefreshTransactionStatusesFromPaytrail.mockRejectedValueOnce(error)

    await expect(getRegistrationTransactionsLambda(event)).rejects.toThrow(error)

    expect(mockAuthorizeWithMemberOf).toHaveBeenCalledWith(event)
    expect(mockGetParam).toHaveBeenCalledWith(event, 'eventId')
    expect(mockGetParam).toHaveBeenCalledWith(event, 'id')
    expect(mockGetTransactionsByReference).toHaveBeenCalledWith(reference)
    expect(mockRefreshTransactionStatusesFromPaytrail).toHaveBeenCalledWith(transactions)
    expect(mockResponse).not.toHaveBeenCalled()
  })
})
