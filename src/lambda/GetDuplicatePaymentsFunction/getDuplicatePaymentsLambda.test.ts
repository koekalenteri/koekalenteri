import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeEvent = vi.fn()
const mockReadEventRegistrations = vi.fn()
const mockReadTransactionsByReference = vi.fn()

vi.doMock('../lib/eventAuth', () => ({ authorizeEvent: mockAuthorizeEvent }))
vi.doMock('../lib/repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
}))
vi.doMock('../lib/repositories/transactionRepository', () => ({
  readTransactionsByReference: mockReadTransactionsByReference,
}))

const { default: getDuplicatePaymentsLambda } = await import('./handler')

const event = constructPartialAPIGwEvent({ body: '', headers: {}, pathParameters: { eventId: 'event1' } })

const row = (id: string, overrides: object = {}) => ({
  createdAt: '2026-08-01T10:00:00.000Z',
  dog: { name: 'Rex', regNo: 'FI1/26', results: [] },
  eventId: 'event1',
  handler: { email: 'handler@example.com', membership: true, name: 'Handler' },
  id,
  internalNotes: 'not for this list',
  payer: { email: 'payer@example.com', name: 'Payer', phone: '040' },
  paymentStatus: 'DUPLICATE',
  state: 'creating',
  ...overrides,
})

const charge = (duplicatePaymentAt: string) => ({ amount: 5000, duplicatePaymentAt, type: 'payment' })

const answer = async () => {
  const result = await getDuplicatePaymentsLambda(event)
  return { body: JSON.parse(result.body), statusCode: result.statusCode }
}

describe('getDuplicatePaymentsLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthorizeEvent.mockResolvedValue({ eventId: 'event1' })
    mockReadTransactionsByReference.mockResolvedValue([charge('2026-08-16T10:00:00.000Z')])
  })

  it('answers what the authorization answers and reads nothing', async () => {
    mockAuthorizeEvent.mockRejectedValueOnce(httpError(403, 'Forbidden'))

    expect((await getDuplicatePaymentsLambda(event)).statusCode).toBe(403)
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it('lists only rows marked as charged twice, each by its own reference', async () => {
    mockReadEventRegistrations.mockResolvedValue([
      row('duplicate'),
      row('paid', { paymentStatus: 'SUCCESS', state: 'ready' }),
      row('abandoned', { paymentStatus: undefined }),
    ])

    const { body, statusCode } = await answer()

    expect(statusCode).toBe(200)
    expect(body.map((entry: { registration: { id: string } }) => entry.registration.id)).toEqual(['duplicate'])
    expect(mockReadTransactionsByReference).toHaveBeenCalledTimes(1)
    expect(mockReadTransactionsByReference).toHaveBeenCalledWith('event1:duplicate')
  })

  it('gives the amount in euros, the latest charge and none of the contact details or notes', async () => {
    mockReadEventRegistrations.mockResolvedValue([row('duplicate')])
    mockReadTransactionsByReference.mockResolvedValue([
      charge('2026-08-16T10:00:00.000Z'),
      charge('2026-08-17T10:00:00.000Z'),
    ])

    const { body } = await answer()

    expect(body).toEqual([
      {
        amount: 100,
        duplicatePaymentAt: '2026-08-17T10:00:00.000Z',
        registration: {
          createdAt: '2026-08-01T10:00:00.000Z',
          dog: { name: 'Rex', regNo: 'FI1/26' },
          eventId: 'event1',
          handler: { membership: true },
          id: 'duplicate',
          payer: { name: 'Payer' },
          paymentStatus: 'DUPLICATE',
        },
      },
    ])
  })

  it('leaves out a row whose money went back, and keeps one whose refund is on its way', async () => {
    mockReadEventRegistrations.mockResolvedValue([
      row('returned', { refundAmount: 45, refundHandlingCost: 5 }),
      row('pending', { openRefunds: ['r2'] }),
    ])
    mockReadTransactionsByReference.mockImplementation(async (reference: string) =>
      reference.endsWith('returned')
        ? [
            charge('2026-08-16T10:00:00.000Z'),
            { amount: 4500, handlingCost: 500, registrationAppliedAt: '2026-08-17T10:00:00.000Z', type: 'refund' },
          ]
        : [charge('2026-08-16T10:00:00.000Z'), { amount: 5000, status: 'pending', type: 'refund' }]
    )

    const { body } = await answer()

    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ amount: 50, registration: { id: 'pending', openRefunds: ['r2'] } })
  })

  it('lists a second charge after the first went back', async () => {
    mockReadEventRegistrations.mockResolvedValue([row('again', { refundAmount: 50 })])
    mockReadTransactionsByReference.mockResolvedValue([
      charge('2026-08-16T10:00:00.000Z'),
      { amount: 5000, registrationAppliedAt: '2026-08-17T10:00:00.000Z', type: 'refund' },
      charge('2026-08-18T10:00:00.000Z'),
    ])

    const { body } = await answer()

    expect(body).toEqual([expect.objectContaining({ amount: 50, duplicatePaymentAt: '2026-08-18T10:00:00.000Z' })])
  })

  it('answers an empty list for an event with none, or a row whose transactions read as nothing', async () => {
    mockReadEventRegistrations.mockResolvedValueOnce([])
    expect((await answer()).body).toEqual([])

    mockReadEventRegistrations.mockResolvedValueOnce([row('unread')])
    mockReadTransactionsByReference.mockResolvedValueOnce(undefined)
    expect((await answer()).body).toEqual([])
  })
})
