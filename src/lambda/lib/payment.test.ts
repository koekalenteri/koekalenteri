import type {
  JsonConfirmedEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  JsonRegistration,
  JsonTransaction,
} from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { vi } from 'vitest'
import { jsonEmptyEvent } from '../../__mockData__/emptyEvent'
import { eventWithALOClassInvited, eventWithStaticDatesAnd3Classes } from '../../__mockData__/events'
import { jsonRegistrationsToEventWithALOInvited } from '../../__mockData__/registrations'
import { loggedLines } from '../test-utils/logs'

const mockAudit = vi.fn<() => Promise<void>>()
const mockGetEvent = vi.fn<() => Promise<Partial<JsonConfirmedEvent>>>()
const mockGetRegistration = vi.fn<() => Promise<Partial<JsonRegistration>>>()
const mockRead = vi.fn<() => Promise<JsonPaymentTransaction | JsonRefundTransaction | JsonRegistration | undefined>>()
const mockUpdate = vi.fn<(...args: unknown[]) => Promise<{ Attributes?: Record<string, unknown> }>>()
const mockDocumentTransaction = vi.fn<CustomDynamoClient['documentTransaction']>()
const mockQuery = vi.fn<() => Promise<Partial<JsonPaymentTransaction | JsonRefundTransaction>[] | undefined>>()
const mockBatchGet = vi.fn<() => Promise<Partial<JsonPaymentTransaction>[]>>()

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
      batchGet: mockBatchGet,
      documentTransaction: mockDocumentTransaction,
      query: mockQuery,
      read: mockRead,
      update: mockUpdate,
    }
  }),
}))
const {
  claimTransactionCreation,
  computePaymentInProgress,
  dropOpenTransaction,
  failUnfinishedTransaction,
  isTransactionSettled,
  participantPaymentPatch,
  participantResponse,
  paymentDescription,
  refundPaytrailErrorAudit,
  releaseTransactionCreation,
  resolveCallbackTransaction,
  settleFailedTransaction,
  updateTransactionStatus,
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
    mockUpdate.mockResolvedValue({})
    mockBatchGet.mockResolvedValue([])
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

  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString()

  describe('isTransactionSettled', () => {
    it.each<[string, Partial<JsonTransaction>, boolean]>([
      ['already applied', { registrationAppliedAt: '2026-08-16T10:00:00.000Z', status: 'ok' }, true],
      ['already a duplicate', { duplicatePaymentAt: '2026-08-16T10:00:00.000Z', status: 'ok' }, true],
      ['already failed', { status: 'fail' }, true],
      // Paytrail's own `ok` is not enough on its own: an email refund answers `ok` while still
      // pending the customer's bank account (KOE-1529).
      ["Paytrail's ok, nothing applied yet", { status: 'ok' }, false],
      ['still pending', { status: 'pending' }, false],
    ])('%s: %s', (_name, partial, expected) => {
      expect(isTransactionSettled({ status: 'new', ...partial })).toBe(expected)
    })
  })

  describe('resolveCallbackTransaction', () => {
    it('reads the transaction the callback names and the registration it belongs to', async () => {
      const resolved = await resolveCallbackTransaction<JsonPaymentTransaction>(params)

      expect(resolved).toMatchObject({
        eventId: 'event-1',
        provider: 'paytrail',
        registration: expect.objectContaining({ id: 'registration-1' }),
        registrationId: 'registration-1',
        transaction: paymentTransaction,
      })
    })

    it('throws a 404 when the transaction does not exist, without reading the registration', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await expect(resolveCallbackTransaction<JsonPaymentTransaction>(params)).rejects.toMatchObject({ status: 404 })
      expect(mockGetRegistration).not.toHaveBeenCalled()
    })
  })

  describe('failUnfinishedTransaction', () => {
    it('writes fail, conditional on the transaction being unresolved', async () => {
      await expect(failUnfinishedTransaction(paymentTransaction, 'paytrail')).resolves.toBe(true)

      expect(mockUpdate).toHaveBeenCalledWith(
        { transactionId: 'transaction-1' },
        { remove: ['paymentResponse'], set: { provider: 'paytrail', status: 'fail', statusAt: expect.any(String) } },
        expect.any(String),
        undefined,
        {
          expression:
            'attribute_not_exists(registrationAppliedAt) AND attribute_not_exists(duplicatePaymentAt) AND #status <> :fail',
          names: { '#status': 'status' },
          values: { ':fail': 'fail' },
        }
      )
    })

    it('omits the provider clause when none is given', async () => {
      await failUnfinishedTransaction(paymentTransaction)

      expect(mockUpdate).toHaveBeenCalledWith(
        { transactionId: 'transaction-1' },
        { remove: ['paymentResponse'], set: { status: 'fail', statusAt: expect.any(String) } },
        expect.any(String),
        undefined,
        expect.anything()
      )
    })

    it('returns false, without throwing, when another call already settled it first', async () => {
      const conflict = new Error('conditional check failed')
      conflict.name = 'ConditionalCheckFailedException'
      mockUpdate.mockRejectedValueOnce(conflict)

      await expect(failUnfinishedTransaction(paymentTransaction)).resolves.toBe(false)
    })

    it('does not swallow an unrelated error', async () => {
      const failure = new Error('throttled')
      mockUpdate.mockRejectedValueOnce(failure)

      await expect(failUnfinishedTransaction(paymentTransaction)).rejects.toThrow(failure)
    })
  })

  describe('dropOpenTransaction', () => {
    const registration = { eventId: 'event-1', id: 'registration-1' }

    it('removes only the given id, unconditionally, bumps updatedAt, and reports it was open', async () => {
      mockUpdate.mockResolvedValueOnce({ Attributes: { openPayments: ['transaction-1', 'transaction-2'] } })

      await expect(dropOpenTransaction(registration, 'openPayments', 'transaction-1')).resolves.toBe(true)

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'event-1', id: 'registration-1' },
        { delete: { openPayments: new Set(['transaction-1']) }, set: { updatedAt: expect.any(String) } },
        expect.any(String),
        'UPDATED_OLD'
      )
    })

    // The secretary's incremental refresh filters on updatedAt; a row whose only open attempt just
    // failed must not look unchanged after a websocket gap (KOE-1529).
    it('shares the given timestamp as updatedAt when one is passed in', async () => {
      mockUpdate.mockResolvedValueOnce({ Attributes: { openPayments: ['transaction-1'] } })

      await dropOpenTransaction(registration, 'openPayments', 'transaction-1', '2026-10-13T12:00:00.000Z')

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'event-1', id: 'registration-1' },
        { delete: { openPayments: new Set(['transaction-1']) }, set: { updatedAt: '2026-10-13T12:00:00.000Z' } },
        expect.any(String),
        'UPDATED_OLD'
      )
    })

    it('reports no change when the id was not a member -- a different, newer transaction is untouched', async () => {
      mockUpdate.mockResolvedValueOnce({ Attributes: { openPayments: ['transaction-2'] } })

      await expect(dropOpenTransaction(registration, 'openPayments', 'transaction-1')).resolves.toBe(false)
    })

    it('reports no change when nothing was ever open', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await expect(dropOpenTransaction(registration, 'openPayments', 'transaction-1')).resolves.toBe(false)
    })
  })

  describe('updateTransactionStatus', () => {
    it('writes the new status, conditional on the transaction being unresolved', async () => {
      await updateTransactionStatus(paymentTransaction, 'pending')

      expect(mockUpdate).toHaveBeenCalledWith(
        { transactionId: 'transaction-1' },
        { remove: ['paymentResponse'], set: { status: 'pending', statusAt: expect.any(String) } },
        expect.any(String),
        undefined,
        expect.objectContaining({
          expression:
            'attribute_not_exists(registrationAppliedAt) AND attribute_not_exists(duplicatePaymentAt) AND #status <> :fail',
        })
      )
    })

    it('does not write over an already settled transaction (rule 3)', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      const conflict = new Error('conditional check failed')
      conflict.name = 'ConditionalCheckFailedException'
      mockUpdate.mockRejectedValueOnce(conflict)

      await expect(updateTransactionStatus(paymentTransaction, 'pending')).resolves.toBe(false)
      expect(loggedLines(consoleSpy)).toContainEqual(
        expect.objectContaining({ message: 'transaction already settled, ignoring status update' })
      )
    })
  })

  describe('computePaymentInProgress', () => {
    it('is false with no open ids, without calling batchGet', async () => {
      await expect(computePaymentInProgress(undefined)).resolves.toBe(false)
      await expect(computePaymentInProgress([])).resolves.toBe(false)
      expect(mockBatchGet).not.toHaveBeenCalled()
    })

    it('is true when one of several open ids is a fresh pending payment', async () => {
      mockBatchGet.mockResolvedValueOnce([
        { createdAt: minutesAgo(10), status: 'fail', type: 'payment' },
        { createdAt: minutesAgo(1), status: 'pending', type: 'payment' },
      ])

      await expect(computePaymentInProgress(['t1', 't2'])).resolves.toBe(true)
      expect(mockBatchGet).toHaveBeenCalledWith([{ transactionId: 't1' }, { transactionId: 't2' }], expect.any(String))
    })

    it('is false once the only open id is stale', async () => {
      mockBatchGet.mockResolvedValueOnce([{ createdAt: minutesAgo(10), status: 'pending', type: 'payment' }])

      await expect(computePaymentInProgress(['t1'])).resolves.toBe(false)
    })
  })

  // The two ways a participant's answer leaves the server compute paymentInProgress the same way,
  // and never send the open ids themselves (KOE-1529).
  describe('the participant answers built from open payments', () => {
    const withOpenPayment: JsonRegistration = {
      ...JSON.parse(JSON.stringify(jsonRegistrationsToEventWithALOInvited[0])),
      openPayments: ['transaction-1'],
      paidAmount: undefined,
    }
    const event: JsonConfirmedEvent = JSON.parse(
      JSON.stringify({ ...eventWithALOClassInvited, cost: 50, costMember: 50, paymentTime: 'registration' })
    )

    it('participantResponse offers to pay once the open payment is stale, never sending the id', async () => {
      mockBatchGet.mockResolvedValueOnce([{ createdAt: minutesAgo(10), status: 'pending', type: 'payment' }])

      const result = await participantResponse(withOpenPayment, 'raw-token', event)

      expect(result).toMatchObject({ paymentInProgress: false, shouldPay: true })
      expect(result).not.toHaveProperty('openPayments')
      expect(result).not.toHaveProperty('openRefunds')
    })

    it('participantResponse holds the pay offer back while the open payment is fresh', async () => {
      mockBatchGet.mockResolvedValueOnce([{ createdAt: minutesAgo(1), status: 'pending', type: 'payment' }])

      await expect(participantResponse(withOpenPayment, 'raw-token', event)).resolves.toMatchObject({
        paymentInProgress: true,
        shouldPay: false,
      })
    })

    it('participantPaymentPatch computes paymentInProgress the same way', async () => {
      mockBatchGet.mockResolvedValueOnce([{ createdAt: minutesAgo(10), status: 'pending', type: 'payment' }])

      await expect(participantPaymentPatch(withOpenPayment, event)).resolves.toMatchObject({
        paymentInProgress: false,
        shouldPay: true,
      })
    })

    it('reads no open payments as not in progress, without calling batchGet', async () => {
      const registration: JsonRegistration = JSON.parse(JSON.stringify(jsonRegistrationsToEventWithALOInvited[0]))

      await expect(participantResponse(registration, 'raw-token', event)).resolves.toMatchObject({
        paymentInProgress: false,
      })
      expect(mockBatchGet).not.toHaveBeenCalled()
    })
  })

  // The one step every writer that can fail a payment or refund settles through (KOE-1529).
  describe('settleFailedTransaction', () => {
    const registration: JsonRegistration = {
      ...JSON.parse(JSON.stringify(jsonRegistrationsToEventWithALOInvited[0])),
      eventId: 'event-1',
      id: 'registration-1',
      openPayments: ['transaction-1'],
    }
    const auditOptions = {
      auditActor: (transaction: JsonTransaction) => ({ name: transaction.user ?? 'anonymous' }),
      auditMessage: (transaction: JsonTransaction, provider: string | undefined) => ({
        message: `${provider}: ${transaction.amount}`,
        messageKey: 'audit.messages.paymentFailed',
        messageParams: { amount: transaction.amount, provider: provider ?? '' },
      }),
      provider: 'paytrail',
    }

    it('fails the transaction, drops it from the open set, audits once, and builds a fresh patch', async () => {
      mockUpdate.mockResolvedValueOnce({}) // failUnfinishedTransaction
      mockUpdate.mockResolvedValueOnce({ Attributes: { openPayments: ['transaction-1'] } }) // dropOpenTransaction
      mockRead.mockResolvedValueOnce({ ...registration, openPayments: [] }) // the strongly consistent re-read

      const settled = await settleFailedTransaction(paymentTransaction, registration, 'openPayments', auditOptions)

      expect(settled.moved).toBe(true)
      expect(settled.changed).toBe(true)
      expect(mockRead).toHaveBeenCalledWith(
        { eventId: 'event-1', id: 'registration-1' },
        expect.any(String),
        true // strongly consistent (correction #2)
      )
      // The transaction's statusAt and the registration's updatedAt are the same moment: the
      // secretary's incremental refresh reads updatedAt, and must see this as of when it happened,
      // not some other time (KOE-1529, round 1 part 2).
      const failWrite = mockUpdate.mock.calls[0]?.[1] as { set: { statusAt: string } }
      const dropWrite = mockUpdate.mock.calls[1]?.[1] as { set: { updatedAt: string } }
      expect(failWrite.set.statusAt).toEqual(dropWrite.set.updatedAt)
      expect(mockAudit).toHaveBeenCalledTimes(1)
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:registration-1',
        message: 'paytrail: 5000',
        messageKey: 'audit.messages.paymentFailed',
        messageParams: { amount: 5000, provider: 'paytrail' },
        user: 'Test User',
      })
      // What the caller broadcasts; sending it is the handler's job (KOE-1340).
      expect(settled.cancelled).toMatchObject({
        eventId: 'event-1',
        organizerId: 'organizer-1',
        participantPatch: expect.objectContaining({ paymentInProgress: false, shouldPay: true }),
        patch: { eventId: 'event-1', id: 'registration-1', openPayments: [] },
        registrationId: 'registration-1',
      })
    })

    it('still drops and publishes a retry that finds the transaction already failed (rule 6, C12)', async () => {
      const conflict = new Error('conditional check failed')
      conflict.name = 'ConditionalCheckFailedException'
      mockUpdate.mockRejectedValueOnce(conflict) // failUnfinishedTransaction: already fail
      mockUpdate.mockResolvedValueOnce({ Attributes: { openPayments: ['transaction-1'] } }) // still open
      mockRead.mockResolvedValueOnce({ ...registration, openPayments: [] })

      const settled = await settleFailedTransaction(paymentTransaction, registration, 'openPayments', auditOptions)

      expect(settled.moved).toBe(false)
      expect(settled.changed).toBe(true)
      expect(settled.cancelled).toBeDefined()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('does not publish when the id was already gone (a second, racing writer)', async () => {
      mockUpdate.mockResolvedValueOnce({}) // failUnfinishedTransaction (lost the race, but still tries)
      mockUpdate.mockResolvedValueOnce({ Attributes: { openPayments: [] } }) // already removed

      const settled = await settleFailedTransaction(paymentTransaction, registration, 'openPayments', auditOptions)

      expect(settled.changed).toBe(false)
      expect(settled.cancelled).toBeUndefined()
      expect(mockRead).not.toHaveBeenCalled()
    })

    it('reads the registration fresh, not the row it started with, so a racing recordDuplicatePayment wins', async () => {
      // KOE-1529 correction: recordDuplicatePayment writes the transaction (duplicatePaymentAt) and the
      // registration (paymentStatus: DUPLICATE) as two separate updates. A settle call racing into that
      // gap sees the transaction already resolved (moved: false) but can still find the id open
      // (changed: true) if it beats the registration write. The published patch must say DUPLICATE, not
      // the stale row this call started with.
      const conflict = new Error('conditional check failed')
      conflict.name = 'ConditionalCheckFailedException'
      mockUpdate.mockRejectedValueOnce(conflict)
      mockUpdate.mockResolvedValueOnce({ Attributes: { openPayments: ['transaction-1'] } })
      mockRead.mockResolvedValueOnce({
        ...registration,
        openPayments: [],
        paymentStatus: 'DUPLICATE',
      })

      const settled = await settleFailedTransaction(paymentTransaction, registration, 'openPayments', auditOptions)

      expect(settled.cancelled?.participantPatch).toMatchObject({ paymentStatus: 'DUPLICATE' })
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
