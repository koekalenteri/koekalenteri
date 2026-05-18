import { jest } from '@jest/globals'

const mockGetFixedT = jest.fn<any>()
const mockGetProviderName = jest.fn<any>()
const mockGetConfirmedEvent = jest.fn<any>()
const mockApplyRefundSuccess = jest.fn<any>()
const mockSendTemplatedMail = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()

jest.unstable_mockModule('../../i18n/lambda', () => ({
  i18n: {
    getFixedT: mockGetFixedT,
  },
}))

jest.unstable_mockModule('../../lib/payment', () => ({
  getProviderName: mockGetProviderName,
}))

jest.unstable_mockModule('../registration/api', () => ({
  eventReadPort: {
    getConfirmedEvent: mockGetConfirmedEvent,
  },
}))

jest.unstable_mockModule('../registration/actions', () => ({
  applyRefundSuccess: mockApplyRefundSuccess,
}))

jest.unstable_mockModule('../lib/email', () => ({
  registrationEmailTemplateData: jest.fn(() => ({})),
  sendTemplatedMail: mockSendTemplatedMail,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

const { handleSuccessfulRefund } = await import('./actions')

describe('handleSuccessfulRefund', () => {
  const transaction = {
    createdAt: '2023-01-01T12:00:00.000Z',
    status: 'pending',
    transactionId: 'transaction123',
    type: 'refund',
    user: 'Test User',
  } as any

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})

    mockGetProviderName.mockReturnValue('Paytrail')
    mockGetFixedT.mockReturnValue((key: string, _options?: Record<string, any>) => {
      if (key === 'dateFormat.long') return '1.1.2025'
      return key
    })
    mockGetConfirmedEvent.mockResolvedValue({ id: 'event123', name: 'Test Event' })
    mockApplyRefundSuccess.mockResolvedValue({
      registration: {
        eventId: 'event123',
        id: 'reg456',
        language: 'fi',
        paidAmount: 20,
        payer: { email: 'payer@example.com' },
        refundAmount: 10,
        refundStatus: 'SUCCESS',
      },
    })
    mockSendTemplatedMail.mockResolvedValue(undefined)
    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
  })

  it('applies refund success and sends email + audits', async () => {
    await handleSuccessfulRefund({
      eventId: 'event123',
      params: { 'checkout-amount': '1000', 'checkout-provider': 'paytrail' },
      provider: 'paytrail',
      registrationId: 'reg456',
      transaction,
    })

    expect(mockApplyRefundSuccess).toHaveBeenCalledWith({
      eventId: 'event123',
      refundAmount: 10,
      refundAt: expect.any(String),
      registrationId: 'reg456',
    })

    expect(mockSendTemplatedMail).toHaveBeenCalledWith(
      'refund',
      'fi',
      expect.any(String),
      ['payer@example.com'],
      expect.objectContaining({
        amount: '10,00\u00A0€',
        handlingCost: '10,00\u00A0€',
        paidAmount: '20,00\u00A0€',
        providerName: 'Paytrail',
        refundAmount: 10,
        refundStatus: 'SUCCESS',
      })
    )

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: 'event123:reg456',
        message: expect.stringContaining('Email:'),
        user: 'Test User',
      })
    )
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Palautus (Paytrail), 10,00\u00A0€',
      user: 'Test User',
    })
  })

  it('continues when sending refund email fails', async () => {
    mockSendTemplatedMail.mockRejectedValueOnce(new Error('Email sending failed'))

    await handleSuccessfulRefund({
      eventId: 'event123',
      params: { 'checkout-amount': '1000', 'checkout-provider': 'paytrail' },
      provider: 'paytrail',
      registrationId: 'reg456',
      transaction,
    })

    expect(console.error).toHaveBeenCalledWith('failed to send refund email', expect.any(Error))
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message: 'Palautus (Paytrail), 10,00\u00A0€',
      user: 'Test User',
    })
  })
})
