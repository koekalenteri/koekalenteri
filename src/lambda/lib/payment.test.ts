import type { JsonConfirmedEvent, JsonPaymentTransaction, JsonRefundTransaction, JsonRegistration } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { vi } from 'vitest'
import { jsonEmptyEvent } from '../../__mockData__/emptyEvent'
import { eventWithALOClassInvited, eventWithStaticDatesAnd3Classes } from '../../__mockData__/events'
import { jsonRegistrationsToEventWithALOInvited } from '../../__mockData__/registrations'
import { loggedLines } from '../test-utils/logs'

const mockAudit = vi.fn<() => Promise<void>>()
const mockGetEvent = vi.fn<() => Promise<Partial<JsonConfirmedEvent>>>()
const mockGetRegistration = vi.fn<() => Promise<Partial<JsonRegistration>>>()
const mockRead = vi.fn<() => Promise<JsonPaymentTransaction | JsonRefundTransaction | undefined>>()
const mockUpdate = vi.fn<() => Promise<unknown>>()
const mockDocumentTransaction = vi.fn<CustomDynamoClient['documentTransaction']>()
const mockQuery = vi.fn<() => Promise<Partial<JsonPaymentTransaction | JsonRefundTransaction>[] | undefined>>()

vi.doMock('./audit', () => ({
  audit: mockAudit,
  registrationAuditKey: (registration: { eventId: string; id: string }) => `${registration.eventId}:${registration.id}`,
}))
vi.doMock('./event', () => ({ getEvent: mockGetEvent }))
vi.doMock('./registration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./registration')>()),
  getRegistration: mockGetRegistration,
}))
vi.doMock('./secrets', () => ({
  getPaytrailConfig: vi.fn(() => Promise.resolve({ PAYTRAIL_SECRET: 'test-secret' })),
}))
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      documentTransaction: mockDocumentTransaction,
      query: mockQuery,
      read: mockRead,
      update: mockUpdate,
    }
  }),
}))
const {
  cancelRegistrationStatus,
  cancelTransaction,
  claimTransactionCreation,
  getParticipantRow,
  participantPaymentPatch,
  participantResponse,
  paymentDescription,
  refundPaytrailErrorAudit,
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
      createdAt: '2026-07-25T10:00:00.000Z',
      dog: { name: 'Test Dog', regNo: 'TEST-1' },
      eventId: 'event-1',
      id: 'registration-1',
      owner: { email: 'owner@example.com', membership: false, name: 'Owner' },
      ownerHandles: true,
      paymentStatus: 'PENDING',
    })
    mockUpdate.mockResolvedValue(undefined)
    mockGetEvent.mockResolvedValue({
      cost: 50,
      entryStartDate: '2026-07-01T00:00:00.000Z',
      organizer: { id: 'organizer-1', name: 'Organizer' },
      paymentTime: 'registration',
      state: 'confirmed',
    })
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

      expect(loggedLines(consoleSpy)).toEqual([
        { level: 'error', message: 'missing checkout-transaction-id from payment callback' },
      ])
    })

    it('does not log the supplied signature or calculated HMAC when verification fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(verifyParams({ ...callbackParams, signature: 'supplied-signature' })).rejects.toThrow(
        'Verifying payment signature failed'
      )

      expect(loggedLines(consoleSpy)).toEqual([{ level: 'error', message: 'verifying payment signature failed' }])
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

    it('uses the translated event name for the language when given', () => {
      // KOE-1263
      const event = { ...jsonEmptyEvent, name: 'Nimi', names: { en: 'Name' } }

      expect(paymentDescription(event, 'en')).toEqual('test 1.1. test Name')
      expect(paymentDescription(event, 'fi')).toEqual('test 1.1. test Nimi')
      expect(paymentDescription({ ...event, names: undefined }, 'en')).toEqual('test 1.1. test Nimi')
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
      expect(loggedLines(consoleSpy)).toContainEqual(
        expect.objectContaining({
          error: expect.objectContaining({ message: 'claim changed' }),
          message: 'failed to release creation claim',
          registrationId: 'registration-1',
          type: 'refund',
        })
      )
    })
  })

  // KOE-1526 review: a stored PENDING holds the pay offer only while a payment Paytrail is working on
  // is fresh, the rule PaymentCreate answers 409 for.
  describe('getParticipantRow', () => {
    const pending = { eventId: 'event-1', id: 'registration-1', paymentStatus: 'PENDING' as const }
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString()

    it.each<[string, Partial<JsonPaymentTransaction | JsonRefundTransaction>[] | undefined, string]>([
      ['a fresh pending payment', [{ createdAt: minutesAgo(1), status: 'pending', type: 'payment' }], 'PENDING'],
      ['a stale pending payment', [{ createdAt: minutesAgo(10), status: 'pending', type: 'payment' }], 'NEW'],
      ['a payment left new at Paytrail', [{ createdAt: minutesAgo(1), status: 'new', type: 'payment' }], 'NEW'],
      ['a fresh pending refund', [{ createdAt: minutesAgo(1), status: 'pending', type: 'refund' }], 'NEW'],
      ['no transactions', undefined, 'NEW'],
    ])('reads a stored PENDING with %s as %s', async (_name, transactions, expected) => {
      mockQuery.mockResolvedValueOnce(transactions)

      await expect(getParticipantRow(pending)).resolves.toEqual({ ...pending, paymentStatus: expected })
    })

    // The two ways a participant's answer leaves the server read the row the same way.
    describe('the participant answers built from a stored row', () => {
      const stalePending: JsonRegistration = {
        ...JSON.parse(JSON.stringify(jsonRegistrationsToEventWithALOInvited[0])),
        paidAmount: undefined,
        paymentStatus: 'PENDING',
      }
      const event: JsonConfirmedEvent = JSON.parse(
        JSON.stringify({ ...eventWithALOClassInvited, cost: 50, costMember: 50, paymentTime: 'registration' })
      )
      beforeEach(() => {
        mockQuery.mockResolvedValueOnce([{ createdAt: minutesAgo(10), status: 'pending', type: 'payment' }])
      })

      it('participantResponse answers a stale PENDING as NEW, payable', async () => {
        await expect(participantResponse(stalePending, 'raw-token', event)).resolves.toMatchObject({
          paymentStatus: 'NEW',
          shouldPay: true,
        })
      })

      it('participantPaymentPatch patches a stale PENDING as NEW, payable', async () => {
        await expect(participantPaymentPatch(stalePending, event)).resolves.toMatchObject({
          paymentStatus: 'NEW',
          shouldPay: true,
        })
      })
    })

    it('leaves any other status as it is, without reading the transactions', async () => {
      const paid = { ...pending, paymentStatus: 'SUCCESS' as const }
      await expect(getParticipantRow(paid)).resolves.toBe(paid)
      expect(mockQuery).not.toHaveBeenCalled()
    })
  })

  // The one cancel PaymentVerify and the provider's callback share (KOE-1526).
  describe('cancelRegistrationStatus', () => {
    it('writes a cancelled refund and answers both patches', async () => {
      const registration: JsonRegistration = {
        ...JSON.parse(JSON.stringify(jsonRegistrationsToEventWithALOInvited[0])),
        refundStatus: 'PENDING',
      }

      const cancelled = await cancelRegistrationStatus(registration, 'refundStatus')

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: registration.eventId, id: registration.id },
        { set: { refundStatus: 'CANCEL', updatedAt: expect.any(String) } },
        expect.any(String)
      )
      expect(cancelled).toMatchObject({
        organizerId: 'organizer-1',
        participantPatch: { id: registration.id, refundStatus: 'CANCEL' },
        patch: { eventId: registration.eventId, id: registration.id, refundStatus: 'CANCEL' },
        registrationId: registration.id,
      })
    })
  })

  describe('cancelTransaction', () => {
    it('marks the transaction failed, patches a pending registration, and audits', async () => {
      const cancelled = await cancelTransaction<JsonPaymentTransaction>({
        auditActor: (transaction) => ({ name: transaction.user ?? 'anonymous' }),
        auditMessage: (transaction, provider) => ({
          message: `${provider}: ${transaction.amount}`,
          messageKey: 'audit.messages.paymentFailed',
          messageParams: { amount: transaction.amount, provider: provider ?? '' },
        }),
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
      // What the caller broadcasts; sending it is the handler's job (KOE-1340).
      expect(cancelled).toEqual({
        eventId: 'event-1',
        organizerId: 'organizer-1',
        // The participant's page reads the pay offer from its patch, as from GetRegistration: a
        // cancelled payment leaves the fee to pay (KOE-1526).
        participantPatch: expect.objectContaining({
          eventId: 'event-1',
          id: 'registration-1',
          paymentDue: 50,
          paymentStatus: 'CANCEL',
          shouldPay: true,
        }),
        patch: { eventId: 'event-1', id: 'registration-1', paymentStatus: 'CANCEL', updatedAt: expect.any(String) },
        registrationId: 'registration-1',
      })
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:registration-1',
        message: 'paytrail: 5000',
        messageKey: 'audit.messages.paymentFailed',
        messageParams: { amount: 5000, provider: 'paytrail' },
        user: 'Test User',
      })
    })

    it('does not patch or audit a transaction already marked failed', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      mockRead.mockResolvedValueOnce({
        ...paymentTransaction,
        provider: 'paytrail',
        status: 'fail',
        statusAt: '2026-08-16T10:01:00.000Z',
      })

      await cancelTransaction<JsonPaymentTransaction>({
        auditActor: () => ({ name: 'unused' }),
        auditMessage: () => ({ messageKey: 'unused' }),
        params,
        statusField: 'paymentStatus',
        updateProvider: true,
      })

      expect(loggedLines(consoleSpy)).toContainEqual(
        expect.objectContaining({ message: 'transaction already marked as failed', transactionId: 'transaction-1' })
      )
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('throws a 404 when the transaction does not exist', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await expect(
        cancelTransaction<JsonPaymentTransaction>({
          auditActor: () => ({ name: 'unused' }),
          auditMessage: () => ({ messageKey: 'unused' }),
          params,
          statusField: 'paymentStatus',
        })
      ).rejects.toMatchObject({ status: 404 })
      expect(mockGetRegistration).not.toHaveBeenCalled()
    })
  })

  it('audits a refusal answered in plain text as that text', () => {
    const error = Object.assign(new Error('503 Service Unavailable'), { error: 'Service Unavailable', status: 503 })
    expect(refundPaytrailErrorAudit(error)).toEqual({
      messageKey: 'audit.messages.refundPaytrailFailed',
      messageParams: { error: 'Service Unavailable', status: 503 },
    })
  })

  it('audits a refused refund with Paytrail status and message as parameters, and no Finnish text (KOE-1511)', () => {
    const error = Object.assign(new Error('400 Revert failed'), {
      error: JSON.stringify({ message: 'Revert failed' }),
      status: 400,
    })
    expect(refundPaytrailErrorAudit(error)).toEqual({
      messageKey: 'audit.messages.refundPaytrailFailed',
      messageParams: { error: 'Revert failed', status: 400 },
    })
  })

  it('names a refusal Paytrail gave no words for by a key', () => {
    const error = Object.assign(new Error('500 undefined'), { error: undefined, status: 500 })
    expect(refundPaytrailErrorAudit(error)).toEqual({
      messageKey: 'audit.messages.refundPaytrailFailed',
      messageParams: { errorKey: 'audit.unknownError', status: 500 },
    })
  })
})
