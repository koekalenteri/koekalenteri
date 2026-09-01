import { vi } from 'vitest'
import { constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => fn)
const mockResponse = vi.fn()
const mockParseParams = vi.fn()
const mockVerifyParams = vi.fn()
const mockUpdateTransactionStatus = vi.fn()
const mockApplySuccessfulPayment = vi.fn()
const mockClearRegistrationEmailDeliveryStatus = vi.fn()
const mockGetRegistration = vi.fn()
const mockCreateRegistrationPatches = vi.fn(() => [])
const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockRead = vi.fn()
const mockUpdate = vi.fn()
const mockWrite = vi.fn()
const mockUpdateRegistrations = vi.fn()
const mockFixRegistrationGroups = vi.fn(async (registrations: any[]) => registrations)
const mockLockRegistrationGroups = vi.fn().mockResolvedValue(async () => undefined)
const mockLockRegistrationPayments = vi.fn().mockResolvedValue(async () => undefined)
const mockGetReadyRegistrationsByEventId = vi.fn().mockResolvedValue([])
const mockGetFixedT = vi.fn()
const mockSendTemplatedMail = vi.fn()
const mockEmailTo = vi.fn()
const mockRegistrationEmailTags = vi.fn()
const mockRegistrationEmailTemplateData = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockPublishParticipantRegistrationPatch = vi.fn()
const mockGetRegistrationEditToken = vi.fn().mockResolvedValue('test-edit-token')

const phaseUpdate = (field: string) => [
  { transactionId: 'tx123' },
  { set: { [field]: expect.any(String) } },
  'transaction-table-not-found-in-env',
  undefined,
  expect.objectContaining({ expression: '#postPaymentLease.#token = :token' }),
]

vi.doMock('../lib/lambda', () => ({
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

vi.doMock('../lib/payment', () => ({
  applySuccessfulPayment: mockApplySuccessfulPayment,
  parseParams: mockParseParams,
  updateTransactionStatus: mockUpdateTransactionStatus,
  verifyParams: mockVerifyParams,
}))

vi.doMock('../lib/registration', () => ({
  clearRegistrationEmailDeliveryStatus: mockClearRegistrationEmailDeliveryStatus,
  createRegistrationPatch: vi.fn((registration: any, existing: any = {}) => ({
    eventId: registration.eventId,
    id: registration.id,
    ...Object.fromEntries(Object.entries(registration).filter(([key, value]) => existing[key] !== value)),
  })),
  createRegistrationPatches: mockCreateRegistrationPatches,
  getReadyRegistrationsByEventId: mockGetReadyRegistrationsByEventId,
  getRegistration: mockGetRegistration,
  getRegistrationEditToken: mockGetRegistrationEditToken,
}))

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      read: mockRead,
      update: mockUpdate,
      write: mockWrite,
    }
  }),
}))

vi.doMock('../lib/event', () => ({
  fixRegistrationGroups: mockFixRegistrationGroups,
  lockRegistrationGroups: mockLockRegistrationGroups,
  lockRegistrationPayments: mockLockRegistrationPayments,
  updateRegistrations: mockUpdateRegistrations,
}))

vi.doMock('../../i18n/lambda', () => ({
  i18n: {
    getFixedT: mockGetFixedT,
  },
}))

vi.doMock('../lib/email', () => ({
  emailTo: mockEmailTo,
  registrationEmailTags: mockRegistrationEmailTags,
  registrationEmailTemplateData: mockRegistrationEmailTemplateData,
  sendTemplatedMail: mockSendTemplatedMail,
}))

vi.doMock('../lib/ws/actions', () => ({
  publishParticipantRegistrationPatch: mockPublishParticipantRegistrationPatch,
  publishRegistrationPatchesStrict: mockPublishRegistrationPatches,
}))

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

    mockRead.mockResolvedValue({
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
    mockApplySuccessfulPayment.mockResolvedValue({ applied: true, appliedAt: '2025-01-01T00:00:00.000Z' })
    mockClearRegistrationEmailDeliveryStatus.mockResolvedValue(undefined)

    mockUpdate.mockResolvedValue({})

    mockRegistrationAuditKey.mockReturnValue('event123:reg456')

    mockUpdateRegistrations.mockResolvedValue({
      cost: 50,
      id: 'event123',
      name: 'Test Event',
      organizer: { id: 'org-1' },
    })

    mockGetFixedT.mockReturnValue((key: string, _options?: Record<string, any>) => {
      if (key === 'dateFormat.long') return '1.1.2025'
      return key
    })

    mockRegistrationEmailTemplateData.mockReturnValue({
      eventName: 'Test Event',
      registrationId: 'reg456',
    })

    mockEmailTo.mockReturnValue(['test@example.com'])
    mockRegistrationEmailTags.mockImplementation((registration: any, template: any) => [
      { Name: 'eventId', Value: registration.eventId },
      { Name: 'registrationId', Value: registration.id },
      { Name: 'template', Value: template },
    ])

    mockSendTemplatedMail.mockResolvedValue(undefined)
  })

  it('processes a successful payment correctly', async () => {
    await paymentSuccessLambda(event)

    // Verify params were parsed and verified
    expect(mockParseParams).toHaveBeenCalledWith(event.queryStringParameters)
    expect(mockVerifyParams).toHaveBeenCalledWith(event.queryStringParameters)

    // Verify transaction was retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' }, 'transaction-table-not-found-in-env', true)

    expect(mockUpdate).toHaveBeenCalledWith(
      { transactionId: 'tx123' },
      {
        set: {
          postPaymentLease: expect.objectContaining({ expiresAt: expect.any(Number), token: expect.any(String) }),
        },
      },
      'transaction-table-not-found-in-env',
      undefined,
      expect.objectContaining({
        expression: expect.stringContaining('attribute_not_exists(#postPaymentLease)'),
      })
    )

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

    expect(mockUpdate).toHaveBeenCalledWith(...phaseUpdate('postPaymentProcessedAt'))

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
    expect(mockPublishParticipantRegistrationPatch).toHaveBeenCalledWith(
      'event123',
      'reg456',
      expect.objectContaining({
        eventId: 'event123',
        id: 'reg456',
        paymentStatus: 'SUCCESS',
        shouldPay: false,
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
      message: 'Maksu (Paytrail), 50,00\u00a0€',
      user: 'user123',
    })

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
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

  it('records and acknowledges a captured duplicate payment without applying it', async () => {
    mockRegistrationAuditKey.mockImplementation(
      (registration: { eventId: string; id: string }) => `${registration.eventId}:${registration.id}`
    )
    mockGetReadyRegistrationsByEventId.mockResolvedValueOnce([
      { dog: { regNo: 'FI12345' }, eventId: 'event123', id: 'other-registration', state: 'ready' },
    ])

    await paymentSuccessLambda(event)

    expect(mockApplySuccessfulPayment).not.toHaveBeenCalled()
    expect(mockSendTemplatedMail).not.toHaveBeenCalled()
    expect(mockLockRegistrationPayments).toHaveBeenCalledWith('event123')
    expect(mockGetReadyRegistrationsByEventId).toHaveBeenCalledWith('event123', true)
    expect(mockUpdate).toHaveBeenCalledWith(
      { transactionId: 'tx123' },
      expect.objectContaining({
        set: expect.objectContaining({ duplicateOfRegistrationId: 'other-registration', status: 'ok' }),
      }),
      'transaction-table-not-found-in-env'
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      { set: { paymentStatus: 'DUPLICATE', updatedAt: expect.any(String) } },
      'registration-table-not-found-in-env'
    )
    expect(mockPublishParticipantRegistrationPatch).toHaveBeenCalledWith('event123', 'reg456', {
      eventId: 'event123',
      id: 'reg456',
      paymentStatus: 'DUPLICATE',
      shouldPay: false,
      updatedAt: expect.any(String),
    })
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ auditKey: 'event123:reg456', message: expect.stringContaining('Päällekkäinen maksu') })
    )
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: 'event123:other-registration',
        message: expect.stringContaining('maksun ilmoittautuminen: reg456'),
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
    expect(mockUpdate).toHaveBeenCalledWith(...phaseUpdate('postPaymentProcessedAt'))

    // Verify response was returned
    expect(mockResponse).toHaveBeenCalledWith(200, undefined, event)
  })

  it('does not process payment if status is not ok', async () => {
    mockParseParams.mockReturnValueOnce({
      eventId: 'event123',
      provider: 'paytrail',
      registrationId: 'reg456',
      status: 'fail',
      transactionId: 'tx123',
    })

    await paymentSuccessLambda(event)

    // Verify transaction status was updated
    expect(mockUpdateTransactionStatus).toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

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

  it('reconstructs a missing transaction from a verified success callback', async () => {
    mockRead.mockResolvedValueOnce(null)

    await paymentSuccessLambda(event)

    // Verify transaction was attempted to be retrieved
    expect(mockRead).toHaveBeenCalledWith({ transactionId: 'tx123' })

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
    expect(mockRead).not.toHaveBeenCalled()

    // Verify transaction status was NOT updated
    expect(mockUpdateTransactionStatus).not.toHaveBeenCalled()

    // Verify registration was NOT retrieved
    expect(mockGetRegistration).not.toHaveBeenCalled()

    // Verify registration payment status was NOT updated
    expect(mockUpdate).not.toHaveBeenCalled()

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

  it('fails the callback so a receipt delivery failure is retried', async () => {
    const emailError = new Error('Failed to send email')
    mockSendTemplatedMail.mockRejectedValueOnce(emailError)

    await expect(paymentSuccessLambda(event)).rejects.toThrow(emailError)

    // The completed marker is intentionally absent, so the provider retry
    // sends the receipt again.
    expect(mockUpdate).not.toHaveBeenCalledWith(...phaseUpdate('receiptSentAt'))
    expect(mockResponse).not.toHaveBeenCalled()
  })

  it('retries an interrupted receipt delivery', async () => {
    mockRead.mockResolvedValue({
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
    expect(mockUpdate).toHaveBeenCalledWith(...phaseUpdate('receiptSentAt'))
  })

  it('uses the payment-time receipt balances after later payments changed the registration total', async () => {
    mockRead.mockResolvedValue({
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
    mockRead.mockResolvedValue({
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
    mockUpdate.mockReset().mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })

    await paymentSuccessLambda(event)

    expect(mockRead).toHaveBeenCalledTimes(1)
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
})
