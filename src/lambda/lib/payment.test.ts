import type {
  JsonConfirmedEvent,
  JsonPaymentTransaction,
  JsonRefundTransaction,
  JsonRegistration,
  JsonTransaction,
} from '../../types'
import type { WebSocketConnection } from './ws/types'
import { vi } from 'vitest'
import { jsonEmptyEvent } from '../../__mockData__/emptyEvent'
import { eventWithALOClassInvited, eventWithStaticDatesAnd3Classes } from '../../__mockData__/events'
import { jsonRegistrationsToEventWithALOInvited } from '../../__mockData__/registrations'
import { everyEntrantWatching } from '../test-utils/entrantPages'
import { loggedLines } from '../test-utils/logs'

const mockAudit = vi.fn<() => Promise<void>>()
const mockGetEvent = vi.fn<() => Promise<Partial<JsonConfirmedEvent>>>()
const mockGetRegistration = vi.fn<() => Promise<Partial<JsonRegistration>>>()
const mockReadTransaction = vi.fn<() => Promise<JsonPaymentTransaction | JsonRefundTransaction | undefined>>()
const mockReadRegistrationConsistently = vi.fn<() => Promise<JsonRegistration | undefined>>()
const mockFailUnfinishedTransaction = vi.fn<() => Promise<boolean>>()
const mockUpdateUnresolvedTransaction = vi.fn<() => Promise<boolean>>()
const mockDropOpenTransactionId = vi.fn<() => Promise<string[] | undefined>>()
const mockReadPaymentTransactions = vi.fn<() => Promise<Partial<JsonPaymentTransaction>[]>>()

vi.doMock('./audit', () => ({
  audit: mockAudit,
  registrationAuditKey: (registration: { eventId: string; id: string }) => `${registration.eventId}:${registration.id}`,
}))
vi.doMock('./event', () => ({ getEvent: mockGetEvent }))
// The real publishers run, their failure handling included; the boundaries are the connection scans
// and the broadcast. Every entrant named has the page open (KOE-1553), and the organizer has one
// admin page open. Each payload sent reaches `mockToEntrant` or `mockToAdmins` by its scope.
const mockToEntrant = vi.fn()
const mockToAdmins = vi.fn()
const mockOrganizerAudience = vi.fn<() => Promise<WebSocketConnection[]>>()
interface SentPayload {
  eventId: string
  patch: unknown
  registrationId?: string
  scope: string
}
vi.doMock('./ws/connectionSelectors', () => ({
  organizerAudience: mockOrganizerAudience,
  registrationsAudience: everyEntrantWatching,
}))
vi.doMock('./ws/broadcast', () => ({
  broadcast: async ({
    audience,
    buildPayload,
  }: {
    audience: () => Promise<WebSocketConnection[]>
    buildPayload: (audience: WebSocketConnection[], recipient: WebSocketConnection) => SentPayload
  }) => {
    const recipients = await audience()
    for (const recipient of recipients) {
      const { eventId, patch, registrationId, scope } = buildPayload(recipients, recipient)
      if (scope === 'participant:registration-patch') mockToEntrant(eventId, registrationId, patch)
      else mockToAdmins(eventId, patch)
    }
    return { attempted: recipients.length, failed: 0, gone: 0, sent: recipients.length }
  },
}))
vi.doMock('./registration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./registration')>()),
  getRegistration: mockGetRegistration,
}))
vi.doMock('./secrets', () => ({
  getPaytrailConfig: vi.fn(() => Promise.resolve({ PAYTRAIL_SECRET: 'test-secret' })),
}))
vi.doMock('./repositories/transactionRepository', () => ({
  failUnfinishedTransaction: mockFailUnfinishedTransaction,
  readPaymentTransactions: mockReadPaymentTransactions,
  readTransaction: mockReadTransaction,
  updateUnresolvedTransaction: mockUpdateUnresolvedTransaction,
}))
vi.doMock('./repositories/registrationRepository', () => ({
  dropOpenTransactionId: mockDropOpenTransactionId,
  readRegistrationConsistently: mockReadRegistrationConsistently,
}))
const {
  dropOpenTransaction,
  isTransactionSettled,
  loadOpenPayments,
  participantPaymentPatch,
  participantResponse,
  paymentDescription,
  publishCancelledRegistration,
  publishParticipantPayments,
  publishParticipantPaymentsOfEvent,
  storedParticipantPaymentPatch,
  refundPaytrailErrorAudit,
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
    mockReadTransaction.mockResolvedValue(paymentTransaction)
    mockFailUnfinishedTransaction.mockResolvedValue(true)
    mockUpdateUnresolvedTransaction.mockResolvedValue(true)
    mockDropOpenTransactionId.mockResolvedValue(undefined)
    mockGetRegistration.mockResolvedValue({
      createdAt: '2026-07-25T10:00:00.000Z',
      dog: { name: 'Test Dog', regNo: 'TEST-1' },
      eventId: 'event-1',
      id: 'registration-1',
      owner: { email: 'owner@example.com', membership: false, name: 'Owner' },
      ownerHandles: true,
      paymentStatus: 'PENDING',
    })
    mockReadPaymentTransactions.mockResolvedValue([])
    mockGetEvent.mockResolvedValue({
      cost: 50,
      entryStartDate: '2026-07-01T00:00:00.000Z',
      organizer: { id: 'organizer-1', name: 'Organizer' },
      paymentTime: 'registration',
      state: 'confirmed',
    })
    mockAudit.mockResolvedValue(undefined)
    mockOrganizerAudience.mockResolvedValue([{ connectionId: 'admin-page' }])
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
      expect(mockReadTransaction).toHaveBeenCalledWith('transaction-1')
    })

    it('throws a 404 when the transaction does not exist, without reading the registration', async () => {
      mockReadTransaction.mockResolvedValueOnce(undefined)

      await expect(resolveCallbackTransaction<JsonPaymentTransaction>(params)).rejects.toMatchObject({ status: 404 })
      expect(mockGetRegistration).not.toHaveBeenCalled()
    })
  })

  describe('dropOpenTransaction', () => {
    const registration = { eventId: 'event-1', id: 'registration-1' }

    it('removes only the given id, bumps updatedAt, and reports it was open', async () => {
      mockDropOpenTransactionId.mockResolvedValueOnce(['transaction-1', 'transaction-2'])

      await expect(dropOpenTransaction(registration, 'openPayments', 'transaction-1')).resolves.toBe(true)

      expect(mockDropOpenTransactionId).toHaveBeenCalledWith(
        'event-1',
        'registration-1',
        'openPayments',
        'transaction-1',
        expect.any(String)
      )
    })

    // The secretary's incremental refresh filters on updatedAt; a row whose only open attempt just
    // failed must not look unchanged after a websocket gap (KOE-1529).
    it('shares the given timestamp as updatedAt when one is passed in', async () => {
      mockDropOpenTransactionId.mockResolvedValueOnce(['transaction-1'])

      await dropOpenTransaction(registration, 'openPayments', 'transaction-1', '2026-10-13T12:00:00.000Z')

      expect(mockDropOpenTransactionId).toHaveBeenCalledWith(
        'event-1',
        'registration-1',
        'openPayments',
        'transaction-1',
        '2026-10-13T12:00:00.000Z'
      )
    })

    it('reports no change when the id was not a member -- a different, newer transaction is untouched', async () => {
      mockDropOpenTransactionId.mockResolvedValueOnce(['transaction-2'])

      await expect(dropOpenTransaction(registration, 'openPayments', 'transaction-1')).resolves.toBe(false)
    })

    it('reports no change when nothing was ever open', async () => {
      mockDropOpenTransactionId.mockResolvedValueOnce(undefined)

      await expect(dropOpenTransaction(registration, 'openPayments', 'transaction-1')).resolves.toBe(false)
    })
  })

  describe('updateTransactionStatus', () => {
    it('writes the new status on an unresolved transaction, dropping the payment response', async () => {
      await expect(updateTransactionStatus(paymentTransaction, 'pending')).resolves.toBe(true)

      expect(mockUpdateUnresolvedTransaction).toHaveBeenCalledWith('transaction-1', {
        remove: ['paymentResponse'],
        set: { status: 'pending', statusAt: expect.any(String) },
      })
    })

    it('keeps the payment response of a new transaction and names the provider', async () => {
      await updateTransactionStatus({ ...paymentTransaction, status: 'pending' }, 'new', 'nordea')

      expect(mockUpdateUnresolvedTransaction).toHaveBeenCalledWith('transaction-1', {
        set: { provider: 'nordea', status: 'new', statusAt: expect.any(String) },
      })
    })

    it('skips a write that would change nothing', async () => {
      await expect(
        updateTransactionStatus({ ...paymentTransaction, statusAt: '2026-08-16T10:00:00.000Z' }, 'pending')
      ).resolves.toBe(false)

      expect(mockUpdateUnresolvedTransaction).not.toHaveBeenCalled()
    })

    it('does not write over an already settled transaction (rule 3)', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      mockUpdateUnresolvedTransaction.mockResolvedValueOnce(false)

      await expect(updateTransactionStatus(paymentTransaction, 'pending')).resolves.toBe(false)
      expect(loggedLines(consoleSpy)).toContainEqual(
        expect.objectContaining({ message: 'transaction already settled, ignoring status update' })
      )
    })
  })

  describe('loadOpenPayments', () => {
    it('loads nothing with no open ids, without calling batchGet', async () => {
      await expect(loadOpenPayments(undefined)).resolves.toEqual([])
      await expect(loadOpenPayments([])).resolves.toEqual([])
      expect(mockReadPaymentTransactions).not.toHaveBeenCalled()
    })

    it('loads every open payment by id, for the payment picture to read', async () => {
      const loaded: Partial<JsonPaymentTransaction>[] = [
        { createdAt: minutesAgo(10), status: 'fail', type: 'payment' },
        { createdAt: minutesAgo(1), status: 'pending', type: 'payment' },
      ]
      mockReadPaymentTransactions.mockResolvedValueOnce(loaded)

      await expect(loadOpenPayments(['t1', 't2'])).resolves.toEqual(loaded)
      expect(mockReadPaymentTransactions).toHaveBeenCalledWith(['t1', 't2'])
    })
  })

  // The two ways a participant's answer leaves the server build the payment picture the same way,
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
      mockReadPaymentTransactions.mockResolvedValueOnce([
        { createdAt: minutesAgo(10), status: 'pending', type: 'payment' },
      ])

      const result = await participantResponse(withOpenPayment, 'raw-token', event)

      expect(result).toMatchObject({ payment: { canPay: true, status: 'unpaid' } })
      expect(result).not.toHaveProperty('openPayments')
      expect(result).not.toHaveProperty('openRefunds')
    })

    it('participantResponse holds the pay offer back while the open payment is fresh', async () => {
      mockReadPaymentTransactions.mockResolvedValueOnce([
        { createdAt: minutesAgo(1), status: 'pending', type: 'payment' },
      ])

      await expect(participantResponse(withOpenPayment, 'raw-token', event)).resolves.toMatchObject({
        payment: { canPay: false, status: 'inProgress' },
      })
    })

    it('participantPaymentPatch builds the picture the same way', async () => {
      mockReadPaymentTransactions.mockResolvedValueOnce([
        { createdAt: minutesAgo(10), status: 'pending', type: 'payment' },
      ])

      await expect(participantPaymentPatch(withOpenPayment, event)).resolves.toMatchObject({
        payment: { canPay: true, status: 'unpaid' },
      })
    })

    it('storedParticipantPaymentPatch builds from the row as stored, read strongly consistent (KOE-1553)', async () => {
      mockReadRegistrationConsistently.mockResolvedValueOnce({
        ...withOpenPayment,
        updatedAt: '2030-01-01T00:00:00.500Z',
      })
      mockReadPaymentTransactions.mockResolvedValueOnce([
        { createdAt: minutesAgo(1), status: 'pending', type: 'payment' },
      ])

      await expect(storedParticipantPaymentPatch(event, withOpenPayment.id)).resolves.toMatchObject({
        id: withOpenPayment.id,
        payment: { canPay: false, status: 'inProgress' },
        updatedAt: '2030-01-01T00:00:00.500Z',
      })
      expect(mockReadRegistrationConsistently).toHaveBeenCalledWith(event.id, withOpenPayment.id)
    })

    it('storedParticipantPaymentPatch has nothing for a row that is gone', async () => {
      mockReadRegistrationConsistently.mockResolvedValueOnce(undefined)

      await expect(storedParticipantPaymentPatch(event, 'gone')).resolves.toBeUndefined()
      expect(mockReadPaymentTransactions).not.toHaveBeenCalled()
    })

    it("publishParticipantPayments sends each entrant its own stored row's picture", async () => {
      const other: JsonRegistration = { ...withOpenPayment, id: 'other', openPayments: [], paidAmount: 50 }
      mockReadRegistrationConsistently.mockResolvedValueOnce(withOpenPayment).mockResolvedValueOnce(other)
      mockReadPaymentTransactions.mockResolvedValueOnce([
        { createdAt: minutesAgo(10), status: 'pending', type: 'payment' },
      ])

      await publishParticipantPayments(event, [withOpenPayment.id, other.id])

      expect(mockToEntrant).toHaveBeenCalledTimes(2)
      expect(mockToEntrant).toHaveBeenCalledWith(
        event.id,
        withOpenPayment.id,
        expect.objectContaining({ payment: expect.objectContaining({ canPay: true, status: 'unpaid' }) })
      )
      expect(mockToEntrant).toHaveBeenCalledWith(
        event.id,
        other.id,
        expect.objectContaining({ payment: expect.objectContaining({ canPay: false, status: 'paid' }) })
      )
    })

    it('publishParticipantPaymentsOfEvent reads the event once for the open pages (KOE-1566)', async () => {
      const other: JsonRegistration = { ...withOpenPayment, id: 'other', openPayments: [], paidAmount: 50 }
      mockGetEvent.mockResolvedValueOnce(event)
      mockReadRegistrationConsistently.mockResolvedValueOnce(withOpenPayment).mockResolvedValueOnce(other)
      mockReadPaymentTransactions.mockResolvedValueOnce([
        { createdAt: minutesAgo(1), status: 'pending', type: 'payment' },
      ])

      await publishParticipantPaymentsOfEvent(event.id, [withOpenPayment.id, other.id])

      expect(mockGetEvent).toHaveBeenCalledTimes(1)
      expect(mockGetEvent).toHaveBeenCalledWith(event.id)
      expect(mockReadRegistrationConsistently).toHaveBeenCalledWith(event.id, other.id)
      expect(mockToEntrant).toHaveBeenCalledWith(
        event.id,
        withOpenPayment.id,
        expect.objectContaining({ payment: expect.objectContaining({ canPay: false, status: 'inProgress' }) })
      )
      expect(mockToEntrant).toHaveBeenCalledWith(
        event.id,
        other.id,
        expect.objectContaining({ payment: expect.objectContaining({ status: 'paid' }) })
      )
    })

    it('publishParticipantPaymentsOfEvent logs a failed event read and never rejects (KOE-1566)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockGetEvent.mockRejectedValueOnce(new Error('event table down'))

      await expect(publishParticipantPaymentsOfEvent(event.id, [withOpenPayment.id])).resolves.toBeUndefined()

      expect(mockToEntrant).not.toHaveBeenCalled()
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({
          eventId: event.id,
          message: 'participant patch failed',
          registrationId: withOpenPayment.id,
        }),
      ])
      errorSpy.mockRestore()
    })

    it('reads no open payments as not in progress, without calling batchGet', async () => {
      const registration: JsonRegistration = JSON.parse(JSON.stringify(jsonRegistrationsToEventWithALOInvited[0]))

      await expect(participantResponse(registration, 'raw-token', event)).resolves.toMatchObject({
        payment: { status: 'unpaid' },
      })
      expect(mockReadPaymentTransactions).not.toHaveBeenCalled()
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

    it('fails the transaction, drops it from the open set, audits once, and names what changed', async () => {
      // Not a frozen clock: with time frozen, two independent new Date() calls still read the same
      // instant, so a reverted shared `now` would pass this test too (round 3 finding, root-cause
      // reviewer). Spying new Date().toISOString()'s own return sequence is what actually falsifies
      // the shared-timestamp property: settleFailedTransaction calls it exactly once and passes that
      // one value to both writes; a reverted version that lets failUnfinishedTransaction and
      // dropOpenTransaction default their own timestamp would each consume one spied value, landing
      // FIRST on one write and SECOND on the other (KOE-1529, round 4).
      const FIRST = '2026-08-16T12:00:00.000Z'
      const SECOND = '2026-08-16T12:00:05.000Z'
      vi.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(FIRST).mockReturnValueOnce(SECOND)
      mockDropOpenTransactionId.mockResolvedValueOnce(['transaction-1'])

      const settled = await settleFailedTransaction(paymentTransaction, registration, 'openPayments', auditOptions)

      expect(settled.moved).toBe(true)
      expect(settled.changed).toBe(true)
      // The secretary's incremental refresh reads updatedAt, and must see this as of the one moment
      // the failure actually happened (KOE-1529, round 1 part 2); both writes get FIRST, the one
      // value settleFailedTransaction actually computed, never SECOND.
      expect(mockFailUnfinishedTransaction).toHaveBeenCalledWith('transaction-1', 'paytrail', FIRST)
      expect(mockDropOpenTransactionId).toHaveBeenCalledWith(
        'event-1',
        'registration-1',
        'openPayments',
        'transaction-1',
        FIRST
      )
      expect(mockAudit).toHaveBeenCalledTimes(1)
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:registration-1',
        message: 'paytrail: 5000',
        messageKey: 'audit.messages.paymentFailed',
        messageParams: { amount: 5000, provider: 'paytrail' },
        user: 'Test User',
      })
      // Which registration the caller publishes; what it is told is read when it is sent (KOE-1566).
      expect(settled.cancelled).toEqual({ eventId: 'event-1', field: 'openPayments', registrationId: 'registration-1' })
      expect(mockReadRegistrationConsistently).not.toHaveBeenCalled()
      expect(mockGetEvent).not.toHaveBeenCalled()
    })

    // Nothing after the writes may fail the settle: the money write is done, and a callback answered
    // with an error would only be retried into `changed=false` (KOE-1566).
    it.each([
      ['the event read', () => mockGetEvent.mockRejectedValue(new Error('event table down'))],
      [
        'the strongly consistent registration read',
        () => mockReadRegistrationConsistently.mockRejectedValue(new Error('read throttled')),
      ],
    ])('still settles when %s would fail', async (_name, failRead) => {
      failRead()
      mockDropOpenTransactionId.mockResolvedValueOnce(['transaction-1'])

      const settled = await settleFailedTransaction(paymentTransaction, registration, 'openPayments', auditOptions)

      expect(settled).toEqual({
        cancelled: { eventId: 'event-1', field: 'openPayments', registrationId: 'registration-1' },
        changed: true,
        moved: true,
      })
      expect(mockFailUnfinishedTransaction).toHaveBeenCalledTimes(1)
      expect(mockDropOpenTransactionId).toHaveBeenCalledTimes(1)
      expect(mockAudit).toHaveBeenCalledTimes(1)
    })

    it('still drops and publishes a retry that finds the transaction already failed (rule 6, C12)', async () => {
      mockFailUnfinishedTransaction.mockResolvedValueOnce(false) // already fail
      mockDropOpenTransactionId.mockResolvedValueOnce(['transaction-1']) // still open

      const settled = await settleFailedTransaction(paymentTransaction, registration, 'openPayments', auditOptions)

      expect(settled.moved).toBe(false)
      expect(settled.changed).toBe(true)
      expect(settled.cancelled).toBeDefined()
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('does not publish when the id was already gone (a second, racing writer)', async () => {
      mockDropOpenTransactionId.mockResolvedValueOnce([]) // already removed by the racing writer

      const settled = await settleFailedTransaction(paymentTransaction, registration, 'openPayments', auditOptions)

      expect(settled.changed).toBe(false)
      expect(settled.cancelled).toBeUndefined()
      expect(mockReadRegistrationConsistently).not.toHaveBeenCalled()
    })
  })

  // Both audiences of a settled failure, from one strongly consistent read after the settle's writes
  // (KOE-1529), and never failing the request (KOE-1566).
  describe('publishCancelledRegistration', () => {
    const cancelled = { eventId: 'event-1', field: 'openPayments', registrationId: 'registration-1' } as const
    const settledRow: JsonRegistration = {
      ...JSON.parse(JSON.stringify(jsonRegistrationsToEventWithALOInvited[0])),
      eventId: 'event-1',
      id: 'registration-1',
      openPayments: [],
      paidAmount: undefined,
      updatedAt: '2026-08-16T12:00:00.000Z',
    }
    let errorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mockReadRegistrationConsistently.mockResolvedValue(settledRow)
    })

    afterEach(() => {
      errorSpy.mockRestore()
    })

    it('sends the admins the open set and the entrant the picture, from one consistent read', async () => {
      await publishCancelledRegistration(cancelled)

      expect(mockReadRegistrationConsistently).toHaveBeenCalledTimes(1)
      expect(mockReadRegistrationConsistently).toHaveBeenCalledWith('event-1', 'registration-1')
      expect(mockOrganizerAudience).toHaveBeenCalledWith('organizer-1', 'event-1')
      expect(mockToAdmins).toHaveBeenCalledWith('event-1', [
        { eventId: 'event-1', id: 'registration-1', openPayments: [], updatedAt: '2026-08-16T12:00:00.000Z' },
      ])
      expect(mockToEntrant).toHaveBeenCalledWith(
        'event-1',
        'registration-1',
        expect.objectContaining({
          payment: expect.objectContaining({ canPay: true, status: 'unpaid' }),
          updatedAt: '2026-08-16T12:00:00.000Z',
        })
      )
      expect(loggedLines(errorSpy)).toEqual([])
    })

    it('reads the registration fresh, so a racing recordDuplicatePayment wins', async () => {
      // KOE-1529 correction: recordDuplicatePayment writes the transaction and the registration
      // (paymentStatus: DUPLICATE) as two separate updates. A settle racing into that gap still finds
      // the id open; what is published must say what the row holds when it is sent.
      mockReadRegistrationConsistently.mockResolvedValueOnce({ ...settledRow, paymentStatus: 'DUPLICATE' })

      await publishCancelledRegistration(cancelled)

      expect(mockToEntrant).toHaveBeenCalledWith(
        'event-1',
        'registration-1',
        expect.objectContaining({ paymentStatus: 'DUPLICATE' })
      )
    })

    it('sends nothing for a row that is gone', async () => {
      mockReadRegistrationConsistently.mockResolvedValueOnce(undefined)

      await publishCancelledRegistration(cancelled)

      expect(mockToAdmins).not.toHaveBeenCalled()
      expect(mockToEntrant).not.toHaveBeenCalled()
      expect(loggedLines(errorSpy)).toEqual([])
    })

    it.each([
      [
        'the registration read',
        () => mockReadRegistrationConsistently.mockRejectedValueOnce(new Error('read throttled')),
      ],
      ['the event read', () => mockGetEvent.mockRejectedValueOnce(new Error('event table down'))],
    ])('logs and resolves when %s fails', async (_name, failRead) => {
      failRead()

      await expect(publishCancelledRegistration(cancelled)).resolves.toBeUndefined()

      expect(mockToAdmins).not.toHaveBeenCalled()
      expect(mockToEntrant).not.toHaveBeenCalled()
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({ message: 'cancelled registration read failed', registrationId: 'registration-1' }),
      ])
    })

    it('still sends the admins their patch when the entrant picture cannot be built', async () => {
      mockReadRegistrationConsistently.mockResolvedValueOnce({ ...settledRow, openPayments: ['transaction-2'] })
      mockReadPaymentTransactions.mockRejectedValueOnce(new Error('transaction table down'))

      await expect(publishCancelledRegistration(cancelled)).resolves.toBeUndefined()

      expect(mockToAdmins).toHaveBeenCalledTimes(1)
      expect(mockToEntrant).not.toHaveBeenCalled()
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({ message: 'participant patch failed', registrationId: 'registration-1' }),
      ])
    })

    it.each([
      ['the admin audience cannot be read', () => mockOrganizerAudience.mockRejectedValueOnce(new Error('down'))],
      [
        'the admin send fails',
        () =>
          mockToAdmins.mockImplementationOnce(() => {
            throw new Error('gateway refused')
          }),
      ],
    ])('still sends the entrant the picture when %s', async (_name, failAdmins) => {
      failAdmins()

      await expect(publishCancelledRegistration(cancelled)).resolves.toBeUndefined()

      expect(mockToEntrant).toHaveBeenCalledTimes(1)
      expect(loggedLines(errorSpy)).toEqual([
        expect.objectContaining({
          message: 'cancelled registration admin patch failed',
          registrationId: 'registration-1',
        }),
      ])
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
