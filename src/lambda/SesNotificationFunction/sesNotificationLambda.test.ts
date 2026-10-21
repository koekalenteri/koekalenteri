import type { SNSEvent } from 'aws-lambda'
import type * as registrationRepository from '../lib/repositories/registrationRepository'
import { vi } from 'vitest'
import { loggedLines } from '../test-utils/logs'

const mockAudit = vi.fn()
const mockRegistrationAuditKey = vi.fn()
const mockWriteEmailDeliveryStatus = vi.fn<typeof registrationRepository.writeEmailDeliveryStatus>()
const mockWriteEmailSuppression = vi.fn()
const mockGetEvent = vi.fn()
const mockPublishRegistrationPatches = vi.fn()

vi.doMock('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: mockRegistrationAuditKey,
}))

vi.doMock('../lib/repositories/registrationRepository', () => ({
  writeEmailDeliveryStatus: mockWriteEmailDeliveryStatus,
}))

vi.doMock('../lib/repositories/emailSuppressionRepository', () => ({
  writeEmailSuppression: mockWriteEmailSuppression,
}))

vi.doMock('../lib/event', () => ({
  getEvent: mockGetEvent,
}))

// The real publisher runs, its guard included (KOE-1583); the connection scan below it is the boundary.
const mockQueryAdminConnections = vi.fn()
vi.doMock('../lib/ws/connectionRepository', () => ({
  queryAdminConnections: mockQueryAdminConnections,
  queryPublicConnections: vi.fn().mockResolvedValue([]),
  removeConnection: vi.fn(),
}))
vi.doMock('../lib/ws/actions', () => ({
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))

const { default: sesNotificationLambda } = await import('./handler')
const actualActions = await vi.importActual<typeof import('../lib/ws/actions')>('../lib/ws/actions')

/** The handler reads only Records[].Sns.Message; minimal events convert at this boundary. */
const asSNSEvent = (event: { Records: { Sns: { Message: string } }[] }) => event as SNSEvent

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
    mockWriteEmailDeliveryStatus.mockResolvedValue(true)
    mockQueryAdminConnections.mockResolvedValue([])
    mockPublishRegistrationPatches.mockImplementation(actualActions.publishRegistrationPatches)
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

    expect(mockWriteEmailDeliveryStatus).toHaveBeenCalledWith('event123', 'reg456', {
      at: '2026-05-27T10:00:00.000Z',
      email: 'Handler@Example.com',
      reason: 'smtp; 550 5.1.1 user unknown',
      status: 'bounce',
      template: 'invitation',
    })
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
    expect(mockWriteEmailSuppression).toHaveBeenCalledWith({
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
      details: [
        {
          detailKey: 'audit.details.emailTemplate',
          detailParams: { template: 'invitation', templateKey: 'emailTemplate.invitation' },
        },
        { detailKey: 'audit.details.deliveryReason', detailParams: { reason: 'smtp; 550 5.1.1 user unknown' } },
      ],
      messageKey: 'audit.messages.emailDeliveryFailed',
      messageParams: { email: 'Handler@Example.com', statusKey: 'audit.deliveryStatus.bounce' },
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

    expect(mockWriteEmailDeliveryStatus).toHaveBeenCalledWith('event123', 'reg456', {
      at: '2026-05-27T11:00:00.000Z',
      email: 'owner@example.com',
      reason: 'abuse',
      status: 'complaint',
      template: 'registration',
    })
    expect(mockWriteEmailSuppression).toHaveBeenCalledWith({
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

    expect(mockWriteEmailDeliveryStatus).not.toHaveBeenCalled()
    expect(mockWriteEmailSuppression).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  // Every stack's bounce topic hangs off the same configuration set (KOE-1468)
  it("ignores another stack's notification", async () => {
    await sesNotificationLambda(
      bounceFor({ eventId: ['event123'], registrationId: ['reg456'], stack: ['koekalenteri-test'] })
    )

    expect(mockWriteEmailDeliveryStatus).not.toHaveBeenCalled()
    expect(mockWriteEmailSuppression).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it("stores this stack's notification", async () => {
    await sesNotificationLambda(bounceFor({ eventId: ['event123'], registrationId: ['reg456'], stack: ['local'] }))

    expect(mockWriteEmailDeliveryStatus).toHaveBeenCalledTimes(1)
    expect(mockWriteEmailSuppression).toHaveBeenCalledTimes(1)
    expect(mockAudit).toHaveBeenCalledTimes(1)
  })

  it('creates nothing for a registration this stack does not have', async () => {
    mockWriteEmailDeliveryStatus.mockResolvedValueOnce(false)

    await sesNotificationLambda(bounceFor({ eventId: ['event123'], registrationId: ['reg456'] }))

    expect(mockWriteEmailDeliveryStatus).toHaveBeenCalledWith('event123', 'reg456', expect.anything())
    expect(mockWriteEmailSuppression).not.toHaveBeenCalled()
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
    expect(mockAudit).not.toHaveBeenCalled()
  })

  // The status, the suppression and the audit are stored: a failed push is no reason for SNS to
  // deliver the notification again (KOE-1583).
  it('audits and resolves when the live push after the write fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockQueryAdminConnections.mockRejectedValueOnce(new Error('scan failed'))

    await expect(
      sesNotificationLambda(bounceFor({ eventId: ['event123'], registrationId: ['reg456'] }))
    ).resolves.toBeUndefined()

    expect(mockWriteEmailSuppression).toHaveBeenCalledTimes(1)
    expect(mockAudit).toHaveBeenCalledTimes(1)
    expect(loggedLines(errorSpy)).toEqual([
      expect.objectContaining({ message: 'live push failed', publication: 'registration patches' }),
    ])
  })

  it('rethrows a failure to store the status', async () => {
    mockWriteEmailDeliveryStatus.mockRejectedValueOnce(new Error('throttled'))

    await expect(
      sesNotificationLambda(bounceFor({ eventId: ['event123'], registrationId: ['reg456'] }))
    ).rejects.toThrow('throttled')
    expect(mockWriteEmailSuppression).not.toHaveBeenCalled()
  })
})
