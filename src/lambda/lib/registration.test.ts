import type { EmailTemplateId, JsonRegistration } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { vi } from 'vitest'
import { eventWithALOClassInvited } from '../../__mockData__/events'
import {
  jsonRegistrationsToEventWithALOInvited,
  registrationsToEventWithParticipantsInvited,
} from '../../__mockData__/registrations'

const mockDynamoDB: import('vitest').Mocked<CustomDynamoClient> = {
  delete: vi.fn(),
  // @ts-expect-error types don't quite match
  query: vi.fn(),
  // @ts-expect-error types don't quite match
  read: vi.fn(),
  update: vi.fn(),
  write: vi.fn(),
}

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return mockDynamoDB
  }),
}))

const mockSendTemplatedMail = vi.fn()
const mockAudit = vi.fn()
const mockEmailTo = vi.fn()
const mockSESSend = vi.fn()

vi.doMock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn(function MockSESClient() {
    return { send: mockSESSend }
  }),
  SendTemplatedEmailCommand: vi.fn(function MockSendTemplatedEmailCommand({ Destination, Template }) {
    return [Destination.ToAddresses, Template]
  }),
}))

vi.doMock('./audit', () => ({
  audit: mockAudit,
  eventAuditKey: vi.fn().mockImplementation((event: { id: string }) => `event:${event.id}`),
  registrationAuditKey: vi
    .fn<(reg: { eventId: string; id: string }) => string>()
    .mockImplementation((reg) => `${reg.eventId}:${reg.id}`),
}))

const {
  authorizeRegistrationEdit,
  authorizeRegistrationRead,
  claimNewRegistrationPostProcessing,
  deriveRegistrationEditToken,
  getLastEmailInfo,
  findClassesToMark,
  findExistingRegistrationToEventForDog,
  getRegistrationChanges,
  hasRegistrationChanges,
  markNewRegistrationPhase,
  getRegistrationsByEventId,
  getReadyRegistrationsByEventId,
  groupRegistrationsByClass,
  groupRegistrationsByClassAndGroup,
  createSentRegistrationMessagesAudit,
  sendTemplatedEmailToEventRegistrations,
  patchRegistration,
  participantRegistrationResponse,
  publicRegistrationPatch,
  removeRegistrationCreationMetadata,
} = await import('./registration')

describe('createSentRegistrationMessagesAudit', () => {
  afterEach(() => vi.clearAllMocks())

  it('creates a single-class message with failed recipient details', () => {
    const record = createSentRegistrationMessagesAudit({
      event: { id: 'event-id' },
      failed: ['first@example.com', 'second@example.com'],
      label: 'Koekutsu',
      labelKey: 'emailTemplate.invitation',
      ok: ['success@example.com'],
      registrations: [{ class: 'ALO' }, { class: 'ALO' }],
      user: 'Test User',
    })

    expect(record).toEqual({
      auditKey: 'event:event-id',
      details: [
        {
          detailKey: 'audit.details.failedRecipients',
          detailParams: { recipients: 'first@example.com\nsecond@example.com' },
        },
      ],
      message: 'Koekutsu luokkaan ALO lähetetty: onnistui 1, epäonnistui 2',
      messageKey: 'audit.messages.classEmailSent',
      messageParams: {
        eventClass: 'ALO',
        failed: 2,
        ok: 1,
        template: 'Koekutsu',
        templateKey: 'emailTemplate.invitation',
      },
      user: 'Test User',
    })
  })

  it('uses the event-level message for multiple classes and omits empty failure details', () => {
    const record = createSentRegistrationMessagesAudit({
      event: { id: 'event-id' },
      failed: [],
      label: 'Koepaikkailmoitus',
      labelKey: 'emailTemplate.picked',
      ok: ['success@example.com'],
      registrations: [{ class: 'ALO' }, { class: 'AVO' }, { class: undefined }],
      user: 'Test User',
    })

    expect(record).toEqual({
      auditKey: 'event:event-id',
      message: 'Koepaikkailmoitus lähetetty: onnistui 1, epäonnistui 0',
      messageKey: 'audit.messages.emailSent',
      messageParams: {
        failed: 0,
        ok: 1,
        template: 'Koepaikkailmoitus',
        templateKey: 'emailTemplate.picked',
      },
      user: 'Test User',
    })
  })
})

describe('removeRegistrationCreationMetadata', () => {
  it('removes the retry credential and every new-registration workflow field', () => {
    const registration = {
      creationIdempotencyKey: 'create-secret',
      newRegistrationAuditAt: '2026-01-01T00:00:00.000Z',
      newRegistrationEmailSentAt: '2026-01-01T00:00:00.000Z',
      newRegistrationLease: { expiresAt: 1, token: 'lease' },
      newRegistrationProcessedAt: '2026-01-01T00:00:00.000Z',
      newRegistrationPublishedAt: '2026-01-01T00:00:00.000Z',
      newRegistrationStatsAt: '2026-01-01T00:00:00.000Z',
      notes: 'keep this',
    }

    expect(removeRegistrationCreationMetadata(registration)).toEqual({ notes: 'keep this' })
  })
})

describe('registration post-processing', () => {
  const registration = jsonRegistrationsToEventWithALOInvited[0]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers().setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('claims an expired or absent lease and reads the registration consistently', async () => {
    mockDynamoDB.update.mockResolvedValueOnce({ $metadata: {} })
    mockDynamoDB.read.mockResolvedValueOnce(registration)

    const claim = await claimNewRegistrationPostProcessing('event-1', 'registration-1')

    expect(claim).toBeDefined()
    expect(mockDynamoDB.update).toHaveBeenNthCalledWith(
      1,
      { eventId: 'event-1', id: 'registration-1' },
      { set: { newRegistrationLease: { expiresAt: Date.now() + 90_000, token: claim?.token } } },
      expect.anything(),
      undefined,
      {
        expression:
          'attribute_exists(#id) AND (attribute_not_exists(#newRegistrationLease) OR #newRegistrationLease.#expiresAt < :now)',
        names: { '#expiresAt': 'expiresAt', '#id': 'id', '#newRegistrationLease': 'newRegistrationLease' },
        values: { ':now': Date.now() },
      }
    )
    expect(mockDynamoDB.read).toHaveBeenCalledWith(
      { eventId: 'event-1', id: 'registration-1' },
      expect.anything(),
      true
    )
    expect(claim?.registration).toBe(registration)
  })

  it('returns undefined when another worker owns the lease', async () => {
    mockDynamoDB.update.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })

    await expect(claimNewRegistrationPostProcessing('event-1', 'registration-1')).resolves.toBeUndefined()
    expect(mockDynamoDB.read).not.toHaveBeenCalled()
  })

  it('releases only its own lease and ignores a lease that was taken over', async () => {
    mockDynamoDB.update.mockResolvedValueOnce({ $metadata: {} })
    mockDynamoDB.read.mockResolvedValueOnce(registration)
    const claim = await claimNewRegistrationPostProcessing('event-1', 'registration-1')
    mockDynamoDB.update.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })

    await expect(claim?.release()).resolves.toBeUndefined()

    expect(mockDynamoDB.update).toHaveBeenLastCalledWith(
      { eventId: 'event-1', id: 'registration-1' },
      { remove: ['newRegistrationLease'] },
      expect.anything(),
      undefined,
      {
        expression: '#newRegistrationLease.#token = :token',
        names: { '#newRegistrationLease': 'newRegistrationLease', '#token': 'token' },
        values: { ':token': claim?.token },
      }
    )
  })

  it('marks a phase only while the caller owns the lease', async () => {
    mockDynamoDB.update.mockResolvedValueOnce({ $metadata: {} })

    await markNewRegistrationPhase('event-1', 'registration-1', 'lease-token', 'newRegistrationEmailSentAt')

    expect(mockDynamoDB.update).toHaveBeenCalledWith(
      { eventId: 'event-1', id: 'registration-1' },
      { set: { newRegistrationEmailSentAt: '2026-07-27T12:00:00.000Z' } },
      expect.anything(),
      undefined,
      {
        expression: '#newRegistrationLease.#token = :token',
        names: { '#newRegistrationLease': 'newRegistrationLease', '#token': 'token' },
        values: { ':token': 'lease-token' },
      }
    )
  })
})

describe('registration', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  describe('getLastEmailInfo', () => {
    const reg = JSON.parse(JSON.stringify(registrationsToEventWithParticipantsInvited[6]))
    const date = '2024-08-08T08:32:00.000Z'

    it.each<[EmailTemplateId, string]>([
      ['access', `access-name ${date}`],
      ['invitation', `invitation-name ${date}`],
      ['picked', `picked-name ${date}`],
      ['receipt', `receipt-name ${date}`],
      ['refund', `refund-name ${date}`],
      ['registration', `registration-name ${date}`],
      ['reserve', `reserve-name (#${reg.group.number}) ${date}`],
    ])('should do blah', (templateId, expected) => {
      expect(getLastEmailInfo(templateId, `${templateId}-name`, reg, date)).toEqual(expected)
    })

    it('should print "?" in place of missing number for reserve', () => {
      expect(getLastEmailInfo('reserve', 'name', {} as JsonRegistration, date)).toEqual(`name (#?) ${date}`)
    })
  })

  describe('findExistingRegistrationToEventForDog', () => {
    it('should return undefined when dog is not found in existing registrations', async () => {
      mockDynamoDB.query.mockResolvedValueOnce([])

      expect(await findExistingRegistrationToEventForDog('event-id', 'reg-no')).toBeUndefined()
    })

    it('should return the existing registration when dong is already registered', async () => {
      mockDynamoDB.query.mockResolvedValueOnce(registrationsToEventWithParticipantsInvited)
      const reg = registrationsToEventWithParticipantsInvited[0]

      expect(await findExistingRegistrationToEventForDog(reg.eventId, reg.dog.regNo)).toEqual(reg)
    })

    it('should return a payment-pending registration for an idempotent creation retry', async () => {
      const reg = {
        ...registrationsToEventWithParticipantsInvited[0],
        creationIdempotencyKey: 'same-attempt',
        state: 'creating' as const,
      }
      mockDynamoDB.query.mockResolvedValueOnce([reg])

      expect(await findExistingRegistrationToEventForDog(reg.eventId, reg.dog.regNo, 'same-attempt')).toEqual(reg)
    })

    it('should reserve a recent payment-pending registration against a new attempt', async () => {
      const reg = {
        ...registrationsToEventWithParticipantsInvited[0],
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        creationIdempotencyKey: 'original-attempt',
        state: 'creating' as const,
      }
      mockDynamoDB.query.mockResolvedValueOnce([reg])

      expect(await findExistingRegistrationToEventForDog(reg.eventId, reg.dog.regNo, 'new-attempt')).toEqual(reg)
    })

    it('should ignore an abandoned payment-pending registration for a new attempt', async () => {
      const reg = {
        ...registrationsToEventWithParticipantsInvited[0],
        createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
        creationIdempotencyKey: 'original-attempt',
        state: 'creating' as const,
      }
      mockDynamoDB.query.mockResolvedValueOnce([reg])

      expect(await findExistingRegistrationToEventForDog(reg.eventId, reg.dog.regNo, 'new-attempt')).toBeUndefined()
    })
  })

  describe('getRegistrationsByEventId', () => {
    it('should return empty array when query returns undefined', async () => {
      mockDynamoDB.query.mockResolvedValueOnce(undefined)

      const result = await getRegistrationsByEventId('event-id')

      expect(result).toEqual([])
      expect(mockDynamoDB.query).toHaveBeenCalledWith({
        key: 'eventId = :eventId',
        values: { ':eventId': 'event-id' },
      })
    })

    it('should return empty array when query returns empty array', async () => {
      mockDynamoDB.query.mockResolvedValueOnce([])

      const result = await getRegistrationsByEventId('event-id')

      expect(result).toEqual([])
    })

    it('should return all registrations regardless of state', async () => {
      const registrations = [
        { eventId: 'event-id', id: 'reg1', state: 'ready' },
        { eventId: 'event-id', id: 'reg2', state: 'cancelled' },
        { eventId: 'event-id', id: 'reg3', state: 'pending' },
      ]
      mockDynamoDB.query.mockResolvedValueOnce(registrations)

      const result = await getRegistrationsByEventId('event-id')

      expect(result).toEqual(registrations)
      expect(result).toHaveLength(3)
    })
  })

  describe('getReadyRegistrationsByEventId', () => {
    it('should return empty array when no registrations exist', async () => {
      mockDynamoDB.query.mockResolvedValueOnce([])

      const result = await getReadyRegistrationsByEventId('event-id')

      expect(result).toEqual([])
    })

    it('should return only ready registrations', async () => {
      const registrations = [
        { eventId: 'event-id', id: 'reg1', state: 'ready' },
        { eventId: 'event-id', id: 'reg2', state: 'cancelled' },
        { eventId: 'event-id', id: 'reg3', state: 'ready' },
        { eventId: 'event-id', id: 'reg4', state: 'pending' },
      ]
      mockDynamoDB.query.mockResolvedValueOnce(registrations)

      const result = await getReadyRegistrationsByEventId('event-id')

      expect(result).toHaveLength(2)
      expect(result.every((r) => r.state === 'ready')).toBe(true)
      expect(result.map((r) => r.id)).toEqual(['reg1', 'reg3'])
    })

    it('should return empty array when all registrations are non-ready', async () => {
      const registrations = [
        { eventId: 'event-id', id: 'reg1', state: 'cancelled' },
        { eventId: 'event-id', id: 'reg2', state: 'pending' },
      ]
      mockDynamoDB.query.mockResolvedValueOnce(registrations)

      const result = await getReadyRegistrationsByEventId('event-id')

      expect(result).toEqual([])
    })
  })

  describe('groupRegistrationsByClass', () => {
    it('should group registrations by class', () => {
      const registrations = [
        { class: 'ALO', id: '1' },
        { class: 'AVO', id: '2' },
        { class: 'ALO', id: '3' },
      ] as unknown as JsonRegistration[]

      const result = groupRegistrationsByClass(registrations)

      expect(Object.keys(result)).toEqual(['ALO', 'AVO'])
      expect(result.ALO).toHaveLength(2)
      expect(result.AVO).toHaveLength(1)
      expect(result.ALO).toContainEqual(expect.objectContaining({ id: '1' }))
      expect(result.ALO).toContainEqual(expect.objectContaining({ id: '3' }))
      expect(result.AVO).toContainEqual(expect.objectContaining({ id: '2' }))
    })

    it('should use eventType when class is not available', () => {
      const registrations = [
        { eventType: 'NOME', id: '1' },
        { class: 'AVO', id: '2' },
        { eventType: 'NOME', id: '3' },
      ] as unknown as JsonRegistration[]

      const result = groupRegistrationsByClass(registrations)

      expect(Object.keys(result)).toEqual(['NOME', 'AVO'])
      expect(result.NOME).toHaveLength(2)
      expect(result.AVO).toHaveLength(1)
    })

    it('should handle empty array', () => {
      const result = groupRegistrationsByClass([])
      expect(result).toEqual({})
    })
  })

  describe('groupRegistrationsByClassAndGroup', () => {
    it('should group registrations by class and group', () => {
      const registrationsByClass = {
        ALO: [
          { group: { key: 'group1' }, id: '1' },
          { group: { key: 'group2' }, id: '2' },
          { group: { key: 'group1' }, id: '3' },
        ],
        AVO: [{ group: { key: 'group3' }, id: '4' }],
      } as unknown as Record<string, JsonRegistration[]>

      const result = groupRegistrationsByClassAndGroup(registrationsByClass)

      expect(Object.keys(result)).toEqual(['ALO', 'AVO'])
      expect(Object.keys(result.ALO)).toEqual(['group1', 'group2'])
      expect(Object.keys(result.AVO)).toEqual(['group3'])
      expect(result.ALO.group1).toHaveLength(2)
      expect(result.ALO.group2).toHaveLength(1)
    })

    it('should skip registrations that are not in participant groups', () => {
      const registrationsByClass = {
        ALO: [
          { group: { key: 'group1' }, id: '1' },
          { group: { key: 'reserve' }, id: '2' },
          { group: { key: 'cancelled' }, id: '3' },
          { group: undefined, id: '4' },
        ],
      } as unknown as Record<string, JsonRegistration[]>

      const result = groupRegistrationsByClassAndGroup(registrationsByClass)

      expect(Object.keys(result.ALO)).toEqual(['group1'])
      expect(result.ALO.group1).toHaveLength(1)
    })

    it('should handle empty input', () => {
      const result = groupRegistrationsByClassAndGroup({})
      expect(result).toEqual({})
    })
  })

  describe('findClassesToMark', () => {
    it('should find classes where all groups have received the message', () => {
      const registrationsByClassAndGroup = {
        ALO: {
          group1: [
            { id: '1', messagesSent: { invitation: true } },
            { id: '2', messagesSent: { invitation: true } },
          ],
          group2: [{ id: '3', messagesSent: { invitation: true } }],
        },
        AVO: {
          group3: [{ id: '4', messagesSent: { invitation: true } }],
        },
        VOI: {
          group4: [{ id: '5', messagesSent: { invitation: false } }],
        },
      } as unknown as Record<string, Record<string, JsonRegistration[]>>

      const result = findClassesToMark(registrationsByClassAndGroup, 'invitation')

      expect(result).toEqual(['ALO', 'AVO'])
    })

    it('should not include classes with empty groups', () => {
      const registrationsByClassAndGroup = {
        ALO: {},
        AVO: {
          group1: [{ id: '1', messagesSent: { invitation: true } }],
        },
      } as unknown as Record<string, Record<string, JsonRegistration[]>>

      const result = findClassesToMark(registrationsByClassAndGroup, 'invitation')

      expect(result).toEqual(['AVO'])
    })

    it('should handle missing messagesSent property', () => {
      const registrationsByClassAndGroup = {
        ALO: {
          group1: [
            { id: '1', messagesSent: { invitation: true } },
            { id: '2' }, // Missing messagesSent
          ],
        },
      } as unknown as Record<string, Record<string, JsonRegistration[]>>

      const result = findClassesToMark(registrationsByClassAndGroup, 'invitation')

      expect(result).toEqual([])
    })

    it('should handle empty input', () => {
      const result = findClassesToMark({}, 'invitation')
      expect(result).toEqual([])
    })
  })

  describe('hasRegistrationChanges', () => {
    it('returns false when only modified fields change', () => {
      const existing = JSON.parse(
        JSON.stringify({
          ...registrationsToEventWithParticipantsInvited[0],
          modifiedAt: '2024-01-01T10:00:00.000Z',
          modifiedBy: 'first-user',
        })
      ) as JsonRegistration
      const updated = {
        ...existing,
        modifiedAt: '2024-01-01T11:00:00.000Z',
        modifiedBy: 'second-user',
      } as JsonRegistration

      expect(hasRegistrationChanges(existing, updated)).toBe(false)
    })

    it('returns true when a meaningful registration field changes', () => {
      const existing = JSON.parse(JSON.stringify(registrationsToEventWithParticipantsInvited[0])) as JsonRegistration
      const updated = {
        ...existing,
        confirmed: true,
      } as JsonRegistration

      expect(hasRegistrationChanges(existing, updated)).toBe(true)
    })
  })

  describe('getRegistrationChanges', () => {
    it('returns stable audit labels for nested changes and removed fields', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
      const existing = JSON.parse(JSON.stringify(registrationsToEventWithParticipantsInvited[0])) as JsonRegistration
      const { notes: _notes, ...withoutNotes } = existing
      const updated = {
        ...withoutNotes,
        dog: { ...existing.dog, name: 'Changed name' },
      } as JsonRegistration

      try {
        expect(getRegistrationChanges(existing, updated)).toBe('Muutti: Koiran tiedot, Lisätiedot')
        expect(debugSpy).toHaveBeenCalledWith('Audit changes', {
          dog: { name: 'Changed name' },
          notes: undefined,
        })
      } finally {
        debugSpy.mockRestore()
      }
    })
  })

  describe('patchRegistration', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('updates only changed fields and reloads the registration', async () => {
      const existing = {
        dog: { name: 'Old name', regNo: 'REG-1' },
        emailDeliveryStatus: { status: 'bounce' },
        eventId: 'event-id',
        id: 'reg-id',
        notes: 'old',
      } as unknown as JsonRegistration
      const next = {
        ...existing,
        dog: { name: 'New name', regNo: 'REG-1' },
        emailDeliveryStatus: undefined,
        notes: 'new',
      } as unknown as JsonRegistration
      mockDynamoDB.read.mockResolvedValueOnce(next)

      const result = await patchRegistration(existing.eventId, existing.id, existing, next)

      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'event-id', id: 'reg-id' },
        {
          remove: ['emailDeliveryStatus'],
          set: {
            'dog.name': 'New name',
            notes: 'new',
          },
        },
        'registration-table-not-found-in-env'
      )
      expect(mockDynamoDB.read).toHaveBeenCalledWith(
        {
          eventId: 'event-id',
          id: 'reg-id',
        },
        'registration-table-not-found-in-env'
      )
      expect(result).toEqual(next)
    })

    it('does nothing for no-op patches', async () => {
      const existing = { eventId: 'event-id', id: 'reg-id', notes: 'old' } as unknown as JsonRegistration

      const result = await patchRegistration(existing.eventId, existing.id, existing, { ...existing })

      expect(mockDynamoDB.update).not.toHaveBeenCalled()
      expect(mockDynamoDB.read).not.toHaveBeenCalled()
      expect(result).toBe(existing)
    })
  })

  describe('sendTemplatedEmailToEventRegistrations', () => {
    beforeEach(() => {
      vi.clearAllMocks()

      // Setup default mock implementations
      mockEmailTo.mockImplementation((reg: any) => {
        const emails = [reg.handler.email]
        if (reg.owner.email !== reg.handler.email) {
          emails.push(reg.owner.email)
        }
        return emails
      })

      mockSendTemplatedMail.mockResolvedValue({} as any)
      mockDynamoDB.update.mockResolvedValue({} as any)
    })

    it('should send emails to all registrations successfully', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2023-01-01 12:00Z'))
      const result = await sendTemplatedEmailToEventRegistrations(
        'invitation',
        { ...JSON.parse(JSON.stringify(eventWithALOClassInvited)), invitationAttachments: { ALO: 'alo-attachment' } },
        [
          { ...jsonRegistrationsToEventWithALOInvited[0] },
          { ...jsonRegistrationsToEventWithALOInvited[1], language: 'en' },
        ],
        'https://example.com',
        'Test message',
        'admin-user',
        ''
      )

      // Check result
      expect(result).toEqual({
        failed: [],
        ok: ['handler1@example.com', 'owner1@example.com', 'handler2@example.com', 'owner2@example.com'],
      })

      // Check email sending
      expect(mockSESSend).toHaveBeenCalledTimes(2)
      expect(mockSESSend).toHaveBeenCalledWith([['handler1@example.com', 'owner1@example.com'], 'invitation-local-fi'])
      expect(mockSESSend).toHaveBeenCalledWith([['handler2@example.com', 'owner2@example.com'], 'invitation-local-en'])

      // Check audit entries
      expect(mockAudit).toHaveBeenCalledTimes(2)
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'testALOInvited:testALOInvited1',
        message: 'Email: Koekutsu, to: handler1@example.com, owner1@example.com',
        user: 'admin-user',
      })

      // Check lastEmail updates
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            lastEmail: 'Koekutsu 1.1.2023 14:00',
            updatedAt: expect.any(String),
          },
        }
      )

      // Check messagesSent updates
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            messagesSent: { invitation: true },
            updatedAt: expect.any(String),
          },
        }
      )
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            invitationAttachmentSent: 'alo-attachment',
            updatedAt: expect.any(String),
          },
        }
      )

      vi.useRealTimers()
    })

    it('records the common invitation attachment when class attachment is not configured', async () => {
      const registration = { ...jsonRegistrationsToEventWithALOInvited[2] }

      await sendTemplatedEmailToEventRegistrations(
        'invitation',
        {
          ...JSON.parse(JSON.stringify(eventWithALOClassInvited)),
          invitationAttachment: 'common-attachment',
          invitationAttachments: { ALO: 'alo-attachment' },
        },
        [registration],
        'https://example.com',
        'Test message',
        'admin-user',
        ''
      )

      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: registration.eventId, id: registration.id },
        {
          set: {
            invitationAttachmentSent: 'common-attachment',
            updatedAt: expect.any(String),
          },
        }
      )
      expect(registration.invitationAttachmentSent).toBe('common-attachment')
    })

    it('preserves a legacy receipt for the previously sent attachment when resending', async () => {
      const registration = {
        ...jsonRegistrationsToEventWithALOInvited[0],
        invitationAttachmentSent: 'old-attachment',
        invitationRead: true,
        messagesSent: { invitation: true },
      }

      await sendTemplatedEmailToEventRegistrations(
        'invitation',
        { ...JSON.parse(JSON.stringify(eventWithALOClassInvited)), invitationAttachments: { ALO: 'new-attachment' } },
        [registration],
        'https://example.com',
        'Test message',
        'admin-user',
        ''
      )

      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: registration.eventId, id: registration.id },
        {
          set: {
            invitationAttachmentRead: 'old-attachment',
            invitationAttachmentSent: 'new-attachment',
            updatedAt: expect.any(String),
          },
        }
      )
      expect(registration.invitationAttachmentRead).toBe('old-attachment')
      expect(registration.invitationAttachmentSent).toBe('new-attachment')
    })

    it('does not treat a newly sent attachment as read when a legacy receipt has no attachment key', async () => {
      const registration = {
        ...jsonRegistrationsToEventWithALOInvited[0],
        invitationRead: true,
        messagesSent: { invitation: true },
      }

      await sendTemplatedEmailToEventRegistrations(
        'invitation',
        { ...JSON.parse(JSON.stringify(eventWithALOClassInvited)), invitationAttachments: { ALO: 'new-attachment' } },
        [registration],
        'https://example.com',
        'Test message',
        'admin-user',
        ''
      )

      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: registration.eventId, id: registration.id },
        {
          set: {
            invitationAttachmentSent: 'new-attachment',
            invitationRead: false,
            updatedAt: expect.any(String),
          },
        }
      )
      expect(registration.invitationRead).toBe(false)
    })

    it('should handle failed email sending', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      // Make the second email fail
      mockSESSend.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Email sending failed'))

      const result = await sendTemplatedEmailToEventRegistrations(
        'invitation',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        jsonRegistrationsToEventWithALOInvited.slice(0, 2).map((r) => ({ ...r })),
        'https://example.com',
        'Test message',
        'admin-user',
        ''
      )

      expect(mockSESSend).toHaveBeenCalledTimes(2)

      // Check result
      expect(result).toEqual({
        failed: ['handler2@example.com', 'owner2@example.com'],
        ok: ['handler1@example.com', 'owner1@example.com'],
      })

      // Check audit entries for failure
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'testALOInvited:testALOInvited2',
        message: 'FAILED Koekutsu: handler2@example.com, owner2@example.com',
        user: 'admin-user',
      })

      // Check that messagesSent was not updated for the failed email
      expect(mockDynamoDB.update).not.toHaveBeenCalledWith(
        { id: 'reg-2' },
        expect.objectContaining({ set: expect.objectContaining({ messagesSent: expect.anything() }) })
      )
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should update existing messagesSent property', async () => {
      // Registration with existing messagesSent property
      const registrationWithExistingMessages = {
        ...jsonRegistrationsToEventWithALOInvited[0],
        messagesSent: { registration: true },
      }

      await sendTemplatedEmailToEventRegistrations(
        'invitation',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        [registrationWithExistingMessages],
        'https://example.com',
        'Test message',
        'admin-user',
        { context: 'data' } as any
      )

      // Check that messagesSent was properly updated
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            messagesSent: { invitation: true, registration: true },
            updatedAt: expect.any(String),
          },
        }
      )

      // Check that the in-memory object was updated
      expect(registrationWithExistingMessages.messagesSent).toEqual({
        invitation: true,
        registration: true,
      })
    })

    it('should handle reserve template with group number', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2023-01-01 12:00Z'))

      await sendTemplatedEmailToEventRegistrations(
        'reserve',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        [jsonRegistrationsToEventWithALOInvited[0]],
        'https://example.com',
        'Test message',
        'admin-user',
        { context: 'data' } as any
      )

      // Check lastEmail format for reserve template
      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            lastEmail: 'Varasijailmoitus (#1) 1.1.2023 14:00',
            updatedAt: expect.any(String),
          },
        }
      )

      expect(mockDynamoDB.update).toHaveBeenCalledWith(
        { eventId: 'testALOInvited', id: 'testALOInvited1' },
        {
          set: {
            messagesSent: {
              reserve: true,
            },
            updatedAt: expect.any(String),
          },
        }
      )

      vi.useRealTimers()
    })
  })
})

describe('registration access', () => {
  const registration = { editTokenVersion: 1, eventId: 'event', id: 'registration' }
  const secret = 'test-registration-edit-token-secret'

  it('authorizes only the matching bearer token', async () => {
    const token = deriveRegistrationEditToken(registration, secret)

    await expect(
      authorizeRegistrationEdit({ headers: { authorization: `Bearer ${token}` } }, registration)
    ).resolves.toBe(token)
    await expect(authorizeRegistrationEdit({ headers: {} }, registration)).rejects.toThrow('404 not found')
    await expect(
      authorizeRegistrationEdit({ headers: { Authorization: 'Bearer another-secret' } }, registration)
    ).rejects.toThrow('404 not found')
  })

  it('allows a tokenless read only for a legacy registration', async () => {
    const legacyRegistration = { eventId: registration.eventId, id: registration.id }
    const expected = deriveRegistrationEditToken(legacyRegistration, secret)

    await expect(authorizeRegistrationRead({ headers: {} }, legacyRegistration)).resolves.toBe(expected)
    await expect(authorizeRegistrationRead({ headers: {} }, registration)).rejects.toThrow('404 not found')
    await expect(
      authorizeRegistrationRead({ headers: { Authorization: 'Bearer invalid' } }, legacyRegistration)
    ).rejects.toThrow('404 not found')
  })

  it('derives one stable token until its version is changed', () => {
    const token = deriveRegistrationEditToken(registration, secret)

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(deriveRegistrationEditToken(registration, secret)).toBe(token)
    expect(deriveRegistrationEditToken({ ...registration, editTokenVersion: 2 }, secret)).not.toBe(token)
  })

  it('drops privileged and workflow metadata from public patches', () => {
    const patch = publicRegistrationPatch(
      {
        creationIdempotencyKey: 'attacker-controlled-key',
        eventId: 'event',
        group: { key: 'picked', number: 1 },
        id: 'registration',
        internalNotes: 'secretary note',
        notes: 'participant note',
        paidAmount: 0,
        priorityByInvitation: true,
        qualifies: true,
        qualifyingResults: [],
        refundAmount: 100,
        selectedCost: 'normal',
        state: 'ready',
      },
      true
    )

    expect(patch).toEqual({
      eventId: 'event',
      id: 'registration',
      notes: 'participant note',
      selectedCost: 'normal',
    })
  })

  it('allows only one-way participant workflow transitions', () => {
    expect(
      publicRegistrationPatch(
        { cancelled: false, cancelReason: 'reason', confirmed: false, invitationRead: false },
        true
      )
    ).toEqual({})
    expect(
      publicRegistrationPatch({ cancelled: true, cancelReason: 'reason', confirmed: true, invitationRead: true }, true)
    ).toEqual({ cancelled: true, cancelReason: 'reason', confirmed: true, invitationRead: true })
  })

  it('never returns the stored token version to a participant', () => {
    const stored = { editTokenVersion: 3, id: 'registration' }
    expect(participantRegistrationResponse(stored, 'raw-token')).toEqual({
      editToken: 'raw-token',
      id: 'registration',
    })
  })
})
