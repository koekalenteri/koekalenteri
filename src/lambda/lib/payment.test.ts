import type { JsonPaymentTransaction, JsonRefundTransaction } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { vi } from 'vitest'
import { jsonEmptyEvent } from '../../__mockData__/emptyEvent'
import { eventWithStaticDatesAnd3Classes } from '../../__mockData__/events'

const mockAudit = vi.fn<() => Promise<void>>()
const mockGetEvent = vi.fn<() => Promise<{ organizer: { id: string } }>>()
const mockGetRegistration =
  vi.fn<
    () => Promise<{
      eventId: string
      id: string
      paymentStatus?: 'PENDING' | 'CANCEL'
      refundStatus?: 'PENDING' | 'CANCEL'
    }>
  >()
const mockPublishRegistrationPatches = vi.fn<() => Promise<unknown>>()
const mockPublishParticipantRegistrationPatch = vi.fn<() => Promise<unknown>>()
const mockRead = vi.fn<() => Promise<JsonPaymentTransaction | JsonRefundTransaction | undefined>>()
const mockUpdate = vi.fn<() => Promise<unknown>>()
const mockDocumentTransaction = vi.fn<CustomDynamoClient['documentTransaction']>()

vi.doMock('./audit', () => ({
  audit: mockAudit,
  registrationAuditKey: (registration: { eventId: string; id: string }) => `${registration.eventId}:${registration.id}`,
}))
vi.doMock('./event', () => ({ getEvent: mockGetEvent }))
vi.doMock('./registration', () => ({ getRegistration: mockGetRegistration }))
vi.doMock('./ws/actions', () => ({
  publishParticipantRegistrationPatch: mockPublishParticipantRegistrationPatch,
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))
vi.doMock('./secrets', () => ({
  getPaytrailConfig: vi.fn(() => Promise.resolve({ PAYTRAIL_SECRET: 'test-secret' })),
}))
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      documentTransaction: mockDocumentTransaction,
      query: vi.fn(),
      read: mockRead,
      update: mockUpdate,
    }
  }),
}))
const {
  cancelTransaction,
  claimTransactionCreation,
  formatPaytrailErrorMessage,
  paymentDescription,
  releaseTransactionCreation,
  verifyParams,
} = await import('./payment')
const { calculateHmac } = await import('./paytrail')

const callbackParams = {
  'checkout-provider': 'paytrail',
  'checkout-reference': 'event-1:registration-1',
  'checkout-transaction-id': 'transaction-1',
}
const params = { ...callbackParams, signature: calculateHmac('test-secret', callbackParams) }

const paymentTransaction: JsonPaymentTransaction = {
  amount: 5000,
  createdAt: '2026-08-16T10:00:00.000Z',
  reference: 'event-1:registration-1',
  stamp: 'stamp-1',
  status: 'pending',
  transactionId: 'transaction-1',
  type: 'payment',
  user: 'Test User',
}

describe('payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDocumentTransaction.mockResolvedValue({ $metadata: {} })
    mockRead.mockResolvedValue(paymentTransaction)
    mockGetRegistration.mockResolvedValue({
      eventId: 'event-1',
      id: 'registration-1',
      paymentStatus: 'PENDING',
    })
    mockUpdate.mockResolvedValue(undefined)
    mockGetEvent.mockResolvedValue({ organizer: { id: 'organizer-1' } })
    mockPublishRegistrationPatches.mockResolvedValue(undefined)
    mockPublishParticipantRegistrationPatch.mockResolvedValue(undefined)
    mockAudit.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('verifyParams', () => {
    it('does not log callback parameters when the transaction id is missing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(verifyParams({ signature: 'supplied-signature' })).rejects.toThrow(
        'Missing checkout-transaction-id from params'
      )

      expect(consoleSpy).toHaveBeenCalledWith('Missing checkout-transaction-id from payment callback')
    })

    it('does not log the supplied signature or calculated HMAC when verification fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(verifyParams({ ...callbackParams, signature: 'supplied-signature' })).rejects.toThrow(
        'Verifying payment signature failed'
      )

      expect(consoleSpy).toHaveBeenCalledWith('Verifying payment signature failed')
    })
  })

  describe('paymentDescription', () => {
    it('works correctly for single day event', () => {
      expect(paymentDescription(jsonEmptyEvent, 'fi')).toEqual('test 1.1. test test')
      expect(paymentDescription({ ...jsonEmptyEvent, name: 'event name' }, 'fi')).toEqual('test 1.1. test event name')
      expect(paymentDescription({ ...jsonEmptyEvent, eventType: 'EVENT TYPE' }, 'fi')).toEqual(
        'EVENT TYPE 1.1. test test'
      )
      expect(paymentDescription({ ...jsonEmptyEvent, location: 'LOCATION' }, 'fi')).toEqual('test 1.1. LOCATION test')
      expect(paymentDescription({ ...jsonEmptyEvent, location: '' }, 'fi')).toEqual('test 1.1. test')
      expect(paymentDescription({ ...jsonEmptyEvent, location: '', name: '' }, 'fi')).toEqual('test 1.1.')
    })

    it('works correctly for two day event', () => {
      expect(paymentDescription(eventWithStaticDatesAnd3Classes, 'fi')).toEqual('NOME-B 10.–11.2. test location test')
    })
  })

  describe('transaction creation claims', () => {
    it.each([
      ['payment', 'paymentCreationAt', 'paymentCreationStamp'],
      ['refund', 'refundCreationAt', 'refundCreationStamp'],
    ] as const)('claims a stale or unclaimed %s creation', async (type, creationAt, creationStamp) => {
      vi.useFakeTimers().setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
      const client = { documentTransaction: mockDocumentTransaction }

      await expect(
        claimTransactionCreation(client, type, 'event-1', 'registration-1', 'stamp-1', 300_000)
      ).resolves.toBe(true)

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: {
            ConditionExpression: `attribute_not_exists(${creationAt}) OR ${creationAt} < :staleBefore`,
            ExpressionAttributeValues: {
              [`:${creationAt}`]: '2026-08-16T12:00:00.000Z',
              ':staleBefore': '2026-08-16T11:55:00.000Z',
              ':stamp': 'stamp-1',
            },
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: expect.any(String),
            UpdateExpression: `SET ${creationAt} = :${creationAt}, ${creationStamp} = :stamp`,
          },
        },
      ])
    })

    it('reports contention and passes through unexpected claim errors', async () => {
      const client = { documentTransaction: mockDocumentTransaction }
      const contention = new Error('claim exists')
      contention.name = 'TransactionCanceledException'
      mockDocumentTransaction.mockRejectedValueOnce(contention)

      await expect(
        claimTransactionCreation(client, 'payment', 'event-1', 'registration-1', 'stamp-1', 300_000)
      ).resolves.toBe(false)

      const failure = new Error('DynamoDB unavailable')
      mockDocumentTransaction.mockRejectedValueOnce(failure)
      await expect(
        claimTransactionCreation(client, 'refund', 'event-1', 'registration-1', 'stamp-1', 300_000)
      ).rejects.toThrow(failure)
    })

    it('releases only the claim owned by the stamp and absorbs release failures', async () => {
      const client = { documentTransaction: mockDocumentTransaction }
      await releaseTransactionCreation(client, 'payment', 'event-1', 'registration-1', 'stamp-1')
      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: expect.objectContaining({
            ConditionExpression: 'paymentCreationStamp = :stamp',
            UpdateExpression: 'REMOVE paymentCreationAt, paymentCreationStamp',
          }),
        },
      ])

      const failure = new Error('claim changed')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockDocumentTransaction.mockRejectedValueOnce(failure)
      await expect(
        releaseTransactionCreation(client, 'refund', 'event-1', 'registration-1', 'stamp-1')
      ).resolves.toBeUndefined()
      expect(consoleSpy).toHaveBeenCalledWith('Failed to release refund creation claim', failure)
    })
  })

  describe('cancelTransaction', () => {
    it('marks the transaction failed, patches a pending registration, and audits', async () => {
      await cancelTransaction<JsonPaymentTransaction>({
        auditMessage: (transaction, provider) => `${provider}: ${transaction.amount}`,
        auditUser: (transaction) => transaction.user ?? 'anonymous',
        params,
        statusField: 'paymentStatus',
        updateProvider: true,
      })

      expect(mockUpdate).toHaveBeenNthCalledWith(
        1,
        { transactionId: 'transaction-1' },
        { remove: ['paymentResponse'], set: { provider: 'paytrail', status: 'fail', statusAt: expect.any(String) } },
        expect.any(String)
      )
      expect(mockUpdate).toHaveBeenNthCalledWith(
        2,
        { eventId: 'event-1', id: 'registration-1' },
        { set: { paymentStatus: 'CANCEL', updatedAt: expect.any(String) } },
        expect.any(String)
      )
      expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
        'event-1',
        [{ eventId: 'event-1', id: 'registration-1', paymentStatus: 'CANCEL', updatedAt: expect.any(String) }],
        'organizer-1'
      )
      expect(mockPublishParticipantRegistrationPatch).toHaveBeenCalledWith('event-1', 'registration-1', {
        eventId: 'event-1',
        id: 'registration-1',
        paymentStatus: 'CANCEL',
        updatedAt: expect.any(String),
      })
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:registration-1',
        message: 'paytrail: 5000',
        user: 'Test User',
      })
    })

    it('does not patch or audit a transaction already marked failed', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      mockRead.mockResolvedValueOnce({
        ...paymentTransaction,
        provider: 'paytrail',
        status: 'fail',
        statusAt: '2026-08-16T10:01:00.000Z',
      })

      await cancelTransaction<JsonPaymentTransaction>({
        auditMessage: () => 'unused',
        auditUser: () => 'unused',
        params,
        statusField: 'paymentStatus',
        updateProvider: true,
      })

      expect(consoleSpy).toHaveBeenCalledWith("Transaction 'transaction-1' already marked as failed")
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('throws a 404 when the transaction does not exist', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await expect(
        cancelTransaction<JsonPaymentTransaction>({
          auditMessage: () => 'unused',
          auditUser: () => 'unused',
          params,
          statusField: 'paymentStatus',
        })
      ).rejects.toMatchObject({ status: 404 })
      expect(mockGetRegistration).not.toHaveBeenCalled()
    })
  })

  it('formats Paytrail errors consistently', () => {
    const error = Object.assign(new Error('400 Invalid request'), {
      error: JSON.stringify({ message: 'Invalid request' }),
      status: 400,
    })
    expect(formatPaytrailErrorMessage('Maksun luonti', error)).toBe(
      'Maksun luonti epäonnistui Paytrailissa (400): Invalid request'
    )
  })
})
