import { jest } from '@jest/globals'

const mockAudit = jest.fn<any>()
const mockRegistrationAuditKey = jest.fn<any>()
const mockDynamoUpdate = jest.fn<any>()
const mockDynamoWrite = jest.fn<any>()
const mockDynamoClient = jest.fn(() => ({
  update: mockDynamoUpdate,
  write: mockDynamoWrite,
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: mockDynamoClient,
}))

const { default: sesNotificationLambda } = await import('./handler')

describe('sesNotificationLambda', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
  })

  it('stores bounce details for the tagged registration', async () => {
    await sesNotificationLambda({
      Records: [
        {
          Sns: {
            Message: JSON.stringify({
              bounce: {
                bouncedRecipients: [
                  {
                    diagnosticCode: 'smtp; 550 5.1.1 user unknown',
                    emailAddress: 'Handler@Example.com',
                  },
                ],
                timestamp: '2026-05-27T10:00:00.000Z',
              },
              mail: {
                tags: {
                  eventId: ['event123'],
                  registrationId: ['reg456'],
                  template: ['invitation'],
                },
              },
              notificationType: 'Bounce',
            }),
          },
        },
      ],
    } as any)

    expect(mockDynamoUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      {
        set: {
          emailDeliveryStatus: {
            at: '2026-05-27T10:00:00.000Z',
            email: 'Handler@Example.com',
            reason: 'smtp; 550 5.1.1 user unknown',
            status: 'bounce',
            template: 'invitation',
          },
        },
      }
    )
    expect(mockDynamoWrite).toHaveBeenCalledWith({
      email: 'handler@example.com',
      eventId: 'event123',
      reason: 'smtp; 550 5.1.1 user unknown',
      registrationId: 'reg456',
      status: 'bounce',
      template: 'invitation',
      updatedAt: '2026-05-27T10:00:00.000Z',
    })
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: 'event123:reg456',
      message:
        'Sähköpostin toimitus epäonnistui (palautui): Handler@Example.com, template: invitation, reason: smtp; 550 5.1.1 user unknown',
      user: 'system',
    })
  })

  it('stores complaint details for the tagged registration', async () => {
    await sesNotificationLambda({
      Records: [
        {
          Sns: {
            Message: JSON.stringify({
              complaint: {
                complainedRecipients: [{ emailAddress: 'owner@example.com' }],
                complaintFeedbackType: 'abuse',
                timestamp: '2026-05-27T11:00:00.000Z',
              },
              mail: {
                tags: {
                  eventId: ['event123'],
                  registrationId: ['reg456'],
                  template: ['registration'],
                },
              },
              notificationType: 'Complaint',
            }),
          },
        },
      ],
    } as any)

    expect(mockDynamoUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      {
        set: {
          emailDeliveryStatus: {
            at: '2026-05-27T11:00:00.000Z',
            email: 'owner@example.com',
            reason: 'abuse',
            status: 'complaint',
            template: 'registration',
          },
        },
      }
    )
    expect(mockDynamoWrite).toHaveBeenCalledWith({
      email: 'owner@example.com',
      eventId: 'event123',
      reason: 'abuse',
      registrationId: 'reg456',
      status: 'complaint',
      template: 'registration',
      updatedAt: '2026-05-27T11:00:00.000Z',
    })
  })

  it('ignores notifications without registration tags', async () => {
    await sesNotificationLambda({
      Records: [
        {
          Sns: {
            Message: JSON.stringify({
              bounce: {
                bouncedRecipients: [{ emailAddress: 'handler@example.com' }],
              },
              notificationType: 'Bounce',
            }),
          },
        },
      ],
    } as any)

    expect(mockDynamoUpdate).not.toHaveBeenCalled()
    expect(mockDynamoWrite).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })
})
