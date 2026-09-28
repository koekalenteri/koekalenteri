import type { SNSEvent } from 'aws-lambda'
import { vi } from 'vitest'

const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockDynamoUpdate = vi.fn()
const mockDynamoWrite = vi.fn()
const mockDynamoClient = vi.fn(function MockCustomDynamoClient() {
  return {
    update: mockDynamoUpdate,
    write: mockDynamoWrite,
  }
})
const mockGetEvent = vi.fn()
const mockPublishRegistrationPatches = vi.fn()

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: mockDynamoClient,
}))

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

vi.doMock('../lib/ws/actions', () => ({
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: sesNotificationLambda } = await import('./handler')

/** The handler reads only Records[].Sns.Message; minimal events convert at this boundary. */
const asSNSEvent = (event: { Records: { Sns: { Message: string } }[] }) => event as SNSEvent

const registrationExists = { expression: 'attribute_exists(#id)', names: { '#id': 'id' } }

const bounceFor = (tags: Record<string, string[]>) =>
  asSNSEvent({
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            bounce: { bouncedRecipients: [{ emailAddress: 'handler@example.com' }] },
            mail: { tags },
            notificationType: 'Bounce',
          }),
        },
      },
    ],
  })

describe('sesNotificationLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRegistrationAuditKey.mockReturnValue('event123:reg456')
    mockGetEvent.mockResolvedValue({ organizer: { id: 'org-1' } })
  })

  it('stores bounce details for the tagged registration', async () => {
    await sesNotificationLambda(
      asSNSEvent({
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
      })
    )

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
      },
      undefined,
      undefined,
      registrationExists
    )
    expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
      'event123',
      [
        expect.objectContaining({
          emailDeliveryStatus: expect.objectContaining({ status: 'bounce' }),
          eventId: 'event123',
          id: 'reg456',
        }),
      ],
      'org-1'
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
    await sesNotificationLambda(
      asSNSEvent({
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
      })
    )

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
      },
      undefined,
      undefined,
      registrationExists
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
    await sesNotificationLambda(
      asSNSEvent({
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
      })
    )

    expect(mockDynamoUpdate).not.toHaveBeenCalled()
    expect(mockDynamoWrite).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  // Every stack's bounce topic hangs off the same configuration set (KOE-1468)
  it("ignores another stack's notification", async () => {
    await sesNotificationLambda(
      bounceFor({ eventId: ['event123'], registrationId: ['reg456'], stack: ['koekalenteri-test'] })
    )

    expect(mockDynamoUpdate).not.toHaveBeenCalled()
    expect(mockDynamoWrite).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it("stores this stack's notification", async () => {
    await sesNotificationLambda(bounceFor({ eventId: ['event123'], registrationId: ['reg456'], stack: ['local'] }))

    expect(mockDynamoUpdate).toHaveBeenCalledTimes(1)
    expect(mockDynamoWrite).toHaveBeenCalledTimes(1)
    expect(mockAudit).toHaveBeenCalledTimes(1)
  })

  it('creates nothing for a registration this stack does not have', async () => {
    mockDynamoUpdate.mockRejectedValueOnce(
      Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' })
    )

    await sesNotificationLambda(bounceFor({ eventId: ['event123'], registrationId: ['reg456'] }))

    expect(mockDynamoUpdate).toHaveBeenCalledWith(
      { eventId: 'event123', id: 'reg456' },
      expect.anything(),
      undefined,
      undefined,
      registrationExists
    )
    expect(mockDynamoWrite).not.toHaveBeenCalled()
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('rethrows any other update failure', async () => {
    mockDynamoUpdate.mockRejectedValueOnce(new Error('throttled'))

    await expect(
      sesNotificationLambda(bounceFor({ eventId: ['event123'], registrationId: ['reg456'] }))
    ).rejects.toThrow('throttled')
    expect(mockDynamoWrite).not.toHaveBeenCalled()
  })
})
