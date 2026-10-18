import type { JsonRegistration } from '../../types'
import type { CancelledRegistration } from '../lib/payment'
import { vi } from 'vitest'
import { deliverToEntrant, everyEntrantWatching } from '../test-utils/entrantPages'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockParseParams = vi.fn()
const mockVerifyParams = vi.fn()
const mockUpdateTransactionStatus = vi.fn()
const mockSettleFailedTransaction = vi.fn()
const mockApplySuccessfulPayment = vi.fn()
// The entrant's picture goes through the real publisher, its failure handling included (KOE-1566):
// every entrant named has the page open and each payload reaches `mockToEntrant`. Its open payments
// are a fresh pending one for each id, so a test only has to override openPayments to pin the shape
// (KOE-1529, round 1 part 3).
const mockToEntrant = vi.fn()
const mockReadPaymentTransactions = vi.fn(async (transactionIds: string[]) =>
  transactionIds.map(() => ({ createdAt: new Date().toISOString(), status: 'pending', type: 'payment' }))
)
const mockClearRegistrationEmailDeliveryStatus = vi.fn()
const mockGetRegistration = vi.fn()
const mockCreateRegistrationPatches = vi.fn(() => [])
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockReadTransaction = vi.fn()
const mockClaimPostPaymentWorkflow = vi.fn()
const mockMarkPostPaymentPhase = vi.fn()
const mockReleasePostPaymentWorkflow = vi.fn()
const mockMarkTransactionDuplicate = vi.fn()
const mockWriteDuplicateTransaction = vi.fn()
const mockMarkDuplicatePayment = vi.fn()
const mockUpdateRegistrations = vi.fn()
const mockGetEvent = vi.fn()
const mockFixRegistrationGroups = vi.fn(async (registrations: unknown[]) => registrations)
const mockLockRegistrationGroups = vi.fn().mockResolvedValue(async () => undefined)
const mockLockRegistrationPayments = vi.fn().mockResolvedValue(async () => undefined)
const mockGetReadyRegistrationsByEventId = vi.fn().mockResolvedValue([])
const mockGetFixedT = vi.fn()
const mockSendTemplatedMail = vi.fn()
const mockEmailTo = vi.fn()
const mockRegistrationEmailTags = vi.fn()
const mockRegistrationEmailTemplateData = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockGetRegistrationEditToken = vi.fn().mockReturnValue('test-edit-token')
const mockSendTemplatedEmailToEventRegistrations = vi.fn().mockResolvedValue({ failed: [], ok: [] })

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  LambdaError: class LambdaError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
  lambda: mockLambda,
  response: mockResponse,
}))

const mockPublishCancelledRegistration = vi.fn()
vi.doMock('../lib/payment', async () => ({
  parseParams: mockParseParams,
  publishCancelledRegistration: mockPublishCancelledRegistration,
  publishParticipantPaymentsOfEvent: (await vi.importActual<typeof import('../lib/payment')>('../lib/payment'))
    .publishParticipantPaymentsOfEvent,
  settleFailedTransaction: mockSettleFailedTransaction,
  updateTransactionStatus: mockUpdateTransactionStatus,
  verifyParams: mockVerifyParams,
}))

vi.doMock('../lib/registration', () => ({
  clearRegistrationEmailDeliveryStatus: mockClearRegistrationEmailDeliveryStatus,
  createRegistrationPatch: vi.fn((registration: Record<string, unknown>, existing: Record<string, unknown> = {}) => ({
    eventId: registration.eventId,
    id: registration.id,
    ...Object.fromEntries(Object.entries(registration).filter(([key, value]) => existing[key] !== value)),
  })),
  createRegistrationPatches: mockCreateRegistrationPatches,
  getReadyRegistrationsByEventId: mockGetReadyRegistrationsByEventId,
  getRegistration: mockGetRegistration,
  getRegistrationEditToken: mockGetRegistrationEditToken,
  sendTemplatedEmailToEventRegistrations: mockSendTemplatedEmailToEventRegistrations,
}))

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

// The lease's conditions and the transaction writes are the repository's (transactionRepository.test.ts).
vi.doMock('../lib/repositories/transactionRepository', () => ({
  applySuccessfulPayment: mockApplySuccessfulPayment,
  claimPostPaymentWorkflow: mockClaimPostPaymentWorkflow,
  markPostPaymentPhase: mockMarkPostPaymentPhase,
  markTransactionDuplicate: mockMarkTransactionDuplicate,
  readPaymentTransactions: mockReadPaymentTransactions,
  readTransaction: mockReadTransaction,
  writeDuplicateTransaction: mockWriteDuplicateTransaction,
}))

// The publisher's strongly consistent registration read answers as getRegistration does.
vi.doMock('../lib/repositories/registrationRepository', () => ({
  markDuplicatePayment: mockMarkDuplicatePayment,
  readRegistrationConsistently: (eventId: string, id: string) => mockGetRegistration(eventId, id),
}))

vi.doMock('../lib/event', () => ({
  fixRegistrationGroups: mockFixRegistrationGroups,
  getEvent: mockGetEvent,
  lockRegistrationGroups: mockLockRegistrationGroups,
  lockRegistrationPayments: mockLockRegistrationPayments,
  updateRegistrations: mockUpdateRegistrations,
}))

vi.doMock('../../i18n/lambda', () => ({
  getFixedT: mockGetFixedT,
}))

vi.doMock('../lib/email', () => ({
  emailTo: mockEmailTo,
  registrationEmailTags: mockRegistrationEmailTags,
  registrationEmailTemplateData: mockRegistrationEmailTemplateData,
  sendTemplatedMail: mockSendTemplatedMail,
}))

const mockPublishEventCounts = vi.fn().mockResolvedValue(undefined)
vi.doMock('../lib/ws/actions', async () => ({
  publishEventCounts: mockPublishEventCounts,
  publishParticipantRegistrationPatches: (
    await vi.importActual<typeof import('../lib/ws/actions')>('../lib/ws/actions')
  ).publishParticipantRegistrationPatches,
  publishRegistrationPatchesStrict: mockPublishRegistrationPatches,
}))
vi.doMock('../lib/ws/connectionSelectors', () => ({ registrationsAudience: everyEntrantWatching }))
vi.doMock('../lib/ws/broadcast', () => ({ broadcast: deliverToEntrant(mockToEntrant) }))

const { default: paymentSuccessLambda } = await import('./handler')

describe('paymentSuccessLambda', () => {
  const event = constructPartialAPIGwEvent({
    body: '',
    headers: {},
    queryStringParameters: {
      'checkout-amount': '5000',
      'checkout-provider': 'paytrail',
      'checkout-reference': 'event123:reg456',
      'checkout-status': 'ok',
      'checkout-transaction-id': 'tx123',
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockParseParams.mockReturnValue({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'ok',
      transactionId: 'tx123',
    })

    mockVerifyParams.mockResolvedValue(undefined)

    mockReadTransaction.mockResolvedValue({
      amount: 5000,
      paymentResponse: { transactionId: 'tx123' },
      reference: 'event123:reg456',
      status: 'pending',
      transactionId: 'tx123',
      user: 'user123',
    })

    mockGetRegistration.mockResolvedValue({
      dog: { regNo: 'FI12345' },
      eventId: 'event123',
      id: 'reg456',
      language: 'fi',
      paidAmount: 0,
      payer: {
        email: 'test@example.com',
      },
      paymentStatus: 'PENDING',
      state: 'creating',
    })

    mockUpdateTransactionStatus.mockResolvedValue(true)
    mockSettleFailedTransaction.mockResolvedValue({ changed: false, moved: false })
    mockApplySuccessfulPayment.mockResolvedValue({ applied: true, appliedAt: '2025-01-01T00:00:00.000Z' })
    mockClearRegistrationEmailDeliveryStatus.mockResolvedValue(undefined)

    // Once leased, the workflow reads the transaction again; that read answers as the first one does.
    mockClaimPostPaymentWorkflow.mockImplementation(async (transactionId: string) => ({
      release: mockReleasePostPaymentWorkflow,
      token: 'lease-token',
      transaction: await mockReadTransaction(transactionId),
    }))
    mockMarkPostPaymentPhase.mockResolvedValue({})

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockUpdateRegistrations.mockResolvedValue({
      cost: 50,
      id: 'event123',
      name: 'Test Event',
      organizer: { id: 'org-1' },
    })
    mockGetEvent.mockResolvedValue({
      cost: 50,
      id: 'event123',
      name: 'Test Event',
      organizer: { id: 'org-1' },
      state: 'confirmed',
    })

    mockGetFixedT.mockReturnValue((key: string, _options?: Record<string, unknown>) => {
      if (key === 'dateFormat.long') return '1.1.2025'
      return key
    })

    mockRegistrationEmailTemplateData.mockReturnValue({
      eventName: 'Test Event',
      registrationId: 'reg456',
    })

    mockEmailTo.mockReturnValue(['test@example.com'])
    mockRegistrationEmailTags.mockImplementation(
      (registration: Pick<JsonRegistration, 'eventId' | 'id'>, template: string) => [
        { Name: 'eventId', Value: registration.eventId },
        { Name: 'registrationId', Value: registration.id },
        { Name: 'template', Value: template },
      ]
    )

    mockSendTemplatedMail.mockResolvedValue(undefined)
  })

  it('processes a successful payment correctly', async () => {
    await paymentSuccessLambda(event)

    // Verify params were parsed and verified
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)
    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify transaction was retrieved
    expect(mockReadTransaction).toHaveBeenCalledWith('tx123')
    expect(mockClaimPostPaymentWorkflow).toHaveBeenCalledWith('tx123')
    expect(mockReleasePostPaymentWorkflow).toHaveBeenCalledTimes(1)

    // Verify transaction and registration were updated atomically
    expect(mockApplySuccessfulPayment).toHaveBeenCalledWith(
      {
        amount: 5000,
        paymentResponse: { transactionId: 'tx123' },
        reference: 'event123:reg456',
        status: 'pending',
        transactionId: 'tx123',
        user: 'user123',
      },
      'event123',
      'reg456',
      'paytrail',
      false,
      true,
      0
    )

    // Verify registration was retrieved
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    expect(mockMarkPostPaymentPhase).toHaveBeenCalledWith('tx123', 'lease-token', 'postPaymentProcessedAt')

    // Verify event registrations were updated
    expect(mockUpdateRegistrations).toHaveBeenCalledWith('event123')
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [
        expect.objectContaining({
          eventId: 'event123',
          id: 'reg456',
          language: 'fi',
          paidAmount: 50,
          payer: { email: 'test@example.com' },
          paymentStatus: 'SUCCESS',
          state: 'ready',
        }),
      ],
      'org-1'
    )
    expect(mockToEntrant).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({
        eventId: 'event123',
        id: 'reg456',
        // The page holds no group, so the patch says what is left to pay (KOE-1526). Recomputed
        // fresh with this transaction's id taken out of the open set, not left at whatever it was
        // on the row this handler started with (KOE-1529, round 1 part 3).
        payment: expect.objectContaining({ canPay: false, due: 0 }),
        paymentStatus: 'SUCCESS',
      })
    )

    // Verify receipt email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'receipt',
      'fi',
      expect.any(String), // emailFrom
      ['test@example.com'], // receiptTo
      expect.objectContaining({
        amount: '50,00\u00a0€',
        createdAt: '1.1.2025',
        eventName: 'Test Event',
        registrationId: 'reg456',
      }),
      expect.arrayContaining([
        { Name: 'eventId', Value: 'event123' },
        { Name: 'registrationId', Value: 'reg456' },
        { Name: 'template', Value: 'receipt' },
      ])
    )

    // Verify confirmation email was sent
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      'fi',
      expect.any(String), // emailFrom
      ['test@example.com'], // to
      expect.objectContaining({
        eventName: 'Test Event',
        registrationId: 'reg456',
      }),
      expect.arrayContaining([
        { Name: 'eventId', Value: 'event123' },
        { Name: 'registrationId', Value: 'reg456' },
        { Name: 'template', Value: 'registration' },
      ])
    )

    // Verify audit entry was created
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      messageKey: 'audit.messages.payment',
      messageParams: { amount: '50,00\u00a0€', provider: 'Paytrail' },
      user: 'user123',
    })
    // The receipt and the confirmation are named by their subjects' keys, the recipients kept as written (KOE-1442).
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'audit.messages.emailSentTo',
        messageParams: expect.objectContaining({
          recipients: 'test@example.com',
          templateKey: 'registration.email.subject_receipt',
        }),
      })
    )
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'audit.messages.emailSentTo',
        messageParams: expect.objectContaining({ templateKey: 'registration.email.subject' }),
      })
    )

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  // KOE-1529, round 2 part 3: a delayed (bank transfer) payment was read as in progress by an
  // earlier, full GetRegistration, which sent the picture's inProgress status for openPayments on
  // the participant's own page. When the ok callback applies it, the published patch must say so is
  // no longer true, or the payment picture (which checks the open payments before the paid amount) keeps the page saying
  // "Odottaa maksun käsittelyä" for a fee that is actually paid, until a reload the verifying budget
  // may no longer give. The first two getRegistration calls (handleSuccessfulPayment's own fetch and
  // applyPaymentToRegistration's re-fetch) answer with the stale, pre-apply row; only the third, the
  // strongly consistent re-read this test pins, reflects applySuccessfulPayment's DELETE from
  // openPayments. Without that re-read, the handler would pass the stale row straight through and
  // this assertion would fail.
  it('no longer says in progress in the published patch once a delayed payment is applied', async () => {
    const beforeApply = {
      dog: { regNo: 'FI12345' },
      eventId: 'event123',
      id: 'reg456',
      language: 'fi',
      openPayments: ['tx123'],
      paidAmount: 0,
      payer: { email: 'test@example.com' },
      paymentStatus: 'PENDING',
      state: 'creating',
    }
    mockGetRegistration
      .mockResolvedValueOnce(beforeApply)
      .mockResolvedValueOnce(beforeApply)
      .mockResolvedValueOnce({
        ...beforeApply,
        openPayments: [],
        paidAmount: 50,
        paymentStatus: 'SUCCESS',
        state: 'ready',
      })

    await paymentSuccessLambda(event)

    expect(mockToEntrant).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({
        payment: expect.objectContaining({ status: 'paid' }),
        paymentStatus: 'SUCCESS',
      })
    )
  })

  it('assigns a group when payment makes a registration ready', async () => {
    const readyRegistration = {
      eventId: 'event123',
      id: 'reg456',
      language: 'fi',
      payer: { email: 'test@example.com' },
      state: 'ready',
    }
    const groupedRegistration = { ...readyRegistration, group: { key: 'reserve', number: 1 } }
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce([]).mockResolvedValueOnce([readyRegistration])
    mockFixRegistrationGroups.mockResolvedValueOnce([groupedRegistration])

    await paymentSuccessLambda(event)

    expect(mockFixRegistrationGroups).toHaveBeenCalledWith([readyRegistration], { name: 'payment' })
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [expect.objectContaining({ group: { key: 'reserve', number: 1 }, id: 'reg456' })],
      'org-1'
    )
  })

  const arrangeDuplicatePayment = () => {
    mockRegistrationAuditKey.mockImplementation(
      (registration: { eventId: string; id: string }) => `${registration.eventId}:${registration.id}`
    )
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce([
      { dog: { regNo: 'FI12345' }, eventId: 'event123', id: 'other-registration', state: 'ready' },
    ])
    // getRegistration is called three times here: handleSuccessfulPayment's own fetch,
    // applyPaymentToRegistration's re-fetch (whose result decides the duplicate), and
    // recordDuplicatePayment's strongly consistent re-read after its own DELETE from openPayments --
    // only the third reflects it (KOE-1529, round 2 part 3).
    const beforeApply = {
      dog: { regNo: 'FI12345' },
      eventId: 'event123',
      id: 'reg456',
      language: 'fi',
      openPayments: ['tx123'],
      paidAmount: 0,
      payer: { email: 'test@example.com' },
      paymentStatus: 'PENDING',
      state: 'creating',
    }
    mockGetRegistration
      .mockResolvedValueOnce(beforeApply)
      .mockResolvedValueOnce(beforeApply)
      .mockResolvedValueOnce({
        ...beforeApply,
        openPayments: [],
        paymentStatus: 'DUPLICATE',
        updatedAt: '2025-01-01T00:00:00.000Z',
      })
  }

  it('records and acknowledges a captured duplicate payment without applying it', async () => {
    arrangeDuplicatePayment()

    await paymentSuccessLambda(event)

    expect(mockApplySuccessfulPayment).not.toHaveBeenCalled()
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()
    expect(mockLockRegistrationPayments).toHaveBeenCalledWith('event123')
    expect(mockGetReadyRegistrationsByEventId).toHaveBeenCalledWith('event123', true)
    expect(mockGetRegistration).toHaveBeenCalledTimes(3)
    expect(mockMarkTransactionDuplicate).toHaveBeenCalledWith('tx123', {
      duplicateOfRegistrationId: 'other-registration',
      duplicatePaymentAt: expect.any(String),
      provider: 'paytrail',
    })
    expect(mockWriteDuplicateTransaction).not.toHaveBeenCalled()
    expect(mockMarkDuplicatePayment).toHaveBeenCalledWith('event123', 'reg456', 'tx123', expect.any(String))
    expect(mockClaimPostPaymentWorkflow).not.toHaveBeenCalled()
    // The same rule as GetRegistration: a payment charged twice offers no pay button (KOE-1526).
    expect(mockToEntrant).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({
        eventId: 'event123',
        id: 'reg456',
        // Recomputed with this transaction's id taken out of the open set, not left at whatever it
        // was on the row this handler started with (KOE-1529, round 1 part 3).
        payment: expect.objectContaining({ canPay: false, due: 50, status: 'duplicate' }),
        paymentStatus: 'DUPLICATE',
        updatedAt: expect.any(String),
      })
    )
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: 'event123:reg456',
        messageKey: 'audit.messages.paymentDuplicate',
        messageParams: expect.objectContaining({ registrationId: 'other-registration' }),
      })
    )
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: 'event123:other-registration',
        messageKey: 'audit.messages.paymentDuplicateOther',
        messageParams: expect.objectContaining({ registrationId: 'reg456' }),
      })
    )
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('retries post-payment processing if the transaction was already applied', async () => {
    mockApplySuccessfulPayment.mockResolvedValueOnce({ applied: false, appliedAt: '2025-01-01T00:00:00.000Z' })

    await paymentSuccessLambda(event)

    expect(mockApplySuccessfulPayment).toHaveBeenCalled()

    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')

    expect(mockUpdateRegistrations).toHaveBeenCalledWith('event123')
    expect(mockPublishRegistrationPatches).toHaveBeenCalled()
    expect(mockSendTemplatedMail).toHaveBeenCalled()
    expect(mockAudit).toHaveBeenCalled()
    expect(mockMarkPostPaymentPhase).toHaveBeenCalledWith('tx123', 'lease-token', 'postPaymentProcessedAt')

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('does not process payment if status is pending or delayed', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'pending',
      transactionId: 'tx123',
    })

    await paymentSuccessLambda(event)

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()
    expect(mockSettleFailedTransaction).not.toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockApplySuccessfulPayment).not.toHaveBeenCalled()
    expect(mockClaimPostPaymentWorkflow).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  // The fourth writer that settles through the shared step (KOE-1529): a success callback
  // reporting fail is as final as the provider's own cancel callback.
  it('settles a failed payment through the shared step and publishes whatever changed', async () => {
    const cancelled = {
      eventId: 'event123',
      field: 'openPayments',
      registrationId: 'reg456',
    } satisfies CancelledRegistration
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'tx123',
    })
    mockSettleFailedTransaction.mockResolvedValueOnce({ cancelled, changed: true, moved: true })

    await paymentSuccessLambda(event)

    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()
    expect(mockGetRegistration).toHaveBeenCalledWith('event123', 'reg456')
    expect(mockSettleFailedTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'tx123' }),
      expect.objectContaining({ eventId: 'event123', id: 'reg456' }),
      'openPayments',
      { auditActor: expect.any(Function), auditMessage: expect.any(Function), provider: 'paytrail' }
    )
    expect(mockPublishCancelledRegistration).toHaveBeenCalledWith(cancelled)

    // Verify event registrations were NOT updated through the ordinary success path
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('does not publish when the settle step found nothing changed', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'tx123',
    })
    mockSettleFailedTransaction.mockResolvedValueOnce({ changed: false, moved: false })

    await paymentSuccessLambda(event)

    expect(mockPublishCancelledRegistration).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('writes a duplicate payment the callback found missing whole', async () => {
    arrangeDuplicatePayment()
    mockReadTransaction.mockResolvedValueOnce(null)

    await paymentSuccessLambda(event)

    expect(mockWriteDuplicateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, status: 'new', transactionId: 'tx123', type: 'payment' }),
      { duplicateOfRegistrationId: 'other-registration', duplicatePaymentAt: expect.any(String), provider: 'paytrail' }
    )
    expect(mockMarkTransactionDuplicate).not.toHaveBeenCalled()
    expect(mockMarkDuplicatePayment).toHaveBeenCalledWith('event123', 'reg456', 'tx123', expect.any(String))
    expect(mockApplySuccessfulPayment).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('reconstructs a missing transaction from a verified success callback', async () => {
    mockReadTransaction.mockResolvedValueOnce(null)

    await paymentSuccessLambda(event)

    // Verify transaction was attempted to be retrieved
    expect(mockReadTransaction).toHaveBeenCalledWith('tx123')

    expect(mockApplySuccessfulPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        reference: 'event123:reg456',
        status: 'new',
        transactionId: 'tx123',
        type: 'payment',
      }),
      'event123',
      'reg456',
      'paytrail',
      false,
      false,
      0
    )
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('passes through errors from verifyParams', async () => {
    const error = new Error('Verification failed')
    mockVerifyParams.mockRejectedValueOnce(error)

    await expect(paymentSuccessLambda(event)).rejects.toThrow(error)

    // Verify params were parsed
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify params verification was attempted
    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify transaction was NOT retrieved
    expect(mockReadTransaction).not.toHaveBeenCalled()

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockApplySuccessfulPayment).not.toHaveBeenCalled()
    expect(mockClaimPostPaymentWorkflow).not.toHaveBeenCalled()

    // Verify event registrations were NOT updated
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()

    // Verify receipt email was NOT sent
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()

    // Verify audit entry was NOT created
    expect(mockAudit).not.toHaveBeenCalled()

    // Verify response was NOT returned
    expect(mockResponse).not.toHaveBeenCalled()
  })

  // The payment is recorded before the entrant's page is told: a failed read or send is logged and
  // the receipt and confirmation still go out, instead of waiting for Paytrail's retry (KOE-1566).
  it.each([
    ['the event cannot be read', () => mockGetEvent.mockRejectedValueOnce(new Error('event table down'))],
    [
      'the open payments cannot be read',
      () => {
        mockGetRegistration.mockResolvedValue({
          eventId: 'event123',
          id: 'reg456',
          language: 'fi',
          openPayments: ['tx-other'],
          payer: { email: 'test@example.com' },
          paymentStatus: 'PENDING',
          state: 'ready',
        })
        mockReadPaymentTransactions.mockRejectedValueOnce(new Error('transaction table down'))
      },
    ],
  ])('sends the receipt and confirmation when %s for the entrant picture', async (_name, failPicture) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    failPicture()

    await paymentSuccessLambda(event)

    expect(mockToEntrant).not.toHaveBeenCalled()
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'receipt',
      'fi',
      expect.any(String),
      ['test@example.com'],
      expect.any(Object),
      expect.any(Array)
    )
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      'fi',
      expect.any(String),
      ['test@example.com'],
      expect.any(Object),
      expect.any(Array)
    )
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({ eventId: 'event123', message: 'participant patch failed', registrationId: 'reg456' }),
    ])
    errorSpy.mockRestore()
  })

  // The counts go out again with the strict publication in the last phase; the early push must not
  // hold the receipt and confirmation back (KOE-1566).
  it('sends the receipt and confirmation when the event counts cannot be pushed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockPublishEventCounts.mockRejectedValueOnce(new Error('connection table down'))

    await paymentSuccessLambda(event)

    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'receipt',
      'fi',
      expect.any(String),
      ['test@example.com'],
      expect.any(Object),
      expect.any(Array)
    )
    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'registration',
      'fi',
      expect.any(String),
      ['test@example.com'],
      expect.any(Object),
      expect.any(Array)
    )
    expect(mockPublishEventCounts).toHaveBeenCalledTimes(2)
    expect(mockMarkPostPaymentPhase).toHaveBeenCalledWith('tx123', 'lease-token', 'postPaymentProcessedAt')
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ message: 'connection table down' }),
        message: 'payment event counts push failed',
        registrationId: 'reg456',
      }),
    ])
    errorSpy.mockRestore()
  })

  it('writes both duplicate audits when the entrant picture cannot be built (KOE-1566)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce([
      { dog: { regNo: 'FI12345' }, eventId: 'event123', id: 'other-registration', state: 'ready' },
    ])
    mockGetEvent.mockRejectedValueOnce(new Error('event table down'))

    await paymentSuccessLambda(event)

    expect(mockToEntrant).not.toHaveBeenCalled()
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ messageKey: 'audit.messages.paymentDuplicate' }))
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ messageKey: 'audit.messages.paymentDuplicateOther' })
    )
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({ message: 'participant patch failed', registrationId: 'reg456' }),
    ])
    errorSpy.mockRestore()
  })

  it('fails the callback so a receipt delivery failure is retried', async () => {
    const emailError = new Error('Failed to send email')
    mockSendTemplatedMail.mockRejectedValueOnce(emailError)

    await expect(paymentSuccessLambda(event)).rejects.toThrow(emailError)

    // The completed marker is intentionally absent, so the provider retry
    // sends the receipt again.
    expect(mockMarkPostPaymentPhase).not.toHaveBeenCalledWith('tx123', 'lease-token', 'receiptSentAt')
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('retries an interrupted receipt delivery', async () => {
    mockReadTransaction.mockResolvedValue({
      amount: 5000,
      receiptPreviouslyPaid: 50,
      receiptTotalPaid: 100,
      reference: 'event123:reg456',
      status: 'pending',
      transactionId: 'tx123',
      user: 'user123',
    })
    mockApplySuccessfulPayment.mockResolvedValueOnce({ applied: false, appliedAt: '2025-01-01T00:00:00.000Z' })

    await paymentSuccessLambda(event)

    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'receipt',
      'fi',
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
      expect.any(Array)
    )
    expect(mockMarkPostPaymentPhase).toHaveBeenCalledWith('tx123', 'lease-token', 'receiptSentAt')
  })

  it('uses the payment-time receipt balances after later payments changed the registration total', async () => {
    mockReadTransaction.mockResolvedValue({
      amount: 5000,
      receiptPreviouslyPaid: 50,
      receiptTotalPaid: 100,
      reference: 'event123:reg456',
      status: 'pending',
      transactionId: 'tx123',
      user: 'user123',
    })
    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      language: 'fi',
      paidAmount: 150,
      payer: { email: 'test@example.com' },
      paymentStatus: 'SUCCESS',
    })
    mockApplySuccessfulPayment.mockResolvedValueOnce({ applied: false, appliedAt: '2025-01-01T00:00:00.000Z' })

    await paymentSuccessLambda(event)

    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'receipt',
      'fi',
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ previouslyPaid: '50,00 €', totalPaid: '100,00 €' }),
      expect.any(Array)
    )
  })

  it('does not repeat completed post-payment effects', async () => {
    mockReadTransaction.mockResolvedValue({
      amount: 5000,
      postPaymentProcessedAt: '2025-01-01T00:00:00.000Z',
      reference: 'event123:reg456',
      status: 'pending',
      transactionId: 'tx123',
      user: 'user123',
    })
    mockApplySuccessfulPayment.mockResolvedValueOnce({ applied: false, appliedAt: '2025-01-01T00:00:00.000Z' })

    await paymentSuccessLambda(event)

    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('acknowledges a concurrent callback while another worker owns the post-payment lease', async () => {
    mockClaimPostPaymentWorkflow.mockResolvedValueOnce(undefined)

    await paymentSuccessLambda(event)

    expect(mockReadTransaction).toHaveBeenCalledTimes(1)
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('adds amount to existing paidAmount if present', async () => {
    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      language: 'fi',
      paidAmount: 20, // Already paid 20 EUR
      payer: {
        email: 'test@example.com',
      },
      paymentStatus: 'PENDING',
    })

    await paymentSuccessLambda(event)

    expect(mockApplySuccessfulPayment).toHaveBeenCalledWith(
      expect.any(Object),
      'event123',
      'reg456',
      'paytrail',
      false,
      true,
      20
    )
  })

  describe('the confirmation email of a payment on top of an earlier one (KOE-1101)', () => {
    const confirmationContexts = () =>
      mockRegistrationEmailTemplateData.mock.calls.map(([, , , context]) => context).filter((c) => c !== 'receipt')

    it('confirms a first payment as a registration', async () => {
      await paymentSuccessLambda(event)

      expect(confirmationContexts()).toEqual([''])
    })

    it('confirms an additional payment as a change to the registration', async () => {
      mockGetRegistration.mockResolvedValue({
        eventId: 'event123',
        id: 'reg456',
        language: 'fi',
        paidAmount: 20,
        payer: { email: 'test@example.com' },
        paymentStatus: 'SUCCESS',
        state: 'ready',
      })

      await paymentSuccessLambda(event)

      expect(confirmationContexts()).toEqual(['update'])
    })

    // KOE-1526 review: a reserve whose fee went back has paid nothing towards the place it was
    // lifted into, so its payment is a first one: in the receipt and in the confirmation alike.
    describe('a reserve whose fee was refunded, paying for the place it was lifted into', () => {
      beforeEach(() => {
        mockGetRegistration.mockResolvedValue({
          eventId: 'event123',
          group: { key: 'ALO-AP', number: 1 },
          id: 'reg456',
          language: 'fi',
          paidAmount: 50,
          payer: { email: 'test@example.com' },
          paymentStatus: 'SUCCESS',
          refundAmount: 45,
          refundHandlingCost: 5,
          state: 'ready',
        })
      })

      it('confirms it as a registration', async () => {
        await paymentSuccessLambda(event)

        expect(confirmationContexts()).toEqual([''])
      })

      it('records and receipts nothing as paid before it', async () => {
        await paymentSuccessLambda(event)

        expect(mockApplySuccessfulPayment).toHaveBeenCalledWith(
          expect.any(Object),
          'event123',
          'reg456',
          'paytrail',
          false,
          true,
          0
        )
        expect(mockSendTemplatedMail).toHaveBeenCalledWith(
          'receipt',
          'fi',
          expect.any(String),
          ['test@example.com'],
          expect.objectContaining({ previouslyPaid: undefined, totalPaid: '50,00\u00a0€' }),
          expect.any(Array)
        )
      })
    })

    // A registration that has never been paid has no amount stored: the payment is all of it.
    it('records a first payment on a registration with no amount stored', async () => {
      mockGetRegistration.mockResolvedValue({
        eventId: 'event123',
        id: 'reg456',
        language: 'fi',
        payer: { email: 'test@example.com' },
        paymentStatus: 'PENDING',
        state: 'ready',
      })

      await paymentSuccessLambda(event)

      expect(mockToEntrant).toHaveBeenCalledWith(
        'event123',
        'reg456',
        expect.objectContaining({ paidAmount: 50, paymentStatus: 'SUCCESS' })
      )
      expect(confirmationContexts()).toEqual([''])
    })

    // A payer who had part of the fee back still has the rest standing: the receipt counts it.
    it('receipts what is left of an earlier payment after a refund', async () => {
      mockGetRegistration.mockResolvedValue({
        eventId: 'event123',
        id: 'reg456',
        language: 'fi',
        paidAmount: 50,
        payer: { email: 'test@example.com' },
        paymentStatus: 'SUCCESS',
        refundAmount: 10,
        refundHandlingCost: 0,
        state: 'ready',
      })

      // The callback pays 50 on top: 40 standing before it, 90 in all.
      await paymentSuccessLambda(event)

      expect(mockSendTemplatedMail).toHaveBeenCalledWith(
        'receipt',
        'fi',
        expect.any(String),
        ['test@example.com'],
        expect.objectContaining({ previouslyPaid: '40,00\u00a0€', totalPaid: '90,00\u00a0€' }),
        expect.any(Array)
      )
    })

    it('still confirms a first payment as a registration when its callback is retried', async () => {
      mockReadTransaction.mockResolvedValue({
        amount: 5000,
        receiptPreviouslyPaid: 0,
        receiptTotalPaid: 50,
        reference: 'event123:reg456',
        registrationAppliedAt: '2025-01-01T00:00:00.000Z',
        status: 'ok',
        transactionId: 'tx123',
        user: 'user123',
      })
      mockGetRegistration.mockResolvedValue({
        eventId: 'event123',
        id: 'reg456',
        language: 'fi',
        paidAmount: 50,
        payer: { email: 'test@example.com' },
        paymentStatus: 'SUCCESS',
        state: 'ready',
      })
      mockApplySuccessfulPayment.mockResolvedValueOnce({ applied: false, appliedAt: '2025-01-01T00:00:00.000Z' })

      await paymentSuccessLambda(event)

      expect(confirmationContexts()).toEqual([''])
    })
  })

  it('publishes confirmed registration patch when picked registration payment succeeds', async () => {
    mockGetRegistration.mockResolvedValue({
      eventId: 'event123',
      id: 'reg456',
      language: 'fi',
      messagesSent: { picked: true },
      paidAmount: 0,
      payer: {
        email: 'test@example.com',
      },
      paymentStatus: 'PENDING',
    })

    await paymentSuccessLambda(event)

    expect(mockApplySuccessfulPayment).toHaveBeenCalledWith(
      expect.any(Object),
      'event123',
      'reg456',
      'paytrail',
      true,
      true,
      0
    )
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [
        expect.objectContaining({
          confirmed: true,
          eventId: 'event123',
          id: 'reg456',
          language: 'fi',
          messagesSent: { picked: true },
          paidAmount: 50,
          payer: { email: 'test@example.com' },
          paymentStatus: 'SUCCESS',
          state: 'ready',
        }),
      ],
      'org-1'
    )
  })

  describe('invitation held back until the place is paid (KOE-1191)', () => {
    const participant = {
      class: 'ALO',
      eventId: 'event123',
      eventType: 'NOME-B',
      group: { key: 'ALO-AP', number: 3 },
      id: 'reg456',
      language: 'fi',
      messagesSent: { picked: true },
      paidAmount: 0,
      payer: { email: 'test@example.com' },
      paymentStatus: 'PENDING',
      state: 'ready',
    }
    const eventWithClassState = (state: string) => ({
      classes: [{ class: 'ALO', state }],
      cost: 50,
      id: 'event123',
      name: 'Test Event',
      organizer: { id: 'org-1' },
      state: 'picked',
    })

    it('sends the invitation to a participant of an invited class', async () => {
      mockGetRegistration.mockResolvedValue(participant)
      mockUpdateRegistrations.mockResolvedValue(eventWithClassState('invited'))

      await paymentSuccessLambda(event)

      expect(mockSendTemplatedEmailToEventRegistrations).toHaveBeenCalledWith(
        'invitation',
        expect.objectContaining({ id: 'event123' }),
        [expect.objectContaining({ id: 'reg456', paymentStatus: 'SUCCESS' })],
        'https://koekalenteri.snj.fi',
        '',
        { name: 'user123' },
        ''
      )
      expect(mockMarkPostPaymentPhase).toHaveBeenCalledWith('tx123', 'lease-token', 'invitationSentAt')
    })

    it('does not send the invitation before the class has been invited', async () => {
      mockGetRegistration.mockResolvedValue(participant)
      mockUpdateRegistrations.mockResolvedValue(eventWithClassState('picked'))

      await paymentSuccessLambda(event)

      expect(mockSendTemplatedEmailToEventRegistrations).not.toHaveBeenCalled()
    })

    it('does not send the invitation to a registration left in the reserve list', async () => {
      mockGetRegistration.mockResolvedValue({ ...participant, group: { key: 'reserve', number: 1 } })
      mockUpdateRegistrations.mockResolvedValue(eventWithClassState('invited'))

      await paymentSuccessLambda(event)

      expect(mockSendTemplatedEmailToEventRegistrations).not.toHaveBeenCalled()
    })

    it('does not repeat an invitation that has already been sent', async () => {
      mockGetRegistration.mockResolvedValue({
        ...participant,
        messagesSent: { invitation: true, picked: true },
      })
      mockUpdateRegistrations.mockResolvedValue(eventWithClassState('invited'))

      await paymentSuccessLambda(event)

      expect(mockSendTemplatedEmailToEventRegistrations).not.toHaveBeenCalled()
    })
  })
})
